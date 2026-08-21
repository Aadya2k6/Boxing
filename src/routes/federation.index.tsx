import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Trophy, Users, Shield, Activity, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/federation/")({
  component: FederationIndex,
});

// ── Derive scope filters ──────────────────────────────────────────────────────
function useFederationFilters() {
  const { profile } = useAuth();
  const perms: any[] = profile?.granted_permissions ?? [];
  const fedPerm = perms.find((p: any) => p?.type === "federation");
  return {
    scope: (fedPerm?.scope ?? "national") as "national" | "state" | "custom",
    value: fedPerm?.value ?? null,
  };
}

function FederationIndex() {
  const { scope, value } = useFederationFilters();
  const [stats, setStats] = useState({ athletes: 0, academies: 0, suspended: 0 });
  const [recentBouts, setRecentBouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Build athlete query filtered by jurisdiction — read-only sports data only
        let athleteQuery = supabase
          .from("boxer_profiles")
          .select("id, state, city, academy_id, is_suspended", { count: "exact", head: false });

        if (scope === "state" && value) {
          athleteQuery = athleteQuery.eq("state", value as string);
        } else if (scope === "custom" && Array.isArray(value)) {
          athleteQuery = athleteQuery.in("city", value as string[]);
        }
        // national: no filter

        const { data: athletes, count: athleteCount } = await athleteQuery;

        // Academy count (distinct academy_ids visible to this federation)
        const visibleAcademyIds = [...new Set((athletes ?? []).map((a: any) => a.academy_id).filter(Boolean))];

        // Count suspended
        const suspendedCount = (athletes ?? []).filter((a: any) => a.is_suspended).length;

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
  }, [scope, value]);

  const METRICS = [
    { icon: Users, label: "Athletes in Jurisdiction", value: loading ? "—" : stats.athletes.toLocaleString(), color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { icon: Shield, label: "Active Academies", value: loading ? "—" : stats.academies.toLocaleString(), color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { icon: Activity, label: "Currently Suspended", value: loading ? "—" : stats.suspended.toLocaleString(), color: "text-rose-500", bg: "bg-rose-500/10" },
    { icon: Trophy, label: "Tournament Bouts", value: loading ? "—" : recentBouts.filter(b => b.bout_kind === "tournament").length.toLocaleString(), color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        title="Federation Overview"
        subtitle="Read-only view of athlete sports data within your jurisdiction"
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {METRICS.map((m) => (
          <div key={m.label} className="bg-surface border border-border p-5 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 ${m.bg} rounded-lg`}>
                <m.icon className={`size-4 ${m.color}`} />
              </div>
              <span className="text-xs font-semibold text-muted-foreground">{m.label}</span>
            </div>
            <div className={`font-display font-bold text-3xl ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Bouts */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display font-bold text-base">Recent Completed Bouts</h3>
            <Link to="/federation/athletes" className="text-xs font-semibold text-indigo-500 hover:underline flex items-center gap-1">
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
                <div key={bout.id} className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 bg-subtle/20">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                      <span>{(bout.red as any)?.full_name ?? "—"}</span>
                      <span className="text-muted-foreground text-xs font-normal">vs</span>
                      <span>{(bout.blue as any)?.full_name ?? "—"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {(bout.age as any)?.name} · {(bout.weight as any)?.weight_class}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ml-3 shrink-0 ${
                    bout.bout_kind === "tournament" ? "bg-amber-500/10 text-amber-600" : "bg-subtle text-muted-foreground"
                  }`}>
                    {bout.bout_kind}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="font-display font-bold text-base mb-4">Quick Actions</h3>
          <div className="space-y-2">
            <Link to="/federation/athletes" className="flex items-center gap-3 p-3 text-sm font-semibold rounded-xl hover:bg-subtle transition-colors">
              <div className="size-8 rounded-lg bg-indigo-500/10 text-indigo-500 grid place-items-center shrink-0">
                <Users className="size-4" />
              </div>
              Browse Athletes
            </Link>
            <Link to="/federation/tournaments" className="flex items-center gap-3 p-3 text-sm font-semibold rounded-xl hover:bg-subtle transition-colors">
              <div className="size-8 rounded-lg bg-amber-500/10 text-amber-500 grid place-items-center shrink-0">
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
