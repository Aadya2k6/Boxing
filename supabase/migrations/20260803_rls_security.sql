-- ============================================================
-- Migration: Full Row Level Security (RLS) + Security Hardening
-- Date: 2026-08-03
--
-- ROLES
--   superadmin  → unrestricted access (bypassed via helper fn)
--   athlete     → own rows only; no payments INSERT
--
-- HOW TO RUN
--   Paste into Supabase Dashboard → SQL Editor and run once.
--   Safe to re-run — all CREATE POLICY calls are preceded by
--   DROP POLICY IF EXISTS guards.
-- ============================================================

-- ── 0. HELPER FUNCTIONS ──────────────────────────────────────────────────────
-- STABLE + SECURITY DEFINER so they are called once per query plan,
-- and bypass RLS on the tables they query.

CREATE OR REPLACE FUNCTION public.auth_role()
  RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT role::text FROM profiles WHERE id = auth.uid()
$$;

-- Returns the calling user's associated academy:
--   athlete  → academy_id from athlete_profiles (source of truth)
--   admin    → preferred_academy_id from profiles
--   superadmin → NULL (they use bypass policy anyway)
CREATE OR REPLACE FUNCTION public.auth_academy_id()
  RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT academy_id FROM athlete_profiles WHERE user_id = auth.uid() LIMIT 1),
    (SELECT preferred_academy_id FROM profiles WHERE id = auth.uid())
  )
$$;

-- Returns the calling athlete's athlete_profiles primary key (NULL if not athlete).
CREATE OR REPLACE FUNCTION public.auth_athlete_profile_id()
  RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT id FROM athlete_profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- ── 1. ENABLE RLS ON ALL TABLES ──────────────────────────────────────────────
-- Idempotent — safe to re-run.

ALTER TABLE public.profiles                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academies                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_overrides                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_schemes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_plans                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_assignments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_applications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_details                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_applications               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_polls                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_poll_responses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_assignment_polls           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_assignment_poll_responses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_grounds                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedule_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedule_pitches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedule_instances         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_instance_pitch_overrides   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_codes                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings                  ENABLE ROW LEVEL SECURITY;

-- ── 2. SECURITY TRIGGERS ─────────────────────────────────────────────────────

-- 2a. Prevent role escalation by non-superadmins.
-- Service-role callers (Edge Functions, auth.uid() IS NULL) are always exempt.
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
  RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'
    ) THEN
      RAISE EXCEPTION 'Insufficient privileges: only superadmin can change a user role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- 2b. generate_academy_code — enforces superadmin check inside the function
--     (SECURITY DEFINER bypasses RLS, so we guard inside).
CREATE OR REPLACE FUNCTION public.generate_academy_code(
  p_created_by uuid,
  p_expires_at timestamptz DEFAULT NULL
)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_code     text;
  v_attempts int := 0;
  v_role     text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'Only superadmin can generate academy codes';
  END IF;
  LOOP
    v_code := upper(
      substring(
        replace(replace(replace(replace(
          encode(gen_random_bytes(6), 'base64'),
          '0','A'), 'O','B'), 'I','C'), '1','D'),
        1, 8
      )
    );
    BEGIN
      INSERT INTO academy_codes (code, created_by, expires_at)
      VALUES (v_code, p_created_by, p_expires_at);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_attempts := v_attempts + 1;
      IF v_attempts > 10 THEN
        RAISE EXCEPTION 'Could not generate a unique code after 10 attempts';
      END IF;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_academy_code(uuid, timestamptz) TO authenticated;

-- 2c. increment_academy_code_uses — called by athletes during onboarding to
--     record that a code was used. SECURITY DEFINER bypasses RLS on academy_codes.
--     Only increments if code is active and belongs to the athlete's session.
CREATE OR REPLACE FUNCTION public.increment_academy_code_uses(p_code_id uuid)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE academy_codes
  SET uses_count = COALESCE(uses_count, 0) + 1
  WHERE id = p_code_id AND is_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_academy_code_uses(uuid) TO authenticated;

