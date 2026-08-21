import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Search, Users, Filter, Shield } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

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

function useFederationFilters() {
  const { profile } = useAuth();
  const perms: any[] = profile?.granted_permissions ?? [];
  const fedPerm = perms.find((p: any) => p?.type === "federation");
  return {
    scope: (fedPerm?.scope ?? "national") as "national" | "state" | "custom",
    value: fedPerm?.value ?? null,
  };
}

function calcAge(dob: string) {
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

function FederationAthletes() {
  const { scope, value } = useFederationFilters();
  const [athletes, setAthletes] = useState<FedAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "Male" | "Female">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("boxer_profiles")
        .select(`
          id, full_name, gender, state, city, date_of_birth,
          national_federation_boxer_id, record_wins, record_losses, record_draws,
          record_kos, is_suspended,
          age_category:age_category_id(name),
          weight_category:weight_category_id(weight_class),
          academy:academy_id(name)
        `)
        .order("full_name");

      // Apply jurisdiction filter
      if (scope === "state" && value) {
        query = query.eq("state", value as string);
      } else if (scope === "custom" && Array.isArray(value)) {
        query = query.in("city", value as string[]);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAthletes((data ?? []) as unknown as FedAthlete[]);
    } catch (err: any) {
      console.error("Federation athletes load error:", err);
    } finally {
      setLoading(false);
    }
  }, [scope, value]);

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
