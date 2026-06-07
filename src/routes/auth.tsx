import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم تسجيل الدخول");
    nav({ to: "/admin" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-6">
          <div className="h-10 w-10 rounded-md gradient-emerald flex items-center justify-center text-gold font-serif font-bold">P</div>
          <span className="font-serif text-2xl font-bold">PeleCanon</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="text-center font-serif">تسجيل الدخول</CardTitle>
            <p className="text-sm text-muted-foreground text-center mt-1">لوحة الإدارة - للموظفين فقط</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4 mt-4">
              <div>
                <Label>البريد الإلكتروني</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label>كلمة المرور</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" disabled={loading} className="w-full gap-2">
                {loading ? "..." : "دخول"} <ArrowRight className="h-4 w-4 rtl-flip" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}