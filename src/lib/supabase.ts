import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Client-side only Supabase client (JWT auth, no SSR) ────────────────
// Auth is handled entirely in the browser via Supabase's JWT persistence
// in localStorage. The server never touches auth state.

const isBrowser = typeof window !== "undefined";

let _client: SupabaseClient | null = null;

function getOrCreateClient(): SupabaseClient {
  if (_client) return _client;

  const url = (isBrowser ? import.meta.env.VITE_SUPABASE_URL : process.env.VITE_SUPABASE_URL) as string;
  const key = (isBrowser ? import.meta.env.VITE_SUPABASE_ANON_KEY : process.env.VITE_SUPABASE_ANON_KEY) as string;

  if (!url || !key) {
    console.warn("Supabase URL/Key not found. Auth will not work.");
    // Return a minimal stub that won't throw on property access
    _client = createClient("https://placeholder.supabase.co", "placeholder-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return _client;
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
export type UserRole = "athlete" | "admin" | "superadmin";
export type VerificationStatus = "pending" | "approved" | "flagged" | "manual_review";
export type InvoiceStatus = "unpaid" | "partially_paid" | "paid" | "overdue";
export type AccessStatus =
  | "unlocked"
  | "pending_assignment"
  | "awaiting_invoice"
  | "payment_required"
  | "overdue";

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
  created_at: string;
  updated_at: string;
}

export interface AthleteProfile {
  id: string;
  user_id: string;
  academy_id: string;
  full_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  nationality: string | null;
  profile_photo_url: string | null;
  phone: string | null;
  mobile_number: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  blood_group: string | null;
  sport: string | null;
  primary_discipline: string | null;
  secondary_discipline: string | null;
  training_year: string | null;
  years_in_sport: number | null;
  current_academy: string | null;
  current_coach: string | null;
  preferred_academy_id: string | null;
  sai_registration: string | null;
  national_federation_id: string | null;
  state_association_id: string | null;
  if_id: string | null;
  verification_status: VerificationStatus;
  is_minor: boolean;
  onboarding_complete: boolean;
  physical_conditions: string | null;
  current_medications: string | null;
  allergies: string | null;
  fitness_declaration: boolean | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  emergency_contact_phone: string | null;
  primary_physician_details: string | null;
  dominant_hand: string | null;
  playing_role?: string | null;
  batting_style?: string | null;
  bowling_type?: string | null;
  bowling_arm?: string | null;
  preferred_format?: string | null;
  competition_level: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  athlete_profile_id: string;
  billing_period: string | null;
  amount_due: number;
  amount_paid: number;
  balance_outstanding: number;
  due_date: string | null;
  status: InvoiceStatus;
  penalty_applied: number;
  is_overdue: boolean;
  days_overdue: number;
  created_at: string;
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
