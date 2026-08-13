import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site/Chrome";
import {
  ArrowUpRight, Crosshair, ShieldCheck, Receipt,
  LayoutDashboard, CreditCard, Tag, Activity, ChevronRight,
  Users, CheckCircle2, Zap, Trophy, Target, BarChart3,
  FileText, Bell, Lock
} from "lucide-react";

export const Route = createFileRoute("/")(({
  head: () => ({
    meta: [
      { title: "Boxos — Precision Management for Elite Boxing Academies" },
      { name: "description", content: "Institutional-grade onboarding, fees, and operations for boxing academies." },
      { property: "og:title", content: "Boxos — Precision Management for Elite Boxing Academies" },
    ],
  }),
  component: LandingPage,
} as any));

function LandingPage() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <SiteHeader />
      <Hero />
      <LogoStrip />
      <Features />
      <HowItWorks />
      <DashboardPreview />
      <Testimonials />
      <CTA />
      <SiteFooter />
    </div>
  );
}

/* ── Hero ───────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="relative overflow-hidden bg-background">
      {/* Background layers */}
      <div className="absolute inset-0 dot-pattern opacity-50" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] gold-glow opacity-60 blur-3xl" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full" style={{ background: "radial-gradient(ellipse, rgba(58,123,217,0.06) 0%, transparent 70%)" }} />

      <div className="relative max-w-7xl mx-auto px-6 pt-16 pb-20 lg:pt-20 lg:pb-28">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left — copy */}
          <div className="animate-fade-up">
            {/* Pill badge */}
            <div className="inline-flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-full border border-primary/30 bg-primary/6 text-primary-dark mb-8">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              Now onboarding pilot academies — May 2026
            </div>

            {/* Hero headline */}
            <h1 className="text-hero font-display">
              Run your academy<br />
              with{" "}
              <span className="text-gradient-gold">
                precision.
              </span>
            </h1>

            <p className="mt-8 text-base md:text-lg text-muted-foreground max-w-lg leading-relaxed">
              Boxos is the institutional-grade operating system for boxing academies. Onboard athletes, automate fees, and command operations from one calm interface.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                to="/onboarding"
                className="group inline-flex items-center gap-2 bg-[#ef4444] text-white px-6 py-3.5 rounded-xl text-sm font-semibold hover:bg-[#dc2626] transition-all shadow-elevated hover:shadow-modal"
              >
                Start onboarding
                <ArrowUpRight className="size-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
            </div>

            {/* Social proof */}
            <div className="mt-12 flex items-center gap-6">
              <div className="flex -space-x-2.5">
                {["AM", "SK", "VP", "RI"].map((initials, i) => (
                  <div
                    key={i}
                    className="size-9 rounded-full border-2 border-background font-display font-bold text-xs grid place-items-center text-primary-foreground"
                    style={{
                      background: `linear-gradient(135deg, #9E7C2A ${i * 15}%, #C9A84C 100%)`,
                      zIndex: 4 - i
                    }}
                  >
                    {initials}
                  </div>
                ))}
              </div>
              <div>
                <div className="font-semibold text-sm">Trusted by 12 pilot academies</div>
                <div className="text-xs text-muted-foreground mt-0.5">Across 6 disciplines · 480+ athletes</div>
              </div>
            </div>
          </div>

          {/* Right — hero card */}
          <div className="relative animate-fade-up delay-200 hidden lg:block">
            <HeroCard />
          </div>
        </div>

        {/* Feature pill row */}
        <div className="mt-16 flex flex-wrap gap-2 animate-fade-up delay-400">
          {[
            { icon: ShieldCheck, label: "Aadhaar OTP Verified" },
            { icon: CreditCard, label: "Razorpay Integrated" },
            { icon: Zap, label: "Real-time Sync" },
            { icon: Lock, label: "Row-Level Security" },
            { icon: Bell, label: "Auto Reminders" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="inline-flex items-center gap-2 text-xs font-medium px-3.5 py-2 rounded-full border border-border bg-surface text-muted-foreground shadow-xs">
              <Icon className="size-3.5 text-primary" strokeWidth={2} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HeroCard() {
  return (
    <div className="relative">
      {/* Glow */}
      <div className="absolute -inset-10 gold-glow blur-3xl opacity-40" />

      {/* Main card */}
      <div className="relative bg-surface border border-border rounded-2xl shadow-modal p-1 rotate-1 hover:rotate-0 transition-transform duration-700">
        {/* Top bar */}
        <div className="bg-foreground rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-white/10 grid place-items-center">
                <Crosshair className="size-4 text-white" strokeWidth={1.75} />
              </div>
              <div>
                <div className="text-[10px] text-white/50 uppercase tracking-widest font-semibold">Athlete profile</div>
                <div className="font-display font-bold text-white text-sm mt-0.5">Aarav Mehta</div>
              </div>
            </div>
            <span className="badge badge-success">Verified</span>
          </div>

          {/* Stats in dark */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { l: "Discipline", v: "10m Air Pistol" },
              { l: "Year", v: "Year 3 · Elite" },
              { l: "Score", v: "583 / 600" },
            ].map(({ l, v }) => (
              <div key={l} className="bg-white/8 rounded-lg p-3">
                <div className="text-[9px] text-white/40 uppercase tracking-wider">{l}</div>
                <div className="text-xs font-semibold text-white mt-1">{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Fee card */}
        <div className="p-4">
          <div className="bg-subtle rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="label-micro">Fee status · Q2 2026</span>
              <span className="badge badge-success">Paid</span>
            </div>
            <div className="text-stat font-display tabular mt-2">₹ 24,000</div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>Next due: 15 Aug 2026</span>
              <span className="badge badge-gold">Quarterly</span>
            </div>
          </div>

          {/* Mini progress */}
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-muted-foreground">Sessions this month</span>
              <span className="font-semibold">18 / 20</span>
            </div>
            <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
              <div
                className="h-full rounded-full bar-fill"
                style={{ "--fill-width": "90%", background: "linear-gradient(90deg, #9E7C2A, #C9A84C)" } as any}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Floating mini card */}
      <div className="absolute -bottom-6 -left-8 bento-card p-3.5 flex items-center gap-3 shadow-elevated">
        <div className="size-9 rounded-lg bg-success/10 grid place-items-center">
          <CheckCircle2 className="size-4 text-success" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Payment received</div>
          <div className="font-display font-bold text-sm tabular">₹ 24,000</div>
        </div>
      </div>

      {/* Floating badge */}
      <div className="absolute -top-4 -right-4 bento-card px-3.5 py-2 shadow-elevated">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs font-semibold">Live dashboard</span>
        </div>
      </div>
    </div>
  );
}

/* ── Logo Strip ─────────────────────────────────────────────────────── */
function LogoStrip() {
  const logos = ["NRAI", "SAI", "AAI", "WFI", "ISSF", "Khelo India"];
  return (
    <div className="border-y border-border bg-surface">
      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <span className="label-micro">Aligned with</span>
        {logos.map((l) => (
          <span key={l} className="font-display font-bold text-base text-muted-foreground/50 tracking-tight hover:text-muted-foreground transition-colors">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Features ───────────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Aadhaar OTP Onboarding",
    body: "Self-serve athlete profiles verified in seconds. Auto-approval flow with admin escalation when anything looks off.",
    color: "text-success",
    bg: "bg-success/8",
  },
  {
    icon: Receipt,
    title: "Automated Fee Invoicing",
    body: "Recurring plans, partial payments, auto-reminders, late penalties. Razorpay built in for instant checkout.",
    color: "text-primary-dark",
    bg: "bg-primary/8",
  },
  {
    icon: LayoutDashboard,
    title: "Three-Tier Dashboards",
    body: "Distinct surfaces for athletes, academy admins, and superadmins — the right data for the right role.",
    color: "text-info",
    bg: "bg-info/8",
  },
  {
    icon: CreditCard,
    title: "Razorpay Integration",
    body: "One-click checkout, instant receipts, refund queue. Reconciliation happens in the background, automatically.",
    color: "text-primary-dark",
    bg: "bg-primary/8",
  },
  {
    icon: Tag,
    title: "Discounts & Scholarships",
    body: "Sibling, merit, and custom concessions. Override per-athlete with full audit trail and approval workflow.",
    color: "text-warning",
    bg: "bg-warning/8",
  },
  {
    icon: Activity,
    title: "Real-time Dues Tracking",
    body: "Outstanding balances, collection rate, overdue cohorts. Live, exportable, board-ready reports.",
    color: "text-info",
    bg: "bg-info/8",
  },
];

function Features() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-28">
      <div className="max-w-2xl mb-16">
        <div className="label-micro text-primary-dark mb-4">What's inside</div>
        <h2 className="text-h1 font-display">
          Built for the rituals<br />of elite training.
        </h2>
        <p className="mt-5 text-muted-foreground text-base leading-relaxed max-w-lg">
          No bloat. No clutter. Every screen earns its place — modeled on how disciplined academies actually run their day.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className="bento-card p-7 group cursor-default"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className={`size-11 rounded-xl ${f.bg} grid place-items-center mb-5 transition-transform group-hover:scale-110 duration-200`}>
                <Icon className={`size-5 ${f.color}`} strokeWidth={1.75} />
              </div>
              <h3 className="font-display font-semibold text-base text-foreground">{f.title}</h3>
              <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── How It Works ───────────────────────────────────────────────────── */
const STEPS = [
  {
    n: "01",
    icon: Users,
    t: "Athlete Onboards",
    d: "Athlete completes a 7-step profile with Aadhaar OTP verification. Auto-approved in under 6 minutes.",
    color: "text-primary",
    bg: "bg-primary/8",
  },
  {
    n: "02",
    icon: Tag,
    t: "Admin Assigns Plan",
    d: "Admin assigns the right fee plan, applies any discounts, sets the billing cycle and reminders.",
    color: "text-info",
    bg: "bg-info/8",
  },
  {
    n: "03",
    icon: CreditCard,
    t: "Athlete Pays",
    d: "Athlete pays through Razorpay. Receipt emailed instantly. Books reconciled. Dashboard unlocks.",
    color: "text-success",
    bg: "bg-success/8",
  },
  {
    n: "04",
    icon: Trophy,
    t: "Train & Track",
    d: "Athlete tracks attendance, payments, documents. Admin tracks the academy. Together, seamlessly.",
    color: "text-warning",
    bg: "bg-warning/8",
  },
];

function HowItWorks() {
  return (
    <section className="bg-surface border-y border-border">
      <div className="max-w-7xl mx-auto px-6 py-28">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-16">
          <div>
            <div className="label-micro text-primary-dark mb-4">How it works</div>
            <h2 className="text-h1 font-display max-w-lg">Four steps.<br />Zero ambiguity.</h2>
          </div>
          <Link to="/onboarding" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            Start now <ArrowUpRight className="size-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.n} className="bento-card p-7 relative overflow-hidden group">
                {/* Step number — large background */}
                <div className="absolute top-4 right-5 font-display font-bold text-6xl text-border leading-none select-none">
                  {s.n}
                </div>
                <div className={`size-11 rounded-xl ${s.bg} grid place-items-center mb-6 relative z-10 transition-transform group-hover:scale-110 duration-200`}>
                  <Icon className={`size-5 ${s.color}`} strokeWidth={1.75} />
                </div>
                <div className="font-display font-semibold text-base relative z-10">{s.t}</div>
                <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed relative z-10">{s.d}</p>

                {/* Connector arrow (desktop) */}
                {i < STEPS.length - 1 && (
                  <div className="hidden lg:block absolute -right-5 top-1/2 -translate-y-1/2 z-20">
                    <ChevronRight className="size-5 text-muted-foreground/30" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Dashboard Preview ──────────────────────────────────────────────── */
const DASH_CARDS = [
  {
    role: "Athlete",
    emoji: "🏆",
    title: "Personal & motivational",
    body: "Profile, payments, documents, training schedule, and personal KPIs.",
    to: "/athlete",
    accent: "text-primary-dark",
    accentBg: "bg-primary/8",
    border: "hover:border-primary/40",
    metrics: ["Days Active: 248", "Sessions: 18/20", "Fees: ₹96K paid"],
  },
  {
    role: "Admin",
    emoji: "⚙️",
    title: "Operational & clinical",
    body: "Athletes, invoices, fee plans, reports, and overdue management.",
    to: "/admin",
    accent: "text-info",
    accentBg: "bg-info/8",
    border: "hover:border-info/40",
    metrics: ["Athletes: 482", "Collected: ₹11.6L", "Overdue: 14"],
  },
  {
    role: "Superadmin",
    emoji: "🛡️",
    title: "Authority & control",
    body: "Multi-academy view, fee config, refund approvals, and user management.",
    to: "/superadmin",
    accent: "text-superadmin",
    accentBg: "bg-subtle",
    border: "hover:border-border-strong",
    metrics: ["Academies: 4", "Revenue: ₹22.7L", "Refunds: 3 pending"],
  },
];

function DashboardPreview() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-28">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <div className="label-micro text-primary-dark mb-4">A glance inside</div>
        <h2 className="text-h1 font-display">
          The command surface<br />for your academy.
        </h2>
        <p className="mt-5 text-muted-foreground leading-relaxed">
          Distinct dashboards for athletes, admins and superadmins — each shaped around the decisions that role actually makes.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {DASH_CARDS.map((c) => (
          <Link
            key={c.role}
            to={c.to}
            className={`group bento-card p-7 flex flex-col transition-all duration-200 ${c.border}`}
          >
            <div className={`size-12 rounded-xl ${c.accentBg} grid place-items-center text-2xl mb-5`}>
              {c.emoji}
            </div>
            <div className={`label-micro ${c.accent} mb-2`}>{c.role}</div>
            <div className="font-display font-semibold text-base">{c.title}</div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">{c.body}</p>

            {/* Mini metric pills */}
            <div className="mt-5 flex flex-wrap gap-1.5">
              {c.metrics.map((m) => (
                <span key={m} className="badge badge-neutral text-[10px]">{m}</span>
              ))}
            </div>

            <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground group-hover:gap-2.5 transition-all">
              Open dashboard
              <ArrowUpRight className={`size-4 ${c.accent} group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform`} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── Testimonials / Stats ───────────────────────────────────────────── */
function Testimonials() {
  const stats = [
    { value: "< 6 min", label: "Athlete onboarding", sub: "End-to-end, verified" },
    { value: "₹ 22.7L", label: "Monthly revenue tracked", sub: "Across pilot academies" },
    { value: "99.2%", label: "Collection rate", sub: "With auto-reminders" },
    { value: "1 day", label: "Academy setup time", sub: "From signup to live" },
  ];

  return (
    <section className="bg-foreground text-background">
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <div className="label-micro text-primary mb-4">By the numbers</div>
          <h2 className="text-h2 font-display text-background">Platform performance.</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10">
          {stats.map((s) => (
            <div key={s.label} className="bg-foreground p-8 text-center">
              <div className="text-stat font-display tabular text-gradient-gold">{s.value}</div>
              <div className="mt-2 font-semibold text-sm text-background">{s.label}</div>
              <div className="text-xs text-background/50 mt-1">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CTA ────────────────────────────────────────────────────────────── */
function CTA() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-24">
      <div className="relative overflow-hidden rounded-3xl bg-surface border border-border p-12 md:p-20 shadow-elevated">
        <div className="absolute inset-0 dot-pattern opacity-40" />
        <div className="absolute -right-24 -top-24 size-[500px] gold-glow blur-3xl opacity-60" />

        <div className="relative max-w-2xl">
          <div className="label-micro text-primary-dark mb-5">Ready when you are</div>
          <h2 className="text-h1 font-display">
            Elevate your academy with software that earns its place.
          </h2>
          <p className="mt-5 text-muted-foreground leading-relaxed">
            Pilot programs open through Q3 2026. We onboard one academy at a time, personally, to make sure the setup is perfect.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/onboarding"
              className="group inline-flex items-center gap-2 bg-[#ef4444] text-white px-6 py-3.5 rounded-xl text-sm font-semibold hover:bg-[#dc2626] transition-all shadow-elevated"
            >
              Register your academy
              <ArrowUpRight className="size-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
            <Link
              to="/superadmin"
              className="inline-flex items-center gap-2 border border-border-strong px-6 py-3.5 rounded-xl text-sm font-semibold hover:bg-subtle transition-all"
            >
              Talk to founders
            </Link>
          </div>

          {/* Mini stat row */}
          <div className="mt-12 flex flex-wrap gap-8">
            {[
              ["< 6 min", "Onboard time"],
              ["1 day", "Setup"],
              ["Free", "Pilot fee"],
            ].map(([v, k]) => (
              <div key={k}>
                <div className="text-2xl font-display font-bold tabular">{v}</div>
                <div className="text-xs text-muted-foreground mt-1">{k}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