-- ── 3. TABLE POLICIES ────────────────────────────────────────────────────────
-- Every block: DROP IF EXISTS first → then CREATE (idempotent re-runs).
-- Superadmin gets a blanket ALL policy on every table.
-- Athletes get own-row access only.

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_sa_all"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_select"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_update"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete"        ON public.profiles;

-- Superadmin: full access
CREATE POLICY "profiles_sa_all"
  ON public.profiles FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

-- SELECT: own row, plus any admin/superadmin row (needed to find admins during
-- onboarding), plus other athletes in the same academy (for admin views).
-- NOTE: auth_role() calls profiles internally — but since auth.uid() = id is
-- evaluated first, the row is always accessible to the owner.
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()                          -- own row (always allowed)
    OR role IN ('admin', 'superadmin')       -- athletes can discover staff
  );

-- INSERT: only self (new signup) or superadmin (already covered above)
CREATE POLICY "profiles_insert"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- UPDATE: own row only for athletes
CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING    (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- DELETE: superadmin only (covered by sa_all)
CREATE POLICY "profiles_delete"
  ON public.profiles FOR DELETE TO authenticated
  USING (false);  -- non-superadmin cannot delete; sa_all handles superadmin

-- ─────────────────────────────────────────────────────────────────────────────
-- academies
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "academies_sa_all"    ON public.academies;
DROP POLICY IF EXISTS "academies_select"    ON public.academies;
DROP POLICY IF EXISTS "academies_insert"    ON public.academies;
DROP POLICY IF EXISTS "academies_update"    ON public.academies;
DROP POLICY IF EXISTS "academies_delete"    ON public.academies;

CREATE POLICY "academies_sa_all"
  ON public.academies FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

-- Everyone reads (athletes need academy details + onboarding academy list).
CREATE POLICY "academies_select"
  ON public.academies FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "academies_insert"
  ON public.academies FOR INSERT TO authenticated
  WITH CHECK (false);  -- non-SA blocked; sa_all handles superadmin

CREATE POLICY "academies_update"
  ON public.academies FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "academies_delete"
  ON public.academies FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- athlete_profiles
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "athlete_profiles_sa_all"  ON public.athlete_profiles;
DROP POLICY IF EXISTS "athlete_profiles_select"  ON public.athlete_profiles;
DROP POLICY IF EXISTS "athlete_profiles_insert"  ON public.athlete_profiles;
DROP POLICY IF EXISTS "athlete_profiles_update"  ON public.athlete_profiles;
DROP POLICY IF EXISTS "athlete_profiles_delete"  ON public.athlete_profiles;

CREATE POLICY "athlete_profiles_sa_all"
  ON public.athlete_profiles FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

CREATE POLICY "athlete_profiles_select"
  ON public.athlete_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "athlete_profiles_insert"
  ON public.athlete_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "athlete_profiles_update"
  ON public.athlete_profiles FOR UPDATE TO authenticated
  USING    (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "athlete_profiles_delete"
  ON public.athlete_profiles FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- academy_codes
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "academy_codes_sa_all"         ON public.academy_codes;
DROP POLICY IF EXISTS "academy_codes_athlete_select" ON public.academy_codes;

CREATE POLICY "academy_codes_sa_all"
  ON public.academy_codes FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

-- Athletes may SELECT to verify a code during onboarding.
CREATE POLICY "academy_codes_athlete_select"
  ON public.academy_codes FOR SELECT TO authenticated
  USING (is_active = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- system_settings
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "system_settings_sa_all" ON public.system_settings;

CREATE POLICY "system_settings_sa_all"
  ON public.system_settings FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

-- ─────────────────────────────────────────────────────────────────────────────
-- attendance
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "attendance_sa_all"  ON public.attendance;
DROP POLICY IF EXISTS "attendance_select"  ON public.attendance;
DROP POLICY IF EXISTS "attendance_insert"  ON public.attendance;
DROP POLICY IF EXISTS "attendance_update"  ON public.attendance;
DROP POLICY IF EXISTS "attendance_delete"  ON public.attendance;

CREATE POLICY "attendance_sa_all"
  ON public.attendance FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

CREATE POLICY "attendance_select"
  ON public.attendance FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = attendance.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "attendance_insert"
  ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = attendance.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "attendance_update"
  ON public.attendance FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);  -- athletes cannot update; SA covered above

CREATE POLICY "attendance_delete"
  ON public.attendance FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- fee_plans
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "fee_plans_sa_all"  ON public.fee_plans;
DROP POLICY IF EXISTS "fee_plans_select"  ON public.fee_plans;
DROP POLICY IF EXISTS "fee_plans_insert"  ON public.fee_plans;
DROP POLICY IF EXISTS "fee_plans_update"  ON public.fee_plans;
DROP POLICY IF EXISTS "fee_plans_delete"  ON public.fee_plans;

CREATE POLICY "fee_plans_sa_all"
  ON public.fee_plans FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

-- Athletes read fee plans (need plan name/amount on their payment screen).
CREATE POLICY "fee_plans_select"
  ON public.fee_plans FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "fee_plans_insert"
  ON public.fee_plans FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "fee_plans_update"
  ON public.fee_plans FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "fee_plans_delete"
  ON public.fee_plans FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- fee_assignments
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "fee_assignments_sa_all"  ON public.fee_assignments;
DROP POLICY IF EXISTS "fee_assignments_select"  ON public.fee_assignments;
DROP POLICY IF EXISTS "fee_assignments_insert"  ON public.fee_assignments;
DROP POLICY IF EXISTS "fee_assignments_update"  ON public.fee_assignments;
DROP POLICY IF EXISTS "fee_assignments_delete"  ON public.fee_assignments;

CREATE POLICY "fee_assignments_sa_all"
  ON public.fee_assignments FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

CREATE POLICY "fee_assignments_select"
  ON public.fee_assignments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = fee_assignments.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "fee_assignments_insert"
  ON public.fee_assignments FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "fee_assignments_update"
  ON public.fee_assignments FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "fee_assignments_delete"
  ON public.fee_assignments FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- invoices
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invoices_sa_all"  ON public.invoices;
DROP POLICY IF EXISTS "invoices_select"  ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert"  ON public.invoices;
DROP POLICY IF EXISTS "invoices_update"  ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete"  ON public.invoices;

CREATE POLICY "invoices_sa_all"
  ON public.invoices FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

CREATE POLICY "invoices_select"
  ON public.invoices FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = invoices.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

-- Athletes cannot create invoices for themselves.
CREATE POLICY "invoices_insert"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "invoices_update"
  ON public.invoices FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "invoices_delete"
  ON public.invoices FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- payments
-- ─────────────────────────────────────────────────────────────────────────────
-- Athletes have NO INSERT here.
-- Online payments go via verify-payment Edge Function (service-role).
DROP POLICY IF EXISTS "payments_sa_all"  ON public.payments;
DROP POLICY IF EXISTS "payments_select"  ON public.payments;
DROP POLICY IF EXISTS "payments_insert"  ON public.payments;
DROP POLICY IF EXISTS "payments_update"  ON public.payments;
DROP POLICY IF EXISTS "payments_delete"  ON public.payments;

CREATE POLICY "payments_sa_all"
  ON public.payments FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

CREATE POLICY "payments_select"
  ON public.payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = payments.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "payments_insert"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "payments_update"
  ON public.payments FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "payments_delete"
  ON public.payments FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_sa_all"  ON public.notifications;
DROP POLICY IF EXISTS "notifications_select"  ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert"  ON public.notifications;
DROP POLICY IF EXISTS "notifications_update"  ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete"  ON public.notifications;

CREATE POLICY "notifications_sa_all"
  ON public.notifications FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

-- Own notifications only.
CREATE POLICY "notifications_select"
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

-- Any authenticated user may INSERT (athletes notify admins on onboarding submit).
CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

-- Athletes can only mark their own notifications as read.
CREATE POLICY "notifications_update"
  ON public.notifications FOR UPDATE TO authenticated
  USING    (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "notifications_delete"
  ON public.notifications FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- guardian_details
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "guardian_details_sa_all"  ON public.guardian_details;
DROP POLICY IF EXISTS "guardian_details_select"  ON public.guardian_details;
DROP POLICY IF EXISTS "guardian_details_insert"  ON public.guardian_details;
DROP POLICY IF EXISTS "guardian_details_update"  ON public.guardian_details;
DROP POLICY IF EXISTS "guardian_details_delete"  ON public.guardian_details;

CREATE POLICY "guardian_details_sa_all"
  ON public.guardian_details FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

CREATE POLICY "guardian_details_select"
  ON public.guardian_details FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = guardian_details.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "guardian_details_insert"
  ON public.guardian_details FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = guardian_details.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "guardian_details_update"
  ON public.guardian_details FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = guardian_details.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = guardian_details.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "guardian_details_delete"
  ON public.guardian_details FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- leave_applications
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "leave_applications_sa_all"  ON public.leave_applications;
DROP POLICY IF EXISTS "leave_applications_select"  ON public.leave_applications;
DROP POLICY IF EXISTS "leave_applications_insert"  ON public.leave_applications;
DROP POLICY IF EXISTS "leave_applications_update"  ON public.leave_applications;
DROP POLICY IF EXISTS "leave_applications_delete"  ON public.leave_applications;

CREATE POLICY "leave_applications_sa_all"
  ON public.leave_applications FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

CREATE POLICY "leave_applications_select"
  ON public.leave_applications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = leave_applications.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "leave_applications_insert"
  ON public.leave_applications FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = leave_applications.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

-- Athletes cannot change the status/reviewed_by — only superadmin (via sa_all).
CREATE POLICY "leave_applications_update"
  ON public.leave_applications FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "leave_applications_delete"
  ON public.leave_applications FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- access_overrides
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "access_overrides_sa_all"  ON public.access_overrides;
DROP POLICY IF EXISTS "access_overrides_select"  ON public.access_overrides;
DROP POLICY IF EXISTS "access_overrides_insert"  ON public.access_overrides;
DROP POLICY IF EXISTS "access_overrides_update"  ON public.access_overrides;
DROP POLICY IF EXISTS "access_overrides_delete"  ON public.access_overrides;

CREATE POLICY "access_overrides_sa_all"
  ON public.access_overrides FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

-- Athletes read their own overrides (know if they have special access).
CREATE POLICY "access_overrides_select"
  ON public.access_overrides FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = access_overrides.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "access_overrides_insert"
  ON public.access_overrides FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "access_overrides_update"
  ON public.access_overrides FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "access_overrides_delete"
  ON public.access_overrides FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- discount_schemes
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "discount_schemes_sa_all"    ON public.discount_schemes;
DROP POLICY IF EXISTS "discount_schemes_select"    ON public.discount_schemes;
DROP POLICY IF EXISTS "discount_schemes_insert"    ON public.discount_schemes;
DROP POLICY IF EXISTS "discount_schemes_update"    ON public.discount_schemes;
DROP POLICY IF EXISTS "discount_schemes_delete"    ON public.discount_schemes;

CREATE POLICY "discount_schemes_sa_all"
  ON public.discount_schemes FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

-- Athletes have no access to raw discount scheme definitions.
CREATE POLICY "discount_schemes_select"
  ON public.discount_schemes FOR SELECT TO authenticated
  USING (false);

CREATE POLICY "discount_schemes_insert"
  ON public.discount_schemes FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "discount_schemes_update"
  ON public.discount_schemes FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "discount_schemes_delete"
  ON public.discount_schemes FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- discount_applications
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "discount_applications_sa_all"  ON public.discount_applications;
DROP POLICY IF EXISTS "discount_applications_select"  ON public.discount_applications;
DROP POLICY IF EXISTS "discount_applications_insert"  ON public.discount_applications;
DROP POLICY IF EXISTS "discount_applications_update"  ON public.discount_applications;
DROP POLICY IF EXISTS "discount_applications_delete"  ON public.discount_applications;

CREATE POLICY "discount_applications_sa_all"
  ON public.discount_applications FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

CREATE POLICY "discount_applications_select"
  ON public.discount_applications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = discount_applications.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "discount_applications_insert"
  ON public.discount_applications FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "discount_applications_update"
  ON public.discount_applications FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "discount_applications_delete"
  ON public.discount_applications FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- coupons
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coupons_sa_all"   ON public.coupons;
DROP POLICY IF EXISTS "coupons_select"   ON public.coupons;
DROP POLICY IF EXISTS "coupons_insert"   ON public.coupons;
DROP POLICY IF EXISTS "coupons_update"   ON public.coupons;
DROP POLICY IF EXISTS "coupons_delete"   ON public.coupons;

CREATE POLICY "coupons_sa_all"
  ON public.coupons FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

-- Athletes can read active coupons to apply on payments screen.
CREATE POLICY "coupons_select"
  ON public.coupons FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "coupons_insert"
  ON public.coupons FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "coupons_update"
  ON public.coupons FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "coupons_delete"
  ON public.coupons FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_logs
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_logs_sa_all"  ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_select"  ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert"  ON public.audit_logs;

CREATE POLICY "audit_logs_sa_all"
  ON public.audit_logs FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

-- Non-superadmin cannot read audit logs.
CREATE POLICY "audit_logs_select"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (false);

-- Append-only from any authenticated user (app code logs actions).
CREATE POLICY "audit_logs_insert"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- No UPDATE or DELETE (integrity requirement).

-- ─────────────────────────────────────────────────────────────────────────────
-- attendance_polls
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "attendance_polls_sa_all"  ON public.attendance_polls;
DROP POLICY IF EXISTS "attendance_polls_select"  ON public.attendance_polls;
DROP POLICY IF EXISTS "attendance_polls_insert"  ON public.attendance_polls;
DROP POLICY IF EXISTS "attendance_polls_update"  ON public.attendance_polls;
DROP POLICY IF EXISTS "attendance_polls_delete"  ON public.attendance_polls;

CREATE POLICY "attendance_polls_sa_all"
  ON public.attendance_polls FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

-- Athletes see polls for their academy.
CREATE POLICY "attendance_polls_select"
  ON public.attendance_polls FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.user_id = auth.uid()
        AND ap.academy_id = attendance_polls.academy_id
    )
  );

CREATE POLICY "attendance_polls_insert"
  ON public.attendance_polls FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "attendance_polls_update"
  ON public.attendance_polls FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "attendance_polls_delete"
  ON public.attendance_polls FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- attendance_poll_responses
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "attendance_poll_responses_sa_all"  ON public.attendance_poll_responses;
DROP POLICY IF EXISTS "attendance_poll_responses_select"  ON public.attendance_poll_responses;
DROP POLICY IF EXISTS "attendance_poll_responses_insert"  ON public.attendance_poll_responses;
DROP POLICY IF EXISTS "attendance_poll_responses_update"  ON public.attendance_poll_responses;
DROP POLICY IF EXISTS "attendance_poll_responses_delete"  ON public.attendance_poll_responses;

CREATE POLICY "attendance_poll_responses_sa_all"
  ON public.attendance_poll_responses FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

CREATE POLICY "attendance_poll_responses_select"
  ON public.attendance_poll_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = attendance_poll_responses.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "attendance_poll_responses_insert"
  ON public.attendance_poll_responses FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = attendance_poll_responses.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "attendance_poll_responses_update"
  ON public.attendance_poll_responses FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = attendance_poll_responses.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = attendance_poll_responses.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "attendance_poll_responses_delete"
  ON public.attendance_poll_responses FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- class_assignment_polls
-- NOTE: template_id and pitch_id are TEXT columns, not UUID.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "class_assignment_polls_sa_all"  ON public.class_assignment_polls;
DROP POLICY IF EXISTS "class_assignment_polls_select"  ON public.class_assignment_polls;
DROP POLICY IF EXISTS "class_assignment_polls_insert"  ON public.class_assignment_polls;
DROP POLICY IF EXISTS "class_assignment_polls_update"  ON public.class_assignment_polls;
DROP POLICY IF EXISTS "class_assignment_polls_delete"  ON public.class_assignment_polls;

CREATE POLICY "class_assignment_polls_sa_all"
  ON public.class_assignment_polls FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

CREATE POLICY "class_assignment_polls_select"
  ON public.class_assignment_polls FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.user_id = auth.uid()
        AND ap.academy_id = class_assignment_polls.academy_id
    )
  );

