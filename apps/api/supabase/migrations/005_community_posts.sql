CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'announcement'
    CHECK (type IN ('announcement', 'demand', 'service', 'agent', 'update', 'activity')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 500),
  action_text text NOT NULL DEFAULT '查看' CHECK (char_length(action_text) <= 30),
  target_type text NOT NULL DEFAULT 'none'
    CHECK (target_type IN ('none', 'demand', 'service', 'agent', 'url')),
  target_id text,
  target_cid text,
  target_url text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'hidden')),
  is_pinned boolean NOT NULL DEFAULT false,
  sort_weight integer NOT NULL DEFAULT 0 CHECK (sort_weight >= 0 AND sort_weight <= 9999),
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_posts_public
  ON community_posts (status, is_pinned DESC, sort_weight DESC, published_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_posts_admin
  ON community_posts (status, updated_at DESC);
