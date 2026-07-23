-- ============================================================
-- 联结宇宙 · 数据库初始迁移
-- 版本：V0.2
-- 说明：核心5张表 + RLS行级安全策略 + 索引
-- ============================================================

-- -------------------------- 1. Agents 表 --------------------------

CREATE TABLE agents (
  cid TEXT PRIMARY KEY,                          -- 联结者ID: UC-M-0001
  nickname TEXT NOT NULL,                        -- 昵称/品牌名
  wechat_openid TEXT UNIQUE,                     -- 微信openid（关联登录）
  life_stage_tags TEXT[] DEFAULT '{}',           -- 生命阶段标签, 如 {'财富💰','创造✨'}
  trust_score DECIMAL(3,2) DEFAULT 0,            -- 综合信任评分 (0-5)
  trust_threshold TEXT DEFAULT 'medium',          -- 信任阈值: conservative/medium/open
  energy_status TEXT DEFAULT 'unknown',           -- 能量状态: 输出期/输入期/调整期/unknown
  skill_status JSONB DEFAULT '{
    "state_scan": "active",
    "growth_path": "active",
    "spirit_charge": "active",
    "space_diagnosis": "inactive",
    "relation_heat": "inactive",
    "asset_board": "inactive",
    "creation_catalyze": "inactive",
    "explore_trigger": "inactive",
    "future_predict": "inactive"
  }',                                             -- 技能开关状态
  agent_config JSONB DEFAULT '{}',                -- Agent扩展配置
  status TEXT DEFAULT 'active',                    -- active/disabled/left
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent详细档案（5层人格构成）
CREATE TABLE agent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_cid TEXT NOT NULL REFERENCES agents(cid) ON DELETE CASCADE,
  layer TEXT NOT NULL CHECK (layer IN (
    'identity',      -- 基础身份层：公开档案
    'capability',    -- 能力与供给层：技能/服务/资源
    'need',          -- 需求层：当前需要什么
    'relationship',  -- 关系层：授权连接图谱
    'transaction'    -- 交易层：历史交易记录
  )),
  data JSONB NOT NULL DEFAULT '{}',
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'connectors_only', 'private')),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_cid, layer)
);

-- -------------------------- 2. 授权记录表 --------------------------

CREATE TABLE auth_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  granter_cid TEXT NOT NULL REFERENCES agents(cid),   -- 授权方
  grantee_cid TEXT NOT NULL REFERENCES agents(cid),   -- 被授权方
  auth_scope TEXT NOT NULL CHECK (auth_scope IN ('read', 'write', 'forward')),
  data_fields TEXT[] NOT NULL DEFAULT '{}',            -- 授权字段列表
  duration TEXT NOT NULL DEFAULT 'once' CHECK (duration IN ('once', '24h', '7d', 'permanent')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  -- 每人不能被同一个人重复授权同一范围
  UNIQUE(granter_cid, grantee_cid, auth_scope, data_fields)
);

-- -------------------------- 3. 服务库表 --------------------------

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_cid TEXT NOT NULL REFERENCES agents(cid),    -- 服务提供方
  name TEXT NOT NULL,                                    -- 服务名称
  primary_system TEXT NOT NULL CHECK (primary_system IN (
    'health', 'living', 'connection', 'growth', 'wealth', 'create', 'explore', 'spirit', 'future'
  )),
  secondary_system TEXT CHECK (secondary_system IN (
    'health', 'living', 'connection', 'growth', 'wealth', 'create', 'explore', 'spirit', 'future', NULL
  )),
  suitable_stages TEXT[] DEFAULT '{}',                   -- 适合的生命阶段
  description TEXT,                                       -- 服务描述
  price DECIMAL(10,2) NOT NULL,                          -- 价格（元）
  duration_minutes INT,                                   -- 预计时长
  delivery_method TEXT DEFAULT 'offline' CHECK (delivery_method IN ('online', 'offline', 'hybrid')),
  location TEXT,                                          -- 线下地址（如适用）
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'archived')),
  trust_score DECIMAL(3,2) DEFAULT 0,                     -- 服务方信任评分
  delivery_count INT DEFAULT 0,                            -- 累计交付次数
  avg_rating DECIMAL(3,2) DEFAULT 0,                       -- 平均评分
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------- 4. 交易记录表 --------------------------

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_cid TEXT NOT NULL REFERENCES agents(cid),
  seller_cid TEXT NOT NULL REFERENCES agents(cid),
  service_id UUID NOT NULL REFERENCES services(id),
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',       -- 已预约，待服务
    'confirmed',     -- 服务中
    'completed',     -- 已完成（待评分）
    'rated',         -- 已评分（交易完结）
    'disputed',      -- 争议中
    'cancelled',     -- 已取消
    'refunded'       -- 已退款
  )),
  pre_score INT,                                        -- 预演评分 (0-100)
  actual_score DECIMAL(3,2),                            -- 实际满意度评分 (0-5)
  buyer_note TEXT,                                      -- 买方反馈
  seller_note TEXT,                                     -- 卖方反馈
  scheduled_at TIMESTAMPTZ,                             -- 预约时间
  completed_at TIMESTAMPTZ,                             -- 服务完成时间
  auto_release_at TIMESTAMPTZ,                          -- 自动确认释放时间
  wechat_pay_no TEXT,                                   -- 微信支付单号
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------- 5. 预演日志表 --------------------------