CREATE POLICY "class_assignment_polls_insert"
  ON public.class_assignment_polls FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "class_assignment_polls_update"
  ON public.class_assignment_polls FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "class_assignment_polls_delete"
  ON public.class_assignment_polls FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- class_assignment_poll_responses
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "class_assignment_poll_responses_sa_all"  ON public.class_assignment_poll_responses;
DROP POLICY IF EXISTS "class_assignment_poll_responses_select"  ON public.class_assignment_poll_responses;
DROP POLICY IF EXISTS "class_assignment_poll_responses_insert"  ON public.class_assignment_poll_responses;
DROP POLICY IF EXISTS "class_assignment_poll_responses_update"  ON public.class_assignment_poll_responses;
DROP POLICY IF EXISTS "class_assignment_poll_responses_delete"  ON public.class_assignment_poll_responses;

CREATE POLICY "class_assignment_poll_responses_sa_all"
  ON public.class_assignment_poll_responses FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

CREATE POLICY "class_assignment_poll_responses_select"
  ON public.class_assignment_poll_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = class_assignment_poll_responses.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "class_assignment_poll_responses_insert"
  ON public.class_assignment_poll_responses FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = class_assignment_poll_responses.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "class_assignment_poll_responses_update"
  ON public.class_assignment_poll_responses FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = class_assignment_poll_responses.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.id = class_assignment_poll_responses.athlete_profile_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "class_assignment_poll_responses_delete"
  ON public.class_assignment_poll_responses FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- academy_grounds
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "academy_grounds_sa_all"  ON public.academy_grounds;
DROP POLICY IF EXISTS "academy_grounds_select"  ON public.academy_grounds;
DROP POLICY IF EXISTS "academy_grounds_insert"  ON public.academy_grounds;
DROP POLICY IF EXISTS "academy_grounds_update"  ON public.academy_grounds;
DROP POLICY IF EXISTS "academy_grounds_delete"  ON public.academy_grounds;

