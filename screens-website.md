# BOXOS — Web Screens (adapted to the existing `Aadya2k6/Boxing` repo)

> Companion to `architecture.md`. This file is **additive-only**: every existing route, table, and
> component listed here is to be **kept exactly as-is**. New screens are marked **[NEW]**. Screens
> that need a field/label added to an existing page are marked **[EXTEND]** with only the delta
> described — the rest of that screen stays untouched.

---

## 0. Ground truth from the repo (read this before building anything)

The codebase was originally scaffolded as a **cricket-academy app** and is mid-conversion to boxing
(README still says "Cricket"; tables are `athlete_profiles`, `academy_grounds`, `class_schedule_*`;
onboarding already asks Boxing Stance / Reach / Fight Record, so the conversion is real, just partial).

**Stack actually in use:** TanStack Router (file-based routes, `src/routes/*.tsx`), React 19, Vite,
Supabase (Postgres + Auth + Realtime + Storage + Edge Functions), Tailwind + shadcn/ui, Razorpay +
PayU (`lib/razorpay.ts`, `lib/payu.ts`), PDF receipts (`lib/pdf-receipt.ts`), sidebar dashboard shell
(`components/dashboard/DashboardLayout.tsx`), toasts via `sonner`.

**Roles that exist today:** `athlete`, `admin`, `superadmin` only. Guarded by `useRequireAuth(role)` /
`useRequireAthlete()` in `lib/guards.ts`.

**Roles architecture.md requires that do not exist yet:** `coach`, `external_judge`, `boxos_admin`.
These need new enum values, new route trees, new `AccessGuard`/`useRequireAuth` variants, and new
`DashboardLayout` role configs. Nothing about adding them breaks what's there — `DashboardLayout`
already takes `role` as a typed prop and `navSections` as data, so a 4th/5th/6th role is a config
addition, not a rewrite.

**Tenancy shape mismatch — needs your decision, I'm not resolving it silently:**
The current `superadmin` role is written as a *single platform owner* over one organization's
multiple physical **grounds** (`superadmin.academies.tsx` = "Academy Locations", i.e. `academy_grounds`,
not separate tenant academies) and one shared **Academy Config**. `architecture.md` §1 assumes
**many independent academy tenants**, each with its own superadmin(s), plus a separate BOXOS Admin
above all of them. Two ways to reconcile, both additive:
- **(a)** Keep current `superadmin` role as-is (it becomes architecture.md's "Superadmin" for a single
  tenant), and add a genuinely new `boxos_admin` role/console on top for true multi-tenancy later.
- **(b)** Treat this repo as intentionally single-tenant for now and defer BOXOS Admin entirely.
This doc builds for **(a)** since it requires zero changes to what exists and just adds a layer above
it — say the word if you actually want (b) and I'll trim §8 below.

**Tables that don't exist yet** (needed for full architecture.md compliance, all additive per
`schema.sql`): `bouts`, `bout_rounds`, `bout_events`, `bout_judge_assignments`, `bout_round_scores`,
`bout_judge_totals`, `boxer_bout_history`, `age_categories`, `weight_categories`,
`external_judge_invites`, `coach_ring_assignments`, `session_feedback`, `fitness_test_types`,
`fitness_test_records`, `pregnancy_declarations`, `academy_lifecycle_events`. The existing
`class_schedule_templates` / `class_schedule_instances` / `class_schedule_pitches` /
`academy_grounds` are the closest existing analogue to architecture.md's ring-scheduling tables —
recommend **extending** these (add a `template_type` / `is_tournament` flag) rather than building a
parallel `ring_*` table set, since they already do 90% of the same job under different names.

**Naming note:** architecture.md says `boxer_profiles` — this repo says `athlete_profiles`. Keep the
repo's name everywhere below; don't introduce a second table.

---

## 1. Shared web elements already in the codebase (reuse these, don't reinvent)

From `components/dashboard/DashboardLayout.tsx` and `components/ui/*`:
- `DashboardLayout` — sidebar shell (logo, role chip, nav sections, user row, sign-out) + header
  (breadcrumbs, search with `⌘K`, notification bell w/ live unread count via Realtime, sign-out button)
