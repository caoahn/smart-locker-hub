import { useEffect, useState } from "react";
import { hardwareApi, type LockerSignals } from "@/integrations/hardware/api";
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
  box: number;
  customerPhone: string;
  customerEmail?: string;
};

type CompletedDropoff = {
  box: number;
  orderId: string;
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

function getMissingDropoffSteps(signals: LockerSignals | null) {
  if (!signals) return ["chưa đọc được cảm biến"];

  const missing: string[] = [];
  if (!signals.itemPresent) missing.push("chưa bỏ hàng vào tủ");
  if (!signals.doorClosed) missing.push("chưa đóng cửa");
  if (!signals.locked) missing.push("chưa khóa chốt cửa");
  return missing;
}

function SensorBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant="outline" className={ok ? "border-success text-success" : "border-warning text-warning"}>
      {ok ? "OK" : "Chờ"} · {label}
    </Badge>
  );
}

export default function ShipperDashboard() {
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDropoff, setPendingDropoff] = useState<PendingDropoff | null>(null);
  const [completedDropoff, setCompletedDropoff] = useState<CompletedDropoff | null>(null);
  const [signals, setSignals] = useState<LockerSignals | null>(null);
  const [signalError, setSignalError] = useState<string | null>(null);

  async function load() {
    const { data } = await lockerApi.listLockers();
    if (data) setLockers(data as Locker[]);
  }

  useEffect(() => {
    load();
    return realtimeApi.subscribeToLockerChanges(load);
  }, []);

  useEffect(() => {
    if (!pendingDropoff) {
      setSignals(null);
      setSignalError(null);
      return;
    }

    let cancelled = false;

    async function pollSignals() {
      try {
        const response = await hardwareApi.getLockerSignals(pendingDropoff.box);
        if (!cancelled) {
          setSignals(response.data);
          setSignalError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setSignalError(error instanceof Error ? error.message : "Không đọc được cảm biến tủ");
        }
      }
    }

    pollSignals();
    const timer = window.setInterval(pollSignals, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pendingDropoff]);

  async function openLockerForDropoff() {
    const parsedPhone = phoneSchema.safeParse(phone);
    if (!parsedPhone.success) return toast.error(parsedPhone.error.errors[0].message);

    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) return toast.error(parsedEmail.error.errors[0].message);

    if (selected === null) return toast.error("Chọn một tủ trống");
    if (!hardwareApi.isConfigured()) return toast.error("Chưa cấu hình IP_HARD_WARE cho phần cứng");

    setBusy(true);
    setCompletedDropoff(null);

    try {
      await hardwareApi.openLocker(selected, "dropoff");
    } catch (error) {
      setBusy(false);
      return toast.error(error instanceof Error ? error.message : "Phần cứng mở cửa thất bại");
    }

    setBusy(false);
    setPendingDropoff({
      box: selected,
      customerPhone: parsedPhone.data.trim(),
      customerEmail: parsedEmail.data.trim() || undefined,
    });
    toast.success(`Tủ #${selected} đã mở. Hãy bỏ hàng vào và khóa cửa.`);
  }

  async function confirmDoorClosed() {
    if (!pendingDropoff) return;

    const missing = getMissingDropoffSteps(signals);
    if (missing.length > 0) {
      return toast.error(`Shipper chưa thực hiện: ${missing.join(", ")}`);
    }

    setBusy(true);
    const { data, error } = await orderApi.createOrderAfterDropoff(
      pendingDropoff.box,
      pendingDropoff.customerPhone,
      pendingDropoff.customerEmail ?? null,
    );
    setBusy(false);

    if (error || !data) return toast.error(error?.message ?? "Không thể tạo đơn sau khi đóng tủ");

    setCompletedDropoff({
      box: data.box_id,
      orderId: data.order_id,
      customerPhone: pendingDropoff.customerPhone,
    });
    setPendingDropoff(null);
    setPhone("");
    setEmail("");
    setSelected(null);
    load();
    toast.success("Đã tạo đơn và bắt đầu tính thời gian lưu tủ");
  }

  const empty = lockers.filter((locker) => locker.status === "empty");
  const missingSteps = getMissingDropoffSteps(signals);
  const dropoffReady = pendingDropoff && missingSteps.length === 0;

  if (pendingDropoff) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Shipper" />
        <main className="container py-6 max-w-md">
          <Card className="p-6 gradient-card shadow-elegant text-center">
            <div className="h-16 w-16 mx-auto rounded-2xl gradient-primary flex items-center justify-center mb-4">
              <DoorOpen className="h-8 w-8 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-1">Tủ #{pendingDropoff.box} đang mở</h2>
            <p className="text-muted-foreground mb-6">Bỏ hàng vào tủ, đóng cửa và chờ chốt khóa xác nhận.</p>

            <div className="p-4 rounded-xl bg-muted/50 mb-4 text-left space-y-2">
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

            <div className="rounded-xl border bg-background/70 p-4 mb-4 text-left space-y-3">
              <div className="font-semibold text-sm">Tín hiệu phần cứng</div>
              {signalError ? (
                <div className="text-sm text-destructive">{signalError}</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <SensorBadge ok={Boolean(signals?.itemPresent)} label="IR có hàng" />
                  <SensorBadge ok={Boolean(signals?.doorClosed)} label="Cửa đã đóng" />
                  <SensorBadge ok={Boolean(signals?.locked)} label="Chốt đã khóa" />
                </div>
              )}
              {missingSteps.length > 0 && (
                <p className="text-sm text-warning">Shipper chưa thực hiện: {missingSteps.join(", ")}.</p>
              )}
            </div>

            <Button size="lg" className="w-full gradient-primary" onClick={confirmDoorClosed} disabled={busy || !dropoffReady}>
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <DoorClosed className="mr-2 h-5 w-5" />}
              Đã đóng và khóa tủ
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
                <div className="text-sm text-muted-foreground">
                  Đã tạo đơn {completedDropoff.orderId.slice(0, 8)} cho {completedDropoff.customerPhone}. Khách sẽ nhận OTP sau khi thanh toán.
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-6 gradient-card shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <Truck className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-bold">Gửi hàng vào tủ</h2>
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
            <Button size="lg" className="w-full gradient-primary" onClick={openLockerForDropoff} disabled={busy || selected === null || !phone}>
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <DoorOpen className="mr-2 h-5 w-5" />}
              Mở tủ #{selected ?? "?"}
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
