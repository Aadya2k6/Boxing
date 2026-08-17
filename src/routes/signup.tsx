import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { CinematicLayout } from "@/components/auth/CinematicLayout";
import { CinematicCard } from "@/components/auth/CinematicCard";
import { CinematicInput } from "@/components/auth/CinematicInput";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — Boxos" }] }),
  component: SignupPage,
});

function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
      setTimeout(() => navigate({ to: "/onboarding" }), 2000);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <CinematicLayout>
        <CinematicCard>
          <div className="text-center py-6">
            <div className="size-20 mx-auto rounded-full bg-[#10B981]/10 border border-[#10B981]/20 grid place-items-center mb-6">
              <CheckCircle2 className="size-10 text-[#10B981]" strokeWidth={1.5} />
            </div>
            <h1 className="font-display font-bold text-3xl text-white tracking-tight">Account created!</h1>
            <p className="text-cinematic-secondary mt-4 leading-relaxed">
              Welcome to Boxos, {fullName.split(" ")[0]}. Preparing your athlete onboarding profile…
            </p>
          </div>
        </CinematicCard>
      </CinematicLayout>
    );
  }

  return (
    <CinematicLayout>
      {/* Atmospheric Lighting */}
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[1400px] h-[1400px] top-0 right-0 -translate-y-1/4 translate-x-1/4" />
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[800px] h-[800px] top-1/4 right-0 translate-x-1/3 opacity-70" style={{ animationDelay: '-3s' }} />
      
      <div className="atmosphere-base atmosphere-warm animate-ambient-drift w-[1200px] h-[1200px] bottom-0 right-0 translate-y-1/4 translate-x-1/4" style={{ animationDelay: '-6s' }} />
      <div className="atmosphere-base atmosphere-warm animate-ambient-drift w-[700px] h-[700px] bottom-1/4 right-0 translate-x-1/3 opacity-80" style={{ animationDelay: '-9s' }} />

      <div className="w-full flex flex-col items-center relative z-10">
        <CinematicCard>
          <div className="mb-8 text-center">
            <h1 className="font-display font-bold text-3xl text-white tracking-tight">Register as Athlete</h1>
            <p className="text-cinematic-secondary text-sm mt-2">
              Create your account to start onboarding
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-cinematic-red/10 border border-cinematic-red/20 mb-6">
              <AlertCircle className="size-5 text-cinematic-red shrink-0 mt-0.5" />
              <p className="text-sm text-cinematic-red font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-cinematic-primary mb-2">Full name</label>
              <CinematicInput
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Aarav Mehta"
              />
            </div>

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
              <label className="block text-xs font-semibold text-cinematic-primary mb-2">Password</label>
              <div className="relative">
                <CinematicInput
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
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
              {/* Password strength */}
              {passwordStrength && (
                <div className="flex gap-1.5 mt-3">
                  {(["weak", "medium", "strong"] as const).map((level, i) => (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full transition-all ${
                        (passwordStrength === "weak" && i === 0)
                          ? "bg-cinematic-red"
                          : (passwordStrength === "medium" && i <= 1)
                          ? "bg-[#F59E0B]"
                          : (passwordStrength === "strong" && i <= 2)
                          ? "bg-[#10B981]"
                          : "bg-white/10"
                      }`}
                    />
                  ))}
                  <span className="text-[11px] text-cinematic-secondary capitalize w-12 text-right">{passwordStrength}</span>
                </div>
              )}
            </div>

            {/* Terms */}
            <label className="flex items-start gap-3.5 cursor-pointer p-4 rounded-xl border border-cinematic-border bg-white/5 hover:bg-white/10 transition-all group mt-2">
              <span className={`size-5 rounded-md border-[1.5px] grid place-items-center mt-0.5 shrink-0 transition-all ${
                agreed ? "bg-cinematic-blue border-cinematic-blue" : "border-cinematic-secondary group-hover:border-cinematic-primary"
              }`}>
                {agreed && <CheckCircle2 className="size-3.5 text-white" strokeWidth={3} />}
              </span>
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="sr-only" />
              <span className="text-xs text-cinematic-secondary leading-relaxed">
                I agree to the{" "}
                <span className="text-cinematic-primary font-medium hover:underline">Terms of Service</span> and{" "}
                <span className="text-cinematic-primary font-medium hover:underline">Privacy Policy</span>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !email || !password || !fullName || !agreed}
              className="w-full flex items-center justify-center gap-2 bg-cinematic-red text-white py-3.5 rounded-xl text-sm font-bold hover:bg-cinematic-red-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-4"
            >
              {loading ? (
                <span className="size-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>Create account <ArrowRight className="size-4.5" /></>
              )}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-cinematic-secondary">
            Already have an account?{" "}
            <Link to="/login" className="text-cinematic-primary font-semibold hover:text-cinematic-blue transition-colors">
              Sign in
            </Link>
          </div>
        </CinematicCard>
      </div>
    </CinematicLayout>
  );
}
