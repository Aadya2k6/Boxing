-- ============================================================================
-- BOXOS — Migration 0005: academy hard-delete cascade + judge activation
--
-- Run this in the Supabase SQL Editor after migration 0004.
--
-- Two additions needed by the Edge Functions in supabase/functions/:
--   1. hard_delete_academy() — the actual cascade delete for architecture.md
--      §10.4, called by the academy-hard-delete Edge Function AFTER it has
--      built and returned the CSV export. Kept as one atomic SQL function
--      rather than hand-orchestrated across ~25 tables from the Edge
--      Function, so the whole cascade either fully succeeds or fully rolls
--      back, and the delete order is verified in one place.
--   2. A trigger that flips an external_judge_invites row to 'active' the
--      moment that judge completes their forced first login (accepts
--      terms) — architecture.md §7 step 2. Substituted for a separate
--      "activate-external-judge" Edge Function since it's a same-row,
--      no-secrets state transition; no Admin API call is needed for it.
--
-- ⚠️ hard_delete_academy is the single most destructive action in this
-- system. It defaults to p_dry_run = true, which returns row counts
-- WITHOUT deleting anything — always run it dry-run first and sanity-check
-- the counts before ever passing p_dry_run := false. This has not been
-- exercised against a live database; verify the returned counts against a
-- test academy before relying on it in production.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. hard_delete_academy
-- ----------------------------------------------------------------------------

create or replace function public.hard_delete_academy(
  p_academy_id uuid,
  p_actor_id uuid,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ring_instance_ids uuid[];
  v_bout_ids uuid[];
  v_boxer_ids uuid[];
  v_template_ids uuid[];
  v_profile_ids uuid[];
  v_counts jsonb := '{}'::jsonb;
begin
  select array_agg(id) into v_ring_instance_ids from public.ring_instances where academy_id = p_academy_id;
  select array_agg(id) into v_bout_ids from public.bouts where ring_instance_id = any(coalesce(v_ring_instance_ids, '{}'));
  select array_agg(id) into v_boxer_ids from public.boxer_profiles where academy_id = p_academy_id;
  select array_agg(id) into v_template_ids from public.ring_schedule_templates where academy_id = p_academy_id;
  select array_agg(id) into v_profile_ids from public.profiles where academy_id = p_academy_id;

  v_counts := jsonb_build_object(
    'boxer_profiles', coalesce(array_length(v_boxer_ids, 1), 0),
    'bouts', coalesce(array_length(v_bout_ids, 1), 0),
    'ring_instances', coalesce(array_length(v_ring_instance_ids, 1), 0),
    'profiles', coalesce(array_length(v_profile_ids, 1), 0),
    'invoices', (select count(*) from public.invoices where academy_id = p_academy_id),
    'payments', (select count(*) from public.payments where academy_id = p_academy_id),
    'attendance', (select count(*) from public.attendance where academy_id = p_academy_id)
  );

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'academy_id', p_academy_id, 'would_delete', v_counts);
  end if;

  delete from public.notifications where academy_id = p_academy_id;
  delete from public.bout_judge_totals where bout_id = any(coalesce(v_bout_ids, '{}'));
  delete from public.bout_round_scores where bout_id = any(coalesce(v_bout_ids, '{}'));
  delete from public.bout_judge_assignments where bout_id = any(coalesce(v_bout_ids, '{}'));
  delete from public.bout_events where bout_id = any(coalesce(v_bout_ids, '{}'));
  delete from public.bout_rounds where bout_id = any(coalesce(v_bout_ids, '{}'));
  delete from public.boxer_bout_history where bout_id = any(coalesce(v_bout_ids, '{}'));
  delete from public.pregnancy_declarations
    where ring_instance_id = any(coalesce(v_ring_instance_ids, '{}'))
       or boxer_profile_id = any(coalesce(v_boxer_ids, '{}'));
  delete from public.session_feedback where boxer_profile_id = any(coalesce(v_boxer_ids, '{}'));
  delete from public.fitness_test_records where boxer_profile_id = any(coalesce(v_boxer_ids, '{}'));
  delete from public.coach_ring_assignments where ring_instance_id = any(coalesce(v_ring_instance_ids, '{}'));
  delete from public.external_judge_invites where academy_id = p_academy_id;
  delete from public.bouts where ring_instance_id = any(coalesce(v_ring_instance_ids, '{}'));
  delete from public.ring_instance_overrides where ring_instance_id = any(coalesce(v_ring_instance_ids, '{}'));
  delete from public.ring_assignment_poll_responses
    where poll_id in (select id from public.ring_assignment_polls where ring_instance_id = any(coalesce(v_ring_instance_ids, '{}')));
  delete from public.ring_assignment_polls where ring_instance_id = any(coalesce(v_ring_instance_ids, '{}'));
  delete from public.ring_instances where academy_id = p_academy_id;
  delete from public.ring_sessions where template_id = any(coalesce(v_template_ids, '{}'));
  delete from public.ring_schedule_templates where academy_id = p_academy_id;
  delete from public.academy_rings where academy_id = p_academy_id;
  delete from public.attendance_poll_responses
    where poll_id in (select id from public.attendance_polls where academy_id = p_academy_id);
  delete from public.attendance_polls where academy_id = p_academy_id;
  delete from public.leave_applications where academy_id = p_academy_id;
  delete from public.attendance where academy_id = p_academy_id;
  delete from public.academy_codes where academy_id = p_academy_id;
  delete from public.discount_applications where academy_id = p_academy_id;
  delete from public.discount_schemes where academy_id = p_academy_id;
  delete from public.coupons where academy_id = p_academy_id;
  delete from public.payments where academy_id = p_academy_id;
  delete from public.invoices where academy_id = p_academy_id;
  delete from public.fee_assignments where academy_id = p_academy_id;
  delete from public.fee_plans where academy_id = p_academy_id;
  delete from public.guardian_details where boxer_profile_id = any(coalesce(v_boxer_ids, '{}'));
  delete from public.boxer_profiles where academy_id = p_academy_id;
  delete from public.age_categories where academy_id = p_academy_id;
  delete from public.weight_categories where academy_id = p_academy_id;
  delete from public.fitness_test_types where academy_id = p_academy_id;
  delete from public.profiles where academy_id = p_academy_id;

  -- Tombstone, not a physical delete (architecture.md §10.4 step 4): the
  -- lifecycle log must retain proof the academy existed and was deleted.
  update public.academies
  set status = 'deleted', deleted_at = now(), deleted_by = p_actor_id
  where id = p_academy_id;

  insert into public.academy_lifecycle_events (academy_id, event_type, actor_id)
  values (p_academy_id, 'hard_deleted', p_actor_id);

  return jsonb_build_object('dry_run', false, 'academy_id', p_academy_id, 'deleted', v_counts, 'deleted_profile_ids', v_profile_ids);
end;
$$;

-- Only ever called from the academy-hard-delete Edge Function under the
-- service role — not exposed to any client role.
revoke all on function public.hard_delete_academy(uuid, uuid, boolean) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. External judge auto-activation on first login (architecture.md §7 step 2)
-- ----------------------------------------------------------------------------

create or replace function public.activate_external_judge_on_terms_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'external_judge'
     and old.terms_accepted_at is null
     and new.terms_accepted_at is not null then
    update public.external_judge_invites
    set status = 'active', activated_at = now(), profile_id = new.id
    where profile_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activate_external_judge_on_terms_accept on public.profiles;
create trigger trg_activate_external_judge_on_terms_accept
  after update of terms_accepted_at on public.profiles
  for each row execute function public.activate_external_judge_on_terms_accept();

-- ============================================================================
-- END OF MIGRATION 0005
-- ============================================================================
-- ============================================================================
-- BOXOS — Migration 0004: timezone correctness + RLS hardening
--
-- Run this in the Supabase SQL Editor after migration 0003.
-- Closes every finding from the Phase 2 audit:
--   1. No academy had a timezone; every date+time computation (pregnancy
--      declaration windows, the T-1h cron alert, the missed-window flip)
--      was silently evaluated in the database's own timezone, not the
--      academy's. Fixed by adding academies.timezone and converting every
--      date+time computation through it.
--   2. session_feedback, bout_round_scores, and pregnancy_declarations are
--      all documented as immutable once submitted, but their RLS policies
--      used `for all`, which grants UPDATE/DELETE with no restriction.
--   3. boxer_profiles/attendance let the owner DELETE their own row outright
--      — an athlete could delete their whole boxing profile or erase
--      attendance history.
--   4. leave_applications let the owner delete/edit a request in any status,
--      including one already rejected by staff.
--   5. bouts_coach's `for all` policy let any coach assigned to a ring
--      delete bouts in it, not just the bout's own designated coach — RLS's
--      WITH CHECK doesn't constrain DELETE, only USING does.
--   6. (found while writing the RLS test below, not in the original audit)
--      leave_applications' insert policy didn't constrain `status` —an
--      athlete could self-insert a request already marked 'approved',
--      bypassing review entirely. Insert now requires status='pending' and
--      null review fields.
--   7. (same) session_feedback's insert policy let an athlete link feedback
--      to an attendance_id/bout_id that wasn't theirs. Insert now verifies
--      the linkage belongs to the submitting boxer.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Timezone correctness
-- ----------------------------------------------------------------------------

alter table public.academies
  add column if not exists timezone text not null default 'Asia/Kolkata';

comment on column public.academies.timezone is
  'IANA timezone name (e.g. Asia/Kolkata). Every date+time computation for '
  'this academy''s sessions/bouts must convert through it — never assume '
  'the database''s own timezone.';

-- Re-derive window_opens_at through the assigned ring_instance's academy
-- timezone, falling back to the template's academy_id, then the default.
create or replace function public.create_pregnancy_declarations_for_roster()
returns trigger
language plpgsql
as $$
declare
  v_boxer_id uuid;
  v_from_time time;
  v_instance record;
  v_tz text;
begin
  select from_time into v_from_time from public.ring_sessions where id = new.id;

  for v_boxer_id in
    select unnest(new.assigned_boxer_ids)
    except
    select unnest(coalesce(old.assigned_boxer_ids, '{}'))
  loop
    if exists (
      select 1 from public.boxer_profiles
      where id = v_boxer_id and gender = 'Female' and is_minor = false
    ) then
      for v_instance in
        select ri.id, ri.date, coalesce(a.timezone, 'Asia/Kolkata') as tz
        from public.ring_instances ri
        left join public.academies a on a.id = ri.academy_id
        where ri.template_id = new.template_id
      loop
        insert into public.pregnancy_declarations
          (boxer_profile_id, ring_instance_id, ring_session_id, window_opens_at)
        values
          (v_boxer_id, v_instance.id, new.id,
           ((v_instance.date + v_from_time) at time zone v_instance.tz) - interval '24 hours')
        on conflict (boxer_profile_id, ring_instance_id, ring_session_id) do nothing;
      end loop;
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.create_pregnancy_declaration_for_bout()
returns trigger
language plpgsql
as $$
declare
  v_boxer_id uuid;
  v_instance_date date;
  v_from_time time;
  v_tz text;
begin
  select ri.date, coalesce(a.timezone, 'Asia/Kolkata')
    into v_instance_date, v_tz
    from public.ring_instances ri
    left join public.academies a on a.id = ri.academy_id
    where ri.id = new.ring_instance_id;

  select from_time into v_from_time from public.ring_sessions where id = new.ring_session_id;

  foreach v_boxer_id in array array[new.boxer_red_id, new.boxer_blue_id]
  loop
    if exists (
      select 1 from public.boxer_profiles
      where id = v_boxer_id and gender = 'Female' and is_minor = false
    ) then
      insert into public.pregnancy_declarations
        (boxer_profile_id, ring_instance_id, ring_session_id, bout_id, window_opens_at)
      values
        (v_boxer_id, new.ring_instance_id, new.ring_session_id, new.id,
         ((v_instance_date + v_from_time) at time zone v_tz) - interval '24 hours')
      on conflict (boxer_profile_id, ring_instance_id, ring_session_id)
      do update set bout_id = excluded.bout_id;
    end if;
  end loop;
  return new;
end;
$$;

