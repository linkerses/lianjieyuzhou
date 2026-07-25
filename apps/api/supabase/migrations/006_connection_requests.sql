CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS connection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_cid text NOT NULL REFERENCES agents(cid) ON DELETE CASCADE,
  target_cid text NOT NULL REFERENCES agents(cid) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 500),
  source_type text NOT NULL DEFAULT 'agent'
    CHECK (source_type IN ('agent', 'demand', 'service', 'match', 'manual')),
  source_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'ignored', 'closed')),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_cid <> target_cid)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connection_requests_open_pair
  ON connection_requests (requester_cid, target_cid)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_connection_requests_target
  ON connection_requests (target_cid, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connection_requests_requester
  ON connection_requests (requester_cid, status, created_at DESC);
