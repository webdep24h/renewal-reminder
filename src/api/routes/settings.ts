/**
 * API Route: /api/settings
 * Methods: GET, PUT
 * Protected by JWT auth middleware
 */
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { getSupabaseAdmin } from '../lib/supabaseAdmin'

const app = new Hono()

// GET /api/settings — return all settings as { key: value }
app.get('/', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  try {
    const { data, error } = await supabase.from('settings').select('key, value')
    if (error) throw error

    const settings: Record<string, unknown> = {}
    for (const row of data || []) {
      settings[row.key] = row.value
    }
    return c.json({ data: settings, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

// PUT /api/settings — update a setting
// Body: { key: string, value: any }
app.put('/', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  try {
    const { key, value } = await c.req.json()
    if (!key) return c.json({ data: null, error: 'Missing key field' }, 400)

    const { data, error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' })
      .select().single()
    if (error) throw error
    return c.json({ data, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

export default app
