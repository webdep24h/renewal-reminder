/**
 * API Route: /api/telegram/test
 * Test Telegram notification
 */
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { sendTelegramMessage } from '../lib/telegram'
import { getSupabaseAdmin } from '../lib/supabaseAdmin'

const app = new Hono()

// POST /api/telegram/test — send test Telegram message
app.post('/test', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  try {
    // Get Telegram settings from DB
    const { data: settingsData, error } = await supabase
      .from('settings').select('key, value').eq('key', 'telegram').single()
    if (error) throw error

    const settings = settingsData?.value as any
    if (!settings?.enabled || !settings?.bot_token || !settings?.chat_id) {
      return c.json({ data: null, error: 'Telegram chưa được cấu hình hoặc chưa bật' }, 400)
    }

    const appUrl = c.env.APP_URL || 'https://renewal-reminder.pages.dev'
    const ok = await sendTelegramMessage(
      settings.bot_token,
      settings.chat_id,
      `🔔 <b>Test Notification</b>\n\nThông báo thử nghiệm từ Renewal Reminder!\n\n🔗 <a href="${appUrl}">Mở ứng dụng</a>`
    )

    if (!ok) return c.json({ data: null, error: 'Gửi Telegram thất bại' }, 500)
    return c.json({ data: { sent: true }, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

export default app
