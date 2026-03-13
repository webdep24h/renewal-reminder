/**
 * API Route: /api/push/subscribe, /api/push/unsubscribe
 * Web Push subscription management
 * Protected by JWT auth middleware
 */
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { getSupabaseAdmin } from '../lib/supabaseAdmin'

const app = new Hono()

// POST /api/push/subscribe — subscribe to push notifications
app.post('/subscribe', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  try {
    const { endpoint, keys } = await c.req.json()

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return c.json({ data: null, error: 'Missing endpoint or keys' }, 400)
    }

    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert(
        { endpoint, keys_p256dh: keys.p256dh, keys_auth: keys.auth },
        { onConflict: 'endpoint' }
      )
      .select().single()

    if (error) throw error
    return c.json({ data, error: null }, 201)
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

// DELETE /api/push/subscribe — unsubscribe
app.delete('/subscribe', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  try {
    const { endpoint } = await c.req.json()
    if (!endpoint) return c.json({ data: null, error: 'Missing endpoint' }, 400)

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)

    if (error) throw error
    return c.json({ data: { unsubscribed: true }, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

export default app
