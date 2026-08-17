import React from "react";

interface CinematicWizardPanelProps {
  children: React.ReactNode;
  className?: string;
}

export function CinematicWizardPanel({ children, className = "" }: CinematicWizardPanelProps) {
  return (
    <div className={`w-full max-w-4xl mx-auto ${className}`}>
      <div className="glass-cinematic border border-cinematic-border rounded-2xl shadow-2xl relative overflow-hidden flex flex-col">
        {/* Subtle accent highlight on top edge */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cinematic-blue/50 to-transparent" />
        {children}
      </div>
    </div>
  );
}
