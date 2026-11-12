export const MIGRATION_007_OFFLINE_SYNC = `
  CREATE TABLE IF NOT EXISTS sync_outbox (
    client_op_id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    op_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    depends_on_entity_id TEXT,
    sequence_no INTEGER NOT NULL,
    base_version INTEGER,
    payload_json TEXT NOT NULL,
    local_snapshot_json TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at_ms INTEGER NOT NULL DEFAULT 0,
    conflict_kind TEXT,
    conflict_message TEXT,
    server_version INTEGER,
    server_snapshot_json TEXT,
    warnings_json TEXT,
    occurred_at TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sync_outbox_shop_status_seq
    ON sync_outbox(shop_id, status, sequence_no ASC);

  CREATE INDEX IF NOT EXISTS idx_sync_outbox_entity
    ON sync_outbox(shop_id, entity_type, entity_id);

  CREATE TABLE IF NOT EXISTS sync_state (
    shop_id TEXT PRIMARY KEY,
    last_sync_seq INTEGER NOT NULL DEFAULT 0,
    last_synced_at TEXT,
    device_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_entity_flags (
    shop_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    pending_count INTEGER NOT NULL DEFAULT 0,
    has_conflict INTEGER NOT NULL DEFAULT 0,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (shop_id, entity_type, entity_id)
  );
`;