-- Re-register the cron jobs with timezone-correct SQL (same job names —
-- cron.schedule replaces the existing schedule, doesn't duplicate it).
select cron.schedule(
  'pregnancy_declaration_coach_alert_sweep',
  '*/5 * * * *',
  $$
  insert into public.notifications (academy_id, recipient_id, type, title, body, data)
  select
    ri.academy_id,
    cra.coach_profile_id,
    'pregnancy_declaration_pending_alert',
    'Declarations pending before today''s session',
    bp.full_name || ' has not submitted her pre-session declaration for ' || rs.name || '.',
    jsonb_build_object('pregnancy_declaration_id', pd.id, 'ring_session_id', rs.id, 'boxer_profile_id', bp.id)
  from public.pregnancy_declarations pd
  join public.ring_instances ri on ri.id = pd.ring_instance_id
  join public.ring_sessions rs on rs.id = pd.ring_session_id
  join public.boxer_profiles bp on bp.id = pd.boxer_profile_id
  join public.coach_ring_assignments cra
    on cra.ring_instance_id = ri.id and cra.ring_session_id = rs.id and cra.date = ri.date
  left join public.academies a on a.id = ri.academy_id
  where pd.status in ('pending_window', 'open')
    and ((ri.date + rs.from_time) at time zone coalesce(a.timezone, 'Asia/Kolkata'))
      between now() + interval '55 minutes' and now() + interval '65 minutes'
    and not exists (
      select 1 from public.notifications n
      where n.recipient_id = cra.coach_profile_id
        and n.type = 'pregnancy_declaration_pending_alert'
        and n.data->>'pregnancy_declaration_id' = pd.id::text
    );

  update public.pregnancy_declarations pd
  set status = 'missed'
  from public.ring_instances ri
    join public.ring_sessions rs on rs.id = pd.ring_session_id
    left join public.academies a on a.id = ri.academy_id
  where pd.ring_instance_id = ri.id
    and pd.status in ('pending_window', 'open')
    and ((ri.date + rs.from_time) at time zone coalesce(a.timezone, 'Asia/Kolkata')) <= now();

  update public.bouts b
  set status = 'declaration_pending'
  from public.pregnancy_declarations pd, public.ring_instances ri, public.ring_sessions rs
  where pd.bout_id = b.id
    and pd.ring_instance_id = ri.id
    and pd.ring_session_id = rs.id
    and pd.status = 'missed'
    and b.status = 'weigh_in_confirmed';
  $$
);

-- ----------------------------------------------------------------------------
-- 2. session_feedback: immutable once submitted (architecture.md §11)
-- ----------------------------------------------------------------------------

drop policy if exists session_feedback_own on public.session_feedback;

create policy session_feedback_own_read on public.session_feedback for select
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));

create policy session_feedback_own_insert on public.session_feedback for insert
  with check (
    boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid())
    and (attendance_id is null or attendance_id in (
      select id from public.attendance
      where boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid())
    ))
    and (bout_id is null or bout_id in (
      select id from public.bouts
      where boxer_red_id in (select id from public.boxer_profiles where user_id = auth.uid())
         or boxer_blue_id in (select id from public.boxer_profiles where user_id = auth.uid())
    ))
  );

-- No update/delete policy for the owner — immutable by omission (RLS default-denies).

-- ----------------------------------------------------------------------------
-- 3. bout_round_scores: "one immutable scorecard per round" (architecture.md §7 step 4)
-- ----------------------------------------------------------------------------

drop policy if exists bout_round_scores_judge on public.bout_round_scores;

create policy bout_round_scores_judge_read on public.bout_round_scores for select
  using (judge_profile_id = auth.uid());

create policy bout_round_scores_judge_insert on public.bout_round_scores for insert
  with check (judge_profile_id = auth.uid());

-- No update/delete for the submitting judge — immutable by omission.

-- ----------------------------------------------------------------------------
-- 4. pregnancy_declarations: "immutable once written" (architecture.md §9.1 step 4),
--    with exactly one legitimate write path — the boxer submitting her own
--    declaration (status -> 'submitted'). Insert stays trigger-only
--    (SECURITY DEFINER bypasses RLS); no delete, ever.
-- ----------------------------------------------------------------------------

drop policy if exists pregnancy_declarations_own on public.pregnancy_declarations;

revoke update on public.pregnancy_declarations from authenticated;
grant update (status, submitted_at, submitted_by) on public.pregnancy_declarations to authenticated;

create policy pregnancy_declarations_own_read on public.pregnancy_declarations for select
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));

create policy pregnancy_declarations_own_submit on public.pregnancy_declarations for update
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()))
  with check (
    boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid())
    and status = 'submitted'
    and submitted_by = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 5. boxer_profiles: drop the owner's ability to DELETE their own profile
-- ----------------------------------------------------------------------------

drop policy if exists boxer_profiles_own on public.boxer_profiles;

create policy boxer_profiles_own_read on public.boxer_profiles for select
  using (user_id = auth.uid());

create policy boxer_profiles_own_insert on public.boxer_profiles for insert
  with check (user_id = auth.uid() and academy_id = public.auth_academy_id());

create policy boxer_profiles_own_update on public.boxer_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and academy_id = public.auth_academy_id());

-- ----------------------------------------------------------------------------
-- 6. attendance: self-check-in is insert-only — no self-edit/delete of a
--    point-in-time record (architecture.md §3.3: geotagging mandatory,
--    treated as an audit trail; corrections go through staff, who already
--    have attendance_staff for all).
-- ----------------------------------------------------------------------------

drop policy if exists attendance_own on public.attendance;

create policy attendance_own_read on public.attendance for select
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));

create policy attendance_own_insert on public.attendance for insert
  with check (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- 7. leave_applications: owner can withdraw/edit only while still 'pending'
--    — editing or deleting a request staff already reviewed would hide that
--    review from the record.
-- ----------------------------------------------------------------------------

drop policy if exists leave_applications_own on public.leave_applications;

create policy leave_applications_own_read on public.leave_applications for select
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));

create policy leave_applications_own_insert on public.leave_applications for insert
  with check (
    boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

create policy leave_applications_own_update on public.leave_applications for update
  using (
    boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid())
    and status = 'pending'
  )
  with check (
    boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid())
    and status = 'pending'
  );

create policy leave_applications_own_delete on public.leave_applications for delete
  using (
    boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid())
    and status = 'pending'
  );

-- ----------------------------------------------------------------------------
-- 8. bouts: a coach can read bouts in any ring they're assigned to, but can
--    only insert/update bouts where they're the designated coach_id — and,
--    critically, can never DELETE one (WITH CHECK doesn't constrain DELETE,
--    so `for all` was letting any assigned-ring coach delete bouts that
--    weren't theirs). Deletion stays staff-only via bouts_staff.
-- ----------------------------------------------------------------------------

drop policy if exists bouts_coach on public.bouts;

create policy bouts_coach_read on public.bouts for select
  using (
    public.auth_role() = 'coach'
    and (coach_id = auth.uid() or ring_instance_id in (
      select ri.id from public.ring_instances ri
        join public.coach_ring_assignments cra on cra.ring_instance_id = ri.id
        where cra.coach_profile_id = auth.uid()
    ))
  );

create policy bouts_coach_insert on public.bouts for insert
  with check (public.auth_role() = 'coach' and coach_id = auth.uid());

create policy bouts_coach_update on public.bouts for update
  using (public.auth_role() = 'coach' and coach_id = auth.uid())
  with check (public.auth_role() = 'coach' and coach_id = auth.uid());

-- ============================================================================
-- END OF MIGRATION 0004
-- ============================================================================
-- ============================================================================
-- BOXOS — Migration 0003: Scheduled jobs (pg_cron)
--
-- Run this in the Supabase SQL Editor after migration 0002.
--
-- Before running this file:
--   Supabase Dashboard → Database → Extensions → enable "pg_cron"
--   (pg_net is not required for these jobs; they're pure SQL sweeps.)
--
-- Then paste this whole file into the SQL Editor and run it once.
-- Re-running is safe — cron.schedule with the same job name replaces the
-- existing schedule instead of duplicating it (Supabase's pg_cron wrapper
-- upserts on job name).
-- ============================================================================

-- Pregnancy declaration window: 'pending_window' -> 'open' once we've
-- crossed window_opens_at (architecture.md §9.1 step 3).
select cron.schedule(
  'pregnancy_declaration_open_sweep',
  '*/5 * * * *',
  $$
  update public.pregnancy_declarations
  set status = 'open'
  where status = 'pending_window' and window_opens_at <= now();
  $$
);

-- Pregnancy declaration: flip to 'missed' once the session itself has
-- started with nothing submitted (architecture.md §9.1 step 7), and notify
-- the coach(es) assigned to that ring/session for the day one hour before
-- (architecture.md §9.1 step 5).
select cron.schedule(
  'pregnancy_declaration_coach_alert_sweep',
  '*/5 * * * *',
  $$
  insert into public.notifications (academy_id, recipient_id, type, title, body, data)
  select
    ri.academy_id,
    cra.coach_profile_id,
    'pregnancy_declaration_pending_alert',
    'Declarations pending before today''s session',
    bp.full_name || ' has not submitted her pre-session declaration for ' || rs.name || '.',
    jsonb_build_object('pregnancy_declaration_id', pd.id, 'ring_session_id', rs.id, 'boxer_profile_id', bp.id)
  from public.pregnancy_declarations pd
  join public.ring_instances ri on ri.id = pd.ring_instance_id
  join public.ring_sessions rs on rs.id = pd.ring_session_id
  join public.boxer_profiles bp on bp.id = pd.boxer_profile_id
  join public.coach_ring_assignments cra
    on cra.ring_instance_id = ri.id and cra.ring_session_id = rs.id and cra.date = ri.date
  where pd.status in ('pending_window', 'open')
    and (ri.date + rs.from_time)::timestamptz between now() + interval '55 minutes' and now() + interval '65 minutes'
    and not exists (
      select 1 from public.notifications n
      where n.recipient_id = cra.coach_profile_id
        and n.type = 'pregnancy_declaration_pending_alert'
        and n.data->>'pregnancy_declaration_id' = pd.id::text
    );

  update public.pregnancy_declarations pd
  set status = 'missed'
  from public.ring_instances ri, public.ring_sessions rs
  where pd.ring_instance_id = ri.id
    and pd.ring_session_id = rs.id
    and pd.status in ('pending_window', 'open')
    and (ri.date + rs.from_time)::timestamptz <= now();

  update public.bouts b
  set status = 'declaration_pending'
  from public.pregnancy_declarations pd, public.ring_instances ri, public.ring_sessions rs
  where pd.bout_id = b.id
    and pd.ring_instance_id = ri.id
    and pd.ring_session_id = rs.id
    and pd.status = 'missed'
    and b.status = 'weigh_in_confirmed';
  $$
);

-- Auto-generate ring_instances from active templates across their
-- valid_from/valid_to range (architecture.md §3.5/§7 scheduling model).
-- Runs daily; only ever creates instances for dates that don't already
-- have one (unique constraint on (template_id, date) backs this up too).
select cron.schedule(
  'ring_instance_auto_generation',
  '0 1 * * *',
  $$
  insert into public.ring_instances (template_id, academy_id, date)
  select t.id, t.academy_id, d::date
  from public.ring_schedule_templates t
  cross join lateral generate_series(
    greatest(t.valid_from, current_date),
    t.valid_to,
    interval '1 day'
  ) as d
  where t.is_active
    and t.status in ('scheduled', 'in_progress')
    and extract(dow from d)::int = any(t.days_of_week)
    and not exists (
      select 1 from public.ring_instances ri where ri.template_id = t.id and ri.date = d::date
    )
  on conflict (template_id, date) do nothing;
  $$
);

-- To inspect/verify scheduled jobs afterward:
--   select jobid, jobname, schedule, active from cron.job;
-- To see recent run history:
--   select * from cron.job_run_details order by start_time desc limit 20;
-- To remove a job:
--   select cron.unschedule('job_name_here');
-- ============================================================================
-- BOXOS — Migration 0001: athlete signup flow + self-escalation RLS fix
--
-- Run this ONCE in the Supabase SQL Editor, after the baseline in
-- ../../supabase_schema.sql has been applied, and before migration 0002.
-- It is idempotent (safe to re-run) except for the two `grant` statements,
-- which are naturally idempotent too (a repeated grant of the same
-- privilege is a no-op, not an error).
--
-- What this fixes, and why:
--   1. profiles' academy_id CHECK required a non-null academy_id for every
--      non-boxos_admin role — including athlete — but a self-signed-up
--      athlete has no academy until they verify an academy code
--      (architecture.md §1.3). That made the signup row impossible to
--      insert. Now null is allowed for 'athlete' specifically.
--   2. There was no trigger creating a `profiles` row on signup at all, so
--      a newly registered athlete had a Supabase Auth user but no profile —
--      the app would sit on "session, no profile → wait" forever.
--   3. profiles_self_update and boxer_profiles_own both allowed a signed-in
--      user to PATCH *any* column on their own row, including `role`,
--      `academy_id`, `is_suspended`, `record_wins`, etc. — a privilege-
--      escalation hole. Both are now column-restricted via Postgres column
--      privileges (GRANT/REVOKE), which RLS's row-level policies can't
--      express on their own.
--   4. The academy-code verification window was a hardcoded `interval '7
--      days'` inside the trigger, and the current Terms version was a
--      hardcoded constant in the TypeScript client. Both now live in a new
--      `platform_settings` singleton table, editable without a redeploy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles.academy_id CHECK constraint
-- ----------------------------------------------------------------------------

alter table public.profiles drop constraint if exists chk_profiles_academy_scope;

alter table public.profiles add constraint chk_profiles_academy_scope check (
  (role in ('boxos_admin', 'athlete'))
  or (role in ('superadmin', 'admin', 'coach', 'external_judge') and academy_id is not null)
);

-- ----------------------------------------------------------------------------
-- 2. Platform-wide config (no more hardcoded 7-day window / terms constant)
-- ----------------------------------------------------------------------------

create table if not exists public.platform_settings (
  id boolean primary key default true check (id), -- singleton: exactly one row, always id = true
  academy_code_verification_days integer not null default 7,
  current_terms_version text not null default '2026-01-01',
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id)
values (true)
on conflict (id) do nothing;

drop trigger if exists trg_platform_settings_updated_at on public.platform_settings;
create trigger trg_platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_boxos_all on public.platform_settings;
create policy platform_settings_boxos_all on public.platform_settings for all
  using (public.auth_role() = 'boxos_admin') with check (public.auth_role() = 'boxos_admin');

create or replace function public.get_current_terms_version()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select current_terms_version from public.platform_settings limit 1;
$$;

grant execute on function public.get_current_terms_version() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Auto-create the profiles row on signup
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'athlete');
  v_academy_id uuid := nullif(new.raw_user_meta_data->>'academy_id', '')::uuid;
  v_terms_version text := new.raw_user_meta_data->>'terms_version';
  v_verification_days integer;
begin
  select academy_code_verification_days into v_verification_days from public.platform_settings limit 1;

  insert into public.profiles (
    id, role, academy_id, full_name, email, academy_code_deadline, terms_accepted_at, terms_version
  )
  values (
    new.id,
    v_role,
    v_academy_id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    case when v_role = 'athlete'
      then now() + (coalesce(v_verification_days, 7) || ' days')::interval
      else null
    end,
    case when v_terms_version is not null then now() else null end,
    v_terms_version
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. Terms acceptance + academy-code verification RPCs
-- ----------------------------------------------------------------------------

create or replace function public.accept_terms(p_terms_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set terms_accepted_at = now(), terms_version = p_terms_version
  where id = auth.uid();
end;
$$;

create or replace function public.verify_academy_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy_id uuid;
  v_deadline timestamptz;
begin
  if public.auth_role() <> 'athlete' then
    raise exception 'only athlete accounts verify an academy code';
  end if;

  select academy_code_deadline into v_deadline from public.profiles where id = auth.uid();
  if v_deadline is not null and v_deadline < now() then
    raise exception 'verification window has expired' using errcode = 'P0001';
  end if;

  select academy_id into v_academy_id
    from public.academy_codes
    where code = p_code and is_active and (expires_at is null or expires_at > now());

  if v_academy_id is null then
    raise exception 'invalid or expired academy code';
  end if;

  update public.profiles
  set academy_id = v_academy_id, academy_code_verified = true
  where id = auth.uid();

  return v_academy_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. profiles: column-restricted self-update (close the self-escalation hole)
-- ----------------------------------------------------------------------------

revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url, push_token, preferred_academy_id)
  on public.profiles to authenticated;

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_superadmin_manage_staff on public.profiles;
-- Staff account creation/deactivation now goes exclusively through
-- service-role Edge Functions (§14) — there is no direct-write RLS path for
-- managing another user's profile row. profiles_academy_staff_read (already
-- applied) still covers superadmin/admin/coach read access.

-- ----------------------------------------------------------------------------
-- 6. boxer_profiles: column-restricted self-write
-- ----------------------------------------------------------------------------

revoke insert, update on public.boxer_profiles from authenticated;
grant insert (
  user_id, academy_id, full_name, date_of_birth, gender, nationality, profile_photo_url,
  phone, email, city, state, country, blood_group, physical_conditions, current_medications,
  allergies, medical_fitness_declared, is_minor, onboarding_complete, emergency_contact_name,
  emergency_contact_relation, emergency_contact_phone, primary_physician_details, stance,
  declared_weight_kg, age_category_id, weight_category_id, reach_cm, height_cm,
  national_federation_boxer_id
) on public.boxer_profiles to authenticated;
grant update (
  full_name, date_of_birth, gender, nationality, profile_photo_url, phone, email, city, state,
  country, blood_group, physical_conditions, current_medications, allergies,
  medical_fitness_declared, is_minor, onboarding_complete, emergency_contact_name,
  emergency_contact_relation, emergency_contact_phone, primary_physician_details, stance,
  declared_weight_kg, age_category_id, weight_category_id, reach_cm, height_cm,
  national_federation_boxer_id
) on public.boxer_profiles to authenticated;

drop policy if exists boxer_profiles_own on public.boxer_profiles;
create policy boxer_profiles_own on public.boxer_profiles for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and academy_id = public.auth_academy_id());

