import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Trophy, Users, Shield, Activity, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Link } from "@tanstack/react-router";
import { useFederationFilters } from "@/lib/federation";

export const Route = createFileRoute("/federation/")({
  component: FederationIndex,
});

// ── Federation Index ──────────────────────────────────────────────────────────

function FederationIndex() {
  const { scope, states, cities } = useFederationFilters();
  const [stats, setStats] = useState({ athletes: 0, academies: 0, suspended: 0 });
  const [recentBouts, setRecentBouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Build athlete query filtered by jurisdiction — read-only sports data only
        const [profRes, bpRes, acRes, centerRes] = await Promise.all([
          supabase.from("profiles").select("*").in("role", ["boxer", "athlete"]),
          supabase.from("boxer_profiles").select("*"),
          supabase.from("academies").select("*"),
          supabase.from("centers").select("*"),
        ]);
        
        const bps = bpRes.data || [];
        const profs = profRes.data || [];
        const acs = acRes.data || [];
        const centers = centerRes.data || [];

        let allAthletes: any[] = [];
        const seenIds = new Set<string>();

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
          allAthletes.push({
            ...bp,
            computed_state: st,
            computed_city: ct,
          });
        }

        for (const p of profs) {
          if (!seenIds.has(p.id)) {
            const academy = acs.find(a => a.id === p.academy_id);
            allAthletes.push({
              ...p,
              computed_state: academy?.state || "",
              computed_city: academy?.city || "",
              is_suspended: false,
            });
          }
        }
        
        let filteredAthletes = allAthletes;
        if (scope === "state" && states.length > 0) {
          filteredAthletes = filteredAthletes.filter(a => 
            states.some(s => a.computed_state && a.computed_state.toLowerCase().trim().includes(s.toLowerCase().trim()))
          );
        } else if (scope === "custom" && cities.length > 0) {
          filteredAthletes = filteredAthletes.filter(a => 
            cities.some(c => a.computed_city && a.computed_city.toLowerCase().trim().includes(c.toLowerCase().trim()))
          );
        }

        const athleteCount = filteredAthletes.length;

        // Academy count (distinct academy_ids visible to this federation)
        const visibleAcademyIds = [...new Set((filteredAthletes ?? []).map((a: any) => a.academy_id).filter(Boolean))];

        // Count suspended
        const suspendedCount = (filteredAthletes ?? []).filter((a: any) => a.is_suspended).length;

        setStats({
          athletes: athleteCount ?? 0,
          academies: visibleAcademyIds.length,
          suspended: suspendedCount,
        });

        // Recent completed bouts — public sports data
        const { data: bouts } = await supabase
          .from("bouts")
          .select(`
            id, status, bout_kind, created_at,
            red:boxer_red_id(full_name, state),
            blue:boxer_blue_id(full_name, state),
            age:age_category_id(name),
            weight:weight_category_id(weight_class)
          `)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(5);

        setRecentBouts(bouts ?? []);
      } catch (err) {
        console.error("Federation dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [scope, states, cities]);

  const METRICS = [
    { icon: Users, label: "Athletes in Jurisdiction", value: loading ? "—" : stats.athletes.toLocaleString(), color: "text-blue-400", bg: "bg-blue-500/10 border border-blue-500/20" },
    { icon: Shield, label: "Active Academies", value: loading ? "—" : stats.academies.toLocaleString(), color: "text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20" },
    { icon: Activity, label: "Currently Suspended", value: loading ? "—" : stats.suspended.toLocaleString(), color: "text-rose-400", bg: "bg-rose-500/10 border border-rose-500/20" },
    { icon: Trophy, label: "Tournament Bouts", value: loading ? "—" : recentBouts.filter(b => b.bout_kind === "tournament").length.toLocaleString(), color: "text-amber-400", bg: "bg-amber-500/10 border border-amber-500/20" },
  ];

  return (
    <div className="animate-fade-up space-y-8 relative">
      {/* Subtle Arena Fog */}
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[900px] h-[900px] top-0 right-0 -translate-y-1/3 translate-x-1/3 opacity-30 pointer-events-none" />
      <div className="atmosphere-base atmosphere-red animate-ambient-drift w-[600px] h-[600px] bottom-0 left-0 translate-y-1/3 -translate-x-1/3 opacity-20 pointer-events-none" style={{ animationDelay: '-4s' }} />

      <PageHeader
        title="Federation Overview"
        subtitle="Read-only view of athlete sports data within your jurisdiction"
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
        {METRICS.map((m) => (
          <div key={m.label} className="bg-surface border border-border p-5 rounded-2xl shadow-card hover:border-border-strong transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 ${m.bg} rounded-xl`}>
                <m.icon className={`size-4 ${m.color}`} />
              </div>
              <span className="text-xs font-semibold text-muted-foreground">{m.label}</span>
            </div>
            <div className="font-display font-bold text-3xl text-foreground">{m.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        {/* Recent Bouts */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-6 shadow-card">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display font-bold text-base text-foreground">Recent Completed Bouts</h3>
            <Link to="/federation/athletes" className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition flex items-center gap-1">
              View Athletes <ArrowRight className="size-3" />
            </Link>
          </div>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : recentBouts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground italic">No completed bouts yet</div>
          ) : (
            <div className="space-y-3">
              {recentBouts.map((bout) => (
                <div key={bout.id} className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 bg-subtle/20 hover:bg-subtle/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold flex items-center gap-2 flex-wrap text-foreground">
                      <span>{(bout.red as any)?.full_name ?? "—"}</span>
                      <span className="text-muted-foreground text-xs font-normal">vs</span>
                      <span>{(bout.blue as any)?.full_name ?? "—"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {(bout.age as any)?.name} · {(bout.weight as any)?.weight_class}
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ml-3 shrink-0 border ${
                    bout.bout_kind === "tournament" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-subtle text-muted-foreground border-border"
                  }`}>
                    {bout.bout_kind}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-card">
          <h3 className="font-display font-bold text-base text-foreground mb-4">Quick Actions</h3>
          <div className="space-y-2">
            <Link to="/federation/athletes" className="flex items-center gap-3 p-3 text-sm font-semibold text-foreground rounded-xl hover:bg-subtle/60 border border-transparent hover:border-border transition-all">
              <div className="size-8 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 grid place-items-center shrink-0">
                <Users className="size-4" />
              </div>
              Browse Athletes
            </Link>
            <Link to="/federation/tournaments" className="flex items-center gap-3 p-3 text-sm font-semibold text-foreground rounded-xl hover:bg-subtle/60 border border-transparent hover:border-border transition-all">
              <div className="size-8 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 grid place-items-center shrink-0">
                <Trophy className="size-4" />
              </div>
              Manage Tournaments
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
