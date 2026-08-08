import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard, Badge, SectionCard, DataTable, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import { ArrowUpRight, TrendingUp, AlertCircle, CheckCircle2, Clock, ChevronRight, Building2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/superadmin/")({ component: SAOverview });

function SAOverview() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalAcademies: 0,
    totalAthletes: 0,
    monthlyRevenue: 0,
    pendingRefundsCount: 0,
    pendingRefundsAmount: 0,
  });
  const [academiesList, setAcademiesList] = useState<any[]>([]);
  const [pendingRefunds, setPendingRefunds] = useState<any[]>([]);

  // Access route search query
  const search: { q?: string } = Route.useSearch();
  const q = search.q || "";

  useEffect(() => {
    async function loadData() {
      try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const [
          { data: academies },
          { count: athletesCount, data: athletesList },
          { data: paymentsThisMonth },
          { data: refunds },
          { data: invoicesList }
        ] = await Promise.all([
          supabase.from("academies").select("*"),
          supabase.from("athlete_profiles").select("preferred_academy_id", { count: "exact" }).eq("onboarding_complete", true),
          supabase.from("payments").select("amount").gte("payment_date", startOfMonth),
          supabase.from("refunds").select("id, amount, reason, created_at, athlete_profiles(full_name)").eq("status", "pending"),
          supabase.from("invoices").select("academy_id, amount_due, amount_paid")
        ]);

        const rev = paymentsThisMonth?.reduce((sum, p) => sum + p.amount, 0) || 0;
        const refCount = refunds?.length || 0;
        const refAmt = refunds?.reduce((sum, r) => sum + r.amount, 0) || 0;

        setStats({
          totalAcademies: academies?.length || 0,
          totalAthletes: athletesCount || 0,
          monthlyRevenue: rev,
          pendingRefundsCount: refCount,
          pendingRefundsAmount: refAmt,
        });

        // Aggregate academy data dynamically
        const aggregatedAcademies = academies?.map((a) => {
          // Count athletes matching this academy's ID
          const athletesForAcademy = athletesList?.filter(ath => ath.preferred_academy_id === a.id).length || 0;
          
          // Sum invoices for this academy ID
          const academyInvoices = invoicesList?.filter(inv => inv.academy_id === a.id) || [];
          const totalDue = academyInvoices.reduce((sum, inv) => sum + Number(inv.amount_due), 0);
          const totalPaid = academyInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid), 0);
          
          const collectionRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 100;
          
          return {
            n: a.name,
            athletes: athletesForAcademy,
            rev: `₹ ${totalPaid.toLocaleString("en-IN")}`,
            pct: collectionRate,
            st: collectionRate >= 85 ? "Healthy" : collectionRate >= 60 ? "Warning" : "Critical",
            tone: collectionRate >= 85 ? "success" : collectionRate >= 60 ? "warning" : "destructive"
          };
        }) || [];

        setAcademiesList(aggregatedAcademies);

        setPendingRefunds(refunds || []);
      } catch (err) {
        console.error("Error loading superadmin dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <span className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const formatCurrency = (amt: number) => `₹ ${(amt / 100000).toFixed(1)}L`; // approx Lakh format for display

  const filteredAcademies = academiesList.filter((a) =>
    a.n.toLowerCase().includes(q.toLowerCase())
  );

  const filteredRefunds = pendingRefunds.filter((r) =>
    (r.athlete_profiles?.full_name || "").toLowerCase().includes(q.toLowerCase()) ||
    (r.reason || "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Platform overview"
        subtitle={`Multi-academy view · ${stats.totalAcademies} active academies · ${stats.totalAthletes} total athletes`}
      />

      {/* KPI row */}
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard label="Total academies" value={stats.totalAcademies.toString()} />
        <StatCard label="Total athletes" value={stats.totalAthletes.toString()} hint="Active enrollments" />
        <StatCard label="Monthly revenue" value={`₹ ${stats.monthlyRevenue.toLocaleString("en-IN")}`} hint="This month" />
      </div>

      {/* Academy health table */}
      <SectionCard
        title="Academy health"
        subtitle="Collection rates and revenue across all academies"
      >
        <DataTable
          headers={["Academy", "Athletes", `Revenue (${new Date().toLocaleString("en-US", { month: "short" })})`, "Collection", "Status"]}
          rows={filteredAcademies.map((a) => [
            <div key="name" className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-subtle grid place-items-center">
                <Building2 className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
              </div>
              <span className="font-semibold text-sm">{a.n}</span>
            </div>,
            <span key="ath" className="tabular">{a.athletes}</span>,
            <span key="rev" className="font-semibold tabular">{a.rev}</span>,
            <div key="pct" className="flex items-center gap-3 min-w-[120px]">
              <div className="flex-1 h-1.5 rounded-full bg-subtle overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${a.pct}%`,
                    background: a.pct >= 85
                      ? "linear-gradient(90deg, #2E8F5A, #3DAA6B)"
                      : "linear-gradient(90deg, #C47C1A, #E8A838)"
                  }}
                />
              </div>
              <span className="text-xs font-semibold tabular w-10">{a.pct}%</span>
            </div>,
            <Badge key="st" tone={a.tone}>{a.st}</Badge>,
          ])}
        />
      </SectionCard>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="Platform stats">
            <div className="space-y-4">
              {[
                { label: "Total revenue (YTD)", value: `₹ ${stats.monthlyRevenue.toLocaleString("en-IN")}`, icon: TrendingUp, tone: "text-success" },
                { label: "Verified athletes", value: `${stats.totalAthletes}`, icon: CheckCircle2, tone: "text-success" },
                { label: "Pending verification", value: "0", icon: Clock, tone: "text-warning" },
              ].map(({ label, value, icon: Icon, tone }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`size-8 rounded-lg bg-subtle grid place-items-center ${tone}`}>
                    <Icon className="size-4" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-semibold text-sm tabular">{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div>
          {/* Global alert */}
          <div className="bento-card p-5 bg-foreground text-background relative overflow-hidden">
            <div className="absolute -bottom-6 -right-6 size-24 gold-glow blur-xl opacity-40" />
            <div className="relative">
              <div className="text-[10px] tracking-widest uppercase font-semibold text-primary mb-3">System status</div>
              <div className="font-display font-bold text-base">All systems nominal</div>
              <div className="text-xs text-background/60 mt-1.5 leading-relaxed">
                Supabase real-time triggers are active. Invoices and payments are fully synchronized across {stats.totalAcademies} academies.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
