import React from "react";

interface CinematicCardProps {
  children: React.ReactNode;
  className?: string;
}

export function CinematicCard({ children, className = "" }: CinematicCardProps) {
  return (
    <div className={`w-full ${className}`}>
      <div className="relative">


        {/* Card Body */}
        <div className="bg-[#0B0F17]/95 backdrop-blur-3xl border border-[#ffffff15] rounded-[2rem] p-8 md:p-10 shadow-2xl relative z-10">
          {children}
        </div>
      </div>
    </div>
  );
}
