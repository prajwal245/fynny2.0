import React from "react";

/**
 * FYNIcon, custom SVG icon system for FynHelp.
 * Indian SME-themed designs using brand palette:
 *   --fyn-ink #171208, --fyn-red #C41E1E, --fyn-gold #8B6914, --fyn-beige #F4EDDA
 *
 * Usage: <FYNIcon name="getting-started" size={32} />
 */

export type FYNIconName =
  | "getting-started"
  | "templates"
  | "glossary"
  | "blog"
  | "community"
  | "video"
  | "article"
  | "template"
  | "discussion"
  | "callback";

interface Props {
  name: FYNIconName;
  size?: number;
  className?: string;
  title?: string;
  animated?: boolean; // adds hover micro-animation
}

const INK = "#171208";
const RED = "#C41E1E";
const GOLD = "#8B6914";
const BEIGE = "#F4EDDA";

// unique id suffix per render to avoid <defs> collisions
let _gid = 0;
const useGid = () => {
  const ref = React.useRef<string | undefined>(undefined);
  if (!ref.current) ref.current = `fyni-${++_gid}`;
  return ref.current;
};

const Wrap: React.FC<{
  size: number;
  className?: string;
  title?: string;
  animated?: boolean;
  children: React.ReactNode;
}> = ({ size, className, title, animated, children }) => (
  <span
    className={className}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 0,
      transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1), filter 0.25s",
    }}
    onMouseEnter={(e) => {
      if (!animated) return;
      (e.currentTarget as HTMLElement).style.transform = "scale(1.08) rotate(2deg)";
      (e.currentTarget as HTMLElement).style.filter =
        "drop-shadow(0 4px 12px rgba(139,105,20,0.3))";
    }}
    onMouseLeave={(e) => {
      if (!animated) return;
      (e.currentTarget as HTMLElement).style.transform = "none";
      (e.currentTarget as HTMLElement).style.filter = "none";
    }}
    role={title ? "img" : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    {/* clone child to inject size if needed */}
    {React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement<any>, { width: size, height: size })
      : children}
  </span>
);

