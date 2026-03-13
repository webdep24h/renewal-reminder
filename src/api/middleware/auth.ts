/**
 * Auth Middleware — JWT verification via Supabase
 * Replaces Vercel _middleware/auth.js
 */
import { Context, Next } from 'hono'
import { getSupabaseAdmin } from '../lib/supabaseAdmin'

export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ data: null, error: 'Unauthorized — vui lòng đăng nhập' }, 401)
  }

  const token = authHeader.replace('Bearer ', '')
  const supabase = getSupabaseAdmin({
    SUPABASE_URL: c.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY,
  })

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) {
      return c.json({ data: null, error: 'Unauthorized — token không hợp lệ' }, 401)
    }
    c.set('user', { id: user.id, email: user.email })
    await next()
  } catch {
    return c.json({ data: null, error: 'Unauthorized — lỗi xác thực' }, 401)
  }
}

/**
 * Verify cron secret (for cron endpoint protection)
 */
export function verifyCronSecret(c: Context): boolean {
  const cronSecret = c.env.CRON_SECRET
  if (!cronSecret) return true // No secret configured, allow
  const authHeader = c.req.header('Authorization')
  return authHeader === `Bearer ${cronSecret}`
}