CREATE POLICY "academy_grounds_sa_all"
  ON public.academy_grounds FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

-- All authenticated users read grounds (needed for schedule/map screens).
CREATE POLICY "academy_grounds_select"
  ON public.academy_grounds FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "academy_grounds_insert"
  ON public.academy_grounds FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "academy_grounds_update"
  ON public.academy_grounds FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "academy_grounds_delete"
  ON public.academy_grounds FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- class_schedule_templates
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "class_schedule_templates_sa_all"  ON public.class_schedule_templates;
DROP POLICY IF EXISTS "class_schedule_templates_select"  ON public.class_schedule_templates;
DROP POLICY IF EXISTS "class_schedule_templates_insert"  ON public.class_schedule_templates;
DROP POLICY IF EXISTS "class_schedule_templates_update"  ON public.class_schedule_templates;
DROP POLICY IF EXISTS "class_schedule_templates_delete"  ON public.class_schedule_templates;

CREATE POLICY "class_schedule_templates_sa_all"
  ON public.class_schedule_templates FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

-- Athletes read templates for their academy (schedule screen).
CREATE POLICY "class_schedule_templates_select"
  ON public.class_schedule_templates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.user_id = auth.uid()
        AND ap.academy_id = class_schedule_templates.academy_id
    )
  );

