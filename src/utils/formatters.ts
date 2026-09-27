export { formatINR as formatIndianCurrency, formatINRFull, getRunwayColor, getRunwayBg, getDaysOverdueColor } from "@/lib/indian-format";

export const formatIndianDate = (date: string | Date): string =>
  new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