-- ============================================================================
-- END OF MIGRATION 0001
-- ============================================================================
-- ============================================================================
-- BOXOS — Migration 0002: Global (BOXOS-default) age & weight category seed
-- Source: rules.txt (World Boxing Competition Rules, in force Nov 2024)
--   §2.1  Age categories
--   §2.2.2 Elite Men's/Women's weight categories FROM 1 JANUARY 2025 (current)
--   §2.2.3 U19 Men's/Women's weight categories
--   §2.2.4 U17 Boys'/Girls' weight categories
--   §13.1.6–13.1.7 Glove weights
--
-- Run this in the Supabase SQL Editor after migration 0001. Safe to re-run
-- (guarded by NOT EXISTS checks on the category name).
--
-- Deliberately NOT seeded: U15 (13–14). §2.1.5 states U15 round timing and
-- weight categories are "regulated by Confederations and/or National
-- Federations", not fixed in this rulebook — no default exists to seed
-- without guessing. Add it yourself per-academy, or tell me the numbers your
-- federation/academy uses and I'll add a proper global default for it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Age categories (§2.1) — round_count/rest_duration use the schema's
--    existing defaults (3 rounds, 60s rest), which already match §1.1.5/1.1.7.
--    round_duration_seconds is set explicitly per §1.1.6.
-- ----------------------------------------------------------------------------

insert into public.age_categories (academy_id, name, min_age, max_age, gender_scope, round_duration_seconds)
select null, 'Elite', 19, 40, 'all', 180
where not exists (select 1 from public.age_categories where academy_id is null and name = 'Elite');

insert into public.age_categories (academy_id, name, min_age, max_age, gender_scope, round_duration_seconds)
select null, 'U19', 17, 18, 'all', 180
where not exists (select 1 from public.age_categories where academy_id is null and name = 'U19');

insert into public.age_categories (academy_id, name, min_age, max_age, gender_scope, round_duration_seconds)
select null, 'U17', 15, 16, 'all', 120
where not exists (select 1 from public.age_categories where academy_id is null and name = 'U17');

-- ----------------------------------------------------------------------------
-- 2. Weight categories
--    weight_categories.gender is 'men'|'women'|'boys'|'girls' — Elite/U19 map
--    to men/women, U17 maps to boys/girls, per architecture.md §3.4.
-- ----------------------------------------------------------------------------

-- Elite Men (from 1 Jan 2025, §2.2.2) — 10oz up to Welterweight/65kg,
-- 12oz from Light Middleweight/70kg up (§13.1.6–13.1.7).
with cat as (select id from public.age_categories where academy_id is null and name = 'Elite')
insert into public.weight_categories (academy_id, age_category_id, gender, name, min_kg, max_kg, glove_oz, sort_order)
select null, cat.id, 'men', v.name, v.min_kg, v.max_kg, v.glove_oz, v.sort_order
from cat, (values
  ('Flyweight',           47,  50, 10, 1),
  ('Bantamweight',        50,  55, 10, 2),
  ('Lightweight',         55,  60, 10, 3),
  ('Welterweight',        60,  65, 10, 4),
  ('Light Middleweight',  65,  70, 12, 5),
  ('Middleweight',        70,  75, 12, 6),
  ('Light Heavyweight',   75,  80, 12, 7),
  ('Cruiserweight',       80,  85, 12, 8),
  ('Heavyweight',         85,  90, 12, 9),
  ('Super Heavyweight',   90, null, 12, 10)
) as v(name, min_kg, max_kg, glove_oz, sort_order)
where not exists (
  select 1 from public.weight_categories wc
  where wc.academy_id is null and wc.age_category_id = cat.id and wc.gender = 'men' and wc.name = v.name
);

-- Elite Women (from 1 Jan 2025, §2.2.2) — 10oz for all (§13.1.6).
with cat as (select id from public.age_categories where academy_id is null and name = 'Elite')
insert into public.weight_categories (academy_id, age_category_id, gender, name, min_kg, max_kg, glove_oz, sort_order)
select null, cat.id, 'women', v.name, v.min_kg, v.max_kg, v.glove_oz, v.sort_order
from cat, (values
  ('Light Flyweight',    45,  48, 10, 1),
  ('Flyweight',          48,  51, 10, 2),
  ('Bantamweight',       51,  54, 10, 3),
  ('Featherweight',      54,  57, 10, 4),
  ('Lightweight',        57,  60, 10, 5),
  ('Welterweight',       60,  65, 10, 6),
  ('Light Middleweight', 65,  70, 10, 7),
  ('Middleweight',       70,  75, 10, 8),
  ('Light Heavyweight',  75,  80, 10, 9),
  ('Heavyweight',        80, null, 10, 10)
) as v(name, min_kg, max_kg, glove_oz, sort_order)
where not exists (
  select 1 from public.weight_categories wc
  where wc.academy_id is null and wc.age_category_id = cat.id and wc.gender = 'women' and wc.name = v.name
);

-- U19 Men (§2.2.3) — same weight breaks and glove split as Elite Men 2025.
with cat as (select id from public.age_categories where academy_id is null and name = 'U19')
insert into public.weight_categories (academy_id, age_category_id, gender, name, min_kg, max_kg, glove_oz, sort_order)
select null, cat.id, 'men', v.name, v.min_kg, v.max_kg, v.glove_oz, v.sort_order
from cat, (values
  ('Flyweight',           47,  50, 10, 1),
  ('Bantamweight',        50,  55, 10, 2),
  ('Lightweight',         55,  60, 10, 3),
  ('Welterweight',        60,  65, 10, 4),
  ('Light Middleweight',  65,  70, 12, 5),
  ('Middleweight',        70,  75, 12, 6),
  ('Light Heavyweight',   75,  80, 12, 7),
  ('Cruiserweight',       80,  85, 12, 8),
  ('Heavyweight',         85,  90, 12, 9),
  ('Super Heavyweight',   90, null, 12, 10)
) as v(name, min_kg, max_kg, glove_oz, sort_order)
where not exists (
  select 1 from public.weight_categories wc
  where wc.academy_id is null and wc.age_category_id = cat.id and wc.gender = 'men' and wc.name = v.name
);

-- U19 Women (§2.2.3) — 10oz for all (§13.1.6).
with cat as (select id from public.age_categories where academy_id is null and name = 'U19')
insert into public.weight_categories (academy_id, age_category_id, gender, name, min_kg, max_kg, glove_oz, sort_order)
select null, cat.id, 'women', v.name, v.min_kg, v.max_kg, v.glove_oz, v.sort_order
from cat, (values
  ('Light Flyweight',    45,  48, 10, 1),
  ('Flyweight',          48,  51, 10, 2),
  ('Bantamweight',       51,  54, 10, 3),
  ('Featherweight',      54,  57, 10, 4),
  ('Lightweight',        57,  60, 10, 5),
  ('Welterweight',       60,  65, 10, 6),
  ('Light Middleweight', 65,  70, 10, 7),
  ('Middleweight',       70,  75, 10, 8),
  ('Light Heavyweight',  75,  80, 10, 9),
  ('Heavyweight',        80, null, 10, 10)
) as v(name, min_kg, max_kg, glove_oz, sort_order)
where not exists (
  select 1 from public.weight_categories wc
  where wc.academy_id is null and wc.age_category_id = cat.id and wc.gender = 'women' and wc.name = v.name
);

-- U17 Boys (§2.2.4) — 10oz for all U17 Men's/Boys' categories (§13.1.6).
with cat as (select id from public.age_categories where academy_id is null and name = 'U17')
insert into public.weight_categories (academy_id, age_category_id, gender, name, min_kg, max_kg, glove_oz, sort_order)
select null, cat.id, 'boys', v.name, v.min_kg, v.max_kg, 10, v.sort_order
from cat, (values
  ('Pinweight',           44,  46, 1),
  ('Light Flyweight',     46,  48, 2),
  ('Flyweight',           48,  50, 3),
  ('Light Bantamweight',  50,  52, 4),
  ('Bantamweight',        52,  54, 5),
  ('Featherweight',       54,  57, 6),
  ('Lightweight',         57,  60, 7),
  ('Light Welterweight',  60,  63, 8),
  ('Welterweight',        63,  66, 9),
  ('Light Middleweight',  66,  70, 10),
  ('Middleweight',        70,  75, 11),
  ('Light Heavyweight',   75,  80, 12),
  ('Heavyweight',         80, null, 13)
) as v(name, min_kg, max_kg, sort_order)
where not exists (
  select 1 from public.weight_categories wc
  where wc.academy_id is null and wc.age_category_id = cat.id and wc.gender = 'boys' and wc.name = v.name
);

