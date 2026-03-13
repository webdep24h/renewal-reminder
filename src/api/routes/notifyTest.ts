/**
 * API Route: /api/notify/test
 * Test Web Push notification
 * Protected by JWT auth middleware
 */
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { getSupabaseAdmin } from '../lib/supabaseAdmin'

const app = new Hono()

// POST /api/notify/test — send test push notification to all subscriptions
app.post('/test', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })

  const vapidPublic = c.env.VITE_VAPID_PUBLIC_KEY || c.env.VAPID_PUBLIC_KEY
  const vapidPrivate = c.env.VAPID_PRIVATE_KEY
  const vapidSubject = c.env.VAPID_SUBJECT || 'mailto:admin@example.com'

  if (!vapidPublic || !vapidPrivate) {
    return c.json({ data: null, error: 'VAPID keys not configured' }, 500)
  }

  try {
    // Fetch all subscriptions
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, keys_p256dh, keys_auth')
    if (error) throw error

    if (!subscriptions || subscriptions.length === 0) {
      return c.json({ data: { sent: 0, message: 'No subscriptions found' }, error: null })
    }

    // Build test payload
    const payload = JSON.stringify({
      title: '🔔 Test Notification — Renewal Reminder',
      body: 'Thông báo thử nghiệm hoạt động thành công!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'test-notification',
      data: { url: '/' },
    })

    // Use Web Push API via fetch (compatible with Cloudflare Workers)
    const { sendWebPush } = await import('../lib/webPushHelper')
    const sent = await sendWebPush(subscriptions, payload, {
      vapidPublic,
      vapidPrivate,
      vapidSubject,
      supabase,
    })

    return c.json({ data: { sent, total: subscriptions.length }, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

export default app
