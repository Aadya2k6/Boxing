import React from "react";

export function BoxosWordmark({
  className = "h-6",
  cinematicVariant = false,
}: {
  className?: string;
  cinematicVariant?: boolean;
}) {
  const boxColor = cinematicVariant ? "#F8FAFC" : "#0F172A";
  const osColor = "#EF4444"; // Boxing Red

  return (
    <svg
      viewBox="0 0 232 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      preserveAspectRatio="xMinYMid meet"
    >
      <g fill={boxColor}>
        {/* B */}
        <path fillRule="evenodd" clipRule="evenodd" d="M0,0 h32 l8,8 v8 l-8,4 l8,4 v8 l-8,8 h-32 z M8,8 v8 h24 l-8,-8 z M8,24 v8 h16 l8,-8 z" />
        
        {/* O */}
        <g transform="translate(48, 0)">
          <path fillRule="evenodd" clipRule="evenodd" d="M8,0 h24 l8,8 v24 l-8,8 h-24 l-8,-8 v-24 z M8,8 v24 h24 v-24 z" />
        </g>
        
        {/* X */}
        <g transform="translate(96, 0)">
          <path d="M0,0 h12 l28,40 h-12 z" />
          <path d="M40,0 h-12 l-28,40 h12 z" />
        </g>
      </g>
      
      <g fill={osColor}>
        {/* O */}
        <g transform="translate(144, 0)">
          <path fillRule="evenodd" clipRule="evenodd" d="M8,0 h24 l8,8 v24 l-8,8 h-24 l-8,-8 v-24 z M8,8 v24 h24 v-24 z" />
        </g>
        
        {/* S */}
        <g transform="translate(192, 0)">
          <path d="M40,0 H8 L0,8 V24 H32 V32 H0 V40 H32 L40,32 V16 H8 V8 H40 Z" />
        </g>
      </g>
    </svg>
  );
}

export default function Logo({
  className = "h-10 sm:h-11 w-auto",
  imgClassName,
  showText = true,
  cinematicVariant = false,
  wordmarkOnly = false,
  wordmarkClassName = "h-[18px] sm:h-[22px]",
}: {
  className?: string;
  imgClassName?: string;
  showText?: boolean;
  textSize?: string;
  cinematicVariant?: boolean;
  wordmarkOnly?: boolean;
  wordmarkClassName?: string;
}) {
  if (wordmarkOnly) {
    return <BoxosWordmark className={wordmarkClassName} cinematicVariant={cinematicVariant} />;
  }

  return (
    <div className="inline-flex items-center gap-3">
      <img
        src="/logo.png"
        alt="BoxOS Logo"
        className={`object-contain shrink-0 ${className} ${imgClassName ?? ""}`}
      />
      {showText && (
        <BoxosWordmark className={wordmarkClassName} cinematicVariant={cinematicVariant} />
      )}
    </div>
  );
}
