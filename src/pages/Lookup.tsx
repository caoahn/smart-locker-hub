import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  LogOut,
  Package,
  Phone,
  RefreshCw,
  Search,
  UserRound,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { orderApi, realtimeApi, settingsApi, type CustomerOrderRow } from "@/integrations/supabase/api";
import { calculateFee, calculateOrderFee, formatVND, buildVietQR, isPickupRetryOrder, PICKUP_RETRY_GRACE_HOURS, PICKUP_RETRY_HOURLY_FEE, type PricingConfig } from "@/lib/pricing";
import { useAuth, type Role } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface LookupOrder {
  id: string;
  box_id: number;
  start_time: string;
  total_amount: number;
  is_paid: boolean;
  status: string;
}

interface Settings extends PricingConfig {
  bank_account: string | null;
  bank_code: string | null;
  account_name: string | null;
}

const phoneSchema = z.string().trim().regex(/^[0-9+\s-]{8,15}$/, "Số điện thoại không hợp lệ");
const optionalPhoneSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^[0-9+\s-]{8,15}$/.test(value), "Số điện thoại không hợp lệ");

const orderLabels: Record<string, string> = {
  active: "Có hàng",
  reserved: "Đã giữ tủ",
  awaiting_dropoff: "Chờ bỏ hàng",
  stored: "Chờ nhận",
  pickup_in_progress: "Đang nhận",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
  failed: "Mở lỗi",
};

const roleLabels: Record<NonNullable<Role>, string> = {
  admin: "Admin",
  shipper: "Shipper",
  customer: "Khách hàng",
};

const liveFeeStatuses = new Set(["active", "stored", "pickup_in_progress"]);

