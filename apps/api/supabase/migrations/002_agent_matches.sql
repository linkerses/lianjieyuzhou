-- Agent 与 Agent 匹配报告历史

CREATE TABLE IF NOT EXISTS agent_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_cid TEXT NOT NULL REFERENCES agents(cid) ON DELETE CASCADE,
  target_cid TEXT NOT NULL REFERENCES agents(cid) ON DELETE CASCADE,
  total_score INT NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '{}',
  summary TEXT,
  opportunities TEXT[] NOT NULL DEFAULT '{}',
  risks TEXT[] NOT NULL DEFAULT '{}',
  next_actions TEXT[] NOT NULL DEFAULT '{}',
  report JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'generated' CHECK (status IN ('generated', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_matches_requester ON agent_matches(requester_cid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_matches_target ON agent_matches(target_cid, created_at DESC);
