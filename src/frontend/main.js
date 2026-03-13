/**
 * Renewal Reminder — Frontend Main Entry
 * Vanilla JS SPA with Supabase Auth
 * Architecture: Page/View/State pattern
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// ============================================================
// Config — injected via Vite env or window.__env
// ============================================================
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || window.__env?.SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || window.__env?.SUPABASE_ANON_KEY || ''
const VAPID_PUBLIC_KEY = import.meta.env?.VITE_VAPID_PUBLIC_KEY || window.__env?.VAPID_PUBLIC_KEY || ''

// ============================================================
// Supabase client
// ============================================================
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ============================================================
// Global state
// ============================================================
let authToken = null
let currentUser = null
let allRenewals = []
let currentLevelFilter = null
let analyticsChart = null
let currentDetailId = null
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
// Toast notifications
// ============================================================
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container')
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  container.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateX(100%)'
    toast.style.transition = 'all 0.3s ease'
    setTimeout(() => toast.remove(), 300)
  }, duration)
}
window.showToast = showToast

// ============================================================
// Theme
// ============================================================
function initTheme() {
  const saved = localStorage.getItem('theme') || 'light'
  document.documentElement.classList.toggle('dark', saved === 'dark')
  document.documentElement.setAttribute('class', saved === 'dark' ? 'dark sl-theme-dark' : 'sl-theme-light')
  updateThemeIcons()
}

window.toggleTheme = function() {
  const isDark = document.documentElement.classList.contains('dark')
  const newTheme = isDark ? 'light' : 'dark'
  localStorage.setItem('theme', newTheme)
  document.documentElement.className = newTheme === 'dark' ? 'dark sl-theme-dark' : 'sl-theme-light'
  updateThemeIcons()
  if (typeof lucide !== 'undefined') lucide.createIcons()
}

function updateThemeIcons() {
  document.querySelectorAll('.dark-hidden').forEach(el => {
    el.classList.toggle('hidden', document.documentElement.classList.contains('dark'))
  })
  document.querySelectorAll('.light-hidden').forEach(el => {
    el.classList.toggle('hidden', !document.documentElement.classList.contains('dark'))
  })
}

// ============================================================
// Router
// ============================================================
const routes = {
  '/': 'page-dashboard',
  '/archive': 'page-archive',
  '/analytics': 'page-analytics',
  '/trash': 'page-trash',
  '/notifications': 'page-notifications',
  '/settings': 'page-settings',
  '/account': 'page-account',
}

window.navigate = function(path) {
  history.pushState({}, '', path)
  renderRoute(path)
}

function renderRoute(path) {
  const pageId = routes[path] || 'page-dashboard'
  document.querySelectorAll('#app-shell .page').forEach(p => p.classList.remove('active'))
  const page = document.getElementById(pageId)
  if (page) page.classList.add('active')

  // Update nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    const route = link.getAttribute('data-route')
    link.classList.toggle('bg-blue-50', route === path)
    link.classList.toggle('dark:bg-blue-900/20', route === path)
    link.classList.toggle('text-blue-600', route === path)
    link.classList.toggle('dark:text-blue-400', route === path)
  })

  // Load page data
  if (path === '/') loadDashboard()
  if (path === '/archive') loadArchive()
  if (path === '/analytics') initAnalyticsPage()
  if (path === '/trash') loadTrash()
  if (path === '/notifications') loadNotifications()
  if (path === '/settings') loadSettings()
  if (path === '/account') loadAccount()
  if (path.startsWith('/renewal/')) {
    const id = path.split('/')[2]
    openDetailModal(id)
  }
}

window.onpopstate = () => renderRoute(location.pathname)

// ============================================================
// Auth
// ============================================================
window.authLogin = async function() {
  const email = document.getElementById('auth-email').value.trim()
  const password = document.getElementById('auth-password').value
  if (!email || !password) return showToast('Vui lòng nhập email và mật khẩu', 'error')

  const btn = document.getElementById('btn-login')
  btn.disabled = true
  btn.innerHTML = '<span class="spinner"></span> Đang xử lý...'

  try {
    // Step 1: Sign in with password
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    authToken = data.session.access_token
    currentUser = data.user

    // Step 2: Request OTP for 2FA
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
    localStorage.setItem('auth_token', authToken)

    // Log login
    const deviceInfo = getDeviceInfo()
    const known = getKnownDevices()
    const isNew = !known.includes(deviceInfo)
    if (isNew) addKnownDevice(deviceInfo)

    fetch('/api/auth/login-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({
        email, status: 'success',
        user_agent: navigator.userAgent,
        device_info: deviceInfo,
        is_new_device: isNew
      })
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

window.authLogout = async function() {
  await supabase.auth.signOut()
  localStorage.removeItem('auth_token')
  authToken = null
  currentUser = null
  allRenewals = []
  document.getElementById('app-shell').classList.add('hidden')
  document.getElementById('page-auth').classList.add('active')
  document.getElementById('account-menu').classList.add('hidden')
  if (typeof lucide !== 'undefined') lucide.createIcons()
}

window.toggleAccountMenu = function() {
  document.getElementById('account-menu').classList.toggle('hidden')
}

window.toggleMobileMenu = function() {
  document.getElementById('mobile-menu').classList.toggle('hidden')
}

window.togglePasswordVisibility = function(id) {
  const input = document.getElementById(id)
  input.type = input.type === 'password' ? 'text' : 'password'
}

function onAuthSuccess() {
  document.getElementById('page-auth').classList.remove('active')
  document.getElementById('app-shell').classList.remove('hidden')
  document.getElementById('user-email-display').textContent = currentUser?.email || ''
  loadDashboard()
  loadNotificationBadge()
  navigate(location.pathname === '/' || !routes[location.pathname] ? '/' : location.pathname)
  // Register push subscription
  registerPushNotification()
}

window.authSendOtp = function() {
  // Called on enter key in email/password fields
  authLogin()
}

// ============================================================
// Session restoration
// ============================================================
async function restoreSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      authToken = session.access_token
      currentUser = session.user
      onAuthSuccess()
      return
    }
  } catch {}
  showAuthPage()
}

function showAuthPage() {
  document.getElementById('loading-overlay').classList.add('hidden')
  document.getElementById('page-auth').classList.add('active')
  if (typeof lucide !== 'undefined') lucide.createIcons()
}

// ============================================================
// Dashboard
// ============================================================
async function loadDashboard() {
  document.getElementById('renewals-tbody').innerHTML = `
    <tr><td colspan="7" class="text-center py-12 text-gray-400">
      <div class="spinner mx-auto mb-2"></div><p class="text-sm">Đang tải...</p>
    </td></tr>`

  try {
    const { data } = await api('GET', '/renewals')
    allRenewals = data || []
    updateStats()
    renderTable()
  } catch (err) {
    showToast(err.message, 'error')
    document.getElementById('renewals-tbody').innerHTML =
      `<tr><td colspan="7" class="text-center py-12 text-red-400 text-sm">Lỗi: ${err.message}</td></tr>`
  }
}

function updateStats() {
  let overdue = 0, urgent = 0, warning = 0, safe = 0
  const today = getToday()

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

window.filterByLevel = function(levelGroup) {
  currentLevelFilter = levelGroup
  const labels = { overdue: 'Quá hạn', urgent: 'Khẩn cấp', warning: 'Cảnh báo', safe: 'An toàn' }
  const filterBar = document.getElementById('level-filter-bar')
  document.getElementById('level-filter-label').textContent = labels[levelGroup] || levelGroup
  filterBar.classList.remove('hidden')
  filterBar.style.display = 'flex'
  renderTable()
}

window.clearLevelFilter = function() {
  currentLevelFilter = null
  document.getElementById('level-filter-bar').classList.add('hidden')
  renderTable()
}

function renderTable() {
  const search = document.getElementById('search-input').value.toLowerCase()
  const typeFilter = document.getElementById('filter-type').value
  const sort = document.getElementById('filter-sort').value

  let items = [...allRenewals]

  // Filter
  if (search) items = items.filter(r =>
    r.name?.toLowerCase().includes(search) || r.customer?.toLowerCase().includes(search)
  )
  if (typeFilter) items = items.filter(r => r.type === typeFilter)

  // Level filter
  if (currentLevelFilter) {
    items = items.filter(r => {
      const level = getLevel(getDaysUntil(r.expiry_date))
      if (currentLevelFilter === 'overdue') return level === 'overdue'
      if (currentLevelFilter === 'urgent') return level === '1day' || level === '3days'
      if (currentLevelFilter === 'warning') return level === '1week' || level === '2weeks' || level === '1month'
      if (currentLevelFilter === 'safe') return level === 'safe'
      return true
    })
  }

  // Sort
  items.sort((a, b) => {
    if (sort === 'expiry_asc') return new Date(a.expiry_date) - new Date(b.expiry_date)
    if (sort === 'expiry_desc') return new Date(b.expiry_date) - new Date(a.expiry_date)
    if (sort === 'name_asc') return a.name.localeCompare(b.name)
    if (sort === 'cost_desc') return (b.cost || 0) - (a.cost || 0)
    return 0
  })

  const tbody = document.getElementById('renewals-tbody')
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-12 text-gray-400 text-sm">Không có dữ liệu</td></tr>`
    document.getElementById('table-footer').textContent = ''
    return
  }

  tbody.innerHTML = items.map(r => {
    const days = getDaysUntil(r.expiry_date)
    const level = getLevel(days)
    const badge = getLevelBadge(level, days)
    const icon = getTypeIcon(r.type)
    return `<tr onclick="openDetailModal('${r.id}')">
      <td>
        <div class="flex items-center gap-2">
          <span class="text-lg">${icon}</span>
          <div>
            <p class="font-medium text-sm">${escHtml(r.name)}</p>
            ${r.provider ? `<p class="text-xs text-gray-400">${escHtml(r.provider)}</p>` : ''}
          </div>
        </div>
      </td>
      <td class="hide-mobile"><span class="text-xs bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full capitalize">${r.type}</span></td>
      <td class="hide-mobile"><span class="text-sm text-gray-600 dark:text-slate-400">${escHtml(r.customer || '—')}</span></td>
      <td class="text-sm">${formatDate(r.expiry_date)}</td>
      <td>${badge}</td>
      <td class="hide-mobile text-sm">${r.cost ? formatCurrency(r.cost) : '—'}</td>
      <td class="text-right">
        <div class="flex gap-1 justify-end" onclick="event.stopPropagation()">
          <button onclick="openRenewModal('${r.id}')" title="Gia hạn" class="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 rounded-lg transition-colors">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="openRenewalModal('${r.id}')" title="Sửa" class="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded-lg transition-colors">
            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="archiveRenewal('${r.id}')" title="Lưu trữ" class="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 rounded-lg transition-colors">
            <i data-lucide="archive" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="deleteRenewal('${r.id}')" title="Xóa" class="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-colors">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </td>
    </tr>`
  }).join('')

  document.getElementById('table-footer').textContent = `Hiển thị ${items.length}/${allRenewals.length} dịch vụ`

  if (typeof lucide !== 'undefined') lucide.createIcons()
}

// ============================================================
// CRUD Operations
// ============================================================
window.openRenewalModal = function(id) {
  const modal = document.getElementById('renewal-modal')
  const titleEl = document.getElementById('modal-title')
  modal.classList.remove('hidden')

  if (id) {
    const r = allRenewals.find(x => x.id === id)
    if (!r) return
    titleEl.textContent = 'Chỉnh sửa dịch vụ'
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
    titleEl.textContent = 'Thêm dịch vụ mới'
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
  } catch (err) {
    showToast(err.message, 'error')
  }
}

window.archiveRenewal = async function(id) {
  if (!confirm('Lưu trữ dịch vụ này?')) return
  try {
    await api('PUT', `/renewals?id=${id}`, { archived_at: new Date().toISOString() })
    showToast('Đã lưu trữ', 'success')
    loadDashboard()
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// ============================================================
// Renew modal
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

  // Auto calculate new expiry
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
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// ============================================================
// Detail modal
// ============================================================
window.openDetailModal = async function(id) {
  currentDetailId = id
  window.currentDetailId = id
  const r = allRenewals.find(x => x.id === id)

  const modal = document.getElementById('detail-modal')
  modal.classList.remove('hidden')

  if (r) {
    document.getElementById('detail-title').textContent = r.name
    const days = getDaysUntil(r.expiry_date)
    const level = getLevel(days)
    document.getElementById('detail-info').innerHTML = `
      <div><span class="text-xs text-gray-500">Loại</span><p class="font-medium capitalize">${r.type}</p></div>
      <div><span class="text-xs text-gray-500">Hết hạn</span><p class="font-medium">${formatDate(r.expiry_date)}</p></div>
      <div><span class="text-xs text-gray-500">Khách hàng</span><p class="font-medium">${escHtml(r.customer || '—')}</p></div>
      <div><span class="text-xs text-gray-500">Nhà cung cấp</span><p class="font-medium">${escHtml(r.provider || '—')}</p></div>
      <div><span class="text-xs text-gray-500">Chi phí</span><p class="font-medium">${r.cost ? formatCurrency(r.cost) : '—'}</p></div>
      <div><span class="text-xs text-gray-500">Trạng thái</span><div>${getLevelBadge(level, days)}</div></div>
      ${r.registration_email ? `<div class="col-span-2"><span class="text-xs text-gray-500">Email đăng ký</span><p class="font-medium text-sm">${escHtml(r.registration_email)}</p></div>` : ''}
      ${r.notes ? `<div class="col-span-2"><span class="text-xs text-gray-500">Ghi chú</span><p class="text-sm">${escHtml(r.notes)}</p></div>` : ''}
    `
  }

  // Load history
  document.getElementById('detail-history-tbody').innerHTML =
    `<tr><td colspan="5" class="text-center py-4 text-gray-400 text-sm"><div class="spinner mx-auto"></div></td></tr>`

  try {
    const { data: history } = await api('GET', `/renewals/${id}/history`)
    if (!history || history.length === 0) {
      document.getElementById('detail-history-tbody').innerHTML =
        `<tr><td colspan="5" class="text-center py-6 text-gray-400 text-sm">Chưa có lịch sử gia hạn</td></tr>`
    } else {
      document.getElementById('detail-history-tbody').innerHTML = history.map(h => `
        <tr>
          <td class="text-sm">${formatDate(h.renewed_date)}</td>
          <td class="text-sm">${formatDate(h.old_expiry)}</td>
          <td class="text-sm font-medium text-green-600">${formatDate(h.new_expiry)}</td>
          <td class="text-sm">${h.cost ? formatCurrency(h.cost) : '—'}</td>
          <td class="text-sm text-gray-500">${escHtml(h.notes || '—')}</td>
        </tr>
      `).join('')
    }
  } catch (err) {
    document.getElementById('detail-history-tbody').innerHTML =
      `<tr><td colspan="5" class="text-center py-4 text-red-400 text-sm">Lỗi: ${err.message}</td></tr>`
  }

  if (typeof lucide !== 'undefined') lucide.createIcons()
}

window.closeDetailModal = function() {
  document.getElementById('detail-modal').classList.add('hidden')
  currentDetailId = null
  window.currentDetailId = null
}

// ============================================================
// Archive page
// ============================================================
async function loadArchive() {
  try {
    const { data } = await api('GET', '/renewals?archived=true')
    const tbody = document.getElementById('archive-tbody')
    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-gray-400 text-sm">Không có dịch vụ đã lưu trữ</td></tr>`
      return
    }
    tbody.innerHTML = data.map(r => `
      <tr>
        <td><div class="flex items-center gap-2"><span>${getTypeIcon(r.type)}</span><span class="font-medium text-sm">${escHtml(r.name)}</span></div></td>
        <td class="hide-mobile"><span class="text-xs bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full capitalize">${r.type}</span></td>
        <td class="hide-mobile text-sm text-gray-600">${escHtml(r.customer || '—')}</td>
        <td class="text-sm">${formatDate(r.expiry_date)}</td>
        <td class="hide-mobile text-sm text-gray-500">${formatDate(r.archived_at)}</td>
        <td class="text-right" onclick="event.stopPropagation()">
          <button onclick="unarchiveRenewal('${r.id}')" title="Bỏ lưu trữ" class="px-3 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
            Phục hồi
          </button>
        </td>
      </tr>
    `).join('')
    if (typeof lucide !== 'undefined') lucide.createIcons()
  } catch (err) {
    showToast(err.message, 'error')
  }
}

window.unarchiveRenewal = async function(id) {
  try {
    await api('PUT', `/renewals?id=${id}`, { archived_at: null })
    showToast('Đã phục hồi dịch vụ', 'success')
    loadArchive()
    loadDashboard()
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// ============================================================
// Trash page
// ============================================================
async function loadTrash() {
  try {
    const { data } = await api('GET', '/renewals?trash=true')
    const tbody = document.getElementById('trash-tbody')
    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-12 text-gray-400 text-sm">Thùng rác trống</td></tr>`
      return
    }
    tbody.innerHTML = data.map(r => `
      <tr>
        <td><span class="font-medium text-sm">${escHtml(r.name)}</span></td>
        <td class="hide-mobile text-sm capitalize">${r.type}</td>
        <td class="hide-mobile text-sm text-gray-500">${formatDate(r.expiry_date)}</td>
        <td class="text-sm text-gray-500">${formatDate(r.deleted_at)}</td>
        <td class="text-right" onclick="event.stopPropagation()">
          <div class="flex gap-1 justify-end">
            <button onclick="restoreRenewal('${r.id}')" class="px-2 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors">Phục hồi</button>
            <button onclick="permanentDelete('${r.id}')" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors">Xóa vĩnh viễn</button>
          </div>
        </td>
      </tr>
    `).join('')
  } catch (err) {
    showToast(err.message, 'error')
  }
}

window.restoreRenewal = async function(id) {
  try {
    await api('PUT', `/renewals?id=${id}`, { is_active: true, deleted_at: null })
    showToast('Đã phục hồi dịch vụ', 'success')
    loadTrash()
    loadDashboard()
  } catch (err) {
    showToast(err.message, 'error')
  }
}

window.permanentDelete = async function(id) {
  if (!confirm('Xóa vĩnh viễn? Không thể khôi phục!')) return
  try {
    await api('DELETE', `/renewals?id=${id}&permanent=true`)
    showToast('Đã xóa vĩnh viễn', 'success')
    loadTrash()
  } catch (err) {
    showToast(err.message, 'error')
  }
}

window.emptyTrash = async function() {
  if (!confirm('Xóa vĩnh viễn TẤT CẢ trong thùng rác?')) return
  try {
    const { data } = await api('DELETE', '/renewals?emptyTrash=true')
    showToast(`Đã xóa ${data?.purged || 0} mục`, 'success')
    loadTrash()
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// ============================================================
// Notifications page
// ============================================================
async function loadNotifications() {
  const list = document.getElementById('notifications-list')
  list.innerHTML = `<div class="text-center py-8"><div class="spinner mx-auto"></div></div>`
  try {
    const { data } = await api('GET', '/notifications?all=true')
    if (!data || data.length === 0) {
      list.innerHTML = `<p class="text-center py-12 text-gray-400 text-sm">Không có thông báo</p>`
      return
    }
    list.innerHTML = data.map(n => {
      const renewal = n.renewals
      const isRead = n.is_read
      return `<div class="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex items-start gap-3 ${isRead ? 'opacity-60' : ''}">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isRead ? 'bg-gray-100' : 'bg-blue-100 dark:bg-blue-900/30'}">
          <i data-lucide="bell" class="w-4 h-4 ${isRead ? 'text-gray-400' : 'text-blue-600'}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium">${getLevelTitle(n.level)} — ${renewal?.name || '?'}</p>
          <p class="text-xs text-gray-500 mt-0.5">${renewal?.type || ''} · ${formatDate(n.sent_at)}</p>
        </div>
        ${!isRead ? `<button onclick="markRead('${n.id}')" class="text-xs text-blue-600 hover:underline whitespace-nowrap">Đánh dấu đọc</button>` : ''}
      </div>`
    }).join('')
    if (typeof lucide !== 'undefined') lucide.createIcons()
  } catch (err) {
    list.innerHTML = `<p class="text-center py-8 text-red-400 text-sm">Lỗi: ${err.message}</p>`
  }
}

async function loadNotificationBadge() {
  try {
    const { data } = await api('GET', '/notifications')
    const badge = document.getElementById('notif-badge')
    const count = data?.length || 0
    badge.textContent = count > 99 ? '99+' : count
    badge.classList.toggle('hidden', count === 0)
    badge.style.display = count > 0 ? 'flex' : 'none'
  } catch {}
}

window.markRead = async function(id) {
  try {
    await api('PUT', '/notifications', { ids: [id] })
    loadNotifications()
    loadNotificationBadge()
  } catch (err) {
    showToast(err.message, 'error')
  }
}

window.markAllRead = async function() {
  try {
    await api('PUT', '/notifications', { all: true })
    showToast('Đã đánh dấu tất cả đã đọc', 'success')
    loadNotifications()
    loadNotificationBadge()
  } catch (err) {
    showToast(err.message, 'error')
  }
}

window.clearNotifications = async function() {
  try {
    await api('DELETE', '/notifications')
    showToast('Đã xóa thông báo đã đọc', 'success')
    loadNotifications()
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// ============================================================
// Settings page
// ============================================================
async function loadSettings() {
  try {
    const { data } = await api('GET', '/settings')

    // Web Push
    const pushEl = document.getElementById('push-enabled')
    if (pushEl) pushEl.checked = data?.webpush?.enabled !== false

    // Telegram
    if (data?.telegram) {
      const t = data.telegram
      const teleEl = document.getElementById('telegram-enabled')
      if (teleEl) teleEl.checked = t.enabled === true
      document.getElementById('telegram-token').value = t.bot_token || ''
      document.getElementById('telegram-chat-id').value = t.chat_id || ''
    }

    // Cron endpoint
    const cronEl = document.getElementById('cron-endpoint-display')
    if (cronEl) cronEl.textContent = `${location.origin}/api/cron/check-renewals`
  } catch (err) {
    showToast(err.message, 'error')
  }
}

window.savePushSettings = async function() {
  const enabled = document.getElementById('push-enabled')?.checked !== false
  try {
    await api('PUT', '/settings', { key: 'webpush', value: { enabled } })
    showToast('Đã lưu cài đặt Push', 'success')
  } catch (err) {
    showToast(err.message, 'error')
  }
}

window.saveTelegramSettings = async function() {
  const enabled = document.getElementById('telegram-enabled')?.checked === true
  const bot_token = document.getElementById('telegram-token').value.trim()
  const chat_id = document.getElementById('telegram-chat-id').value.trim()
  try {
    await api('PUT', '/settings', { key: 'telegram', value: { enabled, bot_token, chat_id } })
    showToast('Đã lưu cài đặt Telegram', 'success')
  } catch (err) {
    showToast(err.message, 'error')
  }
}

window.testPushNotification = async function() {
  try {
    const { data } = await api('POST', '/notify/test', {})
    showToast(`Đã gửi ${data?.sent || 0} thông báo`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  }
}

window.testTelegram = async function() {
  try {
    await api('POST', '/telegram/test', {})
    showToast('Đã gửi tin nhắn Telegram thử nghiệm', 'success')
  } catch (err) {
    showToast(err.message, 'error')
  }
}

window.triggerCronNow = async function() {
  try {
    const result = await api('GET', '/cron/check-renewals')
    showToast(`Cron: Push=${result.notifications?.push}, Telegram=${result.notifications?.telegram}`, 'success')
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// ============================================================
// Analytics page
// ============================================================
function initAnalyticsPage() {
  const yearSel = document.getElementById('analytics-year')
  const monthSel = document.getElementById('analytics-month')
  const now = new Date()

  if (!yearSel.options.length) {
    for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 3; y--) {
      yearSel.add(new Option(y, y, y === now.getFullYear(), y === now.getFullYear()))
    }
  }
  if (!monthSel.options.length) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    months.forEach((m, i) => monthSel.add(new Option(m, i + 1, i + 1 === now.getMonth() + 1, i + 1 === now.getMonth() + 1)))
  }
  loadAnalytics()
}

window.loadAnalytics = async function() {
  const view = document.getElementById('analytics-view').value
  const year = document.getElementById('analytics-year').value
  const month = document.getElementById('analytics-month').value
  const monthSel = document.getElementById('analytics-month')
  monthSel.style.display = view === 'year' || view === 'customer' ? 'none' : ''

  try {
    let params = `view=${view}&year=${year}`
    if (view === 'month') params += `&month=${month}`
    const { data } = await api('GET', `/analytics?${params}`)

    if (view === 'month') {
      document.getElementById('analytics-total-cost').textContent = formatCurrency(data.totalCost || 0)
      document.getElementById('analytics-count').textContent = data.count || 0
      const avg = data.count > 0 ? Math.round((data.totalCost || 0) / data.count) : 0
      document.getElementById('analytics-avg').textContent = formatCurrency(avg)

      const items = data.items || []
      document.getElementById('analytics-tbody').innerHTML = items.length === 0
        ? `<tr><td colspan="3" class="text-center py-8 text-gray-400 text-sm">Không có dữ liệu</td></tr>`
        : items.map(r => `<tr>
            <td class="text-sm font-medium">${escHtml(r.name)}</td>
            <td class="text-sm capitalize text-gray-500">${r.type}</td>
            <td class="text-sm text-right font-medium">${formatCurrency(r.cost || 0)}</td>
          </tr>`).join('')

      renderChart('bar', items.map(r => r.name), items.map(r => r.cost || 0), 'Chi phí theo dịch vụ')
    } else if (view === 'year') {
      const totalCost = (data || []).reduce((s, m) => s + m.totalCost, 0)
      document.getElementById('analytics-total-cost').textContent = formatCurrency(totalCost)
      document.getElementById('analytics-count').textContent = (data || []).reduce((s, m) => s + m.count, 0)
      document.getElementById('analytics-avg').textContent = formatCurrency(Math.round(totalCost / 12))

      const months = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12']
      document.getElementById('analytics-tbody').innerHTML = (data || []).map(m => `<tr>
        <td class="text-sm">Tháng ${m.month}</td>
        <td class="text-sm">${m.count} dịch vụ</td>
        <td class="text-sm text-right font-medium">${formatCurrency(m.totalCost)}</td>
      </tr>`).join('')
      renderChart('line', months, (data || []).map(m => m.totalCost), 'Chi phí theo tháng')
    } else if (view === 'customer') {
      const totalCost = (data || []).reduce((s, c) => s + c.totalCost, 0)
      document.getElementById('analytics-total-cost').textContent = formatCurrency(totalCost)
      document.getElementById('analytics-count').textContent = (data || []).length
      document.getElementById('analytics-avg').textContent = formatCurrency(Math.round(totalCost / (data?.length || 1)))

      document.getElementById('analytics-tbody').innerHTML = (data || []).map(c => `<tr>
        <td class="text-sm font-medium">${escHtml(c.customer)}</td>
        <td class="text-sm text-gray-500">${c.count} dịch vụ</td>
        <td class="text-sm text-right font-medium">${formatCurrency(c.totalCost)}</td>
      </tr>`).join('')
      renderChart('doughnut', (data || []).map(c => c.customer), (data || []).map(c => c.totalCost), 'Chi phí theo KH')
    }
  } catch (err) {
    showToast(err.message, 'error')
  }
}

function renderChart(type, labels, values, title) {
  const ctx = document.getElementById('analytics-chart')
  if (analyticsChart) analyticsChart.destroy()

  const isDark = document.documentElement.classList.contains('dark')
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'
  const textColor = isDark ? '#94a3b8' : '#6b7280'
  const palette = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16']

  analyticsChart = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        label: title,
        data: values,
        backgroundColor: type === 'doughnut' ? palette : '#3b82f6',
        borderColor: type === 'line' ? '#3b82f6' : undefined,
        borderWidth: type === 'line' ? 2 : 0,
        fill: type === 'line',
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: type === 'doughnut', labels: { color: textColor, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => formatCurrency(ctx.raw) } }
      },
      scales: type !== 'doughnut' ? {
        x: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor } },
        y: { ticks: { color: textColor, font: { size: 11 }, callback: v => `${(v/1000).toFixed(0)}k` }, grid: { color: gridColor } }
      } : {}
    }
  })
}

// ============================================================
// Account page
// ============================================================
async function loadAccount() {
  try {
    const { data } = await api('GET', '/auth/login-log')
    const list = document.getElementById('login-log-list')
    if (!data || data.length === 0) {
      list.innerHTML = `<p class="text-sm text-gray-400">Không có lịch sử</p>`
      return
    }
    list.innerHTML = data.slice(0, 10).map(log => `
      <div class="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-700/50">
        <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${log.status === 'success' ? 'bg-green-100' : 'bg-red-100'}">
          <i data-lucide="${log.status === 'success' ? 'check' : 'x'}" class="w-3.5 h-3.5 ${log.status === 'success' ? 'text-green-600' : 'text-red-600'}"></i>
        </div>
        <div>
          <p class="text-sm font-medium">${log.device_info || 'Thiết bị không xác định'}</p>
          <p class="text-xs text-gray-500">${formatDate(log.created_at)} · ${log.ip_address || ''}</p>
          ${log.is_new_device ? `<span class="text-xs text-orange-600 font-medium">⚠ Thiết bị mới</span>` : ''}
        </div>
      </div>
    `).join('')
    if (typeof lucide !== 'undefined') lucide.createIcons()
  } catch (err) {
    document.getElementById('login-log-list').innerHTML = `<p class="text-sm text-red-400">Lỗi: ${err.message}</p>`
  }
}

window.changeEmail = async function() {
  const newEmail = document.getElementById('new-email-input').value.trim()
  if (!newEmail) return showToast('Vui lòng nhập email mới', 'error')
  try {
    await api('POST', '/auth/change-email', { new_email: newEmail })
    showToast('Đã gửi email xác nhận', 'success')
  } catch (err) {
    showToast(err.message, 'error')
  }
}

window.changePassword = async function() {
  const newPass = document.getElementById('new-password-input').value
  if (!newPass || newPass.length < 6) return showToast('Mật khẩu phải ít nhất 6 ký tự', 'error')
  try {
    await api('POST', '/auth/change-password', { new_password: newPass })
    showToast('Đã cập nhật mật khẩu', 'success')
    document.getElementById('new-password-input').value = ''
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// ============================================================
// Export / Import
// ============================================================
window.exportData = function() {
  const data = JSON.stringify({ version: 1, exported_at: new Date().toISOString(), renewals: allRenewals }, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `renewal-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  document.getElementById('account-menu').classList.add('hidden')
  showToast('Đã xuất dữ liệu', 'success')
}

window.triggerImport = function() {
  document.getElementById('import-input').click()
  document.getElementById('account-menu').classList.add('hidden')
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
  } catch (err) {
    showToast(err.message, 'error')
  }
  event.target.value = ''
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
      keys: { p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))), auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))) }
    })
    console.log('[push] Subscribed successfully')
  } catch (err) {
    console.log('[push] Registration skipped:', err.message)
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
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function getDaysUntil(dateStr) {
  const today = getToday()
  const expiry = new Date(dateStr)
  expiry.setHours(0, 0, 0, 0)
  return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
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
  const labels = {
    overdue: `❌ Quá hạn ${days !== undefined ? Math.abs(days) + 'ng' : ''}`,
    '1day': `🔥 Còn 1 ngày`,
    '3days': `⚠️ Còn ${days}ng`,
    '1week': `📢 Còn ${days}ng`,
    '2weeks': `📋 Còn ${days}ng`,
    '1month': `📅 Còn ${days}ng`,
    safe: `✅ An toàn`,
    archived: `📦 Lưu trữ`,
  }
  return `<span class="badge-${level} px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">${labels[level] || level}</span>`
}

function getLevelTitle(level) {
  const t = { overdue: '❌ Quá hạn', '1day': '🔥 Còn 1 ngày', '3days': '⚠️ Còn 3 ngày', '1week': '📢 Còn 1 tuần', '2weeks': '📋 Còn 2 tuần', '1month': '📅 Còn 1 tháng' }
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
  return `${browser} on ${os}`
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
// Init
// ============================================================
async function init() {
  initTheme()

  // Init Lucide icons
  if (typeof lucide !== 'undefined') lucide.createIcons()

  // Close menus on outside click
  document.addEventListener('click', (e) => {
    const accountMenu = document.getElementById('account-menu')
    const accountBtn = e.target.closest('[onclick="toggleAccountMenu()"]')
    if (!accountBtn && !accountMenu.contains(e.target)) {
      accountMenu.classList.add('hidden')
    }
    const mobileMenu = document.getElementById('mobile-menu')
    const mobileBtn = e.target.closest('[onclick="toggleMobileMenu()"]')
    if (!mobileBtn && !mobileMenu.contains(e.target) && !mobileMenu.classList.contains('hidden')) {
      // Let the button handle it
    }
  })

  // Restore session
  await restoreSession()

  // Hide loading
  setTimeout(() => {
    document.getElementById('loading-overlay').classList.add('hidden')
    if (typeof lucide !== 'undefined') lucide.createIcons()
  }, 500)
}

init()
