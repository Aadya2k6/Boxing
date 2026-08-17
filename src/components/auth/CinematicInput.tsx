import React from "react";

interface CinematicInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  // We can pass additional props if needed, but it inherits standard input props
}

export const CinematicInput = React.forwardRef<HTMLInputElement, CinematicInputProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        {...props}
        className={`w-full bg-[#0B0F17]/60 border border-[#ffffff1a] rounded-lg px-4 py-3 text-sm text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:border-cinematic-blue focus:ring-1 focus:ring-cinematic-blue transition-all ${className}`}
      />
    );
  }
);

CinematicInput.displayName = "CinematicInput";