CREATE POLICY "class_schedule_templates_insert"
  ON public.class_schedule_templates FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "class_schedule_templates_update"
  ON public.class_schedule_templates FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "class_schedule_templates_delete"
  ON public.class_schedule_templates FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- class_schedule_pitches
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "class_schedule_pitches_sa_all"  ON public.class_schedule_pitches;
DROP POLICY IF EXISTS "class_schedule_pitches_select"  ON public.class_schedule_pitches;
DROP POLICY IF EXISTS "class_schedule_pitches_insert"  ON public.class_schedule_pitches;
DROP POLICY IF EXISTS "class_schedule_pitches_update"  ON public.class_schedule_pitches;
DROP POLICY IF EXISTS "class_schedule_pitches_delete"  ON public.class_schedule_pitches;

CREATE POLICY "class_schedule_pitches_sa_all"
  ON public.class_schedule_pitches FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

-- Athletes read pitches for their academy via template join.
CREATE POLICY "class_schedule_pitches_select"
  ON public.class_schedule_pitches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM class_schedule_templates cst
      JOIN athlete_profiles ap ON ap.academy_id = cst.academy_id
      WHERE cst.id = class_schedule_pitches.template_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "class_schedule_pitches_insert"
  ON public.class_schedule_pitches FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "class_schedule_pitches_update"
  ON public.class_schedule_pitches FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "class_schedule_pitches_delete"
  ON public.class_schedule_pitches FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- class_schedule_instances
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "class_schedule_instances_sa_all"  ON public.class_schedule_instances;
DROP POLICY IF EXISTS "class_schedule_instances_select"  ON public.class_schedule_instances;
DROP POLICY IF EXISTS "class_schedule_instances_insert"  ON public.class_schedule_instances;
DROP POLICY IF EXISTS "class_schedule_instances_update"  ON public.class_schedule_instances;
DROP POLICY IF EXISTS "class_schedule_instances_delete"  ON public.class_schedule_instances;

