/**
 * Renewal Reminder — Hono Backend for Cloudflare Pages
 * Simplified single-file approach to avoid routing issues
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient } from '@supabase/supabase-js'

type Bindings = Record<string, string>
const app = new Hono<{ Bindings: Bindings }>()

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// CORS
app.use('/api/*', cors({
  origin: (origin) => origin || '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
  credentials: true,
}))

// Helper: get Supabase admin client
function getDB(env: Record<string, string>) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
}

// Helper: verify JWT
async function verifyAuth(c: any): Promise<{ id: string; email: string } | null> {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  try {
    const supabase = createClient(
      c.env.SUPABASE_URL || c.env.VITE_SUPABASE_URL,
      c.env.SUPABASE_SERVICE_KEY
    )
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null
    return { id: user.id, email: user.email! }
  } catch { return null }
}

// ============================================================
// Health Check
// ============================================================
app.get('/api/health', (c) => c.json({ status: 'ok', ts: Date.now() }))

// ============================================================
// Config (public)
// ============================================================
app.get('/api/config', (c) => c.json({
  SUPABASE_URL: c.env.VITE_SUPABASE_URL || c.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: c.env.VITE_SUPABASE_ANON_KEY || '',
  VAPID_PUBLIC_KEY: c.env.VITE_VAPID_PUBLIC_KEY || '',
}))

// ============================================================
// Renewals CRUD
// ============================================================
app.get('/api/renewals', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  const { id, trash, archived } = c.req.query() as any
  try {
    if (id) {
      if (!UUID_REGEX.test(id)) return c.json({ data: null, error: 'Invalid id' }, 400)
      const { data, error } = await db.from('renewals').select('*').eq('id', id).single()
      if (error) throw error
      return c.json({ data, error: null })
    }
    if (trash === 'true') {
      const { data, error } = await db.from('renewals').select('*').eq('is_active', false).not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
      if (error) throw error
      return c.json({ data, error: null })
    }
    if (archived === 'true') {
      const { data, error } = await db.from('renewals').select('*').eq('is_active', true).not('archived_at', 'is', null).order('archived_at', { ascending: false })
      if (error) throw error
      return c.json({ data, error: null })
    }
    const { data, error } = await db.from('renewals').select('*').eq('is_active', true).is('deleted_at', null).is('archived_at', null).order('expiry_date', { ascending: true })
    if (error) throw error
    return c.json({ data, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

app.post('/api/renewals', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  try {
    const body = await c.req.json()
    const { name, type, customer, provider, expiry_date, cost, renewal_period, purchase_date, notes, registration_email } = body
    if (!name || !type || !expiry_date) return c.json({ data: null, error: 'Missing required fields: name, type, expiry_date' }, 400)
    const { data, error } = await db.from('renewals').insert([{ name, type, customer, provider, expiry_date, cost, renewal_period, purchase_date, notes, registration_email }]).select().single()
    if (error) throw error
    return c.json({ data, error: null }, 201)
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

app.put('/api/renewals', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  const { id } = c.req.query() as any
  if (!id || !UUID_REGEX.test(id)) return c.json({ data: null, error: 'Invalid id' }, 400)
  try {
    const body = await c.req.json()
    const allowed = ['name', 'type', 'customer', 'provider', 'expiry_date', 'cost', 'renewal_period', 'purchase_date', 'notes', 'is_active', 'deleted_at', 'archived_at', 'registration_email']
    const updates: Record<string, unknown> = {}
    for (const key of allowed) { if (body[key] !== undefined) updates[key] = body[key] }
    if (!Object.keys(updates).length) return c.json({ data: null, error: 'No valid fields' }, 400)
    const { data, error } = await db.from('renewals').update(updates).eq('id', id).select().single()
    if (error) throw error
    return c.json({ data, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

app.delete('/api/renewals', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  const { id, permanent, emptyTrash } = c.req.query() as any
  try {
    if (emptyTrash === 'true') {
      const { data, error } = await db.from('renewals').delete().eq('is_active', false).not('deleted_at', 'is', null).select('id')
      if (error) throw error
      return c.json({ data: { purged: data?.length || 0 }, error: null })
    }
    if (!id || !UUID_REGEX.test(id)) return c.json({ data: null, error: 'Invalid id' }, 400)
    if (permanent === 'true') {
      const { error } = await db.from('renewals').delete().eq('id', id)
      if (error) throw error
      return c.json({ data: { id, permanentlyDeleted: true }, error: null })
    }
    const { error } = await db.from('renewals').update({ is_active: false, deleted_at: new Date().toISOString() }).eq('id', id).eq('is_active', true)
    if (error) throw error
    return c.json({ data: { id, deleted: true }, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

// ============================================================
// Renewal History
// ============================================================
app.get('/api/renewals/:id/history', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  const id = c.req.param('id')
  if (!UUID_REGEX.test(id)) return c.json({ data: null, error: 'Invalid id' }, 400)
  try {
    const { data, error } = await db.from('renewal_history').select('*').eq('renewal_id', id).order('renewed_date', { ascending: false })
    if (error) throw error
    return c.json({ data, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

app.post('/api/renewals/:id/history', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  const id = c.req.param('id')
  if (!UUID_REGEX.test(id)) return c.json({ data: null, error: 'Invalid id' }, 400)
  try {
    const body = await c.req.json()
    const { renewed_date, old_expiry, new_expiry, cost, period_months, notes } = body
    if (!renewed_date || !old_expiry || !new_expiry) return c.json({ data: null, error: 'Missing required fields' }, 400)
    const { data: histData, error: histErr } = await db.from('renewal_history').insert([{ renewal_id: id, renewed_date, old_expiry, new_expiry, cost, period_months, notes }]).select().single()
    if (histErr) throw histErr
    const { data: renewalData, error: renewErr } = await db.from('renewals').update({ expiry_date: new_expiry }).eq('id', id).select().single()
    if (renewErr) throw renewErr
    return c.json({ data: { history: histData, renewal: renewalData }, error: null }, 201)
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

// ============================================================
// Settings
// ============================================================
app.get('/api/settings', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  try {
    const { data, error } = await db.from('settings').select('key, value')
    if (error) throw error
    const settings: Record<string, unknown> = {}
    for (const row of data || []) settings[row.key] = row.value
    return c.json({ data: settings, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

app.put('/api/settings', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  try {
    const { key, value } = await c.req.json()
    if (!key) return c.json({ data: null, error: 'Missing key' }, 400)
    const { data, error } = await db.from('settings').upsert({ key, value }, { onConflict: 'key' }).select().single()
    if (error) throw error
    return c.json({ data, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

// ============================================================
// Notifications
// ============================================================
app.get('/api/notifications', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  const { all } = c.req.query() as any
  try {
    let query = db.from('notification_log').select('id, renewal_id, channel, level, is_read, read_at, sent_at, renewals(id, name, type, customer, expiry_date)').order('sent_at', { ascending: false }).limit(100)
    if (all !== 'true') query = query.eq('is_read', false)
    const { data, error } = await query
    if (error) throw error
    return c.json({ data, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

app.put('/api/notifications', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  try {
    const { ids, all } = await c.req.json()
    const now = new Date().toISOString()
    let query = db.from('notification_log').update({ is_read: true, read_at: now })
    if (all === true) query = query.eq('is_read', false)
    else if (ids?.length) query = query.in('id', ids)
    else return c.json({ data: null, error: 'Missing ids or all' }, 400)
    const { data, error } = await query.select('id')
    if (error) throw error
    return c.json({ data: { updated: data?.length || 0 }, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

app.delete('/api/notifications', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  try {
    const { error } = await db.from('notification_log').delete().eq('is_read', true)
    if (error) throw error
    return c.json({ data: { cleared: true }, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

// ============================================================
// Analytics
// ============================================================
app.get('/api/analytics', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  const { year, month, view } = c.req.query() as any
  try {
    const { data: renewals, error } = await db.from('renewals').select('id, name, type, customer, expiry_date, cost, renewal_period, is_active').eq('is_active', true).is('deleted_at', null)
    if (error) throw error
    const now = new Date()
    const targetYear = year ? parseInt(year) : now.getFullYear()
    const targetMonth = month ? parseInt(month) : now.getMonth() + 1

    if (view === 'customer') {
      const byCustomer: Record<string, any> = {}
      for (const r of renewals || []) {
        const key = r.customer || '(Không có KH)'
        if (!byCustomer[key]) byCustomer[key] = { customer: key, count: 0, totalCost: 0 }
        byCustomer[key].count++
        byCustomer[key].totalCost += r.cost || 0
      }
      return c.json({ data: Object.values(byCustomer).sort((a: any, b: any) => b.totalCost - a.totalCost), error: null })
    }

    if (view === 'year') {
      const months: Record<number, any> = {}
      for (let m = 1; m <= 12; m++) months[m] = { month: m, count: 0, totalCost: 0 }
      for (const r of renewals || []) {
        const exp = new Date(r.expiry_date)
        if (exp.getFullYear() === targetYear) { months[exp.getMonth() + 1].count++; months[exp.getMonth() + 1].totalCost += r.cost || 0 }
      }
      return c.json({ data: Object.values(months), error: null })
    }

    const filtered = (renewals || []).filter((r: any) => { const e = new Date(r.expiry_date); return e.getFullYear() === targetYear && (e.getMonth() + 1) === targetMonth })
    const totalCost = filtered.reduce((s: number, r: any) => s + (r.cost || 0), 0)
    return c.json({ data: { year: targetYear, month: targetMonth, items: filtered, totalCost, count: filtered.length }, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

// ============================================================
// Push subscriptions
// ============================================================
app.post('/api/push/subscribe', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  try {
    const { endpoint, keys } = await c.req.json()
    if (!endpoint || !keys?.p256dh || !keys?.auth) return c.json({ data: null, error: 'Missing data' }, 400)
    const { data, error } = await db.from('push_subscriptions').upsert({ endpoint, keys_p256dh: keys.p256dh, keys_auth: keys.auth }, { onConflict: 'endpoint' }).select().single()
    if (error) throw error
    return c.json({ data, error: null }, 201)
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

app.delete('/api/push/subscribe', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  try {
    const { endpoint } = await c.req.json()
    if (!endpoint) return c.json({ data: null, error: 'Missing endpoint' }, 400)
    const { error } = await db.from('push_subscriptions').delete().eq('endpoint', endpoint)
    if (error) throw error
    return c.json({ data: { unsubscribed: true }, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

// ============================================================
// Notify test
// ============================================================
app.post('/api/notify/test', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  return c.json({ data: { sent: 0, message: 'Push notifications require VAPID keys configured in Cloudflare secrets' }, error: null })
})

// ============================================================
// Telegram test
// ============================================================
app.post('/api/telegram/test', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'telegram').single()
    const settings = data?.value as any
    if (!settings?.enabled || !settings?.bot_token || !settings?.chat_id) return c.json({ data: null, error: 'Telegram chưa cấu hình' }, 400)
    const res = await fetch(`https://api.telegram.org/bot${settings.bot_token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: settings.chat_id, text: '🔔 Test từ Renewal Reminder!', parse_mode: 'HTML' })
    })
    if (!res.ok) return c.json({ data: null, error: 'Gửi Telegram thất bại' }, 500)
    return c.json({ data: { sent: true }, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

// ============================================================
// Auth routes
// ============================================================
app.post('/api/auth/change-email', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  try {
    const { new_email } = await c.req.json()
    if (!new_email) return c.json({ data: null, error: 'Missing new_email' }, 400)
    const { error } = await db.auth.admin.updateUserById(user.id, { email: new_email })
    if (error) throw error
    return c.json({ data: { updated: true }, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

app.post('/api/auth/change-password', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  try {
    const { new_password } = await c.req.json()
    if (!new_password || new_password.length < 6) return c.json({ data: null, error: 'Mật khẩu phải ít nhất 6 ký tự' }, 400)
    const { error } = await db.auth.admin.updateUserById(user.id, { password: new_password })
    if (error) throw error
    return c.json({ data: { updated: true }, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

app.post('/api/auth/login-log', async (c) => {
  const db = getDB(c.env)
  try {
    const body = await c.req.json()
    const { email, status, ip_address, user_agent, device_info, is_new_device } = body
    if (!email) return c.json({ data: null, error: 'Missing email' }, 400)
    const { data, error } = await db.from('login_logs').insert([{ email, status: status || 'success', ip_address, user_agent, device_info, is_new_device: is_new_device || false }]).select().single()
    if (error) throw error
    return c.json({ data, error: null }, 201)
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

app.get('/api/auth/login-log', async (c) => {
  const user = await verifyAuth(c)
  if (!user) return c.json({ data: null, error: 'Unauthorized' }, 401)
  const db = getDB(c.env)
  try {
    const { data, error } = await db.from('login_logs').select('*').eq('email', user.email).order('created_at', { ascending: false }).limit(50)
    if (error) throw error
    return c.json({ data, error: null })
  } catch (err: any) { return c.json({ data: null, error: err.message }, 500) }
})

// ============================================================
// Cron Job
// ============================================================
app.get('/api/cron/check-renewals', async (c) => {
  const cronSecret = c.env.CRON_SECRET
  if (cronSecret) {
    const auth = c.req.header('Authorization')
    if (auth !== `Bearer ${cronSecret}`) return c.json({ error: 'Unauthorized' }, 401)
  }

  const db = getDB(c.env)
  const results = { timestamp: new Date().toISOString(), notifications: { push: 0, telegram: 0, skipped: 0, error: null as any }, purge: { purged: 0, error: null as any } }

  try {
    const cutoff = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const { data: renewals } = await db.from('renewals').select('id, name, type, customer, expiry_date, cost').eq('is_active', true).is('deleted_at', null).is('archived_at', null).lte('expiry_date', cutoff)

    if (renewals && renewals.length > 0) {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const alertRenewals = renewals.map((r: any) => {
        const exp = new Date(r.expiry_date); exp.setHours(0, 0, 0, 0)
        const days = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
        const level = days < 0 ? 'overdue' : days <= 1 ? '1day' : days <= 3 ? '3days' : days <= 7 ? '1week' : days <= 14 ? '2weeks' : days <= 30 ? '1month' : 'safe'
        return { ...r, days, level }
      }).filter((r: any) => r.level !== 'safe')

      const { data: sentLogs } = await db.from('notification_log').select('renewal_id, channel, level').in('renewal_id', alertRenewals.map((r: any) => r.id))
      const sentSet = new Set((sentLogs || []).map((l: any) => `${l.renewal_id}:${l.channel}:${l.level}`))

      const toNotify = alertRenewals.filter((r: any) => !sentSet.has(`${r.id}:webpush:${r.level}`) || !sentSet.has(`${r.id}:telegram:${r.level}`))
      results.notifications.skipped = alertRenewals.length - toNotify.length

      if (toNotify.length > 0) {
        // Telegram
        const { data: tgSettings } = await db.from('settings').select('value').eq('key', 'telegram').single()
        const tg = tgSettings?.value as any
        if (tg?.enabled && tg?.bot_token && tg?.chat_id) {
          const appUrl = c.env.APP_URL || 'https://renewal-reminder.pages.dev'
          const lines = ['<b>📦 Renewal Reminder</b>\n']
          for (const r of toNotify.filter((r: any) => !sentSet.has(`${r.id}:telegram:${r.level}`))) {
            lines.push(`• <b>${r.name}</b> — ${r.days < 0 ? `❌ Quá hạn ${Math.abs(r.days)}ng` : `Còn ${r.days} ngày`}`)
          }
          lines.push(`\n🔗 <a href="${appUrl}">Mở ứng dụng</a>`)
          const res = await fetch(`https://api.telegram.org/bot${tg.bot_token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: tg.chat_id, text: lines.join('\n'), parse_mode: 'HTML' })
          })
          if (res.ok) {
            results.notifications.telegram = toNotify.length
            const logs = toNotify.filter((r: any) => !sentSet.has(`${r.id}:telegram:${r.level}`)).map((r: any) => ({ renewal_id: r.id, channel: 'telegram', level: r.level, is_read: false }))
            if (logs.length) await db.from('notification_log').insert(logs)
          }
        }
      }
    }
  } catch (err: any) { results.notifications.error = err.message }

  try {
    const cutoff45 = new Date(Date.now() - 45 * 86400000).toISOString()
    const { data } = await db.from('renewals').delete().eq('is_active', false).not('deleted_at', 'is', null).lte('deleted_at', cutoff45).select('id')
    results.purge.purged = data?.length || 0
  } catch (err: any) { results.purge.error = err.message }

  return c.json(results)
})

export default app
