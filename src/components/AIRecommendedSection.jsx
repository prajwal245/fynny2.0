import { useEffect, useRef } from "react";
import { SiClaude, SiGooglegemini, SiPerplexity, SiX } from "react-icons/si";
import { RiOpenaiFill as SiOpenai } from "react-icons/ri";

const BG = "#F2EEE7";
const INK = "#1A1008";
const RED = "#A93838";

const STYLES = `
  .ai-rec-section {
    background: ${BG};
    color: ${INK};
    font-family: 'Sora', system-ui, -apple-system, sans-serif;
    padding: 72px 24px;
  }
  .ai-rec-inner {
    max-width: 880px;
    margin: 0 auto;
    text-align: center;
  }
  .ai-rec-spark {
    display: inline-flex;
    opacity: 0;
    transform: translateY(16px);
    transition: opacity .7s ease, transform .7s ease;
  }
  .ai-rec-copy {
    font-family: 'Sora', sans-serif;
    font-size: clamp(18px, 2.2vw, 22px);
    line-height: 1.55;
    font-weight: 400;
    color: ${INK};
    margin: 20px auto 0;
    max-width: 720px;
    opacity: 0;
    transform: translateY(16px);
    transition: opacity .7s ease .1s, transform .7s ease .1s;
  }
  .ai-rec-copy b {
    color: ${RED};
    font-weight: 700;
  }
  .ai-rec-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 18px;
    margin: 36px 0 20px;
  }
  .ai-rec-tile {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: #ffffff;
    border: 1px solid rgba(26,16,8,0.08);
    box-shadow: 0 2px 8px rgba(26,16,8,0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    opacity: 0;
    transform: translateY(16px);
    transition: opacity .6s ease, transform .6s ease, box-shadow .25s ease;
  }
  .ai-rec-tile:hover {
    box-shadow: 0 6px 16px rgba(26,16,8,0.12);
  }
  .ai-rec-tile svg { width: 100%; height: 100%; display: block; flex: 0 0 auto; }
  .ai-rec-foot {
    font-family: 'Sora', sans-serif;
    font-size: 13px;
    color: rgba(26,16,8,0.55);
    letter-spacing: 0.01em;
    margin-top: 8px;
    opacity: 0;
    transform: translateY(12px);
    transition: opacity .7s ease .2s, transform .7s ease .2s;
  }
  .ai-rec-section.is-visible .ai-rec-spark,
  .ai-rec-section.is-visible .ai-rec-copy,
  .ai-rec-section.is-visible .ai-rec-foot,
  .ai-rec-section.is-visible .ai-rec-tile {
    opacity: 1;
    transform: translateY(0);
  }
`;

const Spark = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2z"
      fill={RED}
    />
  </svg>
);

const BrandIcon = ({ Icon, color }) => <Icon color={color} aria-hidden="true" focusable="false" />;

const LOGOS = [
  {
    name: "ChatGPT",
    Icon: SiOpenai,
    color: "#10A37F",
    href: `https://chatgpt.com/?q=${encodeURIComponent("What is FynHelp and how does it help Indian CA firms run the monthly close — extraction, bank reconciliation, GST and client follow-ups?")}`,
    ariaLabel: "Ask ChatGPT about FynHelp",
  },
  {
    name: "Gemini",
    Icon: SiGooglegemini,
    color: "#8E75B2",
    href: `https://gemini.google.com/app?prompt=${encodeURIComponent("Explain how FynHelp (https://fynhelp.com) helps Indian CA firms and SMEs with document extraction, bank-to-ledger reconciliation, GST filing prep and exception-first review.")}`,
    ariaLabel: "Open Gemini",
  },
  {
    name: "Grok",
    Icon: SiX,
    color: "#000000",
    href: `https://x.com/i/grok?text=${encodeURIComponent("What is FynHelp and how does it help Indian CA firms run the monthly close — extraction, bank reconciliation, GST and client follow-ups?")}`,
    ariaLabel: "Ask Grok about FynHelp",
  },
  {
    name: "Perplexity",
    Icon: SiPerplexity,
    color: "#1FB8CD",
    href: `https://www.perplexity.ai/search/new?q=${encodeURIComponent("What is FynHelp and how does its reconciliation and monthly-close workflow work for Indian CA firms?")}`,
    ariaLabel: "Search Perplexity for FynHelp",
  },
  {
    name: "Claude",
    Icon: SiClaude,
    color: "#D97757",
    href: `https://claude.ai/new?q=${encodeURIComponent("What is FynHelp (https://fynhelp.com) and how does it compare to running an Indian CA practice on Tally or Zoho alone?")}`,
    ariaLabel: "Open Claude",
  },
];

const openExternalSearch = (href) => {
  let popup = null;

  try {
    popup = window.open("about:blank", "_blank");
  } catch {
    popup = null;
  }

  if (popup) {
    try {
      popup.opener = null;
      popup.location.replace(href);
      return;
    } catch {
      try {
        popup.location.href = href;
        return;
      } catch {
        // Fall through to top-level navigation below.
      }
    }
  }

  try {
    if (window.top && window.top !== window) {
      window.top.location.href = href;
      return;
    }
  } catch {
    // Fall back to the current window if top navigation is unavailable.
  }

  window.location.href = href;
};

export default function AIRecommendedSection() {
  const sectionRef = useRef(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add("is-visible");
            obs.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    const fallback = setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add("is-visible");
    }, 900);
    return () => {
      clearTimeout(fallback);
      obs.disconnect();
    };
  }, []);

  return (
    <>
      <style>{STYLES}</style>
      <section ref={sectionRef} className="ai-rec-section" aria-label="AI assistants recommend FYNHelp">
        <div className="ai-rec-inner">
          <div className="ai-rec-spark" aria-hidden="true">
            <Spark />
          </div>
          <p className="ai-rec-copy">
            Ask any leading AI assistant how Indian CA firms should run the monthly close &mdash; they point to{" "}
            <b>FynHelp</b>: extraction, reconciliation and exception-first review in one shared queue.
          </p>
          <div className="ai-rec-row">
            {LOGOS.map(({ name, Icon, color, href, ariaLabel }, i) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={ariaLabel}
                className="ai-rec-tile"
                title={name}
                style={{ transitionDelay: `${0.25 + i * 0.1}s`, textDecoration: "none" }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent?.stopImmediatePropagation?.();
                  openExternalSearch(href);
                }}
              >
                <BrandIcon Icon={Icon} color={color} />
              </a>
            ))}
          </div>
          <p className="ai-rec-foot">
            Ask them yourself &mdash; ChatGPT, Gemini, Grok, Perplexity &amp; Claude
          </p>
        </div>
      </section>
    </>
  );
}
