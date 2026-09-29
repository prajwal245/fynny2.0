// Internal AI proxy for the practice agents (Extract, Narrate).
//
// The app server calls this with the service role key when it has no AI key of
// its own; this function holds the Lovable Cloud AI key (and optionally Groq).
// It is not callable from browsers: the caller must present the service key.
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface Req {
  purpose?: string;
  system?: string;
  user?: string;
  attachment?: { mime: string; base64: string };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(bearer, SERVICE_KEY)) return json({ error: "Forbidden" }, 403);

  let body: Req;
  try { body = await req.json(); } catch { return json({ error: "Invalid body" }, 400); }
  if (!body.system || !body.user) return json({ error: "system and user are required" }, 400);
  if (body.attachment && body.attachment.base64.length > 20_000_000) return json({ error: "Attachment too large" }, 413);

  const useGroq = GROQ_API_KEY && !body.attachment;
  const url = useGroq ? "https://api.groq.com/openai/v1/chat/completions" : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const key = useGroq ? GROQ_API_KEY : LOVABLE_API_KEY;
  const model = useGroq ? "llama-3.3-70b-versatile" : "google/gemini-2.5-flash";
  if (!key) return json({ error: "No AI key configured for practice-ai" }, 503);

  const userContent = body.attachment
    ? [
        { type: "text", text: body.user },
        { type: "image_url", image_url: { url: `data:${body.attachment.mime};base64,${body.attachment.base64}` } },
      ]
    : body.user;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: body.system },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    console.error(JSON.stringify({ evt: "practice_ai_upstream_error", status: res.status, purpose: body.purpose, detail }));
    // Pass rate limits through so the caller backs off.
    return json({ error: `Upstream ${res.status}` }, res.status === 429 ? 429 : 502);
  }
  const out = await res.json();
  const content = out?.choices?.[0]?.message?.content ?? "";
  return json({ content, provider: useGroq ? "groq" : "lovable", model });
});
