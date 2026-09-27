import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APP_REDIRECT = 'https://fynhelp.com/dashboard/settings/integrations'

function redirect(qs: string) {
  return new Response(null, { status: 302, headers: { Location: `${APP_REDIRECT}${qs}` } })
}

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')
    if (error) return redirect(`?connected=zoho_payroll&error=${encodeURIComponent(error)}`)
    if (!code || !state) throw new Error('Missing code or state')

    const [orgId, nonce] = state.split(':')
    if (!orgId || !nonce) throw new Error('Malformed state')

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { data: stateRow } = await supabase.from('integration_oauth_states')
      .select('nonce, organization_id, expires_at').eq('nonce', nonce).eq('provider', 'zoho_payroll').maybeSingle()
    if (!stateRow) return redirect(`?connected=zoho_payroll&error=${encodeURIComponent('Invalid OAuth state')}`)
    if (String(stateRow.organization_id) !== String(orgId)) return redirect(`?connected=zoho_payroll&error=${encodeURIComponent('State org mismatch')}`)
    if (new Date(stateRow.expires_at).getTime() < Date.now()) return redirect(`?connected=zoho_payroll&error=${encodeURIComponent('OAuth state expired')}`)
    await supabase.from('integration_oauth_states').delete().eq('nonce', nonce)

    const clientId = Deno.env.get('ZOHO_CLIENT_ID')!
    const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET')!
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/zoho-payroll-callback`

    const tokenResponse = await fetch('https://accounts.zoho.com/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    })
    const tokens = await tokenResponse.json()
    if (tokens.error) throw new Error(tokens.error)

    const { error: dbError } = await supabase.from('integrations').upsert({
      organization_id: orgId,
      provider: 'zoho_payroll',
      status: 'active',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      metadata: {
        api_domain: tokens.api_domain || 'https://payroll.zoho.com',
        connected_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,provider' })
    if (dbError) throw dbError

    return redirect(`?connected=zoho_payroll`)
  } catch (error) {
    console.error('zoho-payroll-callback error:', error)
    return redirect(`?connected=zoho_payroll&error=${encodeURIComponent((error as Error).message)}`)
  }
})
