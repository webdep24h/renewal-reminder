/**
 * Renewal Reminder — Frontend Main
 * Architecture: SPA with Supabase Auth + Hono Backend API
 * UI: Sidebar layout (reference design)
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// ============================================================
// Config
// ============================================================
let SUPABASE_URL = ''
let SUPABASE_ANON_KEY = ''
let VAPID_PUBLIC_KEY = ''

async function loadConfig() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) return
  try {
    const res = await fetch('/api/config')
    if (res.ok) {
      const cfg = await res.json()
      SUPABASE_URL = cfg.SUPABASE_URL || ''
      SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY || ''
      VAPID_PUBLIC_KEY = cfg.VAPID_PUBLIC_KEY || ''
    }
  } catch {}
}

// ============================================================
// Supabase
// ============================================================
let supabase = null
function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return true
}

// ============================================================
// Global state
// ============================================================
let authToken = null
let currentUser = null
let allRenewals = []
let currentTypeFilter = ''
let currentSortFilter = 'expiry_asc'
let currentLevelFilter = null
window.currentDetailId = null

// ============================================================
// API helper
// ============================================================
async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

// ============================================================
// Toast
// ============================================================
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container')
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  container.appendChild(toast)
  setTimeout(() => {
    toast.style.transition = 'all 0.3s ease'
    toast.style.opacity = '0'
    toast.style.transform = 'translateX(100%)'
    setTimeout(() => toast.remove(), 300)
  }, duration)
}
window.showToast = showToast

// ============================================================
// Theme
// ============================================================
function initTheme() {
  const saved = localStorage.getItem('theme') || 'light'
  applyTheme(saved)
}

function applyTheme(theme) {
  const isDark = theme === 'dark'
  document.documentElement.className = isDark ? 'dark sl-theme-dark' : 'sl-theme-light'
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('theme', theme)
  updateThemeIcons()
  updateThemeSelector()
}

window.toggleTheme = function() {
  const isDark = document.documentElement.classList.contains('dark')
  applyTheme(isDark ? 'light' : 'dark')
  if (typeof lucide !== 'undefined') lucide.createIcons()
}

window.setTheme = function(theme) {
  applyTheme(theme)
  if (typeof lucide !== 'undefined') lucide.createIcons()
}

function updateThemeIcons() {
  const isDark = document.documentElement.classList.contains('dark')
  document.querySelectorAll('.dark-hidden').forEach(el => {
    el.classList.toggle('hidden', isDark)
  })
  document.querySelectorAll('.light-hidden').forEach(el => {
    el.classList.toggle('hidden', !isDark)
  })
}

function updateThemeSelector() {
  const isDark = document.documentElement.classList.contains('dark')
  document.getElementById('theme-light-btn')?.classList.toggle('selected', !isDark)
  document.getElementById('theme-dark-btn')?.classList.toggle('selected', isDark)
}

// ============================================================
// Sidebar
// ============================================================
window.toggleSidebar = function() {
  const sidebar = document.getElementById('sidebar')
  const overlay = document.getElementById('sidebar-overlay')
  sidebar.classList.toggle('open')
  overlay.classList.toggle('visible')
}

window.closeSidebar = function() {
  document.getElementById('sidebar')?.classList.remove('open')
  document.getElementById('sidebar-overlay')?.classList.remove('visible')
}

// ============================================================
// Router
// ============================================================
const routes = {
  '/': 'page-dashboard',
  '/analytics': 'page-analytics',
  '/trash': 'page-trash',
  '/notifications': 'page-notifications',
  '/settings': 'page-settings',
  '/account': 'page-account',
}

const breadcrumbNames = {
  '/': 'Dashboard',
  '/analytics': 'Analytics',
  '/trash': 'Thùng rác',
  '/notifications': 'Thông báo',
  '/settings': 'Cài đặt',
  '/account': 'Tài khoản',
}

window.navigate = function(path) {
  history.pushState({}, '', path)
  renderRoute(path)
  closeSidebar()
}

function renderRoute(path) {
  const pageId = routes[path] || 'page-dashboard'

  // Hide all pages
  document.querySelectorAll('#app-shell .page').forEach(p => p.classList.remove('active'))

  // Show target page
  const page = document.getElementById(pageId)
  if (page) page.classList.add('active')

  // Update breadcrumb
  const crumb = document.getElementById('breadcrumb-page')
  if (crumb) crumb.textContent = breadcrumbNames[path] || 'Dashboard'

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(item => {
    const route = item.getAttribute('data-route')
    item.classList.toggle('active', route === path)
  })

  // Load page data
  if (path === '/') loadDashboard()
  else if (path === '/analytics') loadAnalyticsPage()
  else if (path === '/trash') loadTrash()
  else if (path === '/notifications') loadNotificationsPage()
  else if (path === '/settings') loadSettings()
  else if (path === '/account') loadAccount()
}

window.onpopstate = () => renderRoute(location.pathname)

// ============================================================
// Notification Dropdown (bell in topbar)
// ============================================================
window.toggleNotifDropdown = function() {
  const dd = document.getElementById('notif-dropdown')
  dd.classList.toggle('open')
  if (dd.classList.contains('open')) {
    loadNotifDropdown()
  }
}

async function loadNotifDropdown() {
  const list = document.getElementById('notif-dropdown-list')
  try {
    const { data } = await api('GET', '/notifications?all=true')
    if (!data || data.length === 0) {
      list.innerHTML = `
        <div class="notif-empty">
          <i data-lucide="bell-off" width="32" height="32" class="notif-empty-icon"></i>
          <p>Không có thông báo</p>
        </div>`
    } else {
      list.innerHTML = data.slice(0, 20).map(n => {
        const isRead = n.is_read
        return `<div class="notif-item ${isRead ? '' : 'unread'}" onclick="markRead('${n.id}')">
          <div class="notif-item-icon">
            <i data-lucide="bell" width="14" height="14"></i>
          </div>
          <div class="notif-item-content">
            <p class="notif-item-title">${getLevelTitle(n.level)} — ${escHtml(n.renewals?.name || '?')}</p>
            <p class="notif-item-meta">${n.renewals?.type || ''} · ${formatDate(n.sent_at)}</p>
          </div>
        </div>`
      }).join('')
    }
    if (typeof lucide !== 'undefined') lucide.createIcons()
  } catch {}
}

async function loadNotificationBadge() {
  try {
    const { data } = await api('GET', '/notifications')
    const count = data?.length || 0
    // Update both badges
    ;['notif-badge', 'nav-badge-notif', 'bottom-nav-badge'].forEach(id => {
      const el = document.getElementById(id)
      if (!el) return
      el.textContent = count > 99 ? '99+' : count
      el.style.display = count > 0 ? (id === 'notif-badge' ? 'block' : 'flex') : 'none'
    })
  } catch {}
}

window.markRead = async function(id) {
  try {
    await api('PUT', '/notifications', { ids: [id] })
    loadNotifDropdown()
    loadNotificationBadge()
  } catch {}
}

window.markAllRead = async function() {
  try {
    await api('PUT', '/notifications', { all: true })
    showToast('Đã đánh dấu tất cả đã đọc', 'success')
    loadNotifDropdown()
    loadNotificationBadge()
  } catch (err) { showToast(err.message, 'error') }
}

window.clearNotifications = async function() {
  try {
    await api('DELETE', '/notifications')
    showToast('Đã xóa thông báo đã đọc', 'success')
    loadNotifDropdown()
    loadNotificationBadge()
  } catch (err) { showToast(err.message, 'error') }
}

// ============================================================
// Auth
// ============================================================
window.authLogin = async function() {
  const email = document.getElementById('auth-email').value.trim()
  const password = document.getElementById('auth-password').value
  if (!email || !password) return showToast('Vui lòng nhập email và mật khẩu', 'error')

  const btn = document.getElementById('btn-login')
  btn.disabled = true
  btn.innerHTML = '<div class="loading-spinner sm" style="margin-right:8px;"></div> Đang xử lý...'

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    authToken = data.session.access_token
    currentUser = data.user

    // OTP step
    await supabase.auth.signInWithOtp({ email })
    document.getElementById('otp-desc').textContent = `Mã OTP đã được gửi đến ${email}`
    document.getElementById('auth-step-email').classList.add('hidden')
    document.getElementById('auth-step-otp').classList.remove('hidden')
    document.getElementById('auth-otp').focus()
    showToast('Đã gửi mã OTP đến email', 'info')
  } catch (err) {
    showToast(err.message || 'Đăng nhập thất bại', 'error')
  } finally {
    btn.disabled = false
    btn.innerHTML = '<span>Tiếp tục</span>'
  }
}

window.authVerifyOtp = async function() {
  const email = document.getElementById('auth-email').value.trim()
  const otp = document.getElementById('auth-otp').value.trim()
  if (!otp || otp.length !== 6) return showToast('OTP phải có 6 chữ số', 'error')

  const btn = document.getElementById('btn-verify-otp')
  btn.disabled = true
  btn.textContent = 'Đang xác nhận...'

  try {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' })
    if (error) throw error

    authToken = data.session.access_token
    currentUser = data.user

    // Log login
    const deviceInfo = getDeviceInfo()
    const known = getKnownDevices()
    const isNew = !known.includes(deviceInfo)
    if (isNew) addKnownDevice(deviceInfo)

    fetch('/api/auth/login-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ email, status: 'success', user_agent: navigator.userAgent, device_info: deviceInfo, is_new_device: isNew })
    }).catch(() => {})

    onAuthSuccess()
  } catch (err) {
    showToast(err.message || 'OTP không hợp lệ', 'error')
    btn.disabled = false
    btn.textContent = 'Xác nhận'
  }
}

window.authResendOtp = async function() {
  const email = document.getElementById('auth-email').value.trim()
  await supabase.auth.signInWithOtp({ email })
  showToast('Đã gửi lại mã OTP', 'info')
}

window.authBackToEmail = function() {
  document.getElementById('auth-step-email').classList.remove('hidden')
  document.getElementById('auth-step-otp').classList.add('hidden')
}

window.authSendOtp = function() { authLogin() }

window.authLogout = async function() {
  await supabase.auth?.signOut()
  authToken = null
  currentUser = null
  allRenewals = []
  document.getElementById('app-shell').classList.remove('active')
  document.getElementById('page-auth').classList.add('active')
  if (typeof lucide !== 'undefined') lucide.createIcons()
}

function onAuthSuccess() {
  document.getElementById('loading-overlay').classList.add('hidden')
  document.getElementById('page-auth').classList.remove('active')
  document.getElementById('app-shell').classList.add('active')

  // Set email displays
  const email = currentUser?.email || ''
  const emailEl = document.getElementById('user-email-display')
  const emailEl2 = document.getElementById('user-email-display-2')
  if (emailEl) emailEl.textContent = email
  if (emailEl2) emailEl2.textContent = email

  if (typeof lucide !== 'undefined') lucide.createIcons()
  loadNotificationBadge()

  const path = location.pathname
  navigate(routes[path] ? path : '/')
  registerPushNotification()
}

async function restoreSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (session && !error) {
      authToken = session.access_token
      currentUser = session.user
      onAuthSuccess()
      return
    }
  } catch (e) {
    console.warn('[auth] restoreSession error:', e)
  }
  showAuthPage()
}

function showAuthPage() {
  document.getElementById('loading-overlay').classList.add('hidden')
  document.getElementById('page-auth').classList.add('active')
  if (typeof lucide !== 'undefined') lucide.createIcons()
}

window.togglePasswordVisibility = function(id) {
  const input = document.getElementById(id)
  if (!input) return
  input.type = input.type === 'password' ? 'text' : 'password'
}

// ============================================================
// Dashboard — Card-based render
// ============================================================
async function loadDashboard() {
  const list = document.getElementById('renewal-list')
  list.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>'

  try {
    const { data } = await api('GET', '/renewals')
    allRenewals = data || []
    updateStats()
    renderCards()
  } catch (err) {
    showToast(err.message, 'error')
    list.innerHTML = `<div class="empty-state"><p class="empty-title" style="color:var(--color-critical)">Lỗi: ${err.message}</p></div>`
  }
}

function updateStats() {
  let overdue = 0, urgent = 0, warning = 0, safe = 0
  for (const r of allRenewals) {
    const days = getDaysUntil(r.expiry_date)
    const level = getLevel(days)
    if (level === 'overdue') overdue++
    else if (level === '1day' || level === '3days') urgent++
    else if (level === '1week' || level === '2weeks' || level === '1month') warning++
    else safe++
  }
  document.getElementById('stat-overdue').textContent = overdue
  document.getElementById('stat-urgent').textContent = urgent
  document.getElementById('stat-warning').textContent = warning
  document.getElementById('stat-safe').textContent = safe
}

window.setTypeFilter = function(type) {
  currentTypeFilter = type
  document.querySelectorAll('#type-filter-chips .filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.type === type)
  })
  renderCards()
}

window.setSortFilter = function(sort) {
  currentSortFilter = sort
  document.querySelectorAll('[data-sort]').forEach(c => {
    c.classList.toggle('active', c.dataset.sort === sort)
  })
  renderCards()
}

window.filterByLevel = function(levelGroup) {
  currentLevelFilter = levelGroup
  const labels = { overdue: 'Quá hạn', urgent: 'Khẩn cấp', warning: 'Cảnh báo', safe: 'An toàn' }
  const bar = document.getElementById('level-filter-bar')
  document.getElementById('level-filter-label').textContent = labels[levelGroup]
  bar.style.display = 'flex'
  bar.classList.remove('hidden')
  renderCards()
}

window.clearLevelFilter = function() {
  currentLevelFilter = null
  const bar = document.getElementById('level-filter-bar')
  bar.style.display = 'none'
  bar.classList.add('hidden')
  renderCards()
}

function renderCards() {
  const search = document.getElementById('search-input')?.value.toLowerCase() || ''
  let items = [...allRenewals]

  if (search) items = items.filter(r =>
    r.name?.toLowerCase().includes(search) ||
    r.customer?.toLowerCase().includes(search)
  )
  if (currentTypeFilter) items = items.filter(r => r.type === currentTypeFilter)
  if (currentLevelFilter) {
    items = items.filter(r => {
      const lvl = getLevel(getDaysUntil(r.expiry_date))
      if (currentLevelFilter === 'overdue') return lvl === 'overdue'
      if (currentLevelFilter === 'urgent') return lvl === '1day' || lvl === '3days'
      if (currentLevelFilter === 'warning') return lvl === '1week' || lvl === '2weeks' || lvl === '1month'
      if (currentLevelFilter === 'safe') return lvl === 'safe'
      return true
    })
  }

  // Sort
  items.sort((a, b) => {
    if (currentSortFilter === 'expiry_asc') return new Date(a.expiry_date) - new Date(b.expiry_date)
    if (currentSortFilter === 'expiry_desc') return new Date(b.expiry_date) - new Date(a.expiry_date)
    if (currentSortFilter === 'name_asc') return a.name.localeCompare(b.name)
    if (currentSortFilter === 'cost_desc') return (b.cost || 0) - (a.cost || 0)
    return 0
  })

  const list = document.getElementById('renewal-list')
  const footer = document.getElementById('table-footer')

  if (items.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="inbox" width="36" height="36"></i></div>
        <p class="empty-title">Không có dữ liệu</p>
        <p class="empty-description">Thêm dịch vụ đầu tiên bằng nút "Thêm mới"</p>
      </div>`
    footer.textContent = ''
    if (typeof lucide !== 'undefined') lucide.createIcons()
    return
  }

  // Group by urgency level
  const groups = { overdue: [], urgent: [], warning: [], safe: [] }
  for (const r of items) {
    const level = getLevel(getDaysUntil(r.expiry_date))
    if (level === 'overdue') groups.overdue.push(r)
    else if (level === '1day' || level === '3days') groups.urgent.push(r)
    else if (level === '1week' || level === '2weeks' || level === '1month') groups.warning.push(r)
    else groups.safe.push(r)
  }

  const groupDef = [
    { key: 'overdue', label: 'Quá hạn', dotColor: 'var(--color-overdue)' },
    { key: 'urgent', label: 'Khẩn cấp', dotColor: 'var(--color-critical)' },
    { key: 'warning', label: 'Cảnh báo', dotColor: 'var(--color-warning)' },
    { key: 'safe', label: 'An toàn', dotColor: 'var(--color-safe)' },
  ]

  let html = ''
  for (const g of groupDef) {
    const gItems = groups[g.key]
    if (!gItems.length) continue
    html += `
      <div class="renewal-group">
        <div class="renewal-group-header">
          <span class="group-dot" style="background:${g.dotColor}"></span>
          <span class="group-label">${g.label}</span>
          <span class="group-count">${gItems.length}</span>
        </div>
        ${gItems.map(r => renderCard(r)).join('')}
      </div>`
  }

  list.innerHTML = html
  footer.textContent = `Hiển thị ${items.length}/${allRenewals.length} dịch vụ`

  if (typeof lucide !== 'undefined') lucide.createIcons()
}

function renderCard(r) {
  const days = getDaysUntil(r.expiry_date)
  const level = getLevel(days)
  const accentColor = {
    overdue: 'var(--color-overdue)',
    '1day': 'var(--color-critical)',
    '3days': 'var(--color-high)',
    '1week': 'var(--color-warning)',
    '2weeks': 'var(--color-notice)',
    '1month': 'var(--color-primary)',
    safe: 'var(--color-safe)',
  }[level] || 'var(--color-safe)'

  const badge = getLevelBadge(level, days)
  const icon = getTypeIcon(r.type)

  return `
    <div class="renewal-card" onclick="openDetailModal('${r.id}')">
      <div class="card-accent" style="background:${accentColor};"></div>
      <div class="card-icon">${icon}</div>
      <div class="card-body">
        <p class="card-title">${escHtml(r.name)}</p>
        <p class="card-subtitle">${escHtml(r.provider || r.customer || '')}</p>
        <div class="card-meta">
          <span class="card-meta-item">
            <i data-lucide="calendar" width="12" height="12"></i>
            ${formatDate(r.expiry_date)}
          </span>
          ${r.customer ? `<span class="card-meta-item">
            <i data-lucide="user" width="12" height="12"></i>
            ${escHtml(r.customer)}
          </span>` : ''}
          ${r.cost ? `<span class="card-meta-item">
            <i data-lucide="banknote" width="12" height="12"></i>
            ${formatCurrency(r.cost)}
          </span>` : ''}
          ${badge}
        </div>
      </div>
      <div class="card-actions" onclick="event.stopPropagation()">
        <button onclick="openRenewModal('${r.id}')" title="Gia hạn" class="card-action-btn renew">
          <i data-lucide="refresh-cw" width="14" height="14"></i>
        </button>
        <button onclick="openRenewalModal('${r.id}')" title="Sửa" class="card-action-btn edit">
          <i data-lucide="pencil" width="14" height="14"></i>
        </button>
        <button onclick="archiveRenewal('${r.id}')" title="Lưu trữ" class="card-action-btn archive">
          <i data-lucide="archive" width="14" height="14"></i>
        </button>
        <button onclick="deleteRenewal('${r.id}')" title="Xóa" class="card-action-btn delete">
          <i data-lucide="trash-2" width="14" height="14"></i>
        </button>
      </div>
    </div>`
}

// ============================================================
// CRUD Operations
// ============================================================
window.openRenewalModal = function(id) {
  const modal = document.getElementById('renewal-modal')
  modal.classList.remove('hidden')

  if (id) {
    const r = allRenewals.find(x => x.id === id)
    if (!r) return
    document.getElementById('modal-title').textContent = 'Chỉnh sửa dịch vụ'
    document.getElementById('modal-id').value = r.id
    document.getElementById('modal-name').value = r.name || ''
    document.getElementById('modal-type').value = r.type || 'domain'
    document.getElementById('modal-expiry').value = r.expiry_date || ''
    document.getElementById('modal-customer').value = r.customer || ''
    document.getElementById('modal-provider').value = r.provider || ''
    document.getElementById('modal-cost').value = r.cost || ''
    document.getElementById('modal-period').value = r.renewal_period || 12
    document.getElementById('modal-purchase-date').value = r.purchase_date || ''
    document.getElementById('modal-reg-email').value = r.registration_email || ''
    document.getElementById('modal-notes').value = r.notes || ''
    document.getElementById('btn-save-text').textContent = 'Cập nhật'
  } else {
    document.getElementById('modal-title').textContent = 'Thêm dịch vụ mới'
    document.getElementById('modal-id').value = ''
    document.getElementById('modal-name').value = ''
    document.getElementById('modal-type').value = 'domain'
    document.getElementById('modal-expiry').value = ''
    document.getElementById('modal-customer').value = ''
    document.getElementById('modal-provider').value = ''
    document.getElementById('modal-cost').value = ''
    document.getElementById('modal-period').value = '12'
    document.getElementById('modal-purchase-date').value = ''
    document.getElementById('modal-reg-email').value = ''
    document.getElementById('modal-notes').value = ''
    document.getElementById('btn-save-text').textContent = 'Lưu'
  }
  if (typeof lucide !== 'undefined') lucide.createIcons()
}

window.closeRenewalModal = function() {
  document.getElementById('renewal-modal').classList.add('hidden')
}

window.saveRenewal = async function() {
  const id = document.getElementById('modal-id').value
  const body = {
    name: document.getElementById('modal-name').value.trim(),
    type: document.getElementById('modal-type').value,
    expiry_date: document.getElementById('modal-expiry').value,
    customer: document.getElementById('modal-customer').value.trim() || null,
    provider: document.getElementById('modal-provider').value.trim() || null,
    cost: parseInt(document.getElementById('modal-cost').value) || 0,
    renewal_period: parseInt(document.getElementById('modal-period').value) || 12,
    purchase_date: document.getElementById('modal-purchase-date').value || null,
    registration_email: document.getElementById('modal-reg-email').value.trim() || null,
    notes: document.getElementById('modal-notes').value.trim() || null,
  }

  if (!body.name || !body.type || !body.expiry_date) {
    return showToast('Tên, loại và ngày hết hạn là bắt buộc', 'error')
  }

  const btn = document.getElementById('btn-save-renewal')
  btn.disabled = true

  try {
    if (id) {
      await api('PUT', `/renewals?id=${id}`, body)
      showToast('Đã cập nhật dịch vụ', 'success')
    } else {
      await api('POST', '/renewals', body)
      showToast('Đã thêm dịch vụ mới', 'success')
    }
    closeRenewalModal()
    loadDashboard()
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    btn.disabled = false
  }
}

window.deleteRenewal = async function(id) {
  if (!confirm('Xóa dịch vụ này vào thùng rác?')) return
  try {
    await api('DELETE', `/renewals?id=${id}`)
    showToast('Đã chuyển vào thùng rác', 'success')
    loadDashboard()
  } catch (err) { showToast(err.message, 'error') }
}

window.archiveRenewal = async function(id) {
  if (!confirm('Lưu trữ dịch vụ này?')) return
  try {
    await api('PUT', `/renewals?id=${id}`, { archived_at: new Date().toISOString() })
    showToast('Đã lưu trữ', 'success')
    loadDashboard()
  } catch (err) { showToast(err.message, 'error') }
}

// ============================================================
// Renew Modal
// ============================================================
window.openRenewModal = function(id) {
  closeDetailModal()
  const r = allRenewals.find(x => x.id === id)
  if (!r) return

  document.getElementById('renew-id').value = id
  document.getElementById('renew-name').textContent = r.name
  document.getElementById('renew-old-expiry').value = r.expiry_date
  document.getElementById('renew-period').value = r.renewal_period || 12
  document.getElementById('renew-cost').value = r.cost || ''
  document.getElementById('renew-notes').value = ''
  autoCalcNewExpiry()

  document.getElementById('renew-modal').classList.remove('hidden')
  if (typeof lucide !== 'undefined') lucide.createIcons()
}

window.closeRenewModal = function() {
  document.getElementById('renew-modal').classList.add('hidden')
}

window.autoCalcNewExpiry = function() {
  const oldExpiry = document.getElementById('renew-old-expiry').value
  const period = parseInt(document.getElementById('renew-period').value) || 12
  if (oldExpiry) {
    const d = new Date(oldExpiry)
    d.setMonth(d.getMonth() + period)
    document.getElementById('renew-new-expiry').value = d.toISOString().slice(0, 10)
  }
}

window.confirmRenew = async function() {
  const id = document.getElementById('renew-id').value
  const old_expiry = document.getElementById('renew-old-expiry').value
  const new_expiry = document.getElementById('renew-new-expiry').value
  const cost = parseInt(document.getElementById('renew-cost').value) || 0
  const period_months = parseInt(document.getElementById('renew-period').value) || 12
  const notes = document.getElementById('renew-notes').value.trim()

  if (!new_expiry) return showToast('Vui lòng nhập hạn mới', 'error')

  try {
    await api('POST', `/renewals/${id}/history`, {
      renewed_date: new Date().toISOString().slice(0, 10),
      old_expiry, new_expiry, cost, period_months, notes
    })
    showToast('Đã gia hạn thành công!', 'success')
    closeRenewModal()
    loadDashboard()
  } catch (err) { showToast(err.message, 'error') }
}

// ============================================================
// Detail Modal
// ============================================================
window.openDetailModal = async function(id) {
  window.currentDetailId = id
  const r = allRenewals.find(x => x.id === id)
  const modal = document.getElementById('detail-modal')
  modal.classList.remove('hidden')

  if (r) {
    document.getElementById('detail-title').textContent = r.name
    const days = getDaysUntil(r.expiry_date)
    const level = getLevel(days)
    document.getElementById('detail-info').innerHTML = `
      <div class="detail-info-item"><span class="detail-info-label">Loại</span><span class="detail-info-value">${getTypeIcon(r.type)} ${r.type}</span></div>
      <div class="detail-info-item"><span class="detail-info-label">Hết hạn</span><span class="detail-info-value">${formatDate(r.expiry_date)}</span></div>
      <div class="detail-info-item"><span class="detail-info-label">Trạng thái</span><span class="detail-info-value">${getLevelBadge(level, days)}</span></div>
      <div class="detail-info-item"><span class="detail-info-label">Khách hàng</span><span class="detail-info-value">${escHtml(r.customer || '—')}</span></div>
      <div class="detail-info-item"><span class="detail-info-label">Nhà cung cấp</span><span class="detail-info-value">${escHtml(r.provider || '—')}</span></div>
      <div class="detail-info-item"><span class="detail-info-label">Chi phí</span><span class="detail-info-value">${r.cost ? formatCurrency(r.cost) : '—'}</span></div>
      ${r.registration_email ? `<div class="detail-info-item" style="grid-column:1/-1;"><span class="detail-info-label">Email đăng ký</span><span class="detail-info-value" style="font-weight:400; font-size:13px;">${escHtml(r.registration_email)}</span></div>` : ''}
      ${r.notes ? `<div class="detail-info-item" style="grid-column:1/-1;"><span class="detail-info-label">Ghi chú</span><span class="detail-info-value" style="font-weight:400; font-size:13px;">${escHtml(r.notes)}</span></div>` : ''}
    `
  }

  document.getElementById('detail-history-tbody').innerHTML =
    `<tr><td colspan="5" style="text-align:center; padding:20px;"><div class="loading-spinner sm" style="margin:auto;"></div></td></tr>`

  try {
    const { data: history } = await api('GET', `/renewals/${id}/history`)
    if (!history || history.length === 0) {
      document.getElementById('detail-history-tbody').innerHTML =
        `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--color-text-muted); font-size:13px;">Chưa có lịch sử gia hạn</td></tr>`
    } else {
      document.getElementById('detail-history-tbody').innerHTML = history.map(h => `
        <tr>
          <td style="font-size:13px;">${formatDate(h.renewed_date)}</td>
          <td style="font-size:13px;">${formatDate(h.old_expiry)}</td>
          <td style="font-size:13px; font-weight:600; color:#16a34a;">${formatDate(h.new_expiry)}</td>
          <td style="font-size:13px;">${h.cost ? formatCurrency(h.cost) : '—'}</td>
          <td style="font-size:13px; color:var(--color-text-muted);">${escHtml(h.notes || '—')}</td>
        </tr>
      `).join('')
    }
  } catch (err) {
    document.getElementById('detail-history-tbody').innerHTML =
      `<tr><td colspan="5" style="text-align:center; padding:16px; color:var(--color-critical); font-size:13px;">Lỗi: ${err.message}</td></tr>`
  }

  if (typeof lucide !== 'undefined') lucide.createIcons()
}

window.closeDetailModal = function() {
  document.getElementById('detail-modal').classList.add('hidden')
  window.currentDetailId = null
}

// ============================================================
// Trash Page
// ============================================================
async function loadTrash() {
  try {
    const { data } = await api('GET', '/renewals?trash=true')
    const content = document.getElementById('trash-content')
    if (!data || data.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i data-lucide="trash-2" width="36" height="36"></i></div>
          <p class="empty-title">Thùng rác trống</p>
          <p class="empty-description">Không có mục nào trong thùng rác.</p>
        </div>`
    } else {
      content.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr style="border-bottom:2px solid var(--color-border);">
                <th style="text-align:left; padding:10px 16px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-muted);">Tên dịch vụ</th>
                <th style="text-align:left; padding:10px 16px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-muted);">Loại</th>
                <th style="text-align:left; padding:10px 16px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-muted);">Ngày xóa</th>
                <th style="text-align:right; padding:10px 16px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-muted);">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(r => `
                <tr style="border-bottom:1px solid var(--color-border);">
                  <td style="padding:12px 16px; font-weight:500;">${escHtml(r.name)}</td>
                  <td style="padding:12px 16px; color:var(--color-text-muted);">${r.type}</td>
                  <td style="padding:12px 16px; color:var(--color-text-muted);">${formatDate(r.deleted_at)}</td>
                  <td style="padding:12px 16px; text-align:right;">
                    <div style="display:flex; gap:6px; justify-content:flex-end;" onclick="event.stopPropagation()">
                      <button onclick="restoreRenewal('${r.id}')" class="btn btn-success btn-sm">Phục hồi</button>
                      <button onclick="permanentDelete('${r.id}')" class="btn btn-danger btn-sm">Xóa vĩnh viễn</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`
    }
    if (typeof lucide !== 'undefined') lucide.createIcons()
  } catch (err) { showToast(err.message, 'error') }
}

window.restoreRenewal = async function(id) {
  try {
    await api('PUT', `/renewals?id=${id}`, { is_active: true, deleted_at: null })
    showToast('Đã phục hồi dịch vụ', 'success')
    loadTrash()
    loadDashboard()
  } catch (err) { showToast(err.message, 'error') }
}

window.permanentDelete = async function(id) {
  if (!confirm('Xóa vĩnh viễn? Không thể khôi phục!')) return
  try {
    await api('DELETE', `/renewals?id=${id}&permanent=true`)
    showToast('Đã xóa vĩnh viễn', 'success')
    loadTrash()
  } catch (err) { showToast(err.message, 'error') }
}

window.emptyTrash = async function() {
  if (!confirm('Xóa vĩnh viễn TẤT CẢ trong thùng rác?')) return
  try {
    const { data } = await api('DELETE', '/renewals?emptyTrash=true')
    showToast(`Đã xóa ${data?.purged || 0} mục`, 'success')
    loadTrash()
  } catch (err) { showToast(err.message, 'error') }
}

// ============================================================
// Notifications Page (standalone — accessed via nav if added)
// ============================================================
async function loadNotificationsPage() {
  // Redirect to show in dropdown
}

// ============================================================
// Analytics Page
// ============================================================
let analyticsCharts = {}
let analyticsYear = new Date().getFullYear()
let analyticsView = 'year'

async function loadAnalyticsPage() {
  const container = document.getElementById('analytics-content')
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Analytics</h1>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <select id="analytics-view" onchange="changeAnalyticsView()" class="form-input form-select" style="width:auto;">
          <option value="year">Lịch sử theo năm</option>
          <option value="quarter">So sánh cùng kỳ (Quý I)</option>
          <option value="customer">Theo khách hàng</option>
        </select>
        <select id="analytics-year-sel" onchange="changeAnalyticsYear()" class="form-input form-select" style="width:auto;"></select>
      </div>
    </div>
    <div id="analytics-data-area"><div class="loading-state"><div class="loading-spinner"></div></div></div>
  `

  // Fill year selector
  const yearSel = document.getElementById('analytics-year-sel')
  const now = new Date().getFullYear()
  for (let y = now + 1; y >= now - 5; y--) {
    const opt = new Option(y, y, y === now, y === now)
    yearSel.add(opt)
  }

  loadAnalyticsData()
}

window.changeAnalyticsView = function() {
  analyticsView = document.getElementById('analytics-view').value
  loadAnalyticsData()
}
window.changeAnalyticsYear = function() {
  analyticsYear = parseInt(document.getElementById('analytics-year-sel').value)
  loadAnalyticsData()
}

async function loadAnalyticsData() {
  const year = document.getElementById('analytics-year-sel')?.value || new Date().getFullYear()
  const view = document.getElementById('analytics-view')?.value || 'year'
  const area = document.getElementById('analytics-data-area')
  area.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>'

  try {
    let params = `view=year&year=${year}`
    const { data } = await api('GET', `/analytics?${params}`)

    const rows = data || []
    const totalCost = rows.reduce((s, m) => s + (m.totalCost || 0), 0)
    const totalCount = rows.reduce((s, m) => s + (m.count || 0), 0)

    area.innerHTML = `
      <div class="analytics-stat-cards">
        <div class="analytics-stat-card">
          <div class="analytics-stat-icon"><i data-lucide="dollar-sign" width="22" height="22"></i></div>
          <div>
            <p class="analytics-stat-label">Tổng chi phí</p>
            <p class="analytics-stat-value">${formatCurrency(totalCost)}</p>
          </div>
        </div>
        <div class="analytics-stat-card">
          <div class="analytics-stat-icon"><i data-lucide="repeat" width="22" height="22"></i></div>
          <div>
            <p class="analytics-stat-label">Lần gia hạn</p>
            <p class="analytics-stat-value">${totalCount}</p>
          </div>
        </div>
        <div class="analytics-stat-card">
          <div class="analytics-stat-icon"><i data-lucide="calendar" width="22" height="22"></i></div>
          <div>
            <p class="analytics-stat-label">Năm</p>
            <p class="analytics-stat-value">${year}</p>
          </div>
        </div>
        <div class="analytics-stat-card">
          <div class="analytics-stat-icon"><i data-lucide="trending-up" width="22" height="22"></i></div>
          <div>
            <p class="analytics-stat-label">TB / tháng</p>
            <p class="analytics-stat-value">${formatCurrency(Math.round(totalCost / 12))}</p>
          </div>
        </div>
      </div>

      <div class="analytics-section">
        <div class="analytics-section-header">
          <i data-lucide="clock" width="18" height="18"></i>
          <h3 class="analytics-section-title">Lịch sử chi phí theo năm</h3>
        </div>
        <div class="analytics-section-body" style="padding:0;">
          <table class="analytics-table">
            <thead>
              <tr>
                <th>NĂM</th>
                <th>LẦN GIA HẠN</th>
                <th>TỔNG CHI PHÍ</th>
                <th>YOY</th>
              </tr>
            </thead>
            <tbody id="year-history-tbody">
              <tr><td colspan="4" style="text-align:center; padding:20px; color:var(--color-text-muted);">Đang tải...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `

    loadYearHistory()
    if (typeof lucide !== 'undefined') lucide.createIcons()
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p class="empty-title" style="color:var(--color-critical)">Lỗi: ${err.message}</p></div>`
  }
}

async function loadYearHistory() {
  try {
    const { data: all } = await api('GET', '/analytics?view=all_years')
    const tbody = document.getElementById('year-history-tbody')
    if (!tbody) return
    if (!all || all.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--color-text-muted); font-size:13px;">Chưa có dữ liệu</td></tr>`
      return
    }

    const currentYear = new Date().getFullYear()
    tbody.innerHTML = all.map((y, idx) => {
      const prevCost = idx < all.length - 1 ? all[idx + 1]?.totalCost || 0 : 0
      const yoy = prevCost > 0 ? Math.round(((y.totalCost - prevCost) / prevCost) * 100) : null
      const yoyBadge = y.year === currentYear
        ? `<span class="yoy-badge neutral">Năm nay (tạm tính)</span>`
        : yoy === null
          ? ''
          : `<span class="yoy-badge ${yoy > 0 ? 'up' : 'down'}">↑ ${Math.abs(yoy)}%</span>`

      const isHighlighted = idx === 1 ? 'style="background:var(--color-primary-soft);"' : ''
      return `<tr ${isHighlighted}>
        <td style="font-size:13px; font-weight:600;">${y.year}${y.year === currentYear ? ' <span style="width:8px; height:8px; background:var(--color-primary); border-radius:50%; display:inline-block;"></span>' : ''}</td>
        <td style="font-size:13px;">${y.count || y.renewals || 0}</td>
        <td style="font-size:13px; font-weight:600;">${formatCurrency(y.totalCost)}</td>
        <td>${yoyBadge}</td>
      </tr>`
    }).join('')

    if (typeof lucide !== 'undefined') lucide.createIcons()
  } catch {}
}

// ============================================================
// Settings Page
// ============================================================
async function loadSettings() {
  try {
    const { data } = await api('GET', '/settings')

    // Telegram
    if (data?.telegram) {
      const t = data.telegram
      const teleEl = document.getElementById('telegram-enabled')
      if (teleEl) teleEl.checked = t.enabled === true
      const tokenEl = document.getElementById('telegram-token')
      if (tokenEl) tokenEl.value = t.bot_token || ''
      const chatEl = document.getElementById('telegram-chat-id')
      if (chatEl) chatEl.value = t.chat_id || ''
    }

    updateThemeSelector()
  } catch (err) {
    showToast(err.message, 'error')
  }
}

window.toggleSection = function(id) {
  const section = document.getElementById(id)
  const chevron = document.getElementById(`${id}-chevron`)
  if (!section) return
  const isHidden = section.style.display === 'none'
  section.style.display = isHidden ? '' : 'none'
  if (chevron) chevron.style.transform = isHidden ? '' : 'rotate(-90deg)'
}

window.saveTelegramSettings = async function() {
  const enabled = document.getElementById('telegram-enabled')?.checked === true
  const bot_token = document.getElementById('telegram-token').value.trim()
  const chat_id = document.getElementById('telegram-chat-id').value.trim()
  try {
    await api('PUT', '/settings', { key: 'telegram', value: { enabled, bot_token, chat_id } })
    showToast('Đã lưu cài đặt Telegram', 'success')
  } catch (err) { showToast(err.message, 'error') }
}

window.testTelegram = async function() {
  try {
    await api('POST', '/telegram/test', {})
    showToast('Đã gửi tin nhắn Telegram thử nghiệm', 'success')
  } catch (err) { showToast(err.message, 'error') }
}

window.testSmtp = async function() {
  showToast('Tính năng SMTP test sẽ sớm có', 'info')
}

window.saveSmtpSettings = async function() {
  showToast('Đã lưu cài đặt SMTP', 'success')
}

window.enablePushNotification = async function() {
  await registerPushNotification()
  document.getElementById('push-status-label').textContent = 'Đã bật'
  document.getElementById('btn-enable-push').textContent = 'Đã đăng ký'
  document.getElementById('btn-enable-push').disabled = true
}

window.exportData = function() {
  const data = JSON.stringify({ version: 1, exported_at: new Date().toISOString(), renewals: allRenewals }, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `renewal-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  showToast('Đã xuất dữ liệu', 'success')
}

window.triggerImport = function() {
  document.getElementById('import-input').click()
}

window.importData = async function(event) {
  const file = event.target.files[0]
  if (!file) return
  try {
    const text = await file.text()
    const json = JSON.parse(text)
    const renewals = json.renewals || json
    if (!Array.isArray(renewals)) throw new Error('File không hợp lệ')
    let imported = 0
    for (const r of renewals) {
      if (!r.name || !r.type || !r.expiry_date) continue
      try {
        await api('POST', '/renewals', {
          name: r.name, type: r.type, expiry_date: r.expiry_date,
          customer: r.customer, provider: r.provider, cost: r.cost,
          renewal_period: r.renewal_period, notes: r.notes,
          registration_email: r.registration_email
        })
        imported++
      } catch {}
    }
    showToast(`Đã nhập ${imported}/${renewals.length} dịch vụ`, 'success')
    loadDashboard()
  } catch (err) { showToast(err.message, 'error') }
  event.target.value = ''
}

// ============================================================
// Account Page
// ============================================================
async function loadAccount() {
  // Set email
  const emailEl2 = document.getElementById('user-email-display-2')
  if (emailEl2) emailEl2.textContent = currentUser?.email || ''

  // Load login logs
  try {
    const { data } = await api('GET', '/auth/login-log')
    const list = document.getElementById('login-log-list')
    if (!list) return
    if (!data || data.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding:28px;"><p class="empty-description">Không có lịch sử đăng nhập</p></div>`
      return
    }
    list.innerHTML = data.slice(0, 15).map(log => {
      const isSuccess = log.status === 'success'
      return `
        <div class="login-log-item">
          <div class="login-log-icon ${isSuccess ? 'success' : 'failure'}">
            <i data-lucide="${isSuccess ? 'check' : 'x'}" width="14" height="14"></i>
          </div>
          <div class="login-log-info">
            <div class="login-log-device">
              ${log.is_new_device ? '<span class="badge-new-device">⚠ Thiết bị mới</span>' : ''}
              <span class="${isSuccess ? 'badge-success' : 'badge-failed'}">${isSuccess ? 'Thành công' : 'Thất bại'}</span>
            </div>
            <p class="login-log-meta">${escHtml(log.device_info || 'Thiết bị không xác định')} • IP: ${log.ip_address || '?'}</p>
          </div>
          <span class="login-log-time">${formatRelativeDate(log.created_at)}</span>
        </div>`
    }).join('')
    if (typeof lucide !== 'undefined') lucide.createIcons()
  } catch (err) {
    const list = document.getElementById('login-log-list')
    if (list) list.innerHTML = `<div style="padding:16px; color:var(--color-critical); font-size:13px;">Lỗi: ${err.message}</div>`
  }
}

window.verifyCurrentPassword = async function() {
  const pwd = document.getElementById('current-password-input').value
  if (!pwd) return showToast('Nhập mật khẩu hiện tại', 'error')
  const { error } = await supabase.auth.signInWithPassword({ email: currentUser.email, password: pwd })
  if (error) return showToast('Mật khẩu không đúng', 'error')
  document.getElementById('change-password-form').classList.remove('hidden')
  showToast('Xác minh thành công', 'success')
}

window.changeEmail = async function() {
  const newEmail = document.getElementById('new-email-input').value.trim()
  if (!newEmail) return showToast('Vui lòng nhập email mới', 'error')
  try {
    await api('POST', '/auth/change-email', { new_email: newEmail })
    showToast('Đã gửi email xác nhận đến email mới', 'success')
  } catch (err) { showToast(err.message, 'error') }
}

window.changePassword = async function() {
  const newPass = document.getElementById('new-password-input').value
  if (!newPass || newPass.length < 6) return showToast('Mật khẩu phải ít nhất 6 ký tự', 'error')
  try {
    await api('POST', '/auth/change-password', { new_password: newPass })
    showToast('Đã cập nhật mật khẩu', 'success')
    document.getElementById('new-password-input').value = ''
    document.getElementById('change-password-form').classList.add('hidden')
  } catch (err) { showToast(err.message, 'error') }
}

// ============================================================
// Web Push
// ============================================================
async function registerPushNotification() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (!VAPID_PUBLIC_KEY) return

  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })
    await api('POST', '/push/subscribe', {
      endpoint: sub.endpoint,
      keys: {
        p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))),
        auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth'))))
      }
    })
    console.log('[push] Subscribed')
  } catch (err) {
    console.log('[push] Skipped:', err.message)
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from(Array.from(rawData).map(c => c.charCodeAt(0)))
}

// ============================================================
// Helpers
// ============================================================
function getToday() {
  const d = new Date(); d.setHours(0,0,0,0); return d
}
function getDaysUntil(dateStr) {
  const today = getToday()
  const expiry = new Date(dateStr); expiry.setHours(0,0,0,0)
  return Math.ceil((expiry - today) / 86400000)
}
function getLevel(days) {
  if (days < 0) return 'overdue'
  if (days <= 1) return '1day'
  if (days <= 3) return '3days'
  if (days <= 7) return '1week'
  if (days <= 14) return '2weeks'
  if (days <= 30) return '1month'
  return 'safe'
}

function getLevelBadge(level, days) {
  const d = Math.abs(days)
  const map = {
    overdue:  { cls: 'overdue', text: `Quá hạn ${d}ng` },
    '1day':   { cls: 'day1',   text: 'Còn 1 ngày' },
    '3days':  { cls: 'days3',  text: `Còn ${days}ng` },
    '1week':  { cls: 'week1',  text: `Còn ${days}ng` },
    '2weeks': { cls: 'weeks2', text: `Còn ${days}ng` },
    '1month': { cls: 'month1', text: `Còn ${days}ng` },
    safe:     { cls: 'safe',   text: 'An toàn' },
  }
  const { cls, text } = map[level] || { cls: 'safe', text: level }
  return `<span class="level-badge ${cls}">${text}</span>`
}

function getLevelTitle(level) {
  const t = { overdue: 'Quá hạn', '1day': 'Còn 1 ngày', '3days': 'Còn 3 ngày', '1week': 'Còn 1 tuần', '2weeks': 'Còn 2 tuần', '1month': 'Còn 1 tháng' }
  return t[level] || level
}

function getTypeIcon(type) {
  const icons = { domain: '🌐', hosting: '🖥️', ssl: '🔒', email: '📧', storage: '💾', other: '📦' }
  return icons[type] || '📦'
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now - d) / 60000)
  if (diff < 60) return `${diff} phút trước`
  if (diff < 1440) return `${Math.floor(diff/60)} giờ trước`
  if (diff < 10080) return `${Math.floor(diff/1440)} ngày trước`
  return formatDate(dateStr)
}

function formatCurrency(amount) {
  if (!amount) return '0đ'
  return amount.toLocaleString('vi-VN') + 'đ'
}

function escHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function getDeviceInfo() {
  const ua = navigator.userAgent
  let browser = 'Unknown'
  if (ua.includes('Chrome')) browser = 'Chrome'
  else if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Safari')) browser = 'Safari'
  else if (ua.includes('Edge')) browser = 'Edge'
  let os = 'Unknown'
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac')) os = 'macOS'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('Linux')) os = 'Linux'
  return `${browser} / ${os}`
}

function getKnownDevices() {
  try { return JSON.parse(localStorage.getItem('known_devices') || '[]') } catch { return [] }
}
function addKnownDevice(device) {
  const devices = getKnownDevices()
  if (!devices.includes(device)) devices.push(device)
  localStorage.setItem('known_devices', JSON.stringify(devices))
}

// ============================================================
// Global click handler to close dropdowns
// ============================================================
document.addEventListener('click', (e) => {
  const dd = document.getElementById('notif-dropdown')
  const bell = e.target.closest('.topbar-notif-wrapper')
  if (dd?.classList.contains('open') && !bell) {
    dd.classList.remove('open')
  }
})

// ============================================================
// Init
// ============================================================
async function init() {
  initTheme()

  const safetyTimer = setTimeout(() => {
    const overlay = document.getElementById('loading-overlay')
    if (overlay && !overlay.classList.contains('hidden')) {
      overlay.classList.add('hidden')
      showAuthPage()
    }
  }, 5000)

  try {
    await loadConfig()

    if (!initSupabase()) {
      clearTimeout(safetyTimer)
      showToast('Lỗi cấu hình: Không tìm thấy Supabase config', 'error')
      showAuthPage()
      return
    }

    if (typeof lucide !== 'undefined') lucide.createIcons()

    await restoreSession()
  } catch (err) {
    console.error('[init] Fatal:', err)
    showAuthPage()
  } finally {
    clearTimeout(safetyTimer)
    document.getElementById('loading-overlay').classList.add('hidden')
    if (typeof lucide !== 'undefined') lucide.createIcons()
  }
}

init()
