import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const token = authHeader.replace('Bearer ', '')
    const { data: claims } = await userClient.auth.getClaims(token)
    if (!claims?.claims?.sub) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const userId = claims.claims.sub as string

    const { organization_id } = await req.json()
    if (!organization_id) return new Response(JSON.stringify({ error: 'organization_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const { data: profile } = await admin.from('profiles').select('business_id').eq('user_id', userId).maybeSingle()
    if (!profile?.business_id || String(profile.business_id) !== String(organization_id)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const clientId = Deno.env.get('HUBSPOT_CLIENT_ID')
    if (!clientId) return new Response(JSON.stringify({ error: 'HubSpot not configured. Add HUBSPOT_CLIENT_ID.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const redirectUri = `${SUPABASE_URL}/functions/v1/hubspot-callback`

    const stateNonce = crypto.randomUUID()
    const state = `${organization_id}:${stateNonce}`
    const { error: stateErr } = await admin.from('integration_oauth_states').insert({
      nonce: stateNonce, provider: 'hubspot', organization_id, user_id: userId,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    if (stateErr) return new Response(JSON.stringify({ error: 'Failed to initialize OAuth state' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const authUrl = new URL('https://app.hubspot.com/oauth/authorize')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('scope', 'crm.objects.contacts.read crm.objects.deals.read')
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('state', state)

    return new Response(JSON.stringify({ authorization_url: authUrl.toString(), state }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })
  } catch (error) {
    console.error('hubspot-auth error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})
