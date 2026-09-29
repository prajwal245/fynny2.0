// Scheduled refresh of demo_insights for all active demo organizations.
// Triggered daily via pg_cron. See migration that registers the job.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BATCH_SIZE = 10
const PER_ORG_TIMEOUT_MS = 5_000
const TOTAL_TIMEOUT_MS = 5 * 60_000
const ACTIVE_WINDOW_DAYS = 30

interface OrgResult {
  orgId: string
  status: 'success' | 'failed'
  attempts: number
  error?: string
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ])
}

async function refreshOrg(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  orgId: string,
): Promise<void> {
  const res = await withTimeout(
    fetch(`${supabaseUrl}/functions/v1/generate-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ organization_id: orgId }),
    }),
    PER_ORG_TIMEOUT_MS,
    `generate-insights(${orgId})`,
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`generate-insights HTTP ${res.status}: ${body.slice(0, 200)}`)
  }

  const insights = await res.json()

  // Replace cached row (no unique constraint on org_id, so delete+insert).
  const { error: delErr } = await supabase
    .from('demo_insights')
    .delete()
    .eq('org_id', orgId)
  if (delErr) throw new Error(`delete cache: ${delErr.message}`)

  const { error: insErr } = await supabase
    .from('demo_insights')
    .insert({ org_id: orgId, data: insights })
  if (insErr) throw new Error(`insert cache: ${insErr.message}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── Auth: require shared CRON_SECRET (set on the pg_cron HTTP call) ──
  const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
  const provided =
    req.headers.get('x-cron-secret') ??
    (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!cronSecret || provided !== cronSecret) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const startedAt = Date.now()
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing SUPABASE_URL / SERVICE_ROLE_KEY' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  try {
    console.log('🔄 scheduled-insights-refresh: starting')

    const cutoff = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10)

    const { data: rows, error: orgsError } = await supabase
      .from('demo_transactions')
      .select('organization_id')
      .gte('date', cutoff)

    if (orgsError) throw orgsError

    const uniqueOrgs = Array.from(
      new Set((rows ?? []).map((r: any) => r.organization_id).filter(Boolean)),
    ) as string[]

    console.log(`📊 ${uniqueOrgs.length} active org(s) in last ${ACTIVE_WINDOW_DAYS} days`)

    const results: OrgResult[] = []

    for (let i = 0; i < uniqueOrgs.length; i += BATCH_SIZE) {
      if (Date.now() - startedAt > TOTAL_TIMEOUT_MS) {
        console.warn('⏱️ total timeout reached, stopping')
        break
      }

      const batch = uniqueOrgs.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(
        batch.map(async (orgId): Promise<OrgResult> => {
          // Attempt 1
          try {
            await refreshOrg(supabase, supabaseUrl, serviceKey, orgId)
            return { orgId, status: 'success', attempts: 1 }
          } catch (e1) {
            console.warn(`⚠️ ${orgId} attempt 1 failed: ${(e1 as Error).message}`)
            // Retry once
            try {
              await refreshOrg(supabase, supabaseUrl, serviceKey, orgId)
              return { orgId, status: 'success', attempts: 2 }
            } catch (e2) {
              const msg = (e2 as Error).message
              console.error(`❌ ${orgId} failed after retry: ${msg}`)
              return { orgId, status: 'failed', attempts: 2, error: msg }
            }
          }
        }),
      )

      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value)
        else results.push({ orgId: 'unknown', status: 'failed', attempts: 0, error: String(r.reason) })
      }

      if (i + BATCH_SIZE < uniqueOrgs.length) {
        await new Promise((res) => setTimeout(res, 250))
      }
    }

    const summary = {
      success: results.filter((r) => r.status === 'success').length,
      failed: results.filter((r) => r.status === 'failed').length,
      total: uniqueOrgs.length,
      processed: results.length,
      skipped: uniqueOrgs.length - results.length,
      duration_ms: Date.now() - startedAt,
    }

    console.log('✅ scheduled-insights-refresh complete', summary)

    return new Response(
      JSON.stringify({
        success: true,
        ...summary,
        errors: results.filter((r) => r.status === 'failed'),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('❌ scheduled-insights-refresh fatal:', msg)
    return new Response(
      JSON.stringify({ success: false, error: msg, duration_ms: Date.now() - startedAt }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
