import { Link, useLocation } from "@tanstack/react-router";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { useState, useEffect } from "react";
import Logo from "./Logo";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const appLinks = [
    { to: "/onboarding", label: "Onboarding" },
    { to: "/athlete", label: "Athlete" },
    { to: "/admin", label: "Admin" },
    { to: "/superadmin", label: "Superadmin" },
  ];

  const landingLinks = [
    { to: "#platform", label: "Platform", isHash: true },
    { to: "#why-boxos", label: "Why BOXOS", isHash: true },
    { to: "#how-it-works", label: "How It Works", isHash: true },
    { to: "#for-academies", label: "For Academies", isHash: true },
    { to: "#contact", label: "Contact", isHash: true },
  ];

  const isLanding = pathname === '/';
  const currentLinks = isLanding ? landingLinks : appLinks;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${
        isLanding
          ? scrolled ? "bg-[#0B0F17]/90 border-b border-white/[0.03]" : "bg-transparent border-b border-transparent"
          : scrolled ? "bg-white/90 backdrop-blur-xl shadow-[0_1px_0_0_rgba(15,15,20,0.08)] shadow-sm border-b border-transparent" : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-[68px] flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center group transition-transform group-hover:scale-105">
          <Logo className="h-10 sm:h-11 w-auto" textSize="text-2xl" cinematicVariant={isLanding} />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 md:gap-4 lg:gap-6">
          {currentLinks.map((l) => {
            const isActive = !isLanding && pathname === l.to;
            
            if (isLanding && (l as any).isHash) {
              return (
                <a
                  key={l.label}
                  href={l.to}
                  className="relative px-2 py-2 text-sm md:text-[15px] font-medium text-white/60 hover:text-white transition-colors duration-300 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:bg-cinematic-blue after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-300"
                >
                  {l.label}
                </a>
              );
            }

            return (
              <Link
                key={l.label}
                to={l.to}
                className={`px-4 py-2 text-sm rounded-lg transition-all duration-150 ${
                  isActive ? "text-foreground font-semibold bg-subtle" : "text-muted-foreground hover:text-foreground hover:bg-elevated"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-2">
          <Link
            to="/login"
            className={`text-sm px-3 py-2 transition ${isLanding ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            Sign in
          </Link>
          <Link
            to="/onboarding"
            className={
              isLanding
                ? "group inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 hover:text-white px-4 py-2.5 transition-all"
                : "group inline-flex items-center gap-1.5 text-sm font-semibold bg-[#ef4444] text-white px-4 py-2.5 rounded-lg hover:bg-[#dc2626] transition-all shadow-card"
            }
          >
            Get started
            <ArrowUpRight className="size-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden size-9 rounded-md border border-border grid place-items-center hover:bg-subtle transition"
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-border bg-surface animate-fade-up">
          <div className="px-6 py-5 flex flex-col gap-1">
            {currentLinks.map((l) => {
              if (isLanding && (l as any).isHash) {
                return (
                  <a
                    key={l.label}
                    href={l.to}
                    onClick={() => setOpen(false)}
                    className="py-2.5 px-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 rounded-md transition-colors"
                  >
                    {l.label}
                  </a>
                );
              }
              return (
                <Link
                  key={l.label}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className="py-2.5 px-3 text-sm rounded-md hover:bg-subtle transition text-muted-foreground hover:text-foreground"
                >
                  {l.label}
                </Link>
              );
            })}
            <Link
              to="/onboarding"
              onClick={() => setOpen(false)}
              className="mt-3 text-sm font-semibold bg-[#ef4444] text-white px-4 py-3 rounded-lg text-center hover:bg-[#dc2626] transition-all"
            >
              Get started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  const { pathname } = useLocation();
  const isLanding = pathname === '/';
  
  const platformLinks = [
    { to: "#platform", label: "Platform", internal: true },
    { to: "#why-boxos", label: "Why BOXOS", internal: true },
    { to: "#how-it-works", label: "How It Works", internal: true },
    { to: "#for-academies", label: "For Academies", internal: true },
  ];
  
  const companyLinks = [
    { to: "/about", label: "About", internal: false },
    { to: "#contact", label: "Contact", internal: true },
    { to: "/login", label: "Sign in", internal: false },
    { to: "/onboarding", label: "Get started", internal: false, isPrimary: true },
  ];

  const connectLinks = [
    { to: "mailto:hello@boxos.in", label: "Email", internal: false },
    { to: "#", label: "Twitter / X", internal: false },
    { to: "#", label: "Instagram", internal: false },
  ];

  const LinkComponent = ({ to, label, internal, isPrimary }: { to: string, label: string, internal?: boolean, isPrimary?: boolean }) => {
    if (isPrimary) {
      const Cmp = internal ? 'a' : Link;
      const props = internal ? { href: to } : { to: to as any };
      return (
        <Cmp 
          {...(props as any)}
          className="group inline-flex items-center gap-1.5 bg-cinematic-red text-white px-4 py-2 mt-2 rounded-lg text-sm font-semibold hover:bg-cinematic-red-hover transition-all duration-300 shadow-lg hover:scale-[1.02]"
        >
          {label}
          <ArrowUpRight className="size-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Cmp>
      );
    }

    if (internal) {
      return (
        <a 
          href={to}
          className={`relative inline-flex items-center text-sm font-medium transition-colors duration-300 ${isLanding ? 'text-cinematic-secondary hover:text-white' : 'text-muted-foreground hover:text-foreground'} after:absolute after:inset-x-0 after:-bottom-1 after:h-[1px] after:bg-cinematic-blue after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-300`}
        >
          {label}
        </a>
      );
    }
    
    return (
      <Link
        to={to as any}
        className={`relative inline-flex items-center text-sm font-medium transition-colors duration-300 ${isLanding ? 'text-cinematic-secondary hover:text-white' : 'text-muted-foreground hover:text-foreground'} after:absolute after:inset-x-0 after:-bottom-1 after:h-[1px] after:bg-cinematic-blue after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-300`}
      >
        {label}
      </Link>
    );
  };

  return (
    <footer id="contact" className={`relative ${isLanding ? 'theme-cinematic-dark bg-cinematic-base overflow-hidden mt-0' : 'bg-surface border-t border-border mt-0'}`}>
      
      {/* Cinematic Red Ring Background (Landing Only) */}
      {isLanding && (
        <>

          {/* Red Ring Image */}
          <div className="absolute top-0 inset-x-0 h-full pointer-events-none z-0">
            <img 
              src="/red-boxing-ring.png" 
              alt="Boxing Ring Closing Shot" 
              className="w-full h-full object-cover object-center opacity-40 mix-blend-screen"
            />
            {/* Mask the image edges naturally */}
            <div className="absolute inset-0 bg-gradient-to-b from-cinematic-base via-cinematic-base/60 to-cinematic-base" />
            <div className="absolute inset-0 bg-gradient-to-r from-cinematic-base via-transparent to-cinematic-base" />
          </div>
        </>
      )}

      <div className={`relative z-10 max-w-7xl mx-auto px-6 ${isLanding ? 'pt-32 pb-8 md:pt-48' : 'py-16'}`}>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-8">
          
          {/* 1. Brand & Description */}
          <div className="md:col-span-12 lg:col-span-4 flex flex-col items-start">
            <Link to="/" className="flex items-center">
              <Logo className="h-10 sm:h-11 w-auto" textSize="text-2xl" cinematicVariant={isLanding} />
            </Link>
            <p className={`mt-6 text-sm max-w-xs leading-relaxed ${isLanding ? 'text-white/70' : 'text-muted-foreground'}`}>
              Institutional-grade management platform for boxing academies. Built by athletes, for athletes.
            </p>
          </div>

          {/* 2. Platform */}
          <div className="md:col-span-4 lg:col-span-2 lg:col-start-6">
            <div className={`mb-6 font-bold tracking-widest uppercase text-xs ${isLanding ? 'text-white' : 'label-micro'}`}>Platform</div>
            <ul className="space-y-4">
              {platformLinks.map((l) => (
                <li key={l.label}>
                  <LinkComponent {...l} />
                </li>
              ))}
            </ul>
          </div>

          {/* 3. Company / Academy */}
          <div className="md:col-span-4 lg:col-span-2">
            <div className={`mb-6 font-bold tracking-widest uppercase text-xs ${isLanding ? 'text-white' : 'label-micro'}`}>Company / Academy</div>
            <ul className="space-y-4">
              {companyLinks.map((l) => (
                <li key={l.label}>
                  <LinkComponent {...l} />
                </li>
              ))}
            </ul>
          </div>

          {/* 4. Connect */}
          <div className="md:col-span-4 lg:col-span-2 lg:col-start-11">
            <div className={`mb-6 font-bold tracking-widest uppercase text-xs ${isLanding ? 'text-white' : 'label-micro'}`}>Connect</div>
            <ul className="space-y-4">
              {connectLinks.map((l) => (
                <li key={l.label}>
                  <LinkComponent {...l} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Thin Bottom Utility Row */}
        <div className={`mt-24 pt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs ${isLanding ? 'text-white/40 border-t border-white/10' : 'text-muted-foreground border-t border-border'}`}>
          <div className="flex items-center gap-6">
            <span>© {new Date().getFullYear()} BOXOS. All rights reserved.</span>
          </div>
          <span className="font-mono tracking-widest uppercase text-[10px]">v1.0.0 — Precision Sports Technology</span>
        </div>
      </div>
    </footer>
  );
}
