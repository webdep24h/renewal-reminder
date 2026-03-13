/**
 * Telegram API helpers
 * Sends notifications via Telegram Bot API
 */

const TELEGRAM_API = 'https://api.telegram.org/bot'

export interface TelegramRenewal {
  id: string
  name: string
  type: string
  customer?: string
  provider?: string
  expiry_date: string
  cost?: number
  days: number
  level: string
}

const LEVEL_EMOJI: Record<string, string> = {
  overdue: '❌',
  '1day': '🔥',
  '3days': '⚠️',
  '1week': '📢',
  '2weeks': '📋',
  '1month': '📅',
}

const LEVEL_LABELS: Record<string, string> = {
  overdue: 'Quá hạn',
  '1day': 'Còn 1 ngày',
  '3days': 'Còn 3 ngày',
  '1week': 'Còn 1 tuần',
  '2weeks': 'Còn 2 tuần',
  '1month': 'Còn 1 tháng',
}

/**
 * Send a message via Telegram Bot API
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  options: Record<string, unknown> = {}
): Promise<boolean> {
  const url = `${TELEGRAM_API}${botToken}/sendMessage`
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...options,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[telegram] Send error:', err)
    return false
  }
  return true
}

/**
 * Build renewal message text for Telegram
 */
export function buildRenewalMessage(renewals: TelegramRenewal[], appUrl: string): string {
  const lines: string[] = []
  lines.push('<b>📦 Renewal Reminder — Thông báo gia hạn</b>\n')

  // Group by level
  const grouped: Record<string, TelegramRenewal[]> = {}
  for (const r of renewals) {
    if (!grouped[r.level]) grouped[r.level] = []
    grouped[r.level].push(r)
  }

  const levelOrder = ['overdue', '1day', '3days', '1week', '2weeks', '1month']
  for (const level of levelOrder) {
    if (!grouped[level]) continue
    const emoji = LEVEL_EMOJI[level] || '📌'
    const label = LEVEL_LABELS[level] || level
    lines.push(`\n${emoji} <b>${label}</b>`)
    for (const r of grouped[level]) {
      const typeLabel = r.type.charAt(0).toUpperCase() + r.type.slice(1)
      let line = `• <b>${r.name}</b> (${typeLabel})`
      if (r.customer) line += ` — ${r.customer}`
      const expiryDate = new Date(r.expiry_date).toLocaleDateString('vi-VN')
      if (level === 'overdue') {
        line += `\n  📅 Hết hạn: ${expiryDate} (${Math.abs(r.days)} ngày trước)`
      } else {
        line += `\n  📅 Hết hạn: ${expiryDate}`
      }
      if (r.cost && r.cost > 0) {
        line += ` | 💰 ${r.cost.toLocaleString('vi-VN')}đ`
      }
      lines.push(line)
    }
  }

  if (appUrl) {
    lines.push(`\n🔗 <a href="${appUrl}">Mở ứng dụng</a>`)
  }

  return lines.join('\n')
}

/**
 * Build inline keyboard buttons for Telegram
 */
export function buildRenewalButtons(appUrl: string) {
  return {
    inline_keyboard: [
      [
        { text: '🔗 Mở ứng dụng', url: appUrl },
      ],
    ],
  }
}
