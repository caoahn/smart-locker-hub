import { useEffect, useMemo, useState, type ReactNode } from "react";
import { hardwareApi } from "@/integrations/hardware/api";
import { alertApi, lockerApi, orderApi, realtimeApi, settingsApi } from "@/integrations/supabase/api";
import AppHeader from "@/components/layout/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Bell, Box, CheckCircle2, DollarSign, KeyRound, Settings as SettingsIcon, Trash2, type LucideIcon } from "lucide-react";
import { calculateFee, formatVND, type PricingConfig } from "@/lib/pricing";
import { toast } from "sonner";

interface Locker {
  id: number;
  status: string;
  updated_at: string;
}

interface Order {
  id: string;
  box_id: number;
  otp_code: string | null;
  otp_expires_at?: string | null;
  user_phone: string;
  customer_email?: string | null;
  deleted_at?: string | null;
  start_time: string;
  deposited_at?: string | null;
  picked_up_at: string | null;
  total_amount: number;
  is_paid: boolean;
  status: string;
  created_at?: string;
}

interface Alert {
  id: string;
  box_id: number | null;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface Settings extends PricingConfig {
  id: number;
  bank_account: string;
  bank_code: string;
  account_name: string;
}

const openOrderStatuses = new Set(["active", "reserved", "awaiting_dropoff", "stored", "pickup_in_progress"]);
const storedOrderStatuses = new Set(["active", "stored", "pickup_in_progress"]);

const lockerLabels: Record<string, string> = {
  empty: "Trống",
  reserved: "Đã giữ",
  awaiting_dropoff: "Chờ bỏ hàng",
  occupied: "Có hàng",
  pickup_in_progress: "Đang nhận",
  overdue: "Quá hạn",
};

const orderLabels: Record<string, string> = {
  active: "Có hàng",
  reserved: "Đã giữ tủ",
  awaiting_dropoff: "Chờ bỏ hàng",
  stored: "Chờ nhận",
  pickup_in_progress: "Đang nhận",
  completed: "Hoàn tất",
  cancelled: "Đã huỷ",
  failed: "Mở lỗi",
};

function isOpenOrder(order: Order) {
  return openOrderStatuses.has(order.status);
}

function isStoredOrder(order: Order) {
  return storedOrderStatuses.has(order.status);
}

function statusClass(status: string, overdue = false) {
  if (overdue || status === "overdue") return "bg-destructive text-destructive-foreground";
  if (status === "empty" || status === "completed") return "bg-success text-success-foreground";
  if (status === "failed" || status === "cancelled") return "bg-muted text-muted-foreground";
  if (status === "stored" || status === "occupied") return "bg-warning text-warning-foreground";
  return "bg-primary text-primary-foreground";
}

export default function AdminDashboard() {
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [now, setNow] = useState(new Date());

  async function loadAll() {
    const [lockerResult, orderResult, alertResult, settingsResult] = await Promise.all([
      lockerApi.listLockers(),
      orderApi.listOrders(),
      alertApi.listAlerts(),
      settingsApi.getSettings(),
    ]);

    if (lockerResult.data) setLockers(lockerResult.data as Locker[]);
    if (orderResult.data) setOrders(orderResult.data as Order[]);
    if (alertResult.data) setAlerts(alertResult.data as Alert[]);
    if (settingsResult.data) setSettings(settingsResult.data as Settings);
  }

  useEffect(() => {
    loadAll();
    const timer = setInterval(() => setNow(new Date()), 1000);
    const unsubscribe = realtimeApi.subscribeToAdminChanges(loadAll);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, []);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const month = new Date();
    month.setDate(1);
    month.setHours(0, 0, 0, 0);

    const completed = orders.filter((order) => order.status === "completed" && order.is_paid);
    const dayRev = completed
      .filter((order) => new Date(order.created_at ?? order.start_time) >= today)
      .reduce((sum, order) => sum + order.total_amount, 0);
    const monthRev = completed
      .filter((order) => new Date(order.created_at ?? order.start_time) >= month)
      .reduce((sum, order) => sum + order.total_amount, 0);
    const overdue = orders.filter(
      (order) =>
        isStoredOrder(order) &&
        settings &&
        (now.getTime() - new Date(order.start_time).getTime()) / 3600000 > settings.base_hours,
    ).length;

    return { dayRev, monthRev, active: orders.filter(isOpenOrder).length, overdue };
  }, [orders, settings, now]);

