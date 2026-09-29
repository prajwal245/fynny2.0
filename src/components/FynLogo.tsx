import logoRed from "@/assets/brand/fynhelp-logo-red-new.png";
import logoCream from "@/assets/brand/fynhelp-logo-cream-new.png";
import iconRed from "@/assets/brand/fynhelp-icon-red-new.png";
import iconCream from "@/assets/brand/fynhelp-icon-cream-new.png";

interface FynLogoProps {
  /** "dark" = red logo for light backgrounds (default). "light" = cream logo for dark backgrounds. */
  variant?: "dark" | "light";
  showTagline?: boolean;
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
}

const FynLogo = ({ variant = "dark", className = "", iconOnly = false, size = "md" }: FynLogoProps) => {
  const heightPx = size === "sm" ? 28 : size === "lg" ? 44 : 36;
  const isLight = variant === "light";

  if (iconOnly) {
    const src = isLight ? iconCream : iconRed;
    return (
      <img
        src={src}
        alt="FynHelp"
        className={className}
        style={{ height: heightPx, width: heightPx, objectFit: "contain", display: "block", flexShrink: 0 }}
      />
    );
  }

  const src = isLight ? logoCream : logoRed;
  return (
    <img
      src={src}
      alt="FynHelp"
      className={className}
      style={{ height: heightPx, width: "auto", objectFit: "contain", display: "block", flexShrink: 0, aspectRatio: "519 / 99" }}
    />
  );
};

export default FynLogo;
