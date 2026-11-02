/**
 * Press coverage of the FynHelp launch. One entry per published article.
 * Headlines are taken from the article addresses. The home page strip shows the outlets that have a logo;
 * the blog article and the structured data list all of them.
 * Logos are an address here, or a file in `src/assets/press/<id>.(svg|png|webp|jpg)`.
 */
export interface PressItem {
  id: string;
  /** Outlet name as it should read on the site. */
  outlet: string;
  url: string;
  /** The article's headline. */
  headline: string;
  /** Logo address. Optional: without one the outlet's name is shown. */
  logo?: string;
  /** The logo file is white-on-dark. Turn its white to black for light backgrounds. */
  lightLogo?: boolean;
}

export const PRESS_HEADLINE =
  "Every Month, India's CA Firms Lose a Week to Reconciliation. FynHelp Launches to Win It Back";
export const PRESS_HEADLINE_2 = "CA Firms Don't Need Another Accounting Software. FynHelp Is Betting Its Launch on It";
export const PRESS_HEADLINE_3 = "The Junior Accountant's Job Is About to Change. FynHelp's Launch Shows What Comes Next";

/** Slug of the blog article that lists all the coverage. */
export const PRESS_POST_SLUG = "fynhelp-in-the-news-ca-firms-reconciliation-launch";

const SLUG = "every-month-indias-ca-firms-lose-a-week-to-reconciliation-fynhelp-launches-to-win-it-back";

export const PRESS: PressItem[] = [
  {
    id: "dailyhunt", lightLogo: true, logo: "https://res.cloudinary.com/ghxledou/image/upload/v1793602195/logo_desktop_dark.svg",
    outlet: "Dailyhunt", headline: PRESS_HEADLINE,
    url: "https://m.dailyhunt.in/news/india/english/r+news+india-epaper-dhfacc36dfce9c4bb68db0e89d033c921b/every+month+indias+ca+firms+lose+a+week+to+reconciliation+fynhelp+launches+to+win+it+back-newsid-dhfacc36dfce9c4bb68db0e89d033c921b_2299f150d68311f181fe103af9ee8acf?sm=Y",
  },
  { id: "wowentrepreneurs", logo: "https://res.cloudinary.com/ghxledou/image/upload/v1793602195/Wow-Entrepreneurs-Logo-PNG.png", outlet: "Wow Entrepreneurs", headline: PRESS_HEADLINE, url: `https://wowentrepreneurs.com/${SLUG}/` },
  { id: "deccanbusiness", logo: "https://res.cloudinary.com/ghxledou/image/upload/v1793602195/Deccan-Business-PNG-300x104.png", outlet: "Deccan Business", headline: PRESS_HEADLINE, url: `https://deccanbusiness.com/${SLUG}/` },
  { id: "businessreporter", logo: "https://res.cloudinary.com/ghxledou/image/upload/v1793602654/Unconfirmed_848793.png", outlet: "Business Reporter", headline: PRESS_HEADLINE, url: `https://businessreporter.in/${SLUG}/` },
  { id: "republicnewsindia", logo: "https://res.cloudinary.com/ghxledou/image/upload/v1793602195/cropped-Republic-News-India-New-Logo-PNG.png", outlet: "Republic News India", headline: PRESS_HEADLINE, url: `https://business.republicnewsindia.com/${SLUG}/` },
  { id: "theindianbulletin", logo: "https://res.cloudinary.com/ghxledou/image/upload/v1793602195/cropped-The-Indian-Bulletin-LOGO-PNG.png", outlet: "The Indian Bulletin", headline: PRESS_HEADLINE, url: `https://biz.theindianbulletin.com/${SLUG}/` },
  { id: "orangecitytimes", outlet: "Orange City Times", headline: PRESS_HEADLINE_2, url: "https://orangecitytimes.com/ca-firms-dont-need-another-accounting-software-fynhelp-is-betting-its-launch-on-it/" },
  { id: "primepostdaily", outlet: "Prime Post Daily", headline: PRESS_HEADLINE_2, url: "https://primepostdaily.com/ca-firms-dont-need-another-accounting-software-fynhelp-is-betting-its-launch-on-it/" },
  { id: "nationnewsbrief", outlet: "Nation News Brief", headline: PRESS_HEADLINE_3, url: "https://www.nationnewsbrief.com/the-junior-accountants-job-is-about-to-change-fynhelps-launch-shows-what-comes-next/" },
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