  async function masterOpen(boxId: number) {
    if (!confirm(`Mở khẩn cấp tủ #${boxId}?`)) return;
    if (!hardwareApi.isConfigured()) return toast.error("Chưa cấu hình IP_HARD_WARE cho phần cứng");

    try {
      await hardwareApi.openLocker(boxId, "admin");
    } catch (error) {
      return toast.error(error instanceof Error ? error.message : "Phần cứng mở cửa thất bại");
    }

    const { error } = await orderApi.adminForceResetLocker(boxId, `Master key: tủ #${boxId} được mở bởi admin`);
    if (error) return toast.error(error.message);
    toast.success("Đã đưa tủ về trạng thái trống");
    loadAll();
  }

  async function confirmPaid(order: Order) {
    const fee = settings ? calculateFee(order.start_time, settings) : order.total_amount;
    const { error } = await orderApi.markPaid(order.id, fee);
    if (error) return toast.error(error.message);
    toast.success("Đã xác nhận thanh toán");
    loadAll();
  }

  async function dismissAlert(id: string) {
    await alertApi.markRead(id);
    loadAll();
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Bảng điều khiển Admin" />
      <main className="container py-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Box} label="Đang sử dụng" value={`${stats.active}/${lockers.length || 0}`} />
          <StatCard icon={AlertTriangle} label="Quá hạn" value={stats.overdue} accent="warning" />
          <StatCard icon={DollarSign} label="Doanh thu hôm nay" value={formatVND(stats.dayRev)} />
          <StatCard icon={DollarSign} label="Doanh thu tháng" value={formatVND(stats.monthRev)} accent="primary" />
        </div>

        {alerts.filter((alert) => !alert.is_read && alert.type === "breakin").length > 0 && (
          <Card className="p-4 border-destructive bg-destructive/5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-destructive animate-pulse" />
              <div className="flex-1">
                <div className="font-bold text-destructive">CẢNH BÁO PHÁ TỦ!</div>
                <div className="text-sm">{alerts.find((alert) => !alert.is_read && alert.type === "breakin")?.message}</div>
              </div>
            </div>
          </Card>
        )}

        <Tabs defaultValue="lockers">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="lockers">
              <Box className="h-4 w-4 mr-2" />Tủ
            </TabsTrigger>
            <TabsTrigger value="orders">Đơn hàng</TabsTrigger>
            <TabsTrigger value="alerts">
              <Bell className="h-4 w-4 mr-2" />Cảnh báo
            </TabsTrigger>
            <TabsTrigger value="settings">
              <SettingsIcon className="h-4 w-4 mr-2" />Cấu hình
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lockers" className="grid md:grid-cols-2 gap-4 mt-4">
            {lockers.map((locker) => {
              const order = orders.find((item) => item.box_id === locker.id && isOpenOrder(item));
              const fee = order && settings && isStoredOrder(order) ? calculateFee(order.start_time, settings, now) : 0;
              const overdue =
                order &&
                settings &&
                isStoredOrder(order) &&
                (now.getTime() - new Date(order.start_time).getTime()) / 3600000 > settings.base_hours;

              return (
                <Card key={locker.id} className="p-6 gradient-card shadow-card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Tủ số</div>
                      <div className="text-4xl font-bold">#{locker.id}</div>
                    </div>
                    <Badge className={statusClass(locker.status, Boolean(overdue))}>
                      {overdue ? "Quá hạn" : lockerLabels[locker.status] ?? locker.status}
                    </Badge>
                  </div>

                  {order ? (
                    <div className="space-y-2 text-sm">
                      <div><span className="text-muted-foreground">SĐT:</span> <span className="font-mono">{order.user_phone}</span></div>
                      {order.customer_email && <div><span className="text-muted-foreground">Email:</span> <span className="font-mono">{order.customer_email}</span></div>}
                      <div><span className="text-muted-foreground">Đơn:</span> <span className="font-mono">{order.id.slice(0, 8)}</span></div>
                      <div>
                        <span className="text-muted-foreground">Trạng thái:</span>{" "}
                        <Badge className={statusClass(order.status)}>{orderLabels[order.status] ?? order.status}</Badge>
                      </div>
                      {order.otp_code && (
                        <div><span className="text-muted-foreground">OTP:</span> <span className="font-mono font-bold tracking-widest">{order.otp_code}</span></div>
                      )}
                      {isStoredOrder(order) && (
                        <div><span className="text-muted-foreground">Phí hiện tại:</span> <span className="font-bold text-primary">{formatVND(fee)}</span></div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-2">
                        {!order.is_paid && isStoredOrder(order) && (
                          <Button size="sm" onClick={() => confirmPaid(order)}>
                            <CheckCircle2 className="h-4 w-4 mr-1" />Xác nhận TT
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => masterOpen(locker.id)}>
                          <KeyRound className="h-4 w-4 mr-1" />Master Key
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">Tủ đang trống, sẵn sàng nhận hàng.</p>
                  )}
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="orders" className="mt-4">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tủ</TableHead>
                      <TableHead>SĐT</TableHead>
                      <TableHead>OTP</TableHead>
                      <TableHead>Bắt đầu</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Thanh toán</TableHead>
                      <TableHead className="text-right">Phí</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => {
                      const fee = settings && isStoredOrder(order) ? calculateFee(order.start_time, settings, now) : order.total_amount;
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-bold">#{order.box_id}</TableCell>
                          <TableCell className="font-mono text-sm">{order.user_phone}</TableCell>
                          <TableCell className="font-mono">{order.otp_code ?? "-"}</TableCell>
                          <TableCell className="text-xs">{new Date(order.start_time).toLocaleString("vi-VN")}</TableCell>
                          <TableCell>
                            <Badge className={statusClass(order.status)}>{orderLabels[order.status] ?? order.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={order.is_paid ? "default" : "secondary"} className={order.is_paid ? "bg-success text-success-foreground" : ""}>
                              {order.is_paid ? "Đã TT" : "Chưa TT"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatVND(fee)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {orders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Chưa có đơn nào</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="mt-4 space-y-2">
            {alerts.map((alert) => (
              <Card key={alert.id} className={`p-4 flex items-center gap-3 ${!alert.is_read ? "border-l-4 border-l-primary" : "opacity-60"}`}>
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${alert.type === "breakin" ? "bg-destructive/10 text-destructive" : alert.type === "overdue" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}>
                  {alert.type === "breakin" ? <AlertTriangle className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{alert.message}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(alert.created_at).toLocaleString("vi-VN")}
                    {alert.box_id ? ` · Tủ #${alert.box_id}` : ""}
                  </div>
                </div>
                {!alert.is_read && (
                  <Button size="sm" variant="ghost" onClick={() => dismissAlert(alert.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </Card>
            ))}
            {alerts.length === 0 && <p className="text-center text-muted-foreground py-8">Không có cảnh báo</p>}
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            {settings && <SettingsForm settings={settings} onSaved={loadAll} />}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  accent?: "default" | "warning" | "primary";
}) {
  return (
    <Card className="p-4 gradient-card">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${accent === "warning" ? "bg-warning/10 text-warning" : accent === "primary" ? "gradient-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          <div className="text-lg font-bold truncate">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function SettingsForm({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [state, setState] = useState(settings);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await settingsApi.updateSettings({
      base_fee: state.base_fee,
      base_hours: state.base_hours,
      overdue_fee: state.overdue_fee,
      overdue_hours: state.overdue_hours,
      bank_account: state.bank_account,
      bank_code: state.bank_code,
      account_name: state.account_name,
    });
    setBusy(false);

    if (error) return toast.error(error.message);
    toast.success("Đã lưu cấu hình");
    onSaved();
  }

  return (
    <Card className="p-6 space-y-4 max-w-2xl">
      <h3 className="font-semibold text-lg">Bảng giá</h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <div><Label>Phí cơ bản (VND)</Label><Input type="number" value={state.base_fee} onChange={(event) => setState({ ...state, base_fee: +event.target.value })} /></div>
        <div><Label>Số giờ cơ bản</Label><Input type="number" value={state.base_hours} onChange={(event) => setState({ ...state, base_hours: +event.target.value })} /></div>
        <div><Label>Phí quá hạn / mỗi block (VND)</Label><Input type="number" value={state.overdue_fee} onChange={(event) => setState({ ...state, overdue_fee: +event.target.value })} /></div>
        <div><Label>Block giờ quá hạn</Label><Input type="number" value={state.overdue_hours} onChange={(event) => setState({ ...state, overdue_hours: +event.target.value })} /></div>
      </div>
      <h3 className="font-semibold text-lg pt-2">Tài khoản nhận thanh toán</h3>
      <div className="grid sm:grid-cols-3 gap-4">
        <div><Label>Mã ngân hàng</Label><Input value={state.bank_code} onChange={(event) => setState({ ...state, bank_code: event.target.value })} /></div>
        <div><Label>Số tài khoản</Label><Input value={state.bank_account} onChange={(event) => setState({ ...state, bank_account: event.target.value })} /></div>
        <div><Label>Chủ tài khoản</Label><Input value={state.account_name} onChange={(event) => setState({ ...state, account_name: event.target.value })} /></div>
      </div>
      <Button onClick={save} disabled={busy} className="gradient-primary">Lưu cấu hình</Button>
    </Card>
  );
}
