// Razorpay integration
// When academyId is provided, keys are decrypted server-side via the gateway-secrets Edge Function.
// Raw private keys never exist in the browser.

import { supabase } from "./supabase";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export interface RazorpayOptions {
  key: string;
  amount: number; // paise (INR, 1 = 100)
  currency: string;
  name: string;
  description: string;
  order_id?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: { color?: string };
  handler: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
}

export interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

// Load Razorpay script dynamically
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// Open Razorpay checkout.
// When academyId is provided: calls gateway-secrets Edge Function to decrypt the key
// and create an order server-side. The raw key never touches the browser.
// Falls back to legacy direct-key mode if academyId is absent.
export async function openRazorpayCheckout(opts: {
  amount: number; // in rupees
  invoiceId: string;
  invoiceNumber: string;
  athleteProfileId: string;
  name: string;
  email?: string;
  phone?: string;
  /** Preferred: per-academy ID — resolved to encrypted key via Edge Function */
  academyId?: string;
  /** Legacy fallback: pass a plain key directly (only used without Edge Function) */
  razorpayKeyId?: string;
  onSuccess: (response: RazorpayResponse) => Promise<void>;
  onDismiss?: () => void;
  onError?: (msg: string) => void;
}) {
  const loaded = await loadRazorpayScript();
  if (!loaded) throw new Error("Razorpay SDK failed to load.");
  if (opts.amount <= 0) throw new Error("Payment amount must be greater than 0.");

  let key: string = "";
  let order_id: string | undefined;

  // 1. Try Edge Function path if academyId is present
  if (opts.academyId) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const edgeFnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gateway-secrets`;
      const res = await fetch(edgeFnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          action: "initiate-razorpay-order",
          academyId: opts.academyId,
          amount: opts.amount,
          invoiceId: opts.invoiceId,
          currency: "INR",
        }),
      });
      if (res.ok) {
        const orderData = await res.json();
        if (orderData?.key_id) {
          key = orderData.key_id;
          order_id = orderData.order_id;
        }
      }
    } catch (err) {
      console.warn("gateway-secrets Edge Function call skipped/failed, using database key lookup:", err);
    }
  }

  // 2. Fallback: Lookup key directly from academy profile or global config if Edge Function did not provide one
  if (!key) {
    key = opts.razorpayKeyId?.trim() || "";

    if (!key && opts.academyId) {
      const { data } = await supabase
        .from("academies")
        .select("razorpay_key_id")
        .eq("id", opts.academyId)
        .maybeSingle();
      if (data?.razorpay_key_id) key = data.razorpay_key_id.trim();
    }

    if (!key) {
      const { data: ac } = await supabase
        .from("academies")
        .select("razorpay_key_id")
        .not("razorpay_key_id", "is", null)
        .limit(1)
        .maybeSingle();
      key = ac?.razorpay_key_id?.trim() || "";
    }

    if (!key) {
      key = (import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined)?.trim() || "";
    }
  }

  if (!key) {
    throw new Error("Razorpay key is not configured. Please set a Key ID in Superadmin → Academy Locations.");
  }
  if (!key.startsWith("rzp_test_") && !key.startsWith("rzp_live_")) {
    throw new Error(
      `Invalid Razorpay key format: "${key}". Must start with rzp_test_ or rzp_live_`,
    );
  }

  const options: RazorpayOptions = {
    key,
    amount: Math.round(opts.amount * 100), // convert to paise
    currency: "INR",
    name: "Boxos Academy",
    description: `Fee payment — Invoice ${opts.invoiceNumber}`,
    order_id,
    prefill: {
      name: opts.name,
      email: opts.email,
      contact: opts.phone,
    },
    theme: { color: "#1A1A1A" },
    handler: async (response) => {
      await opts.onSuccess(response);
    },
    modal: {
      ondismiss: opts.onDismiss,
    },
  };

  const rzp = new window.Razorpay(options);

  // Capture Razorpay internal errors
  rzp.on("payment.failed", (resp: any) => {
    const errDesc = resp?.error?.description || "Payment failed";
    const errReason = resp?.error?.reason || "";
    const errCode = resp?.error?.code || "";
    console.error("[Razorpay] Payment failed:", { errCode, errReason, errDesc, full: resp?.error });
    const msg = `Payment failed: ${errDesc}${errReason ? ` (${errReason})` : ""}`;
    if (opts.onError) opts.onError(msg);
  });

  rzp.open();
}

// Record payment in Supabase after successful Razorpay response.
// NOTE: RLS policy blocks athletes from inserting into payments directly.
// The verify-payment Edge Function (running as service-role) is the canonical
// payment recorder. This client-side record is a best-effort fallback for
// admin sessions or when the Edge Function is not deployed.
export async function recordPayment(
  supabase: any,
  opts: {
    invoiceId: string;
    athleteProfileId: string;
    amount: number;
    razorpayPaymentId: string;
    razorpayOrderId?: string;
    razorpaySignature?: string;
  },
) {
  try {
    const { error } = await supabase.from("payments").insert({
      invoice_id: opts.invoiceId,
      boxer_profile_id: opts.athleteProfileId,
      amount: opts.amount,
      payment_mode: "online",
      gateway: "razorpay",
      gateway_payment_id: opts.razorpayPaymentId,
      gateway_order_id: opts.razorpayOrderId ?? null,
      reference: opts.razorpayPaymentId,
      status: "success",
    });
    if (error) {
      // RLS blocks athletes from inserting payments directly — this is expected.
      // The Edge Function (service-role) handles the actual payment record.
      console.warn("[recordPayment] insert skipped (handled by Edge Function):", error.message);
    }
  } catch (err: any) {
    console.warn("[recordPayment] insert skipped:", err?.message ?? err);
  }
}
