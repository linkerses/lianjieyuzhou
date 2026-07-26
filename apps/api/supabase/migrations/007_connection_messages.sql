CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS connection_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES connection_requests(id) ON DELETE CASCADE,
  sender_cid text NOT NULL REFERENCES agents(cid) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connection_messages_request
  ON connection_messages (request_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_connection_messages_sender
  ON connection_messages (sender_cid, created_at DESC);
