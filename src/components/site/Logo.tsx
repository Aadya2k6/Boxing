export default function Logo({
  className = "h-10 sm:h-11 w-auto",
  imgClassName,
  showText = true,
  textSize = "text-xl sm:text-2xl",
}: {
  className?: string;
  imgClassName?: string;
  showText?: boolean;
  textSize?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2.5">
      <img
        src="/logo.png"
        alt="BoxOS Logo"
        className={`object-contain ${className} ${imgClassName ?? ""}`}
      />
      {showText && (
        <span className={`font-display font-bold tracking-tight text-foreground ${textSize}`}>
          Box<span className="font-extrabold" style={{ color: "#D4AF37" }}>OS</span>
        </span>
      )}
    </div>
  );
}
