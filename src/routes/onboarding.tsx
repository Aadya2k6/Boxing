import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Check, ChevronLeft, ChevronRight, Shield,
  CircleCheck, User, Users, Trophy, Heart, Phone,
  X, AlertCircle, Crosshair, Loader2
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/site/Logo";
import { CinematicLayout } from "@/components/auth/CinematicLayout";
import { CinematicCard } from "@/components/auth/CinematicCard";
import { CinematicWizardPanel } from "@/components/auth/CinematicWizardPanel";
import { CinematicInput } from "@/components/auth/CinematicInput";
import { CinematicMedia } from "@/components/auth/CinematicMedia";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Athlete Onboarding — Boxos" },
      { name: "description", content: "Complete your athlete profile in 6 steps." },
    ],
  }),
  component: OnboardingPage,
});

// ── Step definitions ──────────────────────────────────────────────────
const STEPS = [
  { key: "personal",   label: "Personal Details",      icon: User,       desc: "Basic info & contact" },
  { key: "guardian",   label: "Guardian Details",      icon: Users,      desc: "Required if under 18" },
  { key: "emergency",  label: "Emergency Contact",     icon: Phone,      desc: "In case of emergency" },
  { key: "medical",    label: "Medical History",       icon: Heart,      desc: "Health & conditions" },
  { key: "sports",     label: "Sports Profile",        icon: Crosshair,  desc: "Boxing stats & goals" },
];

// ── Form state type ───────────────────────────────────────────────────
type FormData = Record<string, any>;

// ── Validation logic ─────────────────────────────────────────────────
function validateStep(stepKey: string, data: FormData, user?: any): string | null {
  if (stepKey === "personal") {
    if (!data.fullName?.trim()) return "Full name is required.";
    if (!data.dob) return "Date of birth is required.";
    if (!data.gender) return "Gender is required.";
    if (!data.phone?.trim()) return "Phone number is required.";
    if (!data.email?.trim()) return "Email address is required.";
    if (!user && (!data.password || data.password.length < 8)) return "Password (minimum 8 characters) is required to create your account.";
    if (!data.city?.trim() || !data.state?.trim() || !data.country?.trim()) return "City, state, and country are required.";
  }
  if (stepKey === "guardian") {
    if (!data.gName?.trim()) return "Guardian full name is required.";
    if (!data.gRel) return "Relationship to participant is required.";
    if (!data.gPhone?.trim()) return "Guardian phone number is required.";
    if (!data.gConsent) return "Digital consent checkbox is compulsory.";
  }
  if (stepKey === "emergency") {
    if (!data.eName?.trim()) return "Emergency contact name is required.";
    if (!data.eRel?.trim()) return "Relationship to participant is required.";
    if (!data.ePhone?.trim()) return "Emergency contact phone number is required.";
  }
  if (stepKey === "medical") {
    if (!data.medicalHistory?.trim()) return "Medical history details are required (enter 'None' if applicable).";
  }
  if (stepKey === "sports") {
    if (!data.boxingStance) return "Boxing stance is required.";
    if (!data.weightKg) return "Weight is required.";
    if (!data.heightCm) return "Height is required.";
    if (!data.experienceLevel) return "Experience level is required.";
    if (!data.primaryGoal) return "Primary goal is required.";
  }
  return null;
}

