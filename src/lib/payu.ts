/**
 * PayU Payment Integration
 * Uses redirect-based Form POST checkout (PayU's official recommended method)
 *
 * Hash formula (from PayU docs):
 *   sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 *
 * Flow:
 * 1. Fetch merchant key + salt from academies table columns (payu_merchant_key, encrypted_payu_salt)
 * 2. Compute SHA-512 hash in browser
 * 3. POST to PayU payment page via hidden form redirect
 * 4. PayU redirects back to surl (success) or furl (failure)
 */

import { supabase as defaultSupabase } from "./supabase";

export interface PayUResponse {
  txnid: string;
  mihpayid?: string;
  status: "success" | "failure" | "pending" | "userCancelled";
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  hash?: string;
  error?: string;
  error_Message?: string;
  addedon?: string;
}

function generateTxnId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return "CKT" + ts + rand;
}

/**
 * Computes PayU SHA-512 hash using the exact official formula:
 *   sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 *
 * salt is the LAST element — 5 empty strings follow udf5, then salt.
 */
async function computePayUHash(
  key: string,
  txnid: string,
  amount: string,
  productinfo: string,
  firstname: string,
  email: string,
  udf1: string,
  udf2: string,
  udf3: string,
  udf4: string,
  udf5: string,
  salt: string,  // ALWAYS LAST
): Promise<string> {
  const parts = [
    key, txnid, amount, productinfo, firstname, email,
    udf1, udf2, udf3, udf4, udf5,
    "", "", "", "", "",  // udf6–udf10 (always empty per PayU spec)
    salt,               // salt goes at the very end
  ];
  const str = parts.join("|");
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-512", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

import { decryptSecret } from "./encryption";

/**
 * Reads PayU merchant key + salt directly from academies table columns.
 * - Primary: academies.payu_merchant_key + academies.encrypted_payu_salt for the given academyId
 * - Fallback: first academy row that has both fields set
 */
async function getPayUCredentials(academyId?: string): Promise<{ key: string; salt: string }> {
  let key = "";
  let salt = "";

  if (academyId) {
    const { data: ac } = await defaultSupabase
      .from("academies")
      .select("payu_merchant_key, encrypted_payu_salt")
      .eq("id", academyId)
      .maybeSingle();

    key = ac?.payu_merchant_key?.trim() || "";
    salt = await decryptSecret(ac?.encrypted_payu_salt);
  }

  // Fallback: any academy row that has PayU credentials set
  if (!key || !salt) {
    const { data: ac } = await defaultSupabase
      .from("academies")
      .select("payu_merchant_key, encrypted_payu_salt")
      .not("payu_merchant_key", "is", null)
      .not("encrypted_payu_salt", "is", null)
      .limit(1)
      .maybeSingle();

    key = key || ac?.payu_merchant_key?.trim() || "";
    salt = salt || (await decryptSecret(ac?.encrypted_payu_salt));
  }

  // Fallback 2: Environment variables
  key = key || (import.meta.env.VITE_PAYU_MERCHANT_KEY as string | undefined)?.trim() || "";
  salt = salt || (import.meta.env.VITE_PAYU_MERCHANT_SALT as string | undefined)?.trim() || "";

  if (!key) throw new Error("PayU merchant key is not configured. Please set it in Superadmin → Academy Locations.");
  if (!salt) throw new Error("PayU merchant salt is not configured. Please set it in Superadmin → Academy Locations.");

  return { key, salt };
}

export async function openPayUCheckout(opts: {
  amount: number;
  invoiceId: string;
  invoiceNumber: string;
  athleteProfileId: string;
  name: string;
  email: string;
  phone?: string;
  academyId?: string;
  merchantKey?: string;
  merchantSalt?: string;
  onSuccess: (response: PayUResponse) => Promise<void>;
  onDismiss?: () => void;
  onError?: (msg: string) => void;
}) {
  if (opts.amount <= 0) throw new Error("Payment amount must be greater than 0.");

  // Prefer explicitly passed credentials, then fetch from academies table
  let key = opts.merchantKey?.trim() || "";
  let salt = opts.merchantSalt?.trim() || "";

  if (!key || !salt) {
    const creds = await getPayUCredentials(opts.academyId);
    key = key || creds.key;
    salt = salt || creds.salt;
  }

  const txnid = generateTxnId();
  const amountStr = opts.amount.toFixed(2);
  const productinfo = "Fee payment - Invoice " + opts.invoiceNumber;
  const firstname = (opts.name || "Athlete").split(" ")[0];
  const email = opts.email || "";
  const phone = opts.phone || "9999999999";

  // udf fields carry metadata for post-payment processing
  const udf1 = opts.invoiceId ?? "";
  const udf2 = opts.athleteProfileId ?? "";
  const udf3 = opts.academyId ?? "";
  const udf4 = "";
  const udf5 = "";

  // Compute hash — NOTE: salt is the LAST argument
  const hash = await computePayUHash(
    key, txnid, amountStr, productinfo, firstname, email,
    udf1, udf2, udf3, udf4, udf5,
    salt,
  );

  // Determine endpoint — test keys have length < 8 or known test prefixes
  const isTestMode = key.length < 8 || /^(test|gtKFFx|0MPayl|oZ7uyM|96cXFm)/i.test(key);
  const actionUrl = isTestMode
    ? "https://test.payu.in/_payment"
    : "https://secure.payu.in/_payment";

  // surl/furl: where PayU redirects after payment
  const baseUrl = window.location.origin + window.location.pathname;
  const surl = baseUrl + "?payu_status=success&txnid=" + txnid + "&invoice=" + opts.invoiceId;
  const furl = baseUrl + "?payu_status=failure&txnid=" + txnid;

  // Save context before redirect so we can recover on return
  sessionStorage.setItem("payu_pending_txnid", txnid);
  sessionStorage.setItem("payu_pending_invoice", opts.invoiceId);
  sessionStorage.setItem("payu_pending_amount", amountStr);

  // Build hidden POST form and submit — browser will navigate to PayU
  const form = document.createElement("form");
  form.method = "POST";
  form.action = actionUrl;
  form.style.display = "none";

  const fields: Record<string, string> = {
    key,
    txnid,
    amount: amountStr,
    productinfo,
    firstname,
    email,
    phone,
    surl,
    furl,
    hash,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
    service_provider: "payu_paisa",
  };

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit(); // Browser redirects to PayU — code below will NOT execute
}

/**
 * Call this on page load to detect if the browser has returned from a PayU redirect.
 * PayU appends ?payu_status=success|failure&txnid=...&invoice=... to surl/furl.
 */
export function handlePayUReturn(): {
  status: "success" | "failure" | "none";
  txnid?: string;
  invoiceId?: string;
} {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("payu_status") as "success" | "failure" | null;
  const txnid = params.get("txnid") ?? undefined;
  const invoiceId =
    params.get("invoice") ?? sessionStorage.getItem("payu_pending_invoice") ?? undefined;

  if (!status) return { status: "none" };

  // Clean the URL so we don't re-process on subsequent renders
  window.history.replaceState({}, "", window.location.pathname);

  // Clear session storage
  sessionStorage.removeItem("payu_pending_txnid");
  sessionStorage.removeItem("payu_pending_invoice");
  sessionStorage.removeItem("payu_pending_amount");

  return { status, txnid, invoiceId };
}

/**
 * Records a PayU payment in the payments table (called after handlePayUReturn reports success).
 * Invoice status remains "pending" until superadmin confirms.
 */
export async function recordPayUPayment(
  supabase: any,
  opts: {
    invoiceId: string;
    athleteProfileId: string;
    amount: number;
    payuTxnId: string;
    payuMihpayId?: string;
  },
) {
  // NOTE: RLS blocks athletes from inserting into payments directly.
  // The verify-payment Edge Function (service-role) is the canonical recorder.
  // This is a best-effort fallback; errors are logged but never thrown.
  try {
    const { error } = await supabase.from("payments").insert({
      invoice_id: opts.invoiceId,
      boxer_profile_id: opts.athleteProfileId,
      amount: opts.amount,
      payment_mode: "online",
      gateway: "payu",
      gateway_payment_id: opts.payuMihpayId ?? null,
      reference: opts.payuTxnId ?? null,
      status: "success",
    });
    if (error) {
      console.warn("[recordPayUPayment] insert skipped (handled by Edge Function):", error.message);
    }
  } catch (err: any) {
    console.warn("[recordPayUPayment] insert skipped:", err?.message ?? err);
  }
}
