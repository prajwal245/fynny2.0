/** Crisp live chat. The website id is public (it appears in every page that loads the widget). */
export const CRISP_WEBSITE_ID = "255b45ba-a6f2-423a-bd28-8149ebc41a40";

/** Only the live site chats: previews and local runs never connect to the Crisp workspace. */
export const crispHostOk = (host: string) => /(^|\.)fynhelp\.com$/.test(host);

/** The admin panel never shows the customer chat. */
export const crispPathOk = (path: string) => !(path === "/admin" || path.startsWith("/admin/"));