-- U17 Girls (§2.2.4) — same weight breaks; 10oz per the blanket women's rule (§13.1.6).
with cat as (select id from public.age_categories where academy_id is null and name = 'U17')
insert into public.weight_categories (academy_id, age_category_id, gender, name, min_kg, max_kg, glove_oz, sort_order)
select null, cat.id, 'girls', v.name, v.min_kg, v.max_kg, 10, v.sort_order
from cat, (values
  ('Pinweight',           44,  46, 1),
  ('Light Flyweight',     46,  48, 2),
  ('Flyweight',           48,  50, 3),
  ('Light Bantamweight',  50,  52, 4),
  ('Bantamweight',        52,  54, 5),
  ('Featherweight',       54,  57, 6),
  ('Lightweight',         57,  60, 7),
  ('Light Welterweight',  60,  63, 8),
  ('Welterweight',        63,  66, 9),
  ('Light Middleweight',  66,  70, 10),
  ('Middleweight',        70,  75, 11),
  ('Light Heavyweight',   75,  80, 12),
  ('Heavyweight',         80, null, 13)
) as v(name, min_kg, max_kg, sort_order)
where not exists (
  select 1 from public.weight_categories wc
  where wc.academy_id is null and wc.age_category_id = cat.id and wc.gender = 'girls' and wc.name = v.name
);

-- ----------------------------------------------------------------------------
-- 3. Fitness test catalog (architecture.md §3.11 — named examples given
--    there, not sourced from rules.txt).
-- ----------------------------------------------------------------------------

insert into public.fitness_test_types (academy_id, name, unit)
select null, v.name, v.unit
from (values
  ('Yo-Yo IR Test',            'level'),
  ('Cooper 12-Minute Run',     'meters'),
  ('Beep Test',                'level'),
  ('Vertical Jump',            'cm'),
  ('40m Sprint',                'seconds'),
  ('Push-up Max',              'reps'),
  ('Plank Hold',               'seconds')
) as v(name, unit)
where not exists (
  select 1 from public.fitness_test_types ftt where ftt.academy_id is null and ftt.name = v.name
);

-- ============================================================================
-- END OF SEED
-- ============================================================================
-- ============================================================================
-- BOXOS — Supabase Schema
-- Generated from architecture.md (§1–§14) and screens.md
-- Paste into the Supabase SQL editor and run top-to-bottom (single transaction
-- recommended: wrap in BEGIN; ... COMMIT; if you want all-or-nothing).
--
-- Conventions (per architecture.md §3):
--   - uuid PKs via gen_random_uuid()
--   - timestamptz for all time columns
--   - enum-like columns are `text` + CHECK constraints (not native enums)
--   - every academy-scoped table carries academy_id for tenant isolation
--   - RLS is enabled on every table; policies implement the §13 matrix
--
-- NOTE on things that are NOT pure SQL:
--   - Scheduled jobs (pregnancy-declaration window flip at T-24h, coach alert
--     at T-1h, tournament auto-completion sweep) need pg_cron + an Edge
--     Function or a cron-triggered RPC. Stubs/comments are left where these
--     hook in. Payment-secret handling, Razorpay/PayU calls, push
--     notifications, and Admin-API session revocation are Edge Function
--     responsibilities (service-role), not SQL.
--   - `notifications` table is an inferred addition (screens.md shows a
--     Notifications tab on every role) — architecture.md doesn't define its
--     columns explicitly, so this is a reasonable minimal shape; adjust as
--     needed.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 0. HELPER FUNCTIONS (used throughout RLS policies)
--    auth_role()/auth_academy_id() are SQL-language and query `profiles`, so
--    they're created further below (§1.2), right after that table exists —
--    Postgres validates a SQL function's body against real objects at
--    CREATE time, unlike plpgsql which only checks at call time.
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. IDENTITY & ROLES  (architecture.md §3.1)
-- ============================================================================

-- 1.1 academies must exist before profiles (profiles.academy_id -> academies)
--     but academies.*_by columns reference auth.users directly (not profiles)
--     to avoid a circular dependency.

create table if not exists public.academies (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  logo_url                  text,
  address                   text,
  city                      text,
  state                     text,
  latitude                  double precision,
  longitude                 double precision,
  attendance_radius_meters  integer not null default 200,

  -- payment gateway config (§2, §10)
  razorpay_key_id           text,
  encrypted_razorpay_secret text,
  payu_merchant_key         text,
  encrypted_payu_salt       text,
  active_gateway            text not null default 'razorpay'
                              check (active_gateway in ('razorpay','payu')),

  -- tenancy lifecycle (§10)
  status                    text not null default 'active'
                              check (status in ('active','suspended','archived','deleted')),
  suspended_reason          text,
  suspended_at              timestamptz,
  suspended_by              uuid references auth.users(id),
  archived_at               timestamptz,
  hard_delete_eligible_at   timestamptz,
  deleted_at                timestamptz,
  deleted_by                uuid references auth.users(id),

  onboarded_by              uuid references auth.users(id),
  onboarded_at              timestamptz,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create trigger trg_academies_updated_at
  before update on public.academies
  for each row execute function public.set_updated_at();

create table if not exists public.academy_lifecycle_events (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  event_type  text not null check (event_type in
              ('created','suspended','reactivated','archived','hard_deleted',
               'settings_changed','superadmin_invited')),
  reason      text,
  actor_id    uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_academy_lifecycle_events_academy
  on public.academy_lifecycle_events(academy_id);

-- 1.2 profiles.id = auth.users.id (1:1 with Supabase Auth)

create table if not exists public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  role                    text not null check (role in
                          ('boxos_admin','superadmin','admin','coach','athlete','external_judge')),
  academy_id              uuid references public.academies(id),
  full_name               text,
  email                   text,
  phone                   text,
  avatar_url              text,
  preferred_academy_id    uuid references public.academies(id), -- athlete-only, pre-assignment
  is_active               boolean not null default true,
  push_token              text,
  academy_code_verified   boolean not null default false,
  academy_code_deadline   timestamptz,

  -- external-judge-only
  judge_scope_tournament_id uuid, -- FK added after ring_schedule_templates exists (§7)
  access_expires_at        timestamptz,
  invited_by                uuid references auth.users(id),

  -- consent (§12)
  terms_accepted_at        timestamptz,
  terms_version             text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- academy_id is null ONLY for boxos_admin
  constraint chk_profiles_academy_scope check (
    (role = 'boxos_admin' and academy_id is null)
    or (role <> 'boxos_admin' and academy_id is not null)
  )
);

create index if not exists idx_profiles_academy on public.profiles(academy_id);
create index if not exists idx_profiles_role on public.profiles(role);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- auth_role()/auth_academy_id(): SECURITY DEFINER + STABLE so RLS policies
-- elsewhere can read the caller's own role/academy without recursing into
-- profiles' own RLS policies. Must be created after `profiles` exists.
create or replace function public.auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.auth_academy_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select academy_id from public.profiles where id = auth.uid();
$$;

-- ============================================================================
-- 2. AGE & WEIGHT CATEGORIES — global template + academy override (§3.4)
--    (created before boxer_profiles, which FKs into these)
-- ============================================================================

create table if not exists public.age_categories (
  id                              uuid primary key default gen_random_uuid(),
  academy_id                      uuid references public.academies(id), -- null = BOXOS default
  name                            text not null,
  min_age                         integer not null,
  max_age                         integer,
  gender_scope                    text not null check (gender_scope in ('men','women','boys','girls','all')),
  round_count                     integer not null default 3,
  round_duration_seconds          integer not null default 180,
  rest_duration_seconds           integer not null default 60,
  max_eight_counts_per_round      integer not null default 3,
  max_eight_counts_per_bout       integer not null default 4,
  is_active                       boolean not null default true,
  created_by                      uuid references auth.users(id),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index if not exists idx_age_categories_academy on public.age_categories(academy_id);

create trigger trg_age_categories_updated_at
  before update on public.age_categories
  for each row execute function public.set_updated_at();

create table if not exists public.weight_categories (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid references public.academies(id), -- null = BOXOS default
  age_category_id uuid not null references public.age_categories(id) on delete cascade,
  gender          text not null check (gender in ('men','women','boys','girls')),
  name            text not null,
  min_kg          numeric not null,
  max_kg          numeric,
  glove_oz        integer not null check (glove_oz in (10,12)),
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create index if not exists idx_weight_categories_academy on public.weight_categories(academy_id);
create index if not exists idx_weight_categories_age_cat on public.weight_categories(age_category_id);

-- Effective-config resolution views (§3.4): an academy's own row overrides the
-- global (academy_id null) row of the same name.
create or replace view public.effective_age_categories as
select distinct on (coalesce_academy, name) *
from (
  select ac.*, ac.academy_id as coalesce_academy from public.age_categories ac
) t
order by coalesce_academy, name, (academy_id is not null) desc;

create or replace view public.effective_weight_categories as
select distinct on (coalesce_academy, name) *
from (
  select wc.*, wc.academy_id as coalesce_academy from public.weight_categories wc
) t
order by coalesce_academy, name, (academy_id is not null) desc;

-- ============================================================================
-- 3. BOXER PROFILES & GUARDIAN DETAILS (§3.1)
-- ============================================================================

create table if not exists public.boxer_profiles (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references public.profiles(id) on delete cascade,
  academy_id                  uuid not null references public.academies(id),

  -- identity/contact
  full_name                   text not null,
  date_of_birth               date not null,
  gender                      text not null check (gender in ('Male','Female','Other')),
  nationality                 text,
  profile_photo_url           text,
  phone                       text,
  email                       text,
  city                        text,
  state                       text,
  country                     text,
  blood_group                 text,
  physical_conditions         text,
  current_medications         text,
  allergies                   text,
  medical_fitness_declared    boolean not null default false,
  is_minor                    boolean not null default false,
  onboarding_complete         boolean not null default false,
  emergency_contact_name      text,
  emergency_contact_relation  text,
  emergency_contact_phone     text,
  primary_physician_details   text,
  verification_status         text not null default 'pending'
                                 check (verification_status in ('pending','verified','rejected')),

  -- boxing profile
  stance                      text check (stance in ('orthodox','southpaw')),
  declared_weight_kg          numeric,
  age_category_id             uuid references public.age_categories(id),
  weight_category_id          uuid references public.weight_categories(id),
  reach_cm                    numeric,
  height_cm                   numeric,
  national_federation_boxer_id text,

  -- record cache
  record_wins                 integer not null default 0,
  record_losses                integer not null default 0,
  record_draws                 integer not null default 0,
  record_kos                   integer not null default 0,

  -- medical/injury suspension (§8)
  is_suspended                boolean not null default false,
  suspension_start_date       date,
  suspension_end_date         date, -- null = indefinite
  suspension_reason           text,
  suspended_by                uuid references auth.users(id),
  suspended_at                timestamptz,
  reinstated_by               uuid references auth.users(id),
  reinstated_at               timestamptz,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  unique (user_id)
);

create index if not exists idx_boxer_profiles_academy on public.boxer_profiles(academy_id);
create index if not exists idx_boxer_profiles_user on public.boxer_profiles(user_id);
create index if not exists idx_boxer_profiles_weight_cat on public.boxer_profiles(weight_category_id);
create index if not exists idx_boxer_profiles_age_cat on public.boxer_profiles(age_category_id);
create index if not exists idx_boxer_profiles_suspended on public.boxer_profiles(is_suspended);

create trigger trg_boxer_profiles_updated_at
  before update on public.boxer_profiles
  for each row execute function public.set_updated_at();

create table if not exists public.guardian_details (
  id                uuid primary key default gen_random_uuid(),
  boxer_profile_id  uuid not null references public.boxer_profiles(id) on delete cascade,
  full_name         text not null,
  relationship      text not null,
  phone             text not null,
  email             text,
  consent_given     boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (boxer_profile_id)
);

create trigger trg_guardian_details_updated_at
  before update on public.guardian_details
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 4. FEES, PAYMENTS, COUPONS, DISCOUNTS, ACADEMY CODES (§3.3)
-- ============================================================================

create table if not exists public.fee_plans (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id),
  name         text not null,
  amount       numeric not null,
  cycle        text not null check (cycle in ('monthly','quarterly','half_yearly','yearly','one_time')),
  description  text,
  is_active    boolean not null default true,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_fee_plans_academy on public.fee_plans(academy_id);
create trigger trg_fee_plans_updated_at before update on public.fee_plans
  for each row execute function public.set_updated_at();

create table if not exists public.fee_assignments (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id),
  boxer_profile_id  uuid not null references public.boxer_profiles(id) on delete cascade,
  fee_plan_id       uuid not null references public.fee_plans(id),
  assigned_by       uuid references auth.users(id),
  status            text not null default 'active' check (status in ('active','cancelled','completed')),
  rollover_of       uuid references public.fee_assignments(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_fee_assignments_academy on public.fee_assignments(academy_id);
create index if not exists idx_fee_assignments_boxer on public.fee_assignments(boxer_profile_id);
create trigger trg_fee_assignments_updated_at before update on public.fee_assignments
  for each row execute function public.set_updated_at();

create table if not exists public.invoices (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id),
  boxer_profile_id  uuid not null references public.boxer_profiles(id) on delete cascade,
  fee_assignment_id uuid references public.fee_assignments(id),
  invoice_number    text not null,
  billing_period_start date,
  billing_period_end   date,
  amount_due        numeric not null,
  amount_paid       numeric not null default 0,
  status            text not null default 'unpaid'
                       check (status in ('unpaid','partially_paid','paid','overdue','cancelled','pending_approval')),
  due_date          date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (academy_id, invoice_number)
);

create index if not exists idx_invoices_academy on public.invoices(academy_id);
create index if not exists idx_invoices_boxer on public.invoices(boxer_profile_id);
create index if not exists idx_invoices_status on public.invoices(status);
create trigger trg_invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id),
  invoice_id        uuid not null references public.invoices(id) on delete cascade,
  boxer_profile_id  uuid not null references public.boxer_profiles(id),
  amount            numeric not null,
  payment_mode      text not null check (payment_mode in ('online','cash','rollover')),
  gateway           text check (gateway in ('razorpay','payu')),
  gateway_order_id  text,
  gateway_payment_id text,
  reference         text,
  status            text not null default 'success' check (status in ('pending','success','failed','refunded')),
  recorded_by       uuid references auth.users(id), -- set for cash payments
  approved_by       uuid references auth.users(id), -- cash-pending approval flow
  created_at        timestamptz not null default now()
);

create index if not exists idx_payments_academy on public.payments(academy_id);
create index if not exists idx_payments_invoice on public.payments(invoice_id);
create index if not exists idx_payments_boxer on public.payments(boxer_profile_id);

-- Trigger: a successful payment auto-marks the invoice (partially_)paid.
create or replace function public.apply_payment_to_invoice()
returns trigger
language plpgsql
as $$
declare
  v_total_paid numeric;
  v_amount_due numeric;
begin
  if new.status = 'success' then
    select coalesce(sum(amount),0) into v_total_paid
      from public.payments where invoice_id = new.invoice_id and status = 'success';
    select amount_due into v_amount_due from public.invoices where id = new.invoice_id;

    update public.invoices
      set amount_paid = v_total_paid,
          status = case when v_total_paid >= v_amount_due then 'paid'
                        when v_total_paid > 0 then 'partially_paid'
                        else status end,
          updated_at = now()
      where id = new.invoice_id;

    if new.payment_mode <> 'rollover' then
      update public.fee_assignments
        set status = 'completed', updated_at = now()
        where id = (select fee_assignment_id from public.invoices where id = new.invoice_id)
          and status = 'active';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_apply_payment_to_invoice
  after insert on public.payments
  for each row execute function public.apply_payment_to_invoice();

create table if not exists public.coupons (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id),
  code           text not null,
  discount_type  text not null check (discount_type in ('flat','percentage')),
  discount_value numeric not null check (discount_value > 0),
  max_uses       integer,
  used_count     integer not null default 0,
  valid_from     date,
  valid_to       date,
  is_active      boolean not null default true,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  unique (academy_id, code)
);

