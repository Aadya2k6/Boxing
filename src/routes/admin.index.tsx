import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard, SectionCard, DataTable, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import {
  ChevronRight, Loader2,
  CalendarCheck, Clock, CheckCircle2, Users
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/")({ component: Overview });

function Overview() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalAthletes: 0,
    pendingOnboarding: 0,
    presentToday: 0,
    pendingLeaves: 0,
    collectionRate: 0,
    outstanding: 0,
  });
  const [recentAthletes, setRecentAthletes] = useState<any[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const academyId = profile?.academy_id;

      // Security: never run unfiltered cross-academy queries.
      // An admin without an academy_id is a misconfigured account — abort early.
      if (!academyId) {
        setLoading(false);
        return;
      }

      const boxersQuery = supabase.from("boxer_profiles").select("id, user_id, full_name, city, stance, onboarding_complete, verification_status, created_at, academy_id").eq("academy_id", academyId);
      const profilesQuery = supabase.from("profiles").select("id, full_name, email, role, academy_id").eq("academy_id", academyId);
      const attendanceQuery = supabase.from("attendance").select("id, status, session_date, academy_id").eq("session_date", today).eq("status", "present").eq("academy_id", academyId);
      const leavesQuery = supabase.from("leave_applications").select("id, start_date, end_date, reason, status, academy_id, boxer_profiles(full_name)").eq("status", "pending").eq("academy_id", academyId).order("start_date", { ascending: true }).limit(5);
      const invoicesQuery = supabase.from("invoices").select("amount_due, amount_paid, status, academy_id").eq("academy_id", academyId);

      const [
        { data: boxers },
        { data: userProfiles },
        { data: attendanceToday },
        { data: leaves },
        { data: invs },
      ] = await Promise.all([
        boxersQuery,
        profilesQuery,
        attendanceQuery,
        leavesQuery,
        invoicesQuery,
      ]);

      const allBoxers = boxers ?? [];
      const athleteProfiles = (userProfiles ?? []).filter(p => p.role === "athlete");

      // Unique athlete count
      const athleteUserIds = new Set<string>();
      athleteProfiles.forEach(p => athleteUserIds.add(p.id));
      allBoxers.forEach(b => {
        if (b.user_id) athleteUserIds.add(b.user_id);
        else athleteUserIds.add(b.id);
      });
      const totalAthletes = athleteUserIds.size;

      // Pending onboarding
      const verifiedAthletes = allBoxers.filter(b => b.verification_status === "verified" || b.onboarding_complete === true).length;
      const pendingOnboarding = Math.max(0, totalAthletes - verifiedAthletes);

      // Financials
      const totalInvoiced = (invs ?? []).reduce((a: number, i: any) => a + Number(i.amount_due ?? 0), 0);
      const totalCollected = (invs ?? []).reduce((a: number, i: any) => a + Number(i.amount_paid ?? 0), 0);
      const totalOutstanding = (invs ?? []).filter((i: any) => i.status !== "paid").reduce((a: number, i: any) => a + Math.max(0, Number(i.amount_due ?? 0) - Number(i.amount_paid ?? 0)), 0);
      const rate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 100;

      setStats({
        totalAthletes,
        pendingOnboarding,
        presentToday: attendanceToday?.length || 0,
        pendingLeaves: leaves?.length || 0,
        collectionRate: rate,
        outstanding: totalOutstanding,
      });

      // Recent athletes
      const sortedBoxers = [...allBoxers].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0, 6);
      setRecentAthletes(sortedBoxers);
      setPendingLeaves(leaves ?? []);
    } catch (err) {
      console.error("Error loading admin dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [profile?.academy_id]);

  useEffect(() => {
    loadData();

    const channel = supabase.channel("admin-dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "boxer_profiles" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_applications" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  return (
    <div className="animate-fade-up space-y-6">
      {/* Guard: admin must have an academy assigned */}
      {!profile?.academy_id && !loading && (
        <div className="bento-card p-8 border-destructive/20 bg-destructive/5 text-center">
          <div className="text-destructive font-semibold mb-2">No academy assigned to your account</div>
          <div className="text-sm text-muted-foreground">Your admin account is not linked to any academy. Please contact your system administrator.</div>
        </div>
      )}
      {profile?.academy_id && (
        <>
        <PageHeader
          title="Academy Overview"
          subtitle={`${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${stats.totalAthletes} active athletes`}
          actions={
            <Link to="/admin/athletes">
              <button className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition-all shadow-card cursor-pointer">
                <Users className="size-3.5" /> Manage Athletes
              </button>
            </Link>
          }
        />

      {/* KPIs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total athletes" value={loading ? "—" : stats.totalAthletes.toString()} />
        <StatCard label="Present today" value={loading ? "—" : stats.presentToday.toString()} deltaTone={undefined} hint="Marked via geo-fence" />
        <StatCard label="Pending leaves" value={loading ? "—" : stats.pendingLeaves.toString()} deltaTone={stats.pendingLeaves > 0 ? "warning" : undefined} hint={stats.pendingLeaves > 0 ? "Requires action" : undefined} />
        <StatCard label="Pending onboarding" value={loading ? "—" : stats.pendingOnboarding.toString()} deltaTone={undefined} hint="Awaiting package assignment" />
        <StatCard label="Collection rate" value={loading ? "—" : `${stats.collectionRate}%`} deltaTone={stats.collectionRate >= 80 ? undefined : "warning"} hint={loading ? undefined : `₹${(stats.outstanding / 1000).toFixed(0)}k outstanding`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent athletes */}
        <div className="lg:col-span-2">
          <SectionCard
            title="Recently onboarded athletes"
            action={
              <Link to="/admin/athletes" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                View all <ChevronRight className="size-3.5" />
              </Link>
            }
          >
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            ) : recentAthletes.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No recent athletes found</div>
            ) : (
              <DataTable
                headers={["Athlete", "City", "Stance", "Joined"]}
                rows={recentAthletes.map((a) => [
                  <div key="name" className="flex items-center gap-2.5">
                    <AvatarInitials name={a.full_name || "?"} />
                    <span className="font-medium text-sm">{a.full_name || "—"}</span>
                  </div>,
                  <span key="city" className="text-xs text-muted-foreground">{a.city || "—"}</span>,
                  <span key="stance" className="text-xs capitalize">{a.stance || "—"}</span>,
                  <span key="date" className="text-xs text-muted-foreground">
                    {a.created_at ? new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                  </span>,
                ])}
              />
            )}
          </SectionCard>
        </div>

        {/* Pending leave requests */}
        <div className="space-y-4">
          <SectionCard
            title="Pending leaves"
            action={
              <Link to="/admin/attendance" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                Manage <ChevronRight className="size-3.5" />
              </Link>
            }
          >
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
            ) : pendingLeaves.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                <CheckCircle2 className="size-5 text-success" />
                No pending leave requests
              </div>
            ) : (
              <div className="space-y-2">
                {pendingLeaves.map(l => (
                  <div key={l.id} className="flex items-start gap-3 p-3 rounded-lg bg-subtle hover:bg-elevated transition">
                    <Clock className="size-4 text-warning mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{l.boxer_profiles?.full_name ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.start_date ? new Date(l.start_date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : "—"}
                        {l.end_date && l.end_date !== l.start_date ? ` to ${new Date(l.end_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <div className="bento-card p-5 border-info/25 bg-info/5">
            <CalendarCheck className="size-5 text-info mb-3" />
            <div className="text-sm font-semibold mb-1">Attendance today</div>
            <div className="text-2xl font-display font-bold text-info">
              {loading ? "—" : stats.presentToday}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              athletes marked present via geo-fence
            </div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

