import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Home, User, CreditCard, Calendar, Bell, Settings, MapPin, Swords, Heart } from "lucide-react";
import { useRequireAthlete } from "@/lib/guards";
import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/athlete")({ component: AthleteLayout });

// ── Global athlete access context ───────────────────────────────────────
interface AccessCtx { isUnlocked: boolean; status: string; refresh: () => void; isRolloverPending: boolean; }
const AthleteAccessContext = createContext<AccessCtx>({
  isUnlocked: false, status: "pending_assignment", refresh: () => {}, isRolloverPending: false
});
export function useAthleteAccess() { return useContext(AthleteAccessContext); }

function AthleteLayout() {
  const { session, profile, loading: authLoading } = useRequireAthlete();
  const { user: authUser } = useAuth();
  const [status, setStatus] = useState("pending_assignment");
  const [gender, setGender] = useState<string | null>(null);
  const name = profile?.full_name || "Athlete";

  // ── Reliable access check — single query, JS-side logic ────────────────
  const checkAccess = useCallback(async () => {
    if (!authUser?.id) return;
    try {
      const { data: ap } = await supabase
        .from("boxer_profiles")
        .select("id, gender")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (!ap?.id) {
        setStatus("pending_assignment");
        return;
      }

      // Store gender for conditional nav
      if (ap.gender) setGender(ap.gender);

      const { data: assignment } = await supabase
        .from("fee_assignments")
        .select("id, assignment_status")
        .eq("boxer_profile_id", ap.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!assignment) { setStatus("pending_assignment"); return; }

      const st = assignment.assignment_status;

      if (st === "cash_approved" || st === "online_paid") { setStatus("unlocked"); return; }
      if (st === "rollover_approved") { setStatus("unlocked"); return; }
      if (st === "rollover_pending") { setStatus("rollover_pending"); return; }
      if (st === "cash_pending") { setStatus("payment_required"); return; }

      // Fallback: check if all invoices are paid
      const { data: unpaidInvoices } = await supabase
        .from("invoices")
        .select("id, status")
        .eq("boxer_profile_id", ap.id)
        .neq("status", "paid")
        .limit(1);

      if (unpaidInvoices && unpaidInvoices.length === 0) {
        const { count } = await supabase
          .from("invoices")
          .select("*", { count: "exact", head: true })
          .eq("boxer_profile_id", ap.id);
        if (count && count > 0) { setStatus("unlocked"); return; }
      }

      const hasOverdue = unpaidInvoices?.some(i => i.status === "overdue");
      if (hasOverdue) { setStatus("overdue"); return; }

      setStatus("payment_required");

    } catch (e) {
      console.warn("[ACCESS] exception:", e);
      setStatus("pending_assignment");
    }
  }, [authUser?.id]);

  useEffect(() => {
    if (!authUser?.id) return;

    checkAccess();

    const ch = supabase.channel(`athlete-access-${authUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fee_assignments" }, checkAccess)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, checkAccess)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, checkAccess)
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [authUser?.id, checkAccess]);

  const [academyName, setAcademyName] = useState<string | null>(null);

  useEffect(() => {
    async function loadAcademy() {
      if (!authUser?.id) return;
      const { data: ap } = await supabase
        .from("boxer_profiles")
        .select("academy_id")
        .eq("user_id", authUser.id)
        .maybeSingle();
      if (ap?.academy_id) {
        const { data: ac } = await supabase
          .from("academies")
          .select("name")
          .eq("id", ap.academy_id)
          .maybeSingle();
        if (ac?.name) setAcademyName(ac.name);
      }
    }
    loadAcademy();
  }, [authUser?.id]);

  const isUnlocked = status === "unlocked";
  const isRolloverPending = status === "rollover_pending";
  const isFemale = gender?.toLowerCase() === "female";

  if (authLoading || !session || !profile) {
    return (
      <div className="min-h-screen bg-background grid place-items-center">
        <span className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const workspaceItems: any[] = [
    { to: "", label: "Home", icon: Home },
    { to: "schedule", label: "Schedule", icon: Calendar },
    { to: "attendance", label: "Attendance", icon: MapPin },
    { to: "payments", label: "Payments", icon: CreditCard },
    { to: "bouts", label: "My Bouts", icon: Swords },
    { to: "profile", label: "Profile", icon: User },
  ];

  // Insert Declaration after Payments (index 3) only for female athletes
  if (isFemale) {
    workspaceItems.splice(4, 0, { to: "declaration", label: "Declaration", icon: Heart });
  }

  return (
    <AthleteAccessContext.Provider value={{ isUnlocked, status, refresh: checkAccess, isRolloverPending }}>
      <DashboardLayout
        themeClass="theme-athlete-dark"
        basePath="/athlete"
        role="Athlete"
        userName={name}
        userMeta={academyName ? `Boxing · ${academyName}` : "Boxing"}
        accentClass="text-primary-dark"
        accentBg="bg-primary/10"
        dotColor="bg-primary"
        notificationTo="/athlete/notifications"
        navSections={[
          {
            label: "Workspace",
            items: workspaceItems,
          },
          {
            label: "Account",
            items: [
              { to: "notifications", label: "Notifications", icon: Bell },
              { to: "settings", label: "Manage Account", icon: Settings },
            ],
          },
        ]}
      />
    </AthleteAccessContext.Provider>
  );
}

