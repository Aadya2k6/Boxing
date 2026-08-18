import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { FileDown, FileText, Loader2, TrendingUp, Users, MapPin, CalendarCheck, Percent, Download, X, CheckCircle, CreditCard, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, LineChart, Line, Legend,
  AreaChart, Area,
} from "recharts";
import {
  loadReportData, buildMonthlyData, buildPaymentMethodData,
  buildStatusData, buildAttendanceData, buildAcademyRevenue, csvExport,
} from "@/lib/reports";
import { generateReceipt } from "@/lib/pdf-receipt";

export const Route = createFileRoute("/superadmin/reports")({ component: SAReports });

const COLORS = ["#6366F1", "#2E8F5A", "#C47C1A", "#DC2626", "#0EA5E9", "#8B5CF6", "#EC4899"];
const fmt = (v: number) => `₹ ${v.toLocaleString("en-IN")}`;
const fmtK = (v: number) => `₹${v >= 100000 ? (v / 100000).toFixed(1) + "L" : (v / 1000).toFixed(0) + "k"}`;

function generateAcademyPaymentReportPdf(data: {
  academyName: string;
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  payments: any[];
  invoices: any[];
  athleteMap: Record<string, string>;
}) {
  const html = `<!DOCTYPE html>
<html><head>
<title>Payment History — ${data.academyName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f5f5f5; padding: 30px; color: #1a1a1a; }
  .report { max-width: 820px; margin: 0 auto; background: white; border-radius: 12px; border: 1px solid #e5e5e5; overflow: hidden; padding: 32px; }
  .header { display: flex; justify-between: space-between; align-items: center; border-bottom: 2px solid #1a1a1a; padding-bottom: 20px; margin-bottom: 24px; }
  .header h1 { font-size: 22px; font-weight: 700; }
  .header .sub { font-size: 13px; color: #666; margin-top: 4px; }
  .badge { font-size: 12px; background: #EF4444; color: #fff; padding: 6px 14px; border-radius: 20px; font-weight: 700; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
  .stat-card { background: #f9f9f9; border: 1px solid #eee; border-radius: 8px; padding: 16px; text-align: center; }
  .stat-card .label { font-size: 11px; text-transform: uppercase; color: #666; font-weight: 600; }
  .stat-card .val { font-size: 18px; font-weight: 700; margin-top: 6px; }
  .section-title { font-size: 15px; font-weight: 700; margin: 24px 0 12px 0; padding-bottom: 6px; border-bottom: 1px solid #e5e5e5; color: #1a1a1a; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }
  th { text-align: left; background: #f3f3f3; padding: 8px 12px; font-weight: 600; color: #555; text-transform: uppercase; font-size: 10px; border-bottom: 1px solid #ddd; }
  td { padding: 10px 12px; border-bottom: 1px solid #eee; }
  tr:last-child td { border: none; }
  .text-right { text-align: right; }
  .text-success { color: #2E8F5A; font-weight: 600; }
  .text-warning { color: #C47C1A; font-weight: 600; }
  .footer { font-size: 11px; color: #888; text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; }
  @media print { body { background: white; padding: 0; } .report { border: none; padding: 0; max-width: 100%; } }
</style>
</head><body>
<div class="report">
  <div class="header">
    <div>
      <h1>Boxos Academy — Payment History Statement</h1>
      <div class="sub">Academy Location: <strong>${data.academyName}</strong></div>
    </div>
    <div class="badge">${data.academyName}</div>
  </div>

  <div class="stats">
    <div class="stat-card">
      <div class="label">Total Invoiced</div>
      <div class="val">${fmt(data.totalInvoiced)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Total Collected</div>
      <div class="val text-success">${fmt(data.totalCollected)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Outstanding Dues</div>
      <div class="val text-warning">${fmt(data.totalOutstanding)}</div>
    </div>
  </div>

  <div class="section-title">Payment Transactions History (${data.payments.length})</div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Invoice #</th>
        <th>Athlete Name</th>
        <th>Mode</th>
        <th>Ref / Txn ID</th>
        <th class="text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${data.payments.length === 0 ? '<tr><td colSpan="6" style="text-align:center;padding:20px;color:#888;">No payments recorded for this academy yet.</td></tr>' : data.payments.map((p: any) => `
        <tr>
          <td>${p.payment_date ? new Date(p.payment_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : new Date(p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
          <td style="font-family:monospace">${p.invoices?.invoice_number ?? p.invoice_id ?? "—"}</td>
          <td>${data.athleteMap[p.boxer_profile_id] ?? p.invoices?.boxer_profiles?.full_name ?? "Athlete"}</td>
          <td style="text-transform:capitalize">${p.payment_mode ?? "online"}</td>
          <td style="font-family:monospace;font-size:11px">${p.transaction_reference || p.razorpay_payment_id || "—"}</td>
          <td class="text-right text-success">${fmt(Number(p.amount ?? 0))}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="section-title">Invoice Records Breakdown (${data.invoices.length})</div>
  <table>
    <thead>
      <tr>
        <th>Invoice #</th>
        <th>Athlete</th>
        <th>Period</th>
        <th>Due Date</th>
        <th>Status</th>
        <th class="text-right">Amount Due</th>
        <th class="text-right">Collected</th>
      </tr>
    </thead>
    <tbody>
      ${data.invoices.length === 0 ? '<tr><td colSpan="7" style="text-align:center;padding:20px;color:#888;">No invoices found.</td></tr>' : data.invoices.map((inv: any) => `
        <tr>
          <td style="font-family:monospace">${inv.invoice_number}</td>
          <td>${data.athleteMap[inv.boxer_profile_id] ?? "Athlete"}</td>
          <td>${inv.billing_period ?? "Standard"}</td>
          <td>${inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}</td>
          <td style="text-transform:capitalize;font-weight:600">${inv.status}</td>
          <td class="text-right">${fmt(Number(inv.amount_due ?? 0))}</td>
          <td class="text-right text-success">${fmt(Number(inv.amount_paid ?? 0))}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="footer">
    Official Boxos Platform Statement — ${data.academyName}<br/>
    Generated on ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} at ${new Date().toLocaleTimeString("en-IN")}
  </div>
</div>
<script>window.onload = function() { window.print(); }</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

function SAReports() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"revenue" | "attendance" | "dues" | "discounts">("revenue");
  const [selectedAcademy, setSelectedAcademy] = useState<any | null>(null);
  const [modalTab, setModalTab] = useState<"history" | "invoices">("history");

  useEffect(() => { loadReportData().then(d => { setData(d); setLoading(false); }); }, []);

  if (loading || !data) return <div className="py-20 flex justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;

  const { invoices, payments, athletes, attendance, leaves, academies, discounts, refunds } = data;

  // ── Metrics ──
  const totalInvoiced = invoices.reduce((a: number, i: any) => a + Number(i.amount_due ?? 0), 0);
  const totalCollected = invoices.reduce((a: number, i: any) => a + Number(i.amount_paid ?? 0), 0);
  const totalOutstanding = invoices.filter((i: any) => i.status !== "paid").reduce((a: number, i: any) => a + Number(i.balance_outstanding ?? 0), 0);
  const collectionRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0;
  const overdueCount = invoices.filter((i: any) => i.status === "overdue").length;
  const presentCount = attendance.filter((a: any) => a.status === "present").length;
  const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

  // ── Chart data ──
  const monthlyData = buildMonthlyData(invoices);
  const payMethodData = buildPaymentMethodData(payments);
  const statusData = buildStatusData(invoices);
  const attendanceData = buildAttendanceData(attendance, leaves);
  const academyRev = buildAcademyRevenue(invoices, athletes, academies);

  // ── Outstanding dues ──
  const overdueInvoices = invoices.filter((i: any) => i.status !== "paid").map((i: any) => {
    const days = Math.max(0, Math.floor((Date.now() - new Date(i.due_date).getTime()) / 86400000));
    const athlete = athletes.find((a: any) => a.id === i.boxer_profile_id);
    return { ...i, daysOverdue: days, athleteName: athlete?.full_name ?? "Unknown" };
  }).sort((a: any, b: any) => b.daysOverdue - a.daysOverdue);

  // ── Revenue trend (line) ──
  const cumData = monthlyData.reduce((acc: any[], row) => {
    const prev = acc.length > 0 ? acc[acc.length - 1] : { CumCollected: 0, CumInvoiced: 0 };
    acc.push({ month: row.month, CumCollected: prev.CumCollected + row.Collected, CumInvoiced: prev.CumInvoiced + row.Invoiced });
    return acc;
  }, []);

  function handleCSV() {
    const h = "Invoice,Date,Status,Invoiced,Collected,Outstanding,Athlete";
    const rows = overdueInvoices.map((i: any) => `${i.invoice_number},${i.due_date},${i.status},${i.amount_due},${i.amount_paid},${i.balance_outstanding},${i.athleteName}`);
    csvExport(`Boxos_Report_${new Date().toISOString().split("T")[0]}.csv`, h, rows);
  }

  const tabs = [
    { key: "revenue", label: "Revenue" },
    { key: "attendance", label: "Attendance" },
    { key: "dues", label: "Outstanding Dues" },
    { key: "discounts", label: "Discounts & Refunds" },
  ] as const;

  return (
    <>
      <style>{`@media print { body * { visibility: hidden; } .print-area, .print-area * { visibility: visible; } .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; } .no-print { display: none !important; }}`}</style>

      <PageHeader title="Platform Reports" subtitle="Cross-academy analytics & financial intelligence" actions={
        <div className="flex gap-2 no-print">
          <button onClick={handleCSV} className="inline-flex items-center gap-2 border border-border px-3 py-2 rounded-lg text-xs hover:bg-subtle transition"><FileDown className="size-3.5" /> CSV</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-[#dc2626] transition"><FileText className="size-3.5" /> Print PDF</button>
        </div>
      } />

      <div className="print-area">
        {/* Print header */}
        <div className="mb-6 hidden print:block">
          <h1 className="text-2xl font-display font-bold">Boxos Platform Report</h1>
          <p className="text-sm text-muted-foreground">Generated {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <MiniStat icon={TrendingUp} label="YTD Revenue" value={fmtK(totalCollected)} sub={fmt(totalCollected)} color="text-success" />
          <MiniStat icon={FileText} label="Total Invoiced" value={fmtK(totalInvoiced)} sub={`${invoices.length} invoices`} color="text-foreground" />
          <MiniStat icon={Percent} label="Collection Rate" value={`${collectionRate}%`} sub="Platform-wide" color={collectionRate >= 80 ? "text-success" : "text-warning"} />
          <MiniStat icon={FileDown} label="Outstanding" value={fmtK(totalOutstanding)} sub={`${overdueCount} overdue`} color="text-warning" />
          <MiniStat icon={Users} label="Athletes" value={String(athletes.length)} sub="Onboarded" color="text-info" />
          <MiniStat icon={CalendarCheck} label="Attendance Rate" value={`${attendanceRate}%`} sub={`${presentCount} records`} color="text-primary" />
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-subtle rounded-lg p-1 mb-6 no-print">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-xs font-medium rounded-md transition ${tab === t.key ? "bg-surface shadow-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
          ))}
        </div>

        {/* Revenue tab */}
        {(tab === "revenue" || typeof window === "undefined") && (
          <div className="space-y-6 print:!block">
            <ChartCard title="Monthly Revenue" sub="Invoiced vs Collected across all academies">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255, 255, 255, 0.08)" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={v => `₹${v / 1000}k`} />
                    <Tooltip 
                      formatter={(v: number) => fmt(v)} 
                      contentStyle={{ 
                        backgroundColor: "rgba(11, 15, 23, 0.95)", 
                        borderRadius: 12, 
                        border: "1px solid rgba(255, 255, 255, 0.15)", 
                        fontSize: 12, 
                        color: "#F8FAFC",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
                      }}
                      itemStyle={{ color: "#F8FAFC" }}
                    />
                    <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12, color: "#94A3B8" }} />
                    <Bar dataKey="Invoiced" fill="#EF4444" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="Collected" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="Outstanding" fill="#F59E0B" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Cumulative Revenue Trend" sub="Running total of invoiced vs collected">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cumData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255, 255, 255, 0.08)" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={v => `₹${v / 1000}k`} />
                    <Tooltip 
                      formatter={(v: number) => fmt(v)} 
                      contentStyle={{ 
                        backgroundColor: "rgba(11, 15, 23, 0.95)", 
                        borderRadius: 12, 
                        border: "1px solid rgba(255, 255, 255, 0.15)", 
                        fontSize: 12, 
                        color: "#F8FAFC",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
                      }} 
                    />
                    <Area type="monotone" dataKey="CumInvoiced" stroke="#EF4444" fill="#EF4444" fillOpacity={0.15} strokeWidth={2.5} name="Total Invoiced" />
                    <Area type="monotone" dataKey="CumCollected" stroke="#10B981" fill="#10B981" fillOpacity={0.25} strokeWidth={2.5} name="Total Collected" />
                    <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12, color: "#94A3B8" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <div className="grid md:grid-cols-2 gap-6">
              <ChartCard title="Payment Methods" sub="Revenue split by payment mode">
                <div className="h-56 flex items-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={payMethodData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {payMethodData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Invoice Status" sub="Distribution of all invoices by status">
                <div className="h-56 flex items-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                        {statusData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>

            <ChartCard title="Academy-wise Revenue" sub="Click any row to view & download detailed payment history & invoices">
              <table className="w-full text-sm">
                <thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left py-2 font-medium">Academy</th>
                  <th className="text-right py-2 font-medium">Invoices</th>
                  <th className="text-right py-2 font-medium">Invoiced</th>
                  <th className="text-right py-2 font-medium">Collected</th>
                  <th className="text-right py-2 font-medium">Rate</th>
                </tr></thead>
                <tbody>
                  {academyRev.map((r: any) => {
                    const rate = r.invoiced > 0 ? Math.round((r.collected / r.invoiced) * 100) : 0;
                    return (
                      <tr
                        key={r.name}
                        onClick={() => { setSelectedAcademy(r); setModalTab("history"); }}
                        className="border-b border-border hover:bg-primary/5 cursor-pointer transition-colors"
                      >
                        <td className="py-3.5 font-medium">
                          <div className="inline-flex items-center gap-2 text-primary-dark font-semibold">
                            <MapPin className="size-3.5 text-primary shrink-0" />
                            <span>{r.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 text-right tabular font-medium">{r.count}</td>
                        <td className="py-3.5 text-right tabular font-medium">{fmt(r.invoiced)}</td>
                        <td className="py-3.5 text-right tabular text-success font-semibold">{fmt(r.collected)}</td>
                        <td className="py-3.5 text-right font-semibold text-foreground">{rate}%</td>
                      </tr>
                    );
                  })}
                  {academyRev.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No data</td></tr>}
                </tbody>
              </table>
            </ChartCard>
          </div>
        )}

        {/* Attendance tab */}
        {tab === "attendance" && (
          <div className="space-y-6">
            <ChartCard title="Monthly Attendance Overview" sub="Present / Absent / Approved Leave breakdown">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendanceData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#737373" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#737373" }} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e5e5", fontSize: 12 }} />
                    <Legend />
                    <Bar dataKey="Present" fill="#2E8F5A" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Absent" fill="#DC2626" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Leave" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
            <div className="grid sm:grid-cols-3 gap-4">
              <StatCard label="Total present" value={String(presentCount)} delta="All time" />
              <StatCard label="Total absent" value={String(attendance.filter((a: any) => a.status === "absent").length)} deltaTone="danger" delta="All time" />
              <StatCard label="Approved leaves" value={String(leaves.filter((l: any) => l.status === "approved").length)} delta="All time" />
            </div>
          </div>
        )}

        {/* Outstanding dues tab */}
        {tab === "dues" && (
          <ChartCard title="Outstanding Dues" sub={`${overdueInvoices.length} unpaid invoices sorted by days overdue`}>
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left py-2 font-medium">Athlete</th>
                <th className="text-left py-2 font-medium">Invoice</th>
                <th className="text-right py-2 font-medium">Amount Due</th>
                <th className="text-right py-2 font-medium">Outstanding</th>
                <th className="text-right py-2 font-medium">Due Date</th>
                <th className="text-right py-2 font-medium">Days Overdue</th>
                <th className="text-left py-2 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {overdueInvoices.slice(0, 50).map((inv: any) => (
                  <tr key={inv.id} className="border-b border-border">
                    <td className="py-3 font-medium">{inv.athleteName}</td>
                    <td className="py-3 font-mono text-xs text-muted-foreground">{inv.invoice_number}</td>
                    <td className="py-3 text-right tabular">{fmt(Number(inv.amount_due))}</td>
                    <td className="py-3 text-right tabular text-warning font-semibold">{fmt(Number(inv.balance_outstanding ?? 0))}</td>
                    <td className="py-3 text-right tabular text-muted-foreground">{new Date(inv.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                    <td className="py-3 text-right tabular"><span className={`font-semibold ${inv.daysOverdue > 30 ? "text-destructive" : inv.daysOverdue > 7 ? "text-warning" : ""}`}>{inv.daysOverdue}d</span></td>
                    <td className="py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.status === "overdue" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>{inv.status}</span></td>
                  </tr>
                ))}
                {overdueInvoices.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No outstanding dues 🎉</td></tr>}
              </tbody>
            </table>
          </ChartCard>
        )}

        {/* Discounts & Refunds tab */}
        {tab === "discounts" && (
          <div className="space-y-6">
            <ChartCard title="Discount Schemes" sub="All configured discount types">
              <table className="w-full text-sm">
                <thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left py-2 font-medium">Name</th>
                  <th className="text-left py-2 font-medium">Type</th>
                  <th className="text-right py-2 font-medium">Value</th>
                  <th className="text-left py-2 font-medium">Status</th>
                </tr></thead>
                <tbody>
                  {discounts.map((d: any) => (
                    <tr key={d.id} className="border-b border-border">
                      <td className="py-3 font-medium">{d.scheme_name}</td>
                      <td className="py-3 text-muted-foreground capitalize">{d.discount_type?.replace(/_/g, " ") ?? "—"}</td>
                      <td className="py-3 text-right tabular">{d.value_type === "percentage" ? `${d.value}%` : fmt(Number(d.value ?? 0))}</td>
                      <td className="py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${d.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{d.is_active ? "Active" : "Inactive"}</span></td>
                    </tr>
                  ))}
                  {discounts.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No discount schemes configured</td></tr>}
                </tbody>
              </table>
            </ChartCard>

            <ChartCard title="Refund Log" sub="All refund requests with approval status">
              <table className="w-full text-sm">
                <thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left py-2 font-medium">Athlete</th>
                  <th className="text-right py-2 font-medium">Amount</th>
                  <th className="text-left py-2 font-medium">Reason</th>
                  <th className="text-left py-2 font-medium">Status</th>
                  <th className="text-left py-2 font-medium">Date</th>
                </tr></thead>
                <tbody>
                  {refunds.map((r: any) => (
                    <tr key={r.id} className="border-b border-border">
                      <td className="py-3 font-medium">{r.boxer_profiles?.full_name ?? "—"}</td>
                      <td className="py-3 text-right tabular">{fmt(Number(r.refund_amount ?? 0))}</td>
                      <td className="py-3 text-muted-foreground text-xs max-w-[200px] truncate">{r.reason ?? "—"}</td>
                      <td className="py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === "approved" ? "bg-success/10 text-success" : r.status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>{r.status ?? "pending"}</span></td>
                      <td className="py-3 text-muted-foreground text-xs">{r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}</td>
                    </tr>
                  ))}
                  {refunds.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No refund requests</td></tr>}
                </tbody>
              </table>
            </ChartCard>
          </div>
        )}

        {/* Monthly summary table (always visible in print) */}
        <div className="mt-6">
          <ChartCard title="Monthly Summary Table" sub="Detailed period-wise breakdown">
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left py-2 font-medium">Period</th>
                <th className="text-right py-2 font-medium">Invoiced</th>
                <th className="text-right py-2 font-medium">Collected</th>
                <th className="text-right py-2 font-medium">Outstanding</th>
                <th className="text-right py-2 font-medium">Collection Rate</th>
              </tr></thead>
              <tbody>
                {monthlyData.map(row => {
                  const rate = row.Invoiced > 0 ? Math.round((row.Collected / row.Invoiced) * 100) : 0;
                  return (
                    <tr key={row.month} className="border-b border-border">
                      <td className="py-3 font-medium">{row.month}</td>
                      <td className="py-3 text-right tabular">{fmt(row.Invoiced)}</td>
                      <td className="py-3 text-right tabular text-success">{fmt(row.Collected)}</td>
                      <td className="py-3 text-right tabular text-warning">{fmt(row.Outstanding)}</td>
                      <td className="py-3 text-right"><span className={`font-semibold ${rate >= 80 ? "text-success" : rate >= 50 ? "text-warning" : "text-destructive"}`}>{rate}%</span></td>
                    </tr>
                  );
                })}
                {monthlyData.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No data yet</td></tr>}
              </tbody>
            </table>
          </ChartCard>
        </div>
      </div>

      {/* ── Academy Payment History & Invoices Popup Modal ── */}
      {selectedAcademy && (() => {
        const athleteMap = (athletes || []).reduce((acc: Record<string, string>, a: any) => {
          acc[a.id] = a.full_name ?? "Athlete";
          return acc;
        }, {});

        const athleteAcademy = (athletes || []).reduce((acc: Record<string, string>, a: any) => {
          if (a.academy_id) acc[a.id] = a.academy_id;
          return acc;
        }, {});

        const targetAcademyInvoices = invoices.filter((i: any) => {
          if (selectedAcademy.id === "unassigned") {
            return !i.academy_id && !athleteAcademy[i.boxer_profile_id];
          }
          return i.academy_id === selectedAcademy.id || athleteAcademy[i.boxer_profile_id] === selectedAcademy.id;
        });

        const targetAcademyPayments = payments.filter((p: any) => {
          const inv = invoices.find((i: any) => i.id === p.invoice_id);
          const aId = inv?.academy_id ?? athleteAcademy[p.boxer_profile_id] ?? "unassigned";
          if (selectedAcademy.id === "unassigned") return aId === "unassigned";
          return aId === selectedAcademy.id;
        });

        const modalInvoiced = targetAcademyInvoices.reduce((a: number, i: any) => a + Number(i.amount_due ?? 0), 0);
        const modalCollected = targetAcademyPayments.reduce((a: number, p: any) => a + Number(p.amount ?? 0), 0);
        const modalOutstanding = targetAcademyInvoices.filter((i: any) => i.status !== "paid").reduce((a: number, i: any) => a + Number(i.balance_outstanding ?? 0), 0);
        const modalRate = modalInvoiced > 0 ? Math.round((modalCollected / modalInvoiced) * 100) : 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm no-print">
            <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-4xl max-h-[90vh] flex flex-col animate-fade-up overflow-hidden">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-surface z-10">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                    <MapPin className="size-5 text-primary-dark" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-lg">{selectedAcademy.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cross-platform billing, invoices & payment history
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => generateAcademyPaymentReportPdf({
                      academyName: selectedAcademy.name,
                      totalInvoiced: modalInvoiced,
                      totalCollected: modalCollected,
                      totalOutstanding: modalOutstanding,
                      payments: targetAcademyPayments,
                      invoices: targetAcademyInvoices,
                      athleteMap,
                    })}
                    className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-[#dc2626] transition shadow-card cursor-pointer"
                  >
                    <Download className="size-3.5" /> Download PDF
                  </button>
                  <button
                    onClick={() => setSelectedAcademy(null)}
                    className="size-8 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground transition cursor-pointer"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {/* Quick summary stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-subtle/50 border border-border text-center">
                    <div className="text-[10px] uppercase font-semibold text-muted-foreground">Invoiced</div>
                    <div className="text-base font-bold font-display mt-1">{fmt(modalInvoiced)}</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-success/5 border border-success/20 text-center">
                    <div className="text-[10px] uppercase font-semibold text-success">Collected</div>
                    <div className="text-base font-bold font-display text-success mt-1">{fmt(modalCollected)}</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-warning/5 border border-warning/20 text-center">
                    <div className="text-[10px] uppercase font-semibold text-warning">Outstanding</div>
                    <div className="text-base font-bold font-display text-warning mt-1">{fmt(modalOutstanding)}</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-subtle/50 border border-border text-center">
                    <div className="text-[10px] uppercase font-semibold text-muted-foreground">Collection Rate</div>
                    <div className="text-base font-bold font-display mt-1">{modalRate}%</div>
                  </div>
                </div>

                {/* Modal Tab Controls */}
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div className="flex items-center gap-2 bg-subtle rounded-lg p-1">
                    <button
                      onClick={() => setModalTab("history")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${modalTab === "history" ? "bg-surface shadow-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Payment History ({targetAcademyPayments.length})
                    </button>
                    <button
                      onClick={() => setModalTab("invoices")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${modalTab === "invoices" ? "bg-surface shadow-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Invoices ({targetAcademyInvoices.length})
                    </button>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Showing records for <strong>{selectedAcademy.name}</strong>
                  </span>
                </div>

                {/* Payment History View */}
                {modalTab === "history" && (
                  <div className="border border-border rounded-xl overflow-hidden bg-surface">
                    <table className="w-full text-sm">
                      <thead className="bg-elevated">
                        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          <th className="text-left font-medium px-4 py-3">Date</th>
                          <th className="text-left font-medium px-4 py-3">Invoice #</th>
                          <th className="text-left font-medium px-4 py-3">Athlete</th>
                          <th className="text-left font-medium px-4 py-3">Mode</th>
                          <th className="text-left font-medium px-4 py-3">Reference</th>
                          <th className="text-right font-medium px-4 py-3">Amount</th>
                          <th className="text-right font-medium px-4 py-3">Receipt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {targetAcademyPayments.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">
                              No payment history recorded for this academy.
                            </td>
                          </tr>
                        ) : (
                          targetAcademyPayments.map((p: any) => {
                            const inv = invoices.find((i: any) => i.id === p.invoice_id);
                            const athName = athleteMap[p.boxer_profile_id] ?? inv?.boxer_profiles?.full_name ?? "Athlete";
                            return (
                              <tr key={p.id} className="border-t border-border hover:bg-subtle transition">
                                <td className="px-4 py-3 text-xs text-muted-foreground tabular">
                                  {p.payment_date
                                    ? new Date(p.payment_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                                    : new Date(p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                </td>
                                <td className="px-4 py-3 font-mono text-xs font-medium">
                                  {inv?.invoice_number ?? p.invoice_id ?? "—"}
                                </td>
                                <td className="px-4 py-3 font-medium text-xs">
                                  {athName}
                                </td>
                                <td className="px-4 py-3 text-xs capitalize text-muted-foreground">
                                  {p.payment_mode ?? "online"}
                                </td>
                                <td className="px-4 py-3 text-xs font-mono text-muted-foreground break-all">
                                  {p.transaction_reference || p.razorpay_payment_id || "—"}
                                </td>
                                <td className="px-4 py-3 text-right tabular font-bold text-success text-xs">
                                  {fmt(Number(p.amount ?? 0))}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    onClick={() => generateReceipt({
                                      invoiceNumber: inv?.invoice_number ?? "PAYMENT",
                                      athleteName: athName,
                                      amount: Number(p.amount ?? 0),
                                      paymentDate: p.payment_date ?? p.created_at,
                                      paymentMode: p.payment_mode ?? "online",
                                      transactionRef: p.transaction_reference ?? p.razorpay_payment_id ?? undefined,
                                      academyName: selectedAcademy.name,
                                    })}
                                    className="text-xs text-primary-dark font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer"
                                  >
                                    <Download className="size-3" /> Receipt
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Invoices View */}
                {modalTab === "invoices" && (
                  <div className="border border-border rounded-xl overflow-hidden bg-surface">
                    <table className="w-full text-sm">
                      <thead className="bg-elevated">
                        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          <th className="text-left font-medium px-4 py-3">Invoice #</th>
                          <th className="text-left font-medium px-4 py-3">Athlete</th>
                          <th className="text-left font-medium px-4 py-3">Period</th>
                          <th className="text-right font-medium px-4 py-3">Amount Due</th>
                          <th className="text-right font-medium px-4 py-3">Paid</th>
                          <th className="text-right font-medium px-4 py-3">Balance</th>
                          <th className="text-left font-medium px-4 py-3">Due Date</th>
                          <th className="text-left font-medium px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {targetAcademyInvoices.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-10 text-center text-xs text-muted-foreground">
                              No invoices found for this academy.
                            </td>
                          </tr>
                        ) : (
                          targetAcademyInvoices.map((inv: any) => {
                            const athName = athleteMap[inv.boxer_profile_id] ?? "Athlete";
                            return (
                              <tr key={inv.id} className="border-t border-border hover:bg-subtle transition">
                                <td className="px-4 py-3 font-mono text-xs font-medium">{inv.invoice_number}</td>
                                <td className="px-4 py-3 font-medium text-xs">{athName}</td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">{inv.billing_period ?? "Standard"}</td>
                                <td className="px-4 py-3 text-right tabular text-xs font-medium">{fmt(Number(inv.amount_due ?? 0))}</td>
                                <td className="px-4 py-3 text-right tabular text-xs text-success">{fmt(Number(inv.amount_paid ?? 0))}</td>
                                <td className="px-4 py-3 text-right tabular text-xs text-warning font-medium">{fmt(Number(inv.balance_outstanding ?? 0))}</td>
                                <td className="px-4 py-3 text-xs text-muted-foreground tabular">
                                  {inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                                    inv.status === "paid" ? "bg-success/10 text-success" :
                                    inv.status === "overdue" ? "bg-destructive/10 text-destructive" :
                                    "bg-warning/10 text-warning"
                                  }`}>
                                    {inv.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h3 className="font-display font-semibold">{title}</h3>
      {sub && <p className="text-xs text-muted-foreground mt-0.5 mb-5">{sub}</p>}
      {children}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`size-7 rounded-lg bg-elevated grid place-items-center ${color}`}><Icon className="size-3.5" /></div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="text-lg font-display font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}
