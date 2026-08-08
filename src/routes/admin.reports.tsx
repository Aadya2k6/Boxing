import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard, Badge } from "@/components/dashboard/DashboardLayout";
import { FileDown, FileText, Loader2, TrendingUp, Users, RotateCcw, Percent } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Legend
} from "recharts";

export const Route = createFileRoute("/admin/reports")({ component: ReportsPage });

const REPORT_TYPES = [
  { k: "revenue",    label: "Monthly Revenue Summary" },
  { k: "dues",       label: "Outstanding Dues Report" },
  { k: "athlete",    label: "Payment History Per Athlete" },
  { k: "discounts",  label: "Discount & Concession Summary" },
  { k: "refunds",    label: "Refund Log" },
  { k: "rate",       label: "Collection Rate" },
];

const COLORS = { collected: "#2E8F5A", outstanding: "#C47C1A", invoiced: "#1C212B", overdue: "#D94040" };

function ReportsPage() {
  const [active, setActive] = useState("revenue");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [discountsApplied, setDiscountsApplied] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [
        { data: invData },
        { data: apData },
        { data: discData },
        { data: refData },
      ] = await Promise.all([
        supabase.from("invoices").select("*, athlete_profiles(full_name, primary_discipline)").order("created_at", { ascending: true }),
        supabase.from("athlete_profiles").select("id, full_name, primary_discipline").eq("onboarding_complete", true),
        supabase.from("discount_applications").select("*, discount_schemes(name, value_type, value), athlete_profiles(full_name)").order("created_at", { ascending: false }),
        supabase.from("refunds").select("*, athlete_profiles(full_name), profiles!refunds_requested_by_fkey(full_name)").order("created_at", { ascending: false }),
      ]);
      setInvoices(invData ?? []);
      setAthletes(apData ?? []);
      setDiscountsApplied(discData ?? []);
      setRefunds(refData ?? []);
      if (apData?.[0]) setSelectedAthlete(apData[0].id);
    } finally {
      setLoading(false);
    }
  }

  // ── Computed metrics ──────────────────────────────────────────────────
  const totalInvoiced   = invoices.reduce((s, i) => s + Number(i.amount_due), 0);
  const totalCollected  = invoices.reduce((s, i) => s + Number(i.amount_paid ?? 0), 0);
  const totalOutstanding = invoices.filter(i => i.status !== "paid").reduce((s, i) => s + Number(i.balance_outstanding ?? 0), 0);
  const collectionRate  = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0;
  const overdueCount    = invoices.filter(i => i.status === "overdue").length;

  // Monthly grouping
  const monthMap: Record<string, any> = {};
  invoices.forEach(i => {
    const d = new Date(i.created_at);
    const key = `${d.toLocaleString("en-IN", { month: "short" })} ${d.getFullYear()}`;
    if (!monthMap[key]) monthMap[key] = { month: key, Invoiced: 0, Collected: 0, Outstanding: 0 };
    monthMap[key].Invoiced    += Number(i.amount_due);
    monthMap[key].Collected   += Number(i.amount_paid ?? 0);
    monthMap[key].Outstanding += Number(i.balance_outstanding ?? 0);
  });
  const monthlyData = Object.values(monthMap);

  const pieData = [
    { name: "Collected",    value: totalCollected,  color: COLORS.collected },
    { name: "Outstanding",  value: totalOutstanding, color: COLORS.outstanding },
  ].filter(d => d.value > 0);

  // Athlete payment history
  const athleteInvoices = invoices.filter(i => i.athlete_profile_id === selectedAthlete);

  // CSV export generators
  function downloadCSV(rows: string[][], filename: string) {
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportCurrentCSV() {
    if (active === "revenue") {
      downloadCSV(
        [["Month", "Invoiced", "Collected", "Outstanding", "Rate%"],
         ...monthlyData.map(m => [m.month, m.Invoiced, m.Collected, m.Outstanding, m.Invoiced > 0 ? Math.round(m.Collected / m.Invoiced * 100) : 0])],
        `Crickos_Revenue_${new Date().toISOString().split("T")[0]}.csv`
      );
    } else if (active === "dues") {
      const dues = invoices.filter(i => i.status !== "paid");
      downloadCSV(
        [["Athlete", "Invoice", "Amount Due", "Outstanding", "Status", "Due Date", "Days Overdue"],
         ...dues.map(i => {
           const days = i.status === "overdue" && i.due_date ? Math.floor((Date.now() - new Date(i.due_date).getTime()) / 86400000) : 0;
           return [i.athlete_profiles?.full_name, i.invoice_number, i.amount_due, i.balance_outstanding, i.status, i.due_date, days];
         })],
        `Crickos_Dues_${new Date().toISOString().split("T")[0]}.csv`
      );
    } else if (active === "refunds") {
      downloadCSV(
        [["Athlete", "Amount", "Reason", "Status", "Requested By", "Reviewed At"],
         ...refunds.map(r => [r.athlete_profiles?.full_name, r.amount, r.reason, r.status, r.profiles?.full_name, r.reviewed_at ?? ""])],
        `Crickos_Refunds_${new Date().toISOString().split("T")[0]}.csv`
      );
    }
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .printable-report, .printable-report * { visibility: visible; }
          .printable-report { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <PageHeader
        title="Reports"
        subtitle="Section 8 — Financial intelligence with real-time data"
        actions={
          <div className="flex gap-2 no-print">
            <button onClick={exportCurrentCSV} className="inline-flex items-center gap-2 border border-border px-3 py-2 rounded-lg text-sm hover:bg-subtle transition">
              <FileDown className="size-3.5" /> CSV
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm hover:bg-primary-light transition">
              <FileText className="size-3.5" /> PDF
            </button>
          </div>
        }
      />

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-6 printable-report">
          {/* Sidebar */}
          <aside className="lg:col-span-3 no-print">
            <div className="bg-surface border border-border rounded-xl p-2 space-y-0.5 sticky top-24">
              <div className="label-micro px-3 py-2">Report type</div>
              {REPORT_TYPES.map(r => (
                <button key={r.k} onClick={() => setActive(r.k)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition ${active === r.k ? "bg-[#ef4444] text-white font-semibold" : "text-muted-foreground hover:bg-subtle hover:text-foreground"}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </aside>

          {/* Main */}
          <main className="lg:col-span-9 space-y-6">
            {/* Print header */}
            <div className="hidden print:block mb-4">
              <h1 className="text-2xl font-display font-bold">Crickos Academy — {REPORT_TYPES.find(r => r.k === active)?.label}</h1>
              <p className="text-sm text-muted-foreground">Generated on {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>

            {/* ── 1. MONTHLY REVENUE ── */}
            {active === "revenue" && (
              <>
                <div className="grid sm:grid-cols-3 gap-4">
                  <StatCard label="Total collected (YTD)" value={`₹ ${(totalCollected / 100000).toFixed(2)}L`} delta={`₹ ${totalCollected.toLocaleString("en-IN")}`} />
                  <StatCard label="Total outstanding" value={`₹ ${(totalOutstanding / 100000).toFixed(2)}L`} deltaTone="warning" delta={`${overdueCount} overdue`} />
                  <StatCard label="Collection rate" value={`${collectionRate}%`} delta="Invoiced vs paid" />
                </div>
                <div className="bento-card p-6">
                  <h2 className="font-display font-semibold mb-1">Monthly Revenue</h2>
                  <p className="text-xs text-muted-foreground mb-6">Invoiced vs collected per month</p>
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#737373" }} dy={8} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#737373" }} dx={-8} tickFormatter={v => `₹${Math.round(v / 1000)}k`} />
                          <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #E5E5E5", fontSize: 12 }} formatter={(v: number) => `₹ ${v.toLocaleString("en-IN")}`} />
                          <Bar dataKey="Invoiced" fill={COLORS.invoiced} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Collected" fill={COLORS.collected} radius={[4, 4, 0, 0]} />
                          <Legend />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="h-64 flex flex-col items-center justify-center">
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={3} dataKey="value">
                              {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                            <Tooltip formatter={(v: number) => `₹ ${v.toLocaleString("en-IN")}`} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-success" /> Collected</div>
                        <div className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-warning" /> Outstanding</div>
                      </div>
                    </div>
                  </div>
                  <table className="w-full text-sm mt-6">
                    <thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left font-medium py-2">Month</th>
                      <th className="text-right font-medium py-2">Invoiced</th>
                      <th className="text-right font-medium py-2">Collected</th>
                      <th className="text-right font-medium py-2">Outstanding</th>
                      <th className="text-right font-medium py-2">Rate</th>
                    </tr></thead>
                    <tbody>
                      {monthlyData.length === 0
                        ? <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-sm">No financial data yet.</td></tr>
                        : monthlyData.map(m => (
                          <tr key={m.month} className="border-b border-border">
                            <td className="py-3 font-medium">{m.month}</td>
                            <td className="py-3 text-right tabular">₹ {m.Invoiced.toLocaleString("en-IN")}</td>
                            <td className="py-3 text-right tabular text-success">₹ {m.Collected.toLocaleString("en-IN")}</td>
                            <td className="py-3 text-right tabular text-warning">₹ {m.Outstanding.toLocaleString("en-IN")}</td>
                            <td className="py-3 text-right font-semibold">{m.Invoiced > 0 ? Math.round(m.Collected / m.Invoiced * 100) : 0}%</td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ── 2. OUTSTANDING DUES ── */}
            {active === "dues" && (
              <div className="bento-card p-6">
                <h2 className="font-display font-semibold mb-1">Outstanding Dues Report</h2>
                <p className="text-xs text-muted-foreground mb-5">All unpaid and partially paid invoices with overdue flags</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left font-medium py-2">Athlete</th>
                    <th className="text-left font-medium py-2">Invoice</th>
                    <th className="text-right font-medium py-2">Due</th>
                    <th className="text-right font-medium py-2">Outstanding</th>
                    <th className="text-left font-medium py-2 pl-4">Status</th>
                    <th className="text-right font-medium py-2">Days overdue</th>
                  </tr></thead>
                  <tbody>
                    {invoices.filter(i => i.status !== "paid").length === 0
                      ? <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No outstanding dues 🎉</td></tr>
                      : invoices.filter(i => i.status !== "paid").map(i => {
                        const days = i.status === "overdue" && i.due_date ? Math.floor((Date.now() - new Date(i.due_date).getTime()) / 86400000) : 0;
                        return (
                          <tr key={i.id} className="border-b border-border">
                            <td className="py-3 font-medium">{i.athlete_profiles?.full_name ?? "—"}</td>
                            <td className="py-3 font-mono text-xs">{i.invoice_number}</td>
                            <td className="py-3 text-right tabular">₹ {Number(i.amount_due).toLocaleString("en-IN")}</td>
                            <td className="py-3 text-right tabular font-semibold">₹ {Number(i.balance_outstanding ?? 0).toLocaleString("en-IN")}</td>
                            <td className="py-3 pl-4"><Badge tone={i.status === "overdue" ? "danger" : "warning"}>{i.status.replace("_", " ")}</Badge></td>
                            <td className="py-3 text-right tabular">{days > 0 ? <span className="text-destructive font-semibold">{days}d</span> : "—"}</td>
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>
            )}

            {/* ── 3. PAYMENT HISTORY PER ATHLETE ── */}
            {active === "athlete" && (
              <div className="bento-card p-6">
                <div className="flex items-center gap-4 mb-5">
                  <h2 className="font-display font-semibold flex-1">Payment history per athlete</h2>
                  <select value={selectedAthlete} onChange={e => setSelectedAthlete(e.target.value)} className="text-sm h-9 px-3 border border-border rounded-lg bg-elevated">
                    {athletes.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                  </select>
                </div>
                {athleteInvoices.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">No invoices for this athlete.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left font-medium py-2">Invoice</th>
                      <th className="text-left font-medium py-2">Period</th>
                      <th className="text-right font-medium py-2">Amount</th>
                      <th className="text-right font-medium py-2">Paid</th>
                      <th className="text-left font-medium py-2 pl-4">Status</th>
                    </tr></thead>
                    <tbody>
                      {athleteInvoices.map(i => (
                        <tr key={i.id} className="border-b border-border">
                          <td className="py-3 font-mono text-xs">{i.invoice_number}</td>
                          <td className="py-3 text-muted-foreground text-xs">{i.billing_period ?? "—"}</td>
                          <td className="py-3 text-right tabular">₹ {Number(i.amount_due).toLocaleString("en-IN")}</td>
                          <td className="py-3 text-right tabular text-success">₹ {Number(i.amount_paid ?? 0).toLocaleString("en-IN")}</td>
                          <td className="py-3 pl-4">
                            <Badge tone={i.status === "paid" ? "success" : i.status === "overdue" ? "danger" : "warning"}>
                              {i.status.replace("_", " ")}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── 4. DISCOUNTS ── */}
            {active === "discounts" && (
              <div className="bento-card p-6">
                <h2 className="font-display font-semibold mb-1">Discount & Concession Summary</h2>
                <p className="text-xs text-muted-foreground mb-5">All discounts applied by admins with reasons</p>
                {discountsApplied.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">No discounts applied yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left font-medium py-2">Athlete</th>
                      <th className="text-left font-medium py-2">Discount</th>
                      <th className="text-right font-medium py-2">Value</th>
                      <th className="text-left font-medium py-2 pl-4">Reason</th>
                      <th className="text-left font-medium py-2">Status</th>
                    </tr></thead>
                    <tbody>
                      {discountsApplied.map(d => (
                        <tr key={d.id} className="border-b border-border">
                          <td className="py-3 font-medium">{d.athlete_profiles?.full_name}</td>
                          <td className="py-3 text-xs text-muted-foreground">{d.discount_schemes?.name}</td>
                          <td className="py-3 text-right font-semibold text-primary-dark">
                            {d.discount_schemes?.value_type === "percentage" ? `${d.discount_schemes.value}%` : `₹ ${Number(d.discount_schemes?.value).toLocaleString("en-IN")}`}
                          </td>
                          <td className="py-3 pl-4 text-xs text-muted-foreground max-w-xs">{d.reason}</td>
                          <td className="py-3"><Badge tone={d.approval_status === "approved" ? "success" : d.approval_status === "pending" ? "warning" : undefined}>{d.approval_status ?? "applied"}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── 5. REFUNDS ── */}
            {active === "refunds" && (
              <div className="bento-card p-6">
                <h2 className="font-display font-semibold mb-1">Refund Log</h2>
                <p className="text-xs text-muted-foreground mb-5">Complete audit trail of all refund requests and approvals</p>
                {refunds.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">No refunds recorded.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left font-medium py-2">Athlete</th>
                      <th className="text-right font-medium py-2">Amount</th>
                      <th className="text-left font-medium py-2 pl-4">Reason</th>
                      <th className="text-left font-medium py-2">Status</th>
                      <th className="text-left font-medium py-2">Requested by</th>
                    </tr></thead>
                    <tbody>
                      {refunds.map(r => (
                        <tr key={r.id} className="border-b border-border">
                          <td className="py-3 font-medium">{r.athlete_profiles?.full_name}</td>
                          <td className="py-3 text-right tabular font-semibold">₹ {Number(r.amount).toLocaleString("en-IN")}</td>
                          <td className="py-3 pl-4 text-xs text-muted-foreground max-w-xs">{r.reason}</td>
                          <td className="py-3"><Badge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{r.status}</Badge></td>
                          <td className="py-3 text-xs text-muted-foreground">{r.profiles?.full_name ?? "Admin"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── 6. COLLECTION RATE ── */}
            {active === "rate" && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <StatCard label="Overall collection rate" value={`${collectionRate}%`} delta="Invoiced vs paid" icon={Percent} />
                  <StatCard label="Total athletes" value={String(athletes.length)} delta="Enrolled" icon={Users} />
                </div>
                <div className="bento-card p-6">
                  <h2 className="font-display font-semibold mb-1">Collection Rate by Month</h2>
                  <p className="text-xs text-muted-foreground mb-6">Percentage of invoiced amount collected per billing period</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData.map(m => ({ ...m, Rate: m.Invoiced > 0 ? Math.round(m.Collected / m.Invoiced * 100) : 0 }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#737373" }} dy={8} />
                        <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#737373" }} tickFormatter={v => `${v}%`} />
                        <Tooltip contentStyle={{ borderRadius: "8px", fontSize: 12 }} formatter={(v: number) => `${v}%`} />
                        <Bar dataKey="Rate" fill={COLORS.collected} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      )}
    </>
  );
}
