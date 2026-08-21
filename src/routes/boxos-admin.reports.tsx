import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, DataTable } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAcademies } from "@/lib/platform-store";
import {
  BarChart3,
  Building2,
  Users,
  CreditCard,
  Trophy,
  TrendingUp,
  Loader2,
  ChevronRight,
  ShieldCheck,
  Calendar,
} from "lucide-react";

export const Route = createFileRoute("/boxos-admin/reports")({ component: PlatformReportsPage });

function PlatformReportsPage() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"all" | "month" | "90days" | "year">("all");

  const [metrics, setMetrics] = useState({
    totalAcademies: 0,
    activeAcademies: 0,
    suspendedAcademies: 0,
    archivedAcademies: 0,
    totalBoxers: 0,
    totalStaff: 0,
    totalRevenue: 0,
    activeTournaments: 0,
  });

  const [topAcademies, setTopAcademies] = useState<
    { id: string; name: string; city: string | null; boxers: number; staff: number; revenue: number; status: string }[]
  >([]);

  useEffect(() => {
    loadPlatformReports();
  }, [dateRange]);

  async function loadPlatformReports() {
    setLoading(true);
    try {
      // 1. Fetch academies
      const acRes = await fetchAcademies();
      const academies = acRes.data;

      const totalAcademies = academies.length;
      const activeAcademies = academies.filter((a: any) => a.status === "active").length;
      const suspendedAcademies = academies.filter((a: any) => a.status === "suspended").length;
      const archivedAcademies = academies.filter((a: any) => a.status === "archived").length;

      // 2. Fetch boxers and staff
      const { data: boxerProfiles } = await supabase.from("boxer_profiles").select("id, academy_id");
      const boxers = boxerProfiles || [];
      const totalBoxers = boxers.length;

      const { data: staffProfiles } = await supabase.from("profiles").select("id, academy_id, role").in("role", ["admin", "superadmin", "coach", "staff"]);
      const staff = staffProfiles || [];
      const totalStaff = staff.length;

      // 3. Fetch payments
      const { data: paymentsRes } = await supabase
        .from("payments")
        .select("amount, status, academy_id, created_at")
        .eq("status", "success");
        
      const payments = paymentsRes || [];

      // Filter payments by date range if applicable
      const now = Date.now();
      const filteredPayments = payments.filter((p: any) => {
        if (dateRange === "all") return true;
        const time = new Date(p.created_at).getTime();
        if (dateRange === "month") return now - time <= 30 * 24 * 60 * 60 * 1000;
        if (dateRange === "90days") return now - time <= 90 * 24 * 60 * 60 * 1000;
        if (dateRange === "year") return now - time <= 365 * 24 * 60 * 60 * 1000;
        return true;
      });

      const totalRevenue = filteredPayments.reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);

      // 4. Fetch tournaments
      const { data: tournaments } = await supabase
        .from("ring_schedule_templates")
        .select("id")
        .eq("template_type", "tournament")
        .eq("is_active", true);

      const activeTournaments = tournaments?.length ?? 0;

      setMetrics({
        totalAcademies,
        activeAcademies,
        suspendedAcademies,
        archivedAcademies,
        totalBoxers,
        totalStaff,
        totalRevenue,
        activeTournaments,
      });

      // Aggregate Top Academies list
      const academyMap: Record<string, { id: string; name: string; city: string | null; boxers: number; staff: number; revenue: number; status: string }> = {};

      academies.forEach((a: any) => {
        academyMap[a.id] = {
          id: a.id,
          name: a.name,
          city: a.city,
          boxers: 0,
          staff: 0,
          revenue: 0,
          status: a.status,
        };
      });

      boxers.forEach((b: any) => {
        if (b.academy_id && academyMap[b.academy_id]) {
          academyMap[b.academy_id].boxers++;
        }
      });
      
      staff.forEach((s: any) => {
        if (s.academy_id && academyMap[s.academy_id]) {
          academyMap[s.academy_id].staff++;
        }
      });

      filteredPayments.forEach((p: any) => {
        if (p.academy_id && academyMap[p.academy_id]) {
          academyMap[p.academy_id].revenue += parseFloat(p.amount) || 0;
        }
      });

      const sorted = Object.values(academyMap).sort((a, b) => b.revenue - a.revenue || b.boxers - a.boxers);
      setTopAcademies(sorted);
    } catch (err: any) {
      console.error("Error loading reports:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Platform Reports"
        subtitle="Cross-academy performance, financial throughput, and tenancy health metrics"
        actions={
          <div className="flex items-center gap-1.5 p-1 bg-elevated rounded-xl">
            {[
              { key: "all", label: "All Time" },
              { key: "month", label: "This Month" },
              { key: "90days", label: "Last 90 Days" },
              { key: "year", label: "This Year" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setDateRange(key as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  dateRange === key ? "bg-surface shadow-card text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {/* Main Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bento-card p-5">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold">Total Academies</span>
            <Building2 className="size-4 text-fuchsia-600" />
          </div>
          <div className="text-3xl font-display font-bold text-foreground">{metrics.totalAcademies}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {metrics.activeAcademies} active · {metrics.suspendedAcademies} suspended
          </div>
        </div>

        <div className="bento-card p-5">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold">Registered Boxers</span>
            <Users className="size-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-display font-bold text-foreground">{metrics.totalBoxers}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Athletes</div>
        </div>
        
        <div className="bento-card p-5">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold">Platform Staff</span>
            <ShieldCheck className="size-4 text-indigo-600" />
          </div>
          <div className="text-3xl font-display font-bold text-foreground">{metrics.totalStaff}</div>
          <div className="text-xs text-muted-foreground mt-1">Admins & Coaches</div>
        </div>

        <div className="bento-card p-5">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold">Total Revenue</span>
            <CreditCard className="size-4 text-blue-600" />
          </div>
          <div className="text-3xl font-display font-bold text-foreground">
            ₹{metrics.totalRevenue.toLocaleString("en-IN")}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Successful fee transactions</div>
        </div>

        <div className="bento-card p-5">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold">Active Tournaments</span>
            <Trophy className="size-4 text-amber-500" />
          </div>
          <div className="text-3xl font-display font-bold text-foreground">{metrics.activeTournaments}</div>
          <div className="text-xs text-muted-foreground mt-1">Live competition rings</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Status Distribution */}
        <div className="bento-card p-5 space-y-4">
          <h3 className="font-display font-bold text-base">Academies by Status</h3>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-emerald-600">Active</span>
                <span className="font-bold">{metrics.activeAcademies}</span>
              </div>
              <div className="h-2 bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{
                    width: metrics.totalAcademies ? `${(metrics.activeAcademies / metrics.totalAcademies) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-amber-600">Suspended</span>
                <span className="font-bold">{metrics.suspendedAcademies}</span>
              </div>
              <div className="h-2 bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{
                    width: metrics.totalAcademies ? `${(metrics.suspendedAcademies / metrics.totalAcademies) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-muted-foreground">Archived</span>
                <span className="font-bold">{metrics.archivedAcademies}</span>
              </div>
              <div className="h-2 bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-muted-foreground rounded-full transition-all"
                  style={{
                    width: metrics.totalAcademies ? `${(metrics.archivedAcademies / metrics.totalAcademies) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border text-xs text-muted-foreground leading-relaxed">
            Platform health is rated healthy when &gt;90% of academies maintain active compliance status.
          </div>
        </div>

        {/* Top Academies by Activity */}
        <div className="lg:col-span-2">
          <SectionCard title="Academy Ranking" subtitle="Ranked by fee revenue and registered boxers">
            {loading ? (
              <div className="py-12 text-center">
                <Loader2 className="size-6 animate-spin mx-auto text-fuchsia-600 mb-2" />
                <div className="text-xs text-muted-foreground">Compiling platform rankings…</div>
              </div>
            ) : topAcademies.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No academy data to rank.</div>
            ) : (
              <DataTable
                headers={["Academy", "Location", "Boxers", "Staff", "Revenue", "Status", ""]}
                rows={topAcademies.slice(0, 10).map((a, idx) => [
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground font-mono">#{idx + 1}</span>
                    <span className="font-semibold text-sm text-foreground">{a.name}</span>
                  </div>,
                  <span className="text-xs text-muted-foreground">{a.city || "—"}</span>,
                  <span className="font-semibold text-sm tabular">{a.boxers}</span>,
                  <span className="font-semibold text-sm tabular">{a.staff}</span>,
                  <span className="font-semibold text-sm tabular text-foreground">₹{a.revenue.toLocaleString("en-IN")}</span>,
                  <span className={`badge ${a.status === "active" ? "badge-success" : a.status === "suspended" ? "badge-warning" : "badge-neutral"}`}>
                    {a.status}
                  </span>,
                  <Link
                    to="/boxos-admin/academies/$academyId"
                    params={{ academyId: a.id }}
                    className="p-1 hover:text-fuchsia-600 transition"
                  >
                    <ChevronRight className="size-4" />
                  </Link>,
                ])}
              />
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
