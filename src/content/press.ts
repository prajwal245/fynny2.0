/**
 * Press coverage of the FynHelp launch. One entry per published article.
 * The headline is the same on every outlet (taken from the article address).
 * Logos are optional files in `src/assets/press/<id>.(svg|png|webp|jpg)`.
 */
export interface PressItem {
  id: string;
  /** Outlet name as it should read on the site. */
  outlet: string;
  url: string;
  /** Logo address. Optional: without one the outlet's name is shown. */
  logo?: string;
}

export const PRESS_HEADLINE =
  "Every Month, India's CA Firms Lose a Week to Reconciliation. FynHelp Launches to Win It Back";

/** Slug of the blog article that lists all the coverage. */
export const PRESS_POST_SLUG = "fynhelp-in-the-news-ca-firms-reconciliation-launch";

const SLUG = "every-month-indias-ca-firms-lose-a-week-to-reconciliation-fynhelp-launches-to-win-it-back";

export const PRESS: PressItem[] = [
  {
    id: "dailyhunt", logo: "https://res.cloudinary.com/ghxledou/image/upload/v1793602195/logo_desktop_dark.svg",
    outlet: "Dailyhunt",
    url: "https://m.dailyhunt.in/news/india/english/r+news+india-epaper-dhfacc36dfce9c4bb68db0e89d033c921b/every+month+indias+ca+firms+lose+a+week+to+reconciliation+fynhelp+launches+to+win+it+back-newsid-dhfacc36dfce9c4bb68db0e89d033c921b_2299f150d68311f181fe103af9ee8acf?sm=Y",
  },
  { id: "wowentrepreneurs", logo: "https://res.cloudinary.com/ghxledou/image/upload/v1793602195/Wow-Entrepreneurs-Logo-PNG.png", outlet: "Wow Entrepreneurs", url: `https://wowentrepreneurs.com/${SLUG}/` },
  { id: "entrepreneursaga", outlet: "Entrepreneur Saga", url: `https://entrepreneursaga.com/${SLUG}/` },
  { id: "deccanbusiness", logo: "https://res.cloudinary.com/ghxledou/image/upload/v1793602195/Deccan-Business-PNG-300x104.png", outlet: "Deccan Business", url: `https://deccanbusiness.com/${SLUG}/` },
  { id: "businessreporter", logo: "https://res.cloudinary.com/ghxledou/image/upload/v1793602654/Unconfirmed_848793.png", outlet: "Business Reporter", url: `https://businessreporter.in/${SLUG}/` },
  { id: "1moneymania", outlet: "1MoneyMania", url: `https://1moneymania.in/${SLUG}/` },
  { id: "rdtimes", outlet: "RD Times", url: `https://biz.rdtimes.in/${SLUG}/` },
  { id: "republicnewsindia", logo: "https://res.cloudinary.com/ghxledou/image/upload/v1793602195/cropped-Republic-News-India-New-Logo-PNG.png", outlet: "Republic News India", url: `https://business.republicnewsindia.com/${SLUG}/` },
  { id: "theindianbulletin", logo: "https://res.cloudinary.com/ghxledou/image/upload/v1793602195/cropped-The-Indian-Bulletin-LOGO-PNG.png", outlet: "The Indian Bulletin", url: `https://biz.theindianbulletin.com/${SLUG}/` },
  { id: "newshead", outlet: "NewsHead", url: `https://business.newshead.in/${SLUG}/` },
  { id: "indianscoops", outlet: "Indian Scoops", url: `https://business.indianscoops.com/${SLUG}/` },
];

const logoFiles = import.meta.glob("/src/assets/press/*.{svg,png,webp,jpg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** The outlet's logo file, if one has been added. */
export function pressLogo(id: string): string | undefined {
  const given = PRESS.find((p) => p.id === id)?.logo;
  if (given) return given;
  const hit = Object.entries(logoFiles).find(([path]) => path.split("/").pop()?.replace(/\.[a-z]+$/, "") === id);
  return hit?.[1];
}

/** ItemList markup so search engines and AI answers can see the coverage. */
export function pressLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "FynHelp in the news",
    itemListElement: PRESS.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: p.url,
      name: `${p.outlet}: ${PRESS_HEADLINE}`,
    })),
  };
}
