BOXOS — Screens
> Companion file: `architecture.md` (all logic, data model, tenancy model, scoring engine — none of that repeated here).
> Pure UI inventory: every screen, every card, every button, every field, every state. No colours/styling. Buttons named by action; fields by label + input type.
Global convention 1: every date field is a calendar-picker input; every time field is a clock-picker input. Applies everywhere below.
Global convention 2: every account-creation / first-activation moment includes a mandatory Terms & Privacy Policy checkbox — the primary submit button stays disabled until it's ticked. Applies to: Athlete Signup (§2.2), and the first-login flow for every invited role (Admin/Coach/Superadmin §2.8, External Judge §7.2).
---
0. Navigation Shells
BOXOS Admin: no tab bar — single console: Academies (home) · Platform Reports · Lifecycle Log (reachable via header icons)
Superadmin tab bar (own academy): Overview · Boxers · Fee Plans · Scheduling · Reports (Invoices, Judges, Users, Coupons, Discounts, Categories, Fitness Catalog, Settings via Overview quick-access) — collapses to Boxers + Fees only while the academy is suspended (§6.1a)
Admin tab bar: Overview · Boxers · Attendance · Fees · Scheduling · Reports (Invoices, Judges, Notifications, Settings via quick-access)
Coach tab bar: Rings (home) · My Boxers · Attendance · Notifications · Settings
Athlete (Boxer) tab bar: Home · Payments · Attendance · Schedule · Profile · Notifications (Settings via Profile)
External Judge: no tab bar — Login → Forced Password Change + Terms → My Bouts → Live Scoring. Persistent access-status banner on every screen.
---
1. Shared / Global Elements
Page header: title, optional subtitle, optional right-side action slot
Stat card: label, big value, optional badge/delta, optional icon, optional hint line
Section card: optional header (title/subtitle/action), body content
Badge/pill: short status label
Avatar (initials circle): small/medium/large
Empty state block: icon, title, description, optional CTA button
Loading state: centered spinner
Pull-to-refresh on every scrollable list
Search bar: text input + search icon + clear ("×") button
Filter chip row: horizontally scrollable selectable chips
Calendar-picker field: label, tap-target showing selected date (or placeholder), opens calendar overlay
Clock-picker field: label, tap-target showing selected time (or placeholder), opens clock overlay
Bottom-sheet modal shell: header (title + close), scrollable body, footer (Cancel + primary button)
Confirm dialog: title, message, Cancel, destructive/primary confirm
Toast/inline banner: icon, message, optional action link
Suspension banner (boxer, medical): icon, "Suspended" label, date-range text (or "Indefinite"), reason text — shown wherever a suspended boxer appears
Terms & Privacy checkbox row: checkbox + "I agree to the Terms of Service and Privacy Policy" text with inline links to each document
Read-only lockout banner (superadmin, suspended academy): icon, "Academy Suspended — Read-Only Access" text, short explanation, appears above the two still-accessible screens
---
2. Auth & Onboarding Screens
2.1 Login (shared shell, all roles land here except BOXOS Admin who has a separate console entry)
Logo mark + app name ("BOXOS")
Tagline
Card: "Welcome back" title, subtitle
Error banner (conditional)
Email field
Password field (show/hide toggle)
"Sign in" button (loading state)
"Forgot password?" link
"Don't have an account? Create one" row (athlete-facing copy only — staff accounts never see this row, they arrive via invite email)
2.2 Signup (Boxer, self-serve)
Logo + tagline
Card: "Get started" title, subtitle
Error banner (conditional)
Full name field
Email field
Password field (show/hide toggle)
Terms & Privacy checkbox row (required)
"Create account" button (disabled until Terms checked; loading state)
"Already have an account? Sign in" row
2.3 Forgot Password
Back link
Card: "Reset password" title, subtitle
Error banner
Email field
"Send reset link" button (loading state)
Success state: "Check your email" title, body, "Back to sign in" button
2.4 Academy Code Gate
Logo + app name, hero icon
Card: "Enter Academy Code" title, subtitle
Deadline banner (days-remaining text)
Error banner (conditional)
Access code field
"Verify & Continue" button (loading state)
Help text
2.5 Code Expired
Logo + app name, hero icon
Card: "Verification Expired" title, two body paragraphs
Divider
"Sign Out" button
Help text
2.6 Academy Suspended (full lockout — admin, coach, athlete, and superadmin-on-archived/deleted)
Logo + app name, hero icon (locked state)
Card: "Academy Access Suspended" title
Body text: explains the academy is temporarily unavailable, to contact platform support
"Sign Out" button
2.7 Onboarding Wizard (Boxer) — shell
Header: logo, "Complete your profile" title, "Step X of N" subtext
Progress bar
Step-indicator strip (circle + label per step, done/active/pending states)
Step card: icon box, "Section X of N" eyebrow, step title, step body
Bottom nav: "Back" (hidden step 1), spacer, "Continue"/"Submit Profile" button (loading state)
2.7.1 Step — Personal Details
Full name field (required)
Date of birth field (calendar picker, required)
Computed-age helper text
Gender chip select
Nationality field (required)
Phone field (required)
Email field (required)
City / State / Country fields (required)
Blood group chip select
2.7.2 Step — Guardian Details (conditional, minors)
Info banner
Guardian full name field (required)
Relationship chip select
Guardian phone field (required)
Guardian email field (optional)
Consent row: label + description + toggle switch (required)
2.7.3 Step — Boxing Profile
Stance chip select (Orthodox / Southpaw)
Declared weight field (numeric, kg)
Weight-category preview chip (read-only)
Height field (optional)
Reach field (optional)
Years boxing field (optional)
Current coach preference field (optional)
Preferred academy chip list
2.7.4 Step — Federation IDs
Info banner ("optional — update later")
National federation boxer ID field
State association ID field
International federation ID field
2.7.5 Step — Medical & Fitness
Blood group chip select (confirmation)
Known physical conditions field (multiline, optional)
Current medications field (multiline, optional)
Allergies field (multiline, optional)
Fitness declaration row: label + description + toggle switch (required)
2.7.6 Step — Emergency Contact
"Copy from guardian details" button (conditional)
Contact name field (required)
Relationship field (required)
Contact phone field (required)
Physician name/phone fields (optional)
2.7.7 Step — Review & Submit
Note text
Repeating section blocks (label/value rows) per: Personal, Guardian (if minor), Boxing Profile, Medical, Emergency
2.8 Staff First Login (Admin / Coach / Superadmin — shared shell, shown once after an invited account's first sign-in)
Card: "Welcome to BOXOS" title, subtitle ("Set your password to continue")
New password field (show/hide toggle)
Confirm password field
Error text (conditional)
Terms & Privacy checkbox row (required)
"Set Password & Continue" button (disabled until Terms checked; loading state)
---
3. Athlete (Boxer) Screens
3.1 Home
Page header: greeting + category subtitle, bell icon (badge count)
Suspension banner (conditional, medical `is_suspended`) — reason + date range/"Indefinite", note that training/bout participation is paused
Pregnancy declaration banners (conditional, adult female boxers only — upcoming/open/missed variants, see §3.9)
Payment Wall card (shown when access locked) — icon box, title/body (varies by state), plan detail box, invoice detail box (conditional), coupon field + Apply button + inline result, Pay-online/Pay-cash buttons, mode-specific sub-flows, Rollover button + sub-flow, error text, Refresh-status link, Sign-out link
Dashboard content (unlocked):
Stat row 1: Weight Category card, Age Category card
Stat row 2: Stance card, Verification card
Section card "Profile Summary": Full name / DOB / City-State / Coach / Academy rows
Section card "Record": Wins / Losses / KOs mini-stats
Section card "Recent Bouts": opponent, result badge, decision-type tag, date; empty state
Section card "Fitness Snapshot": latest result per test type (repeating mini-row), "View Full Fitness Profile →" link
3.2 Payments
Page header: "Fee & Payments" title, subtitle
Stat row: Total Paid card, Outstanding card
Section card "Current Fee Plan": Plan/Amount/Cycle/Status grid
Filter chip row: All / Paid / Unpaid / Overdue
Error banner (conditional), empty state (conditional)
Invoice card (repeating): number + billing period, status badge, amount-due row, balance row, due-date + overdue text, discount row (conditional), coupon field + Apply button (conditional), action row (state-dependent: Pay Online / Pay Cash / Rollover / pending banner / Download Receipt)
PayU WebView checkout modal (conditional): header + close, loading state, verifying overlay
3.3 Attendance
Page header: "Attendance" title, subtitle
Tab toggle: Attendance / Leave Requests
Stat row: Present card, Absent card, Approved Leaves card, Effective Attendance Rate card
Offline-pending banner (conditional)
Attendance tab:
Suspension notice (conditional): "Check-in disabled while suspended" banner, replaces the mark-present control
Section card "Mark Today's Session": geo-result banner (conditional), session-status banner, Mark-Present button (loading state) / Check-in-Closed disabled state / already-marked confirmation
Session feedback prompt (conditional, after check-in or bout completion): "How did today's session feel?" card — RPE scale selector (0–10 tap-to-select row), Comment field (multiline, optional), "Submit Feedback" button (loading state), "Skip" link
Section card "Recent Attendance (Last 30 days)": repeating row (status icon, date, status badge, distance-in-metres); empty state
Leave tab:
Section card "Apply for Leave": Start date field (calendar picker), End date field (calendar picker, defaults to start date), Reason field (multiline), "Submit Leave Application" button (loading state)
Section card "My Leave Requests": repeating row (date-range text, reason, status badge, rejection-reason subtext conditional); empty state
3.4 Schedule
Page header: "Schedule" title, subtitle
Calendar card: month/year + nav buttons, day-of-week labels, day-grid (date, today-highlight, selected-highlight, session-dot, cancelled-dot)
Selected-date sessions list: section title, repeating session card (template-name eyebrow, ring name + "CHANGED" badge, location row, time row, category badge, response controls)
Empty state
Section "📬 Practice Notifications": pending-count badge, repeating cards, empty state
Reason modal: "Can't attend?" title + close, hint, reason field (multiline, autofocus), Cancel button, Submit button (disabled until filled)
3.5 My Bouts
Page header: "My Bouts" title, record-summary subtitle
Filter chip row: All / Upcoming / Completed
Empty state
Repeating bout history card: opponent + avatar, date, tournament/ring name, category tag, result badge, decision-type tag, "View Scorecard →" link
Bout Scorecard detail: header (both boxers + corner tags, result banner), decision summary line, per-round score table, per-judge total row, event log list (conditional)
3.6 Profile
Page header: "My Profile" title, subtitle, settings gear icon
Suspension banner (conditional)
Hero card: avatar, full name, category subtitle, verification badge
Section card "Personal Information": DOB / Gender / Nationality / City-State / Country / Blood group rows
Section card "Contact Details": Email / Phone rows
Section card "Boxing Profile": Stance / Declared weight / Weight category / Age category / Height / Reach / Years boxing / Current coach rows
Section card "Federation IDs": three ID rows
Section card "Record": Wins/Losses/KOs mini-stats
Section card "Emergency Contact": Name/Relation/Phone rows
Section card "Physical Fitness Profile": tab/accordion per test type, chronological repeating row (date, value+unit, notes), empty state
3.7 Notifications
Page header: "Notifications" title, subtitle, "Mark all read" button (conditional)
Empty state
Repeating notification row: icon box, title, body (2-line clamp), timestamp, unread dot (conditional), "Tap to respond in Schedule" hint (conditional)
3.8 Settings
Page header: "Settings"
Profile summary card: avatar, name, email, role label
Section card "Account": "Notifications" row (chevron), "Privacy & Security" row (chevron)
Section card: "Sign out" row (confirm dialog)
Version footer text
3.9 Pregnancy Declaration (adult female boxers only — every assigned session day, training and bouts alike; never shown to minors — `architecture.md` §9)
Upcoming banner (Home screen, conditional — session assigned but window not yet open): "Declaration will open 24h before {session name}, {date}" info row, no action available yet
Open banner (Home screen, conditional — window currently open for one or more upcoming sessions): repeating row per open declaration — session name + date/time, "Declare Now →" link
Missed banner (Home screen, conditional — session start passed with nothing submitted): warning-toned row — session name + date, "Declaration window closed — contact your coach" note (not resubmittable from here once truly missed and the session has started, unless the coach hasn't yet resolved it, in which case a "Declare Now" action still shows since submission isn't hard-cut-off — see architecture.md §9.1 step 3)
Declaration screen (opened from any of the above):
Header: "Pre-Session Declaration" title, session context line (ring/session name, date, time, and — if it's a bout — opponent name)
Declaration text: "I declare that I am not currently pregnant."
Checkbox (required)
"Submit Declaration" button (disabled until checked; loading state; confirm dialog since it's immutable once submitted)
Post-submit state: "Declaration recorded" confirmation banner, timestamp shown, no further edit controls
---
4. Coach Screens
4.1 Rings (Home / Live Dashboard)
Page header: "Today's Rings" title, subtitle (date + assigned-ring count)
Pending Pregnancy Declarations card (conditional — persistent, not dismissable, appears from T-minus-1-hour before any assigned session/bout until resolved): title "Declarations Pending", repeating row per non-compliant boxer — name, session/ring name, time-until-session countdown text, "Call" action (opens device dialer with her registered phone), "Swap/Remove for Today" button (opens the same-day roster-edit sheet below)
Swap/Remove for Today sheet (scoped, same-day only — not general schedule editing): header + close button, current-boxer summary, "Remove from today's session" button (training) OR replacement-boxer picker (bout — searchable, same weight/age/gender filter as the original assignment) + "Confirm Swap" button, confirm dialog before either action
Empty state
Repeating ring control card:
Ring name header + venue subtext
Current-bout summary: both boxers' names + corner tags, category tag, bout number
Suspended-boxer flag (conditional, defensive display)
Round indicator, live countdown display, round-state badge
Control button row: Start / Pause / Resume / End Round — always available to the assigned coach regardless of whether they're also a scoring judge on this bout
Quick-event button row: Knockdown / Warning / Foul / Low Blow / Injury Timeout
Knockdown-count mini display (red/blue)
Inline scoring form (conditional, only if this coach is also a `bout_judge_assignment` for this bout): score chip rows (10/9/8/7) per corner, "Submit Round Score" button
"End Bout — Record Decision" button (only enabled for the assigned coach — this is the action that marks the bout `completed` and, once every bout in the tournament reaches a terminal state, triggers judge-credential expiry)
"Expand / Focus this ring" toggle
Next-bout preview strip (conditional, per ring)
4.2 Log Event Modal
Header + close button
Event-type chip select
Boxer-target chip select (Red / Blue)
Description field (multiline, optional)
Point-deduction indicator text (conditional, Warning type)
Cancel button, "Log Event" button
4.3 Record Bout Decision Modal
Header + close button
Panel tie-break prompt (conditional, shown only when the judge panel splits exactly even — 2-judge or 4-judge bouts): "Judges are evenly split — you must select the winner" note, Red/Blue selection buttons
Decision-type chip select (WP/RSC/RSC-I/ABD/DSQ/DQB/KO/WO/DKO/BDSQ)
Winner-boxer chip select
Reason/detail field (multiline)
Round/time-of-stoppage field (conditional)
Cancel button, "Confirm Decision" button (confirm dialog — irreversible)
4.4 My Boxers
Page header: "My Boxers" title, subtitle (count)
Search bar
Filter chip row (weight/age category)
Repeating boxer row: avatar, name, category tags, record mini-text, suspension badge (conditional), "View" chevron
Boxer quick-view: avatar + name, category tags, stance, medical-flag summary, suspension banner (conditional), recent bout history mini-list, record stats, fitness snapshot mini-list
4.5 Attendance (assist view)
Page header: "Attendance" title, subtitle
Search bar
Repeating row: boxer name, present/absent status, "Mark Present" quick-action button, suspension indicator (conditional, row disabled + note)
4.6 Notifications
Same inventory as §3.7, coach-scoped feed
4.7 Settings
Same inventory as §3.8, role label "Coach"
---
5. Admin Screens
5.1 Overview
Page header: "Academy Overview" title, subtitle (date + boxer count)
Stat row 1: Total Boxers card, Present Today card
Stat row 2: Pending Leaves card, Collection Rate card
Stat row 3: Suspended Boxers card
Section card "Recently Onboarded Boxers": repeating row; empty state
Section card "Pending Leave Requests": repeating row (date range text) or "No pending leave requests" banner
Quick-access card: Invoices row, Judges row, Notifications row, Settings row
5.2 Boxers
Page header: "Boxers" title, subtitle (count), "Export CSV" button
Search bar
Filter chip row: All / Unassigned / Cash Pending / Paid / Overdue / Suspended
Empty state
Repeating boxer card: avatar, name, city + category subtext, pay-status badge, suspension badge (conditional), assigned-plan mini-text (conditional), action row: Assign/Reassign Package button, Approve Cash button (conditional), Verify toggle, Suspend button (conditional, active boxers) / Reinstate button (conditional, suspended boxers)
"Load more" button
Assign Fee Package modal: title, boxer subtitle, repeating plan-option row, Cancel/"Send Package" buttons
Suspend Boxer modal: title, boxer subtitle, Reason field (multiline, required), Start date field (calendar picker, default today), End date field (calendar picker, optional — "Leave blank for indefinite" hint), Cancel/"Suspend Boxer" buttons (confirm dialog)
Reinstate Boxer modal: title, boxer subtitle, current suspension summary, optional note field, Cancel/"Reinstate Boxer" buttons
5.3 Attendance & Leaves
Page header: "Attendance & Leaves" title, subtitle, "Export" button
Attendance-poll banner: title/subtitle, "Send" button (disabled + "Sent" state)
Tab toggle: Attendance Overview / Leaves (badge count)
Overview tab: search bar, section card "Attendance Summary" — repeating row (present/absent/leave mini-counts, effective-rate percentage, pending-leave badge); empty state
Leaves tab: repeating row (name, date-range text, reason, Approve/Reject buttons or status badge); empty state
5.4 Fees
Page header: "Fee Management" title, subtitle, "New Plan" button
Section card "Fee Plans": repeating row; empty state
Section card "Cash Pending Approval" (conditional): repeating row + Approve button
Section card "Recent Assignments": repeating row
"New Fee Plan" modal (redirect messaging + "Got it" button)
5.5 Invoices & Dues
Page header: "Invoices & Dues" title, subtitle, "Export" button
Stat card row: Outstanding, Overdue count, Collected-this-month
Cash-pending box (conditional)
Search bar, filter chip row
Repeating invoice row (action icons: Send Reminder / Record Payment / Download Receipt)
"Load more" button, footer summary
Record Payment modal: Amount field, outstanding-hint text, payment-mode chip select, reference field (optional), Cancel/"Record payment" buttons
5.6 Scheduling — Rings & Sessions
Page header: "Ring Scheduling" title, subtitle, "New Schedule" button
Mini calendar card, legend row
Section "Active Schedules": repeating template card, delete icon button
Empty state
Day Detail bottom sheet: repeating ring card (Edit-for-today button, Notify button, pregnancy-declaration mini-summary conditional on adult-female rostered boxers — "X/Y declared" text), Cancel-session button
Override Editor modal: Location segmented control + fields, Time fields (clock pickers), category-filtered boxer-roster picker (suspended boxers excluded), Reason field, "Save Override for Today" button
New Schedule Wizard: Step 1 Basics (Name, Is-Tournament toggle, Days-of-week, Valid-from/to calendar pickers), Step 2 Rings (Add-Ring sub-form: name, From/To clock pickers, location, category pickers, boxer roster checklist with suspended-exclusion), Step 3 Review & Create
5.7 Bout Management
Page header: "Bouts — {Ring}, {date}" title, "Add Bout" button
Repeating bout card: bout number, both boxers + corner tags, category tag, status badge, coach-assigned indicator (name or "⚠ No coach assigned" warning badge), pregnancy-declaration status badge (conditional, adult female boxer(s) only — "Declared" / "Pending" / "Missed"), round-count+duration subtext, judge-count subtext, "View/Edit" chevron
Add/Edit Bout modal: Red-corner boxer picker (searchable, filtered to the weight category's gender, suspended boxers excluded), Blue-corner boxer picker (same filter), Age-category chip picker, Weight-category chip picker, Round-count field, Round-duration field (seconds), Rest-duration field (seconds), Judge-count field (numeric stepper, 1–5), Coach picker (required for tournament-kind bouts — validation blocks save without one), Bout-kind toggle, Cancel/Save buttons
Weigh-in Confirm modal: Red declared-weight field, Blue declared-weight field, "Confirm Weigh-in" button
Assign Judges modal: repeating judge-slot row (up to `judge_count` slots), "Add Judge" button → sub-picker (Coach / External-invite / Admin)
5.8 Judges
Page header: "External Judges" title, subtitle (tournament context)
Tournament picker
"Invite Judge" button
Repeating invite row: email, name, status badge, invited-date text, "Revoke Access" button (conditional)
Empty state
Invite Judge modal: Email field, Full name field (optional), tournament-scope confirmation text, Cancel/"Send Invite" buttons
"End Tournament Now" action (manual override — primary completion path is automatic once every bout is terminal, per architecture.md §7.5): confirm dialog (incomplete-bout warning + count), "End Tournament & Revoke Judge Access" confirm button
5.9 Reports
Page header: "Reports" title, subtitle
Tab row: Revenue / Outstanding Dues / Payment per Boxer / Discounts / Collection Rate / Bout Results
Standard stat-card/chart/table content per tab (unchanged from prior spec)
5.10 Notifications
Same inventory as coach/athlete notification screens, admin-scoped
5.11 Settings
Card "Account information", Card "My academy location", Card "Security"
---
6. Superadmin Screens (own academy — no cross-academy visibility)
6.1 Overview (full access — academy `active`)
Page header: "Academy Overview" title, subtitle
Stat grid: Boxers card, Coaches/Admins card, Monthly revenue card, Suspended Boxers card
Section card "Attendance & health snapshot"
Section card "Quick access": Ring Scheduling, User Management, Discounts & Penalties, Coupon Codes, Categories Config, Fitness Test Catalog, System Settings rows
Academy status banner
6.1a Read-Only Mode (academy `suspended` — replaces the entire tab bar except Boxers/Fees)
Read-only lockout banner (persistent, top of every accessible screen): reason text, suspended-since date
Tab bar reduces to: Boxers (read-only variant of §6.2 — all Suspend/Reinstate/Assign/Verify buttons removed, list-view only) and Fees/Collections (read-only variant of §6.4/§6.5 — figures visible, no Record Payment / New Plan / Approve actions)
Every other former tab/quick-access item either absent from navigation or, if deep-linked, shows a "Not available while your academy is suspended" blocking message
6.2 Boxers
Same element inventory as §5.2, scoped to own academy, same suspend/reinstate actions (full mode only — see §6.1a for the suspended-academy read-only variant)
6.3 Boxer 360 Detail
Header bar: back, name+category subtitle, refresh icon
Suspension banner (conditional): reason, date range/indefinite, inline "Reinstate" button
Hero card, alert banners, stats 4-grid
Tab bar: Profile / Finance (count) / Sessions / Leaves / Bouts / Fitness
Profile tab, Finance tab, Sessions tab (effective-rate shown), Leaves tab (date-range), Bouts tab
Fitness tab: per-test-type accordion, repeating record row, "Add Record" button → Add Fitness Record modal (Test-type chip picker, Value field, Date field (calendar picker), Notes field, Cancel/Save)
Suspend/Reinstate modals — same as §5.2
6.4 Fee Plans (own academy)
Same inventory as before: repeating plan card, Create/Edit modal
6.5 Reports (own academy)
Same tab inventory as §5.9
6.6 Users (own academy)
Page header: "User Management" title, subtitle, "Invite" button
Search bar
Repeating user row: avatar, name (+"(you)" tag), email, role badge (Admin or Coach only — a superadmin's own account is shown but not editable/creatable from here, see below), active/inactive badge, joined-time text, Deactivate/Activate button (hidden for self)
"Load more" button
Invite User modal: Full name field, Email field, Temporary password field (show/hide toggle), Role chip select — Admin / Coach only (Superadmin is never a creatable option here — creating a superadmin is exclusively a BOXOS-portal action, per architecture.md §1.2), error text, Cancel/"Create account" buttons
Info note at the bottom of the screen: "Need another superadmin for this academy? Contact BOXOS support — superadmin accounts can only be created from the BOXOS platform console."
6.7 Coupons (own academy)
Same inventory as before
6.8 Discounts (own academy)
Same inventory as before
6.9 Age & Weight Categories (own-academy overrides)
Same inventory as before ("BOXOS Default"/"Custom" badges, Add/Edit modals)
6.10 Fitness Test Catalog (own-academy)
Same inventory as before
6.11 Settings
Card "Account information", "My academy location", "Academy Access Codes", "Payment Gateway Settings", "Security", "Danger Zone"
---
7. External Judge Screens
7.1 Login
Logo + app name, tagline ("Judge Portal")
Card: "Judge sign in" title
Error banner (conditional)
Email field
Temporary password field (show/hide toggle)
"Sign in" button (loading state)
Info note: access is single-tournament and time-limited
7.2 Forced Password Change + Terms (first login)
Card: "Set your password" title, subtitle
New password field (show/hide toggle)
Confirm password field
Error text (conditional)
Terms & Privacy checkbox row (required)
"Set Password & Continue" button (disabled until Terms checked; loading state)
7.3 Access Status Banner (persistent)
Tournament name text
Access-state badge (Active / Expiring soon / Expired)
Expiry countdown text (conditional)
7.4 My Bouts (home)
Page header: "My Bouts" title, tournament-name subtitle
Empty state
Repeating bout row: bout number, both boxers + corner tags, category tag, status badge, "Score this bout →" chevron
7.5 Live Scoring
Header: bout number + category tag, both boxers + corner tags
Read-only live timer (round X of N, countdown, round-state badge)
Event feed (read-only, collapsible)
Round scoring form (active-round only): "Who won this round?" prompt, Red/Blue select buttons, loser-score chip select (7/8/9), winner-score fixed display ("10 — automatic"), "Submit Round Score" button, post-submit confirmation banner
Past-rounds summary strip
Bout-completion state (conditional): decision banner, full scorecard table, "Back to My Bouts" button
7.6 Access Expired
Icon (locked/expired state)
Title: "Access Expired"
Body text
No further navigation (auto-redirect to 7.1)
---
8. BOXOS Admin Screens (platform layer)
8.1 Academies (home)
Page header: "Academies" title, subtitle (total + status breakdown), "Create Academy" button
Search bar
Filter chip row: All / Active / Suspended / Archived
Repeating academy card: logo/avatar, name, city+state subtext, status badge, boxer-count mini-stat, superadmin-count mini-stat, onboarded-date text, action row: "View" chevron, Suspend/Reactivate button (state-dependent), Archive button (conditional, active/suspended only)
Empty state
8.2 Create Academy modal
Header: "Create New Academy" title + close button
Academy name field
Address field
City / State fields
Latitude / Longitude fields, "Locate Me" button
Attendance geofence radius field (numeric metres)
Divider, "Initial Superadmin(s)" section header
Repeating superadmin-invite row: Full name field, Email field, remove button
"Add another superadmin" button
Cancel button
"Create Academy & Send Invites" button (loading state)
8.3 Academy Detail
Header bar: back button, academy name + status badge, refresh icon
Info card: logo/name/address/city-state, geofence-radius row, gateway-configured indicator
Stat row: Total Boxers, Total Staff, Monthly Revenue, Suspended Boxers
Section card "Superadmins": repeating row (avatar, name, email, active/inactive badge), "Invite Superadmin" button (opens a single-invite variant of §8.2's superadmin-row form — the only ongoing way to add a superadmin to an existing academy)
Section card "Lifecycle History": repeating row (event-type badge, reason text, actor name, timestamp)
Action row: Suspend Academy / Reactivate Academy button (state-dependent), Archive Academy button
Delete Permanently button (conditional — only rendered once the academy has been `archived` for 7+ days; absent/disabled with a "Available from {date}" hint before then)
Suspend Academy modal: reason field (required), lockout-warning text, Cancel/"Suspend" buttons (confirm dialog)
Archive Academy modal: soft-delete explanation text, "type the academy name to confirm" field, Cancel/"Archive" buttons
Delete Permanently modal: warning text ("This will export all academy data to CSV and then permanently delete it. This cannot be undone."), "type the academy name to confirm" field, Cancel button, "Export & Delete Permanently" button (loading state: "Exporting data…" → auto-triggers file download → then "Deleting…" → success state)
8.4 Platform Reports
Page header: "Platform Reports" title, subtitle
Stat grid: Total Academies, Total Boxers, Total Revenue, Active Tournaments (all platform-wide)
Section card "Academies by status"
Section card "Top academies by revenue"
Date-range chip row
8.5 Lifecycle Log
Page header: "Platform Activity Log" title, subtitle
Search/filter chip row (by academy, by event type)
Repeating row: academy name, event-type badge, reason text, actor name, timestamp
Empty state, "Load more" button