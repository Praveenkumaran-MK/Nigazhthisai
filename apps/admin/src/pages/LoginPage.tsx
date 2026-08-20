import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Alert, Card, BrandLogo } from "@sbt/ui";
import { useAdminAuth } from "../hooks/useAdminAuth";

export function LoginPage() {
  const { login, error, status } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Navigate only once `status` has actually settled to "signed-in" — not
  // immediately after login() resolves. login() only waits for the auth
  // sign-in call itself; the profile-role lookup that determines `status`
  // is deferred a tick (setTimeout(...,0), see useAdminAuth — required to
  // avoid a documented supabase-js deadlock in onAuthStateChange). A bare
  // `navigate("/dashboard")` right after login() used to race that: it hit
  // ProtectedRoute while `status` was still "signed-out" from the initial
  // (pre-login) session check, so it bounced straight back to /login even
  // though the sign-in had genuinely succeeded — silent, no error shown.
  useEffect(() => {
    if (status === "signed-in") {
      navigate("/dashboard", { replace: true });
    }
  }, [status, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email.trim(), password);
    } catch {
      /* error surfaced via useAdminAuth().error */
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-navy-700 bg-dot-grid bg-[length:16px_16px] p-6">
      <Card className="w-full max-w-sm">
        <BrandLogo variant="lockup" className="mb-5" />
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">District Admin</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">Sign in with your admin email and password.</p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <Input label="Email" type="email" autoComplete="username" placeholder="admin@transit.gov" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <Alert tone="danger" title="Login failed">{error}</Alert>}
          <Button type="submit" size="lg" isLoading={isLoading}>
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}
