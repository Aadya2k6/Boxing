import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard, Badge, SectionCard, DataTable } from "@/components/dashboard/DashboardLayout";
import { TrendingUp, CheckCircle2, Clock, Building2, MapPin, Radio, Users, Wallet, Shield } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
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
    totalRevenue: 0,
  });
  const [academiesList, setAcademiesList] = useState<any[]>([]);

  // Search query
  const search: { q?: string } = Route.useSearch();
  const q = search.q || "";

  const loadData = useCallback(async () => {
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
      } else {
        setCurrentAcademy(null);
      }

      // 2. Fetch all raw datasets
      const [
        { data: academies, error: acErr },
        { data: boxerProfiles, error: bpErr },
        { data: userProfiles, error: upErr },
        { data: payments, error: payErr },
        { data: invoices, error: invErr }
      ] = await Promise.all([
        supabase.from("academies").select("*").order("name"),
        supabase.from("boxer_profiles").select("id, user_id, academy_id, verification_status, onboarding_complete"),
        supabase.from("profiles").select("id, academy_id, role, full_name, email"),
        supabase.from("payments").select("id, amount, academy_id, status, created_at"),
        supabase.from("invoices").select("id, academy_id, amount_due, amount_paid, status")
      ]);

      if (acErr) console.error("Error fetching academies:", acErr);
      if (bpErr) console.error("Error fetching boxer_profiles:", bpErr);
      if (upErr) console.error("Error fetching profiles:", upErr);
      if (payErr) console.error("Error fetching payments:", payErr);
      if (invErr) console.error("Error fetching invoices:", invErr);

      const allAcademies = academies ?? [];
      const allBoxers = boxerProfiles ?? [];
      const allProfiles = userProfiles ?? [];
      const allPayments = payments ?? [];
      const allInvoices = invoices ?? [];

      // Filter by academy if superadmin is scoped to one academy
      const targetAcademyId = profile?.academy_id;

      const filteredBoxers = targetAcademyId
        ? allBoxers.filter(b => b.academy_id === targetAcademyId)
        : allBoxers;

      const filteredProfiles = targetAcademyId
        ? allProfiles.filter(p => p.academy_id === targetAcademyId)
        : allProfiles;

      const filteredPayments = targetAcademyId
        ? allPayments.filter(p => p.academy_id === targetAcademyId)
        : allPayments;

      const filteredInvoices = targetAcademyId
        ? allInvoices.filter(i => i.academy_id === targetAcademyId)
        : allInvoices;

      // Unique athlete IDs (combine boxer_profiles and athlete user profiles)
      const athleteUserIds = new Set<string>();
      filteredProfiles.filter(p => p.role === "athlete").forEach(p => athleteUserIds.add(p.id));
      filteredBoxers.forEach(b => {
        if (b.user_id) athleteUserIds.add(b.user_id);
        else athleteUserIds.add(b.id);
      });
      const totalAthletesCount = athleteUserIds.size;

      // Verification stats
      const verifiedAthletes = filteredBoxers.filter(b => b.verification_status === "verified" || b.onboarding_complete === true).length;
      const pendingAthletes = Math.max(0, totalAthletesCount - verifiedAthletes);

      // Staff counts
      const totalCoaches = filteredProfiles.filter(p => p.role === "coach").length;
      const totalAdmins = filteredProfiles.filter(p => p.role === "admin").length;

      // Revenue
      const monthlyPayments = filteredPayments.filter(p => p.status === "success" && p.created_at >= startOfMonth);
      const monthlyRevenue = monthlyPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const allSuccessfulPayments = filteredPayments.filter(p => p.status === "success");
      const totalRevenue = allSuccessfulPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      setStats({
        totalAcademies: targetAcademyId ? 1 : allAcademies.length,
        totalAthletes: totalAthletesCount,
        totalCoaches,
        totalAdmins,
        pendingAthletes,
        monthlyRevenue,
        totalRevenue: totalRevenue > 0 ? totalRevenue : monthlyRevenue,
      });

      // Aggregate academy performance list
      const visibleAcademies = targetAcademyId
        ? allAcademies.filter(a => a.id === targetAcademyId)
        : allAcademies;

      const aggregatedAcademies = visibleAcademies.map((a) => {
        // Count athletes assigned to this academy
        const athleteCount = allBoxers.filter(b => b.academy_id === a.id).length
          + allProfiles.filter(p => p.role === "athlete" && p.academy_id === a.id && !allBoxers.some(b => b.user_id === p.id)).length;

        const academyInvoices = allInvoices.filter(inv => inv.academy_id === a.id);
        const academyPayments = allPayments.filter(p => p.academy_id === a.id && p.status === "success");

        const totalDue = academyInvoices.reduce((sum, inv) => sum + Number(inv.amount_due || 0), 0);
        const totalPaid = academyPayments.length > 0
          ? academyPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
          : academyInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0);

        const collectionRate = totalDue > 0 ? Math.min(100, Math.round((totalPaid / totalDue) * 100)) : 100;

        return {
          id: a.id,
          n: a.name,
          city: a.city,
          state: a.state,
          status: a.status ?? "active",
          athletes: athleteCount,
          rev: `₹ ${Number(totalPaid).toLocaleString("en-IN")}`,
          pct: collectionRate,
          st: collectionRate >= 85 ? "Healthy" : collectionRate >= 60 ? "Warning" : "Critical",
          tone: collectionRate >= 85 ? "success" : collectionRate >= 60 ? "warning" : "danger"
        };
      });

      setAcademiesList(aggregatedAcademies);
    } catch (err) {
      console.error("Error loading superadmin dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [profile?.academy_id]);

  useEffect(() => {
    loadData();

    // Live subscriptions
    const channel = supabase
      .channel("superadmin-dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "boxer_profiles" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "academies" }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <span className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const filteredAcademies = academiesList.filter((a) =>
    a.n.toLowerCase().includes(q.toLowerCase()) ||
    (a.city && a.city.toLowerCase().includes(q.toLowerCase()))
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
                      <Radio className="size-3" /> Geofence: {currentAcademy.attendance_radius_meters ?? 200}m
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
        <StatCard label="Total athletes" value={stats.totalAthletes.toString()} hint="Enrolled athletes" />
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
            <span key="ath" className="tabular font-medium">{a.athletes}</span>,
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
                { label: "Total revenue (YTD)", value: `₹ ${stats.totalRevenue.toLocaleString("en-IN")}`, icon: TrendingUp, tone: "text-success" },
                { label: "Total athletes", value: `${stats.totalAthletes}`, icon: Users, tone: "text-success" },
                { label: "Active coaches", value: `${stats.totalCoaches}`, icon: Users, tone: "text-info" },
                { label: "Active admins", value: `${stats.totalAdmins}`, icon: Shield, tone: "text-primary-dark" },
                { label: "Pending onboarding", value: `${stats.pendingAthletes}`, icon: Clock, tone: "text-warning" },
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
                Supabase real-time triggers are active. Invoices and payments are fully synchronized across {stats.totalAcademies} {stats.totalAcademies === 1 ? "academy" : "academies"}.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

