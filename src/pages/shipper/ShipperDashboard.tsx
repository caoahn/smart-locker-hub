import { useEffect, useState } from "react";
import { hardwareApi } from "@/integrations/hardware/api";
import { lockerApi, orderApi, realtimeApi } from "@/integrations/supabase/api";
import AppHeader from "@/components/layout/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Box, CheckCircle2, DoorClosed, DoorOpen, Loader2, Mail, Phone, Truck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

interface Locker {
  id: number;
  status: string;
}

type PendingDropoff = {
  orderId: string;
  box: number;
  customerPhone: string;
  customerEmail?: string;
};

type CompletedDropoff = {
  box: number;
  otp: string;
  otpExpiresAt: string;
  customerPhone: string;
};

const phoneSchema = z.string().trim().regex(/^[0-9+\s-]{8,15}$/, "SĐT không hợp lệ");
const emailSchema = z.string().trim().email("Email không hợp lệ").or(z.literal(""));

const lockerLabels: Record<string, string> = {
  empty: "Trống",
  reserved: "Đã giữ",
  awaiting_dropoff: "Chờ bỏ hàng",
  occupied: "Có hàng",
  pickup_in_progress: "Đang nhận",
  overdue: "Quá hạn",
};

export default function ShipperDashboard() {
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDropoff, setPendingDropoff] = useState<PendingDropoff | null>(null);
  const [completedDropoff, setCompletedDropoff] = useState<CompletedDropoff | null>(null);

  async function load() {
    const { data } = await lockerApi.listLockers();
    if (data) setLockers(data as Locker[]);
  }

  useEffect(() => {
    load();
    return realtimeApi.subscribeToLockerChanges(load);
  }, []);

  async function reserveAndOpenLocker() {
    const parsedPhone = phoneSchema.safeParse(phone);
    if (!parsedPhone.success) return toast.error(parsedPhone.error.errors[0].message);

    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) return toast.error(parsedEmail.error.errors[0].message);

    if (selected === null) return toast.error("Chọn một tủ trống");
    if (!hardwareApi.isConfigured()) return toast.error("Chưa cấu hình IP_HARD_WARE cho phần cứng");

    setBusy(true);
    setCompletedDropoff(null);

    const reserved = await orderApi.reserveDropoff(selected, parsedPhone.data.trim(), parsedEmail.data.trim() || null);
    if (reserved.error || !reserved.data) {
      setBusy(false);
      return toast.error(reserved.error?.message ?? "Không thể đặt tủ");
    }

    try {
      await hardwareApi.openLocker(selected, "dropoff");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Phần cứng mở cửa thất bại";
      await orderApi.markDropoffOpenFailed(reserved.data.order_id, message);
      setBusy(false);
      load();
      return toast.error(message);
    }

    const opened = await orderApi.requestDropoffOpen(reserved.data.order_id);
    if (opened.error || !opened.data) {
      await orderApi.markDropoffOpenFailed(reserved.data.order_id, opened.error?.message ?? "hardware_open_failed");
      setBusy(false);
      load();
      return toast.error(opened.error?.message ?? "Phần cứng mở cửa thất bại");
    }

    setBusy(false);
    setPendingDropoff({
      orderId: opened.data.order_id,
      box: opened.data.box_id,
      customerPhone: parsedPhone.data.trim(),
      customerEmail: parsedEmail.data.trim() || undefined,
    });
    toast.success(`Tủ #${opened.data.box_id} đã mở`);
  }

  async function confirmDoorClosed() {
    if (!pendingDropoff) return;

    setBusy(true);
    const { data, error } = await orderApi.confirmDropoffClosed(pendingDropoff.box);
    setBusy(false);

    if (error || !data) return toast.error(error?.message ?? "Không thể xác nhận đóng cửa");

    setCompletedDropoff({
      box: data.box_id,
      otp: data.otp_code,
      otpExpiresAt: data.otp_expires_at,
      customerPhone: pendingDropoff.customerPhone,
    });
    setPendingDropoff(null);
    setPhone("");
    setEmail("");
    setSelected(null);
    load();
    toast.success("Đã lưu hàng và tạo OTP cho khách");
  }

  const empty = lockers.filter((locker) => locker.status === "empty");

  if (pendingDropoff) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Shipper" />
        <main className="container py-6 max-w-md">
          <Card className="p-6 gradient-card shadow-elegant text-center">
            <div className="h-16 w-16 mx-auto rounded-2xl gradient-primary flex items-center justify-center mb-4">
              <DoorOpen className="h-8 w-8 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-1">Tủ #{pendingDropoff.box} đã mở</h2>
            <p className="text-muted-foreground mb-6">Đơn {pendingDropoff.orderId.slice(0, 8)} đang chờ cảm biến cửa đóng.</p>
            <div className="p-4 rounded-xl bg-muted/50 mb-6 text-left space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono">{pendingDropoff.customerPhone}</span>
              </div>
              {pendingDropoff.customerEmail && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">{pendingDropoff.customerEmail}</span>
                </div>
              )}
            </div>
            <Button size="lg" className="w-full gradient-primary" onClick={confirmDoorClosed} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <DoorClosed className="mr-2 h-5 w-5" />}
              Cửa đã đóng
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Shipper" />
      <main className="container py-6 max-w-2xl space-y-6">
        {completedDropoff && (
          <Card className="p-5 border-success bg-success/5 shadow-card">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-success mt-1" />
              <div className="flex-1">
                <div className="font-bold">Tủ #{completedDropoff.box} đã chứa hàng</div>
                <div className="text-sm text-muted-foreground">OTP đã được tạo cho {completedDropoff.customerPhone}</div>
                <div className="mt-3 grid sm:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-background/80 p-3">
                    <div className="text-xs text-muted-foreground">OTP</div>
                    <div className="font-mono text-2xl font-bold tracking-widest">{completedDropoff.otp}</div>
                  </div>
                  <div className="rounded-lg bg-background/80 p-3">
                    <div className="text-xs text-muted-foreground">Hết hạn</div>
                    <div className="font-medium">{new Date(completedDropoff.otpExpiresAt).toLocaleString("vi-VN")}</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-6 gradient-card shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <Truck className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-bold">Tạo đơn gửi hàng</h2>
          </div>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>SĐT khách nhận</Label>
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="VD: 0901234567"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  maxLength={15}
                />
              </div>
              <div>
                <Label>Email khách nhận</Label>
                <Input
                  type="email"
                  placeholder="tuỳ chọn"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={120}
                />
              </div>
            </div>
            <div>
              <Label>Chọn tủ trống</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {lockers.map((locker) => {
                  const isEmpty = locker.status === "empty";
                  const isSelected = selected === locker.id;
                  return (
                    <button
                      key={locker.id}
                      type="button"
                      disabled={!isEmpty}
                      onClick={() => setSelected(locker.id)}
                      className={`p-6 rounded-xl border-2 transition-smooth ${isSelected ? "border-primary shadow-elegant bg-primary/5" : "border-border"} ${!isEmpty ? "opacity-50 cursor-not-allowed" : "hover:border-primary/50"}`}
                    >
                      <Box className={`h-8 w-8 mx-auto mb-2 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="font-bold text-xl">Tủ #{locker.id}</div>
                      <Badge variant="outline" className="mt-2">{lockerLabels[locker.status] ?? locker.status}</Badge>
                    </button>
                  );
                })}
              </div>
              {empty.length === 0 && <p className="text-sm text-warning mt-2">Hiện không có tủ trống.</p>}
            </div>
            <Button size="lg" className="w-full gradient-primary" onClick={reserveAndOpenLocker} disabled={busy || selected === null || !phone}>
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <DoorOpen className="mr-2 h-5 w-5" />}
              Đặt tủ & mở cửa #{selected ?? "?"}
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
