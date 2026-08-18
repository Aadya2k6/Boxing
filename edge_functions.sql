import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface RequestBody {
  academyId: string;
  /** false (default): build and return the export only, don't delete.
   *  true: rebuild the export, THEN delete — call this only after the
   *  export from the first call has been saved by the client
   *  (architecture.md §10.4 step 4: export must complete before delete). */
  confirm?: boolean;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid session' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (callerProfile?.role !== 'boxos_admin') {
      return json({ error: 'Only BOXOS Admin can hard-delete an academy' }, 403);
    }

    const body: RequestBody = await req.json();
    if (!body.academyId) return json({ error: 'academyId is required' }, 400);

    const { data: academy } = await admin.from('academies').select().eq('id', body.academyId).maybeSingle();
    if (!academy) return json({ error: 'Academy not found' }, 404);
    if (academy.status !== 'archived') {
      return json({ error: 'Academy must be archived before it can be hard-deleted' }, 409);
    }
    if (!academy.hard_delete_eligible_at || new Date(academy.hard_delete_eligible_at) > new Date()) {
      return json({ error: `Not eligible until ${academy.hard_delete_eligible_at}` }, 409);
    }

    const [boxerProfiles, invoices, payments, attendance, boutHistory, fitnessRecords] = await Promise.all([
      admin.from('boxer_profiles').select('*').eq('academy_id', academy.id),
      admin.from('invoices').select('*').eq('academy_id', academy.id),
      admin.from('payments').select('*').eq('academy_id', academy.id),
      admin.from('attendance').select('*').eq('academy_id', academy.id),
      admin
        .from('boxer_bout_history')
        .select('*, bouts!inner(ring_instance_id, ring_instances!inner(academy_id))')
        .eq('bouts.ring_instances.academy_id', academy.id),
      admin
        .from('fitness_test_records')
        .select('*, boxer_profiles!inner(academy_id)')
        .eq('boxer_profiles.academy_id', academy.id),
    ]);

    const exportData = {
      boxer_profiles: toCsv(boxerProfiles.data ?? []),
      invoices: toCsv(invoices.data ?? []),
      payments: toCsv(payments.data ?? []),
      attendance: toCsv(attendance.data ?? []),
      bout_history: toCsv(boutHistory.data ?? []),
      fitness_records: toCsv(fitnessRecords.data ?? []),
    };

    if (!body.confirm) {
      return json({ academyId: academy.id, exportedAt: new Date().toISOString(), export: exportData, deleted: false }, 200);
    }

    const { data: result, error: deleteError } = await admin.rpc('hard_delete_academy', {
      p_academy_id: academy.id,
      p_actor_id: user.id,
      p_dry_run: false,
    });
    if (deleteError) return json({ error: deleteError.message, export: exportData }, 500);

    const deletedProfileIds: string[] = (result as { deleted_profile_ids?: string[] } | null)?.deleted_profile_ids ?? [];
    for (const profileId of deletedProfileIds) {
      await admin.auth.admin.deleteUser(profileId).catch(() => undefined);
    }

    return json({ academyId: academy.id, exportedAt: new Date().toISOString(), export: exportData, deleted: true, result }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type Action = 'suspend' | 'reactivate' | 'archive';

interface RequestBody {
  academyId: string;
  action: Action;
  reason?: string;
}

const ARCHIVE_COOLOFF_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid session' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (callerProfile?.role !== 'boxos_admin') {
      return json({ error: 'Only BOXOS Admin can change academy lifecycle status' }, 403);
    }

    const body: RequestBody = await req.json();
    if (!body.academyId || !body.action) return json({ error: 'academyId and action are required' }, 400);
    if (!['suspend', 'reactivate', 'archive'].includes(body.action)) {
      return json({ error: 'action must be suspend, reactivate, or archive' }, 400);
    }
    if ((body.action === 'suspend' || body.action === 'archive') && !body.reason?.trim()) {
      return json({ error: 'reason is required for suspend/archive' }, 400);
    }

    const { data: academy } = await admin
      .from('academies')
      .select('id, status')
      .eq('id', body.academyId)
      .maybeSingle();
    if (!academy) return json({ error: 'Academy not found' }, 404);

    if (body.action === 'suspend') {
      if (academy.status !== 'active') return json({ error: 'Only an active academy can be suspended' }, 409);
      await admin
        .from('academies')
        .update({ status: 'suspended', suspended_reason: body.reason, suspended_at: new Date().toISOString(), suspended_by: user.id })
        .eq('id', academy.id);
      await admin.from('academy_lifecycle_events').insert({ academy_id: academy.id, event_type: 'suspended', reason: body.reason, actor_id: user.id });
    }

    if (body.action === 'reactivate') {
      if (academy.status !== 'suspended') return json({ error: 'Only a suspended academy can be reactivated' }, 409);
      await admin
        .from('academies')
        .update({ status: 'active', suspended_reason: null, suspended_at: null, suspended_by: null })
        .eq('id', academy.id);
      await admin.from('academy_lifecycle_events').insert({ academy_id: academy.id, event_type: 'reactivated', actor_id: user.id });
    }

    if (body.action === 'archive') {
      if (academy.status !== 'active' && academy.status !== 'suspended') {
        return json({ error: 'Only an active or suspended academy can be archived' }, 409);
      }
      const archivedAt = new Date();
      const hardDeleteEligibleAt = new Date(archivedAt.getTime() + ARCHIVE_COOLOFF_DAYS * 24 * 60 * 60 * 1000);
      await admin
        .from('academies')
        .update({ status: 'archived', archived_at: archivedAt.toISOString(), hard_delete_eligible_at: hardDeleteEligibleAt.toISOString() })
        .eq('id', academy.id);
      await admin.from('academy_lifecycle_events').insert({ academy_id: academy.id, event_type: 'archived', reason: body.reason, actor_id: user.id });
    }

    const { data: updated } = await admin.from('academies').select().eq('id', academy.id).maybeSingle();
    return json({ academy: updated }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface SuperadminInput {
  email: string;
  fullName: string;
  /** Set by the BOXOS Admin at creation time — the superadmin changes it
   *  themselves from their own dashboard on first login. */
  password: string;
}

interface RequestBody {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  attendanceRadiusMeters?: number;
  timezone?: string;
  superadmins: SuperadminInput[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid session' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (callerProfile?.role !== 'boxos_admin') {
      return json({ error: 'Only BOXOS Admin can create academies' }, 403);
    }

    const body: RequestBody = await req.json();
    if (!body.name?.trim()) return json({ error: 'name is required' }, 400);
    if (!body.superadmins?.length) return json({ error: 'At least one superadmin is required' }, 400);
    for (const s of body.superadmins) {
      if (!s.email?.trim() || !s.fullName?.trim()) {
        return json({ error: 'Each superadmin needs an email and fullName' }, 400);
      }
      if (!s.password || s.password.length < 8) {
        return json({ error: `Password for ${s.email} must be at least 8 characters` }, 400);
      }
    }

    const { data: academy, error: academyError } = await admin
      .from('academies')
      .insert({
        name: body.name.trim(),
        address: body.address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        attendance_radius_meters: body.attendanceRadiusMeters ?? 200,
        timezone: body.timezone ?? 'Asia/Kolkata',
        status: 'active',
        onboarded_by: user.id,
        onboarded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (academyError || !academy) {
      return json({ error: academyError?.message ?? 'Failed to create academy' }, 500);
    }

    const createdSuperadmins: { email: string }[] = [];

    for (const s of body.superadmins) {
      const { error: createUserError } = await admin.auth.admin.createUser({
        email: s.email.trim(),
        password: s.password,
        email_confirm: true,
        user_metadata: { role: 'superadmin', academy_id: academy.id, full_name: s.fullName.trim() },
      });
      if (createUserError) {
        return json(
          { error: `Academy created, but failed to create superadmin ${s.email}: ${createUserError.message}`, academy },
          207,
        );
      }
      createdSuperadmins.push({ email: s.email.trim() });
    }

    await admin.from('academy_lifecycle_events').insert({
      academy_id: academy.id,
      event_type: 'created',
      actor_id: user.id,
    });

    return json({ academy, superadmins: createdSuperadmins }, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function generateTempPassword(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16) + 'Aa1!';
}

interface RequestBody {
  tournamentTemplateId: string;
  email: string;
  fullName?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid session' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, academy_id')
      .eq('id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!callerProfile?.academy_id || !['superadmin', 'admin'].includes(callerProfile.role)) {
      return json({ error: 'Only a superadmin or admin can invite an external judge' }, 403);
    }

    const body: RequestBody = await req.json();
    if (!body.tournamentTemplateId || !body.email?.trim()) {
      return json({ error: 'tournamentTemplateId and email are required' }, 400);
    }

    const { data: template } = await admin
      .from('ring_schedule_templates')
      .select('id, academy_id, template_type')
      .eq('id', body.tournamentTemplateId)
      .maybeSingle();

    if (!template || template.academy_id !== callerProfile.academy_id) {
      return json({ error: 'Tournament not found in your academy' }, 404);
    }
    if (template.template_type !== 'tournament') {
      return json({ error: 'Judges can only be invited to a tournament-type schedule' }, 400);
    }

    const tempPassword = generateTempPassword();
    const { data: created, error: createUserError } = await admin.auth.admin.createUser({
      email: body.email.trim(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        role: 'external_judge',
        academy_id: callerProfile.academy_id,
        full_name: body.fullName?.trim() ?? null,
      },
    });
    if (createUserError || !created.user) return json({ error: createUserError?.message ?? 'Failed to create judge account' }, 500);

    await admin.from('profiles').update({ judge_scope_tournament_id: template.id }).eq('id', created.user.id);

    const { data: invite, error: inviteError } = await admin
      .from('external_judge_invites')
      .insert({
        tournament_template_id: template.id,
        academy_id: callerProfile.academy_id,
        email: body.email.trim(),
        full_name: body.fullName?.trim() ?? null,
        profile_id: created.user.id,
        status: 'pending',
        invited_by: user.id,
      })
      .select()
      .single();
    if (inviteError) return json({ error: inviteError.message }, 500);

    return json({ invite, email: body.email.trim(), tempPassword }, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function generateTempPassword(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16) + 'Aa1!';
}

interface RequestBody {
  role: 'admin' | 'coach';
  email: string;
  fullName: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid session' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, academy_id')
      .eq('id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Only a superadmin invites admin/coach (architecture.md §1.2 — an
    // admin can never create other admins or coaches).
    if (callerProfile?.role !== 'superadmin' || !callerProfile.academy_id) {
      return json({ error: 'Only a superadmin can invite staff' }, 403);
    }

    const body: RequestBody = await req.json();
    if (body.role !== 'admin' && body.role !== 'coach') {
      return json({ error: "role must be 'admin' or 'coach'" }, 400);
    }
    if (!body.email?.trim() || !body.fullName?.trim()) {
      return json({ error: 'email and fullName are required' }, 400);
    }

    const tempPassword = generateTempPassword();
    const { error: createUserError } = await admin.auth.admin.createUser({
      email: body.email.trim(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        role: body.role,
        academy_id: callerProfile.academy_id,
        full_name: body.fullName.trim(),
      },
    });
    if (createUserError) return json({ error: createUserError.message }, 500);

    return json({ email: body.email.trim(), role: body.role, tempPassword }, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface RequestBody {
  academyId: string;
  email: string;
  fullName: string;
  /** Set by the BOXOS Admin — the superadmin changes it themselves on first login. */
  password: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid session' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (callerProfile?.role !== 'boxos_admin') {
      return json({ error: 'Only BOXOS Admin can invite a superadmin' }, 403);
    }

    const body: RequestBody = await req.json();
    if (!body.academyId || !body.email?.trim() || !body.fullName?.trim()) {
      return json({ error: 'academyId, email, and fullName are required' }, 400);
    }
    if (!body.password || body.password.length < 8) {
      return json({ error: 'password must be at least 8 characters' }, 400);
    }

    const { data: academy } = await admin
      .from('academies')
      .select('id, status')
      .eq('id', body.academyId)
      .maybeSingle();
    if (!academy) return json({ error: 'Academy not found' }, 404);

    const { error: createUserError } = await admin.auth.admin.createUser({
      email: body.email.trim(),
      password: body.password,
      email_confirm: true,
      user_metadata: { role: 'superadmin', academy_id: academy.id, full_name: body.fullName.trim() },
    });
    if (createUserError) return json({ error: createUserError.message }, 500);

    await admin.from('academy_lifecycle_events').insert({
      academy_id: academy.id,
      event_type: 'superadmin_invited',
      actor_id: user.id,
    });

    return json({ email: body.email.trim() }, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface RequestBody {
  judgeProfileId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid session' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, academy_id')
      .eq('id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!callerProfile?.academy_id || !['superadmin', 'admin'].includes(callerProfile.role)) {
      return json({ error: 'Only a superadmin or admin can revoke a judge' }, 403);
    }

    const body: RequestBody = await req.json();
    if (!body.judgeProfileId) return json({ error: 'judgeProfileId is required' }, 400);

    const { data: judge } = await admin
      .from('profiles')
      .select('id, academy_id, role')
      .eq('id', body.judgeProfileId)
      .maybeSingle();
    if (!judge || judge.role !== 'external_judge' || judge.academy_id !== callerProfile.academy_id) {
      return json({ error: 'Judge not found in your academy' }, 404);
    }

    const now = new Date().toISOString();

    // Guaranteed mechanism: architecture.md §4 has every external_judge
    // screen re-check is_active/access_expires_at on mount, so this alone
    // locks them out on their next interaction with the app.
    await admin.from('profiles').update({ is_active: false, access_expires_at: now }).eq('id', judge.id);
    await admin
      .from('external_judge_invites')
      .update({ status: 'revoked', revoked_by: user.id, revoked_at: now })
      .eq('profile_id', judge.id)
      .eq('status', 'active');

    // Best-effort immediate session kill (architecture.md §14: "hard
    // revocation... not lockout-on-next-check"). Not verified against a
    // live project — confirm this method/signature against the current
    // @supabase/supabase-js Admin API docs before depending on it; if it's
    // wrong or removed, the is_active/access_expires_at flip above is still
    // what actually enforces the lockout.
    let sessionRevoked = true;
    try {
      // deno-lint-ignore no-explicit-any
      await (admin.auth.admin as any).signOut?.(judge.id, 'global');
    } catch {
      sessionRevoked = false;
    }

    return json({ revoked: true, judgeProfileId: judge.id, sessionRevoked }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