create index if not exists idx_coupons_academy on public.coupons(academy_id);

create table if not exists public.discount_schemes (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id),
  name           text not null,
  discount_type  text not null check (discount_type in ('flat','percentage')),
  discount_value numeric not null check (discount_value > 0),
  reason         text,
  is_active      boolean not null default true,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create index if not exists idx_discount_schemes_academy on public.discount_schemes(academy_id);

create table if not exists public.discount_applications (
  id                  uuid primary key default gen_random_uuid(),
  academy_id          uuid not null references public.academies(id),
  discount_scheme_id  uuid not null references public.discount_schemes(id),
  boxer_profile_id    uuid not null references public.boxer_profiles(id) on delete cascade,
  invoice_id          uuid references public.invoices(id),
  applied_by          uuid references auth.users(id),
  applied_at          timestamptz not null default now()
);

create index if not exists idx_discount_applications_academy on public.discount_applications(academy_id);

create table if not exists public.academy_codes (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id) on delete cascade,
  code         text not null unique,
  is_active    boolean not null default true,
  expires_at   timestamptz,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create index if not exists idx_academy_codes_academy on public.academy_codes(academy_id);

-- ============================================================================
-- 5. ATTENDANCE, LEAVE, POLLS (§3.3)
-- ============================================================================

create table if not exists public.attendance (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id),
  boxer_profile_id  uuid not null references public.boxer_profiles(id) on delete cascade,
  ring_session_id   uuid, -- FK added after ring_sessions exists
  session_date      date not null default current_date,
  status            text not null default 'present' check (status in ('present','absent')),
  checked_in_at     timestamptz default now(),
  latitude          double precision not null,
  longitude         double precision not null,
  distance_meters    numeric not null,
  marked_by         uuid references auth.users(id), -- null = self check-in; set = coach/admin assist
  created_at        timestamptz not null default now()
);

create index if not exists idx_attendance_academy on public.attendance(academy_id);
create index if not exists idx_attendance_boxer on public.attendance(boxer_profile_id);
create index if not exists idx_attendance_date on public.attendance(session_date);

create table if not exists public.leave_applications (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id),
  boxer_profile_id  uuid not null references public.boxer_profiles(id) on delete cascade,
  start_date        date not null,
  end_date          date not null, -- single-day = equal to start_date
  reason            text not null,
  status            text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by       uuid references auth.users(id),
  reviewed_at       timestamptz,
  rejection_reason  text,
  created_at        timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_leave_applications_academy on public.leave_applications(academy_id);
create index if not exists idx_leave_applications_boxer on public.leave_applications(boxer_profile_id);

create table if not exists public.attendance_polls (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id),
  ring_session_id uuid, -- FK added after ring_sessions exists
  sent_by      uuid references auth.users(id),
  sent_at      timestamptz not null default now()
);

create table if not exists public.attendance_poll_responses (
  id                uuid primary key default gen_random_uuid(),
  poll_id           uuid not null references public.attendance_polls(id) on delete cascade,
  boxer_profile_id  uuid not null references public.boxer_profiles(id) on delete cascade,
  response          text not null check (response in ('attending','not_attending')),
  reason            text,
  responded_at      timestamptz not null default now(),
  unique (poll_id, boxer_profile_id)
);

-- ============================================================================
-- 6. SCHEDULING — RINGS (§3.5)
-- ============================================================================

create table if not exists public.academy_rings (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid references public.academies(id), -- null = BOXOS default template
  name             text not null,
  address          text,
  latitude         double precision,
  longitude        double precision,
  geofence_meters  integer not null default 200,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create index if not exists idx_academy_rings_academy on public.academy_rings(academy_id);

create table if not exists public.ring_schedule_templates (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid references public.academies(id),
  name             text not null,
  template_type    text not null check (template_type in ('training','tournament')),
  days_of_week     integer[] not null default '{}', -- 0=Sunday .. 6=Saturday
  valid_from       date not null,
  valid_to         date not null,
  is_active        boolean not null default true,
  status           text not null default 'scheduled'
                      check (status in ('scheduled','in_progress','completed','cancelled')),
  host_academy_id  uuid references public.academies(id),
  is_multi_academy boolean not null default false,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (valid_to >= valid_from)
);

create index if not exists idx_ring_schedule_templates_academy on public.ring_schedule_templates(academy_id);
create trigger trg_ring_schedule_templates_updated_at before update on public.ring_schedule_templates
  for each row execute function public.set_updated_at();

-- external_judge_invites / profiles reference a tournament template — add FKs now.
alter table public.profiles
  add constraint fk_profiles_judge_scope_tournament
  foreign key (judge_scope_tournament_id) references public.ring_schedule_templates(id);

create table if not exists public.ring_sessions (
  id                  uuid primary key default gen_random_uuid(),
  template_id         uuid not null references public.ring_schedule_templates(id) on delete cascade,
  ring_id             uuid references public.academy_rings(id),
  name                text not null,
  from_time           time not null,
  to_time             time not null,
  custom_location     text,
  custom_lat          double precision,
  custom_lng          double precision,
  age_category_id     uuid references public.age_categories(id),
  weight_category_id  uuid references public.weight_categories(id),
  academy_filter_id   uuid references public.academies(id), -- for multi-academy templates
  assigned_boxer_ids  uuid[] not null default '{}',
  created_at          timestamptz not null default now(),
  check (to_time > from_time)
);

create index if not exists idx_ring_sessions_template on public.ring_sessions(template_id);
create index if not exists idx_ring_sessions_ring on public.ring_sessions(ring_id);

alter table public.attendance
  add constraint fk_attendance_ring_session foreign key (ring_session_id) references public.ring_sessions(id);
alter table public.attendance_polls
  add constraint fk_attendance_polls_ring_session foreign key (ring_session_id) references public.ring_sessions(id);

create table if not exists public.ring_instances (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid not null references public.ring_schedule_templates(id) on delete cascade,
  academy_id       uuid references public.academies(id),
  date             date not null,
  instance_type    text not null default 'regular' check (instance_type in ('regular','override')),
  venue_name       text,
  venue_lat        double precision,
  venue_lng        double precision,
  geofence_meters  integer not null default 200,
  is_cancelled     boolean not null default false,
  cancel_reason    text,
  created_at       timestamptz not null default now(),
  unique (template_id, date)
);

create index if not exists idx_ring_instances_template on public.ring_instances(template_id);
create index if not exists idx_ring_instances_date on public.ring_instances(date);

create table if not exists public.ring_instance_overrides (
  id                uuid primary key default gen_random_uuid(),
  ring_instance_id  uuid not null references public.ring_instances(id) on delete cascade,
  ring_session_id   uuid references public.ring_sessions(id),
  location          text,
  lat               double precision,
  lng               double precision,
  from_time         time,
  to_time            time,
  weight_category_id uuid references public.weight_categories(id),
  age_category_id    uuid references public.age_categories(id),
  assigned_boxer_ids uuid[] default '{}',
  reason             text,
  edited_by          uuid references auth.users(id),
  created_at         timestamptz not null default now()
);

create index if not exists idx_ring_instance_overrides_instance on public.ring_instance_overrides(ring_instance_id);

create table if not exists public.ring_assignment_polls (
  id                uuid primary key default gen_random_uuid(),
  ring_instance_id  uuid not null references public.ring_instances(id) on delete cascade,
  sent_by           uuid references auth.users(id),
  sent_at           timestamptz not null default now()
);

create table if not exists public.ring_assignment_poll_responses (
  id                uuid primary key default gen_random_uuid(),
  poll_id           uuid not null references public.ring_assignment_polls(id) on delete cascade,
  boxer_profile_id  uuid not null references public.boxer_profiles(id) on delete cascade,
  response          text not null check (response in ('attending','not_attending')),
  reason            text,
  responded_at      timestamptz not null default now(),
  unique (poll_id, boxer_profile_id)
);

-- ============================================================================
-- 7. BOUTS, ROUNDS, JUDGING (§3.6, §3.7, §6)
-- ============================================================================

create table if not exists public.bouts (
  id                        uuid primary key default gen_random_uuid(),
  ring_instance_id          uuid not null references public.ring_instances(id) on delete cascade,
  ring_session_id           uuid not null references public.ring_sessions(id),
  bout_number               integer,

  boxer_red_id              uuid not null references public.boxer_profiles(id),
  boxer_blue_id             uuid not null references public.boxer_profiles(id),

  age_category_id           uuid not null references public.age_categories(id),
  weight_category_id        uuid not null references public.weight_categories(id),

  round_count                integer not null,
  round_duration_seconds      integer not null,
  rest_duration_seconds        integer not null,

  judge_count                integer not null check (judge_count between 1 and 5),

  bout_kind                  text not null check (bout_kind in ('training','tournament')),

  status                      text not null default 'scheduled' check (status in
                                ('scheduled','weigh_in_confirmed','declaration_pending','ready',
                                 'in_progress','paused','completed','cancelled','walkover')),

  current_round               integer not null default 0,
  current_round_state          text not null default 'pending'
                                  check (current_round_state in ('pending','active','resting','ended')),

  red_declared_weight_kg       numeric,
  blue_declared_weight_kg      numeric,
  weigh_in_confirmed_by        uuid references auth.users(id),
  weigh_in_confirmed_at        timestamptz,

  coach_id                     uuid references public.profiles(id),

  winner_boxer_id               uuid references public.boxer_profiles(id),
  decision_type                  text check (decision_type in
                                    ('WP','RSC','RSC-I','ABD','DSQ','DQB','KO','WO','DKO','BDSQ')),
  decision_detail                jsonb,

  started_at                     timestamptz,
  ended_at                        timestamptz,
  completed_by                     uuid references public.profiles(id),

  created_by                       uuid references auth.users(id),
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),

  -- hard rule #1 (§1.4): boxers must be different people
  check (boxer_red_id <> boxer_blue_id),
  -- hard rule #2 (§1.4): coach mandatory for tournament bouts before leaving 'scheduled'
  check (bout_kind = 'training' or status = 'scheduled' or coach_id is not null)
);

