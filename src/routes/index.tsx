import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site/Chrome";
import {
  ArrowUpRight, ShieldCheck, Receipt,
  CreditCard, Tag, Activity,
  Users, Trophy,
  CircleCheck, Search, LayoutDashboard
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Boxos — Precision Management for Elite Boxing Academies" },
      { name: "description", content: "Institutional-grade onboarding, fees, and operations for boxing academies." },
      { property: "og:title", content: "Boxos — Precision Management for Elite Boxing Academies" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    document.querySelectorAll('.reveal-section').forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="theme-cinematic-dark min-h-screen bg-cinematic-base text-cinematic-primary overflow-x-hidden selection:bg-cinematic-red/30">
      <SiteHeader />
      <Hero />
      <LogoStrip />
      <Features />
      <HowItWorks />
      <FinalAction />
      <SiteFooter />
    </div>
  );
}

/* ── Components ─────────────────────────────────────────────────────── */

function CinematicFeatureCard({ icon: Icon, title, body, index }: any) {
  return (
    <div className="bg-cinematic-panel border border-cinematic-border rounded-2xl p-8 hover:border-cinematic-blue/40 transition-all duration-300 ease-out group hover:-translate-y-[3px] hover:shadow-[0_0_30px_-5px_rgba(59,130,246,0.15)]">
      <div className="size-12 rounded-xl bg-cinematic-blue/10 border border-cinematic-blue/20 grid place-items-center mb-6 text-cinematic-blue group-hover:scale-110 group-hover:bg-cinematic-blue/20 transition-transform duration-300 ease-out">
        <Icon className="size-5" strokeWidth={1.5} />
      </div>
      <h3 className="font-display font-semibold text-xl text-cinematic-primary">{title}</h3>
      <p className="mt-3 text-sm text-cinematic-secondary leading-relaxed">{body}</p>
    </div>
  );
}


