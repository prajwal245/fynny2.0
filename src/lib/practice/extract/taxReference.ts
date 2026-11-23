/** File names of returns and tax records that hold no bank lines (GST returns, ITC, 26AS, AIS, ITR, Form 3CD). */
export const TAX_REFERENCE_FILE = /\b(gstr[\s_-]?\w*|gst[\s_-]?(credit|liability|challan|return|payment)|itc|26\s?as|form[\s_-]?26as|ais|annual information|itr|form[\s_-]?3cd|3cd|computation of income|tax audit)\b/i;
