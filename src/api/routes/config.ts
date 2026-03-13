/**
 * API Route: /api/config
 * Returns public config (VITE_ prefixed env vars) to frontend
 * This is safe to expose as it only contains public keys
 */
import { Hono } from 'hono'

const app = new Hono()

// GET /api/config — public config endpoint
app.get('/', (c) => {
  return c.json({
    SUPABASE_URL: c.env.VITE_SUPABASE_URL || c.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: c.env.VITE_SUPABASE_ANON_KEY || '',
    VAPID_PUBLIC_KEY: c.env.VITE_VAPID_PUBLIC_KEY || '',
  })
})

export default app
