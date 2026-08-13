import { ReactNode, useEffect, useState } from "react";
import { useAthleteAccess } from "@/routes/athlete";
import { Lock, CreditCard, Clock, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

/**
 * AccessGuard — wrap any athlete sub-page in this to enforce payment lock.
 * If the athlete's dashboard is unlocked, renders children normally.
 * Otherwise shows a premium-styled lock screen with contextual message.
 * Has a direct DB fallback: even if the context says locked, it checks
 * the actual fee_assignment status to avoid being permanently stuck.
 */
export function AccessGuard({ children }: { children: ReactNode }) {
  const { isUnlocked, status, refresh } = useAthleteAccess();
  const { user } = useAuth();
  const [directUnlock, setDirectUnlock] = useState(false);

  // Only re-check access on mount if currently locked
  useEffect(() => {
    if (!isUnlocked) {
      refresh();
    }
  }, [isUnlocked]);

  // Direct DB fallback — if context says locked, double-check the database
  useEffect(() => {
    if (isUnlocked || !user?.id) return;

    async function directCheck() {
      try {
        const { data: ap } = await supabase
          .from("athlete_profiles")
          .select("id")
          .eq("user_id", user!.id)
          .maybeSingle();

        if (!ap?.id) return;

        const { data: fa } = await supabase
          .from("fee_assignments")
          .select("assignment_status")
          .eq("athlete_profile_id", ap.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (
          fa?.assignment_status === "cash_approved" ||
          fa?.assignment_status === "online_paid" ||
          fa?.assignment_status === "rollover_approved"
        ) {
          setDirectUnlock(true);
        }
      } catch {}
    }

    directCheck();
  }, [isUnlocked, user?.id]);

  if (isUnlocked || directUnlock) return <>{children}</>;

  const config: Record<string, { icon: any; title: string; body: string; tone: string }> = {
    pending_assignment: {
      icon: Clock,
      title: "Awaiting fee package",
      body: "Your admin hasn't assigned a fee plan yet. Your dashboard will unlock once a package is sent to you.",
      tone: "text-info",
    },
    awaiting_invoice: {
      icon: Clock,
      title: "Invoice being generated",
      body: "Your fee plan has been assigned and your invoice is being prepared. Check back shortly.",
      tone: "text-info",
    },
    rollover_pending: {
      icon: Clock,
      title: "Rollover approval pending",
      body: "Your rollover request has been submitted. Your admin will review and approve it.",
      tone: "text-info",
    },
    rollover_approved: {
      icon: Clock,
      title: "Rollover approved",
      body: "Your payment rollover has been approved. Your dashboard is unlocked.",
      tone: "text-success",
    },
    payment_required: {
      icon: CreditCard,
      title: "Payment required",
      body: "A fee package has been sent to you. Please complete your payment to access this section.",
      tone: "text-warning",
    },
    overdue: {
      icon: AlertTriangle,
      title: "Payment overdue",
      body: "Your fee payment is past due. Please clear the outstanding balance to regain access.",
      tone: "text-destructive",
    },
  };

  const c = config[status] ?? config.pending_assignment;
  const Icon = c.icon;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="max-w-sm w-full text-center space-y-5">
        {/* Lock icon */}
        <div className="relative mx-auto size-20">
          <div className="size-20 rounded-2xl bg-elevated border border-border grid place-items-center mx-auto">
            <Icon className={`size-8 ${c.tone}`} />
          </div>
          <div className="absolute -bottom-1 -right-1 size-7 rounded-full bg-foreground text-background grid place-items-center shadow-card">
            <Lock className="size-3.5" />
          </div>
        </div>

        {/* Text */}
        <div>
          <h2 className="font-display font-semibold text-lg">{c.title}</h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{c.body}</p>
        </div>

        {/* CTA */}
        {status === "payment_required" || status === "overdue" ? (
          <Link
            to="/athlete/payments"
            className="inline-flex items-center gap-2 bg-foreground text-background px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-foreground/90 transition shadow-card"
          >
            <CreditCard className="size-4" />
            Go to Payments
          </Link>
        ) : (
          <div className="text-xs text-muted-foreground bg-elevated border border-border rounded-xl px-4 py-3">
            Contact your admin if this persists.
          </div>
        )}

        {/* Refresh button */}
        <button
          onClick={refresh}
          className="text-xs text-muted-foreground hover:text-foreground transition mt-2 block mx-auto"
        >
          ↻ Check again
        </button>
      </div>
    </div>
  );
}
