/**
 * API Route: /api/auth/change-email
 * POST /api/auth/change-email
 */
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { getSupabaseAdmin } from '../lib/supabaseAdmin'

const app = new Hono()

app.post('/change-email', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  const user = c.get('user') as { id: string; email: string }

  try {
    const { new_email } = await c.req.json()
    if (!new_email) return c.json({ data: null, error: 'Missing new_email' }, 400)

    const { data, error } = await supabase.auth.admin.updateUserById(user.id, { email: new_email })
    if (error) throw error
    return c.json({ data: { updated: true }, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

export default app
