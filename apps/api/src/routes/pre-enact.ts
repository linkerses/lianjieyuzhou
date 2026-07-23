import { Router, Request, Response } from 'express';
import { supabase, getCurrentCid } from '../lib/supabase';
import { PreEnactScoreSchema, PreEnactRecommendSchema, SYSTEM_LABELS, SYSTEM_LAYER } from '../lib/validation';

const router = Router();

// ── 服务预演算法 V1.0 核心引擎 ──
//
// 四维度评分规则（权重合计100%）：
//   系统共振匹配 35% — 服务与联结者的活跃系统是否匹配
//   阶段适配度   30% — 服务是否适合联结者当前生命阶段
//   历史一致性   20% — 联结者过去对同类服务的反应
//   信任可信度   15% — 联结者与服务方之间的信任关系

interface PreEnactInput {
  agentCid: string;
  serviceId: string;
}

interface DimensionScores {
  resonance: number;     // 系统共振匹配 0-100
  stage_fit: number;     // 阶段适配度 0-100
  history: number;       // 历史一致性 0-100
  trust: number;         // 信任可信度 0-100
}

// ── 单次预演评分 ──
router.post('/score', async (req: Request, res: Response) => {
  try {
    const body = PreEnactScoreSchema.parse(req.body);
    const result = await runPreEnact(body);

    // 记录预演日志
    await supabase.from('pre_enact_logs').insert({
      agent_cid: body.agent_cid,
      service_id: body.service_id,
      dimension_scores: result.dimensions,
      total_score: result.total_score,
      result_summary: result.summary,
      risk_notes: result.risks,
      alternatives: result.alternatives,
    });

    res.json({ data: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '预演评分失败' });
  }
});

// ── 为联结者生成推荐列表 ──
router.post('/recommend', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const body = PreEnactRecommendSchema.parse({ ...req.body, agent_cid: cid });
    const recommendations = await getRecommendations(body.agent_cid, body.limit);

    res.json({ data: recommendations });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '生成推荐失败' });
  }
});

