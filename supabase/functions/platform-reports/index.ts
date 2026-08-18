// @ts-nocheck
// Supabase Edge Function: platform-reports
// Aggregates platform-wide metrics and detailed academy statistics for the BOXOS Admin.
// Bypasses RLS strictly for the boxos_admin role by using the Service Role key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-requested-with",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function verifyBoxosAdmin(authHeader: string | null): Promise<string> {
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
    
  if (!profile || profile.role !== "boxos_admin") {
    throw new Error("Forbidden: requires boxos_admin role");
  }
  return user.id;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    await verifyBoxosAdmin(authHeader);

    const body = await req.json();
    const { action, academyId } = body;
    const sb = adminClient();

    if (action === "get-platform-reports") {
      const [academiesRes, boxersRes, paymentsRes, tournamentsRes] = await Promise.all([
        sb.from("academies").select("id, name, city, status"),
        sb.from("profiles").select("id, academy_id").eq("role", "athlete"),
        sb.from("payments").select("amount, academy_id, created_at").eq("status", "success"),
        sb.from("ring_schedule_templates").select("id").eq("template_type", "tournament").eq("is_active", true),
      ]);

      const academies = academiesRes.data ?? [];
      const boxers = boxersRes.data ?? [];
      const payments = paymentsRes.data ?? [];
      const tournaments = tournamentsRes.data ?? [];

      return new Response(
        JSON.stringify({
          academies,
          boxers,
          payments,
          activeTournaments: tournaments.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get-academy-reports") {
      if (!academyId) throw new Error("Missing academyId");

      const [boxersRes, staffRes, invoicesRes, paymentsRes] = await Promise.all([
        sb.from("boxer_profiles").select("id, full_name, email, phone, verification_status, gender, date_of_birth, is_suspended, suspension_reason, suspension_end_date").eq("academy_id", academyId),
        sb.from("profiles").select("id, full_name, email, role, is_active").eq("academy_id", academyId).neq("role", "athlete"),
        sb.from("invoices").select("id, invoice_number, amount_due, amount_paid, status, due_date, created_at").eq("academy_id", academyId).order("created_at", { ascending: false }),
        sb.from("payments").select("amount, created_at").eq("academy_id", academyId).eq("status", "success"),
      ]);

      const boxers = boxersRes.data ?? [];
      const staff = staffRes.data ?? [];
      const invoices = invoicesRes.data ?? [];
      const payments = paymentsRes.data ?? [];

      return new Response(
        JSON.stringify({
          boxers,
          staff,
          invoices,
          payments,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error("platform-reports error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
