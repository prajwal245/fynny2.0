// Validates the internal demo password server-side and returns a short-lived
// HMAC-signed token. The client stores the token in sessionStorage to unlock
// the internal demo dashboard. No password value ever ships in client code.
import { encodeBase64Url as b64url } from 'https://deno.land/std@0.224.0/encoding/base64url.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEMO_PASSWORD = Deno.env.get('DEMO_PASSWORD') ?? ''
const DEMO_TOKEN_SECRET = Deno.env.get('DEMO_TOKEN_SECRET') ?? ''
const TOKEN_TTL_SECONDS = 60 * 60 * 8 // 8h

function ctEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(DEMO_TOKEN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return b64url(new Uint8Array(sig))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!DEMO_PASSWORD || !DEMO_TOKEN_SECRET) {
    return new Response(JSON.stringify({ error: 'Demo access not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { password?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const password = String(body?.password ?? '')
  if (password.length === 0 || password.length > 256) {
    return new Response(JSON.stringify({ error: 'Invalid password' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!ctEq(password, DEMO_PASSWORD)) {
    return new Response(JSON.stringify({ error: 'Incorrect password' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ sub: 'demo', exp })))
  const sig = await sign(payload)
  const tokenStr = `${payload}.${sig}`

  return new Response(JSON.stringify({ token: tokenStr, expires_at: exp }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
