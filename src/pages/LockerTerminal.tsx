import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ArrowLeft, CheckCircle2, DoorClosed, DoorOpen, KeyRound, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { hardwareApi } from "@/integrations/hardware/api";
import { orderApi } from "@/integrations/supabase/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const terminalSchema = z.object({
  boxId: z.coerce.number().int().positive("Mã tủ không hợp lệ"),
  otp: z.string().trim().regex(/^\d{6}$/, "OTP phải gồm 6 chữ số"),
});

const reasonLabels: Record<string, string> = {
  payment_required: "Đơn hàng chưa thanh toán, vui lòng thanh toán để nhận OTP",
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
  const [doorClosed, setDoorClosed] = useState(false);
  const [itemPresent, setItemPresent] = useState(true);
  const [signalError, setSignalError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      setSignalError(null);
      return;
    }

    let cancelled = false;

    async function pollSignals() {
      try {
        const response = await hardwareApi.getLockerSignals(opened.boxId);
        if (!cancelled) {
          setDoorClosed(response.data.doorClosed);
          setItemPresent(response.data.itemPresent);
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
  }, [opened]);

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
    setDoorClosed(false);
    setItemPresent(true);
    setCompleted(false);
    setBusy(false);
    toast.success(`Tủ #${parsed.data.boxId} đã mở`);
  }

  async function confirmClosed() {
    if (!opened) return;
    if (!doorClosed) return toast.error("Công tắc cửa chưa báo đóng");
    if (itemPresent) return toast.error("Cảm biến vẫn báo còn hàng trong tủ");

    setBusy(true);
    const { data, error } = await orderApi.confirmPickupClosed(opened.boxId);
    setBusy(false);

    if (error) return toast.error(error.message);
    if (!data?.completed) return toast.error(reasonLabels[data?.reason ?? ""] ?? "Chưa thể hoàn tất");

    setCompleted(true);
    setOpened(null);
    setDoorClosed(false);
    setItemPresent(true);
    setOtp("");
    toast.success("Đơn hàng đã hoàn tất, tủ đã trống");
  }

  async function keepStored() {
    if (!opened) return;
    if (!doorClosed) return toast.error("Công tắc cửa chưa báo đóng");
    if (!itemPresent) return toast.error("Tủ không còn hàng, hãy hoàn tất nhận hàng");

    setBusy(true);
    const { error } = await orderApi.returnPickupToStorage(opened.boxId);
    setBusy(false);

    if (error) return toast.error(error.message);

    setOpened(null);
    setDoorClosed(false);
    setItemPresent(true);
    setOtp("");
    toast.info("Tủ đã đóng nhưng hàng vẫn còn. Đơn được lưu lại và phí sẽ tính lại sau thời gian miễn phí.");
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
              <div className="rounded-lg border bg-muted/40 p-4 text-left space-y-3">
                {signalError && (
                  <div className="rounded-md bg-warning/10 p-2 text-xs text-warning">
                    {signalError}. Có thể thao tác mô phỏng bằng các ô bên dưới khi chưa nối phần cứng.
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Checkbox id="door-closed" checked={doorClosed} onCheckedChange={(checked) => setDoorClosed(checked === true)} />
                  <Label htmlFor="door-closed" className="leading-tight">Công tắc cửa đã đóng</Label>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox id="item-present" checked={itemPresent} onCheckedChange={(checked) => setItemPresent(checked === true)} />
                  <div>
                    <Label htmlFor="item-present" className="leading-tight">Cảm biến vẫn còn hàng trong tủ</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Bỏ chọn khi khách đã lấy hàng ra khỏi tủ.</p>
                  </div>
                </div>
              </div>

              {doorClosed && itemPresent && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-left text-sm">
                  Hàng vẫn còn trong tủ. Nếu xác nhận đóng lại, đơn sẽ quay về trạng thái chờ nhận; phí được tính lại từ đầu với 2 giờ miễn phí rồi 3.000đ/giờ.
                </div>
              )}

              <Button size="lg" className="w-full gradient-primary" onClick={confirmClosed} disabled={busy || !doorClosed || itemPresent}>
                {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <DoorClosed className="mr-2 h-5 w-5" />}
                Cửa đã đóng
              </Button>
              <Button size="lg" variant="outline" className="w-full" onClick={keepStored} disabled={busy || !doorClosed || !itemPresent}>
                {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Package className="mr-2 h-5 w-5" />}
                Đóng lại, tiếp tục lưu hàng
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
