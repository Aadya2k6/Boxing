import React from "react";
import { Link } from "@tanstack/react-router";
import { Crown, Zap, Trophy } from "lucide-react";
import Logo from "@/components/site/Logo";

interface CinematicLayoutProps {
  children: React.ReactNode;
  maxWidth?: string;
}

export function CinematicLayout({ children, maxWidth = "max-w-md" }: CinematicLayoutProps) {
  return (
    <div className="w-full min-h-screen flex flex-col lg:flex-row theme-cinematic-dark bg-cinematic-base font-sans text-cinematic-primary overflow-x-hidden">
      {/* Media Side */}
      <div className="w-full lg:w-1/2 h-64 lg:h-screen relative shrink-0 border-b lg:border-b-0 lg:border-r border-cinematic-border bg-black">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/blue-boxing-ring.png"
          className="absolute inset-0 w-full h-full object-cover object-center"
        >
          <source src="/boxing-video.mp4" type="video/mp4" />
        </video>
        {/* Subtle fade on edges so it blends nicely but remains a distinct panel */}
        <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-cinematic-base via-transparent to-transparent pointer-events-none" />

        {/* Absolute Header Branding */}
        <header className="absolute top-0 left-0 p-6 md:p-10 z-50">
          <Link to="/">
            <Logo className="h-10 sm:h-12 w-auto" textSize="text-2xl" cinematicVariant={true} />
          </Link>
        </header>

        {/* Hero content over video */}
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-10 z-40 flex flex-col justify-end bg-gradient-to-t from-cinematic-base via-cinematic-base/80 to-transparent">
          <h1 className="font-display font-extrabold text-4xl lg:text-5xl text-white mb-4 leading-tight tracking-tight">
            Master<br />Your Ring.
          </h1>
          <p className="text-cinematic-secondary text-sm lg:text-base mb-8 max-w-sm leading-relaxed">
            Join the academy and elevate your boxing strategy to the professional level with BOXOS.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-xl border border-cinematic-red/30 bg-cinematic-red/5 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                <Crown className="size-5 text-cinematic-red" strokeWidth={2} />
              </div>
              <span className="text-sm font-semibold text-white tracking-wide">Expert Coaches</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-xl border border-cinematic-red/30 bg-cinematic-red/5 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                <Zap className="size-5 text-cinematic-red" strokeWidth={2} />
              </div>
              <span className="text-sm font-semibold text-white tracking-wide">Personalized Training</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-xl border border-cinematic-red/30 bg-cinematic-red/5 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                <Trophy className="size-5 text-cinematic-red" strokeWidth={2} />
              </div>
              <span className="text-sm font-semibold text-white tracking-wide">Tournament Ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interaction Side */}
      <div className="w-full lg:w-1/2 min-h-[calc(100vh-16rem)] lg:min-h-screen flex flex-col justify-center px-6 py-12 lg:px-12 xl:px-16 relative overflow-y-auto">
        <div className={`w-full ${maxWidth} mx-auto animate-fade-up`}>
          {children}
        </div>
      </div>
    </div>
  );
}
