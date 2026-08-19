# BOXOS - Development Progress Tracker

## 🟢 Completed (What is done)

### 1. Authentication & Security
- [x] Full RBAC implementation (`superadmin`, `admin`, `coach`, `athlete`, `boxos_admin`, `external_judge`).
- [x] Secure RLS (Row Level Security) across all critical tables (`invoices`, `payments`, `profiles`, `boxer_profiles`).
- [x] Supabase Edge Functions (`gateway-secrets`, `platform-reports`) to isolate sensitive data away from the client.

### 2. Multi-Center (Location) Management
- [x] Migration from flat `academies` to hierarchical `academies` -> `centers`.
- [x] **Superadmin Dashboard**: Can view and edit multiple centers.
- [x] **Admin/Coach Assignments**: Admins and Coaches are restricted to their assigned `center_id` instead of the global `academy_id`.

### 3. Payment Gateway Integrations
- [x] Razorpay & PayU multi-tenant integration.
- [x] Per-center payment key configuration via Edge Function.
- [x] Client-side fallback mechanisms for edge functions.
- [x] Athlete dashboard payment processing flow (`athlete.payments.tsx`).
- [x] Payment verification webhooks and database sync (`payments` and `invoices` tables).

### 4. User Dashboards & Modules
- [x] **Superadmin Dashboard**: Academy locations, overall stats, global settings.
- [x] **Admin Dashboard**: Coach management (`admin.coaches.tsx`), Fee management scoped to center (`admin.fees.tsx`).
- [x] **Athlete Dashboard**: Payment history, fee assignments, profile details.
- [x] **Coach Dashboard**: Basic foundation.

---

## 🟡 In Progress (Currently working on)

### 1. Refactoring Aftermath
- [/] Ensuring UI stability across all tables after migrating foreign keys to use `center_id` instead of `academy_id` directly. 

### 2. Notifications & Alerts
- [/] Implementing real-time notifications for athletes when fees are generated or overdue.

---

## 🔴 Pending (What is left)

### 1. Advanced Modules
- [ ] **Bout Scheduling & Matchmaking**: Fully functional UI for creating brackets and bout matches between athletes.
- [ ] **External Judge Scoring**: Finalize the real-time scoring interface for `external_judge` roles during tournaments.
- [ ] **Attendance Tracking System**: QR code-based or manual attendance logging for athletes by coaches/admins.
- [ ] **Leave Management**: Allow athletes to request leaves and have admins approve/reject them with automated fee roll-overs.

### 2. Analytics & Reporting
- [ ] **Comprehensive Superadmin Analytics**: Drill down revenue reports by `center_id`, growth metrics, and churn rates.
- [ ] **BOXOS Admin Platform View**: Global platform statistics, active vs. inactive academies.

### 3. Production Readiness
- [ ] Deployment and environment variable configuration for production.
- [ ] E2E testing of the payment flows with real Sandbox/Test API keys from both Razorpay and PayU.
- [ ] Finalizing terms of service and legal opt-ins on the athlete onboarding screen.
