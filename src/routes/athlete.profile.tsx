import { AccessGuard } from "@/components/dashboard/AccessGuard";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import { Pencil, Trophy, Phone, Heart, MapPin, Mail, Hash, Loader2, Building2, Save, X, TrendingDown, Award, Shield } from "lucide-react";
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
    boxing_stance: "",
    dominant_hand: "",
    reach_cm: "",
    weight_kg: "",
    height_cm: "",
    experience_level: "",
    primary_goal: "",
    previous_club: "",
    coach_name: "",
  });

  useEffect(() => {
    async function load() {
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("boxer_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!data) {
        navigate({ to: "/onboarding", replace: true });
        return;
      }
      setAthleteProfile(data);
      if (data.academy_id) {
        const { data: acData } = await supabase
          .from("academies")
          .select("id, name, city, state, latitude, longitude, radius_meters")
          .eq("id", data.academy_id)
          .maybeSingle();
        if (acData) setAcademy(acData);
      }
      setForm({
        full_name: data.full_name ?? profile?.full_name ?? "",
        phone: data.phone ?? profile?.phone ?? "",
        mobile_number: data.mobile_number ?? "",
        date_of_birth: data.date_of_birth ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
        country: data.country ?? "",
        boxing_stance: (data as any).boxing_stance ?? "",
        dominant_hand: (data as any).dominant_hand ?? "",
        reach_cm: (data as any).reach_cm?.toString() ?? "",
        weight_kg: (data as any).weight_kg?.toString() ?? "",
        height_cm: (data as any).height_cm?.toString() ?? "",
        experience_level: (data as any).experience_level ?? "",
        primary_goal: (data as any).primary_goal ?? "",
        previous_club: (data as any).previous_club ?? "",
        coach_name: (data as any).coach_name ?? "",
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

    const { error: profileError } = await supabase.from("profiles").update({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
    }).eq("id", user.id);

    if (profileError) {
      setSaving(false);
      setSaveError(profileError.message);
      return;
    }

    const { error: athleteError } = await supabase.from("boxer_profiles").update({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      mobile_number: form.mobile_number.trim() || null,
      date_of_birth: form.date_of_birth || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      country: form.country.trim() || null,
      boxing_stance: (form as any).boxing_stance?.trim() || null,
      dominant_hand: (form as any).dominant_hand?.trim() || null,
      reach_cm: (form as any).reach_cm ? parseFloat((form as any).reach_cm) : null,
      weight_kg: (form as any).weight_kg ? parseFloat((form as any).weight_kg) : null,
      height_cm: (form as any).height_cm ? parseFloat((form as any).height_cm) : null,
      experience_level: (form as any).experience_level?.trim() || null,
      primary_goal: (form as any).primary_goal?.trim() || null,
      previous_club: (form as any).previous_club?.trim() || null,
      coach_name: (form as any).coach_name?.trim() || null,
    }).eq("id", athleteProfile.id);

    if (athleteError) {
      setSaving(false);
      setSaveError(athleteError.message);
      return;
    }

    const { data } = await supabase
      .from("boxer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setAthleteProfile(data);
      setAcademy(null);
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
            <Badge tone={athleteProfile.verification_status === "verified" ? "success" : "warning"}>
              {athleteProfile.verification_status === "verified" ? "Verified" : athleteProfile.verification_status === "rejected" ? "Rejected" : "Pending"}
            </Badge>
            <Badge tone="gold">{athleteProfile.national_federation_boxer_id ? "Registered" : "New"}</Badge>
          </div>
          <div className="mt-6 pt-6 border-t border-border space-y-2 text-left text-sm">
            <Row icon={Mail} k={profile?.email || "—"} />
            <Row icon={Phone} k={athleteProfile.phone || "—"} />
            <Row icon={MapPin} k={`${athleteProfile.city || "—"}, ${athleteProfile.state || "—"}`} />
            <Row icon={Hash} k={`DOB · ${athleteProfile.date_of_birth || "—"}`} />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Section title="Boxing profile" icon={Trophy}>
            <Grid items={[
              ["Stance", (athleteProfile as any).boxing_stance || "—"],
              ["Dominant hand", (athleteProfile as any).dominant_hand || "—"],
              ["Experience", (athleteProfile as any).experience_level || "—"],
              ["Primary goal", (athleteProfile as any).primary_goal || "—"],
              ["Height", (athleteProfile as any).height_cm ? `${(athleteProfile as any).height_cm} cm` : "—"],
              ["Weight", (athleteProfile as any).weight_kg ? `${(athleteProfile as any).weight_kg} kg` : "—"],
              ["Reach", (athleteProfile as any).reach_cm ? `${(athleteProfile as any).reach_cm} cm` : "—"],
              ["Previous club", (athleteProfile as any).previous_club || "—"],
              ["Coach", (athleteProfile as any).coach_name || "—"],
            ]} />
          </Section>

          {/* ── [NEW] Record — TODO: wire to boxer_bout_history once table exists ── */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-center gap-2 mb-5">
              <Award className="size-4 text-primary-dark" />
              <h2 className="font-display font-semibold">Record</h2>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-stat font-display text-success">{(athleteProfile as any).record_wins ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-1">Wins</div>
              </div>
              <div>
                <div className="text-stat font-display text-destructive">{(athleteProfile as any).record_losses ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-1">Losses</div>
              </div>
              <div>
                <div className="text-stat font-display text-warning">{(athleteProfile as any).record_kos ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-1">KOs</div>
              </div>
            </div>
          </div>

          {/* ── [NEW] Federation IDs ── */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-center gap-2 mb-5">
              <Shield className="size-4 text-primary-dark" />
              <h2 className="font-display font-semibold">Federation IDs</h2>
              <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider">Optional — update later</span>
            </div>
            <dl className="space-y-3">
              {[
                ["National Federation ID", athleteProfile.national_federation_id],
                ["State Association ID", athleteProfile.state_association_id],
                ["International Federation ID", athleteProfile.if_id],
              ].map(([label, val]) => (
                <div key={label as string} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <dt className="text-xs text-muted-foreground">{label as string}</dt>
                  <dd className="text-sm font-mono font-medium">{(val as string) || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>

          <Section title="Medical & fitness" icon={Heart}>
            <Grid items={[
              ["Conditions", (athleteProfile as any).medical_history_details || "None disclosed"],
              ["Medications", (athleteProfile as any).current_medications || "—"],
              ["Allergies", (athleteProfile as any).allergies || "—"],
              ["Insurance", (athleteProfile as any).health_insurance_provider || "—"],
            ]} />
          </Section>

          <Section title="Emergency contact" icon={Phone}>
            <Grid items={[
              ["Name", (athleteProfile as any).emergency_contact_name || "—"],
              ["Relationship", (athleteProfile as any).emergency_contact_relation || "—"],
              ["Phone", (athleteProfile as any).emergency_contact_phone || "—"],
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
                  ["boxing_stance", "Boxing stance"],
                  ["dominant_hand", "Dominant hand"],
                  ["reach_cm", "Reach (cm)"],
                  ["weight_kg", "Weight (kg)"],
                  ["height_cm", "Height (cm)"],
                  ["experience_level", "Experience level"],
                  ["primary_goal", "Primary goal"],
                  ["previous_club", "Previous club"],
                  ["coach_name", "Coach name"],
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
