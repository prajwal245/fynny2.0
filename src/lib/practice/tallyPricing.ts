/**
 * Price of the Tally posting module: 15% below the comparable per-page packs of
 * Tally's own "Docs by Ira" (as shown in the screenshot supplied by the founder).
 * Reference list prices (ex GST): Regular Pack ₹2 per page (₹400 for 200 pages), Pro Pack ₹1 per page
 * (₹3,000 for 3,000 pages), valid 1 year, +18% GST. The 400 and 600 page prices were not
 * visible and are ASSUMED to follow ₹2 per page: confirm before publishing.
 */
export const REFERENCE_PER_PAGE = { regular: 2, pro: 1 } as const;
export const DISCOUNT = 0.15;
export const GST_RATE = 0.18;
export const VALIDITY_MONTHS = 12;

export interface PagePack {
  key: string;
  name: "Regular" | "Pro";
  pages: number;
  /** Reference price, ex GST. */
  referencePrice: number;
  /** FynHelp price, ex GST, whole rupees. */
  price: number;
  /** GST in rupees and paise, so the total is exactly what Razorpay charges. */
  gst: number;
  total: number;
  perPage: number;
}

const make = (name: PagePack["name"], pages: number): PagePack => {
  const referencePrice = pages * (name === "Pro" ? REFERENCE_PER_PAGE.pro : REFERENCE_PER_PAGE.regular);
  const price = Math.round(referencePrice * (1 - DISCOUNT));
  const gst = Math.round(price * GST_RATE * 100) / 100;
  return { key: `${name.toLowerCase()}-${pages}`, name, pages, referencePrice, price, gst, total: Math.round((price + gst) * 100) / 100, perPage: Math.round((price / pages) * 100) / 100 };
};

export const PAGE_PACKS: PagePack[] = [make("Regular", 200), make("Regular", 400), make("Regular", 600), make("Pro", 3000)];

/** Pages a pack still has, never below zero. */
export const pagesLeft = (bought: number, used: number): number => Math.max(0, Math.floor(bought) - Math.max(0, Math.floor(used)));