export default function Lookup() {
  const { user, role, displayName, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState(user ? "orders" : "lookup");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<LookupOrder[] | null>(null);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrderRow[] | null>(null);
  const [customerOrdersBusy, setCustomerOrdersBusy] = useState(false);
  const [paymentBusyId, setPaymentBusyId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [now, setNow] = useState(new Date());
  const userId = user?.id;

  const loadCustomerOrders = useCallback(async (silent = false) => {
    if (!userId) return;

    if (!silent) setCustomerOrdersBusy(true);
    const { data, error } = await orderApi.listCustomerOrders();
    if (!silent) setCustomerOrdersBusy(false);

    if (error) {
      if (!silent) toast.error(error.message);
      return;
    }

    setCustomerOrders((data ?? []) as CustomerOrderRow[]);
  }, [userId]);

  useEffect(() => {
    settingsApi.getSettings().then(({ data }) => {
      if (data) setSettings(data as Settings);
    });
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!userId) {
      setActiveTab("lookup");
      setCustomerOrders(null);
      return;
    }

    setActiveTab("orders");
    loadCustomerOrders(true);
    const timer = setInterval(() => loadCustomerOrders(true), 15000);
    const unsubscribe = realtimeApi.subscribeToCustomerOrderChanges(() => loadCustomerOrders(true));

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [loadCustomerOrders, userId]);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);

    setBusy(true);
    const { data, error } = await orderApi.lookupByPhone(parsed.data.trim());
    setBusy(false);

    if (error) return toast.error(error.message);
    setOrders((data ?? []) as LookupOrder[]);
    if (!data?.length) toast.info("Không tìm thấy đơn hàng đang chờ");
  }

  async function confirmPaymentAndIssueOtp(orderId: string, orderPhone: string, fee: number) {
    setPaymentBusyId(orderId);
    const { data, error } = await orderApi.confirmCustomerPaymentAndIssueOtp(orderId, orderPhone, fee);
    setPaymentBusyId(null);

    if (error || !data) return toast.error(error?.message ?? "Không thể xác nhận thanh toán");

    toast.success(`Đã xác nhận thanh toán. OTP: ${data.otp_code}`);
    setOrders((current) =>
      current?.map((item) =>
        item.id === orderId ? { ...item, is_paid: true, total_amount: fee } : item,
      ) ?? null,
    );
    loadCustomerOrders(true);
  }

  const roleLabel = role ? roleLabels[role] : "";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <ArrowLeft className="h-4 w-4" /> Trang chủ
          </Link>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <span className="font-bold">Smart Locker</span>
            </div>

            {user ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:block text-right leading-tight">
                  <div className="text-sm font-medium max-w-[160px] truncate">{displayName}</div>
                  <div className="text-xs text-muted-foreground max-w-[160px] truncate">{user.email}</div>
                </div>
                {roleLabel && <Badge variant="outline">{roleLabel}</Badge>}
                <Button variant="ghost" size="icon" onClick={signOut} aria-label="Đăng xuất">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Link to="/auth">
                <Button size="sm" variant="outline">Đăng nhập</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            {user ? "Theo dõi đơn hàng" : "Tra cứu đơn hàng"}
          </h1>
          <p className="text-muted-foreground">
            {user
              ? "Xem trạng thái đơn theo tài khoản đang đăng nhập, hoặc tra cứu nhanh bằng số điện thoại nhận OTP."
              : "Nhập số điện thoại nhận OTP để xem tủ, phí lưu tủ và trạng thái nhận hàng."}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid w-full h-auto ${user ? "grid-cols-4" : "grid-cols-1"} mb-4`}>
            {user && (
              <TabsTrigger value="orders" className="gap-2">
                <History className="h-4 w-4" /> Đơn hàng
              </TabsTrigger>
            )}
            <TabsTrigger value="lookup" className="gap-2">
              <Search className="h-4 w-4" /> Tra cứu
            </TabsTrigger>
            {user && (
              <TabsTrigger value="notifications" className="gap-2">
                <Bell className="h-4 w-4" /> OTP
              </TabsTrigger>
            )}
            {user && (
              <TabsTrigger value="profile" className="gap-2">
                <UserRound className="h-4 w-4" /> Hồ sơ
              </TabsTrigger>
            )}
          </TabsList>

          {user && (
            <TabsContent value="orders" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Đơn hàng của tôi</h2>
                  <p className="text-sm text-muted-foreground">
                    Hệ thống tự ghép đơn theo email đăng nhập hoặc số điện thoại trong hồ sơ.
                  </p>
                </div>
                <Button variant="outline" onClick={() => loadCustomerOrders(false)} disabled={customerOrdersBusy}>
                  {customerOrdersBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Làm mới
                </Button>
              </div>

              {customerOrders === null && (
                <Card className="p-6 text-center text-muted-foreground">
                  <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
                  Đang tải đơn hàng...
                </Card>
              )}

              {customerOrders?.length === 0 && (
                <Card className="p-6 text-center">
                  <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                  <div className="font-semibold">Chưa có đơn hàng nào</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Nếu shipper gửi bằng số điện thoại, hãy cập nhật số đó trong tab Hồ sơ để tự động liên kết đơn.
                  </p>
                </Card>
              )}

              {customerOrders?.map((order) => (
                <CustomerOrderCard
                  key={order.id}
                  order={order}
                  settings={settings}
                  now={now}
                  busy={paymentBusyId === order.id}
                  onConfirmPayment={confirmPaymentAndIssueOtp}
                />
              ))}
            </TabsContent>
          )}

          <TabsContent value="lookup">
            <Card className="p-6 md:p-8 shadow-card mb-6">
              <h2 className="text-xl md:text-2xl font-bold mb-2">Tra cứu bằng số điện thoại</h2>
              <p className="text-muted-foreground mb-6">
                Nhập số điện thoại nhận OTP để xem tủ và phí hiện tại.
              </p>
              <form onSubmit={lookup} className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Label className="sr-only">Số điện thoại</Label>
                  <Input
                    placeholder="VD: 0901234567"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    maxLength={15}
                  />
                </div>
                <Button type="submit" className="gradient-primary" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-2">Tra cứu</span>
                </Button>
              </form>
            </Card>

            {orders && !settings && (
              <Card className="p-6 text-center text-muted-foreground">
                <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
                Đang tải cấu hình thanh toán...
              </Card>
            )}

            {orders && settings && orders.map((order) => (
              <LookupOrderCard
                key={order.id}
                order={order}
                settings={settings}
                now={now}
                phone={phone}
                busy={paymentBusyId === order.id}
                onConfirmPayment={confirmPaymentAndIssueOtp}
              />
            ))}
          </TabsContent>

          {user && (
            <TabsContent value="notifications">
              <Card className="p-6 text-center">
                <Bell className="mx-auto mb-3 h-10 w-10 text-primary" />
                <div className="font-semibold">OTP và thông báo đơn hàng</div>
                <p className="mt-1 text-sm text-muted-foreground">Mở trang thông báo để xem OTP mới nhất, nội dung gửi cho bạn và lịch sử thông báo.</p>
                <Button asChild className="mt-4 gradient-primary">
                  <Link to="/notifications">Xem OTP & thông báo</Link>
                </Button>
              </Card>
            </TabsContent>
          )}

          {user && (
            <TabsContent value="profile">
              <ProfilePanel onSaved={() => loadCustomerOrders(false)} />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}

function CustomerOrderCard({
  order,
  settings,
  now,
  busy,
  onConfirmPayment,
}: {
  order: CustomerOrderRow;
  settings: Settings | null;
  now: Date;
  busy: boolean;
  onConfirmPayment: (orderId: string, phone: string, fee: number) => void;
}) {
  const fee = useMemo(() => {
    if (!settings || !liveFeeStatuses.has(order.status)) return order.total_amount;
    return calculateOrderFee(order, settings, now);
  }, [order, settings, now]);

  const paymentLabel = order.is_paid ? "Đã thanh toán" : "Chưa thanh toán";
  const qrUrl = settings?.bank_code && settings.bank_account
    ? buildVietQR(settings.bank_code, settings.bank_account, fee, `LOCKER ${order.box_id} ${order.id.slice(0, 8)}`)
    : "";

  return (
    <Card className="p-5 md:p-6 gradient-card shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <div className="text-sm text-muted-foreground">Tủ số</div>
          <div className="text-3xl font-bold">#{order.box_id}</div>
          <div className="mt-1 text-xs text-muted-foreground font-mono">Đơn {order.id.slice(0, 8)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className={statusClass(order.status)}>{orderLabels[order.status] ?? order.status}</Badge>
          <Badge variant={order.is_paid ? "default" : "secondary"} className={order.is_paid ? "bg-success text-success-foreground" : ""}>
            {paymentLabel}
          </Badge>
        </div>
      </div>

      <OrderProgress status={order.status} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <InfoBlock label="Số điện thoại" value={order.user_phone} icon={<Phone className="h-4 w-4" />} mono />
        <InfoBlock label="Email nhận" value={order.customer_email || "Chưa có"} />
        <InfoBlock label="Phí hiện tại" value={formatVND(fee)} icon={<WalletCards className="h-4 w-4" />} highlight />
        <InfoBlock label="Thời gian lưu" value={durationLabel(order.start_time, order.completed_at ?? undefined, now)} icon={<Clock3 className="h-4 w-4" />} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
        <InfoBlock label="Tạo đơn" value={formatDate(order.created_at)} />
        <InfoBlock label="Đã bỏ hàng" value={formatDate(order.deposited_at)} />
        <InfoBlock label="Bắt đầu nhận" value={formatDate(order.pickup_started_at)} />
        <InfoBlock label="Hoàn tất" value={formatDate(order.completed_at)} />
      </div>

      {order.otp_expires_at && order.status !== "completed" && (
        <div className="mt-4 rounded-lg border bg-background/70 p-3 text-sm">
          <span className="text-muted-foreground">OTP hết hạn:</span>{" "}
          <span className="font-medium">{formatDate(order.otp_expires_at)}</span>
          {order.otp_used_at && <span className="ml-2 text-muted-foreground">Đã dùng lúc {formatDate(order.otp_used_at)}</span>}
        </div>
      )}

      {order.failure_reason && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {isPickupRetryOrder(order)
            ? `Khách đóng cửa khi hàng vẫn còn trong tủ. Phí lưu lại được tính lại: miễn phí ${PICKUP_RETRY_GRACE_HOURS} giờ, sau đó ${formatVND(PICKUP_RETRY_HOURLY_FEE)}/giờ.`
            : `Lý do lỗi: ${order.failure_reason}`}
        </div>
      )}

      {!order.is_paid && liveFeeStatuses.has(order.status) && (
        <div className="mt-5 border-t pt-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {qrUrl ? (
              <img src={qrUrl} alt="VietQR" className="h-36 w-36 rounded-lg border bg-white p-2" />
            ) : (
              <div className="h-36 w-36 rounded-lg border bg-muted/60 flex items-center justify-center text-center text-xs text-muted-foreground px-3">
                Chưa cấu hình tài khoản thanh toán
              </div>
            )}
            <div className="text-sm space-y-1">
              <div className="font-semibold">Thanh toán phí lưu tủ</div>
              <div><span className="text-muted-foreground">Ngân hàng:</span> <span className="font-medium">{settings?.bank_code || "-"}</span></div>
              <div><span className="text-muted-foreground">Số TK:</span> <span className="font-mono">{settings?.bank_account || "-"}</span></div>
              <div><span className="text-muted-foreground">Chủ TK:</span> {settings?.account_name || "-"}</div>
              <div><span className="text-muted-foreground">Nội dung:</span> <span className="font-mono text-xs">LOCKER {order.box_id} {order.id.slice(0, 8)}</span></div>
              <Button
                className="mt-3 gradient-primary"
                disabled={busy || !settings}
                onClick={() => onConfirmPayment(order.id, order.user_phone, fee)}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Xác nhận đã thanh toán & nhận OTP
              </Button>
            </div>
          </div>
        </div>
      )}

      {order.status !== "completed" && order.status !== "cancelled" && order.status !== "failed" && (
        <div className="mt-5 border-t pt-5">
          {order.is_paid ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild className="gradient-primary">
                <Link to="/notifications">Xem OTP</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/locker-terminal">Nhập OTP tại tủ</Link>
              </Button>
            </div>
          ) : (
            <Button className="w-full" variant="outline" disabled>Thanh toán để nhận OTP</Button>
          )}
        </div>
      )}
    </Card>
  );
}

function LookupOrderCard({
  order,
  settings,
  now,
  phone,
  busy,
  onConfirmPayment,
}: {
  order: LookupOrder;
  settings: Settings;
  now: Date;
  phone: string;
  busy: boolean;
  onConfirmPayment: (orderId: string, phone: string, fee: number) => void;
}) {
  const fee = useMemo(
    () => (order.is_paid ? order.total_amount : calculateFee(order.start_time, settings, now)),
    [order.is_paid, order.start_time, order.total_amount, settings, now],
  );
  const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(order.start_time).getTime()) / 1000));
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const qrUrl = settings.bank_code && settings.bank_account
    ? buildVietQR(settings.bank_code, settings.bank_account, fee, `LOCKER ${order.box_id} ${order.id.slice(0, 8)}`)
    : "";

  return (
    <Card className="p-6 mb-4 gradient-card shadow-card">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm text-muted-foreground">Tủ số</div>
          <div className="text-3xl font-bold">#{order.box_id}</div>
        </div>
        <Badge className={statusClass(order.status)}>
          {orderLabels[order.status] ?? order.status}
        </Badge>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="text-xs text-muted-foreground">Thời gian gửi</div>
          <div className="font-mono">{hours}h {minutes}m {seconds}s</div>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="text-xs text-muted-foreground">Tổng phí</div>
          <div className="text-xl font-bold text-primary">{formatVND(fee)}</div>
        </div>
      </div>

      {!order.is_paid && (
        <div className="border-t pt-4">
          <p className="text-sm text-muted-foreground mb-3">Quét VietQR để thanh toán phí lưu tủ.</p>
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            {qrUrl ? (
              <img src={qrUrl} alt="VietQR" className="w-48 h-48 rounded-xl border bg-white p-2" />
            ) : (
              <div className="w-48 h-48 rounded-xl border bg-muted/60 flex items-center justify-center text-center text-sm text-muted-foreground p-4">
                Chưa cấu hình tài khoản thanh toán
              </div>
            )}
            <div className="text-sm space-y-1">
              <div><span className="text-muted-foreground">Ngân hàng:</span> <span className="font-semibold">{settings.bank_code || "-"}</span></div>
              <div><span className="text-muted-foreground">Số TK:</span> <span className="font-mono">{settings.bank_account || "-"}</span></div>
              <div><span className="text-muted-foreground">Chủ TK:</span> {settings.account_name || "-"}</div>
              <div><span className="text-muted-foreground">Nội dung:</span> <span className="font-mono text-xs">LOCKER {order.box_id} {order.id.slice(0, 8)}</span></div>
              <Button
                className="mt-3 gradient-primary"
                disabled={busy}
                onClick={() => onConfirmPayment(order.id, phone.trim(), fee)}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Xác nhận đã thanh toán & nhận OTP
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="border-t mt-4 pt-4">
        {order.is_paid ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild className="gradient-primary">
              <Link to="/notifications">Xem OTP</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/locker-terminal">Nhập OTP tại tủ</Link>
            </Button>
          </div>
        ) : (
          <Button className="w-full" variant="outline" disabled>Thanh toán để nhận OTP</Button>
        )}
      </div>
    </Card>
  );
}

function ProfilePanel({ onSaved }: { onSaved: () => void }) {
  const { user, role, profile, displayName, updateProfile } = useAuth();
  const [name, setName] = useState(displayName);
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(displayName);
    setPhone(profile?.phone ?? "");
  }, [displayName, profile?.phone]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const parsedPhone = optionalPhoneSchema.safeParse(phone);
    if (!parsedPhone.success) return toast.error(parsedPhone.error.errors[0].message);

    setBusy(true);
    const result = await updateProfile({
      display_name: name.trim() || null,
      phone: parsedPhone.data.trim() || null,
    });
    setBusy(false);

    if (!result.ok) return toast.error(result.error ?? "Không thể cập nhật hồ sơ");
    toast.success("Đã cập nhật hồ sơ");
    onSaved();
  }

  return (
    <div className="grid lg:grid-cols-[1fr_1.3fr] gap-4">
      <Card className="p-6 gradient-card shadow-card">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-12 w-12 rounded-lg gradient-primary flex items-center justify-center">
            <UserRound className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="font-bold truncate">{displayName}</div>
            <div className="text-sm text-muted-foreground truncate">{user?.email}</div>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <InfoLine label="Vai trò" value={role ? roleLabels[role] : "Chưa có"} />
          <InfoLine label="Tên hiển thị" value={profile?.display_name || "Chưa cập nhật"} />
          <InfoLine label="Số điện thoại" value={profile?.phone || "Chưa cập nhật"} />
          <InfoLine label="User ID" value={user?.id ?? "-"} mono />
        </div>
      </Card>

      <Card className="p-6 shadow-card">
        <h2 className="text-lg font-semibold mb-1">Cập nhật hồ sơ</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Số điện thoại giúp hệ thống tự ghép các đơn shipper tạo bằng SĐT của bạn.
        </p>

        <form onSubmit={saveProfile} className="space-y-4">
          <div className="space-y-2">
            <Label>Tên hiển thị</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
          </div>

          <div className="space-y-2">
            <Label>Số điện thoại</Label>
            <Input
              type="tel"
              inputMode="tel"
              placeholder="VD: 0901234567"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              maxLength={15}
            />
          </div>

          <Button type="submit" className="gradient-primary" disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu hồ sơ
          </Button>
        </form>
      </Card>
    </div>
  );
}

function InfoBlock({
  label,
  value,
  icon,
  mono,
  highlight,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 truncate ${mono ? "font-mono text-sm" : "font-medium"} ${highlight ? "text-primary font-bold" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function InfoLine({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right break-all ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</span>
    </div>
  );
}

function OrderProgress({ status }: { status: string }) {
  const steps = [
    { key: "reserved", label: "Đã đặt tủ" },
    { key: "awaiting_dropoff", label: "Chờ bỏ hàng" },
    { key: "stored", label: "Đã lưu hàng" },
    { key: "pickup_in_progress", label: "Đang nhận" },
    { key: "completed", label: "Hoàn tất" },
  ];
  const activeIndex = getStepIndex(status);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {steps.map((step, index) => {
        const active = index <= activeIndex;
        return (
          <div
            key={step.key}
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              active ? "border-primary/30 bg-primary/10 text-primary" : "bg-background/70 text-muted-foreground"
            }`}
          >
            {active && <CheckCircle2 className="mb-1 h-4 w-4" />}
            {step.label}
          </div>
        );
      })}
    </div>
  );
}

