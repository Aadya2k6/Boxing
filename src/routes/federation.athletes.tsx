import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Search, Users, Filter, Shield } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useFederationFilters } from "@/lib/federation";

export const Route = createFileRoute("/federation/athletes")({
  component: FederationAthletes,
});

interface FedAthlete {
  id: string;
  full_name: string;
  gender: string;
  state: string | null;
  city: string | null;
  date_of_birth: string;
  national_federation_boxer_id: string | null;
  record_wins: number;
  record_losses: number;
  record_draws: number;
  record_kos: number;
  is_suspended: boolean;
  age_category: { name: string } | null;
  weight_category: { weight_class: string } | null;
  academy: { name: string } | null;
}

function calcAge(dob: string) {
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

function FederationAthletes() {
  const { scope, states, cities } = useFederationFilters();
  const [athletes, setAthletes] = useState<FedAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "Male" | "Female">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");

  const [queryError, setQueryError] = useState<string | null>(null);
  const [debugStats, setDebugStats] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    setQueryError(null);
    try {
      const [profRes, bpRes, acRes, centerRes] = await Promise.all([
        supabase.from("profiles").select("*").in("role", ["boxer", "athlete"]),
        supabase.from("boxer_profiles").select("*"),
        supabase.from("academies").select("*"),
        supabase.from("centers").select("*"),
      ]);

      if (bpRes.error) console.error("bpRes error:", bpRes.error);
      if (profRes.error) console.error("profRes error:", profRes.error);
      if (acRes.error) console.error("acRes error:", acRes.error);
      if (centerRes.error) console.error("centerRes error:", centerRes.error);

      const bps = bpRes.data || [];
      const profs = profRes.data || [];
      const acs = acRes.data || [];
      const centers = centerRes.data || [];

      const seenIds = new Set<string>();
      const combined: any[] = [];

      for (const bp of bps) {
        const userProf = profs.find(p => p.id === bp.user_id);
        const centerId = bp.center_id || bp.preferred_center_id;
        const center = centers.find(c => c.id === centerId);
        const academyId = bp.academy_id || userProf?.academy_id || center?.academy_id;
        const academy = acs.find(a => a.id === academyId);

        const st = bp.state || center?.state || academy?.state || "";
        const ct = bp.city || center?.city || academy?.city || "";

        seenIds.add(bp.id);
        if (bp.user_id) seenIds.add(bp.user_id);

        combined.push({
          ...bp,
          full_name: bp.full_name || userProf?.full_name || bp.email?.split("@")[0] || "Athlete",
          gender: bp.gender || "Male",
          state: st,
          city: ct,
          academy_id: academyId,
          academy,
          is_suspended: bp.is_suspended ?? false,
          computed_state: st,
          computed_city: ct,
        });
      }

      for (const p of profs) {
        if (!seenIds.has(p.id)) {
          const academy = acs.find(a => a.id === p.academy_id);
          const st = academy?.state || "";
          const ct = academy?.city || "";

          combined.push({
            id: p.id,
            user_id: p.id,
            full_name: p.full_name || p.email?.split("@")[0] || "Athlete",
            gender: "Male",
            state: st,
            city: ct,
            academy_id: p.academy_id,
            academy,
            is_suspended: false,
            computed_state: st,
            computed_city: ct,
          });
        }
      }

      let finalAthletes = combined;
      if (scope === "state" && states.length > 0) {
        finalAthletes = combined.filter(a =>
          states.some(s => a.computed_state && a.computed_state.toLowerCase().trim().includes(s.toLowerCase().trim()))
        );
      } else if (scope === "custom" && cities.length > 0) {
        finalAthletes = combined.filter(a =>
          cities.some(c => a.computed_city && a.computed_city.toLowerCase().trim().includes(c.toLowerCase().trim()))
        );
      }

      finalAthletes.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
      setAthletes((finalAthletes as unknown as FedAthlete[]) || []);

      setDebugStats({
        boxerProfilesCount: bps.length,
        profilesCount: profs.length,
        academiesCount: acs.length,
        centersCount: centers.length,
        totalCombined: combined.length,
        afterFilterCount: finalAthletes.length,
      });
    } catch (err: any) {
      console.error("Federation athletes load error:", err);
      setQueryError(err.message || JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  }, [scope, states, cities]);

  useEffect(() => { load(); }, [load]);

  const filtered = athletes.filter(a => {
    const matchSearch = !search ||
      a.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (a.state ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (a.city ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (a.national_federation_boxer_id ?? "").toLowerCase().includes(search.toLowerCase());
    const matchGender = genderFilter === "all" || a.gender === genderFilter;
    const matchStatus = statusFilter === "all" || (statusFilter === "suspended" ? a.is_suspended : !a.is_suspended);
    return matchSearch && matchGender && matchStatus;
  });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Athlete Roster"
        subtitle={`${athletes.length} athletes in your jurisdiction — read-only sports data`}
      />

      {/* DEBUG TEMPORARY */}
      <div className="bg-red-500/10 border border-red-500 text-red-700 p-4 rounded-lg text-xs space-y-1">
        <strong>DEBUG DIAGNOSTICS:</strong><br/>
        Scope: {scope} | States: {JSON.stringify(states)} | Cities: {JSON.stringify(cities)}<br/>
        DB Rows Fetched &rarr; boxer_profiles: {debugStats.boxerProfilesCount ?? "..."} | profiles: {debugStats.profilesCount ?? "..."} | academies: {debugStats.academiesCount ?? "..."} | centers: {debugStats.centersCount ?? "..."}<br/>
        Combined Total: {debugStats.totalCombined ?? "..."} | After State/City Filter: {debugStats.afterFilterCount ?? "..."}<br/>
        Query Error: {queryError || "None"}
      </div>

      {/* NOTE: No fee, schedule, or attendance data is shown here — Federation privacy boundary */}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, state, city or federation ID…"
            className="input-premium pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={genderFilter}
            onChange={e => setGenderFilter(e.target.value as any)}
            className="input-premium text-sm"
          >
            <option value="all">All Genders</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="input-premium text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <div className="text-xs font-semibold text-muted-foreground shrink-0">{filtered.length} shown</div>
      </div>

      {/* Privacy note */}
      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
        <Shield className="size-3.5 text-indigo-500 shrink-0 mt-0.5" />
        <span>
          <span className="font-semibold text-indigo-600">Privacy Boundary:</span> You can see athlete sports data (name, demographics, category, match record, federation ID). Academy-internal schedules, fee records, and attendance are not accessible to federations.
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground">Loading athletes…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-12 text-center">
          <Users className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.25} />
          <div className="font-semibold text-muted-foreground">No athletes found</div>
          <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/50">
                  <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Athlete</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Age / Gender</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Record</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Location</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Academy</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-elevated/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-sm">{a.full_name}</div>
                      {a.national_federation_boxer_id && (
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">ID: {a.national_federation_boxer_id}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{calcAge(a.date_of_birth)} yrs</div>
                      <div className="text-xs text-muted-foreground">{a.gender}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs">{(a.age_category as any)?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{(a.weight_category as any)?.weight_class ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs tracking-wider">
                        <span className="text-success">{a.record_wins}W</span>
                        <span className="text-muted-foreground mx-0.5">·</span>
                        <span className="text-destructive">{a.record_losses}L</span>
                        <span className="text-muted-foreground mx-0.5">·</span>
                        <span>{a.record_draws}D</span>
                        <span className="text-muted-foreground mx-0.5">·</span>
                        <span className="text-amber-500">{a.record_kos}KO</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs">{[a.city, a.state].filter(Boolean).join(", ") || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-muted-foreground">{(a.academy as any)?.name ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      {a.is_suspended ? (
                        <span className="badge badge-danger text-[10px]">Suspended</span>
                      ) : (
                        <span className="badge badge-success text-[10px]">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
