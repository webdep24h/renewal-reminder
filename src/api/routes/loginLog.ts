/**
 * API Route: /api/auth/login-log
 * GET /api/auth/login-log — get recent login logs
 * POST /api/auth/login-log — log a login attempt
 */
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { getSupabaseAdmin } from '../lib/supabaseAdmin'

const app = new Hono()

// POST /api/auth/login-log — log login attempt (public, no auth required)
app.post('/login-log', async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  try {
    const body = await c.req.json()
    const { email, status, ip_address, user_agent, device_info, is_new_device } = body

    if (!email) return c.json({ data: null, error: 'Missing email' }, 400)

    const { data, error } = await supabase
      .from('login_logs')
      .insert([{ email, status: status || 'success', ip_address, user_agent, device_info, is_new_device: is_new_device || false }])
      .select().single()

    if (error) throw error

    // Send email alert if new device detected and SMTP configured
    if (is_new_device && c.env.SMTP_USER && c.env.SMTP_PASS) {
      await sendLoginAlert(c.env, email, device_info, ip_address)
    }

    return c.json({ data, error: null }, 201)
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

// GET /api/auth/login-log — get recent login logs
app.get('/login-log', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  const user = c.get('user') as { id: string; email: string }

  try {
    const { data, error } = await supabase
      .from('login_logs')
      .select('*')
      .eq('email', user.email)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return c.json({ data, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

/**
 * Send email alert for new device login
 * Note: In Cloudflare Workers, we use fetch to call an SMTP API or Supabase Edge Function
 * For simplicity, we log it — in production use Resend/SendGrid API
 */
async function sendLoginAlert(env: Record<string, string>, email: string, deviceInfo: string, ipAddress: string) {
  // Use Resend API if configured (recommended for Cloudflare Workers)
  if (env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.SMTP_USER || 'noreply@example.com',
          to: [email],
          subject: '⚠️ Đăng nhập từ thiết bị mới — Renewal Reminder',
          html: `
            <h2>Phát hiện đăng nhập từ thiết bị mới</h2>
            <p>Tài khoản <strong>${email}</strong> vừa được đăng nhập từ thiết bị chưa từng gặp.</p>
            <p><strong>Thiết bị:</strong> ${deviceInfo || 'Không xác định'}</p>
            <p><strong>IP:</strong> ${ipAddress || 'Không xác định'}</p>
            <p><strong>Thời gian:</strong> ${new Date().toLocaleString('vi-VN')}</p>
            <p>Nếu đây không phải bạn, hãy đổi mật khẩu ngay lập tức.</p>
          `,
        }),
      })
    } catch (err) {
      console.error('[login-alert] Email error:', err)
    }
  }
}

export default app
