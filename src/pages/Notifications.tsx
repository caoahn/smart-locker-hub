import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Clock3, Copy, Loader2, Package, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import AppHeader from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { notificationApi, realtimeApi, type CustomerNotificationRow } from "@/integrations/supabase/api";

function extractOtp(content: string) {
  return content.match(/\b\d{6}\b/)?.[0] ?? null;
}

function formatDate(value?: string | null) {
  if (!value) return "Chưa có";
  return new Date(value).toLocaleString("vi-VN");
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<CustomerNotificationRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    const { data, error } = await notificationApi.listCustomerNotifications();
    if (!silent) setBusy(false);

    if (error) {
      if (!silent) toast.error(error.message);
      return;
    }

    setNotifications((data ?? []) as CustomerNotificationRow[]);
  }, []);

  useEffect(() => {
    load(true);
    const unsubscribe = realtimeApi.subscribeToCustomerNotificationChanges(() => load(true));
    return unsubscribe;
  }, [load]);

  const otpCount = useMemo(() => notifications?.filter((item) => extractOtp(item.content)).length ?? 0, [notifications]);

  async function copyOtp(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success("Đã sao chép OTP");
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Thông báo & OTP" />
      <main className="container py-6 max-w-3xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Thông báo của tôi</h1>
            <p className="text-sm text-muted-foreground">OTP và thông báo đơn hàng được lưu ở đây.</p>
          </div>
          <Button variant="outline" onClick={() => load(false)} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Làm mới
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Thông báo</div>
            <div className="text-2xl font-bold">{notifications?.length ?? 0}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">OTP đang hiển thị</div>
            <div className="text-2xl font-bold">{otpCount}</div>
          </Card>
        </div>

        {notifications === null && (
          <Card className="p-6 text-center text-muted-foreground">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
            Đang tải thông báo...
          </Card>
        )}

        {notifications?.length === 0 && (
          <Card className="p-6 text-center">
            <Bell className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <div className="font-semibold">Chưa có thông báo nào</div>
            <p className="mt-1 text-sm text-muted-foreground">Khi shipper gửi hàng và tạo OTP, thông báo sẽ xuất hiện tại đây.</p>
          </Card>
        )}

        {notifications?.map((item) => {
          const otp = extractOtp(item.content);
          return (
            <Card key={item.id} className="p-5 shadow-card">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    <h2 className="font-semibold truncate">{item.subject || "Smart Locker"}</h2>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatDate(item.created_at)}
                  </div>
                </div>
                <Badge variant="outline">{item.status}</Badge>
              </div>

              {otp && (
                <div className="mt-4 rounded-lg border bg-primary/5 p-4">
                  <div className="text-xs text-muted-foreground">OTP nhận hàng</div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <div className="font-mono text-3xl font-bold tracking-widest text-primary">{otp}</div>
                    <Button type="button" variant="outline" size="icon" onClick={() => copyOtp(otp)} aria-label="Sao chép OTP">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              <p className="mt-4 text-sm leading-relaxed">{item.content}</p>

              <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div>Điện thoại: <span className="font-mono">{item.recipient_phone || "-"}</span></div>
                <div>Email: <span className="font-mono">{item.recipient_email || "-"}</span></div>
              </div>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
