/**
 * The company details the Terms, Privacy Policy and Refund Policy refer to.
 * Fill these in once; every legal page and the footer pick them up.
 * An empty value is shown as "to be published" rather than a bracketed blank.
 */
export const COMPANY = {
  /** Registered legal name, e.g. "FynHelp Technologies Private Limited". */
  entity: "FIVENTO AI PRIVATE LIMITED",
  /** CIN or LLPIN. */
  cin: "U62013AP2026PTC126138",
  /** Registered office address, one line. */
  address: "C/O Adireddy Prasad, Vinayaka Nagar, Pedagantyada, Visakhapatnam - 530044, Andhra Pradesh",
  /** Grievance Officer's full name. */
  officer: "",
  /** Grievance Officer's telephone, e.g. "+91 80 1234 5678". */
  phone: "",
  /** Where the primary database runs. Change this one line when the database moves (for example "Mumbai, India (Supabase ap-south-1)"); every page that states the region reads it. */
  region: "Sydney, Australia (Supabase ap-southeast-2)",
};

/**
 * WhatsApp number for sales and support, digits only with country code, e.g.
 * "919876543210". Empty hides the WhatsApp link on the pricing page.
 */
export const SUPPORT_WHATSAPP: string = "";

const TOKENS: Record<string, keyof typeof COMPANY> = {
  "{ENTITY}": "entity",
  "{CIN}": "cin",
  "{ADDRESS}": "address",
  "{OFFICER}": "officer",
  "{PHONE}": "phone",
  "{REGION}": "region",
};

const FALLBACK: Record<keyof typeof COMPANY, string> = {
  entity: "FynHelp",
  cin: "its corporate identity number (to be published)",
  address: "the address to be published on this page",
  officer: "To be published",
  phone: "To be published",
  region: "To be published",
};

export function fillCompany(text: string): string {
  return text.replace(/\{(ENTITY|CIN|ADDRESS|OFFICER|PHONE|REGION)\}/g, (m) => {
    const k = TOKENS[m];
    return COMPANY[k]?.trim() || FALLBACK[k];
  });
}
