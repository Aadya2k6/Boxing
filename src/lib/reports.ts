import { supabase } from "./supabase";

export async function loadReportData() {
  const [
    { data: invoices },
    { data: payments },
    { data: athletes },
    { data: attendance },
    { data: leaves },
    { data: academies },
    { data: discounts },
    { data: feePlans },
  ] = await Promise.all([
    supabase.from("invoices").select("*").order("created_at", { ascending: true }),
    supabase.from("payments").select("*").order("payment_date", { ascending: true }),
    supabase.from("athlete_profiles").select("id, full_name, academy_id, onboarding_complete").eq("onboarding_complete", true),
    supabase.from("attendance").select("*"),
    supabase.from("leave_applications").select("*"),
    supabase.from("academies").select("id, name, city"),
    supabase.from("discount_schemes").select("*"),
    supabase.from("fee_plans").select("*"),
  ]);

  return {
    invoices: invoices ?? [],
    payments: payments ?? [],
    athletes: athletes ?? [],
    attendance: attendance ?? [],
    leaves: leaves ?? [],
    academies: academies ?? [],
    discounts: discounts ?? [],
    refunds: [],
    feePlans: feePlans ?? [],
  };
}

export function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()}`;
}

export function buildMonthlyData(invoices: any[]) {
  const map: Record<string, { month: string; Invoiced: number; Collected: number; Outstanding: number }> = {};
  invoices.forEach((i) => {
    const mk = monthKey(i.created_at);
    if (!map[mk]) map[mk] = { month: mk, Invoiced: 0, Collected: 0, Outstanding: 0 };
    map[mk].Invoiced += Number(i.amount_due ?? 0);
    map[mk].Collected += Number(i.amount_paid ?? 0);
    map[mk].Outstanding += Number(i.balance_outstanding ?? 0);
  });
  return Object.values(map);
}

export function buildPaymentMethodData(payments: any[]) {
  const map: Record<string, number> = {};
  payments.forEach((p) => {
    const mode = p.payment_mode ?? "unknown";
    map[mode] = (map[mode] ?? 0) + Number(p.amount ?? 0);
  });
  const colors: Record<string, string> = { online: "#6366F1", cash: "#2E8F5A", cheque: "#C47C1A", upi: "#0EA5E9", unknown: "#737373" };
  return Object.entries(map).map(([name, value]) => ({ name, value, color: colors[name] ?? "#737373" }));
}

export function buildStatusData(invoices: any[]) {
  const map: Record<string, number> = {};
  invoices.forEach((i) => { map[i.status] = (map[i.status] ?? 0) + 1; });
  const colors: Record<string, string> = { paid: "#2E8F5A", unpaid: "#C47C1A", overdue: "#DC2626", partially_paid: "#0EA5E9" };
  return Object.entries(map).map(([name, value]) => ({ name, value, color: colors[name] ?? "#737373" }));
}

export function buildAttendanceData(attendance: any[], leaves: any[]) {
  const map: Record<string, { month: string; Present: number; Absent: number; Leave: number }> = {};
  attendance.forEach((a) => {
    const mk = monthKey(a.date);
    if (!map[mk]) map[mk] = { month: mk, Present: 0, Absent: 0, Leave: 0 };
    if (a.status === "present") map[mk].Present++;
    else map[mk].Absent++;
  });
  leaves.filter((l) => l.status === "approved").forEach((l) => {
    const mk = monthKey(l.leave_date);
    if (!map[mk]) map[mk] = { month: mk, Present: 0, Absent: 0, Leave: 0 };
    map[mk].Leave++;
  });
  return Object.values(map);
}

export function buildAcademyRevenue(invoices: any[], athletes: any[], academies: any[]) {
  const athleteAcademy: Record<string, string> = {};
  athletes.forEach((a: any) => { if (a.academy_id) athleteAcademy[a.id] = a.academy_id; });
  const academyMap: Record<string, string> = {};
  academies.forEach((a: any) => { academyMap[a.id] = a.name; });

  const rev: Record<string, { id: string; name: string; invoiced: number; collected: number; count: number }> = {};
  invoices.forEach((inv: any) => {
    const acadId = inv.academy_id ?? athleteAcademy[inv.athlete_profile_id] ?? "unassigned";
    const acadName = academyMap[acadId] ?? "Unassigned";
    if (!rev[acadId]) rev[acadId] = { id: acadId, name: acadName, invoiced: 0, collected: 0, count: 0 };
    rev[acadId].invoiced += Number(inv.amount_due ?? 0);
    rev[acadId].collected += Number(inv.amount_paid ?? 0);
    rev[acadId].count++;
  });
  return Object.values(rev);
}

export function csvExport(filename: string, header: string, rows: string[]) {
  const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
