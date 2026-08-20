import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Alert, Card, BrandLogo } from "@sbt/ui";
import { useConductorAuth } from "../hooks/useConductorAuth";

export function LoginPage() {
  const { login, error, status } = useConductorAuth();
  const navigate = useNavigate();
  const [governmentId, setGovernmentId] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Navigate only once `status` has settled — not immediately after
  // login() resolves. The profile lookup that determines `status` is
  // deferred a tick (setTimeout(...,0) in useConductorAuth, required to
  // avoid a supabase-js onAuthStateChange deadlock), so navigating right
  // after login() used to race it: ProtectedRoute saw the stale
  // pre-login "signed-out" status and bounced straight back to /login
  // even on a successful sign-in. "unlinked" also counts as settled —
  // ProtectedRoute renders the right message for that itself once we're
  // past /login.
  useEffect(() => {
    if (status === "signed-in" || status === "unlinked") {
      navigate("/dashboard", { replace: true });
    }
  }, [status, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(governmentId.trim(), password);
    } catch {
      /* error surfaced via useConductorAuth().error */
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <BrandLogo variant="lockup" tone="light" className="mb-5" />
        <h1 className="text-lg font-semibold text-slate-100">Conductor Login</h1>
        <p className="mt-1 text-sm text-slate-500">Enter your government ID and password.</p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <Input
            label="Government ID"
            placeholder="TN-MTC-8492"
            autoComplete="username"
            value={governmentId}
            onChange={(e) => setGovernmentId(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <Alert tone="danger" title="Login failed">{error}</Alert>}
          <Button type="submit" size="lg" isLoading={isLoading}>
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}
