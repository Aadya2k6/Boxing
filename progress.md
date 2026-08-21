# BOXOS - Development Progress Tracker (16 Parts)

## 🟢 Completed Parts (9/16)

### Part 1: Authentication & Security Core
- [x] Full RBAC implementation (`superadmin`, `admin`, `coach`, `athlete`, `boxos_admin`, `external_judge`).
- [x] Secure RLS (Row Level Security) across all critical tables.
- [x] Supabase Edge Functions (`gateway-secrets`, `platform-reports`).

### Part 2: Multi-Center Tenant Architecture
- [x] Migration from flat `academies` to hierarchical `academies` -> `centers`.
- [x] Admin and Coach scope restricted to specific `center_id`.
- [x] Superadmin Dashboard for multi-center management.

### Part 3: Payment Gateway Integrations
- [x] Razorpay & PayU multi-tenant integration with per-center keys.
- [x] Client-side fallbacks & webhook syncs.
- [x] Athlete dashboard payment flow.

### Part 4: Core User Dashboards
- [x] Athlete profiles, medical records, and verification basics.
- [x] Superadmin & Admin UI foundations.
- [x] Coach Dashboard baseline.

### Part 5: Fee & Coupon Management
- [x] Plan creation, assignment, and discount handling.
- [x] Invoice generation.

### Part 6: Attendance & Leave Management
- [x] Geotagged attendance tracking.
- [x] Leave requests and approval flows.

### Part 7: Notice & Ad Placement Systems
- [x] Sophisticated frontend UI placeholders for 1 complementary global Notice and 1+ Ads.
- [x] Target-specific rendering on dashboards.

### Part 8: Ring Allocation & Center Synchronization
- [x] Simultaneous ring allocation integrated directly into the Center creation flow for Superadmins.
- [x] `academy_locations` mapped directly to Centers.

### Part 9: Medical Suspensions & Athlete Roster Filtering
- [x] Suspending athletes and blocking check-ins.
- [x] Auto-excluding suspended athletes from bout selection and rosters.

---

## 🟡 In Progress / Next Up (0/16)

*(No active development - pending architecture review)*

---

## 🔴 Pending Parts (7/16)

### Part 10: Database & Backend Polishing
- [ ] Fix Admin Feature Permissions (requires Edge Function or RLS tweak).
- [ ] Notices & Ads System Backend (storage buckets, DB tables, and RLS).

### Part 11: Government Academy Fee Disabling
- [ ] Implement a `fees_disabled` toggle managed by the BOXOS Admin (dev account) to completely disable fee flows for government-backed academies.

### Part 12: Minor Guardian Accounts
- [ ] Introduce a distinct `guardian` portal/account type.
- [ ] Allow guardians to manage minor athlete schedules.

### Part 13: Federation Portals (National, State, Custom)
- [ ] Create specialized Federation portals via dev account.
- [ ] Data filtering rules (National = all, State = state-only, Custom = specific allied cities/regions).
- [ ] Restrict access to display only athlete sports data (matches, demographics) and hide academy-sensitive schedules.
- *Note: User will create a separate DB/tables for Federations. Do not mix with existing roles/permissions.*

### Part 14: Federation Tournament Engine & Staff SOP
- [ ] Implement World Boxing rules tournament creation for Federations.
- [ ] Enable nationwide/regionwide student selection.
- [ ] Auto-generation of Tournament Staff (Judges, Referees, Time Handlers) with cross-functional permissions (e.g., time handler can also referee).
- [ ] Automated push notifications to selected students, coaches, and academies.
- [ ] Auto-revoke all tournament staff credentials the moment scores are finalized. *(Left to do: Needs clarification on whether to set `is_active = false` or just clear `judge_scope_tournament_id`. Kept false/disabled for now).*

### Part 15: Attendance Polls & Pregnancy Declarations
- [ ] Attach Pregnancy Declarations directly to class attendance poll notifications.
- [ ] Route minor pregnancy declarations exclusively to the new Guardian accounts.

### Part 16: Final Analytics, E2E Testing, & Production
- [ ] Comprehensive Superadmin Analytics (revenue by center, growth metrics).
- [ ] BOXOS Admin global statistics.
- [ ] E2E testing of payment flows with real Sandbox keys.
- [ ] Production deployment and environment lock-down.