const FYNIcon: React.FC<Props> = ({ name, size = 32, className, title, animated = true }) => {
  const id = useGid();
  const gRedGold = `${id}-rg`;
  const gGold = `${id}-g`;
  const gPen = `${id}-p`;

  const defs = (
    <defs>
      <linearGradient id={gRedGold} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={RED} />
        <stop offset="100%" stopColor={GOLD} />
      </linearGradient>
      <linearGradient id={gGold} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={GOLD} />
        <stop offset="100%" stopColor="rgba(139,105,20,0.6)" />
      </linearGradient>
      <linearGradient id={gPen} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={RED} />
        <stop offset="100%" stopColor={GOLD} />
      </linearGradient>
    </defs>
  );

  let svg: React.ReactElement;

  switch (name) {
    // 1. GETTING STARTED, open book + stairs + sprout + sparkle
    case "getting-started":
      svg = (
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          {defs}
          {/* book base */}
          <path
            d="M4 8 Q4 6 6 6 L15 7 L15 27 L6 26 Q4 26 4 24 Z M28 8 Q28 6 26 6 L17 7 L17 27 L26 26 Q28 26 28 24 Z"
            fill={`url(#${gRedGold})`}
            stroke={INK}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {/* stairs left page */}
          <path
            d="M6 22 L9 22 L9 19 L11 19 L11 16 L13 16 L13 13"
            stroke={BEIGE}
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* sprout right page: stem + leaves */}
          <path d="M22 22 L22 16" stroke={BEIGE} strokeWidth="1.6" strokeLinecap="round" />
          <path
            d="M22 18 Q19 17 19 14 Q22 14 22 17 M22 16 Q25 15 25 12 Q22 12 22 15"
            fill={BEIGE}
            stroke={INK}
            strokeWidth="0.8"
          />
          {/* sparkle */}
          <path
            d="M27 4 L28 6 L30 7 L28 8 L27 10 L26 8 L24 7 L26 6 Z"
            fill={GOLD}
            opacity="0.95"
          />
        </svg>
      );
      break;

    // 2. TEMPLATES & DOWNLOADS, document with folded corner + rows + download
    case "templates":
      svg = (
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          {defs}
          <path
            d="M6 4 L22 4 L26 8 L26 28 Q26 29 25 29 L7 29 Q6 29 6 28 Z"
            fill={`url(#${gGold})`}
            stroke={INK}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* fold */}
          <path d="M22 4 L22 8 L26 8 Z" fill={RED} stroke={INK} strokeWidth="1.2" />
          {/* dotted khadi pattern */}
          <g fill={INK} opacity="0.18">
            <circle cx="10" cy="22" r="0.7" />
            <circle cx="13" cy="22" r="0.7" />
            <circle cx="16" cy="22" r="0.7" />
            <circle cx="19" cy="22" r="0.7" />
            <circle cx="22" cy="22" r="0.7" />
          </g>
          {/* data rows */}
          <line x1="10" y1="12" x2="22" y2="12" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
          <line x1="10" y1="16" x2="22" y2="16" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
          <line x1="10" y1="19" x2="18" y2="19" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
          {/* download badge */}
          <circle cx="22" cy="25" r="4" fill={RED} stroke={INK} strokeWidth="1" />
          <path
            d="M22 23 L22 27 M20 25.2 L22 27 L24 25.2"
            stroke="#FFFFFF"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      );
      break;

    // 3. GLOSSARY, closed book with A-Z and magnifier
    case "glossary":
      svg = (
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          {defs}
          {/* spine */}
          <rect x="4" y="5" width="3" height="22" rx="1" fill={INK} />
          {/* cover */}
          <rect
            x="7"
            y="5"
            width="19"
            height="22"
            rx="2"
            fill={`url(#${gGold})`}
            stroke={INK}
            strokeWidth="1.8"
          />
          {/* mandala dots border */}
          <g fill={INK} opacity="0.35">
            <circle cx="10" cy="8" r="0.7" />
            <circle cx="22" cy="8" r="0.7" />
            <circle cx="10" cy="24" r="0.7" />
            <circle cx="22" cy="24" r="0.7" />
          </g>
          <text
            x="16.5"
            y="18.5"
            fontFamily="'DM Sans', sans-serif"
            fontWeight="800"
            fontSize="9"
            fill={INK}
            textAnchor="middle"
          >
            A-Z
          </text>
          {/* magnifier */}
          <circle cx="22.5" cy="22.5" r="3.6" fill="#FFFFFF" stroke={RED} strokeWidth="1.8" />
          <line
            x1="25"
            y1="25"
            x2="28"
            y2="28"
            stroke={RED}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );
      break;

    // 4. BLOG, newspaper + pen + NEW badge
    case "blog":
      svg = (
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          {defs}
          <rect
            x="5"
            y="5"
            width="20"
            height="22"
            rx="2.5"
            fill={BEIGE}
            stroke={INK}
            strokeWidth="1.8"
          />
          {/* headline */}
          <line x1="9" y1="10" x2="21" y2="10" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          <line x1="9" y1="13" x2="17" y2="13" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          {/* columns */}
          <line x1="9" y1="17" x2="14" y2="17" stroke={INK} strokeWidth="1" strokeLinecap="round" />
          <line x1="9" y1="19" x2="14" y2="19" stroke={INK} strokeWidth="1" strokeLinecap="round" />
          <line x1="9" y1="21" x2="13" y2="21" stroke={INK} strokeWidth="1" strokeLinecap="round" />
          <line x1="16" y1="17" x2="21" y2="17" stroke={INK} strokeWidth="1" strokeLinecap="round" />
          <line x1="16" y1="19" x2="21" y2="19" stroke={INK} strokeWidth="1" strokeLinecap="round" />
          <line x1="16" y1="21" x2="20" y2="21" stroke={INK} strokeWidth="1" strokeLinecap="round" />
          {/* pen */}
          <g transform="translate(18 19) rotate(35)">
            <rect x="0" y="0" width="2.4" height="7" fill={`url(#${gPen})`} stroke={INK} strokeWidth="0.8" />
            <path d="M0 7 L1.2 9 L2.4 7 Z" fill={INK} />
          </g>
          {/* NEW badge */}
          <circle cx="25" cy="6" r="3.4" fill={RED} stroke={INK} strokeWidth="0.8" />
          <text
            x="25"
            y="7.7"
            fontSize="4.4"
            fontWeight="800"
            fontFamily="'DM Sans', sans-serif"
            fill="#FFFFFF"
            textAnchor="middle"
          >
            N
          </text>
        </svg>
      );
      break;

    // 5. COMMUNITY, overlapping circles + handshake + dotted ring
    case "community":
      svg = (
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          {defs}
          <circle cx="16" cy="16" r="13" fill="none" stroke={GOLD} strokeWidth="1" strokeDasharray="2 2" />
          <circle cx="11" cy="18" r="5.5" fill={RED} opacity="0.75" stroke={INK} strokeWidth="1.2" />
          <circle cx="21" cy="18" r="5.5" fill={RED} opacity="0.75" stroke={INK} strokeWidth="1.2" />
          <circle cx="16" cy="13" r="5.5" fill={`url(#${gGold})`} stroke={INK} strokeWidth="1.4" />
          {/* handshake, two angled segments meeting */}
          <path
            d="M13 16 L16 13.5 L19 16"
            stroke={INK}
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
      break;

    // 6. VIDEO, screen with play + record dot
    case "video":
      svg = (
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          {defs}
          <rect
            x="3"
            y="7"
            width="26"
            height="18"
            rx="4"
            fill={`url(#${gRedGold})`}
            stroke={INK}
            strokeWidth="1.8"
          />
          <path d="M13 11 L21 16 L13 21 Z" fill="#FFFFFF" stroke={INK} strokeWidth="0.8" strokeLinejoin="round" />
          <circle cx="25" cy="10" r="1.6" fill={RED} stroke="#FFFFFF" strokeWidth="0.8" />
        </svg>
      );
      break;

    // 7. ARTICLE, small document with text + folded corner
    case "article":
      svg = (
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          {defs}
          <path
            d="M8 4 L21 4 L25 8 L25 28 Q25 29 24 29 L9 29 Q8 29 8 28 Z"
            fill={BEIGE}
            stroke={INK}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M21 4 L21 8 L25 8 Z" fill={RED} stroke={INK} strokeWidth="1" />
          <line x1="11" y1="13" x2="22" y2="13" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
          <line x1="11" y1="17" x2="22" y2="17" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
          <line x1="11" y1="21" x2="22" y2="21" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
          <line x1="11" y1="25" x2="18" y2="25" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
      break;

    // 8. TEMPLATE, 3x3 spreadsheet grid + bar chart in middle
    case "template":
      svg = (
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          {defs}
          <rect x="4" y="6" width="24" height="20" rx="3" fill="#FFFFFF" stroke={GOLD} strokeWidth="1.8" />
          {/* grid lines */}
          <line x1="12" y1="6" x2="12" y2="26" stroke={GOLD} strokeWidth="1.2" />
          <line x1="20" y1="6" x2="20" y2="26" stroke={GOLD} strokeWidth="1.2" />
          <line x1="4" y1="13" x2="28" y2="13" stroke={GOLD} strokeWidth="1.2" />
          <line x1="4" y1="20" x2="28" y2="20" stroke={GOLD} strokeWidth="1.2" />
          {/* center cell highlight */}
          <rect x="12" y="13" width="8" height="7" fill={RED} />
          {/* bar chart */}
          <rect x="13.5" y="17" width="1.4" height="2" fill="#FFFFFF" />
          <rect x="15.6" y="15.5" width="1.4" height="3.5" fill="#FFFFFF" />
          <rect x="17.7" y="14" width="1.4" height="5" fill="#FFFFFF" />
        </svg>
      );
      break;

    // 9. DISCUSSION, chat bubble + reply + dots
    case "discussion":
      svg = (
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          {defs}
          <path
            d="M4 8 Q4 5 7 5 L21 5 Q24 5 24 8 L24 16 Q24 19 21 19 L12 19 L8 23 L8 19 L7 19 Q4 19 4 16 Z"
            fill={`url(#${gGold})`}
            stroke={INK}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="11" cy="12" r="1.2" fill={INK} />
          <circle cx="14" cy="12" r="1.2" fill={INK} />
          <circle cx="17" cy="12" r="1.2" fill={INK} />
          {/* reply bubble */}
          <path
            d="M16 17 Q16 15 18 15 L27 15 Q29 15 29 17 L29 22 Q29 24 27 24 L23 24 L21 27 L21 24 Q19 24 18 24 Q16 24 16 22 Z"
            fill={RED}
            stroke={INK}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      );
      break;

    // 10. CALLBACK, vintage rotary phone
    case "callback":
      svg = (
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          {defs}
          {/* base disc */}
          <circle cx="26" cy="32" r="13" fill={`url(#${gGold})`} stroke={INK} strokeWidth="2" />
          <circle cx="26" cy="32" r="4.5" fill={BEIGE} stroke={INK} strokeWidth="1.4" />
          {/* dial holes */}
          <g fill={INK} opacity="0.55">
            <circle cx="26" cy="24" r="0.9" />
            <circle cx="32" cy="27" r="0.9" />
            <circle cx="34" cy="33" r="0.9" />
            <circle cx="31" cy="38" r="0.9" />
            <circle cx="21" cy="38" r="0.9" />
            <circle cx="18" cy="33" r="0.9" />
            <circle cx="20" cy="27" r="0.9" />
          </g>
          {/* handset */}
          <g transform="translate(0 0)">
            <path
              d="M11 14 Q9 17 12 20 L18 26 Q21 29 24 26 L27 23 Q30 20 27 17 L21 11 Q18 8 15 11 Z"
              fill={`url(#${gRedGold})`}
              stroke={INK}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* ear/mouth caps */}
            <circle cx="13.5" cy="13.5" r="2.2" fill={INK} opacity="0.35" />
            <circle cx="24.5" cy="24.5" r="2.2" fill={INK} opacity="0.35" />
          </g>
          {/* cord */}
          <path
            d="M24 26 Q28 30 24 34 Q20 38 26 42"
            stroke={INK}
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeDasharray="1.5 2"
          />
          {/* ring waves */}
          <path d="M6 12 Q3 14 6 17" stroke={RED} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.75" />
          <path d="M3 9 Q-0.5 13 3 17" stroke={RED} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.45" />
        </svg>
      );
      break;

    default:
      svg = <svg viewBox="0 0 32 32" />;
  }

  return (
    <Wrap size={size} className={className} title={title} animated={animated}>
      {svg}
    </Wrap>
  );
};

export default FYNIcon;
