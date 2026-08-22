import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import {
  Plus, X, Globe, MapPin, Shield, Loader2, Search, ChevronRight, ChevronDown,
  Users, Trophy, Trash2, RefreshCw, Globe2, Building2
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/boxos-admin/federations")({
  component: BoxosAdminFederations,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type FederationScope = "national" | "state" | "custom";

interface FederationAccount {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  role: string;
  federation_scope_type: FederationScope | null;
  federation_scope_states: string[];
  federation_scope_cities: string[];
  created_at: string;
}

const FEDERATION_ROLES = ['national_federation_admin', 'state_federation_admin', 'custom_federation_admin'];

function getFedScope(acct: FederationAccount): FederationScope {
  return acct.federation_scope_type ?? "national";
}

function getFedScopeValue(acct: FederationAccount): string {
  if (acct.federation_scope_type === "state") return acct.federation_scope_states?.[0] ?? "";
  if (acct.federation_scope_type === "custom") {
    const parts = [...(acct.federation_scope_states ?? []), ...(acct.federation_scope_cities ?? [])];
    return parts.join(", ") || "";
  }
  return "All India";
}

function scopeBadge(scope: FederationScope) {
  if (scope === "national") return <span className="badge" style={{ background: "rgba(99,102,241,0.12)", color: "rgb(99,102,241)" }}>National</span>;
  if (scope === "state") return <span className="badge" style={{ background: "rgba(16,185,129,0.12)", color: "rgb(16,185,129)" }}>State</span>;
  return <span className="badge badge-neutral">Custom</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

function BoxosAdminFederations() {
  const { user } = useAuth();
  const [federations, setFederations] = useState<FederationAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<FederationAccount | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadFederations = useCallback(async () => {
    setLoading(true);
    try {
      // Federation accounts have dedicated roles: national_federation_admin, state_federation_admin, custom_federation_admin
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, is_active, role, federation_scope_type, federation_scope_states, federation_scope_cities, created_at")
        .in("role", FEDERATION_ROLES)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFederations((data ?? []) as FederationAccount[]);
    } catch (err: any) {
      toast.error(err.message || "Failed to load federation accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFederations();
  }, [loadFederations]);

  const filtered = federations.filter(f =>
    !search ||
    (f.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (f.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      // profiles UPDATE is column-restricted — is_active is NOT in the grant.
      // Revoke/reactivate needs a service-role edge function (manage-federation-status).
      // For now, display an informational message.
      toast.error("Federation revoke requires a service-role edge function (manage-federation-status). Please deploy it to Supabase.");
      setRevokeTarget(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke access");
    } finally {
      setRevoking(false);
    }
  }

  async function handleReactivate(f: FederationAccount) {
    toast.error("Federation reactivate requires a service-role edge function (manage-federation-status). Please deploy it to Supabase.");
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Federation Portals"
        subtitle={`${federations.length} federation account${federations.length !== 1 ? "s" : ""} provisioned`}
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-dark transition shadow-card cursor-pointer"
          >
            <Plus className="size-4" /> Create Federation
          </button>
        }
      />

      {/* Scope Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><Globe2 className="size-3.5 text-blue-400" /><span className="font-semibold text-blue-400">National</span> — full athlete roster access</div>
        <div className="text-border">·</div>
        <div className="flex items-center gap-1.5"><MapPin className="size-3.5 text-emerald-500" /><span className="font-semibold text-emerald-500">State</span> — filtered by state</div>
        <div className="text-border">·</div>
        <div className="flex items-center gap-1.5"><Building2 className="size-3.5 text-muted-foreground" /><span className="font-semibold">Custom</span> — configured region list</div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="input-premium pl-9"
        />
      </div>

      {/* Accounts List */}
      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="size-8 animate-spin mx-auto text-blue-400 mb-3" />
          <div className="text-sm text-muted-foreground">Loading federation accounts…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bento-card p-12 text-center">
          <Globe className="size-12 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.25} />
          <div className="font-display font-bold text-lg">No federation accounts found</div>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {search ? "No matches for your search." : "Create the first federation portal to grant jurisdictional access."}
          </p>
          {!search && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary-dark transition cursor-pointer shadow-card"
            >
              <Plus className="size-4" /> Create First Federation
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map(f => {
            const scope = getFedScope(f);
            const scopeVal = getFedScopeValue(f);
            return (
              <div key={f.id} className="bento-card p-5 flex flex-col justify-between hover:border-border-strong transition-all">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-11 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/30 grid place-items-center text-indigo-600 font-bold font-display text-sm shrink-0">
                        {(f.full_name ?? "FD").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display font-bold text-base text-foreground truncate">{f.full_name ?? "Federation Account"}</h3>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">{f.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {scopeBadge(scope)}
                      {!f.is_active && <span className="badge badge-danger">Revoked</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-elevated/60 rounded-xl p-3 mb-4 text-xs">
                    <div>
                      <div className="text-muted-foreground text-[10px] uppercase font-semibold mb-0.5">Scope Type</div>
                      <div className="font-semibold capitalize">{scope}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px] uppercase font-semibold mb-0.5">Jurisdiction</div>
                      <div className="font-semibold">{scopeVal || (scope === "national" ? "All India" : "—")}</div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
                  <div className="text-[11px] text-muted-foreground">
                    Created {new Date(f.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {f.is_active ? (
                      <button
                        onClick={() => setRevokeTarget(f)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition cursor-pointer"
                      >
                        Revoke
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivate(f)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-success text-white hover:bg-success/90 transition cursor-pointer"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateFederationModal
          actorId={user?.id ?? null}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => { setShowCreateModal(false); loadFederations(); }}
        />
      )}

      {/* Revoke Confirm Modal */}
      {revokeTarget && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md animate-fade-up overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="font-display font-bold text-base flex items-center gap-2 text-destructive">
                <Shield className="size-5" /> Revoke Federation Access
              </div>
              <button onClick={() => setRevokeTarget(null)} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-destructive/8 border border-destructive/25 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-destructive">Warning:</span> This will immediately deactivate the account for <span className="font-semibold text-foreground">{revokeTarget.full_name ?? revokeTarget.email}</span>. They will be signed out and lose all portal access.
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2 bg-elevated/30">
              <button onClick={() => setRevokeTarget(null)} className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-elevated cursor-pointer">Cancel</button>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="px-4 py-2 text-sm bg-destructive text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-destructive/90 transition cursor-pointer flex items-center gap-1.5"
              >
                {revoking ? <Loader2 className="size-4 animate-spin" /> : <Shield className="size-4" />}
                Revoke Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const INDIA_DATA: Record<string, string[]> = {
  "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore"],
  "Arunachal Pradesh": ["Itanagar", "Naharlagun"],
  "Assam": ["Guwahati", "Silchar", "Dibrugarh"],
  "Bihar": ["Patna", "Gaya", "Bhagalpur"],
  "Chhattisgarh": ["Raipur", "Bhilai", "Bilaspur"],
  "Goa": ["Panaji", "Margao", "Vasco da Gama"],
  "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot"],
  "Haryana": ["Faridabad", "Gurugram", "Panipat", "Ambala"],
  "Himachal Pradesh": ["Shimla", "Mandi", "Dharamshala"],
  "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad"],
  "Karnataka": ["Bengaluru", "Mysuru", "Hubballi", "Mangaluru"],
  "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode"],
  "Madhya Pradesh": ["Indore", "Bhopal", "Jabalpur", "Gwalior"],
  "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Thane", "Nashik"],
  "Manipur": ["Imphal"],
  "Meghalaya": ["Shillong"],
  "Mizoram": ["Aizawl"],
  "Nagaland": ["Dimapur", "Kohima"],
  "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela"],
  "Punjab": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala"],
  "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota"],
  "Sikkim": ["Gangtok"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli"],
  "Telangana": ["Hyderabad", "Warangal", "Nizamabad"],
  "Tripura": ["Agartala"],
  "Uttar Pradesh": ["Lucknow", "Kanpur", "Ghaziabad", "Agra", "Varanasi", "Meerut"],
  "Uttarakhand": ["Dehradun", "Haridwar", "Roorkee"],
  "West Bengal": ["Kolkata", "Howrah", "Durgapur", "Asansol"],
  "Delhi": ["New Delhi", "Delhi"],
  "Jammu and Kashmir": ["Srinagar", "Jammu"],
  "Chandigarh": ["Chandigarh"]
};
const ALL_STATES = Object.keys(INDIA_DATA).sort();

// ─── Shared Components ────────────────────────────────────────────────────────

function MultiSelectDropdown({
  options,
  selectedValues,
  onChange,
  placeholder,
}: {
  options: { label: string; value: string; hint?: string }[];
  selectedValues: string[];
  onChange: (newValues: string[]) => void;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="input-premium w-full flex items-center justify-between text-left h-10"
      >
        <span className="truncate">
          {selectedValues.length === 0 ? placeholder : `${selectedValues.length} selected`}
        </span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#0B0F17] border border-border-strong rounded-xl shadow-elevated z-30 max-h-60 overflow-y-auto p-1.5 animate-in fade-in slide-in-from-top-2">
            {options.map(opt => (
              <label key={opt.value} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-elevated cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(opt.value)}
                  onChange={e => {
                    if (e.target.checked) {
                      onChange([...selectedValues, opt.value]);
                    } else {
                      onChange(selectedValues.filter(v => v !== opt.value));
                    }
                  }}
                  className="accent-blue-500"
                />
                <span className="flex-1 truncate">{opt.label}</span>
                {opt.hint && <span className="text-[10px] text-muted-foreground shrink-0">{opt.hint}</span>}
              </label>
            ))}
            {options.length === 0 && (
              <div className="px-2 py-3 text-sm text-muted-foreground text-center">No options available</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Create Federation Modal ──────────────────────────────────────────────────

function CreateFederationModal({ actorId, onClose, onSuccess }: {
  actorId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    scope: "national" as FederationScope,
    stateValue: "",
  });
  
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);

  function setF(key: keyof typeof form, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!form.password || form.password.trim().length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (form.scope === "state" && !form.stateValue.trim()) {
      toast.error("Please specify the state for State-level scope");
      return;
    }
    if (form.scope === "custom" && selectedStates.length === 0 && selectedCities.length === 0) {
      toast.error("Custom scope requires at least one state or city");
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const edgeFnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-federation-account`;

      const scopeStates =
        form.scope === "state" ? [form.stateValue.trim()] :
        form.scope === "custom" ? selectedStates :
        [];
      const scopeCities = form.scope === "custom" ? selectedCities : [];

      const res = await fetch(edgeFnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: form.email.trim(),
          fullName: form.name.trim(),
          password: form.password.trim(),
          scopeType: form.scope,
          scopeStates,
          scopeCities,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to create federation account");

      toast.success(`Federation account created for ${form.name.trim()}!`);
      onSuccess();
    } catch (err: any) {
      console.error("Create federation error:", err);
      toast.error(err.message || "Failed to create federation account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl shadow-elevated w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-up">
        <div className="p-5 border-b border-border sticky top-0 bg-surface/95 backdrop-blur-md z-10 flex items-center justify-between">
          <div>
            <div className="font-display font-bold text-lg flex items-center gap-2">
              <Globe className="size-5 text-blue-400" /> Create Federation Portal
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Provision a new federation account with jurisdictional access</div>
          </div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Contact Details */}
          <div className="space-y-4">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">1. Account Details</div>
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Federation / Organisation Name *</span>
              <input type="text" required value={form.name} onChange={e => setF("name", e.target.value)} placeholder="e.g. Maharashtra Boxing Association" className="input-premium" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Login Email *</span>
              <input type="email" required value={form.email} onChange={e => setF("email", e.target.value)} placeholder="admin@federation.in" className="input-premium" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Login Password (min 8 chars) *</span>
              <input type="password" required value={form.password} onChange={e => setF("password", e.target.value)} placeholder="••••••••" className="input-premium" />
            </label>
          </div>

          <div className="border-t border-border" />

          {/* Jurisdiction Scope */}
          <div className="space-y-4">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">2. Jurisdiction Scope</div>

            <div className="grid grid-cols-3 gap-2">
              {([
                { val: "national", label: "National", desc: "All India", icon: Globe2, color: "blue" },
                { val: "state", label: "State", desc: "One state only", icon: MapPin, color: "emerald" },
                { val: "custom", label: "Custom", desc: "Specific regions", icon: Building2, color: "amber" },
              ] as const).map(opt => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setF("scope", opt.val)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition cursor-pointer ${
                    form.scope === opt.val ? `border-${opt.color}-500 bg-${opt.color}-500/8` : "border-border hover:border-border-strong"
                  }`}
                >
                  <opt.icon className={`size-5 ${form.scope === opt.val ? `text-${opt.color}-400` : "text-muted-foreground"}`} />
                  <div className={`text-xs font-bold ${form.scope === opt.val ? `text-${opt.color}-400` : ""}`}>{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                </button>
              ))}
            </div>

            {form.scope === "state" && (
              <label className="block animate-fade-up">
                <span className="block text-xs font-semibold mb-1.5">State Name *</span>
                <select
                  value={form.stateValue}
                  onChange={e => setF("stateValue", e.target.value)}
                  className="input-premium"
                  required
                >
                  <option value="" disabled>Select a state...</option>
                  {ALL_STATES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}

            {form.scope === "custom" && (
              <div className="space-y-4 animate-fade-up">
                <div>
                  <span className="block text-xs font-semibold mb-1.5">1. Select States</span>
                  <MultiSelectDropdown
                    placeholder="Select states..."
                    options={ALL_STATES.map(s => ({ label: s, value: s }))}
                    selectedValues={selectedStates}
                    onChange={(newStates) => {
                      setSelectedStates(newStates);
                      setSelectedCities(prev => prev.filter(c => newStates.some(s => (INDIA_DATA[s] || []).includes(c))));
                    }}
                  />
                  {selectedStates.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {selectedStates.join(", ")}
                    </p>
                  )}
                </div>

                {selectedStates.length > 0 && (
                  <div className="animate-fade-up">
                    <span className="block text-xs font-semibold mb-1.5">2. Select Cities (Jurisdiction)</span>
                    <MultiSelectDropdown
                      placeholder="Select cities..."
                      options={selectedStates
                        .flatMap(s => (INDIA_DATA[s] || []).map(c => ({ state: s, city: c })))
                        .sort((a, b) => a.city.localeCompare(b.city))
                        .map(({ state, city }) => ({ label: city, value: city, hint: state }))}
                      selectedValues={selectedCities}
                      onChange={setSelectedCities}
                    />
                  </div>
                )}
              </div>
            )}

            {form.scope === "national" && (
              <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-3 text-xs text-muted-foreground">
                <span className="font-semibold text-blue-400">National scope:</span> This account will have read-only access to athlete demographics, age categories, and match history for <strong>all athletes</strong> across every academy on the platform.
              </div>
            )}
          </div>

          <div className="border-t border-border" />

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm border border-border rounded-xl hover:bg-elevated cursor-pointer text-muted-foreground hover:text-foreground">Cancel</button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 transition cursor-pointer shadow-card"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Provision Federation Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
