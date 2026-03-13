# 🔔 Renewal Reminder — Cloudflare Pages + Supabase

> **Hệ thống theo dõi và nhắc nhở gia hạn thông minh** — Hosting, Domain, SSL, Email.  
> Tích hợp Web Push, Telegram Bot, PWA. Chi phí $0/tháng.

[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)
[![Supabase](https://img.shields.io/badge/Database-Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 📋 Mục lục

- [Tính năng](#-tính-năng)
- [Kiến trúc](#-kiến-trúc)
- [Yêu cầu](#-yêu-cầu)
- [Hướng dẫn triển khai](#-hướng-dẫn-triển-khai)
  - [Bước 1: Tạo dự án Supabase](#bước-1-tạo-dự-án-supabase)
  - [Bước 2: Chạy schema SQL](#bước-2-chạy-schema-sql)
  - [Bước 3: Tạo VAPID Keys](#bước-3-tạo-vapid-keys-cho-web-push)
  - [Bước 4: Cấu hình Telegram Bot (tùy chọn)](#bước-4-cấu-hình-telegram-bot-tùy-chọn)
  - [Bước 5: Triển khai lên Cloudflare Pages](#bước-5-triển-khai-lên-cloudflare-pages)
  - [Bước 6: Cài đặt biến môi trường](#bước-6-cài-đặt-biến-môi-trường)
  - [Bước 7: Cấu hình Cron Job](#bước-7-cấu-hình-cron-job-nhắc-nhở-hàng-ngày)
- [Phát triển cục bộ](#-phát-triển-cục-bộ)
- [Cấu trúc dự án](#-cấu-trúc-dự-án)
- [API Endpoints](#-api-endpoints)
- [Biến môi trường](#-biến-môi-trường)
- [Mô hình dữ liệu](#-mô-hình-dữ-liệu)
- [Cài đặt PWA](#-cài-đặt-pwa)
- [Khắc phục sự cố](#-khắc-phục-sự-cố)

---

## ✨ Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| 📊 Dashboard | Tổng quan trực quan với thống kê và biểu đồ |
| 🔔 Web Push | Thông báo đẩy qua trình duyệt (VAPID) |
| 📱 Telegram Bot | Gửi cảnh báo qua Telegram |
| 📅 Nhắc nhở thông minh | 1 tháng, 2 tuần, 1 tuần, 3 ngày, 1 ngày trước hạn |
| 🏢 Quản lý khách hàng | Nhóm dịch vụ theo khách hàng |
| 💰 Theo dõi chi phí | Phân tích chi phí theo loại dịch vụ |
| 📈 Lịch sử gia hạn | Ghi lại toàn bộ lịch sử gia hạn |
| 🔒 Xác thực 2 lớp | Email + xác nhận thiết bị mới |
| 📦 PWA | Cài đặt như ứng dụng native |
| 🌙 Dark mode | Giao diện sáng/tối |
| 📥 Import/Export | Xuất/nhập dữ liệu JSON |
| 🗑️ Thùng rác | Khôi phục dữ liệu đã xóa |
| 📦 Lưu trữ | Lưu trữ các dịch vụ cũ |
| 🔍 Tìm kiếm & Lọc | Tìm kiếm và lọc nhanh |

---

## 🏗️ Kiến trúc

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                      │
│                                                          │
│  ┌───────────────┐    ┌───────────────────────────────┐ │
│  │  Static Files │    │    Hono Worker (_worker.js)   │ │
│  │  index.html   │    │                               │ │
│  │  main.js      │◄──►│  /api/renewals               │ │
│  │  style.css    │    │  /api/settings                │ │
│  │  sw.js        │    │  /api/push                    │ │
│  │  manifest.json│    │  /api/notifications           │ │
│  └───────────────┘    │  /api/analytics               │ │
│                       │  /api/cron/check-renewals     │ │
│                       └──────────────┬────────────────┘ │
└──────────────────────────────────────┼──────────────────┘
                                       │ REST API
                              ┌────────▼────────┐
                              │    Supabase      │
                              │   PostgreSQL     │
                              │   (Singapore)    │
                              │                  │
                              │  - renewals      │
                              │  - settings      │
                              │  - push_subs     │
                              │  - notif_log     │
                              │  - audit_log     │
                              └──────────────────┘
                                       │
                          ┌────────────┼───────────────┐
                          ▼            ▼               ▼
                    Web Push       Telegram        Email
                   (Browser)        Bot            (SMTP)
```

**Stack:**
- **Frontend**: Vanilla JS, Tailwind CSS v4, Shoelace Components, Chart.js, Lucide Icons
- **Backend**: [Hono](https://hono.dev/) Framework trên Cloudflare Workers
- **Database**: Supabase PostgreSQL (Singapore - ap-southeast-1)
- **Auth**: Supabase Auth (Email + JWT)
- **Notifications**: Web Push API (VAPID) + Telegram Bot API
- **Deploy**: Cloudflare Pages (Free tier — $0/tháng)

---

## 📋 Yêu cầu

- Node.js ≥ 18
- npm ≥ 9
- Git
- Tài khoản [Cloudflare](https://dash.cloudflare.com/) (free)
- Tài khoản [Supabase](https://supabase.com/) (free tier)
- Tài khoản GitHub (để deploy)

---

## 🚀 Hướng dẫn triển khai

### Bước 1: Tạo dự án Supabase

1. Truy cập [app.supabase.com](https://app.supabase.com) → **New Project**
2. Điền thông tin:
   - **Name**: `renewal-reminder` (hoặc tùy ý)
   - **Database Password**: Đặt mật khẩu mạnh (**lưu lại**)
   - **Region**: **Southeast Asia (Singapore)** — để độ trễ thấp
3. Chờ ~2 phút để Supabase khởi tạo
4. Sau khi xong, vào **Settings → API** → lấy:
   - `Project URL` → dùng làm `SUPABASE_URL` và `VITE_SUPABASE_URL`
   - `anon public` key → dùng làm `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → dùng làm `SUPABASE_SERVICE_KEY` (**giữ bí mật!**)

### Bước 2: Chạy schema SQL

1. Trong Supabase Dashboard → **SQL Editor** → **New Query**
2. Copy toàn bộ nội dung file [`supabase/schema.sql`](supabase/schema.sql) và paste vào
3. Click **Run** (hoặc Ctrl+Enter)
4. Xác nhận không có lỗi — tất cả bảng được tạo thành công

> **Lưu ý**: Schema tạo 7 bảng: `renewals`, `renewal_history`, `push_subscriptions`, `notification_log`, `settings`, `audit_log`, `login_logs`

### Bước 3: Tạo VAPID Keys (cho Web Push)

Chạy lệnh sau trên máy local:

```bash
npx web-push generate-vapid-keys
```

Kết quả sẽ hiện ra:
```
=======================================
Public Key:
BNxxxxxxxx...xxxxxx  ← VITE_VAPID_PUBLIC_KEY
                                       
Private Key:
xxxxxxxxxx...xxxxxx  ← VAPID_PRIVATE_KEY
=======================================
```

> **Quan trọng**: Lưu cả 2 keys. Private key chỉ hiển thị 1 lần!

### Bước 4: Cấu hình Telegram Bot (tùy chọn)

Nếu muốn nhận thông báo qua Telegram:

1. Mở Telegram → tìm **@BotFather** → `/newbot`
2. Đặt tên và username cho bot → nhận `Bot Token`
3. Gửi 1 tin nhắn cho bot của bạn
4. Lấy `Chat ID`:
   ```
   https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
   ```
   Tìm `"chat":{"id":XXXXXXX}` trong kết quả

> Bạn có thể bật/tắt Telegram trong Settings của ứng dụng sau khi deploy.

### Bước 5: Triển khai lên Cloudflare Pages

#### Option A: Deploy qua GitHub (Khuyến nghị)

1. **Fork hoặc push code lên GitHub**:
   ```bash
   git clone https://github.com/yourusername/renewal-reminder.git
   cd renewal-reminder
   git push origin main
   ```

2. **Vào Cloudflare Dashboard**:
   - [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create**
   - Chọn **Pages** → **Connect to Git**
   - Kết nối GitHub → chọn repository

3. **Cấu hình build**:
   | Setting | Value |
   |---------|-------|
   | Framework preset | None |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | `/` |
   | Node version | `18` |

4. Click **Save and Deploy** → chờ build hoàn tất (~2 phút)

#### Option B: Deploy bằng Wrangler CLI

```bash
# Cài đặt Wrangler
npm install -g wrangler

# Đăng nhập Cloudflare
npx wrangler login

# Build và deploy
npm run build
npx wrangler pages deploy dist --project-name renewal-reminder
```

### Bước 6: Cài đặt biến môi trường

Vào **Cloudflare Dashboard → Pages → renewal-reminder → Settings → Environment Variables**

#### Biến bắt buộc (Production & Preview):

| Variable | Value | Mô tả |
|----------|-------|-------|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Supabase Anon Key (public) |
| `SUPABASE_URL` | `https://xxx.supabase.co` | Supabase URL (backend) |
| `SUPABASE_SERVICE_KEY` | `eyJ...` | Supabase Service Role Key (**bí mật**) |
| `VITE_VAPID_PUBLIC_KEY` | `BNx...` | VAPID Public Key |
| `VAPID_PRIVATE_KEY` | `xxx...` | VAPID Private Key (**bí mật**) |
| `VAPID_SUBJECT` | `mailto:you@email.com` | Email liên hệ |
| `APP_URL` | `https://renewal-reminder.pages.dev` | URL ứng dụng (thay bằng domain thực) |

#### Biến tùy chọn:

| Variable | Value | Mô tả |
|----------|-------|-------|
| `CRON_SECRET` | Chuỗi ngẫu nhiên | Bảo vệ endpoint cron |
| `RESEND_API_KEY` | `re_xxx` | Resend API Key (email) |
| `SMTP_USER` | `gmail@gmail.com` | Gmail SMTP (thay thế Resend) |
| `SMTP_PASS` | App Password | Gmail App Password |

> **Cách set nhanh bằng CLI**:
> ```bash
> npx wrangler pages secret put SUPABASE_SERVICE_KEY --project-name renewal-reminder
> npx wrangler pages secret put VAPID_PRIVATE_KEY --project-name renewal-reminder
> ```

Sau khi set biến → **Redeploy** ứng dụng để áp dụng.

### Bước 7: Cấu hình Cron Job (nhắc nhở hàng ngày)

Endpoint kiểm tra gia hạn: `GET /api/cron/check-renewals`

Cloudflare Pages **không có Cron Trigger tích hợp** (chỉ có trong Workers), nên cần dùng giải pháp bên ngoài:

#### Option A: Cloudflare Workers Cron (Khuyến nghị)

Tạo file `worker-cron.js` và deploy như một Worker riêng:

```javascript
export default {
  async scheduled(event, env, ctx) {
    const APP_URL = env.APP_URL || 'https://renewal-reminder.pages.dev'
    const CRON_SECRET = env.CRON_SECRET || ''
    
    const res = await fetch(`${APP_URL}/api/cron/check-renewals`, {
      headers: { 'Authorization': `Bearer ${CRON_SECRET}` }
    })
    
    const result = await res.json()
    console.log('Cron result:', JSON.stringify(result))
  },
  
  async fetch(request, env, ctx) {
    return new Response('Cron Worker Active')
  }
}
```

Deploy và cấu hình cron:
```bash
npx wrangler deploy worker-cron.js --name renewal-cron
# Thêm trong wrangler.toml của Worker:
# [triggers]
# crons = ["0 1 * * *"]  # 8:00 AM UTC+7 (01:00 UTC)
```

#### Option B: Dịch vụ cron miễn phí

- **[cron-job.org](https://cron-job.org)** — Miễn phí, cron theo phút
- **[EasyCron](https://www.easycron.com/)** — Miễn phí 200 jobs
- **GitHub Actions** (xem bên dưới)

#### Option C: GitHub Actions (0 chi phí)

Tạo file `.github/workflows/cron.yml`:

```yaml
name: Daily Renewal Check
on:
  schedule:
    - cron: '0 1 * * *'  # 8:00 AM UTC+7
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger renewal check
        run: |
          curl -X GET \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "${{ secrets.APP_URL }}/api/cron/check-renewals"
```

Thêm secrets trong GitHub repo: `Settings → Secrets → Actions`:
- `APP_URL`: URL ứng dụng Cloudflare Pages
- `CRON_SECRET`: Chuỗi bí mật cron

---

## 💻 Phát triển cục bộ

### Cài đặt

```bash
# Clone repo
git clone https://github.com/yourusername/renewal-reminder.git
cd renewal-reminder

# Cài đặt dependencies
npm install

# Copy file biến môi trường
cp .dev.vars.example .dev.vars
```

### Cấu hình `.dev.vars`

Mở file `.dev.vars` và điền thông tin thực:

```env
# Supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY

# VAPID (Web Push)
VITE_VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY
VAPID_PRIVATE_KEY=YOUR_PRIVATE_KEY
VAPID_SUBJECT=mailto:you@example.com

# App
APP_URL=http://localhost:3000
CRON_SECRET=your-secret-here
```

### Chạy development server

```bash
# Build và chạy
npm run build
npm run dev:sandbox  # hoặc: wrangler pages dev dist --ip 0.0.0.0 --port 3000
```

Mở trình duyệt: [http://localhost:3000](http://localhost:3000)

### Scripts có sẵn

| Script | Mô tả |
|--------|-------|
| `npm run build` | Build production |
| `npm run dev:sandbox` | Chạy dev server (wrangler) |
| `npm run deploy` | Build + deploy lên Cloudflare Pages |
| `npm run preview` | Preview build cục bộ |

---

## 📁 Cấu trúc dự án

```
renewal-reminder/
├── src/
│   ├── index.ts              # Main Hono application (tất cả API routes)
│   └── ...                   # (index.tsx, renderer.tsx — legacy)
├── public/
│   ├── index.html            # SPA entry point
│   ├── sw.js                 # Service Worker (PWA + Push)
│   ├── manifest.json         # PWA Manifest
│   ├── favicon.png           # Favicon
│   ├── icons/
│   │   ├── icon-192.png      # PWA icon 192x192
│   │   └── icon-512.png      # PWA icon 512x512
│   └── static/
│       ├── main.js           # Frontend SPA JavaScript
│       └── style.css         # Custom CSS styles
├── supabase/
│   └── schema.sql            # Database schema (chạy 1 lần)
├── scripts/
│   ├── prebuild.js           # Pre-build hook
│   └── postbuild.js          # Post-build: copy assets + _routes.json
├── .dev.vars.example         # Template biến môi trường local
├── .dev.vars                 # Biến môi trường local (KHÔNG commit)
├── .gitignore
├── ecosystem.config.cjs      # PM2 config (dev sandbox)
├── package.json
├── tsconfig.json
├── vite.config.ts            # Vite + @hono/vite-cloudflare-pages
├── wrangler.jsonc            # Cloudflare Workers config
└── README.md
```

---

## 🔌 API Endpoints

Tất cả endpoints yêu cầu `Authorization: Bearer <JWT>` trừ các endpoints được ghi chú.

### Health & Config

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/health` | ❌ | Kiểm tra trạng thái API |
| GET | `/api/config` | ❌ | Lấy config public (Supabase URL, VAPID key) |

### Renewals

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/renewals` | ✅ | Danh sách dịch vụ (query: `?trash=true`, `?archived=true`) |
| GET | `/api/renewals?id=UUID` | ✅ | Chi tiết 1 dịch vụ |
| POST | `/api/renewals` | ✅ | Thêm dịch vụ mới |
| PUT | `/api/renewals/:id` | ✅ | Cập nhật dịch vụ |
| DELETE | `/api/renewals/:id` | ✅ | Xóa mềm (vào thùng rác) |
| POST | `/api/renewals/:id/restore` | ✅ | Khôi phục từ thùng rác |
| POST | `/api/renewals/:id/archive` | ✅ | Lưu trữ dịch vụ |
| POST | `/api/renewals/:id/renew` | ✅ | Ghi nhận gia hạn |

### Renewal History

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/renewal-history?renewal_id=UUID` | ✅ | Lịch sử gia hạn |

### Analytics

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/analytics/summary` | ✅ | Tổng quan thống kê |
| GET | `/api/analytics/cost?view=month&year=2024&month=3` | ✅ | Chi phí theo tháng/năm/khách hàng |

### Notifications

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/notifications` | ✅ | Danh sách thông báo chưa đọc |
| PUT | `/api/notifications/:id/read` | ✅ | Đánh dấu đã đọc |
| PUT | `/api/notifications/read-all` | ✅ | Đọc tất cả |

### Push Subscriptions

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| POST | `/api/push/subscribe` | ❌ | Đăng ký Web Push |
| DELETE | `/api/push/unsubscribe` | ❌ | Hủy đăng ký |
| POST | `/api/push/test` | ✅ | Gửi thông báo test |

### Settings

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/settings` | ✅ | Lấy tất cả settings |
| PUT | `/api/settings` | ✅ | Cập nhật setting |

### Authentication

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| POST | `/api/auth/change-email` | ✅ | Đổi email |
| POST | `/api/auth/change-password` | ✅ | Đổi mật khẩu |
| POST | `/api/auth/login-log` | ❌ | Ghi log đăng nhập |
| GET | `/api/auth/login-log` | ✅ | Lịch sử đăng nhập |

### Cron

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/cron/check-renewals` | Bearer CRON_SECRET | Kiểm tra và gửi thông báo |

---

## 🔐 Biến môi trường

Xem file [`.dev.vars.example`](.dev.vars.example) để biết đầy đủ các biến:

```env
# ─── Supabase ────────────────────────────────────────────────
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Backend (service role — không expose ra client)
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ─── Web Push (VAPID) ─────────────────────────────────────────
VITE_VAPID_PUBLIC_KEY=BNxxx...
VAPID_PRIVATE_KEY=xxx...
VAPID_SUBJECT=mailto:your@email.com

# ─── App ──────────────────────────────────────────────────────
APP_URL=https://renewal-reminder.pages.dev
CRON_SECRET=change-this-to-random-string

# ─── Email (tùy chọn) ─────────────────────────────────────────
RESEND_API_KEY=re_xxx          # Ưu tiên dùng Resend
SMTP_USER=your@gmail.com       # Hoặc Gmail SMTP
SMTP_PASS=your-app-password
```

---

## 🗄️ Mô hình dữ liệu

### Bảng `renewals` (Chính)

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `id` | UUID | Primary key (tự động) |
| `name` | TEXT | Tên dịch vụ (VD: "example.com") |
| `type` | TEXT | Loại: `domain`, `hosting`, `ssl`, `email`, `storage`, `other` |
| `customer` | TEXT | Tên khách hàng |
| `provider` | TEXT | Nhà cung cấp (VD: "Namecheap") |
| `expiry_date` | DATE | **Ngày hết hạn** |
| `cost` | BIGINT | Chi phí (VNĐ) |
| `renewal_period` | INTEGER | Chu kỳ gia hạn (tháng) |
| `purchase_date` | DATE | Ngày mua |
| `notes` | TEXT | Ghi chú |
| `registration_email` | TEXT | Email đăng ký |
| `is_active` | BOOLEAN | Đang hoạt động |
| `deleted_at` | TIMESTAMP | Ngày xóa (soft delete) |
| `archived_at` | TIMESTAMP | Ngày lưu trữ |

### Levels cảnh báo

| Level | Điều kiện | Màu |
|-------|-----------|-----|
| `overdue` | Đã quá hạn | 🔴 Đỏ |
| `1day` | Còn ≤ 1 ngày | 🟠 Cam đậm |
| `3days` | Còn ≤ 3 ngày | 🟡 Vàng đậm |
| `1week` | Còn ≤ 7 ngày | 🟡 Vàng |
| `2weeks` | Còn ≤ 14 ngày | 🟢 Xanh nhạt |
| `1month` | Còn ≤ 30 ngày | 🔵 Xanh dương |
| `safe` | Còn > 30 ngày | ✅ An toàn |

---

## 📱 Cài đặt PWA

### Android (Chrome)
1. Mở ứng dụng trong Chrome
2. Menu (⋮) → **Thêm vào màn hình chính**
3. Xác nhận → icon xuất hiện trên màn hình

### iOS (Safari)
1. Mở ứng dụng trong Safari
2. Nút **Share** (⬆) → **Thêm vào màn hình chính**
3. Nhấn **Thêm**

> **iOS 16.4+** mới hỗ trợ Web Push Notifications khi dùng Safari.

---

## 🔧 Khắc phục sự cố

### ❌ Lỗi "Cannot read properties of undefined (reading 'call')"

**Nguyên nhân**: Hono routing conflict với `@hono/vite-cloudflare-pages`.  
**Giải pháp**: Project này dùng `@hono/vite-build` thay thế. Đảm bảo `vite.config.ts` đúng:
```typescript
import { defineConfig } from 'vite'
import pages from '@hono/vite-cloudflare-pages'

export default defineConfig({
  plugins: [pages({ entry: './src/index.ts' })]
})
```

### ❌ API trả về 401 Unauthorized

**Nguyên nhân**: JWT token hết hạn hoặc thiếu.  
**Giải pháp**: 
- Đăng xuất và đăng nhập lại
- Kiểm tra `SUPABASE_SERVICE_KEY` đã được set đúng

### ❌ Web Push không hoạt động

**Kiểm tra**:
1. `VITE_VAPID_PUBLIC_KEY` và `VAPID_PRIVATE_KEY` đã set chưa?
2. VAPID_SUBJECT có đúng format `mailto:xxx` không?
3. Trình duyệt có cho phép notification không?
4. HTTPS phải được bật (Cloudflare Pages tự động có HTTPS)

### ❌ Telegram không gửi được

**Kiểm tra**:
1. Vào Settings trong ứng dụng → kiểm tra Telegram config
2. Bot Token đúng format: `1234567890:ABCdef...`
3. Chat ID là số nguyên (không có dấu -)
4. Đã gửi ít nhất 1 tin cho bot chưa?

### ❌ Build lỗi "Cannot resolve module"

```bash
# Xóa cache và cài lại
rm -rf node_modules dist .wrangler
npm install
npm run build
```

### ❌ Cron không chạy tự động

Cloudflare Pages không có Cron Trigger. Cần dùng:
- [GitHub Actions](#option-c-github-actions-0-chi-phí) (miễn phí)
- [cron-job.org](https://cron-job.org) (miễn phí)
- Cloudflare Workers riêng với cron trigger

---

## 💰 Chi phí

| Dịch vụ | Free Tier | Chi phí |
|---------|-----------|---------|
| Cloudflare Pages | 500 builds/tháng, Unlimited requests | **$0** |
| Supabase | 500MB DB, 50K MAU, 5GB bandwidth | **$0** |
| Web Push | Unlimited | **$0** |
| Telegram Bot | Unlimited | **$0** |
| GitHub Actions | 2000 min/tháng | **$0** |
| **Tổng** | | **$0/tháng** |

---

## 📄 License

[MIT License](LICENSE) — Tự do sử dụng, chỉnh sửa và phân phối.

---

## 🤝 Đóng góp

1. Fork repository
2. Tạo branch mới: `git checkout -b feature/ten-tinh-nang`
3. Commit: `git commit -m 'Add: mô tả tính năng'`
4. Push: `git push origin feature/ten-tinh-nang`
5. Tạo Pull Request

---

*Được xây dựng với ❤️ — Cloudflare Pages + Supabase + Hono*
