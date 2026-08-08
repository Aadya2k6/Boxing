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

  const links = [
    { to: "/", label: "Platform" },
    { to: "/onboarding", label: "Onboarding" },
    { to: "/athlete", label: "Athlete" },
    { to: "/admin", label: "Admin" },
    { to: "/superadmin", label: "Superadmin" },
  ];

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/90 backdrop-blur-xl shadow-[0_1px_0_0_rgba(15,15,20,0.08)] shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-[68px] flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center group transition-transform group-hover:scale-105">
          <Logo className="h-10 sm:h-11 w-auto" textSize="text-2xl" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5">
          {links.map((l) => {
            const isActive = pathname === l.to;
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`px-4 py-2 text-sm rounded-lg transition-all duration-150 ${
                  isActive
                    ? "text-foreground font-semibold bg-subtle"
                    : "text-muted-foreground hover:text-foreground hover:bg-elevated"
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
            className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 transition"
          >
            Sign in
          </Link>
          <Link
            to="/onboarding"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold bg-[#ef4444] text-white px-4 py-2.5 rounded-lg hover:bg-[#dc2626] transition-all shadow-card"
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
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="py-2.5 px-3 text-sm rounded-md hover:bg-subtle transition text-muted-foreground hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
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
  const footerLinks = [
    { to: "/onboarding", label: "Athlete Onboarding" },
    { to: "/athlete", label: "Athlete Dashboard" },
    { to: "/admin", label: "Admin Dashboard" },
    { to: "/superadmin", label: "Superadmin" },
  ];

  return (
    <footer className="border-t border-border bg-surface mt-0">
      <div className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-4 gap-12">
        <div className="md:col-span-2">
          <Link to="/" className="flex items-center">
            <Logo className="h-10 sm:h-11 w-auto" textSize="text-2xl" />
          </Link>
          <p className="mt-5 text-sm text-muted-foreground max-w-sm leading-relaxed">
            Institutional-grade management platform for cricket academies. Built by athletes, for athletes.
          </p>
          <div className="mt-6 flex items-center gap-2">
            <span className="badge badge-gold">v1.0 Beta</span>
            <span className="badge badge-success">Live · May 2026</span>
          </div>
        </div>

        <div>
          <div className="label-micro mb-5">Platform</div>
          <ul className="space-y-3 text-sm">
            {footerLinks.map((l) => (
              <li key={l.label}>
                <Link
                  to={l.to}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="label-micro mb-5">Contact</div>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>hello@crickos.in</li>
            <li>New Delhi, India</li>
            <li className="pt-2">
              <span className="text-xs text-muted-foreground">Aligned with BCCI · SAI · ICC</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-muted-foreground">
          <span>© 2026 Crickos. All rights reserved.</span>
          <span className="font-mono">v1.0.0 — May 2026 · Precision Sports Technology</span>
        </div>
      </div>
    </footer>
  );
}
