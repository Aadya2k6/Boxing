import { supabase } from "./supabase";

function formatDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function getOutstandingAmount(invoice: any) {
  if (!invoice || invoice.status === "paid") return 0;
  const balance = Number(invoice.balance_outstanding ?? 0);
  return balance > 0 ? balance : Number(invoice.amount_due ?? 0);
}

export function getPayableAmount(invoice: any, fallbackAmount = 0) {
  const invoiceAmount = getOutstandingAmount(invoice);
  return invoiceAmount > 0 ? invoiceAmount : Number(fallbackAmount ?? 0);
}

export async function ensureInvoiceForAssignment(assignment: any, existingInvoice?: any | null) {
  if (!assignment?.id) return existingInvoice ?? null;
  if (existingInvoice?.id && existingInvoice.status !== "paid") return existingInvoice;

  // 1. Try to find an existing unpaid invoice for this assignment
  try {
    const { data: existingDbInvoice } = await supabase
      .from("invoices")
      .select("*")
      .eq("fee_assignment_id", assignment.id)
      .neq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingDbInvoice) {
      return existingDbInvoice;
    }
  } catch (_) {}

  // 2. Try SECURITY DEFINER RPC first (allows athletes to generate renewal invoices without direct table INSERT)
  try {
    const { data: rpcInvoiceId, error: rpcErr } = await supabase.rpc("generate_renewal_invoice", {
      p_fee_assignment_id: assignment.id,
    });
    if (!rpcErr && rpcInvoiceId) {
      const { data: fetchedInvoice } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", rpcInvoiceId)
        .maybeSingle();
      if (fetchedInvoice) return fetchedInvoice;
    }
  } catch (_) {}

  // 3. Fallback direct INSERT (works for Admin/Superadmin)
  const amount = Number(
    assignment.custom_amount ??
    assignment.fee_plans?.amount ??
    assignment.amount ??
    0
  );
  if (amount <= 0) return null;

  const dueDate = assignment.billing_cycle_start ?? assignment.fee_start_date ?? new Date().toISOString().split("T")[0];
  const planName = assignment.fee_plans?.plan_name ?? "Fee Package";
  const cycle = assignment.fee_plans?.billing_cycle ?? assignment.billing_cycle ?? "current";
  const uniqueSuffix = Date.now().toString(36).toUpperCase();
  const invoiceNumber = `INV-${formatDateKey()}-${assignment.id.slice(0, 6).toUpperCase()}-${uniqueSuffix}`;

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      athlete_profile_id: assignment.athlete_profile_id,
      fee_assignment_id: assignment.id,
      billing_period: `${planName} - ${cycle}`,
      amount_due: amount,
      amount_paid: 0,
      balance_outstanding: amount,
      due_date: dueDate,
      status: "unpaid",
    })
    .select("*")
    .maybeSingle();

  if (error && !data) {
    console.warn("[ensureInvoiceForAssignment] insert error:", error.message);
  }
  return data ?? null;
}
