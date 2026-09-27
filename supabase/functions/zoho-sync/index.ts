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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Require Bearer JWT ──
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: claims } = await userClient.auth.getClaims(token)
    if (!claims?.claims?.sub) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = claims.claims.sub as string

    const { organization_id } = await req.json()
    if (!organization_id) {
      return new Response(JSON.stringify({ success: false, error: 'organization_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // ── Verify caller owns organization_id ──
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (!profile?.business_id || String(profile.business_id) !== String(organization_id)) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('organization_id', organization_id)
      .eq('provider', 'zoho_books')
      .single()

    if (integrationError || !integration) throw new Error('Zoho Books not connected')

    let accessToken = integration.access_token

    if (new Date(integration.expires_at) < new Date()) {
      const refreshResponse = await fetch('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: Deno.env.get('ZOHO_CLIENT_ID')!,
          client_secret: Deno.env.get('ZOHO_CLIENT_SECRET')!,
          refresh_token: integration.refresh_token,
        }),
      })

      const newTokens = await refreshResponse.json()
      if (newTokens.error) throw new Error(`Token refresh failed: ${newTokens.error}`)

      accessToken = newTokens.access_token

      await supabase
        .from('integrations')
        .update({
          access_token: newTokens.access_token,
          expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
        })
        .eq('organization_id', organization_id)
        .eq('provider', 'zoho_books')
    }

    const apiDomain = integration.metadata?.api_domain || 'https://books.zoho.com'

    const orgsResponse = await fetch(`${apiDomain}/api/v3/organizations`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    })
    const orgsData = await orgsResponse.json()

    if (!orgsData.organizations || orgsData.organizations.length === 0) {
      throw new Error('No Zoho Books organizations found')
    }

    const zohoOrgId = orgsData.organizations[0].organization_id

    const [invoicesResponse, expensesResponse] = await Promise.all([
      fetch(`${apiDomain}/api/v3/invoices?organization_id=${zohoOrgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      }),
      fetch(`${apiDomain}/api/v3/expenses?organization_id=${zohoOrgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      }),
    ])

    const invoicesData = await invoicesResponse.json()
    const expensesData = await expensesResponse.json()

    const invoices = invoicesData.invoices || []
    const expenses = expensesData.expenses || []

    const transactions: any[] = []

    invoices.forEach((inv: any) => {
      transactions.push({
        organization_id,
        date: inv.date,
        description: `Invoice ${inv.invoice_number} - ${inv.customer_name}`,
        amount: Math.round(inv.total * 100),
        type: 'inflow',
        category: 'Revenue',
        customer: inv.customer_name,
        invoice_number: inv.invoice_number,
        gst_amount: Math.round((inv.tax_total || 0) * 100),
        metadata: { zoho_invoice_id: inv.invoice_id, status: inv.status, source: 'zoho_books' },
      })
    })

    expenses.forEach((exp: any) => {
      transactions.push({
        organization_id,
        date: exp.date,
        description: exp.description || exp.account_name,
        amount: Math.round(exp.total * 100),
        type: 'outflow',
        category: exp.account_name,
        vendor: exp.vendor_name,
        gst_amount: Math.round((exp.tax_amount || 0) * 100),
        metadata: { zoho_expense_id: exp.expense_id, source: 'zoho_books' },
      })
    })

    const { error: insertError } = await supabase.from('demo_transactions').insert(transactions)
    if (insertError) throw insertError

    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      },
      body: JSON.stringify({ organization_id }),
    })

    return new Response(
      JSON.stringify({
        success: true,
        synced: transactions.length,
        invoices: invoices.length,
        expenses: expenses.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Zoho sync error:', error)
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
