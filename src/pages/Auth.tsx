import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "@/integrations/supabase/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, EyeOff, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

type SignupRole = "customer" | "shipper" | "admin";

const signInSchema = z.object({
  email: z.string().trim().email("Email không hợp lệ").max(255),
  password: z.string().min(1, "Vui lòng nhập mật khẩu").max(128, "Mật khẩu quá dài"),
});

const signUpSchema = z
  .object({
    email: z.string().trim().email("Email không hợp lệ").max(255),
    password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(128, "Mật khẩu quá dài"),
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu"),
    role: z.enum(["customer", "shipper", "admin"]),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  });

export default function Auth() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [signupRole, setSignupRole] = useState<SignupRole>("customer");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate("/", { replace: true });
    }
  }, [user, loading, navigate]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);

    setBusy(true);
    const { error } = await authApi.signIn(email, password);
    setBusy(false);

    if (error) return toast.error(error.message);
    toast.success("Đăng nhập thành công");
  }

  async function signUp(event: React.FormEvent) {
    event.preventDefault();
    const parsed = signUpSchema.safeParse({ email, password, confirmPassword, role: signupRole });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);

    setBusy(true);
    const displayName = name || email.split("@")[0];
    const { error } = await authApi.signUp(
      email,
      password,
      displayName,
      `${window.location.origin}/`,
      parsed.data.role,
    );
    setBusy(false);

    if (error) return toast.error(error.message);
    toast.success("Tạo tài khoản thành công. Vui lòng kiểm tra email nếu Supabase yêu cầu xác nhận.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-hero">
      <Card className="w-full max-w-md p-6 sm:p-8 shadow-elegant">
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
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </Field>

              <PasswordInput
                label="Mật khẩu"
                value={password}
                onChange={setPassword}
                show={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                autoComplete="current-password"
              />

              <Button type="submit" className="w-full gradient-primary" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Đăng nhập
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={signUp} className="space-y-4">
              <Field label="Tên hiển thị">
                <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="name" />
              </Field>

              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </Field>

              <PasswordInput
                label="Mật khẩu"
                value={password}
                onChange={setPassword}
                show={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                autoComplete="new-password"
              />

              <PasswordInput
                label="Xác nhận mật khẩu"
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((value) => !value)}
                autoComplete="new-password"
              />

              <Field label="Vai trò">
                <Select value={signupRole} onValueChange={(value: SignupRole) => setSignupRole(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn vai trò" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Khách hàng</SelectItem>
                    <SelectItem value="shipper">Shipper</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Button type="submit" className="w-full gradient-primary" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Tạo tài khoản
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Tài khoản mới sẽ được gán theo vai trò bạn chọn.
              </p>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
}) {
  const Icon = show ? EyeOff : Eye;

  return (
    <Field label={label}>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pr-11"
          autoComplete={autoComplete}
          required
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </div>
    </Field>
  );
}