CREATE TABLE pre_enact_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_cid TEXT NOT NULL REFERENCES agents(cid),
  service_id UUID REFERENCES services(id),
  dimension_scores JSONB NOT NULL DEFAULT '{}',   -- 四维度评分详情
  total_score INT NOT NULL,                        -- 综合评分
  result_summary TEXT,                             -- 推演说明
  risk_notes TEXT[],                               -- 风险提示
  alternatives JSONB DEFAULT '[]',                 -- 替代建议
  actual_score DECIMAL(3,2),                      -- 实际评分（服务完成后回补）
  deviation AS (actual_score - total_score),       -- 偏差
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------- 索引 --------------------------

CREATE INDEX idx_agents_life_stage ON agents USING GIN(life_stage_tags);
CREATE INDEX idx_agents_wechat ON agents(wechat_openid);
CREATE INDEX idx_services_system ON services(primary_system, secondary_system);
CREATE INDEX idx_services_provider ON services(provider_cid);
CREATE INDEX idx_transactions_buyer ON transactions(buyer_cid);
CREATE INDEX idx_transactions_seller ON transactions(seller_cid);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_auth_records_granter ON auth_records(granter_cid);
CREATE INDEX idx_auth_records_grantee ON auth_records(grantee_cid);
CREATE INDEX idx_auth_records_status ON auth_records(status);
CREATE INDEX idx_pre_enact_agent ON pre_enact_logs(agent_cid);

-- -------------------------- 行级安全策略 (RLS) --------------------------

-- Agents表：联结者只能看到自己的Agent档案
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY agents_self ON agents
  FOR ALL
  USING (cid = current_setting('app.current_cid')::TEXT);

CREATE POLICY agents_public_read ON agents
  FOR SELECT
  USING (true);  -- 公开档案可读

-- Agent档案：按visibility控制
ALTER TABLE agent_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_profiles_self ON agent_profiles
  FOR ALL
  USING (agent_cid = current_setting('app.current_cid')::TEXT);

CREATE POLICY agent_profiles_public ON agent_profiles
  FOR SELECT
  USING (visibility = 'public');

-- 授权记录：只能看到与自己相关的
ALTER TABLE auth_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_records_involved ON auth_records
  FOR SELECT
  USING (granter_cid = current_setting('app.current_cid')::TEXT
      OR grantee_cid = current_setting('app.current_cid')::TEXT);

-- 服务库：公开可读
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY services_public_read ON services
  FOR SELECT
  USING (status = 'active');

CREATE POLICY services_provider ON services
  FOR ALL
  USING (provider_cid = current_setting('app.current_cid')::TEXT);

-- 交易记录：交易双方可见
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_involved ON transactions
  FOR ALL
  USING (buyer_cid = current_setting('app.current_cid')::TEXT
      OR seller_cid = current_setting('app.current_cid')::TEXT);

-- -------------------------- 辅助函数 --------------------------

-- 获取联结者的预演推荐列表
CREATE OR REPLACE FUNCTION get_recommendations(
  p_agent_cid TEXT,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  service_id UUID,
  service_name TEXT,
  provider_nickname TEXT,
  primary_system TEXT,
  price DECIMAL(10,2),
  pre_score INT,
  trust_score DECIMAL(3,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- V0.2: 简化版——按系统匹配+信任评分排序
  -- V1.0: 将替换为预演算法调用
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    a.nickname,
    s.primary_system,
    s.price,
    0::INT AS pre_score,         -- 预演评分由外部API计算
    s.trust_score
  FROM services s
  JOIN agents a ON a.cid = s.provider_cid
  WHERE s.status = 'active'
  ORDER BY s.trust_score DESC
  LIMIT p_limit;
END;
$$;

-- 更新信任评分（交易完成后自动触发）
CREATE OR REPLACE FUNCTION update_trust_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'rated' AND NEW.actual_score IS NOT NULL THEN
    -- 更新服务方的信任评分
    UPDATE agents
    SET trust_score = (
      SELECT COALESCE(AVG(actual_score), 0)
      FROM transactions
      WHERE seller_cid = NEW.seller_cid
        AND status = 'rated'
    )
    WHERE cid = NEW.seller_cid;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_trust_score
  AFTER UPDATE OF status ON transactions
  FOR EACH ROW
  WHEN (NEW.status = 'rated')
  EXECUTE FUNCTION update_trust_score();

-- -------------------------- 初始数据 --------------------------

-- 示例：妙手堂服务条目（上线后配置）
-- INSERT INTO services (provider_cid, name, primary_system, secondary_system,
--   suitable_stages, description, price, duration_minutes, delivery_method, location, status)
-- VALUES ('UC-B-0001', '全息疼痛调理（肩颈）', 'health', 'spirit',
--   ARRAY['survival_base'], '陈氏四代传承非遗铃医手法，针对肩颈疼痛的深度调理',
--   398, 75, 'offline', '东莞万江店', 'active');