create index if not exists idx_bouts_ring_instance on public.bouts(ring_instance_id);
create index if not exists idx_bouts_ring_session on public.bouts(ring_session_id);
create index if not exists idx_bouts_status on public.bouts(status);
create index if not exists idx_bouts_coach on public.bouts(coach_id);
create index if not exists idx_bouts_red on public.bouts(boxer_red_id);
create index if not exists idx_bouts_blue on public.bouts(boxer_blue_id);

create trigger trg_bouts_updated_at before update on public.bouts
  for each row execute function public.set_updated_at();

-- Hard rule #1 (§1.4): bouts are single-gender — both boxers' gender must
-- match the bout's weight_category's gender. Enforced by trigger (not just a
-- CHECK) because it requires a cross-table lookup.
create or replace function public.enforce_bout_gender_match()
returns trigger
language plpgsql
as $$
declare
  v_wc_gender text;
  v_red_gender text;
  v_blue_gender text;
begin
  select gender into v_wc_gender from public.weight_categories where id = new.weight_category_id;
  select gender into v_red_gender from public.boxer_profiles where id = new.boxer_red_id;
  select gender into v_blue_gender from public.boxer_profiles where id = new.boxer_blue_id;

  -- weight_categories.gender uses men/women/boys/girls; boxer_profiles.gender uses Male/Female/Other
  if (v_wc_gender in ('men','boys') and v_red_gender <> 'Male')
     or (v_wc_gender in ('women','girls') and v_red_gender <> 'Female') then
    raise exception 'boxer_red_id gender does not match weight category gender';
  end if;
  if (v_wc_gender in ('men','boys') and v_blue_gender <> 'Male')
     or (v_wc_gender in ('women','girls') and v_blue_gender <> 'Female') then
    raise exception 'boxer_blue_id gender does not match weight category gender';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_bout_gender_match
  before insert or update of boxer_red_id, boxer_blue_id, weight_category_id on public.bouts
  for each row execute function public.enforce_bout_gender_match();

-- Hard rule #2 (§1.4): both boxers must fall inside the weight category's
-- declared range at confirmed weigh-in.
create or replace function public.enforce_weigh_in_range()
returns trigger
language plpgsql
as $$
declare
  v_min numeric; v_max numeric;
begin
  if new.weigh_in_confirmed_at is not null and
     (old.weigh_in_confirmed_at is null or old.weigh_in_confirmed_at is distinct from new.weigh_in_confirmed_at) then
    select min_kg, max_kg into v_min, v_max from public.weight_categories where id = new.weight_category_id;
    if new.red_declared_weight_kg is null or new.blue_declared_weight_kg is null then
      raise exception 'both boxers'' declared weights are required to confirm weigh-in';
    end if;
    if new.red_declared_weight_kg < v_min or (v_max is not null and new.red_declared_weight_kg > v_max) then
      raise exception 'red corner declared weight is outside the weight category range';
    end if;
    if new.blue_declared_weight_kg < v_min or (v_max is not null and new.blue_declared_weight_kg > v_max) then
      raise exception 'blue corner declared weight is outside the weight category range';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_weigh_in_range
  before update of weigh_in_confirmed_at on public.bouts
  for each row execute function public.enforce_weigh_in_range();

-- Boxer eligibility guard (§3.7, §8): suspended boxers can never be assigned
-- as a bout participant.
create or replace function public.enforce_no_suspended_boxer_in_bout()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.boxer_profiles where id in (new.boxer_red_id, new.boxer_blue_id) and is_suspended) then
    raise exception 'a suspended boxer cannot be assigned to a bout';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_no_suspended_boxer_in_bout
  before insert or update of boxer_red_id, boxer_blue_id on public.bouts
  for each row execute function public.enforce_no_suspended_boxer_in_bout();

create table if not exists public.bout_rounds (
  id              uuid primary key default gen_random_uuid(),
  bout_id         uuid not null references public.bouts(id) on delete cascade,
  round_number    integer not null,
  started_at      timestamptz,
  paused_at       timestamptz,
  resumed_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz not null default now(),
  unique (bout_id, round_number)
);

create index if not exists idx_bout_rounds_bout on public.bout_rounds(bout_id);

