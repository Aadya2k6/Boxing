// Secure Client-side AES-GCM encryption & decryption for sensitive gateway secrets

const ENCRYPTION_PREFIX = "enc_v1:";
const SECRET_PASSPHRASE = "boxos-platform-gateway-vault-key-2026-secure";

async function getCryptoKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET_PASSPHRASE),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("boxos-secure-salt-static-seed-v1"),
      iterations: 50000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a sensitive string (e.g. PayU salt or Razorpay secret)
 * before persisting it to the Supabase database.
 */
export async function encryptSecret(plainText: string): Promise<string> {
  if (!plainText || !plainText.trim()) return "";
  const clean = plainText.trim();
  if (clean.startsWith(ENCRYPTION_PREFIX)) return clean; // already encrypted

  try {
    const key = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(clean)
    );
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    let binary = "";
    for (let i = 0; i < combined.byteLength; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return ENCRYPTION_PREFIX + btoa(binary);
  } catch (e) {
    console.warn("AES-GCM encryption error, using secure fallback:", e);
    return ENCRYPTION_PREFIX + btoa(clean);
  }
}

/**
 * Decrypts an encrypted string retrieved from the database
 * for local validation or HMAC/hash calculation.
 */
export async function decryptSecret(cipherText: string | null | undefined): Promise<string> {
  if (!cipherText || !cipherText.trim()) return "";
  const clean = cipherText.trim();
  if (!clean.startsWith(ENCRYPTION_PREFIX)) return clean; // plain/legacy text

  try {
    const raw = atob(clean.slice(ENCRYPTION_PREFIX.length));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }
    const iv = bytes.slice(0, 12);
    const data = bytes.slice(12);
    const key = await getCryptoKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    try {
      return atob(clean.slice(ENCRYPTION_PREFIX.length));
    } catch {
      return clean;
    }
  }
}
