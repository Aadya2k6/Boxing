import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard, Badge } from "@/components/dashboard/DashboardLayout";
import {
  Download,
  CreditCard,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Banknote,
  Clock,
  Tag,
  RotateCcw,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { openRazorpayCheckout, recordPayment } from "@/lib/razorpay";
import { openPayUCheckout, recordPayUPayment } from "@/lib/payu";
import { generateReceipt } from "@/lib/pdf-receipt";
import { useAthleteAccess } from "./athlete";
import { ensureInvoiceForAssignment, getPayableAmount } from "@/lib/fees";

export const Route = createFileRoute("/athlete/payments")({ component: PaymentsPage });

const tones = {
  paid: "success",
  pending: "warning",
  overdue: "danger",
  unpaid: "warning",
  partially_paid: "warning",
} as const;

function PaymentsPage() {
  const { user, profile } = useAuth();
  const { status: accessStatus, refresh: refreshAccess } = useAthleteAccess();
  const [filter, setFilter] = useState<"all" | "paid" | "unpaid" | "overdue">("all");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [feeAssignment, setFeeAssignment] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState<string | null>(null);
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [athleteAcademy, setAthleteAcademy] = useState<any>(null);
  const [athleteAcademyId, setAthleteAcademyId] = useState<string | null>(null);
  const [athleteProfileId, setAthleteProfileId] = useState<string | null>(null);

  // Coupon state
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);

  // Rollover state
  const [rolloverSubmitting, setRolloverSubmitting] = useState(false);
  const [hasUsedRollover, setHasUsedRollover] = useState(false);

  async function loadData() {
    // Always clear state first so no stale data from a previous user is ever shown
    setInvoices([]);
    setFeeAssignment(null);
    setPayments([]);
    setAthleteAcademy(null);
    setAthleteAcademyId(null);
    setAthleteProfileId(null);

    if (!user) {
      setLoading(false);
      return;
    }

    // Strictly fetch athlete_profile for the currently logged-in user only
    const { data: ap } = await supabase
      .from("athlete_profiles")
      .select("id, academy_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ap) {
      // New user with no profile yet — show clean empty state
      setLoading(false);
      return;
    }

    setAthleteProfileId(ap.id);

    const [{ data: invs }, { data: fa }, { data: paymentRows }] = await Promise.all([
      supabase
        .from("invoices")
        .select("*")
        .eq("athlete_profile_id", ap.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("fee_assignments")
        .select("*, fee_plans(plan_name, amount, billing_cycle, custom_duration_days)")
        .eq("athlete_profile_id", ap.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("payments")
        .select(
          "*, invoices(invoice_number, billing_period, due_date, fee_assignments(fee_plans(plan_name, billing_cycle)))",
        )
        .eq("athlete_profile_id", ap.id)
        .order("created_at", { ascending: false }),
    ]);
    
    // Check if athlete has an UNCLEARED rollover (i.e. rollover pending or approved, but not yet paid)
    const { data: unclearedRollover } = await supabase
      .from("fee_assignments")
      .select("id")
      .eq("athlete_profile_id", ap.id)
      .in("assignment_status", ["rollover_pending", "rollover_approved"])
      .limit(1);

    setInvoices(invs || []);
    setFeeAssignment(fa);
    setPayments(paymentRows || []);
    setHasUsedRollover(!!(unclearedRollover && unclearedRollover.length > 0));

    if (ap.academy_id) {
      setAthleteAcademyId(ap.academy_id);
      const { data: ac } = await supabase
        .from("academies")
        .select("active_gateway")
        .eq("id", ap.academy_id)
        .maybeSingle();

      if (ac?.active_gateway) {
        setAthleteAcademy({ payment_gateway: ac.active_gateway });
        setLoading(false);
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

    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("athlete-payments-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => {
        loadData();
        refreshAccess();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "fee_assignments" }, () => {
        loadData();
        refreshAccess();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        loadData();
        refreshAccess();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const isCashPending = feeAssignment?.assignment_status === "cash_pending";
  const isOnlinePending = feeAssignment?.assignment_status === "online_pending";
  const isRolloverPending = feeAssignment?.assignment_status === "rollover_pending";
  const isRolloverApproved = feeAssignment?.assignment_status === "rollover_approved";
  const isPendingApproval = isCashPending || isOnlinePending;
  const isPaid =
    feeAssignment?.assignment_status === "cash_approved" ||
    feeAssignment?.assignment_status === "online_paid";
  // Rollover can only be requested ONCE in lifetime: no past/active rollover, not already pending/approved
  const canRequestRollover =
    !!feeAssignment &&
    !hasUsedRollover &&
    !isPaid &&
    !isPendingApproval &&
    !isRolloverPending &&
    !isRolloverApproved;
  const planName = feeAssignment?.fee_plans?.plan_name ?? feeAssignment?.plan_name ?? "Fee Package";
  const planAmount = Number(feeAssignment?.fee_plans?.amount ?? feeAssignment?.amount ?? 0);
  const planCycle =
    feeAssignment?.fee_plans?.billing_cycle === "custom" && feeAssignment?.fee_plans?.custom_duration_days
      ? `${feeAssignment.fee_plans.custom_duration_days} Days`
      : feeAssignment?.fee_plans?.billing_cycle ?? feeAssignment?.billing_cycle ?? "";

  const displayedPayments = payments;
  const displayedInvoices = invoices;

  const filtered =
    filter === "all"
      ? displayedInvoices
      : displayedInvoices.filter(
        (i) => i.status === filter || (filter === "unpaid" && i.status === "partially_paid"),
      );
  const totalPaid = displayedPayments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
  const totalDue = displayedInvoices.reduce((acc, i) => acc + Number(i.amount_due || 0), 0);
  const effectiveOutstanding = (i: any) =>
    i.status === "paid"
      ? 0
      : Number(i.balance_outstanding ?? 0) > 0
        ? Number(i.balance_outstanding)
        : Number(i.amount_due ?? 0);
  const currentOutstanding = displayedInvoices.reduce((acc, i) => acc + effectiveOutstanding(i), 0);
  const activeInvoice = displayedInvoices.find((i) => i.status !== "paid") ?? {
    balance_outstanding: Number(feeAssignment?.fee_plans?.amount ?? feeAssignment?.amount ?? 0),
    amount_due: Number(feeAssignment?.fee_plans?.amount ?? feeAssignment?.amount ?? 0),
  };

  async function handleApplyCoupon() {
    setCouponError(null);
    const clean = couponCodeInput.trim().toUpperCase();
    if (!clean) {
      setCouponError("Please enter a coupon code.");
      return;
    }
    setCouponLoading(true);
    try {
      const { data: coupon, error: cErr } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", clean)
        .maybeSingle();

      if (cErr || !coupon) {
        setCouponError("Invalid coupon code.");
        return;
      }

      if (coupon.is_active === false) {
        setCouponError("This coupon is inactive or expired.");
        return;
      }

      // Check fee plan restriction
      const planIds = coupon.valid_fee_plan_ids ?? [];
      const currentPlanId = feeAssignment?.fee_plan_id ?? feeAssignment?.fee_plans?.id;
      if (planIds.length > 0 && currentPlanId && !planIds.includes(currentPlanId)) {
        setCouponError("This coupon is not valid for your fee package.");
        return;
      }

      // Check academy restriction
      const academyIds = coupon.valid_academy_ids ?? [];
      if (academyIds.length > 0 && athleteAcademyId && !academyIds.includes(athleteAcademyId)) {
        setCouponError("This coupon is not valid for your academy center.");
        return;
      }

      // Enforce max_uses from coupons table column (null = unlimited)
      // Count only CONFIRMED (paid) invoices — pending payment doesn't count
      const maxUses: number | null = coupon.max_uses ?? null;
      if (maxUses !== null && maxUses > 0) {
        const { count: confirmedUsedCount } = await supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("coupon_id", coupon.id)
          .eq("status", "paid");

        if ((confirmedUsedCount ?? 0) >= maxUses) {
          setCouponError("This coupon has reached its maximum usage limit.");
          return;
        }
      }

      let disc = 0;
      if (coupon.value_type === "percentage") {
        disc = Math.round((planAmount * Number(coupon.value)) / 100);
      } else {
        disc = Math.min(planAmount, Number(coupon.value));
      }

      setDiscountAmount(disc);
      setAppliedCoupon(coupon);
      setCouponError(null);
    } catch (err: any) {
      setCouponError(err.message || "Failed to apply coupon.");
    } finally {
      setCouponLoading(false);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setDiscountAmount(0);
    setCouponCodeInput("");
    setCouponError(null);
  }

  async function handlePay(inv: any) {
    if (!profile || !user) return;
    setPayError(null);
    setPaySuccess(null);
    try {
      const invoice = inv?.id
        ? inv
        : await ensureInvoiceForAssignment(feeAssignment, activeInvoice);
      if (!invoice?.id) {
        setPayError("No invoice or fee package is available for payment yet.");
        return;
      }
      const basePayable = getPayableAmount(invoice, planAmount);
      const paidAmount = Math.max(0, basePayable - discountAmount);
      const gateway = athleteAcademy?.payment_gateway || "razorpay";

      if (gateway === "payu") {
        if (appliedCoupon?.id) {
          sessionStorage.setItem("payu_coupon_id", appliedCoupon.id);
          sessionStorage.setItem("payu_discount", String(discountAmount));
        }
        await openPayUCheckout({
          amount: paidAmount,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          athleteProfileId: invoice.athlete_profile_id,
          name: profile.full_name ?? "",
          email: profile.email ?? "",
          academyId: athleteAcademyId ?? undefined,
          onSuccess: async () => {},
          onDismiss: () => { },
          onError: (msg) => setPayError(msg),
        });
      } else {
        // Default: Razorpay
        await openRazorpayCheckout({
          amount: paidAmount,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          athleteProfileId: invoice.athlete_profile_id,
          name: profile.full_name ?? "",
          email: profile.email ?? "",
          academyId: athleteAcademyId ?? undefined,
          onSuccess: async (rzp) => {
            // recordPayment is best-effort (Edge Function handles actual DB insert via service-role).
            // The trg_auto_mark_paid DB trigger automatically marks invoice paid and
            // fee_assignment as 'online_paid' when the Edge Function inserts a payment row.
            // Athletes cannot directly set fee_assignment to 'online_paid' per RLS policy.
            await recordPayment(supabase, {
              invoiceId: invoice.id,
              athleteProfileId: invoice.athlete_profile_id,
              amount: paidAmount,
              razorpayPaymentId: rzp.razorpay_payment_id,
              razorpayOrderId: rzp.razorpay_order_id,
              razorpaySignature: rzp.razorpay_signature,
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
                .eq("id", invoice.id);
            } catch (_) {}
            setPaySuccess("Payment submitted! Awaiting bank verification — your dashboard will unlock shortly.");
            loadData();
            refreshAccess();
          },
          onDismiss: () => { },
          onError: (msg) => setPayError(msg),
        });
      }
    } catch (err: any) {
      setPayError(err.message ?? "Payment failed. Please try again.");
    }
  }

  async function handleCashRequest() {
    if (!feeAssignment?.id) return;
    setCashSubmitting(true);
    setPayError(null);
    try {
      await ensureInvoiceForAssignment(feeAssignment, activeInvoice);
      await supabase
        .from("fee_assignments")
        .update({ assignment_status: "cash_pending", payment_mode: "cash" })
        .eq("id", feeAssignment.id);
      setPaySuccess("Cash payment request sent. Your admin will verify and unlock your dashboard.");
      loadData();
      refreshAccess();
    } catch (err: any) {
      setPayError(err.message ?? "Failed to submit cash request.");
    } finally {
      setCashSubmitting(false);
    }
  }

  async function handleRolloverRequest() {
    if (!feeAssignment?.id) return;
    setRolloverSubmitting(true);
    setPayError(null);
    try {
      await supabase
        .from("fee_assignments")
        .update({ assignment_status: "rollover_pending", payment_mode: "rollover" })
        .eq("id", feeAssignment.id);

      // Notify all superadmins
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
          related_entity_id: feeAssignment.id,
          related_entity_type: "fee_assignment",
        }));
        await supabase.from("notifications").insert(notifications);
      }

      setPaySuccess("Rollover requested! Your admin will review and approve it to unlock your dashboard.");
      loadData();
      refreshAccess();
    } catch (err: any) {
      setPayError(err.message ?? "Failed to request rollover.");
    } finally {
      setRolloverSubmitting(false);
    }
  }

  if (loading)
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-6 text-primary animate-spin" />
      </div>
    );

  return (
    <>
      <PageHeader title="Fee & payments" subtitle="Invoices, history, and receipts" />

      {paySuccess && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-success/10 border border-success/25 mb-4 animate-fade-up">
          <CheckCircle className="size-4 text-success shrink-0" />
          <span className="text-sm font-medium text-success">{paySuccess}</span>
        </div>
      )}
      {payError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/25 mb-4">
          <AlertTriangle className="size-4 text-destructive shrink-0" />
          <span className="text-sm text-destructive">{payError}</span>
        </div>
      )}

      {/* ── Rollover Approved — Payment Due Section ── */}
      {feeAssignment && isRolloverApproved && (
        <div className="bento-card p-6 mb-6 border-info/25 bg-info/5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <RotateCcw className="size-4 text-info" />
                <span className="label-micro text-info">Rolled-over payment</span>
              </div>
              <h3 className="font-display font-semibold text-lg">{planName}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                ₹ {planAmount.toLocaleString("en-IN")} · {planCycle} · Payment deferred
              </p>
              <p className="text-xs text-info mt-2 font-medium">
                Your payment rollover has been approved. Please clear this amount at your convenience.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {planAmount > 0 ? (
                <button
                  onClick={() => handlePay(activeInvoice)}
                  className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#dc2626] transition shadow-card cursor-pointer"
                >
                  <CreditCard className="size-4" /> Pay online ₹
                  {Math.max(0, Number(activeInvoice.balance_outstanding ?? activeInvoice.amount_due ?? planAmount) - discountAmount).toLocaleString("en-IN")}
                </button>
              ) : null}
              <button
                onClick={handleCashRequest}
                disabled={cashSubmitting}
                className="inline-flex items-center gap-2 border border-border bg-surface px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-subtle transition disabled:opacity-60 cursor-pointer"
              >
                {cashSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Banknote className="size-4" />
                )}
                {cashSubmitting ? "Sending…" : "Pay by cash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fee assignment card (when assigned but no invoice yet, or cash pending) ── */}
      {feeAssignment && !isPaid && !isRolloverApproved && (
        <div
          className={`bento-card p-6 mb-6 ${
            isCashPending
              ? "border-warning/25 bg-warning/5"
              : isRolloverPending
                ? "border-info/25 bg-info/5"
                : "border-primary/25 bg-primary/5"
          }`}
        >
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {isCashPending ? (
                  <Clock className="size-4 text-warning" />
                ) : isRolloverPending ? (
                  <RotateCcw className="size-4 text-info" />
                ) : (
                  <CreditCard className="size-4 text-primary" />
                )}
                <span className="label-micro">
                  {isCashPending
                    ? "Cash payment pending"
                    : isRolloverPending
                      ? "Rollover approval pending"
                      : "Fee package assigned"}
                </span>
              </div>
              <h3 className="font-display font-semibold text-lg">{planName}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                ₹ {planAmount.toLocaleString("en-IN")} · {planCycle}
              </p>
              {isPendingApproval && (
                <p className="text-xs text-warning mt-2 font-medium">
                  {isOnlinePending
                    ? "Your online payment (PayU) is submitted and awaiting admin confirmation to unlock your dashboard."
                    : "Your admin will confirm cash receipt and unlock your dashboard."}
                </p>
              )}
              {isRolloverPending && (
                <p className="text-xs text-info mt-2 font-medium">
                  Your rollover request is pending superadmin approval. Your dashboard will unlock once approved.
                </p>
              )}
            </div>

            {/* Payment actions — only when NOT already pending approval or rollover pending */}
            {!isPendingApproval && !isRolloverPending && (
              <div className="flex items-center gap-2 flex-wrap">
                {planAmount > 0 ? (
                  <button
                    onClick={() => handlePay(activeInvoice)}
                    className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#dc2626] transition shadow-card cursor-pointer"
                  >
                    <CreditCard className="size-4" /> Pay online ₹
                    {Math.max(0, Number(activeInvoice.balance_outstanding ?? activeInvoice.amount_due ?? planAmount) - discountAmount).toLocaleString("en-IN")}
                  </button>
                ) : (
                  <button
                    disabled
                    className="inline-flex items-center gap-2 bg-muted text-muted-foreground px-4 py-2.5 rounded-xl text-sm font-medium cursor-not-allowed"
                  >
                    <CreditCard className="size-4" /> Invoice pending
                  </button>
                )}
                <button
                  onClick={handleCashRequest}
                  disabled={cashSubmitting}
                  className="inline-flex items-center gap-2 border border-border bg-surface px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-subtle transition disabled:opacity-60 cursor-pointer"
                >
                  {cashSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Banknote className="size-4" />
                  )}
                  {cashSubmitting ? "Sending…" : "Pay by cash"}
                </button>
                {/* Rollover request button */}
                {canRequestRollover && (
                  <button
                    onClick={handleRolloverRequest}
                    disabled={rolloverSubmitting}
                    className="inline-flex items-center gap-2 border border-info/40 text-info bg-info/5 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-info/10 transition disabled:opacity-60 cursor-pointer"
                  >
                    {rolloverSubmitting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    {rolloverSubmitting ? "Requesting…" : "Request rollover"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Coupon Code section inside assigned package card */}
          {!isPendingApproval && planAmount > 0 && (
            <div className="mt-4 pt-4 border-t border-border/60">
              <label className="block text-xs font-semibold mb-1.5 text-foreground">Have a coupon code?</label>
              {appliedCoupon ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-success/10 border border-success/30 text-xs">
                  <div className="flex items-center gap-2">
                    <Tag className="size-4 text-success" />
                    <div>
                      <span className="font-bold font-mono text-success uppercase">{appliedCoupon.code}</span>
                      <span className="text-muted-foreground ml-2">
                        ({appliedCoupon.value_type === "percentage" ? `${appliedCoupon.value}% OFF` : `₹${appliedCoupon.value} OFF`}) — You save ₹{discountAmount.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="text-xs text-destructive hover:underline font-medium ml-3 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 max-w-sm">
                  <input
                    type="text"
                    value={couponCodeInput}
                    onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                    placeholder="Enter coupon code (e.g. SUMMER2026)"
                    className="input-premium py-1.5 px-3 text-xs font-mono uppercase flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={couponLoading || !couponCodeInput.trim()}
                    className="px-3.5 py-1.5 bg-foreground text-background text-xs font-semibold rounded-xl hover:bg-foreground/90 disabled:opacity-50 transition cursor-pointer shrink-0"
                  >
                    {couponLoading ? "Checking…" : "Apply"}
                  </button>
                </div>
              )}
              {couponError && <p className="text-xs text-destructive mt-1.5 font-medium">{couponError}</p>}
            </div>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Current balance"
          value={`₹ ${currentOutstanding.toLocaleString("en-IN")}`}
          deltaTone={currentOutstanding > 0 ? "warning" : "success"}
          delta={currentOutstanding > 0 ? "Action required" : "All clear"}
          hint={
            activeInvoice?.due_date
              ? `Next due: ${new Date(activeInvoice.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
              : "No pending dues"
          }
        />
        <StatCard
          label="Paid this year"
          value={`₹ ${totalPaid.toLocaleString("en-IN")}`}
          delta={totalDue > 0 ? `${Math.round((totalPaid / totalDue) * 100)}%` : "0%"}
          hint="Collection rate"
        />
        <StatCard
          label="Lifetime fees invoiced"
          value={`₹ ${totalDue.toLocaleString("en-IN")}`}
          hint="Since joining"
        />
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-semibold">Payment history</h3>
            <p className="text-xs text-muted-foreground mt-1">
              All recorded payments with transaction details.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-subtle text-muted-foreground">
            {displayedPayments.length} records
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-elevated">
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-5 py-3">Date</th>
              <th className="text-left font-medium px-5 py-3">Invoice</th>
              <th className="text-right font-medium px-5 py-3">Amount</th>
              <th className="text-left font-medium px-5 py-3">Mode</th>
              <th className="text-left font-medium px-5 py-3">Reference</th>
              <th className="text-right font-medium px-5 py-3">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {displayedPayments.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No recorded payments yet.
                </td>
              </tr>
            ) : (
              displayedPayments.map((payment) => (
                <tr key={payment.id} className="border-t border-border hover:bg-subtle transition">
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    {payment.payment_date
                      ? new Date(payment.payment_date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                      : new Date(payment.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-mono text-xs font-medium">
                      {payment.invoices?.invoice_number ?? payment.invoice_id ?? "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {payment.invoices?.billing_period ?? "Recorded payment"}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right tabular font-medium">
                    ₹ {Number(payment.amount ?? 0).toLocaleString("en-IN")}
                  </td>
                  <td className="px-5 py-4 text-xs capitalize text-muted-foreground">
                    {payment.payment_mode ?? "online"}
                  </td>
                  <td className="px-5 py-4 text-xs font-mono text-muted-foreground break-all">
                    {payment.transaction_reference ||
                      payment.razorpay_payment_id ||
                      payment.razorpay_order_id ||
                      "—"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() =>
                        generateReceipt({
                          invoiceNumber:
                            payment.invoices?.invoice_number ?? payment.invoice_id ?? "PAYMENT",
                          athleteName: profile?.full_name ?? "Athlete",
                          amount: Number(payment.amount ?? 0),
                          paymentDate: payment.payment_date ?? payment.created_at,
                          paymentMode: payment.payment_mode ?? "online",
                          transactionRef:
                            payment.transaction_reference ??
                            payment.razorpay_payment_id ??
                            undefined,
                          planName:
                            payment.invoices?.fee_assignments?.fee_plans?.plan_name ??
                            feeAssignment?.fee_plans?.plan_name,
                        })
                      }
                      className="text-xs text-primary-dark font-semibold inline-flex items-center gap-1 hover:underline"
                    >
                      <Download className="size-3" /> Receipt
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-1 bg-subtle rounded-lg p-1">
            {(["all", "paid", "unpaid", "overdue"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition ${filter === f ? "bg-surface shadow-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-elevated">
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-5 py-3">Invoice #</th>
              <th className="text-left font-medium px-5 py-3">Generated on</th>
              <th className="text-right font-medium px-5 py-3">Amount</th>
              <th className="text-right font-medium px-5 py-3">Balance</th>
              <th className="text-left font-medium px-5 py-3">Due date</th>
              <th className="text-left font-medium px-5 py-3">Status</th>
              <th className="text-right font-medium px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => (
              <tr key={inv.id} className="border-t border-border hover:bg-subtle transition">
                <td className="px-5 py-4 font-mono text-xs">{inv.invoice_number}</td>
                <td className="px-5 py-4 text-muted-foreground text-xs">
                  {new Date(inv.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className="px-5 py-4 text-right tabular font-medium">
                  ₹ {Number(inv.amount_due).toLocaleString("en-IN")}
                </td>
                <td className="px-5 py-4 text-right tabular text-muted-foreground">
                  ₹ {effectiveOutstanding(inv).toLocaleString("en-IN")}
                </td>
                <td className="px-5 py-4 tabular text-muted-foreground">
                  {inv.due_date
                    ? new Date(inv.due_date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                    : "—"}
                </td>
                <td className="px-5 py-4">
                  <Badge tone={tones[inv.status as keyof typeof tones] || "warning"}>
                    {inv.status.replace(/_/g, " ")}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-right">
                  {inv.status === "paid" ? (
                    <button
                      onClick={() =>
                        generateReceipt({
                          invoiceNumber: inv.invoice_number,
                          athleteName: profile?.full_name ?? "Athlete",
                          amount: Number(inv.amount_paid ?? inv.amount_due),
                          paymentDate: inv.updated_at ?? inv.created_at,
                          paymentMode: feeAssignment?.payment_mode ?? "online",
                          planName: feeAssignment?.fee_plans?.plan_name,
                        })
                      }
                      className="text-xs text-success font-medium inline-flex items-center gap-1 hover:underline"
                    >
                      <Download className="size-3" /> Receipt
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => handlePay(inv)}
                        className="text-xs font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-lg inline-flex items-center gap-1 hover:bg-primary/90 transition shadow-card"
                      >
                        <CreditCard className="size-3" /> Pay online
                      </button>
                      {!isCashPending && (
                        <button
                          onClick={handleCashRequest}
                          disabled={cashSubmitting}
                          className="text-xs font-medium border border-border bg-surface px-3 py-1.5 rounded-lg inline-flex items-center gap-1 hover:bg-subtle transition disabled:opacity-60"
                        >
                          <Banknote className="size-3" /> Cash
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-sm text-muted-foreground">
                  No invoices found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
