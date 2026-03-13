/**
 * API Route: /api/renewals
 * Methods: GET, POST, PUT, DELETE
 * Protected by JWT auth middleware
 */
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { getSupabaseAdmin } from '../lib/supabaseAdmin'

const app = new Hono()

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALLOWED_UPDATE_FIELDS = [
  'name', 'type', 'customer', 'provider', 'expiry_date', 'cost',
  'renewal_period', 'purchase_date', 'notes', 'is_active', 'deleted_at',
  'archived_at', 'registration_email'
]

// GET /api/renewals — list all active renewals
// GET /api/renewals?id=xxx — get single renewal
// GET /api/renewals?trash=true — list trashed renewals
// GET /api/renewals?archived=true — list archived renewals
app.get('/', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  const { id, trash, archived } = c.req.query() as Record<string, string>

  try {
    if (id) {
      if (!UUID_REGEX.test(id)) {
        return c.json({ data: null, error: 'Invalid id format' }, 400)
      }
      const { data, error } = await supabase.from('renewals').select('*').eq('id', id).single()
      if (error) throw error
      return c.json({ data, error: null })
    }

    if (trash === 'true') {
      const { data, error } = await supabase
        .from('renewals').select('*')
        .eq('is_active', false)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
      if (error) throw error
      return c.json({ data, error: null })
    }

    if (archived === 'true') {
      const { data, error } = await supabase
        .from('renewals').select('*')
        .eq('is_active', true)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
      if (error) throw error
      return c.json({ data, error: null })
    }

    // Default: active non-archived renewals
    const { data, error } = await supabase
      .from('renewals').select('*')
      .eq('is_active', true)
      .is('deleted_at', null)
      .is('archived_at', null)
      .order('expiry_date', { ascending: true })
    if (error) throw error
    return c.json({ data, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

// POST /api/renewals — create new renewal
app.post('/', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  try {
    const body = await c.req.json()
    const { name, type, customer, provider, expiry_date, cost, renewal_period, purchase_date, notes, registration_email } = body

    if (!name || !type || !expiry_date) {
      return c.json({ data: null, error: 'Missing required fields: name, type, expiry_date' }, 400)
    }

    const { data, error } = await supabase
      .from('renewals')
      .insert([{ name, type, customer, provider, expiry_date, cost, renewal_period, purchase_date, notes, registration_email }])
      .select().single()

    if (error) throw error
    return c.json({ data, error: null }, 201)
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

// PUT /api/renewals?id=xxx — update renewal
app.put('/', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  const { id } = c.req.query() as Record<string, string>

  if (!id) return c.json({ data: null, error: 'Missing id query parameter' }, 400)
  if (!UUID_REGEX.test(id)) return c.json({ data: null, error: 'Invalid id format' }, 400)

  try {
    const body = await c.req.json()
    const updates: Record<string, unknown> = {}
    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (body[key] !== undefined) updates[key] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ data: null, error: 'No valid fields to update' }, 400)
    }

    const { data, error } = await supabase
      .from('renewals').update(updates).eq('id', id).select().single()
    if (error) throw error
    return c.json({ data, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

// DELETE /api/renewals?id=xxx — soft delete
// DELETE /api/renewals?id=xxx&permanent=true — hard delete
// DELETE /api/renewals?emptyTrash=true — empty trash
app.delete('/', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  const { id, permanent, emptyTrash } = c.req.query() as Record<string, string>

  try {
    if (emptyTrash === 'true') {
      const { data, error } = await supabase
        .from('renewals').delete()
        .eq('is_active', false)
        .not('deleted_at', 'is', null)
        .select('id')
      if (error) throw error
      return c.json({ data: { purged: data?.length || 0 }, error: null })
    }

    if (!id) return c.json({ data: null, error: 'Missing id query parameter' }, 400)
    if (!UUID_REGEX.test(id)) return c.json({ data: null, error: 'Invalid id format' }, 400)

    if (permanent === 'true') {
      const { error } = await supabase.from('renewals').delete().eq('id', id)
      if (error) throw error
      return c.json({ data: { id, permanentlyDeleted: true }, error: null })
    }

    // Soft delete
    const { error } = await supabase
      .from('renewals')
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq('id', id).eq('is_active', true)
    if (error) throw error
    return c.json({ data: { id, deleted: true }, error: null })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

export default app
