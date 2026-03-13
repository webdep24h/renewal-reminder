/**
 * API Route: /api/analytics
 * Methods: GET
 * Protected by JWT auth middleware
 */
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { getSupabaseAdmin } from '../lib/supabaseAdmin'

const app = new Hono()

// GET /api/analytics?year=2024&month=1&view=month|year|customer
app.get('/', requireAuth, async (c) => {
  const supabase = getSupabaseAdmin({ SUPABASE_URL: c.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY })
  const { year, month, view } = c.req.query() as Record<string, string>

  try {
    // Fetch all active renewals
    const { data: renewals, error } = await supabase
      .from('renewals')
      .select('id, name, type, customer, expiry_date, cost, renewal_period, is_active')
      .eq('is_active', true)
      .is('deleted_at', null)

    if (error) throw error

    const now = new Date()
    const targetYear = year ? parseInt(year) : now.getFullYear()
    const targetMonth = month ? parseInt(month) : now.getMonth() + 1

    if (view === 'customer') {
      // Group by customer
      const byCustomer: Record<string, { customer: string; count: number; totalCost: number; items: any[] }> = {}
      for (const r of renewals || []) {
        const key = r.customer || '(Không có KH)'
        if (!byCustomer[key]) byCustomer[key] = { customer: key, count: 0, totalCost: 0, items: [] }
        byCustomer[key].count++
        byCustomer[key].totalCost += r.cost || 0
        byCustomer[key].items.push(r)
      }
      const sorted = Object.values(byCustomer).sort((a, b) => b.totalCost - a.totalCost)
      return c.json({ data: sorted, error: null })
    }

    if (view === 'year') {
      // Monthly breakdown for a year
      const months: Record<number, { month: number; count: number; totalCost: number }> = {}
      for (let m = 1; m <= 12; m++) months[m] = { month: m, count: 0, totalCost: 0 }

      for (const r of renewals || []) {
        const expiry = new Date(r.expiry_date)
        if (expiry.getFullYear() === targetYear) {
          const m = expiry.getMonth() + 1
          months[m].count++
          months[m].totalCost += r.cost || 0
        }
      }
      return c.json({ data: Object.values(months), error: null })
    }

    // Default: month view — renewals expiring in targetYear/targetMonth
    const filtered = (renewals || []).filter(r => {
      const expiry = new Date(r.expiry_date)
      return expiry.getFullYear() === targetYear && (expiry.getMonth() + 1) === targetMonth
    })

    const totalCost = filtered.reduce((sum, r) => sum + (r.cost || 0), 0)
    const byType: Record<string, number> = {}
    for (const r of filtered) {
      byType[r.type] = (byType[r.type] || 0) + 1
    }

    return c.json({
      data: {
        year: targetYear,
        month: targetMonth,
        items: filtered,
        totalCost,
        count: filtered.length,
        byType,
      },
      error: null,
    })
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500)
  }
})

export default app
