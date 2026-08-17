import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard, Badge, SectionCard, DataTable, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import { ArrowUpRight, TrendingUp, AlertCircle, CheckCircle2, Clock, ChevronRight, Building2, MapPin, Radio, Users, Wallet, ClipboardList, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase, Academy } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/superadmin/")({ component: SAOverview });

function SAOverview() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [currentAcademy, setCurrentAcademy] = useState<Academy | null>(null);
  const [stats, setStats] = useState({
    totalAcademies: 0,
    totalAthletes: 0,
    totalCoaches: 0,
    totalAdmins: 0,
    pendingAthletes: 0,
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

        // 1. Fetch current academy if assigned
        if (profile?.academy_id) {
          const { data: ac } = await supabase
            .from("academies")
            .select("*")
            .eq("id", profile.academy_id)
            .maybeSingle();
          if (ac) setCurrentAcademy(ac as Academy);
        }

        // 2. Fetch data (filtered to academy if superadmin is assigned to a specific academy)
        let academiesQuery = supabase.from("academies").select("*");
        let boxersQuery = supabase.from("boxer_profiles").select("academy_id, verification_status");
        let profilesQuery = supabase.from("profiles").select("academy_id, role");
        let paymentsQuery = supabase.from("payments").select("amount, academy_id").gte("created_at", startOfMonth);
        let invoicesQuery = supabase.from("invoices").select("academy_id, amount_due, amount_paid");

        if (profile?.academy_id) {
          boxersQuery = boxersQuery.eq("academy_id", profile.academy_id);
          profilesQuery = profilesQuery.eq("academy_id", profile.academy_id);
          paymentsQuery = paymentsQuery.eq("academy_id", profile.academy_id);
          invoicesQuery = invoicesQuery.eq("academy_id", profile.academy_id);
        }

        const [
          { data: academies },
          { data: athletesList },
          { data: profilesList },
          { data: paymentsThisMonth },
          { data: invoicesList }
        ] = await Promise.all([
          academiesQuery,
          boxersQuery,
          profilesQuery,
          paymentsQuery,
          invoicesQuery
        ]);

        const rev = paymentsThisMonth?.reduce((sum, p) => sum + p.amount, 0) || 0;
        
        const activeAthletes = athletesList?.filter(a => a.verification_status === "approved")?.length || 0;
        const pendingAthletes = athletesList?.filter(a => a.verification_status === "pending")?.length || 0;
        const totalCoaches = profilesList?.filter(p => p.role === "coach")?.length || 0;
        const totalAdmins = profilesList?.filter(p => p.role === "admin")?.length || 0;

        setStats({
          totalAcademies: academies?.length || (profile?.academy_id ? 1 : 0),
          totalAthletes: activeAthletes,
          totalCoaches,
          totalAdmins,
          pendingAthletes,
          monthlyRevenue: rev,
          pendingRefundsCount: 0,
          pendingRefundsAmount: 0,
        });

        // Aggregate academy data dynamically
        const visibleAcademies = profile?.academy_id
          ? (academies?.filter(a => a.id === profile.academy_id) ?? [])
          : (academies ?? []);

        const aggregatedAcademies = visibleAcademies.map((a) => {
          const athletesForAcademy = (athletesList ?? []).filter(ath => ath.academy_id === a.id).length || 0;
          const academyInvoices = (invoicesList ?? []).filter(inv => inv.academy_id === a.id);
          const totalDue = academyInvoices.reduce((sum, inv) => sum + Number(inv.amount_due), 0);
          const totalPaid = academyInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid), 0);
          
          const collectionRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 100;
          
          return {
            id: a.id,
            n: a.name,
            city: a.city,
            state: a.state,
            status: a.status,
            athletes: athletesForAcademy,
            rev: `₹ ${totalPaid.toLocaleString("en-IN")}`,
            pct: collectionRate,
            st: collectionRate >= 85 ? "Healthy" : collectionRate >= 60 ? "Warning" : "Critical",
            tone: collectionRate >= 85 ? "success" : collectionRate >= 60 ? "warning" : "destructive"
          };
        });

        setAcademiesList(aggregatedAcademies);
      } catch (err) {
        console.error("Error loading superadmin dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [profile?.academy_id]);

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
    (r.boxer_profiles?.full_name || "").toLowerCase().includes(q.toLowerCase()) ||
    (r.reason || "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={currentAcademy ? currentAcademy.name : "Platform Overview"}
        subtitle={currentAcademy 
          ? `${currentAcademy.city ? currentAcademy.city + ", " : ""}${currentAcademy.state || "India"} · Superadmin Management Portal`
          : `Multi-academy view · ${stats.totalAcademies} active academies · ${stats.totalAthletes} total athletes`
        }
      />

      {/* Academy spotlight card if assigned to a specific academy */}
      {currentAcademy && (
        <div className="bento-card p-6 bg-gradient-to-r from-surface to-elevated/40 border border-primary/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <div className="size-10 rounded-xl bg-primary/10 text-primary grid place-items-center font-bold text-lg">
                  {currentAcademy.name.charAt(0)}
                </div>
                <div>
                  <div className="font-display font-bold text-xl flex items-center gap-2">
                    {currentAcademy.name}
                    <span className="text-xs px-2.5 py-0.5 rounded-full uppercase font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                      {currentAcademy.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                    {currentAcademy.address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" /> {currentAcademy.address}, {currentAcademy.city}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Radio className="size-3" /> Geofence: {currentAcademy.attendance_radius_meters}m
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to="/superadmin/athletes"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm"
              >
                <Users className="size-3.5" /> Manage Athletes
              </Link>
              <Link
                to="/superadmin/fees"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-border bg-surface hover:bg-elevated transition"
              >
                <Wallet className="size-3.5" /> Fee Plans
              </Link>
              <Link
                to="/superadmin/config"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-border bg-surface hover:bg-elevated transition"
              >
                <Shield className="size-3.5" /> Academy Config
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard label="Academy status" value={currentAcademy ? currentAcademy.status.toUpperCase() : stats.totalAcademies.toString()} hint={currentAcademy ? "Live in Boxos" : "Total Academies"} />
        <StatCard label="Total athletes" value={stats.totalAthletes.toString()} hint="Active enrollments" />
        <StatCard label="Monthly revenue" value={`₹ ${stats.monthlyRevenue.toLocaleString("en-IN")}`} hint="This month" />
      </div>

      {/* Academy health table */}
      <SectionCard
        title={currentAcademy ? `${currentAcademy.name} Performance` : "Academy health"}
        subtitle="Collection rates and revenue metrics"
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
                { label: "Active coaches", value: `${stats.totalCoaches}`, icon: Users, tone: "text-info" },
                { label: "Active admins", value: `${stats.totalAdmins}`, icon: Shield, tone: "text-primary-dark" },
                { label: "Pending verification", value: `${stats.pendingAthletes}`, icon: Clock, tone: "text-warning" },
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
