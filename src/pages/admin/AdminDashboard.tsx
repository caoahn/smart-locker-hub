import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/layout/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Box, AlertTriangle, DollarSign, KeyRound, CheckCircle2, Bell, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { calculateFee, formatVND, type PricingConfig } from "@/lib/pricing";
import { toast } from "sonner";

interface Locker { id: number; status: string; updated_at: string; }
interface Order { id: string; box_id: number; otp_code: string; user_phone: string; start_time: string; picked_up_at: string | null; total_amount: number; is_paid: boolean; status: string; created_at?: string; }
interface Alert { id: string; box_id: number | null; type: string; message: string; is_read: boolean; created_at: string; }
interface Settings extends PricingConfig { id: number; bank_account: string; bank_code: string; account_name: string; }

export default function AdminDashboard() {
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [now, setNow] = useState(new Date());

  async function loadAll() {
    const [l, o, a, s] = await Promise.all([
      supabase.from("lockers").select("*").order("id"),
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("settings").select("*").eq("id", 1).single(),
    ]);
    if (l.data) setLockers(l.data as Locker[]);
    if (o.data) setOrders(o.data as Order[]);
    if (a.data) setAlerts(a.data as Alert[]);
    if (s.data) setSettings(s.data as Settings);
  }

  useEffect(() => {
    loadAll();
    const t = setInterval(() => setNow(new Date()), 1000);
    const ch = supabase.channel("admin-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "lockers" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, loadAll)
      .subscribe();
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, []);

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const month = new Date(); month.setDate(1); month.setHours(0,0,0,0);
    const completed = orders.filter(o => o.status === "completed" && o.is_paid);
    const dayRev = completed.filter(o => new Date(o.created_at ?? o.start_time) >= today).reduce((a,b) => a + b.total_amount, 0);
    const monthRev = completed.filter(o => new Date(o.created_at ?? o.start_time) >= month).reduce((a,b) => a + b.total_amount, 0);
    return { dayRev, monthRev, active: orders.filter(o => o.status === "active").length, overdue: orders.filter(o => o.status === "active" && settings && (now.getTime() - new Date(o.start_time).getTime())/3600000 > settings.base_hours).length };
  }, [orders, settings, now]);

  async function masterOpen(boxId: number) {
    if (!confirm(`Mở khẩn cấp tủ #${boxId}?`)) return;
    await supabase.from("lockers").update({ status: "empty", updated_at: new Date().toISOString() }).eq("id", boxId);
    const active = orders.find(o => o.box_id === boxId && o.status === "active");
    if (active) await supabase.from("orders").update({ status: "completed", picked_up_at: new Date().toISOString() }).eq("id", active.id);
    await supabase.from("alerts").insert({ box_id: boxId, type: "info", message: `Master key: tủ #${boxId} được mở bởi admin` });
    toast.success("Đã mở tủ");
  }

  async function confirmPaid(o: Order) {
    const fee = settings ? calculateFee(o.start_time, settings) : o.total_amount;
    await supabase.from("orders").update({ is_paid: true, total_amount: fee, status: "completed", picked_up_at: new Date().toISOString() }).eq("id", o.id);
    await supabase.from("lockers").update({ status: "empty", updated_at: new Date().toISOString() }).eq("id", o.box_id);
    toast.success("Đã xác nhận thanh toán & mở tủ");
  }

  async function dismissAlert(id: string) {
    await supabase.from("alerts").update({ is_read: true }).eq("id", id);
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Bảng điều khiển Admin" />
      <main className="container py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Box} label="Đang sử dụng" value={`${stats.active}/2`} />
          <StatCard icon={AlertTriangle} label="Quá hạn" value={stats.overdue} accent="warning" />
          <StatCard icon={DollarSign} label="Doanh thu hôm nay" value={formatVND(stats.dayRev)} />
          <StatCard icon={DollarSign} label="Doanh thu tháng" value={formatVND(stats.monthRev)} accent="primary" />
        </div>

        {/* Alerts banner */}
        {alerts.filter(a => !a.is_read && a.type === "breakin").length > 0 && (
          <Card className="p-4 border-destructive bg-destructive/5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-destructive animate-pulse" />
              <div className="flex-1">
                <div className="font-bold text-destructive">CẢNH BÁO PHÁ TỦ!</div>
                <div className="text-sm">{alerts.find(a => !a.is_read && a.type === "breakin")?.message}</div>
              </div>
            </div>
          </Card>
        )}

        <Tabs defaultValue="lockers">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="lockers"><Box className="h-4 w-4 mr-2" />Tủ</TabsTrigger>
            <TabsTrigger value="orders">Đơn hàng</TabsTrigger>
            <TabsTrigger value="alerts"><Bell className="h-4 w-4 mr-2" />Cảnh báo</TabsTrigger>
            <TabsTrigger value="settings"><SettingsIcon className="h-4 w-4 mr-2" />Cấu hình</TabsTrigger>
          </TabsList>

          <TabsContent value="lockers" className="grid md:grid-cols-2 gap-4 mt-4">
            {lockers.map((l) => {
              const ord = orders.find(o => o.box_id === l.id && o.status === "active");
              const fee = ord && settings ? calculateFee(ord.start_time, settings, now) : 0;
              const overdue = ord && settings && (now.getTime() - new Date(ord.start_time).getTime())/3600000 > settings.base_hours;
              return (
                <Card key={l.id} className="p-6 gradient-card shadow-card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Tủ số</div>
                      <div className="text-4xl font-bold">#{l.id}</div>
                    </div>
                    <Badge className={overdue ? "bg-destructive text-destructive-foreground" : l.status === "empty" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}>
                      {overdue ? "Quá hạn" : l.status === "empty" ? "Trống" : "Có hàng"}
                    </Badge>
                  </div>
                  {ord ? (
                    <div className="space-y-2 text-sm">
                      <div><span className="text-muted-foreground">SĐT:</span> <span className="font-mono">{ord.user_phone}</span></div>
                      <div><span className="text-muted-foreground">OTP:</span> <span className="font-mono font-bold tracking-widest">{ord.otp_code}</span></div>
                      <div><span className="text-muted-foreground">Phí hiện tại:</span> <span className="font-bold text-primary">{formatVND(fee)}</span></div>
                      <div className="flex gap-2 pt-2">
                        {!ord.is_paid && <Button size="sm" onClick={() => confirmPaid(ord)}><CheckCircle2 className="h-4 w-4 mr-1" />Xác nhận TT</Button>}
                        <Button size="sm" variant="outline" onClick={() => masterOpen(l.id)}><KeyRound className="h-4 w-4 mr-1" />Master Key</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">Tủ đang trống — sẵn sàng nhận hàng.</p>
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
                      <TableHead>Tủ</TableHead><TableHead>SĐT</TableHead><TableHead>OTP</TableHead>
                      <TableHead>Bắt đầu</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Phí</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map(o => {
                      const fee = settings && o.status === "active" ? calculateFee(o.start_time, settings, now) : o.total_amount;
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="font-bold">#{o.box_id}</TableCell>
                          <TableCell className="font-mono text-sm">{o.user_phone}</TableCell>
                          <TableCell className="font-mono">{o.otp_code}</TableCell>
                          <TableCell className="text-xs">{new Date(o.start_time).toLocaleString("vi-VN")}</TableCell>
                          <TableCell>
                            <Badge variant={o.status === "completed" ? "default" : "secondary"} className={o.status === "completed" ? "bg-success text-success-foreground" : ""}>
                              {o.status === "completed" ? "Hoàn tất" : o.is_paid ? "Đã TT" : "Chờ TT"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatVND(fee)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {orders.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Chưa có đơn nào</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="mt-4 space-y-2">
            {alerts.map(a => (
              <Card key={a.id} className={`p-4 flex items-center gap-3 ${!a.is_read ? "border-l-4 border-l-primary" : "opacity-60"}`}>
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${a.type === "breakin" ? "bg-destructive/10 text-destructive" : a.type === "overdue" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}>
                  {a.type === "breakin" ? <AlertTriangle className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{a.message}</div>
                  <div className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("vi-VN")}{a.box_id ? ` · Tủ #${a.box_id}` : ""}</div>
                </div>
                {!a.is_read && <Button size="sm" variant="ghost" onClick={() => dismissAlert(a.id)}><Trash2 className="h-4 w-4" /></Button>}
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

function StatCard({ icon: Icon, label, value, accent = "default" }: { icon: any; label: string; value: any; accent?: string }) {
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
  const [s, setS] = useState(settings);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await supabase.from("settings").update({
      base_fee: s.base_fee, base_hours: s.base_hours, overdue_fee: s.overdue_fee, overdue_hours: s.overdue_hours,
      bank_account: s.bank_account, bank_code: s.bank_code, account_name: s.account_name, updated_at: new Date().toISOString(),
    }).eq("id", 1);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Đã lưu cấu hình");
    onSaved();
  }
  return (
    <Card className="p-6 space-y-4 max-w-2xl">
      <h3 className="font-semibold text-lg">Bảng giá</h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <div><Label>Phí cơ bản (VND)</Label><Input type="number" value={s.base_fee} onChange={e => setS({...s, base_fee: +e.target.value})} /></div>
        <div><Label>Số giờ cơ bản</Label><Input type="number" value={s.base_hours} onChange={e => setS({...s, base_hours: +e.target.value})} /></div>
        <div><Label>Phí quá hạn / mỗi block (VND)</Label><Input type="number" value={s.overdue_fee} onChange={e => setS({...s, overdue_fee: +e.target.value})} /></div>
        <div><Label>Block giờ quá hạn</Label><Input type="number" value={s.overdue_hours} onChange={e => setS({...s, overdue_hours: +e.target.value})} /></div>
      </div>
      <h3 className="font-semibold text-lg pt-2">Tài khoản nhận thanh toán</h3>
      <div className="grid sm:grid-cols-3 gap-4">
        <div><Label>Mã ngân hàng</Label><Input value={s.bank_code} onChange={e => setS({...s, bank_code: e.target.value})} /></div>
        <div><Label>Số tài khoản</Label><Input value={s.bank_account} onChange={e => setS({...s, bank_account: e.target.value})} /></div>
        <div><Label>Chủ tài khoản</Label><Input value={s.account_name} onChange={e => setS({...s, account_name: e.target.value})} /></div>
      </div>
      <Button onClick={save} disabled={busy} className="gradient-primary">Lưu cấu hình</Button>
    </Card>
  );
}