/* ── Sections ───────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section id="hero" className="relative w-full pt-24 lg:pt-32 pb-8 overflow-hidden min-h-[90vh] flex flex-col">
      {/* ── ATMOSPHERE FOG ── */}
      {/* Blue Spotlight Entering from Top Left */}
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[1200px] h-[1200px] -top-[400px] -left-[400px]" />
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[800px] h-[800px] top-0 left-0" style={{ animationDelay: '-4s' }} />
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[1600px] h-[1600px] -top-[600px] -left-[600px] opacity-70" style={{ animationDelay: '-8s' }} />
      
      {/* Subtle Red Environmental Spill from Bottom Right */}
      <div className="atmosphere-base atmosphere-red animate-ambient-drift w-[900px] h-[900px] -bottom-[400px] -right-[300px]" style={{ animationDelay: '-10s' }} />
      <div className="atmosphere-base atmosphere-red animate-ambient-drift w-[600px] h-[600px] -bottom-[200px] -right-[100px] opacity-50" style={{ animationDelay: '-6s' }} />

      {/* ── DESKTOP PHOTOGRAPHY ── */}
      <div className="hidden lg:block absolute -top-12 -right-8 bottom-0 w-[60%] z-0 overflow-hidden">
        <img
          src="/red-boxing-ring.png"
          alt="Boxing Ring"
          className="w-full h-full object-cover object-right-bottom opacity-100"
          style={{ WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 20%)', maskImage: 'linear-gradient(to right, transparent 0%, black 20%)' }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-6 w-full flex-1 flex flex-col lg:flex-row relative z-10">
        
        {/* ── MOBILE PHOTOGRAPHY (Stacked) ── */}
        <div className="relative w-full h-[40vh] lg:hidden z-0 mb-6 -mx-6 w-[calc(100%+3rem)]">
          <img
            src="/red-boxing-ring.png"
            alt="Boxing Ring"
            className="w-full h-full object-cover object-center opacity-100"
          />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-cinematic-base to-transparent" />
        </div>

        {/* ── CONTENT ── */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center py-12 lg:py-0 my-auto animate-fade-up relative z-10">
          <h1 className="font-display font-extrabold text-[4.5rem] md:text-[5.5rem] lg:text-[6rem] tracking-tighter leading-[0.88] uppercase text-white">
            RUN THE <span className="text-cinematic-red">BUSINESS.</span><br />
            BUILD THE <span className="text-cinematic-red">BOXER.</span>
          </h1>

          <p className="mt-8 font-sans text-lg md:text-xl text-cinematic-secondary font-medium leading-relaxed max-w-xl drop-shadow-md">
            Boxos is the institutional-grade operating system for boxing academies. Onboard athletes, automate fees, and command operations from one calm interface.
          </p>

          <div className="mt-10 mb-8 flex items-center gap-4">
            <Link
              to="/onboarding"
              className="group inline-flex items-center justify-center gap-2 bg-cinematic-red text-white px-8 py-4 rounded-xl text-sm font-bold hover:bg-cinematic-red-hover transition-all duration-300 shadow-xl hover:scale-[1.02]"
            >
              Start onboarding
              <ArrowUpRight className="size-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function LogoStrip() {
  return (
    <div id="for-academies" className="border-b border-cinematic-border bg-cinematic-base relative z-10 scroll-mt-24">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-wrap items-center justify-center gap-6">
        <span className="font-display font-semibold text-sm uppercase tracking-[0.2em] text-cinematic-secondary/60">
          Built for boxing academy operations
        </span>
      </div>
    </div>
  );
}

function Features() {
  const FEATURES = [
    {
      icon: Users,
      title: "01 — ATHLETE MANAGEMENT",
      body: "Profiles, onboarding, documents and athlete status.",
    },
    {
      icon: Receipt,
      title: "02 — REVENUE & FEES",
      body: "Plans, payments, reminders, discounts and payment tracking.",
    },
    {
      icon: Activity,
      title: "03 — TRAINING OPERATIONS",
      body: "Attendance, sessions and athlete progression.",
    },
    {
      icon: LayoutDashboard,
      title: "04 — ACADEMY CONTROL",
      body: "A unified operational view across the entire academy.",
    },
  ];

  return (
    <section id="platform" className="reveal-section bg-cinematic-base relative z-10 py-24 md:py-32 scroll-mt-24 overflow-hidden">
      {/* Atmosphere Fog */}
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[1200px] h-[1200px] -top-64 -left-64" />
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[800px] h-[800px] -top-32 -left-32 opacity-80" style={{ animationDelay: '-5s' }} />
      <div className="atmosphere-base atmosphere-warm animate-ambient-drift w-[1000px] h-[1000px] bottom-0 right-0 opacity-60" style={{ animationDelay: '-8s' }} />
      <div className="atmosphere-base atmosphere-warm animate-ambient-drift w-[600px] h-[600px] -bottom-32 -right-32 opacity-80" style={{ animationDelay: '-3s' }} />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="max-w-2xl mb-16">
          <div className="text-xs font-bold text-cinematic-red uppercase tracking-widest mb-4">The Platform</div>
          <h2 className="text-4xl md:text-5xl font-display font-bold text-white uppercase tracking-tight">
            EVERY PART OF THE ACADEMY.<br />UNDER ONE ROOF.
          </h2>
          <p className="mt-6 text-cinematic-secondary text-lg leading-relaxed max-w-lg">
            BOXOS connects the operational side of the academy with the people who train inside it.
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Gloves Image Column */}
          <div className="lg:col-span-5 order-last lg:order-first">
            <div className="rounded-2xl overflow-hidden border border-cinematic-border bg-black/40 relative h-full min-h-[300px]">
              <div className="absolute inset-0 bg-cinematic-blue/10 mix-blend-overlay z-10" />
              <img 
                src="/gloves.png" 
                alt="Boxing Gloves" 
                loading="lazy"
                className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-all duration-700"
              />
            </div>
          </div>
          
          {/* Features Grid Column */}
          <div className="lg:col-span-7">
            <div className="grid sm:grid-cols-2 gap-4">
              {FEATURES.map((f) => (
                <div key={f.title}>
                  <CinematicFeatureCard {...f} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const STEPS = [
    {
      n: "01",
      icon: Users,
      t: "Athlete Onboards",
      d: "Athlete completes a 7-step profile with Aadhaar OTP verification. Auto-approved in under 6 minutes.",
    },
    {
      n: "02",
      icon: Tag,
      t: "Admin Assigns Plan",
      d: "Admin assigns the right fee plan, applies any discounts, sets the billing cycle and reminders.",
    },
    {
      n: "03",
      icon: CreditCard,
      t: "Athlete Pays",
      d: "Athlete pays through Razorpay. Receipt emailed instantly. Books reconciled. Dashboard unlocks.",
    },
    {
      n: "04",
      icon: Trophy,
      t: "Train & Track",
      d: "Athlete tracks attendance, payments, documents. Admin tracks the academy. Together, seamlessly.",
    },
  ];

  return (
    <section id="how-it-works" className="reveal-section bg-cinematic-base relative z-10 py-24 border-t border-cinematic-border/50 scroll-mt-24 overflow-hidden">
      {/* Atmosphere Fog */}
      <div className="atmosphere-base atmosphere-red animate-ambient-drift w-[1600px] h-[1600px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/3 opacity-80" />
      <div className="atmosphere-base atmosphere-red animate-ambient-drift w-[1200px] h-[1200px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ animationDelay: '-4s' }} />
      <div className="atmosphere-base atmosphere-red animate-ambient-drift w-[800px] h-[800px] bottom-0 left-1/2 -translate-x-1/2 translate-y-1/4 opacity-90" style={{ animationDelay: '-8s' }} />

      <div className="max-w-4xl mx-auto px-6 relative z-10">
        <div className="mb-20 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="text-xs font-bold text-cinematic-red uppercase tracking-widest mb-4">Workflow</div>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-white max-w-lg">
              Four steps.<br />Zero ambiguity.
            </h2>
          </div>
          <Link to="/onboarding" className="group hidden md:inline-flex items-center gap-1.5 text-sm font-semibold text-cinematic-secondary hover:text-white transition-colors">
            Start now <ArrowUpRight className="size-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>

        {/* Vertical Timeline */}
        <div className="relative pl-6 md:pl-10">
          {/* Track Line */}
          <div className="absolute left-0 top-2 bottom-2 w-[2px] bg-gradient-to-b from-cinematic-blue via-white/20 to-cinematic-red opacity-80" />
          
          <div className="space-y-16">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.n} className="relative group">
                  {/* Node Circle */}
                  <div className="absolute -left-[30px] md:-left-[46px] top-1.5 size-4 rounded-full bg-cinematic-base border-2 border-cinematic-blue group-hover:border-cinematic-red group-hover:scale-125 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.5)] group-hover:shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
                  
                  <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8 transition-transform duration-300 ease-out group-hover:translate-x-2">
                    {/* Step Number */}
                    <div className="font-display font-bold text-5xl md:text-6xl text-white/30 group-hover:text-cinematic-red transition-colors duration-300 ease-out leading-none select-none shrink-0 md:w-24">
                      {s.n}
                    </div>
                    
                    {/* Content */}
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="size-8 rounded-lg bg-white/5 border border-white/10 grid place-items-center text-cinematic-secondary">
                          <Icon className="size-4" strokeWidth={2} />
                        </div>
                        <h3 className="font-display font-semibold text-2xl text-white">{s.t}</h3>
                      </div>
                      <p className="text-cinematic-secondary leading-relaxed md:text-lg max-w-xl">
                        {s.d}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-16 text-center md:hidden">
          <Link to="/onboarding" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-cinematic-secondary hover:text-white transition-colors">
            Start now <ArrowUpRight className="size-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function FinalAction() {
  const PILLARS = [
    {
      n: "01",
      title: "RUN THE ACADEMY",
      desc: "Centralize athlete onboarding, attendance, academy records and daily operations.",
    },
    {
      n: "02",
      title: "CONTROL REVENUE",
      desc: "Track fee plans, payments, pending dues and financial visibility without scattered records.",
    },
    {
      n: "03",
      title: "RUN TRAINING",
      desc: "Keep athlete development and training information connected to the same operational system.",
    },
    {
      n: "04",
      title: "SEE THE WHOLE ACADEMY",
      desc: "Give administrators one operational view instead of fragmented information.",
    },
  ];

  return (
    <section id="why-boxos" className="reveal-section bg-cinematic-base relative z-10 py-40 overflow-hidden border-t border-white/5 scroll-mt-24">
      {/* Atmosphere Fog */}
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[1400px] h-[1400px] top-0 left-0 -translate-x-1/3 -translate-y-1/4" />
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[800px] h-[800px] top-1/4 left-0 -translate-x-1/4" style={{ animationDelay: '-5s' }} />
      
      <div className="atmosphere-base atmosphere-red animate-ambient-drift w-[1400px] h-[1400px] bottom-0 right-0 translate-x-1/4 translate-y-1/4" style={{ animationDelay: '-8s' }} />
      <div className="atmosphere-base atmosphere-red animate-ambient-drift w-[900px] h-[900px] bottom-1/4 right-0 translate-x-1/4" style={{ animationDelay: '-3s' }} />

      <div className="max-w-6xl mx-auto px-6 relative z-10 flex flex-col md:flex-row gap-16 lg:gap-24">
        
        {/* LEFT ~40%: Headline */}
        <div className="w-full md:w-[40%] flex flex-col justify-start animate-fade-up">
          <h2 className="font-display font-extrabold text-4xl md:text-5xl lg:text-6xl tracking-tighter uppercase text-white leading-tight">
            WHY BOXOS?
          </h2>
          <p className="mt-6 font-sans text-base md:text-lg text-cinematic-secondary leading-relaxed max-w-sm">
            BOXOS connects the operational parts of an academy that are normally fragmented across spreadsheets, messages, payment records and separate training workflows.
          </p>
        </div>

        {/* RIGHT ~60%: Vertical Proof Points & CTA */}
        <div className="w-full md:w-[60%] relative pl-10 md:pl-16">
          {/* Vertical tracking line */}
          <div className="absolute left-0 top-3 bottom-0 w-px bg-gradient-to-b from-cinematic-blue via-white/20 to-cinematic-red opacity-80" />

          <div className="space-y-16">
            {PILLARS.map((p) => (
              <div key={p.n} className="relative group animate-fade-up">
                {/* Node Marker */}
                <div className="absolute -left-[45px] md:-left-[69px] top-1.5 size-2.5 rounded-full bg-cinematic-base border border-white/60 group-hover:border-cinematic-red group-hover:scale-125 transition-all duration-300 shadow-[0_0_10px_rgba(255,255,255,0.2)] group-hover:shadow-[0_0_15px_rgba(239,68,68,0.5)]" />

                <div className="text-sm font-mono font-bold text-white/50 group-hover:text-white transition-colors duration-300 mb-2 tracking-widest">
                  {p.n}
                </div>
                <h3 className="font-display font-bold text-2xl md:text-3xl text-white tracking-tight mb-3">
                  {p.title}
                </h3>
                <p className="text-cinematic-secondary text-base md:text-lg leading-relaxed max-w-lg group-hover:text-white/80 transition-colors duration-300">
                  {p.desc}
                </p>
              </div>
            ))}

            {/* Simple Final CTA integrated into the line */}
            <div className="relative pt-8 animate-fade-up">
              {/* Very subtle CTA atmosphere */}
              <div className="atmosphere-base atmosphere-warm animate-ambient-drift w-[400px] h-[400px] top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ opacity: 0.7 }} />
              <div className="absolute -left-[45px] md:-left-[69px] top-12 size-2.5 rounded-full bg-cinematic-red shadow-[0_0_15px_rgba(239,68,68,0.6)]" />
              <Link
                to="/onboarding"
                className="group inline-flex items-center gap-3 text-white text-lg font-display font-bold tracking-tight hover:text-cinematic-red transition-all duration-300 relative z-10"
              >
                REGISTER YOUR ACADEMY
                <ArrowUpRight className="size-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