// ── 手动指定联结者和服务进行预演（管理后台用） ──
router.post('/admin-score', async (req: Request, res: Response) => {
  try {
    const body = PreEnactScoreSchema.parse(req.body);
    const result = await runPreEnact(body);
    res.json({ data: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
//  预演算法核心逻辑
// ══════════════════════════════════════════════

async function runPreEnact(input: PreEnactInput) {
  const { agentCid, serviceId } = input;

  // 1. 获取联结者和服务的完整数据
  const [agentResult, serviceResult] = await Promise.all([
    supabase.from('agents').select('*').eq('cid', agentCid).single(),
    supabase
      .from('services')
      .select('*, agents!inner(nickname, trust_score as provider_trust)')
      .eq('id', serviceId)
      .single(),
  ]);

  const agent = agentResult.data;
  const service = serviceResult.data;

  if (!agent) throw new Error('联结者不存在');
  if (!service) throw new Error('服务不存在');

  // 2. 计算四维度评分
  const dimensions = await calculateDimensions(agent, service);

  // 3. 综合评分
  const weights = { resonance: 0.35, stage_fit: 0.30, history: 0.20, trust: 0.15 };
  const totalScore = Math.round(
    dimensions.resonance * weights.resonance +
    dimensions.stage_fit * weights.stage_fit +
    dimensions.history * weights.history +
    dimensions.trust * weights.trust
  );

  // 4. 生成推演说明
  const summary = generateSummary(agent, service, dimensions, totalScore);

  // 5. 风险提示
  const risks = generateRisks(agent, service, dimensions);

  // 6. 替代建议（暂为空，V1.0实现）
  const alternatives: any[] = [];

  return {
    total_score: totalScore,
    dimensions,
    summary,
    risks,
    alternatives,
    service_name: service.name,
    provider_nickname: (service as any).agents?.nickname,
  };
}

// ── 维度一：系统共振匹配 ──
async function calculateResonance(agent: any, service: any): Promise<number> {
  const agentTags: string[] = agent.life_stage_tags || [];
  const primary = service.primary_system;
  const secondary = service.secondary_system;

  if (agentTags.includes(primary)) {
    // 主系统匹配
    let score = 70;
    if (secondary && agentTags.includes(secondary)) {
      score += 15; // 共振加分
    }
    return score;
  }

  if (secondary && agentTags.includes(secondary)) {
    return 55; // 次系统匹配
  }

  // 无系统匹配——检查是否有跨层关联
  const agentLayers = agentTags.map((t: string) => SYSTEM_LAYER[t] || '');
  const serviceLayer = SYSTEM_LAYER[primary] || '';
  if (agentLayers.includes(serviceLayer)) {
    return 40; // 同层不同系统，弱相关
  }

  return 30; // 不匹配
}

// ── 维度二：阶段适配度 ──
async function calculateStageFit(agent: any, service: any): Promise<number> {
  const suitableStages: string[] = service.suitable_stages || [];
  const agentStage = agent.energy_status || 'unknown';

  if (suitableStages.length === 0) {
    return 50; // 未标注阶段，保守评分
  }

  if (suitableStages.includes(agentStage)) {
    return 80;
  }

  // 检查过渡期匹配
  if (agentStage.includes('输出') && suitableStages.includes('survival_base')) {
    return 70; // 输出期的人需要健康支撑
  }

  return 40;
}

// ── 维度三：历史一致性 ──
async function calculateHistory(agent: any, service: any): Promise<number> {
  const { data: pastTransactions } = await supabase
    .from('transactions')
    .select('actual_score, services!inner(primary_system)')
    .eq('buyer_cid', agent.cid)
    .eq('status', 'rated')
    .limit(20);

  if (!pastTransactions || pastTransactions.length === 0) {
    return 50; // 无历史记录，中性
  }

  // 寻找同类服务（同系统）的评分
  const sameSystem = pastTransactions.filter(
    (t: any) => t.services?.primary_system === service.primary_system
  );

  if (sameSystem.length === 0) {
    return 50; // 未体验过同类服务
  }

  const avgScore = sameSystem.reduce((sum: number, t: any) => sum + (t.actual_score || 0), 0) / sameSystem.length;

  if (avgScore >= 4) return 80;
  if (avgScore >= 3) return 60;
  return 30; // 历史体验差
}

// ── 维度四：信任可信度 ──
async function calculateTrust(agent: any, service: any): Promise<number> {
  const providerCid = service.provider_cid;

  // 检查是否有直接授权连接
  const { data: directAuth } = await supabase
    .from('auth_records')
    .select('id')
    .eq('granter_cid', agent.cid)
    .eq('grantee_cid', providerCid)
    .eq('status', 'active')
    .single();

  if (directAuth) return 90;

  // 检查是否有二度连接
  const { data: myAuths } = await supabase
    .from('auth_records')
    .select('grantee_cid')
    .eq('granter_cid', agent.cid)
    .eq('status', 'active');

  if (myAuths && myAuths.length > 0) {
    const myConnections = myAuths.map(a => a.grantee_cid);
    const { data: secondDegree } = await supabase
      .from('auth_records')
      .select('id')
      .eq('granter_cid', providerCid)
      .in('grantee_cid', myConnections)
      .eq('status', 'active')
      .limit(1);

    if (secondDegree && secondDegree.length > 0) return 70;
  }

  // 服务方信任评分
  const providerTrust = (service as any).agents?.provider_trust || service.trust_score || 0;
  if (providerTrust >= 4) return 55;
  if (providerTrust >= 3) return 45;

  return 40; // 陌生服务方
}

// ── 综合计算维度 ──
async function calculateDimensions(agent: any, service: any): Promise<DimensionScores> {
  const [resonance, stageFit, history, trust] = await Promise.all([
    calculateResonance(agent, service),
    calculateStageFit(agent, service),
    calculateHistory(agent, service),
    calculateTrust(agent, service),
  ]);

  return { resonance, stage_fit: stageFit, history, trust };
}

// ── 生成推演说明 ──
function generateSummary(agent: any, service: any, dims: DimensionScores, total: number): string {
  const agentTags = (agent.life_stage_tags || []).map((t: string) => SYSTEM_LABELS[t] || t).join('、');
  const sysLabel = SYSTEM_LABELS[service.primary_system] || service.primary_system;

  let summary = `根据你当前处于"${agentTags || '有待完善'}"阶段，`;

  if (dims.history >= 70) {
    summary += `以及你过去对同类服务的好评记录，`;
  } else if (dims.history === 50) {
    summary += `以及你初次体验此类服务，`;
  }

  summary += `推荐"${service.name}"（${sysLabel}），预演评分 ${total}/100。`;

  if (dims.trust < 50) {
    summary += `该服务方与你尚无历史连接，建议首次尝试以单次体验为主。`;
  }

  return summary;
}

// ── 生成风险提示 ──
function generateRisks(agent: any, service: any, dims: DimensionScores): string[] {
  const risks: string[] = [];

  if (dims.trust < 50) {
    risks.push('该服务方与你无历史授权连接，属于首次接触');
  }
  if (dims.history === 50) {
    risks.push('你未曾体验过此类服务，建议以低成本方式试水');
  }
  if (dims.stage_fit < 50) {
    risks.push('该服务标注的适合阶段与你的当前阶段不完全匹配');
  }

  return risks;
}

// ── 获取推荐列表 ──
async function getRecommendations(agentCid: string, limit: number = 5) {
  // 获取所有活跃服务
  const { data: services } = await supabase
    .from('services')
    .select('*')
    .eq('status', 'active')
    .limit(20);

  if (!services || services.length === 0) return [];

  // 对每个服务跑预演评分
  const scored = await Promise.all(
    services.map(async (service) => {
      try {
        const result = await runPreEnact({ agentCid, serviceId: service.id });
        return {
          service_id: service.id,
          service_name: service.name,
          provider_cid: service.provider_cid,
          primary_system: service.primary_system,
          price: service.price,
          duration_minutes: service.duration_minutes,
          pre_score: result.total_score,
          summary: result.summary,
          risks: result.risks,
        };
      } catch {
        return null;
      }
    })
  );

  return scored
    .filter(Boolean)
    .sort((a: any, b: any) => b.pre_score - a.pre_score)
    .slice(0, limit);
}

export default router;
