import { useEffect, useState } from "react";
import { lockerApi, orderApi, realtimeApi } from "@/integrations/supabase/api";
import AppHeader from "@/components/layout/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Box, Truck, CheckCircle2, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { generateOTP } from "@/lib/pricing";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";

interface Locker { id: number; status: string; }

const phoneSchema = z.string().trim().regex(/^[0-9+\s-]{8,15}$/, "SĐT không hợp lệ");

export default function ShipperDashboard() {
  const { user } = useAuth();
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [phone, setPhone] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelivery, setPendingDelivery] = useState<{ orderId: string; otp: string; box: number } | null>(null);

  async function load() {
    const { data } = await lockerApi.listLockers();
    if (data) setLockers(data as Locker[]);
  }

  useEffect(() => {
    load();
    return realtimeApi.subscribeToLockerChanges(load);
  }, []);

  async function openLocker() {
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    if (!selected) return toast.error("Chọn một tủ trống");
    setBusy(true);
    const otp = generateOTP();
    const { data, error } = await orderApi.createOrder({
      box_id: selected, otp_code: otp, user_phone: phone.trim(), shipper_id: user!.id, status: "active",
    });
    if (error) { setBusy(false); return toast.error(error.message); }
    await lockerApi.markOccupied(selected);
    setBusy(false);
    setPendingDelivery({ orderId: data.id, otp, box: selected });
    toast.success(`Tủ #${selected} đã mở. Bỏ hàng vào và đóng cửa.`);
  }

  async function confirmDelivered() {
    if (!pendingDelivery) return;
    toast.success(`Đã gửi OTP ${pendingDelivery.otp} cho khách`);
    setPendingDelivery(null);
    setPhone("");
    setSelected(null);
  }

  const empty = lockers.filter(l => l.status === "empty");

  if (pendingDelivery) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Shipper" />
        <main className="container py-6 max-w-md">
          <Card className="p-6 gradient-card shadow-elegant text-center">
            <div className="h-16 w-16 mx-auto rounded-2xl gradient-primary flex items-center justify-center mb-4">
              <Box className="h-8 w-8 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-1">Tủ #{pendingDelivery.box} đã mở</h2>
            <p className="text-muted-foreground mb-6">Bỏ hàng vào và đóng cửa, sau đó xác nhận giao hàng.</p>
            <div className="p-4 rounded-xl bg-muted/50 mb-6">
              <div className="text-xs text-muted-foreground mb-1">OTP cho khách</div>
              <div className="text-3xl font-bold tracking-widest font-mono">{pendingDelivery.otp}</div>
            </div>
            <Button size="lg" className="w-full gradient-primary" onClick={confirmDelivered}>
              <CheckCircle2 className="mr-2 h-5 w-5" /> Xác nhận đã giao
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
        <Card className="p-6 gradient-card shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <Truck className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-bold">Tạo đơn giao hàng</h2>
          </div>
          <div className="space-y-4">
            <div>
              <Label>SĐT người nhận</Label>
              <Input type="tel" inputMode="tel" placeholder="VD: 0901234567" value={phone} onChange={e => setPhone(e.target.value)} maxLength={15} />
            </div>
            <div>
              <Label>Chọn tủ trống</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {lockers.map(l => {
                  const isEmpty = l.status === "empty";
                  const isSel = selected === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      disabled={!isEmpty}
                      onClick={() => setSelected(l.id)}
                      className={`p-6 rounded-xl border-2 transition-smooth ${isSel ? "border-primary shadow-elegant bg-primary/5" : "border-border"} ${!isEmpty ? "opacity-50 cursor-not-allowed" : "hover:border-primary/50"}`}
                    >
                      <Box className={`h-8 w-8 mx-auto mb-2 ${isSel ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="font-bold text-xl">Tủ #{l.id}</div>
                      <Badge variant="outline" className="mt-2">{isEmpty ? "Trống" : "Bận"}</Badge>
                    </button>
                  );
                })}
              </div>
              {empty.length === 0 && <p className="text-sm text-warning mt-2">Hiện không có tủ trống.</p>}
            </div>
            <Button size="lg" className="w-full gradient-primary" onClick={openLocker} disabled={busy || !selected || !phone}>
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <KeyRound className="mr-2 h-5 w-5" />}
              Mở tủ #{selected ?? "?"}
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
