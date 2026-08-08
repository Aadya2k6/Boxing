/**
 * PDF Receipt Generator — uses browser print to create downloadable receipts.
 * Opens a styled receipt in a new window and triggers print dialog.
 */
export function generateReceipt(data: {
  invoiceNumber: string;
  athleteName: string;
  amount: number;
  paymentDate: string;
  paymentMode: string;
  transactionRef?: string;
  planName?: string;
  academyName?: string;
  status?: "paid" | "unpaid" | "overdue";
  amountLabel?: string;
}) {
  const currentStatus = data.status || "paid";
  const label = data.amountLabel || (currentStatus === "paid" ? "Amount Paid" : "Amount Due");
  
  let tagBg = "#2E8F5A"; // green for paid
  let tagLabel = "PAID";
  if (currentStatus === "unpaid") {
    tagBg = "#D69E2E"; // amber
    tagLabel = "UNPAID";
  } else if (currentStatus === "overdue") {
    tagBg = "#E53E3E"; // red
    tagLabel = "OVERDUE";
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).toLowerCase();
  const footerDateTime = `${dateStr} at ${timeStr}`;

  const formattedPaymentDate = data.paymentDate
    ? new Date(data.paymentDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  const html = `<!DOCTYPE html>
<html><head>
<title>Receipt — ${data.invoiceNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #f5f5f5; padding: 40px; color: #1a1a1a; }
  .receipt { max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; border: 1px solid #e5e5e5; overflow: hidden; }
  .header { background: #1a1a1a; color: white; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
  .header .tag { font-size: 11px; background: ${tagBg}; padding: 4px 12px; border-radius: 20px; font-weight: 600; color: white; letter-spacing: 0.05em; }
  .body { padding: 32px; }
  .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
  .row:last-child { border: none; }
  .row .label { color: #737373; font-weight: 500; }
  .row .value { font-weight: 600; text-align: right; color: #1a1a1a; }
  .total { background: #fcfcfc; margin: 0 -32px; padding: 20px 32px; display: flex; justify-content: space-between; align-items: center; font-size: 16px; font-weight: 700; border-top: 1.5px solid #000000; }
  .total span:first-child { font-size: 16px; color: #1a1a1a; }
  .total span:last-child { font-size: 18px; color: #1a1a1a; }
  .footer { padding: 20px 32px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #f0f0f0; line-height: 1.5; }
  @media print { body { background: white; padding: 0; } .receipt { border: none; border-radius: 0; } }
</style>
</head><body>
<div class="receipt">
  <div class="header">
    <h1>Crickos Academy</h1>
    <span class="tag">${tagLabel}</span>
  </div>
  <div class="body">
    <div class="row"><span class="label">Invoice</span><span class="value">${data.invoiceNumber}</span></div>
    <div class="row"><span class="label">Athlete</span><span class="value">${data.athleteName}</span></div>
    ${data.planName ? `<div class="row"><span class="label">Fee Plan</span><span class="value">${data.planName}</span></div>` : ""}
    ${data.academyName ? `<div class="row"><span class="label">Academy</span><span class="value">${data.academyName}</span></div>` : ""}
    <div class="row"><span class="label">${currentStatus === "paid" ? "Payment Date" : "Due Date"}</span><span class="value">${formattedPaymentDate}</span></div>
    ${currentStatus === "paid" && data.paymentMode ? `<div class="row"><span class="label">Payment Mode</span><span class="value" style="text-transform:capitalize">${data.paymentMode}</span></div>` : ""}
    ${currentStatus === "paid" && data.transactionRef ? `<div class="row"><span class="label">Transaction Ref</span><span class="value" style="font-size:13px">${data.transactionRef}</span></div>` : ""}
    <div class="total"><span>${label}</span><span>₹ ${data.amount.toLocaleString("en-IN")}</span></div>
  </div>
  <div class="footer">
    This is a computer-generated receipt. No signature required.<br/>
    Generated on ${footerDateTime}
  </div>
</div>
<script>window.onload = function() { window.print(); }</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
