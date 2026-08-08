import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard, Badge, SectionCard, DataTable, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import {
  UserPlus, AlertTriangle, ChevronRight, Loader2,
  CalendarCheck, Clock, CheckCircle2, Users
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/")({ component: Overview });

function Overview() {
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

  useEffect(() => {
    async function loadData() {
      try {
        const today = new Date().toISOString().split("T")[0];

        const [
          { count: athletesCount },
          { count: pendingCount },
          { data: attendanceToday },
          { data: leaves },
          { data: recentAths },
          { data: invs },
        ] = await Promise.all([
          supabase.from("athlete_profiles").select("*", { count: "exact", head: true }).eq("onboarding_complete", true),
          supabase.from("athlete_profiles").select("*", { count: "exact", head: true }).eq("onboarding_complete", false),
          supabase.from("attendance").select("status").eq("date", today).eq("status", "present"),
          supabase.from("leave_applications")
            .select("id, leave_date, reason, athlete_profiles!leave_applications_athlete_profile_id_fkey(full_name)")
            .eq("status", "pending")
            .order("leave_date", { ascending: true })
            .limit(5),
          supabase.from("athlete_profiles")
            .select("id, full_name, city, bow_type, created_at")
            .eq("onboarding_complete", true)
            .order("created_at", { ascending: false })
            .limit(6),
          supabase.from("invoices").select("amount_due, amount_paid, balance_outstanding, status"),
        ]);

        const totalInvoiced = (invs ?? []).reduce((a: number, i: any) => a + Number(i.amount_due ?? 0), 0);
        const totalCollected = (invs ?? []).reduce((a: number, i: any) => a + Number(i.amount_paid ?? 0), 0);
        const totalOutstanding = (invs ?? []).filter((i: any) => i.status !== "paid").reduce((a: number, i: any) => a + Number(i.balance_outstanding ?? 0), 0);
        const rate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0;

        setStats({
          totalAthletes: athletesCount || 0,
          pendingOnboarding: pendingCount || 0,
          presentToday: attendanceToday?.length || 0,
          pendingLeaves: leaves?.length || 0,
          collectionRate: rate,
          outstanding: totalOutstanding,
        });
        setRecentAthletes(recentAths || []);
        setPendingLeaves(leaves || []);
      } catch (err) {
        console.error("Error loading dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Academy overview"
        subtitle={`${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${stats.totalAthletes} active athletes`}
        actions={
          <Link to="/admin/athletes">
            <button className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition-all shadow-card">
              <Users className="size-3.5" /> Manage athletes
            </button>
          </Link>
        }
      />

      {/* KPIs — athlete management focus, NO financial stats */}
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
            ) : (
              <DataTable
                headers={["Athlete", "City", "Batting style", "Joined"]}
                rows={recentAthletes.map((a) => [
                  <div key="name" className="flex items-center gap-2.5">
                    <AvatarInitials name={a.full_name || "?"} />
                    <span className="font-medium text-sm">{a.full_name || "—"}</span>
                  </div>,
                  <span key="city" className="text-xs text-muted-foreground">{a.city || "—"}</span>,
                  <span key="bow" className="text-xs">{a.bow_type || "—"}</span>,
                  <span key="date" className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
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
                      <p className="text-sm font-medium truncate">{l.athlete_profiles?.full_name ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(l.leave_date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
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
    </div>
  );
}
