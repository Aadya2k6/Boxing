export default function Logo({
  className = "h-10 sm:h-11 w-auto",
  imgClassName,
  showText = true,
  textSize = "text-xl sm:text-2xl",
  cinematicVariant = false,
}: {
  className?: string;
  imgClassName?: string;
  showText?: boolean;
  textSize?: string;
  cinematicVariant?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-3">
      <img
        src="/logo.png"
        alt="BoxOS Logo"
        className={`object-contain shrink-0 ${className} ${imgClassName ?? ""}`}
      />
      {showText && (
        <span className={`font-display font-bold tracking-tight ${cinematicVariant ? 'text-white' : 'text-foreground'} ${textSize}`}>
          BOX<span className="font-extrabold" style={cinematicVariant ? {} : { color: "#D4AF37" }} className={cinematicVariant ? "text-cinematic-red" : ""}>OS</span>
        </span>
      )}
    </div>
  );
}