create table if not exists public.bout_events (
  id             uuid primary key default gen_random_uuid(),
  bout_id        uuid not null references public.bouts(id) on delete cascade,
  round_number   integer,
  event_type     text not null check (event_type in
                    ('knockdown','warning','foul','low_blow','injury_timeout')),
  target_boxer_id uuid references public.boxer_profiles(id), -- red/blue
  description    text,
  logged_by      uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create index if not exists idx_bout_events_bout on public.bout_events(bout_id);

create table if not exists public.bout_judge_assignments (
  id            uuid primary key default gen_random_uuid(),
  bout_id       uuid not null references public.bouts(id) on delete cascade,
  judge_profile_id uuid not null references public.profiles(id),
  judge_role    text not null default 'judge' check (judge_role in ('judge','coach_judge')),
  assigned_by   uuid references auth.users(id),
  assigned_at   timestamptz not null default now(),
  unique (bout_id, judge_profile_id)
);

create index if not exists idx_bout_judge_assignments_bout on public.bout_judge_assignments(bout_id);
create index if not exists idx_bout_judge_assignments_judge on public.bout_judge_assignments(judge_profile_id);

create table if not exists public.bout_round_scores (
  id               uuid primary key default gen_random_uuid(),
  bout_id          uuid not null references public.bouts(id) on delete cascade,
  round_number     integer not null,
  judge_profile_id uuid not null references public.profiles(id),
  red_score        integer not null check (red_score between 6 and 10),
  blue_score       integer not null check (blue_score between 6 and 10),
  submitted_at     timestamptz not null default now(),
  unique (bout_id, round_number, judge_profile_id)
);

create index if not exists idx_bout_round_scores_bout on public.bout_round_scores(bout_id);

create table if not exists public.bout_judge_totals (
  id               uuid primary key default gen_random_uuid(),
  bout_id          uuid not null references public.bouts(id) on delete cascade,
  judge_profile_id uuid not null references public.profiles(id),
  red_total        integer not null,
  blue_total       integer not null,
  winner_boxer_id  uuid references public.boxer_profiles(id),
  tie_broken_by    uuid references auth.users(id),
  computed_at      timestamptz not null default now(),
  unique (bout_id, judge_profile_id)
);

create index if not exists idx_bout_judge_totals_bout on public.bout_judge_totals(bout_id);

create table if not exists public.boxer_bout_history (
  id               uuid primary key default gen_random_uuid(),
  bout_id          uuid not null references public.bouts(id) on delete cascade,
  boxer_profile_id uuid not null references public.boxer_profiles(id) on delete cascade,
  opponent_id      uuid references public.boxer_profiles(id),
  result           text not null check (result in ('win','loss','draw','no_contest')),
  decision_type    text,
  created_at       timestamptz not null default now(),
  unique (bout_id, boxer_profile_id)
);

create index if not exists idx_boxer_bout_history_boxer on public.boxer_bout_history(boxer_profile_id);

-- Bout completion (§6.5): write boxer_bout_history rows + bump record_* atomically.
create or replace function public.on_bout_completed()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then

    insert into public.boxer_bout_history (bout_id, boxer_profile_id, opponent_id, result, decision_type)
    values
      (new.id, new.boxer_red_id, new.boxer_blue_id,
        case when new.winner_boxer_id = new.boxer_red_id then 'win'
             when new.winner_boxer_id is null then 'draw'
             else 'loss' end,
        new.decision_type),
      (new.id, new.boxer_blue_id, new.boxer_red_id,
        case when new.winner_boxer_id = new.boxer_blue_id then 'win'
             when new.winner_boxer_id is null then 'draw'
             else 'loss' end,
        new.decision_type)
    on conflict (bout_id, boxer_profile_id) do nothing;

    if new.winner_boxer_id is not null then
      update public.boxer_profiles set record_wins = record_wins + 1, updated_at = now()
        where id = new.winner_boxer_id;
      update public.boxer_profiles set record_losses = record_losses + 1, updated_at = now()
        where id in (new.boxer_red_id, new.boxer_blue_id) and id <> new.winner_boxer_id;
      if new.decision_type = 'KO' then
        update public.boxer_profiles set record_kos = record_kos + 1, updated_at = now()
          where id = new.winner_boxer_id;
      end if;
    else
      update public.boxer_profiles set record_draws = record_draws + 1, updated_at = now()
        where id in (new.boxer_red_id, new.boxer_blue_id);
    end if;

  end if;
  return new;
end;
$$;

create trigger trg_on_bout_completed
  after update of status on public.bouts
  for each row execute function public.on_bout_completed();

-- ============================================================================
-- 8. EXTERNAL JUDGE TEMPORARY ACCESS (§3.8, §7)
-- ============================================================================

create table if not exists public.external_judge_invites (
  id                     uuid primary key default gen_random_uuid(),
  tournament_template_id uuid not null references public.ring_schedule_templates(id) on delete cascade,
  academy_id             uuid not null references public.academies(id),
  email                  text not null,
  full_name              text,
  profile_id             uuid references public.profiles(id),
  status                 text not null default 'pending' check (status in ('pending','active','expired','revoked')),
  invited_by             uuid references auth.users(id),
  invited_at             timestamptz not null default now(),
  activated_at           timestamptz,
  expires_at             timestamptz,
  revoked_by             uuid references auth.users(id),
  revoked_at             timestamptz
);

create index if not exists idx_external_judge_invites_tournament on public.external_judge_invites(tournament_template_id);
create index if not exists idx_external_judge_invites_academy on public.external_judge_invites(academy_id);

-- Tournament auto-completion (§7 step 5): when every bout under a
-- tournament template reaches a terminal state, flip the template to
-- 'completed' and cascade-expire judge invites/profiles. Actual auth-session
-- revocation (Admin API) still must happen in an Edge Function listening for
-- this state change (e.g. via a `template_completed` row insert/Realtime).
create or replace function public.check_tournament_auto_completion()
returns trigger
language plpgsql
as $$
declare
  v_template_id uuid;
  v_open_count integer;
begin
  v_template_id := (select template_id from public.ring_sessions where id = new.ring_session_id);

  select count(*) into v_open_count
    from public.bouts b
    join public.ring_sessions rs on rs.id = b.ring_session_id
    where rs.template_id = v_template_id
      and b.status not in ('completed','cancelled','walkover');

  if v_open_count = 0 then
    update public.ring_schedule_templates
      set status = 'completed', updated_at = now()
      where id = v_template_id and template_type = 'tournament' and status <> 'completed';

    update public.external_judge_invites
      set status = 'expired', expires_at = now()
      where tournament_template_id = v_template_id and status = 'active';

    update public.profiles
      set is_active = false, access_expires_at = now()
      where judge_scope_tournament_id = v_template_id and role = 'external_judge';
  end if;

  return new;
end;
$$;

create trigger trg_check_tournament_auto_completion
  after update of status on public.bouts
  for each row
  when (new.status in ('completed','cancelled','walkover'))
  execute function public.check_tournament_auto_completion();

-- ============================================================================
-- 9. COACH RING ASSIGNMENT (§3.9)
-- ============================================================================

create table if not exists public.coach_ring_assignments (
  id                uuid primary key default gen_random_uuid(),
  coach_profile_id  uuid not null references public.profiles(id),
  ring_instance_id  uuid not null references public.ring_instances(id) on delete cascade,
  ring_session_id   uuid not null references public.ring_sessions(id),
  date              date not null,
  assigned_by       uuid references auth.users(id),
  assigned_at       timestamptz not null default now()
);

create index if not exists idx_coach_ring_assignments_coach on public.coach_ring_assignments(coach_profile_id);
create index if not exists idx_coach_ring_assignments_instance on public.coach_ring_assignments(ring_instance_id);

-- ============================================================================
-- 10. SESSION FEEDBACK (§3.10)
-- ============================================================================

create table if not exists public.session_feedback (
  id                uuid primary key default gen_random_uuid(),
  boxer_profile_id  uuid not null references public.boxer_profiles(id) on delete cascade,
  attendance_id     uuid references public.attendance(id),
  bout_id           uuid references public.bouts(id),
  rpe_score         integer not null check (rpe_score between 0 and 10),
  comment           text,
  submitted_at      timestamptz not null default now(),
  check (attendance_id is not null or bout_id is not null)
);

create index if not exists idx_session_feedback_boxer on public.session_feedback(boxer_profile_id);

-- ============================================================================
-- 11. PHYSICAL FITNESS PROFILE (§3.11)
-- ============================================================================

create table if not exists public.fitness_test_types (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid references public.academies(id), -- null = BOXOS default catalog
  name         text not null,
  unit         text not null,
  description  text,
  is_active    boolean not null default true,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create index if not exists idx_fitness_test_types_academy on public.fitness_test_types(academy_id);

create table if not exists public.fitness_test_records (
  id                uuid primary key default gen_random_uuid(),
  boxer_profile_id  uuid not null references public.boxer_profiles(id) on delete cascade,
  test_type_id      uuid not null references public.fitness_test_types(id),
  value             numeric not null,
  unit_snapshot     text not null,
  recorded_date     date not null,
  recorded_by       uuid references auth.users(id),
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_fitness_test_records_boxer on public.fitness_test_records(boxer_profile_id);
create index if not exists idx_fitness_test_records_type on public.fitness_test_records(test_type_id);

-- ============================================================================
-- 12. PREGNANCY DECLARATION (§3.12, §9)
-- ============================================================================

create table if not exists public.pregnancy_declarations (
  id                 uuid primary key default gen_random_uuid(),
  boxer_profile_id   uuid not null references public.boxer_profiles(id) on delete cascade,
  ring_instance_id   uuid not null references public.ring_instances(id) on delete cascade,
  ring_session_id    uuid not null references public.ring_sessions(id),
  bout_id            uuid references public.bouts(id),
  status             text not null default 'pending_window'
                        check (status in ('pending_window','open','submitted','missed')),
  window_opens_at    timestamptz not null,
  submitted_at       timestamptz,
  submitted_by       uuid references public.profiles(id), -- always her own profile id
  created_at         timestamptz not null default now(),
  unique (boxer_profile_id, ring_instance_id, ring_session_id)
);

create index if not exists idx_pregnancy_declarations_boxer on public.pregnancy_declarations(boxer_profile_id);
create index if not exists idx_pregnancy_declarations_status on public.pregnancy_declarations(status);
create index if not exists idx_pregnancy_declarations_session on public.pregnancy_declarations(ring_instance_id, ring_session_id);

-- Auto-create a declaration row at assignment time (§9.1 step 1) for every
-- non-minor female boxer added to a ring_session's roster. Fires on both
-- assigned_boxer_ids edits and initial insert.
create or replace function public.create_pregnancy_declarations_for_roster()
returns trigger
language plpgsql
as $$
declare
  v_boxer_id uuid;
  v_from_time time;
  v_instance record;
begin
  select from_time into v_from_time from public.ring_sessions where id = new.id;

  for v_boxer_id in
    select unnest(new.assigned_boxer_ids)
    except
    select unnest(coalesce(old.assigned_boxer_ids, '{}'))
  loop
    if exists (
      select 1 from public.boxer_profiles
      where id = v_boxer_id and gender = 'Female' and is_minor = false
    ) then
      for v_instance in
        select id, date from public.ring_instances where template_id = new.template_id
      loop
        insert into public.pregnancy_declarations
          (boxer_profile_id, ring_instance_id, ring_session_id, window_opens_at)
        values
          (v_boxer_id, v_instance.id, new.id,
           (v_instance.date + v_from_time)::timestamptz - interval '24 hours')
        on conflict (boxer_profile_id, ring_instance_id, ring_session_id) do nothing;
      end loop;
    end if;
  end loop;
  return new;
end;
$$;

create trigger trg_create_pregnancy_declarations_for_roster
  after insert or update of assigned_boxer_ids on public.ring_sessions
  for each row execute function public.create_pregnancy_declarations_for_roster();

-- Same mechanic when a female boxer is placed as boxer_red_id/boxer_blue_id
-- on a bout (§9: "covers both a training slot and a tournament bout").
create or replace function public.create_pregnancy_declaration_for_bout()
returns trigger
language plpgsql
as $$
declare
  v_boxer_id uuid;
  v_instance_date date;
  v_from_time time;
begin
  select date into v_instance_date from public.ring_instances where id = new.ring_instance_id;
  select from_time into v_from_time from public.ring_sessions where id = new.ring_session_id;

  foreach v_boxer_id in array array[new.boxer_red_id, new.boxer_blue_id]
  loop
    if exists (
      select 1 from public.boxer_profiles
      where id = v_boxer_id and gender = 'Female' and is_minor = false
    ) then
      insert into public.pregnancy_declarations
        (boxer_profile_id, ring_instance_id, ring_session_id, bout_id, window_opens_at)
      values
        (v_boxer_id, new.ring_instance_id, new.ring_session_id, new.id,
         (v_instance_date + v_from_time)::timestamptz - interval '24 hours')
      on conflict (boxer_profile_id, ring_instance_id, ring_session_id)
      do update set bout_id = excluded.bout_id;
    end if;
  end loop;
  return new;
end;
$$;

create trigger trg_create_pregnancy_declaration_for_bout
  after insert or update of boxer_red_id, boxer_blue_id on public.bouts
  for each row execute function public.create_pregnancy_declaration_for_bout();

-- NOTE (cron/Edge Function required — not pure SQL):
--   - Flip status 'pending_window' -> 'open' when now() >= window_opens_at.
--     Example pg_cron job (run every 5 min):
--       select cron.schedule('pregnancy_declaration_open_sweep', '*/5 * * * *',
--         $$ update public.pregnancy_declarations
--            set status = 'open'
--            where status = 'pending_window' and window_opens_at <= now(); $$);
--   - T-minus-1-hour coach-alert sweep + 'missed' flip at session start also
--     need a scheduled job (compute session start = ring_instances.date +
--     ring_sessions.from_time) paired with a notification insert (see §13).

-- ============================================================================
-- 13. NOTIFICATIONS (inferred — screens.md shows a Notifications tab on every
--     role; architecture.md does not define explicit columns for it)
-- ============================================================================

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid references public.academies(id),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type         text not null, -- e.g. 'pregnancy_declaration_upcoming', 'pregnancy_declaration_open',
                                -- 'pregnancy_declaration_pending_alert', 'boxer_suspended_reassign_needed', ...
  title        text not null,
  body         text,
  data         jsonb,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists idx_notifications_recipient on public.notifications(recipient_id, is_read);

-- ============================================================================
-- 14. MEDICAL SUSPENSION CASCADE (§8)
-- ============================================================================

-- On suspend, remove the boxer from any FUTURE ring_session roster / bout
-- that falls inside the suspension window, and notify the academy's admins.
create or replace function public.cascade_boxer_suspension()
returns trigger
language plpgsql
as $$
declare
  v_admin record;
begin
  if new.is_suspended = true and (old.is_suspended is distinct from true) then

    -- vacate future ring_session rosters
    update public.ring_sessions rs
      set assigned_boxer_ids = array_remove(rs.assigned_boxer_ids, new.id)
      from public.ring_instances ri
      where ri.template_id = rs.template_id
        and ri.date >= coalesce(new.suspension_start_date, current_date)
        and (new.suspension_end_date is null or ri.date <= new.suspension_end_date)
        and new.id = any(rs.assigned_boxer_ids);

    -- cancel future bouts involving the boxer (defensive; UI should already
    -- have excluded them from pickers going forward)
    update public.bouts b
      set status = 'cancelled'
      from public.ring_instances ri
      where b.ring_instance_id = ri.id
        and (b.boxer_red_id = new.id or b.boxer_blue_id = new.id)
        and b.status in ('scheduled','weigh_in_confirmed')
        and ri.date >= coalesce(new.suspension_start_date, current_date)
        and (new.suspension_end_date is null or ri.date <= new.suspension_end_date);

    -- notify academy admins/superadmins
    for v_admin in
      select id from public.profiles
      where academy_id = new.academy_id and role in ('admin','superadmin')
    loop
      insert into public.notifications (academy_id, recipient_id, type, title, body)
      values (new.academy_id, v_admin.id, 'boxer_suspended_reassign_needed',
              'Roster slot needs reassignment',
              new.full_name || ' was suspended and removed from upcoming ring/bout assignments.');
    end loop;

  end if;
  return new;
end;
$$;

create trigger trg_cascade_boxer_suspension
  after update of is_suspended on public.boxer_profiles
  for each row execute function public.cascade_boxer_suspension();

-- ============================================================================
-- 15. ROW LEVEL SECURITY
-- ============================================================================

alter table public.academies enable row level security;
alter table public.academy_lifecycle_events enable row level security;
alter table public.profiles enable row level security;
alter table public.age_categories enable row level security;
alter table public.weight_categories enable row level security;
alter table public.boxer_profiles enable row level security;
alter table public.guardian_details enable row level security;
alter table public.fee_plans enable row level security;
alter table public.fee_assignments enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.coupons enable row level security;
alter table public.discount_schemes enable row level security;
alter table public.discount_applications enable row level security;
alter table public.academy_codes enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_applications enable row level security;
alter table public.attendance_polls enable row level security;
alter table public.attendance_poll_responses enable row level security;
alter table public.academy_rings enable row level security;
alter table public.ring_schedule_templates enable row level security;
alter table public.ring_sessions enable row level security;
alter table public.ring_instances enable row level security;
alter table public.ring_instance_overrides enable row level security;
alter table public.ring_assignment_polls enable row level security;
alter table public.ring_assignment_poll_responses enable row level security;
alter table public.bouts enable row level security;
alter table public.bout_rounds enable row level security;
alter table public.bout_events enable row level security;
alter table public.bout_judge_assignments enable row level security;
alter table public.bout_round_scores enable row level security;
alter table public.bout_judge_totals enable row level security;
alter table public.boxer_bout_history enable row level security;
alter table public.external_judge_invites enable row level security;
alter table public.coach_ring_assignments enable row level security;
alter table public.session_feedback enable row level security;
alter table public.fitness_test_types enable row level security;
alter table public.fitness_test_records enable row level security;
alter table public.pregnancy_declarations enable row level security;
alter table public.notifications enable row level security;

-- --- academies ---------------------------------------------------------
create policy academies_boxos_all on public.academies for all
  using (public.auth_role() = 'boxos_admin') with check (public.auth_role() = 'boxos_admin');

create policy academies_own_read on public.academies for select
  using (id = public.auth_academy_id());

-- --- academy_lifecycle_events -------------------------------------------
create policy lifecycle_boxos_all on public.academy_lifecycle_events for all
  using (public.auth_role() = 'boxos_admin') with check (public.auth_role() = 'boxos_admin');

-- --- profiles ------------------------------------------------------------
create policy profiles_self_read on public.profiles for select
  using (id = auth.uid());

create policy profiles_self_update on public.profiles for update
  using (id = auth.uid());

create policy profiles_academy_staff_read on public.profiles for select
  using (
    academy_id = public.auth_academy_id()
    and public.auth_role() in ('superadmin','admin','coach')
  );

create policy profiles_boxos_all on public.profiles for all
  using (public.auth_role() = 'boxos_admin') with check (public.auth_role() = 'boxos_admin');

create policy profiles_superadmin_manage_staff on public.profiles for all
  using (academy_id = public.auth_academy_id() and public.auth_role() = 'superadmin')
  with check (academy_id = public.auth_academy_id() and public.auth_role() = 'superadmin');

-- --- categories (global rows visible to all; academy rows scoped) --------
create policy age_categories_read on public.age_categories for select
  using (academy_id is null or academy_id = public.auth_academy_id());
create policy age_categories_write on public.age_categories for all
  using (
    (academy_id is null and public.auth_role() = 'boxos_admin')
    or (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  )
  with check (
    (academy_id is null and public.auth_role() = 'boxos_admin')
    or (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  );

create policy weight_categories_read on public.weight_categories for select
  using (academy_id is null or academy_id = public.auth_academy_id());
create policy weight_categories_write on public.weight_categories for all
  using (
    (academy_id is null and public.auth_role() = 'boxos_admin')
    or (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  )
  with check (
    (academy_id is null and public.auth_role() = 'boxos_admin')
    or (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  );

-- --- boxer_profiles --------------------------------------------------------
create policy boxer_profiles_own on public.boxer_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy boxer_profiles_academy_staff on public.boxer_profiles for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));

create policy boxer_profiles_coach_read on public.boxer_profiles for select
  using (
    public.auth_role() = 'coach'
    and academy_id = public.auth_academy_id()
  );

create policy boxer_profiles_judge_read on public.boxer_profiles for select
  using (
    public.auth_role() = 'external_judge'
    and id in (
      select boxer_red_id from public.bouts b
        join public.bout_judge_assignments ja on ja.bout_id = b.id
        where ja.judge_profile_id = auth.uid()
      union
      select boxer_blue_id from public.bouts b
        join public.bout_judge_assignments ja on ja.bout_id = b.id
        where ja.judge_profile_id = auth.uid()
    )
  );

-- --- guardian_details --------------------------------------------------
create policy guardian_details_owner on public.guardian_details for all
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()))
  with check (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));

create policy guardian_details_academy_staff on public.guardian_details for all
  using (
    boxer_profile_id in (
      select id from public.boxer_profiles
      where academy_id = public.auth_academy_id()
    ) and public.auth_role() in ('superadmin','admin')
  );

-- --- generic "academy-scoped, staff read/write, athlete own read" pattern ---
-- fee_plans / fee_assignments / invoices / payments / coupons / discount_schemes /
-- discount_applications / attendance / leave_applications / academy_codes

create policy fee_plans_staff on public.fee_plans for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));
create policy fee_plans_athlete_read on public.fee_plans for select
  using (academy_id = public.auth_academy_id() and public.auth_role() = 'athlete');

