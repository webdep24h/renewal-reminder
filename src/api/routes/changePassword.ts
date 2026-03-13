/**
 * API Route: /api/auth/change-password
 * POST /api/auth/change-password
 */
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { getSupabaseAdmin } from '../lib/supabaseAdmin'

const app = new Hono()

app.post('/change-password', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  const user = c.get('user') as { id: string; email: string }

  try {
    const { new_password } = await c.req.json()
    if (!new_password || new_password.length < 6) {
      return c.json({ data: null, error: 'Mật khẩu phải có ít nhất 6 ký tự' }, 400)
    }

    const { data, error } = await supabase.auth.admin.updateUserById(user.id, { password: new_password })
    if (error) throw error
    return c.json({ data: { updated: true }, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

export default app
