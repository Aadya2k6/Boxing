import React from "react";

interface CinematicMediaProps {
  allowVideo?: boolean;
}

export function CinematicMedia({ allowVideo = false }: CinematicMediaProps) {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none bg-cinematic-base overflow-hidden">
      {/* Background Media */}
      <div className="absolute inset-0 w-full h-full">
        {allowVideo ? (
          <>
            {/* The video element is hidden on mobile via CSS class hidden md:block */}
            <video
              className="hidden md:block w-full h-full object-cover opacity-60"
              autoPlay
              loop
              muted
              playsInline
              preload="none"
              poster="/ring-perspective-2.webp"
            >
              <source src="/cinematic-bg.mp4" type="video/mp4" />
            </video>
            {/* Mobile fallback static image */}
            <img
              src="/ring-perspective-2.webp"
              alt="Boxing Ring"
              className="md:hidden w-full h-full object-cover opacity-60"
              loading="eager"
            />
          </>
        ) : (
          <img
            src="/ring-perspective-2.webp"
            alt="Boxing Ring"
            className="w-full h-full object-cover opacity-60"
            loading="eager"
          />
        )}
      </div>

      {/* Dark Vignette & Gradient Overlays */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(5,8,17,0.95)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#050811]/60 via-transparent to-[#050811]/90" />
      <div className="absolute inset-0 bg-[#050811]/30 backdrop-blur-[2px]" />
    </div>
  );
}
