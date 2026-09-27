import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APP_REDIRECT = 'https://fynhelp.com/dashboard/settings/integrations'

function redirect(qs: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${APP_REDIRECT}${qs}` },
  })
}

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) {
      console.error('Zoho OAuth error:', error)
      return redirect(`?zoho=error&message=${encodeURIComponent(error)}`)
    }

    if (!code || !state) throw new Error('Missing code or state')

    const [orgId, nonce] = state.split(':')
    if (!orgId || !nonce) throw new Error('Malformed state')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── Verify state nonce was issued by zoho-auth and not expired ──
    const { data: stateRow, error: stateLookupErr } = await supabase
      .from('integration_oauth_states')
      .select('nonce, organization_id, expires_at')
      .eq('nonce', nonce)
      .eq('provider', 'zoho_books')
      .maybeSingle()
    if (stateLookupErr || !stateRow) {
      console.error('zoho-callback: unknown state', { nonce, err: stateLookupErr })
      return redirect(`?zoho=error&message=${encodeURIComponent('Invalid OAuth state')}`)
    }
    if (String(stateRow.organization_id) !== String(orgId)) {
      return redirect(`?zoho=error&message=${encodeURIComponent('State org mismatch')}`)
    }
    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      return redirect(`?zoho=error&message=${encodeURIComponent('OAuth state expired')}`)
    }
    // Single-use: delete immediately
    await supabase.from('integration_oauth_states').delete().eq('nonce', nonce)

    const clientId = Deno.env.get('ZOHO_CLIENT_ID')!
    const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET')!
    const redirectUri = Deno.env.get('ZOHO_REDIRECT_URI')!

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

    const { error: dbError } = await supabase
      .from('integrations')
      .upsert({
        organization_id: orgId,
        provider: 'zoho_books',
        status: 'active',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        metadata: {
          api_domain: tokens.api_domain || 'https://books.zoho.com',
          connected_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,provider' })

    if (dbError) throw dbError

    return redirect(`?zoho=connected`)
  } catch (error) {
    console.error('OAuth callback error:', error)
    return redirect(`?zoho=error&message=${encodeURIComponent((error as Error).message)}`)
  }
})
