/**
 * API Route: /api/renewals/:id/history
 * Methods: GET, POST
 * Protected by JWT auth middleware
 */
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { getSupabaseAdmin } from '../lib/supabaseAdmin'

const app = new Hono()
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/renewals/:id/history — get renewal history
app.get('/:id/history', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  const id = c.req.param('id')

  if (!UUID_REGEX.test(id)) return c.json({ data: null, error: 'Invalid id format' }, 400)

  try {
    const { data, error } = await supabase
      .from('renewal_history')
      .select('*')
      .eq('renewal_id', id)
      .order('renewed_date', { ascending: false })
    if (error) throw error
    return c.json({ data, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

// POST /api/renewals/:id/history — add renewal record
app.post('/:id/history', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  const id = c.req.param('id')

  if (!UUID_REGEX.test(id)) return c.json({ data: null, error: 'Invalid id format' }, 400)

  try {
    const body = await c.req.json()
    const { renewed_date, old_expiry, new_expiry, cost, period_months, notes } = body

    if (!renewed_date || !old_expiry || !new_expiry) {
      return c.json({ data: null, error: 'Missing required fields: renewed_date, old_expiry, new_expiry' }, 400)
    }

    // Insert history record
    const { data: historyData, error: historyError } = await supabase
      .from('renewal_history')
      .insert([{ renewal_id: id, renewed_date, old_expiry, new_expiry, cost, period_months, notes }])
      .select().single()
    if (historyError) throw historyError

    // Update the renewal expiry date
    const { data: renewalData, error: renewalError } = await supabase
      .from('renewals')
      .update({ expiry_date: new_expiry })
      .eq('id', id).select().single()
    if (renewalError) throw renewalError

    return c.json({ data: { history: historyData, renewal: renewalData }, error: null }, 201)
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

export default app
