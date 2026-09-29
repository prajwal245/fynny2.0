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
    const shop = url.searchParams.get('shop')
    const err = url.searchParams.get('error')
    if (err) return redirect(`?connected=shopify&error=${encodeURIComponent(err)}`)
    if (!code || !state || !shop) throw new Error('Missing code/state/shop')

    const [orgId, nonce] = state.split(':')
    if (!orgId || !nonce) throw new Error('Malformed state')

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { data: stateRow } = await supabase.from('integration_oauth_states')
      .select('nonce, organization_id, expires_at').eq('nonce', nonce).eq('provider', 'shopify').maybeSingle()
    if (!stateRow) return redirect(`?connected=shopify&error=${encodeURIComponent('Invalid OAuth state')}`)
    const [storedOrg, storedShop] = String(stateRow.organization_id).split('|')
    if (storedOrg !== orgId) return redirect(`?connected=shopify&error=${encodeURIComponent('State org mismatch')}`)
    if (storedShop && storedShop !== shop) return redirect(`?connected=shopify&error=${encodeURIComponent('State shop mismatch')}`)
    if (new Date(stateRow.expires_at).getTime() < Date.now()) return redirect(`?connected=shopify&error=${encodeURIComponent('OAuth state expired')}`)
    await supabase.from('integration_oauth_states').delete().eq('nonce', nonce)

    const clientId = Deno.env.get('SHOPIFY_API_KEY')!
    const clientSecret = Deno.env.get('SHOPIFY_API_SECRET')!

    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    })
    const tokens = await tokenRes.json()
    if (!tokenRes.ok || !tokens.access_token) throw new Error(tokens.error_description ?? tokens.error ?? 'Token exchange failed')

    const nowIso = new Date().toISOString()
    const { error: dbError } = await supabase.from('integrations').upsert({
      organization_id: orgId,
      provider: 'shopify',
      status: 'active',
      access_token: tokens.access_token,
      metadata: { shop_domain: shop, scopes: tokens.scope ?? 'read_orders,read_products,read_inventory', connected_at: nowIso },
      updated_at: nowIso,
    }, { onConflict: 'organization_id,provider' })
    if (dbError) throw dbError

    return redirect(`?connected=shopify`)
  } catch (error) {
    console.error('shopify-callback error:', error)
    return redirect(`?connected=shopify&error=${encodeURIComponent((error as Error).message)}`)
  }
})
