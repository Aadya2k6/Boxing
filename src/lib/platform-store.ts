/**
 * platform-store.ts — BOXOS Admin Platform Data Layer
 *
 * All operations go directly to Supabase (RLS enforced).
 * Caller must be authenticated as boxos_admin for these to succeed.
 */
import { supabase, Academy, AcademyLifecycleEvent, Profile, PlatformSettings } from "./supabase";

// ── Academies ────────────────────────────────────────────────────────────────

export async function fetchAcademies(): Promise<{ data: Academy[] }> {
  const { data, error } = await supabase
    .from("academies")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return { data: (data ?? []) as Academy[] };
}

export async function fetchAcademyById(id: string): Promise<Academy | null> {
  const { data, error } = await supabase
    .from("academies")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as Academy | null;
}

export interface CreateAcademyPayload {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  attendance_radius_meters: number;
  actorId: string | null;
}

export async function createAcademyRecord(
  payload: CreateAcademyPayload
): Promise<Academy> {
  const now = new Date().toISOString();

  const insertData: any = {
    name: payload.name.trim(),
    address: payload.address,
    city: payload.city,
    state: payload.state,
    latitude: payload.latitude,
    longitude: payload.longitude,
    attendance_radius_meters: payload.attendance_radius_meters,
    active_gateway: "razorpay",
    status: "active",
    created_at: now,
    updated_at: now,
  };

  if (payload.actorId) {
    insertData.onboarded_by = payload.actorId;
    insertData.onboarded_at = now;
  }

  const { data, error } = await supabase
    .from("academies")
    .insert(insertData)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Log lifecycle event
  await logLifecycleEvent({
    academy_id: data.id,
    event_type: "created",
    reason: "Academy onboarded via BOXOS Admin",
    actor_id: payload.actorId,
  });

  return data as Academy;
}

export async function updateAcademyRecord(
  id: string,
  updates: Partial<Academy>,
  eventLog?: { event_type: AcademyLifecycleEvent["event_type"]; reason: string; actor_id: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("academies")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);

  if (eventLog) {
    await logLifecycleEvent({
      academy_id: id,
      event_type: eventLog.event_type,
      reason: eventLog.reason,
      actor_id: eventLog.actor_id,
    });
  }
}

// ── Lifecycle Events ─────────────────────────────────────────────────────────

export async function logLifecycleEvent(event: {
  academy_id: string;
  event_type: AcademyLifecycleEvent["event_type"];
  reason?: string;
  actor_id: string | null;
}): Promise<void> {
  const { error } = await supabase.from("academy_lifecycle_events").insert({
    academy_id: event.academy_id,
    event_type: event.event_type,
    reason: event.reason ?? null,
    actor_id: event.actor_id,
  });

  if (error) console.warn("Lifecycle event log failed:", error.message);
}

export async function fetchLifecycleEvents(academyId?: string): Promise<AcademyLifecycleEvent[]> {
  let query = supabase
    .from("academy_lifecycle_events")
    .select("*")
    .order("created_at", { ascending: false });

  if (academyId) query = query.eq("academy_id", academyId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as AcademyLifecycleEvent[];
}

// ── Superadmins ──────────────────────────────────────────────────────────────

export async function fetchSuperadminsByAcademy(academyId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("academy_id", academyId)
    .eq("role", "superadmin");

  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

import { createClient } from "@supabase/supabase-js";

export async function createSuperadminAccount(params: {
  academyId: string;
  name: string;
  email: string;
  password?: string;
  actorId: string | null;
}): Promise<void> {
  const { academyId, name, email, password, actorId } = params;

  if (password && password.trim().length >= 6) {
    const isBrowser = typeof window !== "undefined";
    const url = (isBrowser ? import.meta.env.VITE_SUPABASE_URL : process.env.VITE_SUPABASE_URL) as string;
    const key = (isBrowser ? import.meta.env.VITE_SUPABASE_ANON_KEY : process.env.VITE_SUPABASE_ANON_KEY) as string;

    if (url && key) {
      // Create an isolated auth client with persistSession: false so the active session is unaffected
      const tempAuthClient = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storage: undefined,
        },
      });

      const { data, error } = await tempAuthClient.auth.signUp({
        email: email.trim(),
        password: password.trim(),
        options: {
          data: {
            full_name: name.trim(),
            role: "superadmin",
            academy_id: academyId,
            terms_version: "2026-01-01",
          },
        },
      });

      if (error) {
        console.warn("Direct signUp warning (user may already exist):", error.message);
      }

      if (data?.user?.id) {
        // Link profile to this academy with role = 'superadmin'
        await supabase.from("profiles").upsert({
          id: data.user.id,
          role: "superadmin",
          academy_id: academyId,
          full_name: name.trim(),
          email: email.trim(),
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
      }
    }
  }

  // Log lifecycle event
  await logLifecycleEvent({
    academy_id: academyId,
    event_type: "superadmin_invited",
    reason: `Superadmin account created for ${name.trim()} (${email.trim()})`,
    actor_id: actorId,
  });
}

export async function inviteSuperadmin(
  academyId: string,
  name: string,
  email: string,
  actorId: string | null,
  password?: string
): Promise<void> {
  return createSuperadminAccount({
    academyId,
    name,
    email,
    password,
    actorId,
  });
}

// ── Platform Settings ────────────────────────────────────────────────────────

export async function fetchPlatformSettings(): Promise<PlatformSettings> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) throw new Error(error.message);

  // Return defaults if no row yet (singleton auto-seeded by file.sql migration 0001)
  return (data ?? {
    id: true,
    academy_code_verification_days: 7,
    current_terms_version: "2026-01-01",
    updated_at: new Date().toISOString(),
  }) as PlatformSettings;
}

export async function updatePlatformSettingsRecord(updates: {
  academy_code_verification_days: number;
  current_terms_version: string;
}): Promise<void> {
  const { error } = await supabase.from("platform_settings").upsert({
    id: true,
    academy_code_verification_days: updates.academy_code_verification_days,
    current_terms_version: updates.current_terms_version,
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
}
