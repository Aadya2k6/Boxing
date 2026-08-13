// @ts-nocheck
// Supabase Edge Function: gateway-secrets
// Handles encrypted storage and in-memory decryption of payment gateway keys.
// All cryptography uses Web Crypto API (AES-256-GCM) — available in Deno runtime.
//
// Actions:
//   store               — Encrypt & persist gateway keys for an academy
//   get-gateway-type    — Return only the gateway type (no secrets)
//   initiate-razorpay-order — Decrypt key, create Razorpay order, return order_id
//   initiate-payu-payment   — Decrypt key+salt, compute SHA-512 hash, return signed BOLT params

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-requested-with",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// ── Crypto Helpers ────────────────────────────────────────────────────────────

/**
 * Derive a 256-bit AES-GCM CryptoKey from the GATEWAY_ENCRYPTION_KEY env var.
 * The env var must be a 64-character hex string (32 bytes).
 */
async function getEncryptionKey(): Promise<CryptoKey> {
  const hexKey = Deno.env.get("GATEWAY_ENCRYPTION_KEY");
  if (!hexKey || hexKey.length !== 64) {
    throw new Error("GATEWAY_ENCRYPTION_KEY env var missing or not 64 hex chars");
  }
  const keyBytes = new Uint8Array(hexKey.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypt a plain-text string.
 * Returns a base64 string: `iv_b64:ciphertext_b64`
 */
async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  return `${ivB64}:${ctB64}`;
}

/**
 * Decrypt a value produced by `encrypt()`.
 */
async function decrypt(encryptedValue: string): Promise<string> {
  const key = await getEncryptionKey();
  const [ivB64, ctB64] = encryptedValue.split(":");
  if (!ivB64 || !ctB64) throw new Error("Invalid encrypted value format");
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  const plainBytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plainBytes);
}

// ── SHA-512 for PayU ──────────────────────────────────────────────────────────