- `PageHeader` — title, subtitle, right-side actions slot
- `StatCard` — label, big value, optional delta badge, optional hint, optional icon
- `SectionCard` — optional header (title/subtitle/action) + body
- `DataTable` — headers + rows, built-in empty state
- `Badge` — tones: neutral/success/warning/danger/info/gold
- `AvatarInitials` — gradient-circle initials, sm/md
- shadcn primitives already installed: `dialog`, `alert-dialog`, `sheet`, `drawer`, `tabs`,
  `accordion`, `calendar`, `select`, `checkbox`, `switch`, `progress`, `command` (for `⌘K` search),
  `table`, `pagination`, `badge`, `avatar`
- Toasts via `sonner` (replaces the old spec's "Toast/inline banner" — use this everywhere, don't add
  a second toast system)

**Web-vs-app translation table** (apply this pattern to every screen below instead of the old
mobile-native ones):

| Old (app) spec | Web equivalent already in repo |
|---|---|
| Bottom tab bar | Sidebar `navSections` (see `NavSection`/`NavItem` types) |
| Bottom-sheet modal | shadcn `Dialog` (short forms) or `Sheet` (side-panel, longer forms like "Add Bout") |
| Pull-to-refresh | Explicit "Refresh" button/icon in `PageHeader` actions, or Realtime auto-update where already wired (notifications bell does this) |
| Device dialer "Call" button | `<a href="tel:...">` link |
| Push notification | In-app `notifications` table row (already exists) + bell badge; browser push is a separate, optional addition — not assumed here |
| Step-indicator wizard w/ swipe | Same wizard pattern already used in `onboarding.tsx` (`Field` component, `set()` state updater, step array) — extend it, don't replace it |
| Confirm dialog | shadcn `AlertDialog` |

Global convention (unchanged from the app spec, already implemented): every account-activation flow
requires a Terms & Privacy checkbox before the primary button un-disables. `onboarding.tsx` and
`signup.tsx` already gate on required fields — extend that same disabled-until-valid pattern for the
new Terms row if it isn't already present (check `signup.tsx` before adding — don't duplicate if it's
already there).

---

## 2. Nav shells

### 2.1 Athlete — `athlete.tsx` [EXISTING, unchanged]
Sidebar sections already defined: Home, Profile (`User`), Payments (`CreditCard`), Schedule
(`Calendar`), Documents (`FileText`), Notifications (`Bell`), Settings (`Settings`), plus a ground/
location icon (`MapPin`). Keep as-is.
**[NEW]** Add one nav item: `{ to: "bouts", label: "My Bouts", icon: Swords }` (or similar lucide
icon) — only meaningful once `bouts` table exists.

### 2.2 Admin — `admin.tsx` [EXISTING, unchanged]
Sidebar: Overview, Athletes, Fee Management, Invoices, Attendance & Leaves, Notifications, Settings.
**[NEW]** Additions needed for tournament operations (Admin currently has **no scheduling access at
all** — only Superadmin does via `class-assigning`; architecture.md §5.6–§5.8 expects Admin to run
day-to-day scheduling and bout management too):
- `{ to: "scheduling", label: "Scheduling", icon: CalendarCheck }` — reuses `class_schedule_*` tables
- `{ to: "bouts", label: "Bout Management", icon: Swords }`
- `{ to: "judges", label: "Judges", icon: Gavel }`

### 2.3 Superadmin — `superadmin.tsx` [EXISTING, unchanged]
Sidebar sections already defined — "Platform": Academy Overview, Athletes, Academy Locations, Academy
Config, Fee Structure, Discounts & Penalties, Class Assigning. "Admin": User Management, All Reports,
Notifications, System Settings.
**[NEW]** Additions:
- Under "Platform": `{ to: "bouts", label: "Bout Management", icon: Swords }`,
  `{ to: "judges", label: "External Judges", icon: Gavel }`,
  `{ to: "categories", label: "Age & Weight Categories", icon: Layers }` (or fold into existing
  `config` page as a new tab — see §6.9)
- Rename consideration only, not required: "Class Assigning" already functions as ring/session
  scheduling — leave the label as-is unless you want it to read "Ring Scheduling" for boxing
  terminology; either way it's the same route/table, no rebuild.

