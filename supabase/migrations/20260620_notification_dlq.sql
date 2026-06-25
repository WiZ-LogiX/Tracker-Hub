-- notification_dlq: Dead-letter queue for notifications that failed after all retries.
-- Created as part of notification reliability improvements.
-- Append-only: rows are never updated except to set replayed_at.

CREATE TABLE IF NOT EXISTS notification_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  reference TEXT,
  event TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  replayed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_dlq_tenant ON notification_dlq(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_dlq_entity ON notification_dlq(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notification_dlq_created ON notification_dlq(created_at);

-- RLS policies
ALTER TABLE notification_dlq ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON notification_dlq
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY "service_role_all" ON notification_dlq
  FOR ALL
  USING (current_setting('role') = 'service_role');
