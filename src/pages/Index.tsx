import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Package, Search, Truck, ShieldCheck, Bell, QrCode } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const { user, role } = useAuth();
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden gradient-hero text-primary-foreground">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, hsl(var(--primary-glow)) 0, transparent 40%), radial-gradient(circle at 80% 60%, hsl(var(--accent)) 0, transparent 40%)" }} />
        <div className="container relative z-10 py-20 md:py-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur text-sm mb-6">
              <Package className="h-4 w-4" /> Hệ thống tủ khoá thông minh
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Smart Locker — Nhận hàng <span className="bg-gradient-to-r from-primary-glow to-accent bg-clip-text text-transparent">an toàn</span>, mọi lúc
            </h1>
            <p className="text-lg md:text-xl text-white/80 mb-8 max-w-2xl">
              Giao nhận không tiếp xúc qua tủ khoá ESP32. Tra cứu đơn, thanh toán QR và mở tủ tự động chỉ trong vài giây.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/lookup">
                <Button size="lg" className="bg-white text-primary hover:bg-white/90 shadow-glow">
                  <Search className="mr-2 h-5 w-5" /> Tra cứu đơn hàng
                </Button>
              </Link>
              {user ? (
                <Link to={role === "admin" ? "/admin" : "/shipper"}>
                  <Button size="lg" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20">
                    Vào bảng điều khiển
                  </Button>
                </Link>
              ) : (
                <Link to="/auth">
                  <Button size="lg" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20">
                    Đăng nhập nhân viên
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-16 md:py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Tất cả trong một nền tảng</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Quản lý tủ khoá, đơn hàng, thanh toán và cảnh báo từ một giao diện duy nhất.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Truck, title: "Shipper giao hàng", desc: "Chọn tủ trống, nhập SĐT người nhận, hệ thống tự sinh OTP và gửi cho khách." },
            { icon: QrCode, title: "Thanh toán QR", desc: "Khách quét VietQR, phí được tính theo thời gian thực — quá hạn cộng dồn tự động." },
            { icon: ShieldCheck, title: "An toàn tuyệt đối", desc: "OTP 6 chữ số, master key cho admin, cảnh báo phá tủ tức thì." },
            { icon: Bell, title: "Thông báo Telegram", desc: "OTP, link thanh toán và cảnh báo khẩn cấp gửi qua Telegram Bot." },
            { icon: Package, title: "Giám sát realtime", desc: "Trạng thái tủ và đơn hàng cập nhật liên tục qua WebSocket." },
            { icon: Search, title: "Báo cáo doanh thu", desc: "Thống kê doanh thu theo ngày/tháng từ phí gửi và phí quá hạn." },
          ].map((f) => (
            <Card key={f.title} className="p-6 gradient-card shadow-card hover:shadow-elegant transition-smooth border-border/50">
              <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center mb-4 shadow-elegant">
                <f.icon className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Smart Locker System
      </footer>
    </div>
  );
};

export default Index;
