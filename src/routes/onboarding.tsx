import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Check, ChevronLeft, ChevronRight, Upload, Shield,
  CircleCheck, User, Users, Trophy, Hash, Heart, Phone,
  X, AlertCircle, Crosshair, Loader2
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/site/Logo";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Athlete Onboarding — Crickos" },
      { name: "description", content: "Complete your athlete profile in 7 steps." },
    ],
  }),
  component: OnboardingPage,
});

// ── Step definitions ──────────────────────────────────────────────────
const STEPS = [
  { key: "personal",   label: "Personal Details",      icon: User,    desc: "Basic info & contact" },
  { key: "guardian",   label: "Guardian Details",       icon: Users,   desc: "Required if under 18" },
  { key: "sport",      label: "Sport Profile",          icon: Trophy,  desc: "Discipline & training level" },
  { key: "federation", label: "Federation IDs",         icon: Hash,    desc: "Optional registration IDs" },
  { key: "medical",    label: "Medical & Fitness",      icon: Heart,   desc: "Health declaration" },
  { key: "emergency",  label: "Emergency Contact",      icon: Phone,   desc: "In case of emergency" },
];

// ── Form state type ───────────────────────────────────────────────────
type FormData = Record<string, any>;

// ── Validation logic ─────────────────────────────────────────────────
function validateStep(stepKey: string, data: FormData, user?: any): string | null {
  if (stepKey === "personal") {
    if (!data.fullName?.trim()) return "Full name is required.";
    if (!data.dob) return "Date of birth is required.";
    if (!data.gender) return "Gender is required.";
    if (!data.nationality?.trim()) return "Nationality is required.";
    if (!data.phone?.trim()) return "Phone number is required.";
    if (!data.email?.trim()) return "Email address is required.";
    if (!user && (!data.password || data.password.length < 8)) return "Password (minimum 8 characters) is required to create your account.";
    if (!data.city?.trim()) return "City is required.";
    if (!data.state?.trim()) return "State is required.";
    if (!data.country?.trim()) return "Country is required.";
  }
  if (stepKey === "guardian") {
    if (!data.gName?.trim()) return "Guardian full name is required.";
    if (!data.gRel) return "Relationship to athlete is required.";
    if (!data.gPhone?.trim()) return "Guardian phone number is required.";
    if (!data.gConsent) return "Digital consent checkbox is compulsory.";
  }
  if (stepKey === "sport") {
    if (!data.playingRole) return "Playing role is required.";
    if (!data.compLevel) return "Competition level is required.";
    if (!data.year) return "Training year is required.";
    if (data.yrs === undefined || data.yrs === null || String(data.yrs).trim() === "") return "Years in sport is required.";
    if (!data.battingStyle) return "Batting style is required.";
    if (!data.bowlingArm) return "Bowling arm is required.";
  }
  if (stepKey === "medical") {
    if (!data.blood) return "Blood group is required.";
    if (!data.fit) return "Medical fitness declaration checkbox is compulsory.";
  }
  if (stepKey === "emergency") {
    if (!data.eName?.trim()) return "Emergency contact name is required.";
    if (!data.eRel?.trim()) return "Relationship to athlete is required.";
    if (!data.ePhone?.trim()) return "Emergency contact phone number is required.";
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
  const DRAFT_KEY = `crickos_onboard_draft_${user?.id ?? "guest"}`;
  const [data, setData] = useState<FormData>(() => {
    if (typeof window === "undefined") return { nationality: "Indian", country: "India" };
    try {
      const saved = localStorage.getItem(`crickos_onboard_draft_${user?.id ?? "guest"}`);
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
        const userPassword = data.password?.trim() || "CrickosAthlete2026!";

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

      if (existingAthleteErr) throw new Error(existingAthleteErr.message);

      const profilePhotoUrl: string | null = null;
      const aadhaarUrl: string | null = null;
      const verificationStatus = "pending";

      const { data: ap, error: apErr } = await supabase
        .from("athlete_profiles")
        .upsert({
          user_id: currentUserId,
          academy_id: existingAthlete?.academy_id ?? null,
          full_name: data.fullName,
          date_of_birth: data.dob,
          gender: data.gender,
          nationality: data.nationality,
          profile_photo_url: profilePhotoUrl,
          phone: data.phone,
          mobile_number: data.phone || null,
          email: data.email,
          city: data.city,
          state: data.state,
          country: data.country,
          blood_group: data.blood,
          is_minor: isMinor,
          sport: "Cricket",
          playing_role: data.playingRole || null,
          batting_style: data.battingStyle || null,
          bowling_type: data.bowlingType || null,
          bowling_arm: data.bowlingArm || null,
          preferred_format: data.formatPref || null,
          primary_discipline: data.playingRole || null,
          secondary_discipline: data.bowlingType || null,
          training_year: data.year || null,
          years_in_sport: data.yrs ? parseInt(data.yrs) : null,
          current_academy: null,
          current_coach: data.coach || null,
          dominant_hand: data.battingStyle || null,
          competition_level: data.compLevel || null,
          preferred_academy_id: data.preferredAcademyId || null,
          national_federation_id: data.fed || null,
          state_association_id: data.stateId || null,
          if_id: data.ifId || null,
          emergency_contact_name: data.eName || null,
          emergency_contact_relation: data.eRel || null,
          emergency_contact_phone: data.ePhone || null,
          primary_physician_details: data.docName ? `${data.docName}${data.docPhone ? ' · ' + data.docPhone : ''}` : null,
          fitness_declaration: !!data.fit,
          physical_conditions: data.cond || null,
          current_medications: data.meds || null,
          allergies: data.allergy || null,
          medical_fitness_declared: !!data.fit,
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
        localStorage.removeItem("crickos_code_verified");
        localStorage.removeItem("crickos_verified_code");
      } catch {}

      setDone(true);
    } catch (err: any) {
      setSubmitError(err.message || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Auth guard — render loading state while checking session
  if (authLoading) return (
    <div className="min-h-screen bg-background grid place-items-center">
      <span className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (done) return <SuccessScreen name={data.fullName || "Athlete"} />;

  const [codeVerifiedInSession, setCodeVerifiedInSession] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("crickos_code_verified") === "true";
  });

  // ── Mandatory Academy Access Code Gate Check ───────────────────────
  // Ensures ONLY athletes with a valid, active Academy Code can access the 6 onboarding steps.
  // Existing real users (already onboarding_complete or admins) remain 100% unaffected.
  const isCodeVerified =
    codeVerifiedInSession ||
    profile?.academy_code_verified === true ||
    profile?.onboarding_complete === true ||
    profile?.role === "admin" ||
    profile?.role === "superadmin";

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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-border px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center group">
          <Logo className="h-9 sm:h-10 w-auto" textSize="text-xl" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Step {step + 1} of {totalSteps}
          </span>
          <Link to="/" className="size-8 rounded-md border border-border grid place-items-center hover:bg-subtle transition">
            <X className="size-3.5" />
          </Link>
        </div>
      </header>

      {/* Global progress bar */}
      <div className="h-0.5 bg-border">
        <div
          className="h-full bg-gradient-to-r from-primary-dark to-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 grid lg:grid-cols-12 gap-8">
        {/* LEFT — step sidebar */}
        <StepSidebar steps={visibleSteps} current={step} onJump={(i) => i < step && setStep(i)} />

        {/* RIGHT — form content */}
        <main className="lg:col-span-9">
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
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────
function StepSidebar({ steps, current, onJump }: { steps: typeof STEPS; current: number; onJump: (i: number) => void }) {
  return (
    <aside className="lg:col-span-3 hidden lg:block">
      <div className="sticky top-28 space-y-1">
        <p className="label-micro px-3 mb-4">Progress</p>
        {steps.map((s, i) => {
          const state = i === current ? "active" : i < current ? "done" : "todo";
          return (
            <button
              key={s.key}
              onClick={() => onJump(i)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all text-left group ${
                state === "active" ? "bg-primary/8 text-primary-dark font-semibold" :
                state === "done" ? "hover:bg-elevated cursor-pointer text-foreground" :
                "text-muted-foreground cursor-default"
              }`}
            >
              <span className={`size-8 rounded-lg grid place-items-center text-xs font-bold border shrink-0 transition-all ${
                state === "active" ? "border-primary bg-primary text-primary-foreground shadow-glow" :
                state === "done" ? "border-success/40 bg-success/8 text-success" :
                "border-border bg-surface text-muted-foreground"
              }`}>
                {state === "done" ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
              </span>
              <div className="min-w-0">
                <div className="truncate">{s.label}</div>
                {state === "active" && (
                  <div className="text-[11px] text-muted-foreground font-normal mt-0.5 truncate">{s.desc}</div>
                )}
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
    <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
      {/* Section header */}
      <div className="px-8 py-6 border-b border-border bg-subtle/40">
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-xl bg-primary/10 grid place-items-center">
            <Icon className="size-5 text-primary-dark" strokeWidth={1.75} />
          </div>
          <div>
            <div className="label-micro text-primary-dark">Section {step + 1} of {totalSteps}</div>
            <h2 className="font-display font-bold text-xl mt-0.5">{current.label}</h2>
          </div>
        </div>
      </div>

      {/* Form body */}
      <div className="px-8 py-8">
        {current.key === "personal"   && <PersonalStep   data={data} set={set} user={user} />}
        {current.key === "guardian"   && <GuardianStep   data={data} set={set} />}
        {current.key === "sport"      && <SportStep      data={data} set={set} />}
        {current.key === "federation" && <FederationStep data={data} set={set} />}
        {current.key === "medical"    && <MedicalStep    data={data} set={set} />}
        {current.key === "emergency"  && <EmergencyStep  data={data} set={set} />}
      </div>

      {/* Step Validation error alert */}
      {valError && (
        <div className="mx-8 mb-4 flex items-start gap-3 p-3.5 rounded-xl bg-destructive/8 border border-destructive/20">
          <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive font-medium">{valError}</p>
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <div className="mx-8 mb-4 flex items-start gap-3 p-3.5 rounded-xl bg-destructive/8 border border-destructive/20">
          <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{submitError}</p>
        </div>
      )}

      {/* Navigation footer */}
      <div className="px-8 py-5 border-t border-border flex items-center justify-between bg-subtle/30">
        <button
          onClick={onPrev}
          disabled={step === 0 || submitting}
          className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5 border border-border rounded-lg hover:bg-elevated disabled:opacity-35 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft className="size-4" /> Previous
        </button>
        <div className="hidden md:flex gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${
              i === step ? "w-6 bg-primary" : i < step ? "w-3 bg-primary/40" : "w-3 bg-border"
            }`} />
          ))}
        </div>
        {isLast ? (
          <button
            onClick={handleAttemptNext}
            disabled={submitting}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-[#ef4444] text-white px-6 py-2.5 rounded-lg hover:bg-[#dc2626] disabled:opacity-60 transition-all shadow-card"
          >
            {submitting ? (
              <><Loader2 className="size-4 animate-spin" /> Submitting…</>
            ) : (
              <>Submit profile <Check className="size-4" /></>
            )}
          </button>
        ) : (
          <button
            onClick={handleAttemptNext}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-primary text-primary-foreground px-6 py-2.5 rounded-lg hover:bg-primary-light transition-all shadow-glow"
          >
            Continue <ChevronRight className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Shared form atoms ─────────────────────────────────────────────────

function Field({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground mb-1.5">
        {label}
        {required && <span className="text-primary font-bold">*</span>}
      </span>
      {children}
      {hint && !error && <span className="block text-[11px] text-muted-foreground mt-1.5">{hint}</span>}
      {error && <span className="block text-[11px] text-destructive mt-1.5">{error}</span>}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`input-premium ${className}`}
    />
  );
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className="input-premium appearance-none pr-9 cursor-pointer"
      >
        {children}
      </select>
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"/>
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
      className="input-premium resize-none"
    />
  );
}

function Checkbox({ label, checked, onChange, description, required }: {
  label: string; checked?: boolean; onChange?: (v: boolean) => void; description?: string; required?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl border border-border hover:bg-elevated hover:border-border-strong transition-all group">
      <span className={`size-5 rounded-md border-2 grid place-items-center mt-0.5 shrink-0 transition-all ${
        checked ? "bg-primary border-primary shadow-glow" : "border-border-strong group-hover:border-primary/50"
      }`}>
        {checked && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
      </span>
      <input type="checkbox" checked={!!checked} onChange={e => onChange?.(e.target.checked)} className="sr-only" />
      <div>
        <span className="text-sm font-medium">
          {label} {required && <span className="text-primary font-bold">*</span>}
        </span>
        {description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>}
      </div>
    </label>
  );
}

// ── Step components ───────────────────────────────────────────────────
function PersonalStep({ data, set, user }: { data: FormData; set: (k: string, v: any) => void; user?: any }) {
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-5">
        <Field label="Full name" required hint="As per government ID">
          <Input value={data.fullName || ""} onChange={e => set("fullName", e.target.value)} placeholder="Aarav Mehta" />
        </Field>
        <Field label="Date of birth" required>
          <Input type="date" value={data.dob || ""} onChange={e => set("dob", e.target.value)} />
        </Field>
        <Field label="Gender" required>
          <Select value={data.gender || ""} onChange={e => set("gender", e.target.value)}>
            <option value="">Select…</option>
            <option>Male</option><option>Female</option><option>Other</option>
          </Select>
        </Field>
        <Field label="Nationality" required>
          <Input value={data.nationality || ""} onChange={e => set("nationality", e.target.value)} />
        </Field>
        <Field label="Phone number" required hint="Indian format: +91 XXXXX XXXXX">
          <Input value={data.phone || ""} onChange={e => set("phone", e.target.value)} placeholder="+91 98765 43210" type="tel" />
        </Field>
        <Field label="Email address" required hint="Used to access your account">
          <Input type="email" value={data.email || ""} onChange={e => set("email", e.target.value)} placeholder="aarav@example.com" />
        </Field>
        {!user && (
          <Field label="Create password" required hint="Min 8 characters to secure your account">
            <Input type="password" value={data.password || ""} onChange={e => set("password", e.target.value)} placeholder="••••••••" />
          </Field>
        )}
        <Field label="City" required>
          <Input value={data.city || ""} onChange={e => set("city", e.target.value)} placeholder="New Delhi" />
        </Field>
        <Field label="State" required>
          <Input value={data.state || ""} onChange={e => set("state", e.target.value)} placeholder="Delhi" />
        </Field>
        <Field label="Country" required>
          <Input value={data.country || ""} onChange={e => set("country", e.target.value)} />
        </Field>
      </div>
    </div>
  );
}

function GuardianStep({ data, set }: { data: FormData; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/6 border border-warning/20">
        <AlertCircle className="size-4 text-warning mt-0.5 shrink-0" />
        <p className="text-sm text-warning">Required because the athlete is under 18. Guardian must provide digital consent before submission.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <Field label="Guardian full name" required>
          <Input value={data.gName || ""} onChange={e => set("gName", e.target.value)} placeholder="Ramesh Mehta" />
        </Field>
        <Field label="Relationship to athlete" required>
          <Select value={data.gRel || ""} onChange={e => set("gRel", e.target.value)}>
            <option value="">Select…</option>
            <option>Father</option><option>Mother</option><option>Legal Guardian</option><option>Other</option>
          </Select>
        </Field>
        <Field label="Guardian phone" required>
          <Input type="tel" value={data.gPhone || ""} onChange={e => set("gPhone", e.target.value)} placeholder="+91 98765 43210" />
        </Field>
        <Field label="Guardian email">
          <Input type="email" value={data.gEmail || ""} onChange={e => set("gEmail", e.target.value)} placeholder="ramesh@example.com" />
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

function SportStep({ data, set }: { data: FormData; set: (k: string, v: any) => void }) {
  const [academies, setAcademies] = useState<any[]>([]);
  const [acadLoading, setAcadLoading] = useState(true);

  useEffect(() => {
    async function fetchAcademies() {
      try {
        const { data: d } = await supabase
          .from("academies")
          .select("id, name, city, state")
          .eq("is_active", true)
          .order("name");
        setAcademies(d || []);
      } catch (err) {
        console.error("Error fetching academies:", err);
      } finally {
        setAcadLoading(false);
      }
    }
    fetchAcademies();
  }, []);

  return (
    <div className="space-y-6">
      {/* Cricket discipline */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4 pb-2 border-b border-border">Cricket Profile</h3>
        <div className="grid md:grid-cols-2 gap-5">
          <Field label="Playing role" required hint="Select your primary playing role">
            <Select value={data.playingRole || ""} onChange={e => set("playingRole", e.target.value)}>
              <option value="">Select…</option>
              <option>Batsman</option><option>Bowler</option>
              <option>All-rounder</option><option>Wicketkeeper-Batsman</option>
            </Select>
          </Field>
          <Field label="Competition level" required>
            <Select value={data.compLevel || ""} onChange={e => set("compLevel", e.target.value)}>
              <option value="">Select…</option>
              <option>Beginner</option><option>Club / Local</option>
              <option>District</option><option>State</option>
              <option>National</option><option>International</option>
            </Select>
          </Field>
          <Field label="Training year" required>
            <Select value={data.year || ""} onChange={e => set("year", e.target.value)}>
              <option value="">Select…</option>
              <option>Year 1 (Foundation)</option><option>Year 2 (Development)</option>
              <option>Year 3 (Advanced)</option><option>Year 4+ (Elite)</option>
            </Select>
          </Field>
          <Field label="Years in sport" required>
            <Input type="number" min={0} max={30} value={data.yrs ?? ""} onChange={e => set("yrs", e.target.value)} placeholder="3" />
          </Field>
        </div>
      </div>

      {/* Batting & bowling style */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4 pb-2 border-b border-border">Batting & Bowling</h3>
        <div className="grid md:grid-cols-2 gap-5">
          <Field label="Batting style" required>
            <Select value={data.battingStyle || ""} onChange={e => set("battingStyle", e.target.value)}>
              <option value="">Select…</option>
              <option>Right-hand Bat</option><option>Left-hand Bat</option>
            </Select>
          </Field>
          <Field label="Bowling arm" required>
            <Select value={data.bowlingArm || ""} onChange={e => set("bowlingArm", e.target.value)}>
              <option value="">Select…</option>
              <option>Right-arm</option><option>Left-arm</option>
            </Select>
          </Field>
          <Field label="Bowling type" hint="Select if you bowl regularly">
            <Select value={data.bowlingType || ""} onChange={e => set("bowlingType", e.target.value)}>
              <option value="">Select…</option>
              <option>Fast</option><option>Fast-Medium</option>
              <option>Medium</option><option>Medium-Fast</option>
              <option>Off Spin</option><option>Leg Spin</option>
              <option>Left-arm Orthodox</option><option>Left-arm Chinaman</option>
              <option>Does not bowl</option>
            </Select>
          </Field>
          <Field label="Cricket format preference" hint="Primary format you play">
            <Select value={data.formatPref || ""} onChange={e => set("formatPref", e.target.value)}>
              <option value="">Select…</option>
              <option>Test / Multi-day</option><option>One-Day (50 overs)</option>
              <option>T20</option><option>All Formats</option>
            </Select>
          </Field>
        </div>
      </div>

      {/* Academy & coach */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4 pb-2 border-b border-border">Academy & Coach</h3>
        <div className="grid md:grid-cols-2 gap-5">
          <Field label="Preferred academy location" hint="Select the ground / academy you will train at">
            {acadLoading ? (
              <div className="input-premium flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-3.5 animate-spin" /> Loading academies…
              </div>
            ) : academies.length === 0 ? (
              <div className="input-premium text-sm text-muted-foreground flex items-center gap-2">
                <AlertCircle className="size-3.5 shrink-0" />
                No academies configured yet — admin will assign you one.
              </div>
            ) : (
              <Select value={data.preferredAcademyId || ""} onChange={e => set("preferredAcademyId", e.target.value)}>
                <option value="">Select…</option>
                {academies.map(a => (
                  <option key={a.id} value={a.id}>{a.name}{a.city ? ` — ${a.city}` : ""}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Current coach">
            <Input value={data.coach || ""} onChange={e => set("coach", e.target.value)} placeholder="Coach name" />
          </Field>
        </div>
      </div>
    </div>
  );
}

function FederationStep({ data, set }: { data: FormData; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-info/6 border border-info/20">
        <AlertCircle className="size-4 text-info mt-0.5 shrink-0" />
        <p className="text-sm text-info">All fields in this section are optional — add what you have. These can be updated later from your profile.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <Field label="BCCI registration ID" hint="Board of Control for Cricket in India">
          <Input value={data.fed || ""} onChange={e => set("fed", e.target.value)} placeholder="BCCI-XXXX" className="font-mono" />
        </Field>
        <Field label="State cricket association ID" hint="e.g. DDCA, MCA, TNCA">
          <Input value={data.stateId || ""} onChange={e => set("stateId", e.target.value)} placeholder="SCA-XXXX" className="font-mono" />
        </Field>
        <Field label="ICC ID" hint="International Cricket Council player ID">
          <Input value={data.ifId || ""} onChange={e => set("ifId", e.target.value)} placeholder="ICC-XXXX" className="font-mono" />
        </Field>
      </div>
    </div>
  );
}

function MedicalStep({ data, set }: { data: FormData; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-5">
      <div className="grid md:grid-cols-2 gap-5">
        <Field label="Blood group" required>
          <Select value={data.blood || ""} onChange={e => set("blood", e.target.value)}>
            <option value="">Select…</option>
            {["A+","A-","B+","B-","O+","O-","AB+","AB-"].map(b => <option key={b}>{b}</option>)}
          </Select>
        </Field>
        <div />
        <Field label="Known physical conditions" hint="Any condition relevant to training">
          <Textarea value={data.cond || ""} onChange={e => set("cond", e.target.value)} placeholder="e.g. Mild asthma, knee injury (healed)" />
        </Field>
        <Field label="Current medications" hint="List any ongoing medications">
          <Textarea value={data.meds || ""} onChange={e => set("meds", e.target.value)} placeholder="e.g. None" />
        </Field>
        <Field label="Allergies" hint="Food, medication, environmental">
          <Textarea value={data.allergy || ""} onChange={e => set("allergy", e.target.value)} placeholder="e.g. No known allergies" />
        </Field>
      </div>
      <Checkbox
        label="I declare that I am medically fit to train"
        description="I confirm I have disclosed all relevant medical conditions and am fit to participate in the training program at this academy."
        checked={data.fit}
        onChange={v => set("fit", v)}
        required
      />
    </div>
  );
}

function EmergencyStep({ data, set }: { data: FormData; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-5">
      {data.gName && (
        <button
          type="button"
          onClick={() => {
            set("eName", data.gName);
            set("eRel", data.gRel || "");
            set("ePhone", data.gPhone || "");
          }}
          className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border border-info/30 bg-info/6 text-info hover:bg-info/10 transition-colors"
        >
          Copy from guardian details
        </button>
      )}
      <div className="grid md:grid-cols-2 gap-5">
        <Field label="Emergency contact name" required>
          <Input value={data.eName || ""} onChange={e => set("eName", e.target.value)} placeholder="Ramesh Mehta" />
        </Field>
        <Field label="Relationship to athlete" required>
          <Input value={data.eRel || ""} onChange={e => set("eRel", e.target.value)} placeholder="Father" />
        </Field>
        <Field label="Emergency contact phone" required>
          <Input type="tel" value={data.ePhone || ""} onChange={e => set("ePhone", e.target.value)} placeholder="+91 98765 43210" />
        </Field>
        <div />
        <Field label="Physician / doctor name" hint="Optional">
          <Input value={data.docName || ""} onChange={e => set("docName", e.target.value)} placeholder="Dr. Sharma" />
        </Field>
        <Field label="Physician contact" hint="Optional">
          <Input type="tel" value={data.docPhone || ""} onChange={e => set("docPhone", e.target.value)} placeholder="+91 98765 43210" />
        </Field>
      </div>
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────
function SuccessScreen({ name }: { name: string }) {
  return (
    <div className="min-h-screen bg-background grid place-items-center px-6">
      <div className="max-w-lg text-center animate-fade-up">
        <div className="size-24 mx-auto rounded-full bg-success/10 grid place-items-center mb-8">
          <CircleCheck className="size-12 text-success" strokeWidth={1.5} />
        </div>
        <div className="label-micro text-success mb-4">Profile submitted</div>
        <h1 className="text-h1 font-display">Welcome, {name.split(" ")[0]}.</h1>
        <p className="mt-5 text-muted-foreground leading-relaxed">
          Your profile has been auto-approved. Your dashboard is now unlocked — head over to set up your fee plan and access your academy.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Link to="/athlete" className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-[#dc2626] transition-all shadow-card">
            Go to dashboard
          </Link>
          <Link to="/" className="inline-flex items-center gap-2 border border-border px-6 py-3 rounded-xl text-sm font-medium hover:bg-subtle transition-all">
            Back home
          </Link>
        </div>
      </div>
    </div>
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
        localStorage.setItem("crickos_code_verified", "true");
        localStorage.setItem("crickos_verified_code", codeClean);
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
    <div className="min-h-screen bg-background flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-lg animate-fade-up">
        {/* Header Branding */}
        <Link to="/" className="flex items-center justify-center mb-8 group">
          <Logo className="h-11 sm:h-12 w-auto" textSize="text-2xl" />
        </Link>

        <div className="bg-surface border border-border rounded-2xl shadow-card p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary-dark via-primary to-primary-light" />

          <div className="text-center mb-6">
            <div className="size-14 mx-auto rounded-2xl bg-primary/10 border border-primary/20 grid place-items-center mb-4 text-primary-dark shadow-xs">
              <Shield className="size-7" />
            </div>
            <h1 className="font-display font-bold text-2xl">Enter Academy Access Code</h1>
            <p className="text-muted-foreground text-sm mt-2 max-w-md mx-auto leading-relaxed">
              An <strong>Academy Access Code</strong> provided by your academy administrator is required before you can complete your athlete onboarding profile.
            </p>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl bg-warning/8 border border-warning/20 mb-6 text-xs">
            <div className="flex items-center gap-2 text-warning font-medium">
              <span className="font-bold">⏰ 15-Day Window:</span>
              <span>{daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining to verify code</span>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Required</span>
          </div>

          {verifiedSuccess ? (
            <div className="p-6 rounded-xl bg-success/10 border border-success/30 text-center text-success space-y-2">
              <CircleCheck className="size-8 mx-auto" />
              <p className="font-bold text-base">Code Verified Successfully!</p>
              <p className="text-xs text-muted-foreground">Unlocking athlete onboarding form…</p>
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                  Academy Access Code *
                </label>
                <input
                  type="text"
                  required
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. CRICKOS1"
                  className="w-full bg-elevated border border-border rounded-xl px-4 py-3.5 text-center text-lg font-mono font-bold uppercase tracking-widest text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:tracking-normal placeholder:text-sm"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={verifying || !codeInput.trim()}
                className="w-full flex items-center justify-center gap-2 bg-[#ef4444] text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-[#dc2626] disabled:opacity-50 transition shadow-card cursor-pointer"
              >
                {verifying ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Verifying Code…
                  </>
                ) : (
                  <>Verify & Unlock Onboarding</>
                )}
              </button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Don't have a code? Ask your academy admin.</span>
            <button
              onClick={() => signOut()}
              className="text-foreground hover:underline font-medium cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Expired timeline screen ──────────────────────────────────────────
function AcademyCodeExpiredScreen({ deadline }: { deadline?: string | null }) {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-up text-center">
        <div className="size-16 mx-auto rounded-full bg-destructive/10 grid place-items-center mb-5 text-destructive">
          <AlertCircle className="size-8" />
        </div>
        <h1 className="font-display font-bold text-2xl">Registration Window Expired</h1>
        <p className="text-muted-foreground text-sm mt-3 leading-relaxed">
          The 15-day timeline to verify your Academy Access Code has expired. Unverified accounts cannot proceed with onboarding.
        </p>
        <div className="mt-6 p-4 rounded-xl bg-subtle border border-border text-xs text-muted-foreground">
          Deadline date: {deadline ? new Date(deadline).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "Expired"}
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={() => signOut()}
            className="w-full py-3 bg-foreground text-background text-sm font-semibold rounded-xl hover:bg-foreground/90 transition cursor-pointer"
          >
            Sign Out & Contact Administrator
          </button>
        </div>
      </div>
    </div>
  );
}
