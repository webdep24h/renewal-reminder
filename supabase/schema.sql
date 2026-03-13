-- ============================================
-- Renewal Reminder App — Database Schema (Full)
-- Supabase PostgreSQL (Singapore)
-- ============================================

-- 1. renewals — main table
CREATE TABLE IF NOT EXISTS renewals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'domain',
    customer TEXT,
    provider TEXT,
    expiry_date DATE NOT NULL,
    cost INTEGER DEFAULT 0,
    renewal_period INTEGER DEFAULT 12,
    purchase_date DATE,
    notes TEXT,
    registration_email TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    archived_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renewals_expiry ON renewals(expiry_date) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_renewals_type ON renewals(type) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_renewals_customer ON renewals(customer) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_renewals_deleted ON renewals(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_renewals_archived ON renewals(archived_at) WHERE archived_at IS NOT NULL;

-- 2. renewal_history
CREATE TABLE IF NOT EXISTS renewal_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    renewal_id UUID NOT NULL REFERENCES renewals(id) ON DELETE CASCADE,
    renewed_date DATE NOT NULL,
    old_expiry DATE NOT NULL,
    new_expiry DATE NOT NULL,
    cost INTEGER DEFAULT 0,
    period_months INTEGER DEFAULT 12,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_renewal ON renewal_history(renewal_id);
CREATE INDEX IF NOT EXISTS idx_history_date ON renewal_history(renewed_date);

-- 3. push_subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint TEXT NOT NULL UNIQUE,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. notification_log
CREATE TABLE IF NOT EXISTS notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    renewal_id UUID NOT NULL REFERENCES renewals(id) ON DELETE CASCADE,
    channel TEXT NOT NULL DEFAULT 'webpush',
    level TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_renewal_level ON notification_log(renewal_id, level);
CREATE INDEX IF NOT EXISTS idx_notification_log_is_read ON notification_log(is_read) WHERE is_read = false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_unique ON notification_log(renewal_id, channel, level)
    WHERE level != 'overdue';

-- 5. settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. audit_log
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    renewal_id UUID NOT NULL REFERENCES renewals(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    changes JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_renewal ON audit_log(renewal_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(created_at DESC);

-- 7. login_logs
CREATE TABLE IF NOT EXISTS login_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    ip_address TEXT,
    user_agent TEXT,
    device_info TEXT,
    is_new_device BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_logs_email ON login_logs(email);
CREATE INDEX IF NOT EXISTS idx_login_logs_created ON login_logs(created_at DESC);

-- ============================================
-- Auto-update updated_at trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_renewals_updated_at
    BEFORE UPDATE ON renewals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS — push_subscriptions
-- ============================================
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow insert push subscriptions"
    ON push_subscriptions FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow delete push subscriptions"
    ON push_subscriptions FOR DELETE TO anon USING (true);

CREATE POLICY "Service role full access push subscriptions"
    ON push_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- Seed data
-- ============================================
INSERT INTO settings (key, value) VALUES
    ('telegram', '{"enabled": false, "bot_token": "", "chat_id": ""}'),
    ('webpush', '{"enabled": true}'),
    ('reminder_time', '{"hour": 8, "minute": 0}'),
    ('service_types', '["domain", "hosting", "ssl", "email", "storage", "other"]')
ON CONFLICT (key) DO NOTHING;
