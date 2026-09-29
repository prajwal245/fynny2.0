// Creates a new demo organization and returns its stable text id.
// Used by DemoDashboard when no session org exists, and as a public API
// for programmatic demo provisioning.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Body {
  name?: string
  email?: string
  industry?: string
  employees?: string
  monthly_revenue?: string
  challenge?: string
}

function generateOrgId(): string {
  return `org_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'Server misconfigured: missing service key' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    /* allow empty body */
  }

  const name = (body.name ?? '').toString().trim().slice(0, 120) || 'Demo Organization'
  const email = (body.email ?? '').toString().trim().slice(0, 200) || null
  const demoOrgId = generateOrgId()

  try {
    const { data: org, error } = await supabase
      .from('demo_organizations')
      .insert({
        demo_org_id: demoOrgId,
        name,
        business_name: name,
        email,
        industry: body.industry ?? null,
        employees: body.employees ?? null,
        monthly_revenue: body.monthly_revenue ?? null,
        challenge: body.challenge ?? null,
        metadata: { created_via: 'create-demo-org', created_at: new Date().toISOString() },
      })
      .select()
      .single()

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, organization_id: demoOrgId, organization: org }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('create-demo-org failed:', msg)
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
