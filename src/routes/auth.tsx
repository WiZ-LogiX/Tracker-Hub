import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم تسجيل الدخول");
    nav({ to: "/admin" });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/admin`,
        data: { full_name: name },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم إنشاء الحساب — تأكد من بريدك أو سجل الدخول");
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
            <CardTitle className="text-center font-serif">لوحة الإدارة</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">تسجيل الدخول</TabsTrigger>
                <TabsTrigger value="signup">حساب جديد</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4 mt-4">
                  <div><Label>البريد الإلكتروني</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
                  <div><Label>كلمة المرور</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
                  <Button type="submit" disabled={loading} className="w-full gap-2">
                    {loading ? "..." : "دخول"} <ArrowRight className="h-4 w-4 rtl-flip" />
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4 mt-4">
                  <div><Label>الاسم الكامل</Label><Input value={name} onChange={e => setName(e.target.value)} required /></div>
                  <div><Label>البريد الإلكتروني</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
                  <div><Label>كلمة المرور</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} /></div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "..." : "أنشئ الحساب"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">أول مستخدم يسجل بياخد صلاحية admin تلقائياً.</p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