async function sha512(str: string): Promise<string> {
  const bytes = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-512", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Supabase Admin Client ─────────────────────────────────────────────────────

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// ── Read / Write academy_gateways from system_settings ───────────────────────

async function readGatewayMap(): Promise<Record<string, any>> {
  const sb = adminClient();
  const { data } = await sb
    .from("system_settings")
    .select("settings")
    .eq("id", "singleton")
    .maybeSingle();
  return data?.settings?.academy_gateways ?? {};
}

async function writeGatewayMap(gwMap: Record<string, any>): Promise<void> {
  const sb = adminClient();
  // Read current settings first to preserve other keys
  const { data } = await sb
    .from("system_settings")
    .select("settings")
    .eq("id", "singleton")
    .maybeSingle();
  const current = data?.settings ?? {};
  await sb.from("system_settings").upsert({
    id: "singleton",
    settings: { ...current, academy_gateways: gwMap },
    updated_at: new Date().toISOString(),
  });
}

// ── Verify JWT auth — must be a superadmin or admin ──────────────────────────

async function verifyAdmin(authHeader: string | null): Promise<string> {
  if (!authHeader) throw new Error("No authorization header");
  const token = authHeader.replace("Bearer ", "");
  const sb = adminClient();
  const {
    data: { user },
    error,
  } = await sb.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");
  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["superadmin", "admin"].includes(profile.role)) {
    throw new Error("Forbidden: requires admin role");
  }
  return user.id;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, academyId } = body;

    if (!action) throw new Error("Missing action");

    // ── STORE: Encrypt and save gateway keys for an academy ─────────────────
    if (action === "store") {
      await verifyAdmin(req.headers.get("authorization"));
      if (!academyId) throw new Error("Missing academyId");

      const { payment_gateway, razorpay_key_id, payu_merchant_key, payu_merchant_salt } = body;

      const gwMap = await readGatewayMap();
      const entry: Record<string, any> = {
        payment_gateway,
        enc_razorpay_key_id: null,
        enc_payu_merchant_key: null,
        enc_payu_merchant_salt: null,
      };

      if (payment_gateway === "razorpay" && razorpay_key_id?.trim()) {
        entry.enc_razorpay_key_id = await encrypt(razorpay_key_id.trim());
      } else if (payment_gateway === "payu") {
        if (payu_merchant_key?.trim()) {
          entry.enc_payu_merchant_key = await encrypt(payu_merchant_key.trim());
        }
        if (payu_merchant_salt?.trim()) {
          entry.enc_payu_merchant_salt = await encrypt(payu_merchant_salt.trim());
        }
      }

      // Preserve existing encrypted values if new input is empty (masked / not re-entered)
      const existing = gwMap[academyId] ?? {};
      if (!entry.enc_razorpay_key_id && existing.enc_razorpay_key_id) {
        entry.enc_razorpay_key_id = existing.enc_razorpay_key_id;
      }
      if (!entry.enc_payu_merchant_key && existing.enc_payu_merchant_key) {
        entry.enc_payu_merchant_key = existing.enc_payu_merchant_key;
      }
      if (!entry.enc_payu_merchant_salt && existing.enc_payu_merchant_salt) {
        entry.enc_payu_merchant_salt = existing.enc_payu_merchant_salt;
      }

      gwMap[academyId] = entry;
      await writeGatewayMap(gwMap);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET-GATEWAY-TYPE: Return only gateway type, never secrets ───────────
    if (action === "get-gateway-type") {
      if (!academyId) throw new Error("Missing academyId");
      const gwMap = await readGatewayMap();
      const entry = gwMap[academyId] ?? {};
      return new Response(
        JSON.stringify({
          payment_gateway: entry.payment_gateway ?? "razorpay",
          has_razorpay_key: !!entry.enc_razorpay_key_id,
          has_payu_key: !!(entry.enc_payu_merchant_key && entry.enc_payu_merchant_salt),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── INITIATE-RAZORPAY-ORDER: Decrypt key, create order, return order_id ─
    if (action === "initiate-razorpay-order") {
      const { amount, invoiceId, currency = "INR" } = body;
      if (!academyId || !amount || !invoiceId) throw new Error("Missing required params");

      const gwMap = await readGatewayMap();
      const entry = gwMap[academyId] ?? {};

      // Decrypt key — falls back to env var global key
      let keyId: string;
      let keySecret: string | null = null;

      if (entry.enc_razorpay_key_id) {
        keyId = await decrypt(entry.enc_razorpay_key_id);
      } else {
        keyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
      }
      keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? null;

      if (!keyId || !keySecret) {
        throw new Error("Razorpay keys not configured for this academy");
      }

      // Create a Razorpay order
      const amountInPaise = Math.round(Number(amount) * 100);
      const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency,
          receipt: `inv_${invoiceId}`,
        }),
      });

      if (!rzpRes.ok) {
        const err = await rzpRes.text();
        throw new Error(`Razorpay order creation failed: ${err}`);
      }

      const order = await rzpRes.json();

      return new Response(
        JSON.stringify({ order_id: order.id, key_id: keyId, amount: amountInPaise, currency }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── INITIATE-PAYU-PAYMENT: Decrypt salt, compute hash, return signed params
    if (action === "initiate-payu-payment") {
      const { amount, txnid, productinfo, firstname, email, udf1, udf2, udf3, udf4, udf5 } = body;
      if (!academyId || !amount || !txnid) throw new Error("Missing required params");

      const gwMap = await readGatewayMap();
      const entry = gwMap[academyId] ?? {};

      if (!entry.enc_payu_merchant_key || !entry.enc_payu_merchant_salt) {
        throw new Error("PayU keys not configured for this academy");
      }

      const merchantKey = await decrypt(entry.enc_payu_merchant_key);
      const merchantSalt = await decrypt(entry.enc_payu_merchant_salt);

      // PayU hash: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
      const hashString = [
        merchantKey,
        txnid,
        amount,
        productinfo ?? "",
        firstname ?? "",
        email ?? "",
        udf1 ?? "",
        udf2 ?? "",
        udf3 ?? "",
        udf4 ?? "",
        udf5 ?? "",
        "",
        "",
        "",
        "",
        "", // empty udf6-10
        merchantSalt,
      ].join("|");

      const hash = await sha512(hashString);

      return new Response(
        JSON.stringify({
          key: merchantKey,
          txnid,
          amount,
          productinfo: productinfo ?? "Boxing Academy Fee",
          firstname: firstname ?? "",
          email: email ?? "",
          hash,
          surl: `${Deno.env.get("SITE_URL") ?? "https://app.boxos.com"}/payment/success`,
          furl: `${Deno.env.get("SITE_URL") ?? "https://app.boxos.com"}/payment/failure`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error("gateway-secrets error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
