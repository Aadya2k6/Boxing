import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Crosshair, Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/site/Logo";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — Crickos" }] }),
  component: SignupPage,
});

function SignupPage() {
  const { signUp, signOut } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Automatically redirect any access to /signup directly to /onboarding
  useEffect(() => {
    navigate({ to: "/onboarding", replace: true });
  }, [navigate]);

  const passwordStrength = password.length >= 8
    ? password.match(/[A-Z]/) && password.match(/[0-9]/) ? "strong" : "medium"
    : password.length > 0 ? "weak" : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) { setError("Please accept the terms to continue."); return; }
    setError(null);
    setLoading(true);
    try {
      const { error } = await signUp(email, password, fullName);
      if (error) { setError(error.message); return; }
      setSuccess(true);
      // After a short delay navigate to onboarding
      setTimeout(() => navigate({ to: "/onboarding" }), 2500);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background grid place-items-center px-4">
        <div className="max-w-md text-center animate-fade-up">
          <div className="size-20 mx-auto rounded-full bg-success/10 grid place-items-center mb-6">
            <CheckCircle2 className="size-10 text-success" strokeWidth={1.5} />
          </div>
          <h1 className="font-display font-bold text-2xl">Account created!</h1>
          <p className="text-muted-foreground mt-3">
            Welcome to Crickos, {fullName.split(" ")[0]}. Redirecting you to onboarding…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-fade-up">
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center mb-10 group">
          <Logo className="h-11 sm:h-12 w-auto" textSize="text-2xl" />
        </Link>

        <div className="bento-card p-8">
          <div className="mb-7">
            <h1 className="font-display font-bold text-2xl">Register as athlete</h1>
            <p className="text-muted-foreground text-sm mt-1.5">
              Create your account to start onboarding
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-destructive/8 border border-destructive/20 mb-5">
              <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Aarav Mehta"
                className="input-premium"
              />
            </div>

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
              <label className="block text-xs font-semibold text-foreground mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
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
              {/* Password strength */}
              {passwordStrength && (
                <div className="flex gap-1.5 mt-2">
                  {(["weak", "medium", "strong"] as const).map((level, i) => (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full transition-all ${
                        (passwordStrength === "weak" && i === 0)
                          ? "bg-destructive"
                          : (passwordStrength === "medium" && i <= 1)
                          ? "bg-warning"
                          : (passwordStrength === "strong" && i <= 2)
                          ? "bg-success"
                          : "bg-border"
                      }`}
                    />
                  ))}
                  <span className="text-[11px] text-muted-foreground capitalize w-12">{passwordStrength}</span>
                </div>
              )}
            </div>

            {/* Terms */}
            <label className="flex items-start gap-3 cursor-pointer p-3.5 rounded-xl border border-border hover:bg-elevated transition-all group">
              <span className={`size-5 rounded-md border-2 grid place-items-center mt-0.5 shrink-0 transition-all ${
                agreed ? "bg-primary border-primary" : "border-border-strong"
              }`}>
                {agreed && <CheckCircle2 className="size-3 text-primary-foreground" strokeWidth={3} />}
              </span>
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="sr-only" />
              <span className="text-xs text-muted-foreground leading-relaxed">
                I agree to the{" "}
                <span className="text-foreground font-medium">Terms of Service</span> and{" "}
                <span className="text-foreground font-medium">Privacy Policy</span>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !email || !password || !fullName || !agreed}
              className="w-full flex items-center justify-center gap-2 bg-[#ef4444] text-white py-3 rounded-xl text-sm font-semibold hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-card mt-2"
            >
              {loading ? (
                <span className="size-4 border-2 border-background/40 border-t-background rounded-full animate-spin" />
              ) : (
                <>Create account <ArrowRight className="size-4" /></>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-foreground font-semibold hover:text-primary-dark transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
