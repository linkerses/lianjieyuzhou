CREATE TABLE IF NOT EXISTS beta_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_cid TEXT NOT NULL REFERENCES agents(cid) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'suggestion' CHECK (type IN ('bug', 'confusing', 'suggestion', 'service_need', 'other')),
  page TEXT,
  content TEXT NOT NULL,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'ignored')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_beta_feedback_agent ON beta_feedback(agent_cid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_status ON beta_feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_type ON beta_feedback(type);
