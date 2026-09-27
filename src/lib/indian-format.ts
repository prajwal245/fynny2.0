/**
 * Indian number formatter utility
 * ₹12,40,000 → "₹12.4L"
 * ₹1,00,00,000 → "₹1Cr"
 */
export const formatINR = (amount: number): string => {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (abs >= 10000000) {
    const cr = abs / 10000000;
    return `${sign}₹${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(1)}Cr`;
  }
  if (abs >= 100000) {
    const l = abs / 100000;
    return `${sign}₹${l % 1 === 0 ? l.toFixed(0) : l.toFixed(1)}L`;
  }
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}₹${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `${sign}₹${abs.toFixed(0)}`;
};

export const formatINRFull = (amount: number): string => {
  return `₹${amount.toLocaleString("en-IN")}`;
};

/**
 * Runway color utility
 * > 90 days → green (success)
 * 30-90 days → amber (warning)
 * < 30 days → red (danger)
 */
export const getRunwayColor = (days: number): string => {
  if (days > 90) return "text-fyn-success";
  if (days >= 30) return "text-fyn-warning";
  return "text-fyn-red";
};

export const getRunwayBg = (days: number): string => {
  if (days > 90) return "bg-fyn-success";
  if (days >= 30) return "bg-amber-500";
  return "bg-fyn-red";
};

export const getDaysOverdueColor = (days: number): string => {
  if (days <= 0) return "text-fyn-success";
  if (days <= 30) return "text-fyn-success";
  if (days <= 60) return "text-fyn-warning";
  return "text-fyn-red";
};
