import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APP_REDIRECT = 'https://fynhelp.com/dashboard/settings/integrations'
function redirect(qs: string) { return new Response(null, { status: 302, headers: { Location: `${APP_REDIRECT}${qs}` } }) }

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const realmId = url.searchParams.get('realmId')
    const err = url.searchParams.get('error')
    if (err) return redirect(`?connected=quickbooks&error=${encodeURIComponent(err)}`)
    if (!code || !state || !realmId) throw new Error('Missing code/state/realmId')

    const [orgId, nonce] = state.split(':')
    if (!orgId || !nonce) throw new Error('Malformed state')

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { data: stateRow } = await supabase.from('integration_oauth_states')
      .select('nonce, organization_id, expires_at').eq('nonce', nonce).eq('provider', 'quickbooks').maybeSingle()
    if (!stateRow) return redirect(`?connected=quickbooks&error=${encodeURIComponent('Invalid OAuth state')}`)
    if (String(stateRow.organization_id) !== String(orgId)) return redirect(`?connected=quickbooks&error=${encodeURIComponent('State org mismatch')}`)
    if (new Date(stateRow.expires_at).getTime() < Date.now()) return redirect(`?connected=quickbooks&error=${encodeURIComponent('OAuth state expired')}`)
    await supabase.from('integration_oauth_states').delete().eq('nonce', nonce)

    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID')!
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET')!
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/quickbooks-callback`

    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    })
    const tokens = await tokenRes.json()
    if (!tokenRes.ok || !tokens.access_token) throw new Error(tokens.error_description ?? tokens.error ?? 'Token exchange failed')

    const nowIso = new Date().toISOString()
    const { error: dbError } = await supabase.from('integrations').upsert({
      organization_id: orgId,
      provider: 'quickbooks',
      status: 'active',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(),
      metadata: { realm_id: realmId, connected_at: nowIso, refresh_expires_in: tokens.x_refresh_token_expires_in ?? null },
      updated_at: nowIso,
    }, { onConflict: 'organization_id,provider' })
    if (dbError) throw dbError

    return redirect(`?connected=quickbooks`)
  } catch (error) {
    console.error('quickbooks-callback error:', error)
    return redirect(`?connected=quickbooks&error=${encodeURIComponent((error as Error).message)}`)
  }
})
