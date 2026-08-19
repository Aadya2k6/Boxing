# BOXOS - Architecture and Implementation Plan

## 1. Project Overview
**BOXOS** is a comprehensive Boxing Academy Management SaaS platform. It handles the complete lifecycle of a boxing academy, ranging from managing multiple training centers to athlete onboarding, attendance, fee collection (via Razorpay/PayU), bout scheduling, and judge scoring.

### 1.1 Key Stakeholders / Roles
- **BOXOS Admin:** The platform owner who manages multiple academies across the system.
- **Superadmin:** The owner/director of a specific Academy. They oversee all training centers (locations) within their academy.
- **Admin:** A manager assigned to a specific Center within an Academy. They handle day-to-day operations like fee assignments and coach management.
- **Coach:** Assigned to specific Centers to manage athlete training, scheduling, and bout scoring.
- **Athlete:** The boxers who use the portal to pay fees, track attendance, and view bout history.
- **External Judge:** Temporary role for scoring specific bouts or tournaments.

## 2. Tech Stack
- **Frontend Framework:** React 19 + Vite
- **Routing:** Tanstack Router (File-based routing)
- **Styling:** Tailwind CSS v4 + Radix UI Primitives + Lucide Icons
- **Backend/Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (JWT)
- **Serverless Compute:** Supabase Edge Functions (Deno)
- **Payment Gateways:** Razorpay and PayU

## 3. Database Architecture
The database leverages Supabase Postgres with strong Row Level Security (RLS). 

### Core Tables
- `academies`: Top-level tenant.
- `centers`: Physical locations belonging to an academy.
- `profiles`: Auth-linked user profiles defining roles (`superadmin`, `admin`, `coach`, etc.).
- `boxer_profiles`: Specialized data for athletes (medical, weight, stance, stats).
- `fee_plans` & `fee_assignments`: Configuration of recurring or one-time fees per center.
- `invoices` & `payments`: Tracking dues and successful gateway transactions.
- `admin_center_assignments` & `coach_center_assignments`: Relational mapping for role permissions per location.

## 4. Implementation Strategy

### Phase 1: Core Foundation (Completed)
- Setup Supabase, Tanstack Router, and basic UI components.
- Implement RBAC (Role-Based Access Control) using guards (`useAuth`).
- Create login and onboarding flows for Athletes and Staff.

### Phase 2: Multi-Center Tenant Architecture (Completed)
- Refactor system to allow Superadmins to manage multiple `centers`.
- Isolate Admins and Coaches to specific `centers`.
- Ensure RLS policies correctly sandbox data based on `academy_id` and `center_id`.

### Phase 3: Payment Integrations (Completed)
- Implement `gateway-secrets` Edge Function to securely encrypt/decrypt Razorpay and PayU keys.
- Create payment flows in the Athlete dashboard (`athlete.payments.tsx`).
- Configure invoice generation and payment verification webhooks.

### Phase 4: Module Development (In Progress)
- **Athletes:** Profiles, medical records, and verification.
- **Fees:** Plan creation, assignment, and discount handling.
- **Attendance:** Daily tracking and leave requests.
- **Bouts & Judges:** Scheduling matches and handling external judge scoring.

### Phase 5: Polish & Analytics (Pending)
- Advanced reporting and analytics for Superadmins and BOXOS Admins.
- Push notifications / Email alerts for due fees and upcoming bouts.
- Mobile responsiveness optimizations.
