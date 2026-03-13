/**
 * Supabase Admin Client — singleton
 * Uses SERVICE_KEY for full admin access (bypasses RLS)
 * In Cloudflare Workers env, env vars are passed via context.env
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabaseAdmin(env?: Record<string, string>): SupabaseClient {
  if (env) {
    // Always create fresh client with provided env (Workers context)
    return createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_KEY
    )
  }
  // Fallback singleton for non-Workers usage
  if (!_client) {
    const url = (globalThis as any).__SUPABASE_URL__ || ''
    const key = (globalThis as any).__SUPABASE_SERVICE_KEY__ || ''
    _client = createClient(url, key)
  }
  return _client
}
