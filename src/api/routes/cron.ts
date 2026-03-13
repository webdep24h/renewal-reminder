/**
 * API Route: /api/cron/check-renewals
 * Replaces Vercel Cron Job
 *
 * In Cloudflare Pages, cron jobs are not natively supported.
 * This endpoint can be triggered by:
 * 1. Cloudflare Workers Cron Trigger (using a separate worker)
 * 2. External cron service (cron-job.org, GitHub Actions, etc.)
 * 3. Manual trigger for testing
 *
 * Tasks:
 * 1. Check renewals ≤30 days and send notifications (Web Push + Telegram)
 * 2. Auto-purge trashed items older than 45 days
 */
import { Hono } from 'hono'
import { verifyCronSecret } from '../middleware/auth'
import { getSupabaseAdmin } from '../lib/supabaseAdmin'
import { sendTelegramMessage, buildRenewalMessage, buildRenewalButtons, type TelegramRenewal } from '../lib/telegram'
import { sendWebPush } from '../lib/webPushHelper'

const app = new Hono()
const TRASH_GRACE_PERIOD_DAYS = 45

// Reminder level definitions — matches src/frontend/reminder.js
const LEVELS = [
  { level: 'overdue', maxDays: -1 },
  { level: '1day', maxDays: 1 },
  { level: '3days', maxDays: 3 },
  { level: '1week', maxDays: 7 },
  { level: '2weeks', maxDays: 14 },
  { level: '1month', maxDays: 30 },
]

const LEVEL_TITLES: Record<string, string> = {
  overdue: '❌ Quá hạn',
  '1day': '🔥 Còn 1 ngày',
  '3days': '⚠️ Còn 3 ngày',
  '1week': '📢 Còn 1 tuần',
  '2weeks': '📋 Còn 2 tuần',
  '1month': '📅 Còn 1 tháng',
}

function getLevel(days: number): string {
  if (days < 0) return 'overdue'
  for (const l of LEVELS) {
    if (l.level !== 'overdue' && days <= l.maxDays) return l.level
  }
  return 'safe'
}