// ── Main page ─────────────────────────────────────────────────────────
function OnboardingPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Restore draft from localStorage
  const DRAFT_KEY = `boxos_onboard_draft_${user?.id ?? "guest"}`;
  const [data, setData] = useState<FormData>(() => {
    if (typeof window === "undefined") return { nationality: "Indian", country: "India" };
    try {
      const saved = localStorage.getItem(`boxos_onboard_draft_${user?.id ?? "guest"}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { nationality: "Indian", country: "India" };
  });

  // Save draft on every change
  const set = useCallback((k: string, v: any) => {
    setData(d => {
      const next = { ...d, [k]: v };
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [DRAFT_KEY]);

  const age = useMemo(() => {
    if (!data.dob) return null;
    const d = new Date(data.dob);
    if (isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
  }, [data.dob]);

  const isMinor = age !== null && age < 18;

  const visibleSteps = useMemo(
    () => (age !== null && age >= 18 ? STEPS.filter(s => s.key !== "guardian") : STEPS),
    [age]
  );
  const current = visibleSteps[step];
  const totalSteps = visibleSteps.length;
  const progress = (step / (totalSteps - 1)) * 100;

  const [codeVerifiedInSession, setCodeVerifiedInSession] = useState<boolean>(false);

  // If the profile explicitly says NOT verified, clear any stale localStorage flag
  // so the gate always shows for unverified users (fixes bypass from old sessions)
  useEffect(() => {
    if (profile !== null && profile.academy_code_verified !== true) {
      try {
        localStorage.removeItem("boxos_code_verified");
        localStorage.removeItem("boxos_verified_code");
      } catch {}
      setCodeVerifiedInSession(false);
    }
  }, [profile]);

  // ── Submit to Supabase ──────────────────────────────────────────────
  async function submitProfile() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const formEmail = data.email?.trim().toLowerCase();
      const activeEmail = user?.email?.trim().toLowerCase();

      let currentUserId: string | null = null;
      let currentUserEmail: string | null = null;

      // If no active session OR if the onboarding form's email differs from active logged-in user:
      if (!user || (formEmail && activeEmail && formEmail !== activeEmail)) {
        const userEmail = formEmail;
        const userPassword = data.password?.trim() || "BoxosAthlete2026!";

        if (!userEmail) {
          throw new Error("Email address is required to create your account.");
        }

        // Clear active session to ensure no profile state overwrite happens
        await supabase.auth.signOut().catch(() => {});

        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: userEmail,
          password: userPassword,
          options: { data: { full_name: data.fullName } },
        });

        if (signUpErr) throw new Error(signUpErr.message);
        if (!signUpData.user) throw new Error("Could not create user account. Please check your email.");

        currentUserId = signUpData.user.id;
        currentUserEmail = userEmail;
      } else {
        currentUserId = user.id;
        currentUserEmail = activeEmail ?? formEmail;
      }

      const { error: profileErr } = await supabase
        .from("profiles")
        .upsert({
          id: currentUserId,
          role: profile?.role ?? "athlete",
          full_name: data.fullName,
          email: data.email || currentUserEmail || null,
          phone: data.phone || null,
          academy_id: profile?.academy_id ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });

      if (profileErr) throw new Error(profileErr.message);

      const { data: existingAthlete, error: existingAthleteErr } = await supabase
        .from("athlete_profiles")
        .select("academy_id")
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (existingAthleteErr && existingAthleteErr.code !== 'PGRST116') throw new Error(existingAthleteErr.message);

      const verificationStatus = "pending";

      const { data: ap, error: apErr } = await supabase
        .from("athlete_profiles")
        .upsert({
          user_id: currentUserId,
          academy_id: existingAthlete?.academy_id ?? null,
          full_name: data.fullName,
          date_of_birth: data.dob,
          gender: data.gender,
          phone: data.phone,
          mobile_number: data.phone || null,
          email: data.email,
          city: data.city || null,
          state: data.state || null,
          country: data.country || null,
          is_minor: isMinor,
          
          emergency_contact_name: data.eName || null,
          emergency_contact_relation: data.eRel || null,
          emergency_contact_phone: data.ePhone || null,
          
          medical_history_details: data.medicalHistory || null,
          current_medications: data.meds || null,
          allergies: data.allergy || null,
          health_insurance_provider: data.healthInsuranceProvider || null,

          boxing_stance: data.boxingStance || null,
          dominant_hand: data.dominantHand || null,
          reach_cm: data.reachCm ? parseFloat(data.reachCm) : null,
          weight_kg: data.weightKg ? parseFloat(data.weightKg) : null,
          height_cm: data.heightCm ? parseFloat(data.heightCm) : null,
          experience_level: data.experienceLevel || null,
          primary_goal: data.primaryGoal || null,
          fight_record: data.fightRecord || null,
          preferred_class_schedule: data.preferredClassSchedule || null,
          previous_club: data.previousClub || null,
          coach_name: data.coachName || null,
          
          verification_status: verificationStatus,
          onboarding_complete: true,
        }, { onConflict: "user_id" })
        .select("id")
        .single();

      if (apErr) throw new Error(apErr.message);
      const athleteProfileId = ap.id;

      // Run remaining updates & notifications in parallel to optimize submission speed
      const tasks: Promise<any>[] = [];

      // 1. Write guardian_details (if minor)
      if (isMinor && data.gName) {
        tasks.push(
          Promise.resolve(
            supabase.from("guardian_details").upsert({
              athlete_profile_id: athleteProfileId,
              guardian_name: data.gName,
              relationship: data.gRel,
              phone: data.gPhone,
              email: data.gEmail || null,
              consent_given: !!data.gConsent,
              consent_timestamp: data.gConsent ? new Date().toISOString() : null,
            }, { onConflict: "athlete_profile_id" })
          )
        );
      }

      // 2. Keep profiles in sync with final contact details
      tasks.push(
        Promise.resolve(
          supabase.from("profiles")
            .update({ full_name: data.fullName, phone: data.phone })
            .eq("id", currentUserId)
        )
      );

      // 3. Notify admins asynchronously
      tasks.push(
        (async () => {
          const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin");
          if (admins?.length) {
            await supabase.from("notifications").insert(
              admins.map((a: { id: string }) => ({
                recipient_id: a.id,
                type: "new_athlete_profile",
                title: "New athlete profile submitted",
                body: `${data.fullName} has completed onboarding and is pending review.`,
                related_entity_id: athleteProfileId,
                related_entity_type: "athlete_profile",
              }))
            );
          }
        })()
      );

      await Promise.all(tasks);

      // Clear draft & access code verification items
      try {
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem("boxos_code_verified");
        localStorage.removeItem("boxos_verified_code");
      } catch {}

      setDone(true);
      // Immediately redirect to the athlete dashboard
      navigate({ to: "/athlete" });
    } catch (err: any) {
      setSubmitError(err.message || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Auth guard — render loading state while checking session
  if (authLoading) return (
    <div className="min-h-screen theme-cinematic-dark bg-cinematic-base grid place-items-center">
      <span className="size-6 border-2 border-cinematic-red border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (done) return <SuccessScreen name={data.fullName || "Athlete"} />;

  // Academy Access Code Gate — verified if:
  // 1. Logged-in user's profile has academy_code_verified = true (persisted in DB), OR
  // 2. They entered a valid code in this exact session (codeVerifiedInSession set by handleVerify)
  // NOTE: localStorage alone cannot bypass the gate — the useEffect above clears stale flags
  //       when profile says unverified. For anonymous users (no profile), they must always verify.
  const isCodeVerified = profile?.academy_code_verified === true || codeVerifiedInSession;

  const deadlineDate = profile?.academy_code_deadline ? new Date(profile.academy_code_deadline) : null;
  const isDeadlinePassed = deadlineDate ? deadlineDate.getTime() < Date.now() : false;
  const daysRemaining = deadlineDate ? Math.max(0, Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 15;

  if (!isCodeVerified) {
    if (isDeadlinePassed) {
      return <AcademyCodeExpiredScreen deadline={profile?.academy_code_deadline} />;
    }
    return (
      <AcademyCodeVerificationScreen
        profile={profile}
        user={user}
        daysRemaining={daysRemaining}
        onVerified={() => setCodeVerifiedInSession(true)}
      />
    );
  }

  return (
    <CinematicLayout maxWidth="max-w-[900px]">
      {/* Atmospheric Lighting */}
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[1400px] h-[1400px] top-0 right-0 -translate-y-1/4 translate-x-1/4" />
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[800px] h-[800px] top-1/4 right-0 translate-x-1/3 opacity-70" style={{ animationDelay: '-3s' }} />
      <div className="atmosphere-base atmosphere-warm animate-ambient-drift w-[1000px] h-[1000px] top-1/3 right-0 translate-x-1/4 opacity-80" style={{ animationDelay: '-6s' }} />

      <CinematicMedia allowVideo={false} />
      
      <div className="w-full relative z-10 flex flex-col flex-1 justify-center py-8">
        {/* Global progress bar */}
        <div className="w-full px-6 lg:px-8 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-cinematic-primary tracking-wider uppercase">
              Step {step + 1} of {totalSteps}
            </span>
            <span className="text-xs text-cinematic-secondary">{current.label}</span>
          </div>
          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-cinematic-red transition-all duration-500 ease-out rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="w-full px-6 lg:px-8 flex flex-col lg:flex-row gap-6 lg:gap-8 mx-auto">
          {/* LEFT — step sidebar */}
          <div className="hidden lg:block w-40 xl:w-48 shrink-0">
            <StepSidebar steps={visibleSteps} current={step} onJump={(i) => i < step && setStep(i)} />
          </div>

          {/* RIGHT — form content */}
          <main className="flex-1 w-full min-w-0">
            <FormPanel
              current={current}
              step={step}
              totalSteps={totalSteps}
              data={data}
              set={set}
              user={user}
              onPrev={() => setStep(s => Math.max(0, s - 1))}
              onNext={() => {
                if (step < totalSteps - 1) setStep(s => s + 1);
                else submitProfile();
              }}
              isLast={step === totalSteps - 1}
              submitting={submitting}
              submitError={submitError}
            />
          </main>
        </div>
      </div>
    </CinematicLayout>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────
function StepSidebar({ steps, current, onJump }: { steps: typeof STEPS; current: number; onJump: (i: number) => void }) {
  return (
    <aside className="w-full">
      <div className="space-y-2">
        {steps.map((s, i) => {
          const state = i === current ? "active" : i < current ? "done" : "todo";
          return (
            <button
              key={s.key}
              onClick={() => onJump(i)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all text-left group ${
                state === "active" ? "bg-white/10 text-cinematic-primary font-bold" :
                state === "done" ? "hover:bg-white/5 cursor-pointer text-cinematic-primary opacity-80" :
                "text-cinematic-secondary cursor-default opacity-50"
              }`}
            >
              <span className={`size-8 rounded-lg grid place-items-center text-xs font-bold border shrink-0 transition-all ${
                state === "active" ? "border-cinematic-blue bg-cinematic-blue/20 text-cinematic-blue" :
                state === "done" ? "border-green-500/40 bg-green-500/10 text-green-500" :
                "border-white/10 bg-transparent text-white/50"
              }`}>
                {state === "done" ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
              </span>
              <div className="min-w-0">
                <div className="truncate">{s.label}</div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// ── FormPanel wrapper ─────────────────────────────────────────────────
function FormPanel({
  current, step, totalSteps, data, set, user, onPrev, onNext, isLast, submitting, submitError
}: {
  current: typeof STEPS[0]; step: number; totalSteps: number;
  data: FormData; set: (k: string, v: any) => void; user?: any;
  onPrev: () => void; onNext: () => void; isLast: boolean;
  submitting?: boolean; submitError?: string | null;
}) {
  const Icon = current.icon;
  const [valError, setValError] = useState<string | null>(null);

  // Clear step validation error when step changes
  useEffect(() => {
    setValError(null);
  }, [step]);

  function handleAttemptNext() {
    const err = validateStep(current.key, data, user);
    if (err) {
      setValError(err);
      return;
    }
    setValError(null);
    onNext();
  }

  return (
    <CinematicWizardPanel>
      {/* Section header */}
      <div className="px-5 md:px-8 py-6 border-b border-white/5 bg-black/20">
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-xl bg-cinematic-blue/10 border border-cinematic-blue/20 grid place-items-center shrink-0">
            <Icon className="size-5 text-cinematic-blue" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="font-display font-bold text-xl md:text-2xl text-cinematic-primary">{current.label}</h2>
            <p className="text-sm text-cinematic-secondary mt-1">{current.desc}</p>
          </div>
        </div>
      </div>

      {/* Form body */}
      <div className="px-5 md:px-8 py-6">
        {current.key === "personal"   && <PersonalStep   data={data} set={set} user={user} />}
        {current.key === "guardian"   && <GuardianStep   data={data} set={set} />}
        {current.key === "emergency"  && <EmergencyStep  data={data} set={set} />}
        {current.key === "medical"    && <MedicalStep    data={data} set={set} />}
        {current.key === "sports"     && <SportsStep     data={data} set={set} />}
      </div>

      {/* Step Validation error alert */}
      {valError && (
        <div className="mx-6 md:mx-10 mb-6 flex items-start gap-3 p-4 rounded-xl bg-cinematic-red/10 border border-cinematic-red/20">
          <AlertCircle className="size-5 text-cinematic-red shrink-0 mt-0.5" />
          <p className="text-sm text-cinematic-red font-medium leading-relaxed">{valError}</p>
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <div className="mx-6 md:mx-10 mb-6 flex items-start gap-3 p-4 rounded-xl bg-cinematic-red/10 border border-cinematic-red/20">
          <AlertCircle className="size-5 text-cinematic-red shrink-0 mt-0.5" />
          <p className="text-sm text-cinematic-red font-medium leading-relaxed">{submitError}</p>
        </div>
      )}

      {/* Navigation footer */}
      <div className="px-6 md:px-10 py-6 border-t border-white/5 bg-black/20 flex flex-col-reverse md:flex-row items-center justify-between gap-4">
        <button
          onClick={onPrev}
          disabled={step === 0 || submitting}
          className="w-full md:w-auto inline-flex items-center justify-center gap-2 text-sm font-medium px-6 py-3 border border-white/10 rounded-xl text-cinematic-primary hover:bg-white/5 disabled:opacity-30 transition-all"
        >
          <ChevronLeft className="size-4.5" /> Previous
        </button>
        
        {isLast ? (
          <button
            onClick={handleAttemptNext}
            disabled={submitting}
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 text-sm font-bold bg-cinematic-red text-white px-8 py-3 rounded-xl hover:bg-cinematic-red-hover disabled:opacity-50 transition-all shadow-xl"
          >
            {submitting ? (
              <><Loader2 className="size-4.5 animate-spin" /> Submitting…</>
            ) : (
              <>Submit profile <Check className="size-4.5" /></>
            )}
          </button>
        ) : (
          <button
            onClick={handleAttemptNext}
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 text-sm font-bold bg-cinematic-blue text-white px-8 py-3 rounded-xl hover:bg-blue-600 transition-all shadow-xl"
          >
            Continue <ChevronRight className="size-4.5" />
          </button>
        )}
      </div>
    </CinematicWizardPanel>
  );
}

// ── Shared form atoms ─────────────────────────────────────────────────

function Field({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-cinematic-primary mb-2">
        {label}
        {required && <span className="text-cinematic-blue font-bold">*</span>}
      </span>
      {children}
      {hint && !error && <span className="block text-xs text-cinematic-secondary/70 mt-2">{hint}</span>}
      {error && <span className="block text-xs text-cinematic-red mt-2">{error}</span>}
    </label>
  );
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className="w-full bg-[#0B0F17]/60 border border-[#ffffff1a] rounded-lg px-4 py-3 text-sm text-[#F8FAFC] focus:outline-none focus:border-cinematic-blue focus:ring-1 focus:ring-cinematic-blue transition-all appearance-none pr-10 cursor-pointer [&>option]:bg-[#0B0F17]"
      >
        {children}
      </select>
      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-cinematic-secondary"/>
        </svg>
      </div>
    </div>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      rows={props.rows || 3}
      className="w-full bg-[#0B0F17]/60 border border-[#ffffff1a] rounded-lg px-4 py-3 text-sm text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:border-cinematic-blue focus:ring-1 focus:ring-cinematic-blue transition-all resize-none"
    />
  );
}

function Checkbox({ label, checked, onChange, description, required }: {
  label: string; checked?: boolean; onChange?: (v: boolean) => void; description?: string; required?: boolean;
}) {
  return (
    <label className="flex items-start gap-4 cursor-pointer p-4 rounded-xl border border-white/10 hover:bg-white/5 hover:border-white/20 transition-all group mt-2">
      <span className={`size-5 rounded-md border-[1.5px] grid place-items-center mt-0.5 shrink-0 transition-all ${
        checked ? "bg-cinematic-blue border-cinematic-blue" : "border-cinematic-secondary/50 group-hover:border-cinematic-primary/70"
      }`}>
        {checked && <Check className="size-3.5 text-white" strokeWidth={3} />}
      </span>
      <input type="checkbox" checked={!!checked} onChange={e => onChange?.(e.target.checked)} className="sr-only" />
      <div>
        <span className="text-sm font-semibold text-cinematic-primary">
          {label} {required && <span className="text-cinematic-blue font-bold">*</span>}
        </span>
        {description && <p className="text-xs text-cinematic-secondary mt-1.5 leading-relaxed">{description}</p>}
      </div>
    </label>
  );
}

// ── Step components ───────────────────────────────────────────────────
function PersonalStep({ data, set, user }: { data: FormData; set: (k: string, v: any) => void; user?: any }) {
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Field label="Full name" required hint="As per government ID">
          <CinematicInput value={data.fullName || ""} onChange={e => set("fullName", e.target.value)} placeholder="Aarav Mehta" />
        </Field>
        <Field label="Date of birth" required>
          <CinematicInput type="date" value={data.dob || ""} onChange={e => set("dob", e.target.value)} />
        </Field>
        <Field label="Gender" required>
          <Select value={data.gender || ""} onChange={e => set("gender", e.target.value)}>
            <option value="">Select…</option>
            <option>Male</option><option>Female</option><option>Other</option>
          </Select>
        </Field>
        <Field label="Phone number" required hint="Primary contact number">
          <CinematicInput value={data.phone || ""} onChange={e => set("phone", e.target.value)} placeholder="+91 98765 43210" type="tel" />
        </Field>
        <Field label="Email address" required hint="Used to access your account">
          <CinematicInput type="email" value={data.email || ""} onChange={e => set("email", e.target.value)} placeholder="aarav@example.com" />
        </Field>
        {!user && (
          <Field label="Create password" required hint="Min 8 characters to secure your account">
            <CinematicInput type="password" value={data.password || ""} onChange={e => set("password", e.target.value)} placeholder="••••••••" />
          </Field>
        )}
      </div>
      <div className="grid md:grid-cols-3 gap-6 pt-2">
        <Field label="City" required>
          <CinematicInput value={data.city || ""} onChange={e => set("city", e.target.value)} placeholder="e.g. Mumbai" />
        </Field>
        <Field label="State" required>
          <CinematicInput value={data.state || ""} onChange={e => set("state", e.target.value)} placeholder="e.g. Maharashtra" />
        </Field>
        <Field label="Country" required>
          <CinematicInput value={data.country || ""} onChange={e => set("country", e.target.value)} placeholder="e.g. India" />
        </Field>
      </div>
    </div>
  );
}

function GuardianStep({ data, set }: { data: FormData; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 p-4 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20">
        <AlertCircle className="size-5 text-[#F59E0B] mt-0.5 shrink-0" />
        <p className="text-sm text-[#F59E0B] leading-relaxed">Required because the participant is under 18. Guardian must provide digital consent before submission.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Field label="Guardian full name" required>
          <CinematicInput value={data.gName || ""} onChange={e => set("gName", e.target.value)} placeholder="Guardian Name" />
        </Field>
        <Field label="Relationship to participant" required>
          <Select value={data.gRel || ""} onChange={e => set("gRel", e.target.value)}>
            <option value="">Select…</option>
            <option>Father</option><option>Mother</option><option>Legal Guardian</option><option>Other</option>
          </Select>
        </Field>
        <Field label="Guardian phone" required>
          <CinematicInput type="tel" value={data.gPhone || ""} onChange={e => set("gPhone", e.target.value)} placeholder="+91 98765 43210" />
        </Field>
        <Field label="Guardian email">
          <CinematicInput type="email" value={data.gEmail || ""} onChange={e => set("gEmail", e.target.value)} placeholder="guardian@example.com" />
        </Field>
      </div>
      <Checkbox
        label="I provide digital consent for my ward to enroll"
        description="I confirm I have read and agree to the academy policies and terms. This consent is recorded with timestamp."
        checked={data.gConsent}
        onChange={v => set("gConsent", v)}
        required
      />
    </div>
  );
}

function EmergencyStep({ data, set }: { data: FormData; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-6">
      {data.gName && (
        <button
          type="button"
          onClick={() => {
            set("eName", data.gName);
            set("eRel", data.gRel || "");
            set("ePhone", data.gPhone || "");
          }}
          className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-lg border border-cinematic-blue/30 bg-cinematic-blue/10 text-cinematic-blue hover:bg-cinematic-blue/20 transition-colors"
        >
          Copy from guardian details
        </button>
      )}
      <div className="grid md:grid-cols-2 gap-6">
        <Field label="Emergency contact name" required>
          <CinematicInput value={data.eName || ""} onChange={e => set("eName", e.target.value)} placeholder="Contact Name" />
        </Field>
        <Field label="Relationship" required>
          <CinematicInput value={data.eRel || ""} onChange={e => set("eRel", e.target.value)} placeholder="e.g. Spouse, Parent" />
        </Field>
        <Field label="Emergency phone" required>
          <CinematicInput type="tel" value={data.ePhone || ""} onChange={e => set("ePhone", e.target.value)} placeholder="+91 98765 43210" />
        </Field>
      </div>
    </div>
  );
}

function MedicalStep({ data, set }: { data: FormData; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-6">
      <Field label="Medical History Details" required hint="Please describe any history of concussions, heart conditions, joint injuries, asthma, or other relevant medical history. Enter 'None' if not applicable.">
        <Textarea value={data.medicalHistory || ""} onChange={e => set("medicalHistory", e.target.value)} placeholder="Describe your medical history..." rows={4} />
      </Field>
      <div className="grid md:grid-cols-2 gap-6 pt-2">
        <Field label="Current Medications" hint="List any ongoing medications (Optional)">
          <Textarea value={data.meds || ""} onChange={e => set("meds", e.target.value)} placeholder="e.g. None" rows={2} />
        </Field>
        <Field label="Severe Allergies" hint="Food, medication, environmental (Optional)">
          <Textarea value={data.allergy || ""} onChange={e => set("allergy", e.target.value)} placeholder="e.g. No known allergies" rows={2} />
        </Field>
        <Field label="Health Insurance Provider & Policy Number" hint="Optional">
          <CinematicInput value={data.healthInsuranceProvider || ""} onChange={e => set("healthInsuranceProvider", e.target.value)} placeholder="Provider - Policy #" />
        </Field>
      </div>
    </div>
  );
}

function SportsStep({ data, set }: { data: FormData; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Field label="Boxing Stance" required>
          <Select value={data.boxingStance || ""} onChange={e => set("boxingStance", e.target.value)}>
            <option value="">Select…</option>
            <option value="Orthodox">Orthodox</option>
            <option value="Southpaw">Southpaw</option>
            <option value="Switch Hitter">Switch Hitter</option>
          </Select>
        </Field>
        <Field label="Dominant Hand">
          <Select value={data.dominantHand || ""} onChange={e => set("dominantHand", e.target.value)}>
            <option value="">Select…</option>
            <option value="Right">Right</option>
            <option value="Left">Left</option>
            <option value="Ambidextrous">Ambidextrous</option>
          </Select>
        </Field>
        <Field label="Weight (kg)" required>
          <CinematicInput type="number" step="0.1" value={data.weightKg || ""} onChange={e => set("weightKg", e.target.value)} placeholder="e.g. 70.5" />
        </Field>
        <Field label="Height (cm)" required>
          <CinematicInput type="number" value={data.heightCm || ""} onChange={e => set("heightCm", e.target.value)} placeholder="e.g. 180" />
        </Field>
        <Field label="Reach (cm)" hint="Optional">
          <CinematicInput type="number" value={data.reachCm || ""} onChange={e => set("reachCm", e.target.value)} placeholder="e.g. 185" />
        </Field>
        <Field label="Experience Level" required>
          <Select value={data.experienceLevel || ""} onChange={e => set("experienceLevel", e.target.value)}>
            <option value="">Select…</option>
            <option value="Beginner">Beginner (No prior experience)</option>
            <option value="Intermediate">Intermediate (Pad work and heavy bag experience)</option>
            <option value="Advanced">Advanced (Sparring or competition experience)</option>
          </Select>
        </Field>
        <Field label="Primary Goal" required>
          <Select value={data.primaryGoal || ""} onChange={e => set("primaryGoal", e.target.value)}>
            <option value="">Select…</option>
            <option value="Fitness">General Fitness & Weight Loss</option>
            <option value="Skill">Technical Skill & Self-Defense</option>
            <option value="Competitive">Competitive Amateur Boxing</option>
          </Select>
        </Field>
        <Field label="Amateur / Fight Record" hint="Optional (Wins-Losses-Draws)">
          <CinematicInput value={data.fightRecord || ""} onChange={e => set("fightRecord", e.target.value)} placeholder="e.g. 3-1-0 or N/A" />
        </Field>
        <Field label="Previous/Current Club" hint="Optional">
          <CinematicInput value={data.previousClub || ""} onChange={e => set("previousClub", e.target.value)} placeholder="e.g. Kronk Gym" />
        </Field>
        <Field label="Coach Name" hint="Optional">
          <CinematicInput value={data.coachName || ""} onChange={e => set("coachName", e.target.value)} placeholder="Coach Name" />
        </Field>
        <Field label="Preferred Class Schedule & Time Slots" hint="Optional">
          <CinematicInput value={data.preferredClassSchedule || ""} onChange={e => set("preferredClassSchedule", e.target.value)} placeholder="e.g. Weekdays Evening, Weekends Morning" />
        </Field>
      </div>
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────
function SuccessScreen({ name }: { name: string }) {
  return (
    <CinematicLayout>
      {/* Atmospheric Lighting */}
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[1000px] h-[1000px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      
      <CinematicMedia allowVideo={false} />
      <CinematicCard>
        <div className="text-center py-6">
          <div className="size-20 mx-auto rounded-full bg-[#10B981]/10 border border-[#10B981]/20 grid place-items-center mb-6">
            <CircleCheck className="size-10 text-[#10B981]" strokeWidth={1.5} />
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#10B981] mb-2">Profile submitted</p>
          <h1 className="font-display font-bold text-3xl text-white tracking-tight">Welcome, {name.split(" ")[0]}.</h1>
          <p className="mt-4 text-cinematic-secondary leading-relaxed">
            Your profile has been auto-approved. Your dashboard is now unlocked — head over to set up your fee plan and access your academy.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Link to="/athlete" className="w-full inline-flex items-center justify-center gap-2 bg-cinematic-red text-white px-6 py-3.5 rounded-xl text-sm font-bold hover:bg-cinematic-red-hover transition-all shadow-xl">
              Go to dashboard
            </Link>
            <Link to="/" className="w-full inline-flex items-center justify-center gap-2 border border-white/10 px-6 py-3.5 rounded-xl text-sm font-medium hover:bg-white/5 transition-all text-cinematic-primary">
              Back home
            </Link>
          </div>
        </div>
      </CinematicCard>
    </CinematicLayout>
  );
}

// ── Mandatory Academy Access Code Gate Screen ───────────────────────
function AcademyCodeVerificationScreen({
  profile,
  user,
  daysRemaining,
  onVerified,
}: {
  profile: any;
  user: any;
  daysRemaining: number;
  onVerified: () => void;
}) {
  const { signOut } = useAuth();
  const [codeInput, setCodeInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!codeInput.trim() || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const codeClean = codeInput.trim().toUpperCase();

      // RLS blocks athletes from directly reading academy_codes.
      // The verify_academy_code SECURITY DEFINER RPC bypasses RLS and
      // returns { id, is_active, expires_at } if the code is valid, or null if not.
      const { data: rawCodeRow, error: codeErr } = await supabase
        .rpc("verify_academy_code", { p_code: codeClean })
        .maybeSingle();

      const codeRow = rawCodeRow as { id: string; is_active: boolean; expires_at: string | null } | null;

      if (codeErr || !codeRow) {
        setError("Invalid Academy Access Code. Please check with your academy administrator.");
        return;
      }

      if (!codeRow.is_active) {
        setError("This Academy Access Code is currently inactive. Please contact your administrator.");
        return;
      }

      if (codeRow.expires_at && new Date(codeRow.expires_at).getTime() < Date.now()) {
        setError("This Academy Access Code has expired. Please request a new code from your administrator.");
        return;
      }

      // Mark code as verified in localStorage for local session persistence
      try {
        localStorage.setItem("boxos_code_verified", "true");
        localStorage.setItem("boxos_verified_code", codeClean);
      } catch {}

      const userId = profile?.id || user?.id;
      if (userId) {
        const { data: currentP } = await supabase
          .from("profiles")
          .select("academy_code_verified")
          .eq("id", userId)
          .maybeSingle();

        const alreadyVerified = currentP?.academy_code_verified === true;

        if (!alreadyVerified) {
          // 1. Mark profile verified (athlete can UPDATE their own profile row)
          await supabase
            .from("profiles")
            .update({
              academy_code_verified: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", userId);

          // 2. Increment uses_count via SECURITY DEFINER RPC (athletes can't write academy_codes directly)
          // Non-critical — silently skip if RPC unavailable
          await supabase.rpc("increment_academy_code_uses", { p_code_id: codeRow.id }).then(
            () => {},
            () => {}
          );
        }
      }

      setVerifiedSuccess(true);
      setTimeout(() => {
        onVerified();
      }, 800);
    } catch (err: any) {
      setError(err.message || "Verification failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <CinematicLayout>
      {/* Atmospheric Lighting */}
      <div className="atmosphere-base atmosphere-red animate-ambient-drift w-[1000px] h-[1000px] top-1/2 right-0 -translate-y-1/2 translate-x-1/4" />

      <div className="w-full flex flex-col items-center relative z-10">
        <CinematicCard>
          <div className="text-center mb-8">
            <div className="size-14 mx-auto rounded-xl bg-cinematic-blue/10 border border-cinematic-blue/20 grid place-items-center mb-5 text-cinematic-blue shadow-lg">
              <Shield className="size-7" />
            </div>
            <h1 className="font-display font-bold text-3xl text-white tracking-tight">Enter Academy Access Code</h1>
            <p className="text-cinematic-secondary text-sm mt-3 max-w-[280px] mx-auto leading-relaxed">
              Required to complete your athlete onboarding profile.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20 mb-8 text-xs">
            <div className="flex items-center gap-2 text-[#F59E0B] font-medium">
              <span className="font-bold">⏰ 15-Day Window:</span>
              <span>{daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#F59E0B]/80 bg-[#F59E0B]/10 px-2 py-1 rounded-md self-start sm:self-auto">Required</span>
          </div>

          {verifiedSuccess ? (
            <div className="p-6 rounded-xl bg-[#10B981]/10 border border-[#10B981]/30 text-center text-[#10B981] space-y-2">
              <CircleCheck className="size-8 mx-auto" />
              <p className="font-bold text-base">Code Verified Successfully!</p>
              <p className="text-xs opacity-80">Unlocking athlete onboarding form…</p>
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-cinematic-primary mb-2 uppercase tracking-wider text-center">
                  Academy Access Code
                </label>
                <input
                  type="text"
                  required
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. BOXOS1"
                  className="w-full bg-[#050811]/80 border border-white/20 rounded-xl px-4 py-4 text-center text-xl font-mono font-bold uppercase tracking-widest text-white focus:outline-none focus:border-cinematic-blue focus:ring-2 focus:ring-cinematic-blue/30 placeholder:text-white/20 placeholder:font-sans placeholder:tracking-normal placeholder:text-base transition-all"
                />
              </div>

              {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-cinematic-red/10 border border-cinematic-red/20 text-sm text-cinematic-red font-medium">
                  <AlertCircle className="size-5 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={verifying || !codeInput.trim()}
                className="w-full flex items-center justify-center gap-2 bg-cinematic-red text-white py-4 rounded-xl text-sm font-bold hover:bg-cinematic-red-hover disabled:opacity-50 transition shadow-xl cursor-pointer"
              >
                {verifying ? (
                  <>
                    <Loader2 className="size-4.5 animate-spin" /> Verifying Code…
                  </>
                ) : (
                  <>Verify & Unlock Onboarding</>
                )}
              </button>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-white/5 flex flex-col items-center justify-center gap-3 text-sm text-cinematic-secondary">
            <span>Don't have a code? Ask your academy admin.</span>
            <button
              onClick={() => signOut()}
              className="text-cinematic-primary hover:text-cinematic-blue font-medium transition-colors"
            >
              Sign out
            </button>
          </div>
        </CinematicCard>
      </div>
    </CinematicLayout>
  );
}

// ── Expired timeline screen ──────────────────────────────────────────
function AcademyCodeExpiredScreen({ deadline }: { deadline?: string | null }) {
  const { signOut } = useAuth();
  return (
    <CinematicLayout>
      {/* Atmospheric Lighting */}
      <div className="atmosphere-base atmosphere-red animate-ambient-drift w-[1000px] h-[1000px] top-1/2 right-0 -translate-y-1/2 translate-x-1/4" />

      <div className="relative z-10 w-full flex flex-col items-center">
        <CinematicCard>
        <div className="text-center py-4">
          <div className="size-16 mx-auto rounded-full bg-cinematic-red/10 grid place-items-center mb-6 text-cinematic-red">
            <AlertCircle className="size-8" />
          </div>
          <h1 className="font-display font-bold text-2xl">Registration Window Expired</h1>
          <p className="text-cinematic-secondary text-sm mt-4 leading-relaxed">
            The 15-day timeline to verify your Academy Access Code has expired. Unverified accounts cannot proceed with onboarding.
          </p>
          <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10 text-xs text-cinematic-secondary font-medium">
            Deadline date: {deadline ? new Date(deadline).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "Expired"}
          </div>
          <div className="mt-8">
            <button
              onClick={() => signOut()}
              className="w-full py-3.5 bg-white text-black text-sm font-bold rounded-xl hover:bg-white/90 transition shadow-lg cursor-pointer"
            >
              Sign Out & Contact Administrator
            </button>
          </div>
        </div>
      </CinematicCard>
      </div>
    </CinematicLayout>
  );
}
