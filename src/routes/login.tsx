import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import { useAuth, getRedirectPath } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/site/Logo";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Boxos" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) { setError(error.message); return; }

      // Fetch profile to get role + onboarding status
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Login failed. Please try again."); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, academy_code_verified")
        .eq("id", user.id)
        .single();

      let onboardingComplete: boolean | undefined;
      if (profile?.role === "athlete") {
        const { data: ap } = await supabase
          .from("athlete_profiles")
          .select("onboarding_complete")
          .eq("user_id", user.id)
          .maybeSingle();
        onboardingComplete = ap?.onboarding_complete ?? false;
      }

      const dest = getRedirectPath(profile?.role ?? null, onboardingComplete);
      navigate({ to: dest });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-up">
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center mb-10 group">
          <Logo className="h-11 sm:h-12 w-auto" textSize="text-2xl" />
        </Link>

        <div className="bento-card p-8">
          <div className="mb-7">
            <h1 className="font-display font-bold text-2xl">Welcome back</h1>
            <p className="text-muted-foreground text-sm mt-1.5">Sign in to your Boxos account</p>
          </div>

          {error && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-destructive/8 border border-destructive/20 mb-5">
              <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="aarav@example.com"
                className="input-premium"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-foreground">Password</label>
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="input-premium pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full flex items-center justify-center gap-2 bg-[#ef4444] text-white py-3 rounded-xl text-sm font-semibold hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-card mt-2"
            >
              {loading ? (
                <span className="size-4 border-2 border-background/40 border-t-background rounded-full animate-spin" />
              ) : (
                <>Sign in <ArrowRight className="size-4" /></>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/onboarding" className="text-foreground font-semibold hover:text-primary-dark transition-colors">
              Register as athlete
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Admin & Superadmin accounts are created by invitation only.
        </p>
      </div>
    </div>
  );
}
