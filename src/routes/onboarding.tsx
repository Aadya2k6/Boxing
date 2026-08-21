import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
  import { useMemo, useState, useEffect, useCallback } from "react";
  import { State, City } from "country-state-city";
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
  import { Input } from "@/components/ui/input";

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
    { key: "federation", label: "Federation IDs",        icon: Trophy,     desc: "National, State & City IDs" },
  ];

  // ── Form state type ───────────────────────────────────────────────────
  type FormData = Record<string, any>;

  // ── Validation logic ─────────────────────────────────────────────────
  function validateStep(stepKey: string, data: FormData, user?: any, isMinor?: boolean): string | null {
    if (stepKey === "personal") {
      if (!data.dob) return "Date of birth is required.";
      if (!data.gender) return "Gender is required.";
      if (!data.phone?.trim()) return "Phone number is required.";
      if (!data.city?.trim() || !data.state?.trim() || !data.country?.trim()) return "City, state, and country are required.";
    }
    if (stepKey === "guardian" && isMinor) {
      if (!data.gName?.trim()) return "Guardian full name is required for minor participants.";
      if (!data.gRel) return "Relationship to participant is required.";
      if (!data.gPhone?.trim()) return "Guardian phone number is required.";
      if (!data.gConsent) return "Guardian digital consent checkbox is compulsory.";
    }
    if (stepKey === "emergency") {
      if (!data.eName?.trim()) return "Emergency contact name is required.";
      if (!data.eRel?.trim()) return "Relationship to participant is required.";
      if (!data.ePhone?.trim()) return "Emergency contact phone number is required.";
    }
    if (stepKey === "medical") {
      if (!data.medicalFitnessDeclared) return "You must declare medical fitness to proceed with boxing training.";
    }
    if (stepKey === "sports") {
      if (!data.boxingStance) return "Boxing stance is required (Orthodox or Southpaw).";
      if (!data.ageCategoryId) return "Age category is required.";
      if (!data.weightKg) return "Declared weight in kg is required.";
      if (!data.weightCategoryId) return "Valid weight category could not be found for the entered weight, gender, and age category.";
      if (!data.heightCm) return "Height in cm is required.";
      if (!data.preferredCenterId) return "Please select a preferred training center.";
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
      if (typeof window === "undefined") return { nationality: "Indian", country: "India", medicalFitnessDeclared: true };
      try {
        const saved = localStorage.getItem(`boxos_onboard_draft_${user?.id ?? "guest"}`);
        if (saved) return JSON.parse(saved);
      } catch {}
      return { nationality: "Indian", country: "India", medicalFitnessDeclared: true };
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

    // If boxer is NOT minor, completely omit guardian step
    const visibleSteps = useMemo(
      () => (isMinor ? STEPS : STEPS.filter(s => s.key !== "guardian")),
      [isMinor]
    );
    const current = visibleSteps[step] || visibleSteps[0];
    const totalSteps = visibleSteps.length;
    const progress = totalSteps > 1 ? (step / (totalSteps - 1)) * 100 : 100;

    const [codeVerifiedInSession, setCodeVerifiedInSession] = useState<boolean>(false);

    const [ageCategories, setAgeCategories] = useState<any[]>([]);
    const [weightCategories, setWeightCategories] = useState<any[]>([]);
    const [centers, setCenters] = useState<any[]>([]);

    useEffect(() => {
      supabase.from("age_categories").select("*").order("min_age", { ascending: true }).then(({ data }) => setAgeCategories(data || []));
      supabase.from("weight_categories").select("*").order("sort_order", { ascending: true }).then(({ data }) => setWeightCategories(data || []));
    }, []);

    useEffect(() => {
      let acId = profile?.academy_id;
      if (!acId && typeof window !== "undefined") {
        acId = localStorage.getItem("boxos_verified_academy_id");
      }
      if (!acId) {
        const storedCode = typeof window !== "undefined" ? localStorage.getItem("boxos_verified_code") : null;
        if (storedCode) {
          supabase.from("academy_codes").select("academy_id").eq("code", storedCode).maybeSingle().then(({ data }) => {
            if (data?.academy_id) {
              supabase.from("centers").select("*").eq("academy_id", data.academy_id).then(({ data: centersData }) => setCenters(centersData || []));
            }
          });
          return;
        }
      }
      if (acId) {
        supabase.from("centers").select("*").eq("academy_id", acId).then(({ data }) => setCenters(data || []));
      }
    }, [profile?.academy_id]);

    // If the profile explicitly says NOT verified, clear any stale localStorage flag
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
        if (!user) {
          throw new Error("You must be logged in to complete onboarding.");
        }
        
        const currentUserId = user.id;

        // Resolve target academy_id
        let targetAcademyId = profile?.academy_id;
        if (!targetAcademyId && currentUserId) {
          const { data: p } = await supabase.from("profiles").select("academy_id").eq("id", currentUserId).maybeSingle();
          targetAcademyId = p?.academy_id;
        }
        if (!targetAcademyId && typeof window !== "undefined") {
          targetAcademyId = localStorage.getItem("boxos_verified_academy_id");
        }
        if (!targetAcademyId) {
          const storedCode = typeof window !== "undefined" ? localStorage.getItem("boxos_verified_code") : null;
          if (storedCode) {
            const { data: codeRow } = await supabase.from("academy_codes").select("academy_id").eq("code", storedCode).maybeSingle();
            if (codeRow?.academy_id) targetAcademyId = codeRow.academy_id;
          }
        }
        if (!targetAcademyId) {
          throw new Error("Academy verification required. Please go back and verify your academy code before completing registration.");
        }

        const cleanStance = (data.boxingStance || "orthodox").toLowerCase() === "southpaw" ? "southpaw" : "orthodox";

        const { data: existingBp } = await supabase
          .from("boxer_profiles")
          .select("id")
          .eq("user_id", currentUserId)
          .maybeSingle();

        const bpPayload = {
            full_name: user?.user_metadata?.full_name || "Athlete",
            date_of_birth: data.dob,
            gender: ["Male", "Female", "Other"].includes(data.gender) ? data.gender : "Male",
            nationality: data.nationality || "Indian",
            phone: data.phone || null,
            city: data.city || null,
            state: data.state || null,
            country: data.country || "India",
            blood_group: data.bloodGroup || null,
            is_minor: isMinor,

            emergency_contact_name: data.eName || null,
            emergency_contact_relation: data.eRel || null,
            emergency_contact_phone: data.ePhone || null,
            primary_physician_details: data.physicianDetails || null,

            physical_conditions: data.physicalConditions || data.medicalHistory || null,
            current_medications: data.meds || null,
            allergies: data.allergy || null,
            medical_fitness_declared: !!data.medicalFitnessDeclared,

            stance: cleanStance,
            age_category_id: data.ageCategoryId || null,
            weight_category_id: data.weightCategoryId || null,
            declared_weight_kg: data.weightKg ? parseFloat(data.weightKg) : null,
            height_cm: data.heightCm ? parseFloat(data.heightCm) : null,
            reach_cm: data.reachCm ? parseFloat(data.reachCm) : null,
            national_federation_boxer_id: data.nationalFederationBoxerId?.trim() || null,
            state_federation_boxer_id: data.stateFederationBoxerId?.trim() || null,
            city_federation_boxer_id: data.cityFederationBoxerId?.trim() || null,
            preferred_center_id: data.preferredCenterId || null,

            onboarding_complete: true,
        };

        let ap, apErr;

        if (existingBp) {
          const { data, error } = await supabase
            .from("boxer_profiles")
            .update(bpPayload)
            .eq("user_id", currentUserId)
            .select("id")
            .maybeSingle();
          ap = data;
          apErr = error;
        } else {
          const { data, error } = await supabase
            .from("boxer_profiles")
            .insert({
              ...bpPayload,
              user_id: currentUserId,
              academy_id: targetAcademyId || null,
            })
            .select("id")
            .maybeSingle();
          ap = data;
          apErr = error;
        }

        if (apErr) throw new Error("Failed to save athlete profile: " + apErr.message);

        const boxerProfileId = ap?.id;

        if (isMinor && data.gName && boxerProfileId) {
          try {
            await supabase.from("guardian_details").upsert({
              boxer_profile_id: boxerProfileId,
              full_name: data.gName.trim(),
              relationship: data.gRel,
              phone: data.gPhone.trim(),
              email: data.gEmail?.trim() || null,
              consent_given: !!data.gConsent,
            }, { onConflict: "boxer_profile_id" });
          } catch (gErr) { console.warn("guardian_details upsert notice:", gErr); }
        }

        try {
          localStorage.removeItem(DRAFT_KEY);
          localStorage.setItem("boxos_code_verified", "true");
          localStorage.removeItem("boxos_verified_code");
        } catch {}

        setDone(true);
        window.location.href = "/athlete";
      } catch (err: any) {
        console.error("Onboarding submission error:", err);
        setSubmitError(err.message || "Failed to submit profile. Please check your details.");
      } finally {
        setSubmitting(false);
      }
    }

    if (authLoading) return (
      <div className="min-h-screen theme-cinematic-dark bg-cinematic-base grid place-items-center">
        <span className="size-6 border-2 border-cinematic-red border-t-transparent rounded-full animate-spin" />
      </div>
    );

    const isCodeVerified = profile?.academy_code_verified === true || codeVerifiedInSession;

    const deadlineDate = profile?.academy_code_deadline ? new Date(profile.academy_code_deadline) : null;
    const isDeadlinePassed = deadlineDate ? deadlineDate.getTime() < Date.now() : false;
    const daysRemaining = deadlineDate ? Math.max(0, Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 15;

    if (done) return null;
    if (!user) return <SignupScreen />;
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
        <div className="w-full relative z-10 flex flex-col flex-1 justify-center py-8">
          <div className="w-full px-6 lg:px-8 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-cinematic-primary tracking-wider uppercase">Step {step + 1} of {totalSteps}</span>
              <span className="text-xs text-cinematic-secondary">{current.label}</span>
            </div>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-cinematic-red transition-all duration-500 ease-out rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="w-full px-6 lg:px-8 flex flex-col lg:flex-row gap-6 lg:gap-8 mx-auto">
            <div className="hidden lg:block w-40 xl:w-48 shrink-0">
              <StepSidebar steps={visibleSteps} current={step} onJump={(i) => i < step && setStep(i)} />
            </div>
            <main className="flex-1 w-full min-w-0">
              <FormPanel
                current={current}
                step={step}
                totalSteps={totalSteps}
                data={data}
                set={set}
                user={user}
                isMinor={isMinor}
                ageCategories={ageCategories}
                weightCategories={weightCategories}
                centers={centers}
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
                <div className="min-w-0"><div className="truncate">{s.label}</div></div>
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  function FormPanel({
    current, step, totalSteps, data, set, user, isMinor, ageCategories, weightCategories, centers, onPrev, onNext, isLast, submitting, submitError
  }: {
    current: typeof STEPS[0]; step: number; totalSteps: number;
    data: FormData; set: (k: string, v: any) => void; user?: any; isMinor?: boolean;
    ageCategories: any[]; weightCategories: any[]; centers: any[];
    onPrev: () => void; onNext: () => void; isLast: boolean;
    submitting?: boolean; submitError?: string | null;
  }) {
    const Icon = current.icon;
    const [valError, setValError] = useState<string | null>(null);

    useEffect(() => { setValError(null); }, [step]);

    function handleAttemptNext() {
      const err = validateStep(current.key, data, user, isMinor);
      if (err) { setValError(err); return; }
      setValError(null);
      onNext();
    }

    return (
      <CinematicWizardPanel>
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

        <div className="px-5 md:px-8 py-6">
          {current.key === "personal"   && <PersonalStep   data={data} set={set} user={user} />}
          {current.key === "guardian"   && <GuardianStep   data={data} set={set} />}
          {current.key === "emergency"  && <EmergencyStep  data={data} set={set} />}
          {current.key === "medical"    && <MedicalStep    data={data} set={set} />}
          {current.key === "sports"     && <SportsStep     data={data} set={set} ageCategories={ageCategories} weightCategories={weightCategories} centers={centers} />}
          {current.key === "federation" && <FederationStep data={data} set={set} />}
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
          <Field label="Date of birth" required hint="Used to verify age category and minor status">
            <CinematicInput type="date" value={data.dob || ""} onChange={e => set("dob", e.target.value)} />
          </Field>
          <Field label="Gender" required>
            <Select value={data.gender || ""} onChange={e => set("gender", e.target.value)}>
              <option value="">Select…</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </Select>
          </Field>
          <Field label="Blood Group" hint="Crucial for medical & sparring clearance">
            <Select value={data.bloodGroup || ""} onChange={e => set("bloodGroup", e.target.value)}>
              <option value="">Select…</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </Select>
          </Field>
          <Field label="Nationality">
            <Input value={data.nationality || "Indian"} onChange={e => set("nationality", e.target.value)} placeholder="e.g. Indian" />
          </Field>
          <Field label="Phone number" required hint="Primary contact number">
            <CinematicInput value={data.phone || ""} onChange={e => set("phone", e.target.value)} placeholder="+91 98765 43210" type="tel" />
          </Field>
        </div>
        <div className="grid md:grid-cols-3 gap-6 pt-2">
          <Field label="State" required>
            <Select 
              value={data.state || ""} 
              onChange={e => {
                set("state", e.target.value);
                set("city", ""); // Reset city when state changes
              }}
            >
              <option value="">Select State…</option>
              {State.getStatesOfCountry("IN").map(s => (
                <option key={s.isoCode} value={s.name}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="City" required hint={!data.state ? "Select State first" : undefined}>
            <Select 
              value={data.city || ""} 
              onChange={e => set("city", e.target.value)}
              disabled={!data.state}
            >
              <option value="">Select City…</option>
              {(() => {
                const st = State.getStatesOfCountry("IN").find(s => s.name === data.state);
                if (!st) return null;
                return City.getCitiesOfState("IN", st.isoCode).map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ));
              })()}
            </Select>
          </Field>
          <Field label="Country" required>
            <CinematicInput value={data.country || "India"} onChange={e => set("country", e.target.value)} disabled placeholder="India" />
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
          <p className="text-sm text-[#F59E0B] leading-relaxed">Participant is under 18 years of age. A parent or legal guardian must provide contact details and consent.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <Field label="Guardian Full Name" required>
            <CinematicInput value={data.gName || ""} onChange={e => set("gName", e.target.value)} placeholder="Guardian Name" />
          </Field>
          <Field label="Relationship to Participant" required>
            <Select value={data.gRel || ""} onChange={e => set("gRel", e.target.value)}>
              <option value="">Select…</option>
              <option value="Father">Father</option>
              <option value="Mother">Mother</option>
              <option value="Legal Guardian">Legal Guardian</option>
              <option value="Other">Other</option>
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
          label="I provide legal guardian consent for my ward to enroll and train in boxing"
          description="I confirm I have read and agree to the academy terms, safety protocols, and sparring policies. This consent is timestamped."
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
          <Field label="Emergency Contact Name" required>
            <CinematicInput value={data.eName || ""} onChange={e => set("eName", e.target.value)} placeholder="Contact Name" />
          </Field>
          <Field label="Relationship" required>
            <CinematicInput value={data.eRel || ""} onChange={e => set("eRel", e.target.value)} placeholder="e.g. Parent, Spouse, Sibling" />
          </Field>
          <Field label="Emergency Contact Phone" required>
            <CinematicInput type="tel" value={data.ePhone || ""} onChange={e => set("ePhone", e.target.value)} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Primary Physician Details" hint="Optional (Doctor Name, Clinic, Phone)">
            <Input value={data.physicianDetails || ""} onChange={e => set("physicianDetails", e.target.value)} placeholder="e.g. Dr. Sharma, Apollo Clinic" />
          </Field>
        </div>
      </div>
    );
  }

  function MedicalStep({ data, set }: { data: FormData; set: (k: string, v: any) => void }) {
    return (
      <div className="space-y-6">
        <Field label="Physical Conditions & Injury History" hint="Describe any past fractures, concussions, asthma, surgeries, or joint conditions (Enter 'None' if none).">
          <Textarea value={data.physicalConditions || data.medicalHistory || ""} onChange={e => { set("physicalConditions", e.target.value); set("medicalHistory", e.target.value); }} placeholder="e.g. None or Right shoulder dislocation in 2024" rows={3} />
        </Field>
        <div className="grid md:grid-cols-2 gap-6 pt-2">
          <Field label="Current Medications" hint="Any daily or routine prescriptions (Optional)">
            <Textarea value={data.meds || ""} onChange={e => set("meds", e.target.value)} placeholder="e.g. Inhaler as needed or None" rows={2} />
          </Field>
          <Field label="Severe Allergies" hint="Food, drug, or environmental allergies (Optional)">
            <Textarea value={data.allergy || ""} onChange={e => set("allergy", e.target.value)} placeholder="e.g. No known allergies" rows={2} />
          </Field>
          <Field label="Health Insurance Provider & Policy Number" hint="Optional">
            <CinematicInput value={data.healthInsuranceProvider || ""} onChange={e => set("healthInsuranceProvider", e.target.value)} placeholder="Provider - Policy #" />
          </Field>
        </div>
        <Checkbox
          label="Medical Fitness Declaration"
          description="I declare that I am physically fit and medically cleared to participate in high-intensity boxing conditioning and training."
          checked={data.medicalFitnessDeclared}
          onChange={v => set("medicalFitnessDeclared", v)}
          required
        />
      </div>
    );
  }

  function SportsStep({ data, set, ageCategories, weightCategories, centers }: { data: FormData; set: (k: string, v: any) => void; ageCategories: any[]; weightCategories: any[]; centers: any[] }) {
    const gender = data.gender;
    const filteredAgeCategories = ageCategories.filter(a => {
      if (a.gender_scope === 'all') return true;
      if (gender === 'Male' && (a.gender_scope === 'men' || a.gender_scope === 'boys')) return true;
      if (gender === 'Female' && (a.gender_scope === 'women' || a.gender_scope === 'girls')) return true;
      return false;
    });

    const filteredWeightCategories = weightCategories.filter(w => {
      if (w.age_category_id !== data.ageCategoryId) return false;
      if (gender === 'Male' && (w.gender === 'men' || w.gender === 'boys')) return true;
      if (gender === 'Female' && (w.gender === 'women' || w.gender === 'girls')) return true;
      return false;
    });

    const weightKg = parseFloat(data.weightKg);
    const matchedCategory = useMemo(() => {
      if (isNaN(weightKg) || !data.ageCategoryId) return null;
      return filteredWeightCategories.find(w => weightKg > w.min_kg && (w.max_kg === null || weightKg <= w.max_kg)) || null;
    }, [weightKg, data.ageCategoryId, filteredWeightCategories]);

    useEffect(() => {
      if (matchedCategory?.id !== data.weightCategoryId) {
        set("weightCategoryId", matchedCategory?.id || "");
      }
    }, [matchedCategory?.id, data.weightCategoryId, set]);

    return (
      <div className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <Field label="Boxing Stance" required hint="Your primary fighting stance">
            <Select value={data.boxingStance || ""} onChange={e => set("boxingStance", e.target.value)}>
              <option value="">Select Stance…</option>
              <option value="Orthodox">Orthodox (Left hand lead / Right-handed)</option>
              <option value="Southpaw">Southpaw (Right hand lead / Left-handed)</option>
            </Select>
          </Field>
          
          <Field label="Age Category" required hint="Based on calendar year of birth">
            <Select
              value={data.ageCategoryId || ""}
              onChange={e => {
                set("ageCategoryId", e.target.value);
                set("weightCategoryId", ""); // reset weight category on age category change
              }}
            >
              <option value="">Select Age Category…</option>
              {filteredAgeCategories.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.min_age}{a.max_age ? ` - ${a.max_age}` : '+'} yrs)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Weight Category" hint="Automatically assigned based on weight and age category">
            <div className="w-full bg-[#0B0F17]/60 border border-[#ffffff1a] rounded-lg px-4 py-3 text-sm text-[#94A3B8] flex items-center h-[46px]">
              {data.ageCategoryId && data.weightKg ? (
                matchedCategory ? (
                  <span className="text-[#F8FAFC] font-medium">
                    {matchedCategory.name} ({matchedCategory.min_kg}kg {matchedCategory.max_kg ? `- ${matchedCategory.max_kg}kg` : "+"})
                  </span>
                ) : (
                  <span className="text-cinematic-red">No matching category found for this weight.</span>
                )
              ) : (
                "Enter weight and select age category"
              )}
            </div>
          </Field>
          <Field label="Declared Weight (kg)" required hint="Used for weight category assignment">
            <CinematicInput type="number" step="0.1" value={data.weightKg || ""} onChange={e => set("weightKg", e.target.value)} placeholder="e.g. 71.5" />
          </Field>
          <Field label="Height (cm)" required hint="Standing height">
            <CinematicInput type="number" step="0.5" value={data.heightCm || ""} onChange={e => set("heightCm", e.target.value)} placeholder="e.g. 178" />
          </Field>
          <Field label="Reach (cm)" hint="Fingertip-to-fingertip wingspan (Optional)">
            <CinematicInput type="number" step="0.5" value={data.reachCm || ""} onChange={e => set("reachCm", e.target.value)} placeholder="e.g. 182" />
          </Field>
          <Field label="Experience Level" required>
            <Select value={data.experienceLevel || ""} onChange={e => set("experienceLevel", e.target.value)}>
              <option value="">Select…</option>
              <option value="Beginner">Beginner (No prior experience)</option>
              <option value="Intermediate">Intermediate (Pad work and heavy bag experience)</option>
              <option value="Advanced">Advanced (Sparring or competition experience)</option>
            </Select>
          </Field>
          <Field label="Previous/Current Club" hint="Optional">
            <CinematicInput value={data.previousClub || ""} onChange={e => set("previousClub", e.target.value)} placeholder="e.g. Kronk Gym" />
          </Field>
          <Field label="Coach Name" hint="Optional">
            <CinematicInput value={data.coachName || ""} onChange={e => set("coachName", e.target.value)} placeholder="Coach Name" />
          </Field>
          <Field label="Preferred Center" hint="Select the center/branch you plan to attend">
            <Select value={data.preferredCenterId || ""} onChange={e => set("preferredCenterId", e.target.value)}>
              <option value="">Select Center…</option>
              {centers.map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.city ? `(${c.city})` : ""}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    );
  }

  function FederationStep({ data, set }: { data: FormData; set: (k: string, v: any) => void }) {
    return (
      <div className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <Field label="National Federation ID" hint="Optional (e.g. BFI ID)">
            <CinematicInput value={data.nationalFederationBoxerId || ""} onChange={e => set("nationalFederationBoxerId", e.target.value)} placeholder="e.g. BFI-IND-10492" />
          </Field>
          <Field label="State Federation ID" hint="Optional">
            <CinematicInput value={data.stateAssociationId || ""} onChange={e => set("stateAssociationId", e.target.value)} placeholder="e.g. State Boxing Assoc. ID" />
          </Field>
          <Field label="City Federation ID" hint="Optional">
            <CinematicInput value={data.cityAssociationId || ""} onChange={e => set("cityAssociationId", e.target.value)} placeholder="e.g. City Boxing Assoc. ID" />
          </Field>
          <Field label="International Federation ID" hint="Optional (e.g. IBA ID)">
            <CinematicInput value={data.internationalFederationId || ""} onChange={e => set("internationalFederationId", e.target.value)} placeholder="e.g. IBA-12345" />
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

        // The verify_academy_code SECURITY DEFINER RPC validates the code,
        // assigns the athlete to the academy, marks academy_code_verified = true in profiles,
        // and returns the academy_id (UUID string).
        const { data: verifiedAcademyId, error: codeErr } = await supabase
          .rpc("verify_academy_code", { p_code: codeClean });

        if (codeErr) {
          const msg = codeErr.message?.toLowerCase() || "";
          if (msg.includes("expired")) {
            setError("This Academy Access Code has expired. Please request a new code from your administrator.");
            return;
          } else if (msg.includes("invalid") || msg.includes("inactive")) {
            // If code might have been created without academy_id, check directly as fallback
            const { data: directCode } = await supabase
              .from("academy_codes")
              .select("id, is_active, academy_id")
              .eq("code", codeClean)
              .maybeSingle();

            if (directCode) {
              if (!directCode.is_active) {
                setError("This Academy Access Code is currently inactive. Please contact your administrator.");
                return;
              }
              // Code exists and is active, update athlete profile directly
              const userId = profile?.id || user?.id;
              if (userId) {
                await supabase
                  .from("profiles")
                  .update({
                    academy_code_verified: true,
                    academy_id: directCode.academy_id || null,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", userId);
              }
            } else {
              setError("Invalid Academy Access Code. Please check with your academy administrator.");
              return;
            }
          } else {
            setError(codeErr.message || "Invalid Academy Access Code. Please check with your academy administrator.");
            return;
          }
        }

        // Mark code as verified in localStorage for local session persistence
        try {
          localStorage.setItem("boxos_code_verified", "true");
          localStorage.setItem("boxos_verified_code", codeClean);
          if (verifiedAcademyId) {
            localStorage.setItem("boxos_verified_academy_id", verifiedAcademyId);
          }
        } catch {}

        const userId = profile?.id || user?.id;
        if (userId && verifiedAcademyId) {
          await supabase
            .from("profiles")
            .update({
              academy_code_verified: true,
              academy_id: verifiedAcademyId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", userId);
        }

        setVerifiedSuccess(true);
        setTimeout(() => {
          onVerified();
        }, 600);
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
  
  // ── Signup screen (Phase 1) ──────────────────────────────────────────
  function SignupScreen() {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSignup(e: React.FormEvent) {
      e.preventDefault();
      setLoading(true);
      setError(null);

      try {
        const userEmail = email.trim().toLowerCase();
        const userPassword = password.trim();

        if (!userEmail || !userPassword || !fullName.trim()) {
          throw new Error("All fields are required.");
        }

        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: userEmail,
          password: userPassword,
          options: { data: { full_name: fullName.trim() } },
        });

        if (signUpErr) {
          const errMsg = (signUpErr.message || "").toLowerCase();
          if (errMsg.includes("already registered") || errMsg.includes("already exists") || errMsg.includes("user already exists")) {
            const { error: signInErr } = await supabase.auth.signInWithPassword({
              email: userEmail,
              password: userPassword,
            });
            if (signInErr) {
              throw new Error(`An account with ${userEmail} already exists. Please verify your password: ${signInErr.message}`);
            }
          } else {
            throw new Error(signUpErr.message);
          }
        }
        
        // Wait for session to propagate and useAuth to re-render OnboardingPage
      } catch (err: any) {
        setError(err.message || "Failed to create account.");
        setLoading(false);
      }
    }

    return (
      <CinematicLayout>
        <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[1400px] h-[1400px] top-0 right-0 -translate-y-1/4 translate-x-1/4" />
        <CinematicMedia allowVideo={false} />

        <div className="relative z-10 w-full flex flex-col items-center py-8">
          <CinematicCard>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-display font-bold text-cinematic-primary tracking-tight">Create Athlete Account</h1>
              <p className="text-sm text-cinematic-secondary mt-3">Step 1 of 3: Set up your login credentials.</p>
            </div>

            <form onSubmit={handleSignup} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-cinematic-primary mb-2">Full Name</label>
                <CinematicInput value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Aarav Mehta" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-cinematic-primary mb-2">Email Address</label>
                <CinematicInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="aarav@example.com" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-cinematic-primary mb-2">Password</label>
                <CinematicInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" minLength={8} />
                <p className="text-[10px] text-cinematic-secondary/70 mt-1">Minimum 8 characters.</p>
              </div>

              {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-cinematic-red/10 border border-cinematic-red/20 text-sm text-cinematic-red font-medium">
                  <AlertCircle className="size-5 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !fullName || !email || !password}
                className="w-full flex items-center justify-center gap-2 bg-cinematic-blue text-white py-4 rounded-xl text-sm font-bold hover:bg-blue-600 disabled:opacity-50 transition shadow-xl mt-4"
              >
                {loading ? <><Loader2 className="size-4.5 animate-spin" /> Creating Account…</> : "Continue to Next Step"}
              </button>
            </form>
            
            <div className="mt-8 pt-6 border-t border-white/5 text-center text-sm text-cinematic-secondary">
              Already have an account? <Link to="/login" className="text-cinematic-primary hover:text-cinematic-blue font-medium transition-colors">Sign in</Link>
            </div>
          </CinematicCard>
        </div>
      </CinematicLayout>
    );
  }
