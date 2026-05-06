import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Search, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { calculateFee, formatVND, buildVietQR, type PricingConfig } from "@/lib/pricing";
import { z } from "zod";

interface Order { id: string; box_id: number; start_time: string; total_amount: number; is_paid: boolean; status: string; }
interface Settings extends PricingConfig { bank_account: string; bank_code: string; account_name: string; }

const phoneSchema = z.string().trim().regex(/^[0-9+\s-]{8,15}$/, "Số điện thoại không hợp lệ");

export default function Lookup() {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    supabase.from("settings").select("*").eq("id", 1).single().then(({ data }) => {
      if (data) setSettings(data as Settings);
    });
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setBusy(true);
    const { data, error } = await supabase.rpc("lookup_orders_by_phone", { _phone: phone.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    setOrders((data ?? []) as Order[]);
    if (!data?.length) toast.info("Không tìm thấy đơn hàng đang chờ");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold"><ArrowLeft className="h-4 w-4" /> Trang chủ</Link>
          <div className="flex items-center gap-2"><Package className="h-5 w-5 text-primary" /><span className="font-bold">Smart Locker</span></div>
        </div>
      </header>
      <main className="container py-10 max-w-3xl">
        <Card className="p-6 md:p-8 shadow-card mb-6">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">Tra cứu đơn hàng</h1>
          <p className="text-muted-foreground mb-6">Nhập số điện thoại bạn đã nhận thông báo OTP để xem đơn và thanh toán.</p>
          <form onSubmit={lookup} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label className="sr-only">Số điện thoại</Label>
              <Input placeholder="VD: 0901234567" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={15} />
            </div>
            <Button type="submit" className="gradient-primary" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Tra cứu</span>
            </Button>
          </form>
        </Card>

        {orders && settings && orders.map((o) => (
          <OrderCard key={o.id} order={o} settings={settings} now={now} />
        ))}
      </main>
    </div>
  );
}

function OrderCard({ order, settings, now }: { order: Order; settings: Settings; now: Date }) {
  const fee = useMemo(() => calculateFee(order.start_time, settings, now), [order.start_time, settings, now]);
  const elapsed = Math.floor((now.getTime() - new Date(order.start_time).getTime()) / 1000);
  const h = Math.floor(elapsed / 3600), m = Math.floor((elapsed % 3600) / 60), s = elapsed % 60;
  const qrUrl = buildVietQR(settings.bank_code, settings.bank_account, fee, `LOCKER ${order.box_id} ${order.id.slice(0, 8)}`);

  return (
    <Card className="p-6 mb-4 gradient-card shadow-card">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm text-muted-foreground">Tủ số</div>
          <div className="text-3xl font-bold">#{order.box_id}</div>
        </div>
        <Badge variant={order.is_paid ? "default" : "secondary"} className={order.is_paid ? "bg-success text-success-foreground" : ""}>
          {order.is_paid ? "Đã thanh toán" : "Chờ thanh toán"}
        </Badge>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="text-xs text-muted-foreground">Thời gian gửi</div>
          <div className="font-mono">{h}h {m}m {s}s</div>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="text-xs text-muted-foreground">Tổng phí</div>
          <div className="text-xl font-bold text-primary">{formatVND(fee)}</div>
        </div>
      </div>
      {!order.is_paid && (
        <div className="border-t pt-4">
          <p className="text-sm text-muted-foreground mb-3">Quét mã QR bằng app ngân hàng để thanh toán. Tủ sẽ tự mở khi xác nhận thành công.</p>
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <img src={qrUrl} alt="VietQR" className="w-48 h-48 rounded-xl border bg-white p-2" />
            <div className="text-sm space-y-1">
              <div><span className="text-muted-foreground">Ngân hàng:</span> <span className="font-semibold">{settings.bank_code}</span></div>
              <div><span className="text-muted-foreground">Số TK:</span> <span className="font-mono">{settings.bank_account}</span></div>
              <div><span className="text-muted-foreground">Chủ TK:</span> {settings.account_name}</div>
              <div><span className="text-muted-foreground">Nội dung:</span> <span className="font-mono text-xs">LOCKER {order.box_id} {order.id.slice(0, 8)}</span></div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}