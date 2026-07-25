import { z } from 'zod';

// ── Agent ──

export const CreateAgentSchema = z.object({
  nickname: z.string().min(1).max(50),
  wechat_openid: z.string().optional(),
  life_stage_tags: z.array(z.string()).max(3).default([]),
  trust_threshold: z.enum(['conservative', 'medium', 'open']).default('medium'),
});

export const UpdateAgentSchema = z.object({
  nickname: z.string().min(1).max(50).optional(),
  life_stage_tags: z.array(z.string()).max(3).optional(),
  trust_threshold: z.enum(['conservative', 'medium', 'open']).optional(),
  energy_status: z.enum(['输出期', '输入期', '调整期', 'unknown']).optional(),
  agent_config: z.record(z.any()).optional(),
});

export const AdminUpdateAgentSchema = z.object({
  nickname: z.string().min(1).max(50).optional(),
  life_stage_tags: z.array(z.string()).max(3).optional(),
  trust_score: z.number().min(0).max(5).optional(),
  energy_status: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
  value_profile: z.object({
    core_value: z.string().max(500).optional(),
    service_capabilities: z.string().max(800).optional(),
    project_experience: z.string().max(1000).optional(),
    vision_needs: z.string().max(800).optional(),
  }).optional(),
  basic_profile: z.object({
    province: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    gender: z.string().max(20).optional(),
    bio: z.string().max(500).optional(),
  }).optional(),
  avatar_url: z.string().max(1000).optional(),
  agent_config: z.record(z.any()).optional(),
});

// ── Agent Profile ──

export const UpsertProfileSchema = z.object({
  layer: z.enum(['identity', 'capability', 'need', 'relationship', 'transaction']),
  data: z.record(z.any()),
  visibility: z.enum(['public', 'connectors_only', 'private']).default('public'),
});

// ── 授权 ──

export const CreateAuthSchema = z.object({
  grantee_cid: z.string().min(1),
  auth_scope: z.enum(['read', 'write', 'forward']),
  data_fields: z.array(z.string()).min(1),
  duration: z.enum(['once', '24h', '7d', 'permanent']).default('once'),
});

// ── 服务 ──

export const CreateServiceSchema = z.object({
  name: z.string().min(1).max(100),
  primary_system: z.enum(['health', 'living', 'connection', 'growth', 'wealth', 'create', 'explore', 'spirit', 'future']),
  secondary_system: z.enum(['health', 'living', 'connection', 'growth', 'wealth', 'create', 'explore', 'spirit', 'future']).nullable().optional(),
  suitable_stages: z.array(z.string()).default([]),
  description: z.string().max(4000).default(''),
  price: z.number().positive(),
  duration_minutes: z.number().int().positive().optional(),
  delivery_method: z.enum(['online', 'offline', 'hybrid']).default('offline'),
  location: z.string().max(200).optional(),
});

export const UpdateServiceSchema = CreateServiceSchema.extend({
  status: z.enum(['pending', 'active', 'paused', 'archived']).optional(),
}).partial();

// ── 交易 ──

export const CreateTransactionSchema = z.object({
  service_id: z.string().uuid(),
  seller_cid: z.string().min(1),
  scheduled_at: z.string().datetime({ offset: true }).optional(),
  booking_note: z.string().max(1000).optional(),
});

export const FeedbackSchema = z.object({
  actual_score: z.number().min(0).max(5).multipleOf(0.5),
  buyer_note: z.string().max(2000).default(''),
  seller_note: z.string().max(2000).optional(),
});

export const BetaFeedbackSchema = z.object({
  type: z.enum(['bug', 'confusing', 'suggestion', 'service_need', 'other']).default('suggestion'),
  page: z.string().max(100).optional(),
  content: z.string().min(5).max(1000),
  contact: z.string().max(100).optional(),
});

// ── 社区动态 ──

export const CreateCommunityPostSchema = z.object({
  type: z.enum(['announcement', 'demand', 'service', 'agent', 'update', 'activity']).default('announcement'),
  title: z.string().min(1).max(120),
  summary: z.string().max(500).default(''),
  action_text: z.string().max(30).default('查看'),
  target_type: z.enum(['none', 'demand', 'service', 'agent', 'url']).default('none'),
  target_id: z.string().max(120).optional().nullable(),
  target_cid: z.string().max(120).optional().nullable(),
  target_url: z.string().max(1000).optional().nullable(),
  status: z.enum(['active', 'hidden']).default('active'),
  is_pinned: z.boolean().default(false),
  sort_weight: z.number().int().min(0).max(9999).default(0),
  published_at: z.string().datetime({ offset: true }).optional().nullable(),
});

export const UpdateCommunityPostSchema = CreateCommunityPostSchema.partial();

// ── 预演 ──

export const PreEnactScoreSchema = z.object({
  agent_cid: z.string().min(1),
  service_id: z.string().uuid(),
});

export const PreEnactRecommendSchema = z.object({
  agent_cid: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(5),
});

// ── 技能 ──

export const AnalyzeMatchSchema = z.object({
  target_cid: z.string().min(1),
});

export const CreateConnectionSchema = z.object({
  target_cid: z.string().min(1),
});

export const UpdateSkillSchema = z.object({
  skill: z.enum([
    'state_scan', 'growth_path', 'spirit_charge',
    'space_diagnosis', 'relation_heat', 'asset_board',
    'creation_catalyze', 'explore_trigger', 'future_predict'
  ]),
  status: z.enum(['active', 'inactive']),
});

// ── 系统类型 ──

export const SYSTEM_LABELS: Record<string, string> = {
  health: '🫀 健康',
  living: '🏠 生活',
  connection: '🤝 连接',
  growth: '📚 成长',
  wealth: '💰 财富',
  create: '✨ 创造',
  explore: '🌍 探索',
  spirit: '🧘 精神',
  future: '🔮 未来',
};

export const SYSTEM_LAYER: Record<string, string> = {
  health: '生存基底',
  living: '生存基底',
  connection: '生存基底',
  growth: '成长创造',
  wealth: '成长创造',
  create: '成长创造',
  explore: '意义超越',
  spirit: '意义超越',
  future: '意义超越',
};
