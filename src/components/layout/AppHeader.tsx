import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Package, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

export default function AppHeader({ title }: { title: string }) {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
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
          {role && <Badge variant="outline" className="hidden sm:inline-flex capitalize">{role}</Badge>}
          <span className="text-sm text-muted-foreground hidden md:inline truncate max-w-[180px]">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate("/"); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}