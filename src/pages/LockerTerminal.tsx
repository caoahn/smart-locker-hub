import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ArrowLeft, CheckCircle2, DoorClosed, DoorOpen, KeyRound, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { hardwareApi } from "@/integrations/hardware/api";
import { orderApi } from "@/integrations/supabase/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const terminalSchema = z.object({
  boxId: z.coerce.number().int().positive("Mã tủ không hợp lệ"),
  otp: z.string().trim().regex(/^\d{6}$/, "OTP phải gồm 6 chữ số"),
});

const reasonLabels: Record<string, string> = {
  allowed: "Hợp lệ",
  invalid_otp: "OTP không đúng",
  otp_expired: "OTP đã hết hạn",
  otp_used: "OTP đã được sử dụng",
  order_not_found: "Không tìm thấy đơn đang chờ nhận",
  pickup_order_not_found: "Không tìm thấy phiên nhận hàng",
};

export default function LockerTerminal() {
  const [boxId, setBoxId] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<{ boxId: number; orderId: string } | null>(null);
  const [completed, setCompleted] = useState(false);

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const parsed = terminalSchema.safeParse({ boxId, otp });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    if (!hardwareApi.isConfigured()) return toast.error("Chưa cấu hình IP_HARD_WARE cho phần cứng");

    setBusy(true);
    const { data, error } = await orderApi.verifyPickupOtp(parsed.data.boxId, parsed.data.otp);

    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    if (!data?.allowed || !data.order_id) {
      setBusy(false);
      return toast.error(reasonLabels[data?.reason ?? ""] ?? "Không thể mở tủ");
    }

    try {
      await hardwareApi.openLocker(parsed.data.boxId, "pickup");
    } catch (hardwareError) {
      const message = hardwareError instanceof Error ? hardwareError.message : "Phần cứng mở cửa thất bại";
      await orderApi.markPickupOpenFailed(data.order_id, message);
      setBusy(false);
      return toast.error(message);
    }

    setOpened({ boxId: parsed.data.boxId, orderId: data.order_id });
    setCompleted(false);
    setBusy(false);
    toast.success(`Tủ #${parsed.data.boxId} đã mở`);
  }

  async function confirmClosed() {
    if (!opened) return;
    setBusy(true);
    const { data, error } = await orderApi.confirmPickupClosed(opened.boxId);
    setBusy(false);

    if (error) return toast.error(error.message);
    if (!data?.completed) return toast.error(reasonLabels[data?.reason ?? ""] ?? "Chưa thể hoàn tất");

    setCompleted(true);
    setOpened(null);
    setOtp("");
    toast.success("Đơn hàng đã hoàn tất, tủ đã trống");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <ArrowLeft className="h-4 w-4" /> Trang chủ
          </Link>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <span className="font-bold">Smart Locker</span>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-md">
        <Card className="p-6 shadow-card">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-lg gradient-primary flex items-center justify-center">
                <KeyRound className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Thiết bị locker</h1>
                <p className="text-sm text-muted-foreground">Xác thực nhận hàng</p>
              </div>
            </div>
            <Badge variant="outline">{completed ? "Trống" : opened ? "Đang mở" : "Sẵn sàng"}</Badge>
          </div>

          {opened ? (
            <div className="space-y-4 text-center">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-success/10 text-success flex items-center justify-center">
                <DoorOpen className="h-8 w-8" />
              </div>
              <div>
                <div className="text-3xl font-bold">Tủ #{opened.boxId}</div>
                <div className="text-sm text-muted-foreground font-mono mt-1">{opened.orderId.slice(0, 8)}</div>
              </div>
              <Button size="lg" className="w-full gradient-primary" onClick={confirmClosed} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <DoorClosed className="mr-2 h-5 w-5" />}
                Cửa đã đóng
              </Button>
            </div>
          ) : (
            <form onSubmit={verifyOtp} className="space-y-4">
              {completed && (
                <div className="rounded-lg bg-success/10 text-success p-3 flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Hoàn tất nhận hàng
                </div>
              )}
              <div className="space-y-2">
                <Label>Mã tủ</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={boxId}
                  onChange={(event) => setBoxId(event.target.value)}
                  placeholder="1"
                />
              </div>
              <div className="space-y-2">
                <Label>OTP</Label>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="font-mono text-2xl tracking-[0.35em] text-center"
                />
              </div>
              <Button type="submit" size="lg" className="w-full gradient-primary" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <DoorOpen className="mr-2 h-5 w-5" />}
                Xác thực & mở cửa
              </Button>
            </form>
          )}
        </Card>
      </main>
    </div>
  );
}