function getStepIndex(status: string) {
  if (status === "completed") return 4;
  if (status === "pickup_in_progress") return 3;
  if (status === "stored" || status === "active") return 2;
  if (status === "awaiting_dropoff") return 1;
  if (status === "reserved") return 0;
  return -1;
}

function statusClass(status: string) {
  if (status === "completed") return "bg-success text-success-foreground";
  if (status === "failed" || status === "cancelled") return "bg-destructive text-destructive-foreground";
  if (status === "stored" || status === "active") return "bg-warning text-warning-foreground";
  if (status === "pickup_in_progress") return "bg-primary text-primary-foreground";
  return "bg-secondary text-secondary-foreground";
}

function formatDate(value?: string | null) {
  if (!value) return "Chưa có";
  return new Date(value).toLocaleString("vi-VN");
}

function durationLabel(start: string, end: string | undefined, now: Date) {
  const endDate = end ? new Date(end) : now;
  const elapsed = Math.max(0, Math.floor((endDate.getTime() - new Date(start).getTime()) / 1000));
  const days = Math.floor(elapsed / 86400);
  const hours = Math.floor((elapsed % 86400) / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);

  if (days > 0) return `${days} ngày ${hours} giờ`;
  if (hours > 0) return `${hours} giờ ${minutes} phút`;
  return `${minutes} phút`;
}
