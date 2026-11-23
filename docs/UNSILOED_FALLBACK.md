
---

# OCR fallback through OpenRouter (Mistral OCR, then Pixtral)

A second scan reader for scanned PDFs and photos. Off until `OPENROUTER_API_KEY` is set (in Vercel). Never used when `PRACTICE_DATA_RESIDENCY=india`, because it sends the file to OpenRouter.

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | key | none (feature off) |
| `OPENROUTER_OCR_DISABLED` | `1` turns it off without removing the key | unset |
| `OPENROUTER_OCR_MODELS` | comma-separated, tried in order | `mistralai/mistral-ocr-latest,mistralai/pixtral-large-2411` |
| `OPENROUTER_OCR_TIMEOUT_MS`, `OPENROUTER_OCR_MAX_BYTES` | per call, largest file | `55000`, `12000000` |

Request: `temperature: 0`, `route: "fallback"` with the `models` list, the strict verbatim instruction as the system message, and for a PDF `plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }]`.

When it is used: the primary reader (OCR.space, unchanged) fails, returns nothing, leaves `[ILLEGIBLE]`, or returns something that looks like a statement but has fewer than 3 dates or 3 amounts. With OCR.space not configured, it is the only scan reader. Its Markdown tables are turned into column-spaced text and then go through the same checks as every other read: amounts must appear in the text and statement rows must reconcile to the printed running balance. The AI-call log records provider `openrouter`, the model that answered and the cost OpenRouter reports.