// GET /api/cron/check-renewals — trigger cron job
app.get('/check-renewals', async (c) => {
  // Verify cron secret
  if (!verifyCronSecret(c)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const supabase = getSupabaseAdmin({
    SUPABASE_URL: c.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY,
  })

  const results: {
    timestamp: string
    notifications: { push: number; telegram: number; skipped: number; error: string | null }
    purge: { purged: number; error: string | null }
  } = {
    timestamp: new Date().toISOString(),
    notifications: { push: 0, telegram: 0, skipped: 0, error: null },
    purge: { purged: 0, error: null },
  }

  // === Send Renewal Notifications ===
  try {
    results.notifications = await sendRenewalNotifications(c.env, supabase)
  } catch (err: any) {
    console.error('[cron] Notification error:', err.message)
    results.notifications.error = err.message
  }

  // === Auto-Purge Expired Trash ===
  try {
    results.purge = await purgeExpiredTrash(supabase)
  } catch (err: any) {
    console.error('[cron] Purge error:', err.message)
    results.purge.error = err.message
  }

  return c.json(results)
})

async function sendRenewalNotifications(env: Record<string, string>, supabase: any) {
  const result = { push: 0, telegram: 0, skipped: 0, error: null as string | null }

  // 1. Fetch renewals expiring within 30 days or overdue
  const cutoffDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: renewals, error: fetchErr } = await supabase
    .from('renewals')
    .select('id, name, type, customer, provider, expiry_date, cost')
    .eq('is_active', true)
    .is('deleted_at', null)
    .is('archived_at', null)
    .lte('expiry_date', cutoffDate)

  if (fetchErr) { result.error = fetchErr.message; return result }
  if (!renewals || renewals.length === 0) return result

  // 2. Calculate level and days for each renewal
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const alertRenewals = renewals.map((r: any) => {
    const expiry = new Date(r.expiry_date)
    expiry.setHours(0, 0, 0, 0)
    const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const level = getLevel(days)
    return { ...r, days, level }
  }).filter((r: any) => r.level !== 'safe')

  if (alertRenewals.length === 0) return result

  // 3. Dedup — check notification_log
  const { data: sentLogs } = await supabase
    .from('notification_log')
    .select('renewal_id, channel, level, sent_at')
    .in('renewal_id', alertRenewals.map((r: any) => r.id))

  const sentSet = new Set<string>()
  for (const log of (sentLogs || [])) {
    sentSet.add(`${log.renewal_id}:${log.channel}:${log.level}`)
  }

  const toNotify = alertRenewals.filter((r: any) => {
    const pushKey = `${r.id}:webpush:${r.level}`
    const teleKey = `${r.id}:telegram:${r.level}`
    return !sentSet.has(pushKey) || !sentSet.has(teleKey)
  })

  if (toNotify.length === 0) {
    result.skipped = alertRenewals.length
    return result
  }

  // 4. Fetch settings
  const { data: settingsRows } = await supabase
    .from('settings').select('key, value').in('key', ['webpush', 'telegram'])

  const settings: Record<string, any> = {}
  for (const row of (settingsRows || [])) settings[row.key] = row.value

  // 5. Send Web Push notifications
  if (settings.webpush?.enabled !== false) {
    const vapidPublic = env.VITE_VAPID_PUBLIC_KEY || env.VAPID_PUBLIC_KEY
    const vapidPrivate = env.VAPID_PRIVATE_KEY
    const vapidSubject = env.VAPID_SUBJECT || 'mailto:admin@example.com'

    if (vapidPublic && vapidPrivate) {
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, keys_p256dh, keys_auth')

      if (subs && subs.length > 0) {
        const logsToInsert: any[] = []
        for (const renewal of toNotify) {
          const key = `${renewal.id}:webpush:${renewal.level}`
          if (sentSet.has(key)) continue

          const title = `${LEVEL_TITLES[renewal.level]} — ${renewal.name}`
          const typeLabel = renewal.type.charAt(0).toUpperCase() + renewal.type.slice(1)
          let body = `${typeLabel}: ${renewal.name}`
          if (renewal.customer) body += ` (KH: ${renewal.customer})`
          const expiryStr = new Date(renewal.expiry_date).toLocaleDateString('vi-VN')
          if (renewal.level === 'overdue') body += ` — Quá hạn ${Math.abs(renewal.days)} ngày!`
          else body += ` — Hết hạn ${expiryStr}`

          const payload = JSON.stringify({
            title,
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: `renewal-${renewal.id}`,
            data: { url: `/renewal/${renewal.id}` },
          })

          const sent = await sendWebPush(subs, payload, { vapidPublic, vapidPrivate, vapidSubject, supabase })
          if (sent > 0) {
            result.push++
            logsToInsert.push({ renewal_id: renewal.id, channel: 'webpush', level: renewal.level, is_read: false })
          }
        }
        if (logsToInsert.length > 0) {
          await supabase.from('notification_log').insert(logsToInsert)
        }
      }
    }
  }

  // 6. Send Telegram notification
  if (settings.telegram?.enabled && settings.telegram?.bot_token && settings.telegram?.chat_id) {
    const telegramPending = toNotify.filter((r: any) => !sentSet.has(`${r.id}:telegram:${r.level}`))
    if (telegramPending.length > 0) {
      const appUrl = env.APP_URL || 'https://renewal-reminder.pages.dev'
      const message = buildRenewalMessage(telegramPending as TelegramRenewal[], appUrl)
      const buttons = buildRenewalButtons(appUrl)
      const ok = await sendTelegramMessage(settings.telegram.bot_token, settings.telegram.chat_id, message, {
        reply_markup: buttons,
      })
      if (ok) {
        result.telegram = telegramPending.length
        const telegramLogs = telegramPending.map((r: any) => ({
          renewal_id: r.id, channel: 'telegram', level: r.level, is_read: false
        }))
        await supabase.from('notification_log').insert(telegramLogs)
      }
    }
  }

  result.skipped = alertRenewals.length - toNotify.length
  return result
}

async function purgeExpiredTrash(supabase: any) {
  const result = { purged: 0, error: null as string | null }
  const cutoff = new Date(Date.now() - TRASH_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('renewals')
    .delete()
    .eq('is_active', false)
    .not('deleted_at', 'is', null)
    .lte('deleted_at', cutoff)
    .select('id')

  if (error) { result.error = error.message; return result }
  result.purged = data?.length || 0
  console.log(`[cron] Purged ${result.purged} expired trash items`)
  return result
}

export default app
