export const ADMIN_EMAILS = [
  "adireddytarun@fynhelp.com",
  "nidhi@fynhelp.com",
  "support@fynhelp.com",
] as const;

export const isAdminEmail = (email?: string | null) =>
  !!email && ADMIN_EMAILS.includes(email.toLowerCase().trim() as (typeof ADMIN_EMAILS)[number]);