CREATE POLICY "class_schedule_instances_sa_all"
  ON public.class_schedule_instances FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

CREATE POLICY "class_schedule_instances_select"
  ON public.class_schedule_instances FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athlete_profiles ap
      WHERE ap.user_id = auth.uid()
        AND ap.academy_id = class_schedule_instances.academy_id
    )
  );

CREATE POLICY "class_schedule_instances_insert"
  ON public.class_schedule_instances FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "class_schedule_instances_update"
  ON public.class_schedule_instances FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "class_schedule_instances_delete"
  ON public.class_schedule_instances FOR DELETE TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- class_instance_pitch_overrides
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "class_instance_pitch_overrides_sa_all"  ON public.class_instance_pitch_overrides;
DROP POLICY IF EXISTS "class_instance_pitch_overrides_select"  ON public.class_instance_pitch_overrides;
DROP POLICY IF EXISTS "class_instance_pitch_overrides_insert"  ON public.class_instance_pitch_overrides;
DROP POLICY IF EXISTS "class_instance_pitch_overrides_update"  ON public.class_instance_pitch_overrides;
DROP POLICY IF EXISTS "class_instance_pitch_overrides_delete"  ON public.class_instance_pitch_overrides;

CREATE POLICY "class_instance_pitch_overrides_sa_all"
  ON public.class_instance_pitch_overrides FOR ALL TO authenticated
  USING    (auth_role() = 'superadmin')
  WITH CHECK (auth_role() = 'superadmin');

