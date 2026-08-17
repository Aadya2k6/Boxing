import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import { useAuth, getRedirectPath } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { CinematicLayout } from "@/components/auth/CinematicLayout";
import { CinematicCard } from "@/components/auth/CinematicCard";
import { CinematicInput } from "@/components/auth/CinematicInput";

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

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Login failed. Please try again."); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, academy_code_verified")
        .eq("id", user.id)
        .single();

      let onboardingComplete: boolean | undefined;
      if (profile?.role === "athlete") {
        const { data: bp } = await supabase
          .from("boxer_profiles")
          .select("onboarding_complete")
          .eq("user_id", user.id)
          .maybeSingle();
        onboardingComplete = bp?.onboarding_complete ?? false;
      }

      const dest = getRedirectPath(profile?.role ?? null, onboardingComplete);
      navigate({ to: dest });
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <CinematicLayout>
      {/* Atmospheric Lighting */}
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[1400px] h-[1400px] top-0 right-0 -translate-y-1/4 translate-x-1/4" />
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[1000px] h-[1000px] bottom-0 right-0 translate-y-1/4 translate-x-1/4" style={{ animationDelay: '-5s' }} />

      <div className="w-full flex flex-col items-center relative z-10">
        <CinematicCard>
          <div className="mb-8 text-center">
            <h1 className="font-display font-bold text-3xl text-white tracking-tight">Welcome Back</h1>
            <p className="text-cinematic-secondary text-sm mt-2">Sign in to access your dashboard</p>
          </div>

          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-cinematic-red/10 border border-cinematic-red/20 mb-6">
              <AlertCircle className="size-5 text-cinematic-red shrink-0 mt-0.5" />
              <p className="text-sm text-cinematic-red font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-cinematic-primary mb-2">Email address</label>
              <CinematicInput
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="aarav@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-cinematic-primary">Password</label>
                <button type="button" className="text-xs text-cinematic-secondary hover:text-cinematic-primary transition-colors">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <CinematicInput
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-cinematic-secondary hover:text-cinematic-primary transition-colors"
                >
                  {showPw ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full flex items-center justify-center gap-2 bg-cinematic-red text-white py-3.5 rounded-xl text-sm font-bold hover:bg-cinematic-red-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-4"
            >
              {loading ? (
                <span className="size-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>Sign in <ArrowRight className="size-4.5" /></>
              )}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-cinematic-secondary">
            Don't have an account?{" "}
            <Link to="/signup" className="text-cinematic-primary font-semibold hover:text-cinematic-blue transition-colors">
              Register as athlete
            </Link>
          </div>
        </CinematicCard>

        <p className="text-center text-xs text-cinematic-secondary mt-8 opacity-70">
          Admin & Superadmin accounts are created by invitation only.
        </p>
      </div>
    </CinematicLayout>
  );
}
