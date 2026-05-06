import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authApi } from "@/integrations/supabase/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email("Email không hợp lệ").max(255),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(72),
});

export default function Auth() {
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!loading && user) {
      navigate(role === "admin" ? "/admin" : "/shipper", { replace: true });
    }
  }, [user, role, loading, navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setBusy(true);
    const { error } = await authApi.signIn(email, password);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Đăng nhập thành công");
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setBusy(true);
    const displayName = name || email.split("@")[0];
    const { error } = await authApi.signUp(email, password, displayName, `${window.location.origin}/`);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Tạo tài khoản thành công — bạn có thể đăng nhập ngay");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-hero">
      <Card className="w-full max-w-md p-8 shadow-elegant">
        <Link to="/" className="flex items-center gap-2 justify-center mb-6">
          <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center">
            <Package className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">Smart Locker</span>
        </Link>
        <Tabs defaultValue="signin">
          <TabsList className="grid grid-cols-2 w-full mb-6">
            <TabsTrigger value="signin">Đăng nhập</TabsTrigger>
            <TabsTrigger value="signup">Đăng ký</TabsTrigger>
          </TabsList>
          <TabsContent value="signin">
            <form onSubmit={signIn} className="space-y-4">
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div><Label>Mật khẩu</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <Button type="submit" className="w-full gradient-primary" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Đăng nhập
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="signup">
            <form onSubmit={signUp} className="space-y-4">
              <div><Label>Tên hiển thị</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div><Label>Mật khẩu</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <Button type="submit" className="w-full gradient-primary" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Tạo tài khoản
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Tài khoản mới mặc định là Shipper. Quản trị viên có thể nâng cấp lên Admin.
              </p>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
