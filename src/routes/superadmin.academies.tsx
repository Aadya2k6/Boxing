import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import {
  Plus,
  Pencil,
  X,
  Loader2,
  Check,
  MapPin,
  Target,
  Crosshair,
  CreditCard,
  Key,
  Eye,
  EyeOff,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/superadmin/academies")({ component: AcademiesPage });

// Per-academy gateway config is stored directly in academies table columns:
// (active_gateway, razorpay_key_id, payu_merchant_key, encrypted_payu_salt, encrypted_razorpay_secret)

const emptyForm = {
  name: "",
  address: "",
  city: "",
  state: "",
  latitude: "",
  longitude: "",
  radius_meters: "200",
  // Gateway fields (stored directly in academies table columns)
  payment_gateway: "razorpay" as "razorpay" | "payu",
  razorpay_key_id: "",
  payu_merchant_key: "",
  payu_merchant_salt: "",
};

function AcademiesPage() {
  const { user } = useAuth();
  const [academies, setAcademies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [showSalt, setShowSalt] = useState(false);
  const setF = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    loadAcademies();
  }, []);

  async function loadAcademies() {
    setLoading(true);
    try {
      const [{ data: acs }, { data: athletes }] = await Promise.all([
        supabase.from("academies").select("*").order("created_at"),
        supabase
          .from("athlete_profiles")
          .select("academy_id")
          .not("academy_id", "is", null),
      ]);
      setAcademies(
        (acs ?? []).map((a) => ({
          ...a,
          athlete_count: athletes?.filter((ap) => ap.academy_id === a.id).length ?? 0,
        })),
      );
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setShowSalt(false);
    setForm({ ...emptyForm });
    setShowModal(true);
  }

  function openEdit(a: any) {
    setEditing(a);
    setShowSalt(false);
    setForm({
      name: a.name ?? "",
      address: a.address ?? "",
      city: a.city ?? "",
      state: a.state ?? "",
      latitude: String(a.latitude ?? ""),
      longitude: String(a.longitude ?? ""),
      radius_meters: String(a.radius_meters ?? "200"),
      payment_gateway: (a.active_gateway ?? a.payment_gateway ?? "razorpay") as "razorpay" | "payu",
      razorpay_key_id: a.razorpay_key_id ?? "",
      payu_merchant_key: a.payu_merchant_key ?? "",
      payu_merchant_salt: a.encrypted_payu_salt ?? a.payu_merchant_salt ?? "",
    });
    setShowModal(true);
  }

  function detectLocation() {
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setF("latitude", pos.coords.latitude.toFixed(6));
        setF("longitude", pos.coords.longitude.toFixed(6));
        setGeoLoading(false);
      },
      () => setGeoLoading(false),
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Save directly into academies table columns in Supabase
      const academyPayload = {
        name: form.name,
        address: form.address,
        city: form.city,
        state: form.state,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        radius_meters: parseInt(form.radius_meters) || 200,
        razorpay_key_id: form.razorpay_key_id.trim() || null,
        payu_merchant_key: form.payu_merchant_key.trim() || null,
        encrypted_payu_salt: form.payu_merchant_salt.trim() || null,
        active_gateway: form.payment_gateway,
        updated_by: user?.id,
      };

      if (editing) {
        const { error } = await supabase.from("academies").update(academyPayload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("academies")
          .insert({ ...academyPayload, created_by: user?.id });
        if (error) throw error;
      }

      setShowModal(false);
      loadAcademies();
    } catch (err: any) {
      alert(err.message || "Failed to save academy location");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Academy locations"
        subtitle="Manage academy ranges with geo-fencing for attendance"
        actions={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition shadow-card"
          >
            <Plus className="size-3.5" /> Add location
          </button>
        }
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-3 py-12 flex justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : academies.length === 0 ? (
          <div className="col-span-3 bento-card p-12 text-center">
            <Crosshair className="size-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">No academies configured</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add your first training location to enable geo-fenced attendance.
            </p>
          </div>
        ) : (
          academies.map((a) => {
            // Read gateway config directly from academies table columns
            const activeGw = a.active_gateway || "razorpay";
            const hasRzpKey = activeGw === "razorpay" && !!a.razorpay_key_id;
            const hasPayUKey =
              activeGw === "payu" && !!a.payu_merchant_key && !!a.encrypted_payu_salt;
            const gwLabel =
              activeGw === "razorpay"
                ? hasRzpKey
                  ? "Razorpay ✓"
                  : "Razorpay (no key)"
                : hasPayUKey
                  ? "PayU ✓"
                  : "PayU (no key)";
            const gwTone = hasRzpKey || hasPayUKey ? "success" : undefined;

            return (
              <div key={a.id} className="bento-card p-5 relative group">
                <button
                  onClick={() => openEdit(a)}
                  className="absolute top-4 right-4 size-7 grid place-items-center rounded-md bg-subtle hover:bg-elevated text-muted-foreground opacity-0 group-hover:opacity-100 transition"
                >
                  <Pencil className="size-3.5" />
                </button>
                <div className="flex items-start gap-3 mb-4">
                  <div className="size-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                    <Target className="size-5 text-primary-dark" />
                  </div>
                  <div>
                    <div className="font-semibold">{a.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.city}
                      {a.state ? `, ${a.state}` : ""}
                    </div>
                  </div>
                </div>
                <div className="space-y-2 text-xs">
                  {a.address && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="size-3 mt-0.5 shrink-0" />
                      <span>{a.address}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Geo-fence radius</span>
                    <Badge tone={a.latitude ? "success" : undefined}>
                      {a.latitude ? `${a.radius_meters ?? 200}m` : "Not set"}
                    </Badge>
                  </div>
                  {a.latitude && (
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {parseFloat(a.latitude).toFixed(4)}&deg;N,{" "}
                      {parseFloat(a.longitude).toFixed(4)}&deg;E
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Payment gateway</span>
                    <Badge tone={gwTone}>{gwLabel}</Badge>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="text-muted-foreground">Athletes assigned</span>
                    <span className="font-semibold">{a.athlete_count}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-lg animate-fade-up overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-surface z-10">
              <h3 className="font-display font-semibold">
                {editing ? "Edit academy location" : "Add academy location"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="size-8 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Academy name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setF("name", e.target.value)}
                  className="input-premium"
                  placeholder="e.g. Boxos Academy, Pune"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Address</label>
                <input
                  value={form.address}
                  onChange={(e) => setF("address", e.target.value)}
                  className="input-premium"
                  placeholder="Full address"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">City</label>
                  <input
                    value={form.city}
                    onChange={(e) => setF("city", e.target.value)}
                    className="input-premium"
                    placeholder="Pune"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">State</label>
                  <input
                    value={form.state}
                    onChange={(e) => setF("state", e.target.value)}
                    className="input-premium"
                    placeholder="Maharashtra"
                  />
                </div>
              </div>

              {/* Geo section */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Geo-fence coordinates
                </legend>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={form.latitude}
                      onChange={(e) => setF("latitude", e.target.value)}
                      className="input-premium font-mono"
                      placeholder="18.5204"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={form.longitude}
                      onChange={(e) => setF("longitude", e.target.value)}
                      className="input-premium font-mono"
                      placeholder="73.8567"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={detectLocation}
                  disabled={geoLoading}
                  className="inline-flex items-center gap-2 text-xs font-medium px-3 py-2 border border-border rounded-lg hover:bg-subtle transition mb-3"
                >
                  {geoLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <MapPin className="size-3.5" />
                  )}
                  {geoLoading ? "Detecting\u2026" : "Use my current location"}
                </button>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    Geo-fence radius (meters)
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="2000"
                    value={form.radius_meters}
                    onChange={(e) => setF("radius_meters", e.target.value)}
                    className="input-premium"
                    placeholder="200"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Athletes must be within this radius to mark attendance. Recommended:
                    100\u2013300m.
                  </p>
                </div>
              </fieldset>

              {/* Payment gateway section */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <CreditCard className="size-3.5" /> Payment gateway
                </legend>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Keys are saved securely per-academy in system settings.
                </p>
                <div className="mb-4">
                  <label className="block text-xs font-semibold mb-1.5">Gateway</label>
                  <select
                    value={form.payment_gateway}
                    onChange={(e) => setF("payment_gateway", e.target.value as "razorpay" | "payu")}
                    className="input-premium"
                  >
                    <option value="razorpay">Razorpay</option>
                    <option value="payu">PayU</option>
                  </select>
                </div>

                {form.payment_gateway === "razorpay" && (
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                      <Key className="size-3" /> Razorpay Key ID
                    </label>
                    <input
                      value={form.razorpay_key_id}
                      onChange={(e) => setF("razorpay_key_id", e.target.value)}
                      className="input-premium font-mono"
                      placeholder={
                        editing?.razorpay_key_id
                          ? "🔒 Configured — leave blank to keep"
                          : "rzp_live_… or rzp_test_…"
                      }
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Leave blank when editing to keep existing key.
                    </p>
                  </div>
                )}

                {form.payment_gateway === "payu" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                        <Key className="size-3" /> PayU Merchant Key
                      </label>
                      <input
                        value={form.payu_merchant_key}
                        onChange={(e) => setF("payu_merchant_key", e.target.value)}
                        className="input-premium font-mono"
                        placeholder={
                          editing?.payu_merchant_key
                            ? "🔒 Configured — leave blank to keep"
                            : "Your PayU merchant key"
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                        <Key className="size-3" /> PayU Merchant Salt
                      </label>
                      <div className="relative">
                        <input
                          type={showSalt ? "text" : "password"}
                          value={form.payu_merchant_salt}
                          onChange={(e) => setF("payu_merchant_salt", e.target.value)}
                          className="input-premium font-mono pr-10"
                          placeholder={
                            editing?.encrypted_payu_salt || editing?.payu_merchant_salt
                              ? "🔒 Configured — leave blank to keep"
                              : "Your PayU merchant salt"
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setShowSalt((p) => !p)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showSalt ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Keys are encrypted before storage. Leave blank when editing to keep existing
                        key.
                      </p>
                    </div>
                  </div>
                )}
              </fieldset>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-[#ef4444] text-white rounded-xl hover:bg-[#dc2626] disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-card"
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  {saving ? "Saving\u2026" : editing ? "Update" : "Add academy"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