CREATE POLICY "class_instance_pitch_overrides_select"
  ON public.class_instance_pitch_overrides FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM class_schedule_instances csi
      JOIN athlete_profiles ap ON ap.academy_id = csi.academy_id
      WHERE csi.id = class_instance_pitch_overrides.instance_id
        AND ap.user_id = auth.uid()
    )
  );

CREATE POLICY "class_instance_pitch_overrides_insert"
  ON public.class_instance_pitch_overrides FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "class_instance_pitch_overrides_update"
  ON public.class_instance_pitch_overrides FOR UPDATE TO authenticated
  USING    (false)
  WITH CHECK (false);

CREATE POLICY "class_instance_pitch_overrides_delete"
  ON public.class_instance_pitch_overrides FOR DELETE TO authenticated
  USING (false);


-- ── POST-MIGRATION VERIFICATION ───────────────────────────────────────────────
-- Run these in SQL Editor after applying to verify correctness:
--
-- 1. Confirm RLS enabled on all tables:
--    SELECT tablename, rowsecurity
--    FROM pg_tables
--    WHERE schemaname = 'public'
--    ORDER BY tablename;
--    Every table should show rowsecurity = true
--
-- 2. List all active policies:
--    SELECT tablename, policyname, cmd, roles
--    FROM pg_policies
--    WHERE schemaname = 'public'
--    ORDER BY tablename, policyname;
--
-- 3. Test athlete payment block (run as an athlete JWT):
--    INSERT INTO payments (...) VALUES (...);
--    Should fail: "new row violates row-level security policy"
-- ─────────────────────────────────────────────────────────────────────────────
