/**
 * API Route: /api/notifications
 * Methods: GET, PUT, DELETE
 * Protected by JWT auth middleware
 */
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { getSupabaseAdmin } from '../lib/supabaseAdmin'

const app = new Hono()

// GET /api/notifications — get unread notifications
// GET /api/notifications?all=true — get all notifications
app.get('/', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  const { all } = c.req.query() as Record<string, string>

  try {
    let query = supabase
      .from('notification_log')
      .select(`
        id, renewal_id, channel, level, is_read, read_at, sent_at,
        renewals (id, name, type, customer, expiry_date)
      `)
      .order('sent_at', { ascending: false })
      .limit(100)

    if (all !== 'true') {
      query = query.eq('is_read', false)
    }

    const { data, error } = await query
    if (error) throw error
    return c.json({ data, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

// PUT /api/notifications — mark notifications as read
// Body: { ids: string[] } or { all: true }
app.put('/', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  try {
    const { ids, all } = await c.req.json()
    const now = new Date().toISOString()

    let query = supabase.from('notification_log').update({ is_read: true, read_at: now })

    if (all === true) {
      query = query.eq('is_read', false)
    } else if (ids && ids.length > 0) {
      query = query.in('id', ids)
    } else {
      return c.json({ data: null, error: 'Missing ids or all parameter' }, 400)
    }

    const { data, error } = await query.select('id')
    if (error) throw error
    return c.json({ data: { updated: data?.length || 0 }, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

// DELETE /api/notifications — clear all read notifications
app.delete('/', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  try {
    const { error } = await supabase
      .from('notification_log')
      .delete()
      .eq('is_read', true)
    if (error) throw error
    return c.json({ data: { cleared: true }, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

export default app
