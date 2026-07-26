CREATE TABLE IF NOT EXISTS connection_read_states (
  request_id uuid NOT NULL REFERENCES connection_requests(id) ON DELETE CASCADE,
  reader_cid text NOT NULL REFERENCES agents(cid) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, reader_cid)
);

CREATE INDEX IF NOT EXISTS idx_connection_read_states_reader
  ON connection_read_states (reader_cid, updated_at DESC);
