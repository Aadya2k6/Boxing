import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader, StatCard, SectionCard } from "@/components/dashboard/DashboardLayout";
import {
  CreditCard,
  Target,
  TrendingUp,
  Zap,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Lock,
  ArrowRight,
  RefreshCw,
  Info,
  Banknote,
  Loader2,
  Tag,
  RotateCcw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase, AthleteProfile } from "@/lib/supabase";
import { openRazorpayCheckout, recordPayment } from "@/lib/razorpay";
import { openPayUCheckout, recordPayUPayment, handlePayUReturn } from "@/lib/payu";
import { useAthleteAccess } from "./athlete";
import { ensureInvoiceForAssignment, getPayableAmount } from "@/lib/fees";

export const Route = createFileRoute("/athlete/")({
  component: AthleteOverview,
});

function AthleteOverview() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { isUnlocked, status, refresh: refreshAccess } = useAthleteAccess();
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfile | null>(null);
  const [feeAssignment, setFeeAssignment] = useState<any>(null);
  const [latestInvoice, setLatestInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Check if we've returned from a PayU redirect payment
    const payuReturn = handlePayUReturn();
    if (payuReturn.status === "success" && payuReturn.invoiceId) {
      // Payment redirected back as success.
      // The trg_auto_mark_paid DB trigger will automatically set invoice=paid and
      // fee_assignment=online_paid once the Edge Function inserts the payment row.
      // Athletes cannot set fee_assignment to 'online_pending' per RLS WITH CHECK.
      (async () => {
        const { data: ap } = await supabase
          .from("athlete_profiles")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (ap && payuReturn.invoiceId) {
          const savedCouponId = sessionStorage.getItem("payu_coupon_id");
          const savedDiscount = Number(sessionStorage.getItem("payu_discount") || 0);

          // Save coupon/discount metadata on the invoice (best effort — RLS restricts athlete UPDATE on invoices)
          try {
            await supabase.from("invoices").update({
              coupon_id: savedCouponId || null,
              discount_applied: savedDiscount,
              updated_at: new Date().toISOString(),
            }).eq("id", payuReturn.invoiceId);
          } catch (_) {}

          // recordPayUPayment is best-effort — Edge Function records the actual payment
          if (payuReturn.txnid) {
            await recordPayUPayment(supabase, {
              invoiceId: payuReturn.invoiceId,
              athleteProfileId: ap.id,
              amount: Number(sessionStorage.getItem("payu_pending_amount") || 0),
              payuTxnId: payuReturn.txnid,
            });
          }
          sessionStorage.removeItem("payu_coupon_id");
          sessionStorage.removeItem("payu_discount");
        }
        refreshAccess();
        loadDashboard();
      })();
    }

    loadDashboard();

    const channel = supabase
      .channel("athlete-dashboard-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => {
        loadDashboard();
        refreshAccess();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "fee_assignments" }, () => {
        loadDashboard();
        refreshAccess();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        loadDashboard();
        refreshAccess();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  async function loadDashboard() {
    if (!user) return;
    try {
      let { data: ap } = await supabase
        .from("athlete_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!ap) {
        const { data: newAp } = await supabase
          .from("athlete_profiles")
          .upsert({
            user_id: user.id,
            full_name: profile?.full_name || user.email?.split("@")[0] || "Athlete",
            email: user.email || null,
            onboarding_complete: false,
            verification_status: "pending",
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" })
          .select("*")
          .maybeSingle();

        ap = newAp;
      }

      if (ap) {
        setAthleteProfile(ap);
      }

      // Fetch latest fee assignment with plan details
      const { data: fa } = await supabase
        .from("fee_assignments")
        .select("*, fee_plans(plan_name, amount, billing_cycle, custom_duration_days)")
        .eq("athlete_profile_id", ap.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setFeeAssignment(fa);

      // Fetch latest unpaid invoice first, else latest invoice
      const { data: unpaidInv } = await supabase
        .from("invoices")
        .select("*")
        .eq("athlete_profile_id", ap.id)
        .in("status", ["unpaid", "partially_paid", "overdue"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (unpaidInv) {
        setLatestInvoice(unpaidInv);
      } else {
        const { data: anyInv } = await supabase
          .from("invoices")
          .select("*")
          .eq("athlete_profile_id", ap.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setLatestInvoice(anyInv);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    await loadDashboard();
    refreshAccess();
  }

  // Check BOTH access context AND local assignment — defense in depth
  const assignmentApproved =
    feeAssignment?.assignment_status === "cash_approved" ||
    feeAssignment?.assignment_status === "online_paid" ||
    feeAssignment?.assignment_status === "rollover_approved";
  const isLocked = !isUnlocked && !assignmentApproved;
  const firstName =
    athleteProfile?.full_name?.split(" ")[0] ?? profile?.full_name?.split(" ")[0] ?? "Athlete";

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  if (loading && !athleteProfile) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <span className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-6 relative">
      {/* ── Ghost dashboard (always visible) ──────────────────────────── */}
      <div className={isLocked ? "pointer-events-none select-none" : ""}>
        <PageHeader
          title={`${greeting()}, ${firstName} 👋`}
          subtitle={`Cricket · ${athleteProfile?.primary_discipline ?? "—"}`}
          actions={
            !isLocked ? (
              <button
                onClick={() => navigate({ to: "/athlete/payments" })}
                className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition-all shadow-card"
              >
                <CreditCard className="size-4" /> Pay next fee
              </button>
            ) : undefined
          }
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <StatCard
            label="Sport"
            value="Cricket"
            hint={athleteProfile?.primary_discipline ?? "Batting"}
            icon={Target}
            accent="bg-primary/10"
          />
          <StatCard
            label="Training year"
            value={athleteProfile?.training_year ?? "—"}
            hint="Current level"
            icon={TrendingUp}
            accent="bg-info/10"
          />
          <StatCard
            label="Years in sport"
            value={athleteProfile?.years_in_sport?.toString() ?? "—"}
            hint="Experience"
            icon={Zap}
            accent="bg-success/10"
          />
          <StatCard
            label="Verification"
            value={
              athleteProfile?.verification_status === "approved"
                ? "Approved"
                : athleteProfile?.verification_status === "manual_review"
                  ? "Under Review"
                  : athleteProfile?.verification_status === "flagged"
                    ? "Flagged"
                    : "Pending"
            }
            hint="Profile status"
            icon={CheckCircle2}
            accent={
              athleteProfile?.verification_status === "approved" ? "bg-success/10" : "bg-warning/10"
            }
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mt-6">
          <SectionCard title="Profile Summary">
            <div className="space-y-3">
              {[
                { label: "Full name", value: athleteProfile?.full_name },
                { label: "Date of birth", value: athleteProfile?.date_of_birth },
                {
                  label: "City / State",
                  value:
                    athleteProfile?.city && athleteProfile?.state
                      ? `${athleteProfile.city}, ${athleteProfile.state}`
                      : "—",
                },
                { label: "Coach", value: athleteProfile?.current_coach ?? "Not assigned" },
                { label: "Academy", value: athleteProfile?.current_academy ?? "Not assigned" },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-sm font-medium">{value ?? "—"}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Quick Info">
            <div className="space-y-3">
              {[
                {
                  label: "National Fed ID",
                  value: athleteProfile?.national_federation_id ?? "Not provided",
                },
                { label: "Blood group", value: athleteProfile?.blood_group ?? "—" },
                { label: "Dominant hand", value: (athleteProfile as any)?.dominant_hand ?? "—" },
                { label: "Batting style", value: athleteProfile?.bow_type ?? "—" },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-sm font-medium">{value}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── Payment wall overlay — perfectly centered in viewport ──────── */}
      {isLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-md my-auto animate-fade-up">
            <PaymentWall
              assignment={feeAssignment}
              invoice={latestInvoice}
              onRefresh={handleRefresh}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Payment wall — completely self-contained ────────────────────────────
// Shows pay buttons based solely on whether assignment/invoice exist,
// NOT on any external status flag.
function PaymentWall({
  assignment,
  invoice,
  onRefresh,
}: {
  assignment: any;
  invoice: any;
  onRefresh: () => void;
}) {
  const { user, profile } = useAuth();
  const { refresh: refreshAccess } = useAthleteAccess();
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<"online" | "cash" | null>(null);
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [rolloverSubmitting, setRolloverSubmitting] = useState(false);
  const [rolloverSuccess, setRolloverSuccess] = useState(false);
  const [athleteAcademy, setAthleteAcademy] = useState<any>(null);
  const [athleteAcademyId, setAthleteAcademyId] = useState<string | null>(null);

  // Coupon state
  const [availableCoupons, setAvailableCoupons] = useState<any[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);

  // Load the athlete's academy gateway config from system_settings JSONB
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: ap } = await supabase
        .from("athlete_profiles")
        .select("preferred_academy_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (ap?.preferred_academy_id) {
        setAthleteAcademyId(ap.preferred_academy_id);
        const { data: ac } = await supabase
          .from("academies")
          .select("active_gateway")
          .eq("id", ap.preferred_academy_id)
          .maybeSingle();

        if (ac?.active_gateway) {
          setAthleteAcademy({ payment_gateway: ac.active_gateway });
          return;
        }
      }

      // Fallback: Check active_gateway from academies table
      const { data: firstAc } = await supabase
        .from("academies")
        .select("active_gateway")
        .not("active_gateway", "is", null)
        .limit(1)
        .maybeSingle();

      const resolvedGateway = firstAc?.active_gateway || "razorpay";
      setAthleteAcademy({ payment_gateway: resolvedGateway });
    })();
  }, [user]);

  const isCashPending = assignment?.assignment_status === "cash_pending";
  const isOnlinePending = assignment?.assignment_status === "online_pending";
  const isRolloverPending = assignment?.assignment_status === "rollover_pending";
  const isRolloverApproved = assignment?.assignment_status === "rollover_approved";
  const isPendingApproval = isCashPending || isOnlinePending;
  const isAlreadyApproved =
    assignment?.assignment_status === "cash_approved" ||
    assignment?.assignment_status === "online_paid" ||
    isRolloverApproved;
  const hasAssignment = !!assignment;
  const hasUnpaidInvoice = !!invoice && invoice.status !== "paid";
  const planName = assignment?.fee_plans?.plan_name ?? assignment?.plan_name ?? "Fee Package";
  const planAmount = Number(assignment?.fee_plans?.amount ?? assignment?.custom_amount ?? 0);
  const planCycle =
    assignment?.fee_plans?.billing_cycle === "custom" && assignment?.fee_plans?.custom_duration_days
      ? `${assignment.fee_plans.custom_duration_days} Days`
      : assignment?.fee_plans?.billing_cycle ?? "—";
  const payableAmount = getPayableAmount(invoice, planAmount);
  const gatewayLabel = athleteAcademy?.payment_gateway === "payu" ? "PayU" : "Razorpay";

  // Coupon availability check & auto-assign logic
  useEffect(() => {
    if (!hasAssignment) return;
    (async () => {
      try {
        const currentPlanId = assignment?.fee_plan_id ?? assignment?.fee_plans?.id;

        const [{ data: coupons }, { data: paidInvCoupons }] = await Promise.all([
          supabase.from("coupons").select("*").eq("is_active", true),
          // Only count CONFIRMED paid invoices for usage enforcement
          supabase.from("invoices").select("coupon_id").eq("status", "paid").not("coupon_id", "is", null),
        ]);

        if (!coupons || coupons.length === 0) {
          setAvailableCoupons([]);
          setAppliedCoupon(null);
          return;
        }

        // Count how many confirmed (paid) invoices used each coupon
        const confirmedUsageMap: Record<string, number> = {};
        (paidInvCoupons || []).forEach(i => {
          if (i.coupon_id) {
            confirmedUsageMap[i.coupon_id] = (confirmedUsageMap[i.coupon_id] || 0) + 1;
          }
        });

        const eligible: any[] = [];
        for (const c of coupons) {
          // Check package restriction
          const planIds = c.valid_fee_plan_ids ?? [];
          if (planIds.length > 0 && currentPlanId && !planIds.includes(currentPlanId)) {
            continue;
          }
          // Check academy restriction
          const academyIds = c.valid_academy_ids ?? [];
          if (academyIds.length > 0 && athleteAcademyId && !academyIds.includes(athleteAcademyId)) {
            continue;
          }

          // Enforce max_uses from coupons table column (null = unlimited)
          const maxUses: number | null = c.max_uses ?? null;
          const confirmedUses = confirmedUsageMap[c.id] || 0;
          if (maxUses !== null && maxUses > 0 && confirmedUses >= maxUses) {
            continue; // Coupon has reached its confirmed usage limit
          }

          let dAmt = 0;
          if (c.value_type === "percentage") {
            dAmt = Math.round((planAmount * Number(c.value)) / 100);
          } else {
            dAmt = Math.min(planAmount, Number(c.value));
          }

          eligible.push({
            ...c,
            calculatedDiscount: dAmt,
            remainingUses: maxUses !== null ? Math.max(0, maxUses - confirmedUses) : null,
          });
        }

        setAvailableCoupons(eligible);

        // Auto-assign best eligible coupon automatically if available!
        if (eligible.length > 0) {
          eligible.sort((a, b) => b.calculatedDiscount - a.calculatedDiscount);
          setAppliedCoupon(eligible[0]);
          setCouponCodeInput(eligible[0].code);
        } else {
          setAppliedCoupon(null);
        }
      } catch (err) {
        console.error("Error loading coupons:", err);
      }
    })();
  }, [hasAssignment, assignment, athleteAcademyId, planAmount]);

  const discountAmount = appliedCoupon ? appliedCoupon.calculatedDiscount : 0;
  const finalPayableAmount = Math.max(0, payableAmount - discountAmount);



  // If already approved/paid — don't render the wall at all
  if (isAlreadyApproved) return null;

  // ── Determine what to show ──────────────────────────────────────────
  const showPayButtons = hasAssignment && !isAlreadyApproved && !isPendingApproval && !isRolloverPending;
  // Rollover is allowed only if no active rollover exists and is NOT already paid
  const canRequestRollover = hasAssignment && !isRolloverPending && !isRolloverApproved && !isPendingApproval;

  /** Handle rollover request */
  async function handleRolloverRequest() {
    if (!assignment?.id || !user) return;
    setRolloverSubmitting(true);
    setPayError(null);
    try {
      // 1. Set assignment to rollover_pending
      await supabase
        .from("fee_assignments")
        .update({ assignment_status: "rollover_pending", payment_mode: "rollover" })
        .eq("id", assignment.id);

      // 2. Notify all superadmins
      const { data: superadmins } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "superadmin");

      if (superadmins && superadmins.length > 0) {
        const notifications = superadmins.map((sa: any) => ({
          recipient_id: sa.id,
          type: "rollover_requested",
          title: "Rollover payment request",
          body: `${profile?.full_name ?? "An athlete"} has requested a payment rollover for "${planName}" (₹${planAmount.toLocaleString("en-IN")}). Approve to defer payment and unlock their dashboard.`,
          related_entity_id: assignment.id,
          related_entity_type: "fee_assignment",
        }));
        await supabase.from("notifications").insert(notifications);
      }

      setRolloverSuccess(true);
      onRefresh();
      refreshAccess();
    } catch (err: any) {
      setPayError(err.message ?? "Failed to submit rollover request.");
    } finally {
      setRolloverSubmitting(false);
    }
  }

  /** Unified online payment handler — routes to Razorpay or PayU based on academy setting */
  async function handleOnlinePay() {
    setPayError(null);
    setPaying(true);
    try {
      const payableInvoice = await ensureInvoiceForAssignment(assignment, invoice);
      if (!payableInvoice?.id) {
        setPayError("No invoice or fee package is available for payment yet.");
        return;
      }
      const gateway = athleteAcademy?.payment_gateway || "razorpay";

      if (gateway === "payu") {
        // Store coupon info for post-payment return processing
        if (appliedCoupon?.id) {
          sessionStorage.setItem("payu_coupon_id", appliedCoupon.id);
          sessionStorage.setItem("payu_discount", String(discountAmount));
        }
        sessionStorage.setItem("payu_assignment_id", assignment?.id ?? "");
        sessionStorage.setItem("payu_pending_amount", String(finalPayableAmount));
        // This redirects the browser to PayU payment page
        await openPayUCheckout({
          amount: finalPayableAmount,
          invoiceId: payableInvoice.id,
          invoiceNumber: payableInvoice.invoice_number ?? "",
          athleteProfileId: payableInvoice.athlete_profile_id ?? "",
          name: profile?.full_name ?? "Athlete",
          email: profile?.email ?? "",
          academyId: athleteAcademyId ?? undefined,
          onSuccess: async () => {},
          onDismiss: () => setPaying(false),
          onError: (msg) => setPayError(msg),
        });
        // Note: browser will redirect to PayU page — code below won't run until they return
        return;
      } else {
        // Default: Razorpay
        await openRazorpayCheckout({
          amount: finalPayableAmount,
          invoiceId: payableInvoice.id,
          invoiceNumber: payableInvoice.invoice_number ?? "",
          athleteProfileId: payableInvoice.athlete_profile_id ?? "",
          name: profile?.full_name ?? "Athlete",
          email: profile?.email ?? undefined,
          academyId: athleteAcademyId ?? undefined,
          onSuccess: async (rzpResponse) => {
            // recordPayment is best-effort — Edge Function inserts payment via service-role.
            // trg_auto_mark_paid DB trigger then automatically marks invoice paid and
            // fee_assignment as 'online_paid'. RLS blocks athletes from setting 'online_pending'.
            await recordPayment(supabase, {
              invoiceId: payableInvoice.id!,
              athleteProfileId: payableInvoice.athlete_profile_id ?? "",
              amount: finalPayableAmount,
              razorpayPaymentId: rzpResponse.razorpay_payment_id,
              razorpayOrderId: rzpResponse.razorpay_order_id,
              razorpaySignature: rzpResponse.razorpay_signature,
            });
            // Save coupon/discount metadata on the invoice (best effort — RLS restricts athlete UPDATE on invoices)
            try {
              await supabase
                .from("invoices")
                .update({
                  coupon_id: appliedCoupon?.id ?? null,
                  discount_applied: discountAmount,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", payableInvoice.id!);
            } catch (_) {}

            onRefresh();
            refreshAccess();
          },
          onDismiss: () => setPaying(false),
          onError: (msg) => setPayError(msg),
        });
      }
    } catch (err: any) {
      setPayError(err.message);
    } finally {
      setPaying(false);
    }
  }

  async function handleCashSelect() {
    if (!assignment?.id) return;
    setCashSubmitting(true);
    setPayError(null);
    try {
      const payableInvoice = await ensureInvoiceForAssignment(assignment, invoice);
      if (payableInvoice?.id) {
        try {
          await supabase
            .from("invoices")
            .update({
              coupon_id: appliedCoupon?.id ?? null,
              discount_applied: discountAmount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", payableInvoice.id);
        } catch (_) {}
      }
      await supabase
        .from("fee_assignments")
        .update({ assignment_status: "cash_pending", payment_mode: "cash" })
        .eq("id", assignment.id);

      onRefresh();
      refreshAccess();
    } catch (err: any) {
      setPayError(err.message);
    } finally {
      setCashSubmitting(false);
      setPayMode(null);
    }
  }

  // ── Icon & messaging ─────────────────────────────────────────────────
  let icon = Info;
  let iconClass = "text-info";
  let cardClass = "border-info/20 bg-info/5";
  let title = "Awaiting fee assignment";
  let body = "Your profile is complete. Your admin will assign a fee plan shortly.";

  if (hasAssignment && isCashPending) {
    icon = Banknote;
    iconClass = "text-warning";
    cardClass = "border-warning/20 bg-warning/5";
    title = "Cash payment pending approval";
    body =
      "You've selected cash payment. Your admin will verify receipt and unlock your dashboard.";
  } else if (hasAssignment && isOnlinePending) {
    icon = CreditCard;
    iconClass = "text-warning";
    cardClass = "border-warning/20 bg-warning/5";
    title = "Online payment pending approval";
    body =
      "Your online payment (PayU) has been submitted. Your admin will verify and confirm receipt to unlock your dashboard.";
  } else if (hasAssignment && isRolloverPending) {
    icon = RotateCcw;
    iconClass = "text-info";
    cardClass = "border-info/20 bg-info/5";
    title = "Rollover approval pending";
    body =
      "Your rollover request has been submitted. Your admin will review and approve it to unlock your dashboard. Once approved, the payment will appear in your Fee & Payments section.";
  } else if (hasAssignment) {
    icon = Lock;
    iconClass = "text-warning";
    cardClass = "border-warning/20 bg-warning/5";
    title = "Payment required";
    body =
      "A fee payment is due. Choose your preferred payment method to unlock your full dashboard.";
    if (hasUnpaidInvoice && invoice.status === "overdue") {
      icon = AlertTriangle;
      iconClass = "text-destructive";
      cardClass = "border-destructive/20 bg-destructive/5";
      title = "Access suspended — overdue";
      body = "Your invoice is past due. Please clear the outstanding balance immediately.";
    }
  }

  return (
    <div className={`bento-card p-8 border-2 text-center ${cardClass}`}>
      <div
        className={`size-16 mx-auto rounded-2xl grid place-items-center mb-5 ${
          iconClass.includes("destructive")
            ? "bg-destructive/10"
            : iconClass.includes("warning")
              ? "bg-warning/10"
              : "bg-subtle"
        }`}
      >
        {icon === Info && <Info className={`size-8 ${iconClass}`} strokeWidth={1.5} />}
        {icon === Lock && <Lock className={`size-8 ${iconClass}`} strokeWidth={1.5} />}
        {icon === Banknote && <Banknote className={`size-8 ${iconClass}`} strokeWidth={1.5} />}
        {icon === CreditCard && <CreditCard className={`size-8 ${iconClass}`} strokeWidth={1.5} />}
        {icon === AlertTriangle && (
          <AlertTriangle className={`size-8 ${iconClass}`} strokeWidth={1.5} />
        )}
      </div>

      <h2 className="font-display font-bold text-xl">{title}</h2>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{body}</p>

      {/* Plan info */}
      {hasAssignment && (
        <div className="mt-5 p-4 rounded-xl bg-surface border border-border text-left space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-medium">{planName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Original amount</span>
            <span className="font-medium">₹ {planAmount.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Cycle</span>
            <span className="capitalize">{planCycle}</span>
          </div>
          {isPendingApproval && (
            <div className="flex justify-between text-sm text-warning">
              <span>Status</span>
              <span className="font-medium">Awaiting admin confirmation ({isOnlinePending ? "PayU Online" : "Cash"})</span>
            </div>
          )}
          {isRolloverPending && (
            <div className="flex justify-between text-sm text-info">
              <span>Status</span>
              <span className="font-medium flex items-center gap-1">
                <RotateCcw className="size-3" /> Rollover approval pending
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Coupon Discount Section — Shown ONLY if valid coupons with remaining uses exist and not pending ── */}
      {availableCoupons.length > 0 && !isPendingApproval && (
        <div className="mt-3 p-4 rounded-xl bg-primary/5 border border-primary/20 text-left space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-primary-dark">
            <span className="flex items-center gap-1.5">
              <Tag className="size-3.5" /> Coupon discount
            </span>
            <span className="text-[10px] bg-primary/10 text-primary-dark px-2 py-0.5 rounded-full font-bold">
              Auto-assigned
            </span>
          </div>

          <div className="flex gap-2">
            <input
              value={couponCodeInput}
              onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
              placeholder="COUPON CODE"
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs font-mono font-bold tracking-wide uppercase focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => {
                const found = availableCoupons.find((c) => c.code === couponCodeInput.trim());
                if (found) {
                  setAppliedCoupon(found);
                  setCouponError(null);
                } else {
                  setCouponError("Invalid or ineligible coupon code.");
                }
              }}
              className="bg-primary text-primary-foreground text-xs font-semibold px-3.5 py-1.5 rounded-lg hover:bg-primary/90 transition"
            >
              Apply
            </button>
          </div>

          {appliedCoupon && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-primary/10">
              <span className="font-semibold text-success">
                {appliedCoupon.code} applied ({appliedCoupon.value_type === "percentage" ? `${appliedCoupon.value}% OFF` : `₹${appliedCoupon.value} OFF`})
              </span>
              <span className="font-bold text-success">- ₹{discountAmount.toLocaleString("en-IN")}</span>
            </div>
          )}

          {couponError && <p className="text-[11px] text-destructive">{couponError}</p>}
        </div>
      )}

      {/* Invoice details */}
      {hasUnpaidInvoice && (
        <div className="mt-3 p-4 rounded-xl bg-surface border border-border text-left space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Invoice</span>
            <span className="font-mono font-medium">{invoice.invoice_number}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-success font-medium">
              <span>Coupon discount</span>
              <span>- ₹{discountAmount.toLocaleString("en-IN")}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-semibold">Amount due</span>
            <span className="font-bold text-base text-primary-dark">₹{finalPayableAmount.toLocaleString("en-IN")}</span>
          </div>
          {invoice.due_date && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Due date</span>
              <span>
                {new Date(invoice.due_date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Payment buttons — shown if assignment exists and NOT cash_pending ── */}
      {showPayButtons && !payMode && (
        <div className="mt-5 space-y-2.5">
          <button
            onClick={() => setPayMode("online")}
            className="w-full flex items-center justify-center gap-2 bg-[#ef4444] text-white py-3 rounded-xl text-sm font-semibold hover:bg-[#dc2626] transition-all shadow-card"
          >
            <CreditCard className="size-4" /> Pay online · {gatewayLabel}
          </button>
          <button
            onClick={() => setPayMode("cash")}
            className="w-full flex items-center justify-center gap-2 border border-border bg-surface py-3 rounded-xl text-sm font-medium hover:bg-subtle transition-all"
          >
            <Banknote className="size-4" /> Pay by cash
          </button>
          {/* Rollover option — only if no active rollover */}
          {canRequestRollover && (
            <div className="pt-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {rolloverSuccess ? (
                <div className="flex items-center justify-center gap-2 text-xs text-info font-medium py-2">
                  <RotateCcw className="size-3.5" /> Rollover request submitted! Awaiting admin approval.
                </div>
              ) : (
                <button
                  onClick={handleRolloverRequest}
                  disabled={rolloverSubmitting}
                  className="w-full flex items-center justify-center gap-2 border border-info/40 text-info bg-info/5 hover:bg-info/10 py-2.5 rounded-xl text-xs font-medium transition-all disabled:opacity-60"
                >
                  {rolloverSubmitting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  {rolloverSubmitting ? "Submitting rollover…" : "Request payment rollover"}
                </button>
              )}
              <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                Rollover defers your payment. Admin approval required. Can only be used once per cycle.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Online confirmation */}
      {showPayButtons && payMode === "online" && (
        <div className="mt-5 space-y-2.5">
          <button
            onClick={handleOnlinePay}
            disabled={paying}
            className="w-full flex items-center justify-center gap-2 bg-[#ef4444] text-white py-3 rounded-xl text-sm font-semibold hover:bg-[#dc2626] disabled:opacity-60 transition-all shadow-card"
          >
            {paying ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CreditCard className="size-4" />
            )}
            {paying
              ? "Opening gateway…"
              : `Pay ₹${finalPayableAmount.toLocaleString("en-IN")} via ${gatewayLabel}`}
          </button>
          <button
            onClick={() => setPayMode(null)}
            className="text-xs text-muted-foreground hover:text-foreground transition"
          >
            ← Back to options
          </button>
        </div>
      )}

      {/* Cash confirmation */}
      {showPayButtons && payMode === "cash" && (
        <div className="mt-5 space-y-3">
          <div className="p-4 rounded-xl bg-warning/8 border border-warning/25 text-sm text-left">
            <p className="font-medium text-warning mb-1">Cash payment instructions</p>
            <p className="text-xs text-muted-foreground">
              Visit your academy office and pay ₹{finalPayableAmount.toLocaleString("en-IN")} in cash.
              Your admin will confirm receipt and unlock your dashboard.
            </p>
          </div>
          <button
            onClick={handleCashSelect}
            disabled={cashSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-warning text-white py-3 rounded-xl text-sm font-semibold hover:bg-warning/90 disabled:opacity-60 transition-all"
          >
            {cashSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Banknote className="size-4" />
            )}
            {cashSubmitting ? "Submitting…" : "I'll pay by cash — notify admin"}
          </button>
          <button
            onClick={() => setPayMode(null)}
            className="text-xs text-muted-foreground hover:text-foreground transition"
          >
            ← Back to options
          </button>
        </div>
      )}

      {payError && <p className="mt-3 text-xs text-destructive">{payError}</p>}

      <button
        onClick={() => {
          onRefresh();
          refreshAccess();
        }}
        className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
      >
        <RefreshCw className="size-3" /> Refresh status
      </button>
    </div>
  );
}
