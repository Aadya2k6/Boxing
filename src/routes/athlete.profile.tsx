import { AccessGuard } from "@/components/dashboard/AccessGuard";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import { Pencil, Trophy, Phone, Heart, MapPin, Mail, Hash, Loader2, Building2, Save, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase, AthleteProfile } from "@/lib/supabase";
import { useEffect, useState, type FormEvent } from "react";

export const Route = createFileRoute("/athlete/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfile | null>(null);
  const [academy, setAcademy] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    mobile_number: "",
    date_of_birth: "",
    city: "",
    state: "",
    country: "",
    blood_group: "",
    sport: "",
    primary_discipline: "",
    secondary_discipline: "",
    training_year: "",
    years_in_sport: "",
    current_coach: "",
    current_academy: "",
    dominant_hand: "",
  });

  useEffect(() => {
    async function load() {
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("athlete_profiles")
        .select("*, academies!athlete_profiles_preferred_academy_id_fkey(name, city, state, latitude, longitude, radius_meters)")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!data) {
        navigate({ to: "/onboarding", replace: true });
        return;
      }
      setAthleteProfile(data);
      setAcademy(data.academies ?? null);
      setForm({
        full_name: data.full_name ?? profile?.full_name ?? "",
        phone: data.phone ?? profile?.phone ?? "",
        mobile_number: data.mobile_number ?? "",
        date_of_birth: data.date_of_birth ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
        country: data.country ?? "",
        blood_group: data.blood_group ?? "",
        sport: data.sport ?? "",
        primary_discipline: data.primary_discipline ?? "",
        secondary_discipline: data.secondary_discipline ?? "",
        training_year: data.training_year ?? "",
        years_in_sport: data.years_in_sport?.toString() ?? "",
        current_coach: data.current_coach ?? "",
        current_academy: data.current_academy ?? "",
        dominant_hand: (data as any).dominant_hand ?? "",
      });
      setLoading(false);
    }
    load();
  }, [user?.id]);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!user || !athleteProfile) return;

    setSaving(true);
    setSaveError(null);

    const years = form.years_in_sport.trim() === "" ? null : Number(form.years_in_sport);
    if (years !== null && (!Number.isFinite(years) || years < 0)) {
      setSaving(false);
      setSaveError("Years in sport must be a valid positive number.");
      return;
    }

    const { error: profileError } = await supabase.from("profiles").update({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
    }).eq("id", user.id);

    if (profileError) {
      setSaving(false);
      setSaveError(profileError.message);
      return;
    }

    const { error: athleteError } = await supabase.from("athlete_profiles").update({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      mobile_number: form.mobile_number.trim() || null,
      date_of_birth: form.date_of_birth || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      country: form.country.trim() || null,
      blood_group: form.blood_group.trim() || null,
      sport: form.sport.trim() || null,
      primary_discipline: form.primary_discipline.trim() || null,
      secondary_discipline: form.secondary_discipline.trim() || null,
      training_year: form.training_year.trim() || null,
      years_in_sport: years,
      current_coach: form.current_coach.trim() || null,
      current_academy: form.current_academy.trim() || null,
      dominant_hand: form.dominant_hand.trim() || null,
    }).eq("id", athleteProfile.id);

    if (athleteError) {
      setSaving(false);
      setSaveError(athleteError.message);
      return;
    }

    const { data } = await supabase
      .from("athlete_profiles")
      .select("*, academies!athlete_profiles_preferred_academy_id_fkey(name, city, state, latitude, longitude, radius_meters)")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setAthleteProfile(data);
      setAcademy(data.academies ?? null);
    }
    setSaving(false);
    setEditOpen(false);
  }

  if (loading || !athleteProfile) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-6 text-primary animate-spin" />
      </div>
    );
  }

  const initials = athleteProfile.full_name?.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() || "UN";

  return (
    <AccessGuard>
      <PageHeader
        title="My profile"
        subtitle="Manage personal and sport profile details"
        actions={<button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-2 border border-border px-4 py-2 rounded-md text-sm hover:bg-subtle"><Pencil className="size-3.5" /> Edit profile</button>}
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-lg p-6 text-center">
          <div className="size-24 rounded-full bg-gradient-to-br from-primary to-primary-dark mx-auto grid place-items-center text-2xl font-display font-bold text-primary-foreground">{initials}</div>
          <div className="font-display font-semibold text-lg mt-4">{athleteProfile.full_name}</div>
          <div className="text-sm text-muted-foreground">Athlete · ID #{athleteProfile.id.substring(0, 8)}</div>
          <div className="mt-3 flex justify-center gap-2">
            <Badge tone={athleteProfile.verification_status === "approved" ? "success" : "warning"}>
              {athleteProfile.verification_status === "approved" ? "Active" : "Pending"}
            </Badge>
            <Badge tone="gold">{athleteProfile.training_year || "New"}</Badge>
          </div>
          <div className="mt-6 pt-6 border-t border-border space-y-2 text-left text-sm">
            <Row icon={Mail} k={profile?.email || "—"} />
            <Row icon={Phone} k={athleteProfile.mobile_number || "—"} />
            <Row icon={MapPin} k={`${athleteProfile.city || "—"}, ${athleteProfile.state || "—"}`} />
            <Row icon={Hash} k={`DOB · ${athleteProfile.date_of_birth || "—"}`} />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Section title="Sport profile" icon={Trophy}>
            <Grid items={[
              ["Sport", athleteProfile.sport || "—"], 
              ["Discipline", athleteProfile.primary_discipline || "—"], 
              ["Secondary", athleteProfile.secondary_discipline || "—"], 
              ["Training year", athleteProfile.training_year || "—"], 
              ["Years in sport", athleteProfile.years_in_sport?.toString() || "—"], 
              ["Dominant hand", (athleteProfile as any).dominant_hand || "—"], 
              ["Coach", athleteProfile.current_coach || "—"], 
              ["Club", athleteProfile.current_academy || "—"]
            ]} />
          </Section>

          <Section title="Medical & fitness" icon={Heart}>
            <Grid items={[
              ["Blood group", athleteProfile.blood_group || "—"], 
              ["Conditions", athleteProfile.medical_conditions || "None disclosed"], 
              ["Medications", athleteProfile.current_medications || "—"], 
              ["Allergies", athleteProfile.allergies || "—"], 
              ["Fitness declared", athleteProfile.fitness_declaration ? "Yes" : "No"]
            ]} />
          </Section>

          <Section title="Emergency contact" icon={Phone}>
            <Grid items={[
              ["Name", athleteProfile.emergency_contact_name || "—"], 
              ["Relationship", athleteProfile.emergency_contact_relation || "—"], 
              ["Phone", athleteProfile.emergency_contact_phone || "—"], 
              ["Physician", athleteProfile.primary_physician_details || "—"]
            ]} />
          </Section>

          {/* Assigned Academy / Location */}
          <Section title="Assigned academy" icon={Building2}>
            {academy ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                    <MapPin className="size-4 text-primary-dark" />
                  </div>
                  <div>
                    <div className="font-semibold">{academy.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {academy.city}{academy.state ? `, ${academy.state}` : ""}
                    </div>
                    {academy.latitude && (
                      <div className="text-[11px] text-muted-foreground mt-1 font-mono">
                        {parseFloat(academy.latitude).toFixed(4)}°N, {parseFloat(academy.longitude).toFixed(4)}°E · {academy.radius_meters ?? 200}m geo-fence
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-info/6 border border-info/20 rounded-xl p-3 text-xs text-info">
                  Your academy location is managed by your admin. This determines your geo-fenced attendance zone.
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-2">
                No academy assigned yet — contact your admin to get assigned.
              </div>
            )}
          </Section>
        </div>
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-surface border border-border rounded-2xl shadow-modal overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-display font-semibold text-lg">Edit profile</h3>
              <button onClick={() => setEditOpen(false)} className="size-8 grid place-items-center rounded-md hover:bg-subtle">
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleSaveProfile} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {saveError && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">{saveError}</div>}
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  ["full_name", "Full name"],
                  ["phone", "Phone"],
                  ["mobile_number", "Mobile number"],
                  ["date_of_birth", "Date of birth"],
                  ["city", "City"],
                  ["state", "State"],
                  ["country", "Country"],
                  ["blood_group", "Blood group"],
                  ["sport", "Sport"],
                  ["primary_discipline", "Primary discipline"],
                  ["secondary_discipline", "Secondary discipline"],
                  ["training_year", "Training year"],
                  ["years_in_sport", "Years in sport"],
                  ["current_coach", "Coach"],
                  ["current_academy", "Club / academy"],
                  ["dominant_hand", "Dominant hand"],
                ].map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="block text-xs font-semibold mb-1.5">{label}</span>
                    <input
                      type={key === "date_of_birth" ? "date" : key === "years_in_sport" ? "number" : "text"}
                      min={key === "years_in_sport" ? "0" : undefined}
                      value={(form as any)[key]}
                      onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                      className="input-premium"
                    />
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-subtle">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ef4444] text-white text-sm font-semibold hover:bg-[#dc2626] disabled:opacity-60">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AccessGuard>
  );
}

function Row({ icon: I, k }: any) { return <div className="flex items-center gap-2 text-muted-foreground"><I className="size-3.5" /> <span className="truncate">{k}</span></div>; }

function Section({ title, icon: I, children }: any) {
  return (
    <div className="bg-surface border border-border rounded-lg p-6">
      <div className="flex items-center gap-2 mb-5">
        <I className="size-4 text-primary-dark" />
        <h2 className="font-display font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Grid({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{k}</dt>
          <dd className="text-sm mt-1">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
