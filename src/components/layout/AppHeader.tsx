import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bell, Package, LogOut, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

export default function AppHeader({ title }: { title: string }) {
  const { user, role, displayName, signOut } = useAuth();
  const navigate = useNavigate();
  const roleLabel = role === "admin" ? "Admin" : role === "shipper" ? "Shipper" : role === "customer" ? "Khách hàng" : "";

  return (
    <header className="border-b bg-card sticky top-0 z-30">
      <div className="container py-3 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg gradient-primary flex items-center justify-center">
            <Package className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-bold leading-tight">Smart Locker</div>
            <div className="text-xs text-muted-foreground leading-tight">{title}</div>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {role && <Badge variant="outline" className="hidden sm:inline-flex">{roleLabel}</Badge>}
          {user && (
            <Button asChild variant="ghost" size="icon" aria-label="Thông báo & OTP">
              <Link to="/notifications">
                <Bell className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {user && (
            <div className="hidden md:flex items-center gap-2 min-w-0 text-sm">
              <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 leading-tight">
                <div className="font-medium truncate max-w-[180px]">{displayName}</div>
                <div className="text-xs text-muted-foreground truncate max-w-[180px]">{user.email}</div>
              </div>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate("/"); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