### 2.4 Coach — **[NEW]** `coach.tsx`
New route wrapper, same pattern as `admin.tsx`/`superadmin.tsx`:
```
navSections={[
  { label: "Today", items: [
      { to: "", label: "Rings", icon: Radio },
      { to: "boxers", label: "My Boxers", icon: Users },
      { to: "attendance", label: "Attendance", icon: CalendarCheck },
  ]},
  { label: "Account", items: [
      { to: "notifications", label: "Notifications", icon: Bell },
      { to: "settings", label: "Settings", icon: Settings },
  ]},
]}
```
`accentClass`/`accentBg`/`dotColor` need a new CSS variable (`--color-coach`) alongside the existing
`--color-admin`/`--color-superadmin` referenced in `DashboardLayout`'s `nav-active-bar` logic — add,
don't touch the existing ones.

### 2.5 External Judge — **[NEW]** `judge.tsx`
No sidebar (matches the original app spec's intent — this role is deliberately minimal and
time-boxed). Simplest web equivalent: reuse `DashboardLayout` with an **empty `navSections` array**
so you get the same header/sign-out chrome for free, or build a lighter standalone shell if you'd
rather it feel visually distinct from staff dashboards (recommended, since this is a temporary
external-party role — see §7 for reasoning). Persistent access-status banner (tournament name +
Active/Expiring/Expired badge) renders above the page content either way.

---

## 3. Auth & Onboarding — `login.tsx`, `signup.tsx`, `onboarding.tsx` [EXISTING, unchanged]

All current fields/flows stay as they are:
- `login.tsx` — email/password, forgot-password link
- `signup.tsx` — athlete self-serve signup
- `onboarding.tsx` — multi-step wizard already covering: Personal, Guardian (conditional), Emergency
  Contact, Medical History, Boxing Profile (Stance, Dominant Hand, Weight, Height, Reach, Experience
  Level, Primary Goal, Fight Record, Previous Club, Coach Name, Preferred Class Schedule), Academy
  Code gate (placeholder literally says "BOXOS1")

**[EXTEND] Boxing Profile step** — add two fields for category resolution once `weight_categories`/
`age_categories` tables exist:
- Read-only "Weight Category" preview chip, computed from `weightKg` + `gender` + `dateOfBirth`
  against the academy's effective category list (architecture.md §3.4) — same pattern as the old app
  spec's "Weight-category preview chip", just needs the resolution query wired to the new tables
- Read-only "Age Category" preview chip, same mechanic

No other onboarding step needs to change. Don't touch the medical/guardian/emergency steps — they
already satisfy architecture.md's requirements.

**[NEW]** Staff-invite first-login flow for Coach — same shape as whatever currently handles Admin/
Superadmin first-login-after-invite (check `lib/auth.tsx` / `lib/guards.ts` for the existing pattern
and extend it to the `coach` role rather than writing a parallel one).

**[NEW]** Judge portal login (`judge.login.tsx` or similar) — separate from the shared `login.tsx`
since External Judge is invite-only, time-limited, and should never see the "create account" link
that `login.tsx` shows athletes. Simplest: a thin wrapper route with its own copy that calls the same
`lib/auth.tsx` sign-in function underneath — no new auth logic needed, just a different shell/copy.

---

## 4. Athlete screens

| Route (existing) | Status | Notes |
|---|---|---|
| `athlete.index.tsx` (Home) | EXISTING | Keep as-is. **[EXTEND]** add pregnancy-declaration banner block (conditional, adult female only — see §4.9) above/alongside whatever Payment Wall / dashboard content is already there. |
| `athlete.payments.tsx` | EXISTING, unchanged | Already wired to Razorpay/PayU per `lib/razorpay.ts`/`lib/payu.ts`. |
| `athlete.attendance.tsx` | EXISTING | Keep as-is. **[EXTEND]** add suspension notice + session-feedback prompt once `is_suspended` / `session_feedback` exist. |
| `athlete.schedule.tsx` | EXISTING, unchanged | Currently built on `class_schedule_instances`; will surface tournament ring-sessions for free once §2.3's `class_schedule_templates.template_type` flag is added, no new screen needed. |
| `athlete.documents.tsx` | EXISTING, unchanged | Not in the original architecture.md spec — leave it, it's presumably certificates/ID uploads; no conflict. |
| `athlete.profile.tsx` | EXISTING | Keep as-is. **[EXTEND]** add Record (Wins/Losses/KOs) mini-stats section and Federation IDs section once `boxer_bout_history`/`record_*` columns exist. |
| `athlete.notifications.tsx`, `athlete.settings.tsx` | EXISTING, unchanged | |

