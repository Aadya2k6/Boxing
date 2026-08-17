import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Home, User, CreditCard, Calendar, FileText, Bell, Settings, MapPin, Swords } from "lucide-react";
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
  const name = profile?.full_name || "Athlete";

  // ── Reliable access check — single query, JS-side logic ────────────────
  // Fetches the athlete's fee_assignment and checks status in JavaScript.
  // If status is 'cash_approved' or 'online_paid' → unlock.
  // Also checks if all invoices are paid as a fallback.
  const checkAccess = useCallback(async () => {
    if (!authUser?.id) return;
    try {
      let { data: ap, error: apErr } = await supabase
        .from("athlete_profiles")
        .select("id")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (!ap?.id) {
        const { data: newAp } = await supabase
          .from("athlete_profiles")
          .upsert({
            user_id: authUser.id,
            full_name: profile?.full_name || authUser.email?.split("@")[0] || "Athlete",
            email: authUser.email || null,
            onboarding_complete: false,
            verification_status: "approved",
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" })
          .select("id")
          .maybeSingle();

        ap = newAp;
      }

      if (!ap?.id) {
        console.log("[ACCESS] → pending_assignment (no profile)");
        setStatus("pending_assignment");
        return;
      }

      // 2. Fetch the fee assignment (single query — no filter on status)
      const { data: assignment, error: faErr } = await supabase
        .from("fee_assignments")
        .select("id, assignment_status")
        .eq("athlete_profile_id", ap.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log("[ACCESS] fee_assignment:", assignment, "error:", faErr);

      // No assignment at all → awaiting admin
      if (!assignment) {
        console.log("[ACCESS] → pending_assignment (no fee assignment)");
        setStatus("pending_assignment");
        return;
      }

      // Check assignment status in JavaScript (no PostgREST filter dependency)
      const st = assignment.assignment_status;

      if (st === "cash_approved" || st === "online_paid") {
        console.log("[ACCESS] → unlocked (assignment_status:", st, ")");
        setStatus("unlocked");
        return;
      }

      // Rollover approved → dashboard is accessible, amount shows in payments page
      if (st === "rollover_approved") {
        console.log("[ACCESS] → unlocked (rollover approved — payment deferred)");
        setStatus("unlocked");
        return;
      }

      // Rollover pending → dashboard stays locked until superadmin approves
      if (st === "rollover_pending") {
        console.log("[ACCESS] → rollover_pending (awaiting superadmin approval)");
        setStatus("rollover_pending");
        return;
      }

      if (st === "cash_pending") {
        console.log("[ACCESS] → payment_required (cash_pending — awaiting admin)");
        setStatus("payment_required");
        return;
      }

      // 3. Fallback: check if all invoices are paid (covers edge cases)
      const { data: unpaidInvoices } = await supabase
        .from("invoices")
        .select("id, status")
        .eq("athlete_profile_id", ap.id)
        .neq("status", "paid")
        .limit(1);

      if (unpaidInvoices && unpaidInvoices.length === 0) {
        // All invoices paid — check if there are any invoices at all
        const { count } = await supabase
          .from("invoices")
          .select("*", { count: "exact", head: true })
          .eq("athlete_profile_id", ap.id);

        if (count && count > 0) {
          console.log("[ACCESS] → unlocked (all invoices paid)");
          setStatus("unlocked");
          return;
        }
      }

      // Check for overdue invoices specifically
      const hasOverdue = unpaidInvoices?.some(i => i.status === "overdue");
      if (hasOverdue) {
        console.log("[ACCESS] → overdue");
        setStatus("overdue");
        return;
      }

      // Has fee assignment, not approved → athlete needs to choose payment method
      console.log("[ACCESS] → payment_required (assignment_status:", st, ")");
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
        .from("athlete_profiles")
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

  if (authLoading || !session || !profile) {
    return (
      <div className="min-h-screen bg-background grid place-items-center">
        <span className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AthleteAccessContext.Provider value={{ isUnlocked, status, refresh: checkAccess, isRolloverPending }}>
      <DashboardLayout
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
            items: [
              { to: "", label: "Dashboard", icon: Home },
              { to: "profile", label: "My Profile", icon: User },
              { to: "payments", label: "Fee & Payments", icon: CreditCard },
              { to: "attendance", label: "Attendance", icon: MapPin },
              { to: "schedule", label: "Training Schedule", icon: Calendar },
              { to: "bouts", label: "My Bouts", icon: Swords },
            ],
          },
          {
            label: "Account",
            items: [
              { to: "notifications", label: "Notifications", icon: Bell },
              { to: "settings", label: "Settings", icon: Settings },
            ],
          },
        ]}
      />
    </AthleteAccessContext.Provider>
  );
}
