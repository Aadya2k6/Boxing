import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Client-side only Supabase client (JWT auth, no SSR) ────────────────
// Auth is handled entirely in the browser via Supabase's JWT persistence
// in localStorage. The server never touches auth state.

const isBrowser = typeof window !== "undefined";

let _client: SupabaseClient | null = null;

function getOrCreateClient(): SupabaseClient {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || (typeof process !== "undefined" ? process.env?.VITE_SUPABASE_URL : "")) as string;
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || (typeof process !== "undefined" ? process.env?.VITE_SUPABASE_ANON_KEY : "")) as string;

  const url = (envUrl || "").trim().replace(/^["']|["']$/g, "");
  const key = (envKey || "").trim().replace(/^["']|["']$/g, "");

  const isValidUrl = Boolean(url && (url.startsWith("http://") || url.startsWith("https://")) && !url.includes("your_supabase_url"));
  const isValidKey = Boolean(key && key.length > 20 && !key.includes("your_supabase_anon_key"));

  if (!isValidUrl || !isValidKey) {
    if (isBrowser) {
      console.warn("[Supabase] Valid VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not detected in env. Using offline placeholder client.", { url: url || "(empty)", isValidUrl, isValidKey });
    }
    // Return a minimal stub (do NOT cache in _client so it can reload when env is updated)
    return createClient("https://placeholder.supabase.co", "placeholder-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  if (_client) return _client;

  if (isBrowser) {
    console.log("[Supabase] Client initialized successfully with URL:", url);
  }

  _client = createClient(url, key, {
    auth: {
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: isBrowser,
      storage: isBrowser ? globalThis.localStorage : undefined,
    },
  });

  return _client;
}

// Eagerly create in browser, lazily on server
export const supabase: SupabaseClient = isBrowser
  ? getOrCreateClient()
  : new Proxy({} as SupabaseClient, {
      get(_, prop) {
        // During SSR, return safe no-op stubs so nothing throws
        if (prop === "auth") {
          return {
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            getUser: () => Promise.resolve({ data: { user: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
            signUp: () => Promise.resolve({ data: {}, error: null }),
            signOut: () => Promise.resolve({ error: null }),
          };
        }
        if (prop === "from") {
          return () => ({
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }), single: () => Promise.resolve({ data: null, error: null }), order: () => Promise.resolve({ data: [], error: null }), then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn) }), not: () => ({ then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn) }), gte: () => Promise.resolve({ data: [], error: null }), in: () => Promise.resolve({ data: [], error: null }), then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn), order: () => ({ limit: () => Promise.resolve({ data: [], error: null }), then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn) }), limit: () => Promise.resolve({ data: [], error: null }) }),
            insert: () => Promise.resolve({ data: null, error: null }),
            update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
            upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
            delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
          });
        }
        if (prop === "channel") {
          return () => ({ on: function() { return this; }, subscribe: function() { return this; } });
        }
        if (prop === "removeChannel") {
          return () => {};
        }
        return undefined;
      },
    });

// Re-export for any module that needs the raw client
export { getOrCreateClient as getSupabaseClient };

// ── TypeScript types ───────────────────────────────────────────────────
export type UserRole = "boxos_admin" | "superadmin" | "admin" | "coach" | "athlete" | "external_judge";
export type VerificationStatus = "pending" | "approved" | "flagged" | "manual_review";
export type InvoiceStatus = "unpaid" | "partially_paid" | "paid" | "overdue";
export type AcademyStatus = "active" | "suspended" | "archived" | "deleted";
export type AccessStatus =
  | "unlocked"
  | "pending_assignment"
  | "awaiting_invoice"
  | "payment_required"
  | "overdue";

export interface Academy {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  attendance_radius_meters: number;
  razorpay_key_id: string | null;
  encrypted_razorpay_secret: string | null;
  payu_merchant_key: string | null;
  encrypted_payu_salt: string | null;
  active_gateway: "razorpay" | "payu";
  status: AcademyStatus;
  suspended_reason: string | null;
  suspended_at: string | null;
  suspended_by: string | null;
  archived_at: string | null;
  hard_delete_eligible_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  onboarded_by: string | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AcademyLifecycleEvent {
  id: string;
  academy_id: string;
  event_type: "created" | "suspended" | "reactivated" | "archived" | "hard_deleted" | "settings_changed" | "superadmin_invited";
  reason: string | null;
  actor_id: string | null;
  created_at: string;
  academies?: Academy | null;
  profiles?: Profile | null;
}

export interface PlatformSettings {
  id: boolean;
  academy_code_verification_days: number;
  current_terms_version: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  academy_id: string | null;
  preferred_academy_id?: string | null;
  is_active?: boolean | null;
  academy_code_verified?: boolean | null;
  academy_code_deadline?: string | null;
  onboarding_complete?: boolean | null;
  judge_scope_tournament_id?: string | null;
  access_expires_at?: string | null;
  invited_by?: string | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  created_at: string;
  updated_at: string;
}

// BoxerProfile matches the boxer_profiles table exactly
export interface BoxerProfile {
  id: string;
  user_id: string;
  academy_id: string;
  full_name: string;
  date_of_birth: string;
  gender: "Male" | "Female" | "Other";
  nationality: string | null;
  profile_photo_url: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  blood_group: string | null;
  physical_conditions: string | null;
  current_medications: string | null;
  allergies: string | null;
  medical_fitness_declared: boolean;
  is_minor: boolean;
  onboarding_complete: boolean;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  emergency_contact_phone: string | null;
  primary_physician_details: string | null;
  verification_status: "pending" | "verified" | "rejected";
  stance: "orthodox" | "southpaw" | null;
  declared_weight_kg: number | null;
  age_category_id: string | null;
  weight_category_id: string | null;
  reach_cm: number | null;
  height_cm: number | null;
  national_federation_boxer_id: string | null;
  record_wins: number;
  record_losses: number;
  record_draws: number;
  record_kos: number;
  is_suspended: boolean;
  suspension_start_date: string | null;
  suspension_end_date: string | null;
  suspension_reason: string | null;
  suspended_by: string | null;
  suspended_at: string | null;
  reinstated_by: string | null;
  reinstated_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

// Alias kept for any code still using AthleteProfile type
export type AthleteProfile = BoxerProfile;

export interface Invoice {
  id: string;
  academy_id: string;
  boxer_profile_id: string;
  fee_assignment_id: string | null;
  invoice_number: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  amount_due: number;
  amount_paid: number;
  status: "unpaid" | "partially_paid" | "paid" | "overdue" | "cancelled" | "pending_approval";
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface AthleteAccessStatus {
  athlete_profile_id: string;
  user_id: string;
  status: AccessStatus;
  current_invoice: Partial<Invoice> | null;
  active_override: { expires_at: string; reason: string } | null;
}

export interface Notification {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  related_entity_id: string | null;
  related_entity_type: string | null;
  created_at: string;
}