**4.9 Pregnancy Declaration [NEW]** — `athlete.declarations.$id.tsx` or a dialog opened from the Home
banner (dialog is simpler and matches the "one checkbox, immutable, confirm dialog" shape from
architecture.md §9.1 step 4 — no need for its own full route/page). Content: session context line,
declaration checkbox, "Submit Declaration" button (disabled until checked, `AlertDialog` confirm since
it's immutable), post-submit read-only confirmation state.

**4.10 My Bouts [NEW]** — `athlete.bouts.tsx`. Filter chips (All/Upcoming/Completed) using existing
`Badge`/filter-row patterns already used elsewhere in the app (check `athlete.payments.tsx`'s invoice
filter for the exact pattern to copy). Bout card → detail view with per-round score table
(`DataTable`), decision summary, event log.

---

## 5. Admin screens

| Route (existing) | Status |
|---|---|
| `admin.index.tsx`, `admin.athletes.tsx`, `admin.fees.tsx`, `admin.invoices.tsx`, `admin.attendance.tsx`, `admin.notifications.tsx`, `admin.reports.tsx`, `admin.settings.tsx` | EXISTING, unchanged |

**[EXTEND] `admin.athletes.tsx`** — add Suspend/Reinstate action buttons + suspension badge once §8
medical-suspension tables exist. Reuse whatever modal pattern the page already uses for its other
row-actions (check the file for the existing `Dialog` usage before adding a new one).

**5.x Scheduling [NEW]** — `admin.scheduling.tsx`. Give Admin the same capability Superadmin's
`class-assigning` page has, scoped to their own academy — either literally reuse that component with
a role-scoped query, or duplicate the route pointing at the same underlying table/logic. Don't build a
second scheduling engine.

**5.y Bout Management [NEW]** — `admin.bouts.tsx`. Bout list (filtered by ring/session/date), Add/Edit
Bout sheet (red/blue corner pickers filtered by weight category's gender + suspended-boxer exclusion,
category pickers, round/rest duration fields, judge-count numeric stepper 1–5, coach picker required
for tournament-kind bouts), Weigh-in Confirm dialog, Assign Judges sheet.

**5.z Judges [NEW]** — `admin.judges.tsx`. Invite-by-email form, invite status table
(`DataTable` — email, name, status `Badge`, invited date, Revoke button), "End Tournament Now"
manual-override button with `AlertDialog` confirm (incomplete-bout count warning).

---

## 6. Superadmin screens

| Route (existing) | Status |
|---|---|
| `superadmin.index.tsx`, `superadmin.athletes.tsx`, `superadmin.academies.tsx`, `superadmin.config.tsx`, `superadmin.fees.tsx`, `superadmin.discounts.tsx`, `superadmin.class-assigning.tsx`, `superadmin.users.tsx`, `superadmin.reports.tsx`, `superadmin.notifications.tsx`, `superadmin.refunds.tsx`, `superadmin.attendance.tsx`, `superadmin.settings.tsx` | EXISTING, unchanged |

**[EXTEND] `superadmin.users.tsx`** — this is where architecture.md's "Admin/Coach creation, Superadmin
can't create Superadmin" rule (§1.2) belongs. Add `coach` as a selectable role in whatever invite-role
select already lists Admin (don't add Superadmin as an option — matches the hard rule).

**6.9 Age & Weight Categories [NEW]** — either a new tab inside the existing `superadmin.config.tsx`
(recommended — it's already the academy-config page, this is more config) or a new
`superadmin.categories.tsx` route if `config.tsx` is already large. Global-default vs.
academy-override badge pattern per architecture.md §3.4.

**6.10 Bout Management / Judges [NEW]** — same screens as §5.y/§5.z, platform-wide view instead of
one academy's. If (a) from §0 is chosen, these are near-identical components with a wider query scope
— don't build two separate implementations.

---

## 7. Coach screens — **all [NEW]**

**7.1 Rings (home)** — `coach.index.tsx`. Live per-ring cards: current bout summary, round
indicator + live countdown (Realtime broadcast, matches architecture.md §6.3 — client-computed
countdown, not per-second server writes), Start/Pause/Resume/End Round buttons, quick-event buttons
(Knockdown/Warning/Foul/Low Blow/Injury Timeout), inline scoring form (conditional — only if this
coach is also a judge on the bout), "End Bout — Record Decision" button. Pending Pregnancy
Declarations card (persistent, non-dismissable) with Call (`tel:` link) and same-day Swap/Remove
sheet.

**7.2 Log Event modal** — shadcn `Dialog`: event-type select, boxer-target toggle, description field.

**7.3 Record Bout Decision modal** — shadcn `Dialog` or `Sheet`: panel tie-break prompt (conditional,
2 or 4 judges evenly split), decision-type select, winner select, reason field, confirm via
`AlertDialog` (irreversible).

**7.4 My Boxers** — `coach.boxers.tsx`. Search + filter chips, boxer row → quick-view drawer (`Sheet`).

**7.5 Attendance (assist view)** — `coach.attendance.tsx`. Read-mostly roster with a
"Mark Present" quick action.

**7.6/7.7 Notifications / Settings** — same components as Admin's equivalents, coach-scoped query.

---

## 8. External Judge screens — **all [NEW]**

Deliberately minimal per architecture.md §1.1 — resist the urge to give this role the full dashboard
shell.

**8.1 Login** — separate route/copy per §3 above.

**8.2 Forced Password Change + Terms** — first-login only, shadcn `Dialog` or full-page form, same
password-set pattern as staff first-login, plus Terms checkbox.

**8.3 Access status banner** — persistent, top of every judge-portal page: tournament name, status
`Badge` (Active/Expiring soon/Expired), countdown text.

**8.4 My Bouts** — list of assigned bouts only (`bout_judge_assignments` scoped to this judge).

**8.5 Live Scoring** — read-only synced timer (same Realtime channel pattern as the coach's, judge
just doesn't get the control buttons), round scoring form (Red/Blue winner select, loser-score chip
7/8/9, winner fixed at 10), past-rounds summary, bout-completion state with full scorecard.

**8.6 Access Expired** — static page, auto-redirect to login. This is also what should render if a
judge's Supabase session gets hard-revoked mid-use per architecture.md §7.5 — worth wiring a
Realtime/interval check on `access_expires_at` so it doesn't wait for the next page navigation.

---

## 9. BOXOS Admin (platform layer) — conditional on §0's decision

If you go with **(a)**: a new top-level role/console, structurally identical to how `superadmin.tsx`
wraps its section, just one layer up and with no `academy_id` scoping. Screens: Academies list (with
Suspend/Archive/Delete actions and the 7-day cool-off gate on Delete), Create Academy form, Academy
Detail (superadmin list, lifecycle history), Platform Reports, Lifecycle Log. All net-new routes and
tables (`academies.status` lifecycle columns, `academy_lifecycle_events`) — nothing here touches
existing Superadmin/Admin/Athlete/Coach screens.

If you go with **(b)**: skip this section entirely for now: Superadmin as it exists today already
covers everything a single-tenant deployment needs.

---

## 10. Suggested build order (lowest risk first)

1. Age/Weight Categories (§6.9) + onboarding preview chips (§3 extend) — pure additions, nothing else depends on getting this wrong first
2. `bouts` + related tables, Admin/Superadmin Bout Management (§5.y/§6.10)
3. Coach role end-to-end (§2.4, §7) — needed before bouts are usable in practice
4. External Judge role end-to-end (§2.5, §8)
5. Pregnancy declaration (§3.12 in architecture.md, §4.9 here) — independent of bouts, can slot in anytime after boxer_profiles gender/is_minor are reliably populated
6. Medical suspension (§8 in architecture.md) extend into `admin.athletes.tsx`/`superadmin.athletes.tsx`
7. BOXOS Admin platform layer (§9) — only if/when you actually go multi-tenant