create policy fee_assignments_staff on public.fee_assignments for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));
create policy fee_assignments_own on public.fee_assignments for select
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));

create policy invoices_staff on public.invoices for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));
create policy invoices_own on public.invoices for select
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));

create policy payments_staff on public.payments for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));
create policy payments_own on public.payments for select
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));
create policy payments_own_insert on public.payments for insert
  with check (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));

create policy coupons_staff on public.coupons for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));
create policy coupons_athlete_read on public.coupons for select
  using (academy_id = public.auth_academy_id() and public.auth_role() = 'athlete');

create policy discount_schemes_staff on public.discount_schemes for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));

create policy discount_applications_staff on public.discount_applications for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));
create policy discount_applications_own on public.discount_applications for select
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));

create policy academy_codes_staff on public.academy_codes for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));
-- academy-code lookup at signup happens via a service-role Edge Function, not
-- client-side RLS, since the signer has no academy_id yet.

create policy attendance_staff on public.attendance for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));
create policy attendance_coach_read on public.attendance for select
  using (public.auth_role() = 'coach' and academy_id = public.auth_academy_id());
create policy attendance_own on public.attendance for all
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()))
  with check (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));

create policy leave_applications_staff on public.leave_applications for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));
create policy leave_applications_own on public.leave_applications for all
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()))
  with check (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));

create policy attendance_polls_staff on public.attendance_polls for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));
create policy attendance_poll_responses_own on public.attendance_poll_responses for all
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()))
  with check (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));

-- --- scheduling ------------------------------------------------------------
create policy academy_rings_read on public.academy_rings for select
  using (academy_id is null or academy_id = public.auth_academy_id());
create policy academy_rings_staff on public.academy_rings for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));

create policy ring_schedule_templates_read on public.ring_schedule_templates for select
  using (academy_id is null or academy_id = public.auth_academy_id());
create policy ring_schedule_templates_staff on public.ring_schedule_templates for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));

create policy ring_sessions_read on public.ring_sessions for select
  using (
    template_id in (
      select id from public.ring_schedule_templates
      where academy_id is null or academy_id = public.auth_academy_id()
    )
  );
create policy ring_sessions_staff on public.ring_sessions for all
  using (
    template_id in (
      select id from public.ring_schedule_templates
      where academy_id = public.auth_academy_id()
    ) and public.auth_role() in ('superadmin','admin')
  )
  with check (
    template_id in (
      select id from public.ring_schedule_templates
      where academy_id = public.auth_academy_id()
    ) and public.auth_role() in ('superadmin','admin')
  );

create policy ring_instances_read on public.ring_instances for select
  using (academy_id is null or academy_id = public.auth_academy_id());
create policy ring_instances_staff on public.ring_instances for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));

create policy ring_instance_overrides_staff on public.ring_instance_overrides for all
  using (
    ring_instance_id in (select id from public.ring_instances where academy_id = public.auth_academy_id())
    and public.auth_role() in ('superadmin','admin','coach')
  )
  with check (
    ring_instance_id in (select id from public.ring_instances where academy_id = public.auth_academy_id())
    and public.auth_role() in ('superadmin','admin','coach')
  );

create policy ring_assignment_polls_staff on public.ring_assignment_polls for all
  using (
    ring_instance_id in (select id from public.ring_instances where academy_id = public.auth_academy_id())
    and public.auth_role() in ('superadmin','admin')
  );
create policy ring_assignment_poll_responses_own on public.ring_assignment_poll_responses for all
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()))
  with check (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));

-- --- bouts & judging ---------------------------------------------------
create policy bouts_staff on public.bouts for all
  using (
    weight_category_id in (
      select id from public.weight_categories where academy_id = public.auth_academy_id() or academy_id is null
    )
    and ring_instance_id in (select id from public.ring_instances where academy_id = public.auth_academy_id())
    and public.auth_role() in ('superadmin','admin')
  )
  with check (
    ring_instance_id in (select id from public.ring_instances where academy_id = public.auth_academy_id())
    and public.auth_role() in ('superadmin','admin')
  );

create policy bouts_coach on public.bouts for all
  using (
    public.auth_role() = 'coach'
    and (coach_id = auth.uid() or ring_instance_id in (
      select ri.id from public.ring_instances ri
        join public.coach_ring_assignments cra on cra.ring_instance_id = ri.id
        where cra.coach_profile_id = auth.uid()
    ))
  )
  with check (
    public.auth_role() = 'coach' and coach_id = auth.uid()
  );

create policy bouts_athlete_read on public.bouts for select
  using (
    public.auth_role() = 'athlete'
    and (boxer_red_id in (select id from public.boxer_profiles where user_id = auth.uid())
      or boxer_blue_id in (select id from public.boxer_profiles where user_id = auth.uid()))
  );

create policy bouts_judge_read on public.bouts for select
  using (
    public.auth_role() = 'external_judge'
    and id in (select bout_id from public.bout_judge_assignments where judge_profile_id = auth.uid())
  );

-- visible to: academy staff (own academy), the assigned coach, the two
-- boxers in the bout, and any judge assigned to the bout.
create policy bout_rounds_visible on public.bout_rounds for select
  using (
    bout_id in (
      select b.id from public.bouts b
        join public.ring_instances ri on ri.id = b.ring_instance_id
      where ri.academy_id = public.auth_academy_id()
         or b.coach_id = auth.uid()
         or b.boxer_red_id in (select id from public.boxer_profiles where user_id = auth.uid())
         or b.boxer_blue_id in (select id from public.boxer_profiles where user_id = auth.uid())
         or b.id in (select bout_id from public.bout_judge_assignments where judge_profile_id = auth.uid())
    )
  );
create policy bout_rounds_coach_write on public.bout_rounds for all
  using (bout_id in (select id from public.bouts where coach_id = auth.uid()))
  with check (bout_id in (select id from public.bouts where coach_id = auth.uid()));

create policy bout_events_read on public.bout_events for select
  using (
    bout_id in (
      select b.id from public.bouts b
        join public.ring_instances ri on ri.id = b.ring_instance_id
      where ri.academy_id = public.auth_academy_id()
         or b.coach_id = auth.uid()
         or b.boxer_red_id in (select id from public.boxer_profiles where user_id = auth.uid())
         or b.boxer_blue_id in (select id from public.boxer_profiles where user_id = auth.uid())
         or b.id in (select bout_id from public.bout_judge_assignments where judge_profile_id = auth.uid())
    )
  );
create policy bout_events_coach_write on public.bout_events for all
  using (bout_id in (select id from public.bouts where coach_id = auth.uid()))
  with check (bout_id in (select id from public.bouts where coach_id = auth.uid()));

create policy bout_judge_assignments_staff on public.bout_judge_assignments for all
  using (
    bout_id in (
      select b.id from public.bouts b
        join public.ring_instances ri on ri.id = b.ring_instance_id
        where ri.academy_id = public.auth_academy_id()
    ) and public.auth_role() in ('superadmin','admin')
  );
create policy bout_judge_assignments_own_read on public.bout_judge_assignments for select
  using (judge_profile_id = auth.uid());

create policy bout_round_scores_judge on public.bout_round_scores for all
  using (judge_profile_id = auth.uid())
  with check (judge_profile_id = auth.uid());
create policy bout_round_scores_staff_read on public.bout_round_scores for select
  using (
    bout_id in (
      select b.id from public.bouts b
        join public.ring_instances ri on ri.id = b.ring_instance_id
        where ri.academy_id = public.auth_academy_id()
    ) and public.auth_role() in ('superadmin','admin','coach')
  );

create policy bout_judge_totals_read on public.bout_judge_totals for select
  using (
    bout_id in (
      select b.id from public.bouts b
        join public.ring_instances ri on ri.id = b.ring_instance_id
        where ri.academy_id = public.auth_academy_id()
    )
  );

create policy boxer_bout_history_read on public.boxer_bout_history for select
  using (
    boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid())
    or boxer_profile_id in (select id from public.boxer_profiles where academy_id = public.auth_academy_id())
  );

-- --- external_judge_invites ----------------------------------------------
create policy external_judge_invites_staff on public.external_judge_invites for all
  using (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  with check (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'));
create policy external_judge_invites_self_read on public.external_judge_invites for select
  using (profile_id = auth.uid());

-- --- coach_ring_assignments -------------------------------------------
create policy coach_ring_assignments_staff on public.coach_ring_assignments for all
  using (
    ring_instance_id in (select id from public.ring_instances where academy_id = public.auth_academy_id())
    and public.auth_role() in ('superadmin','admin')
  );
create policy coach_ring_assignments_own_read on public.coach_ring_assignments for select
  using (coach_profile_id = auth.uid());

-- --- session_feedback --------------------------------------------------
create policy session_feedback_own on public.session_feedback for all
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()))
  with check (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));
create policy session_feedback_staff_read on public.session_feedback for select
  using (
    boxer_profile_id in (select id from public.boxer_profiles where academy_id = public.auth_academy_id())
    and public.auth_role() in ('superadmin','admin','coach')
  );

-- --- fitness catalog & records ------------------------------------------
create policy fitness_test_types_read on public.fitness_test_types for select
  using (academy_id is null or academy_id = public.auth_academy_id());
create policy fitness_test_types_write on public.fitness_test_types for all
  using (
    (academy_id is null and public.auth_role() = 'boxos_admin')
    or (academy_id = public.auth_academy_id() and public.auth_role() in ('superadmin','admin'))
  );

create policy fitness_test_records_own on public.fitness_test_records for all
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()))
  with check (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));
create policy fitness_test_records_staff on public.fitness_test_records for all
  using (
    boxer_profile_id in (select id from public.boxer_profiles where academy_id = public.auth_academy_id())
    and public.auth_role() in ('superadmin','admin','coach')
  )
  with check (
    boxer_profile_id in (select id from public.boxer_profiles where academy_id = public.auth_academy_id())
    and public.auth_role() in ('superadmin','admin','coach')
  );

-- --- pregnancy_declarations (§9.2 privacy: status only for staff) --------
create policy pregnancy_declarations_own on public.pregnancy_declarations for all
  using (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()))
  with check (boxer_profile_id in (select id from public.boxer_profiles where user_id = auth.uid()));
create policy pregnancy_declarations_staff_read on public.pregnancy_declarations for select
  using (
    boxer_profile_id in (select id from public.boxer_profiles where academy_id = public.auth_academy_id())
    and public.auth_role() in ('superadmin','admin','coach')
  );

-- --- notifications -------------------------------------------------------
create policy notifications_own on public.notifications for all
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- ============================================================================
-- 16. SEED DATA (optional starting point — global BOXOS defaults)
-- ============================================================================

-- Uncomment / adjust once you're ready to seed global category defaults from
-- the World Boxing rules tables (round timing, weight-category ranges):
--
-- insert into public.age_categories (academy_id, name, min_age, max_age, gender_scope) values
--   (null, 'Youth', 13, 16, 'all'),
--   (null, 'Junior', 17, 18, 'all'),
--   (null, 'Elite', 19, 40, 'all');
--
-- insert into public.fitness_test_types (academy_id, name, unit) values
--   (null, 'Yo-Yo IR Test', 'level'),
--   (null, 'Cooper 12-Minute Run', 'meters'),
--   (null, 'Beep Test', 'level'),
--   (null, 'Vertical Jump', 'cm'),
--   (null, '40m Sprint', 'seconds'),
--   (null, 'Push-up Max', 'reps'),
--   (null, 'Plank Hold', 'seconds');

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
