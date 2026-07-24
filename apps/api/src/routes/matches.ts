import { Router, Request, Response } from 'express';
import { supabase, getCurrentCid } from '../lib/supabase';
import { AnalyzeMatchSchema } from '../lib/validation';

const router = Router();

const SYSTEM_LABELS: Record<string, string> = {
  health: '健康',
  living: '生活',
  connection: '连接',
  growth: '成长',
  wealth: '财富',
  create: '创造',
  explore: '探索',
  spirit: '精神',
  future: '未来',
};

interface ValueProfile {
  core_value?: string;
  service_capabilities?: string;
  project_experience?: string;
  vision_needs?: string;
}

router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const body = AnalyzeMatchSchema.parse(req.body);
    if (body.target_cid === cid) {
      return res.status(400).json({ error: '不能和自己的Agent生成匹配报告' });
    }

    const { data: agents, error } = await supabase
      .from('agents')
      .select('cid, nickname, life_stage_tags, trust_score, energy_status, agent_config, status')
      .in('cid', [cid, body.target_cid]);

    if (error) throw error;

    const me = agents?.find(agent => agent.cid === cid);
    const target = agents?.find(agent => agent.cid === body.target_cid);
    if (!me) return res.status(404).json({ error: '当前Agent不存在' });
    if (!target) return res.status(404).json({ error: '目标Agent不存在' });

    res.json({ data: buildMatchReport(me, target) });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '生成匹配报告失败' });
  }
});

function buildMatchReport(me: any, target: any) {
  const myProfile = getValueProfile(me.agent_config);
  const targetProfile = getValueProfile(target.agent_config);
  const myTags: string[] = me.life_stage_tags || [];
  const targetTags: string[] = target.life_stage_tags || [];
  const sharedTags = myTags.filter(tag => targetTags.includes(tag));
  const complementTags = targetTags.filter(tag => !myTags.includes(tag));

  const demandFit = scoreTextFit(myProfile.vision_needs, targetProfile.service_capabilities);
  const reverseDemandFit = scoreTextFit(targetProfile.vision_needs, myProfile.service_capabilities);
  const valueFit = scoreTextFit(myProfile.core_value, targetProfile.core_value);
  const systemFit = sharedTags.length > 0 ? 82 : complementTags.length > 0 ? 64 : 48;
  const trustFit = Math.min(100, Math.round(((me.trust_score || 0) + (target.trust_score || 0)) * 10));

  const totalScore = Math.round(
    demandFit * 0.3 +
    reverseDemandFit * 0.2 +
    valueFit * 0.2 +
    systemFit * 0.2 +
    trustFit * 0.1
  );

  const opportunities = buildOpportunities(myProfile, targetProfile, sharedTags, complementTags);
  const risks = buildRisks(myProfile, targetProfile, sharedTags, trustFit);
  const nextActions = buildNextActions(totalScore, myProfile, targetProfile);

  return {
    id: `match-${me.cid}-${target.cid}-${Date.now()}`,
    created_at: new Date().toISOString(),
    source_agent: publicAgent(me, myProfile),
    target_agent: publicAgent(target, targetProfile),
    total_score: totalScore,
    dimensions: {
      demand_fit: demandFit,
      reverse_demand_fit: reverseDemandFit,
      value_fit: valueFit,
      system_fit: systemFit,
      trust_fit: trustFit,
    },
    summary: buildSummary(totalScore, me.nickname, target.nickname, opportunities),
    opportunities,
    risks,
    next_actions: nextActions,
  };
}

function getValueProfile(config: any): ValueProfile {
  return config && config.value_profile ? config.value_profile : {};
}

function publicAgent(agent: any, profile: ValueProfile) {
  return {
    cid: agent.cid,
    nickname: agent.nickname,
    life_stage_tags: agent.life_stage_tags || [],
    trust_score: agent.trust_score || 0,
    energy_status: agent.energy_status || 'unknown',
    value_profile: profile,
  };
}

function scoreTextFit(a = '', b = '') {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.length === 0 || right.length === 0) return 45;
  const overlap = left.filter(word => right.includes(word)).length;
  const ratio = overlap / Math.max(left.length, right.length);
  return Math.max(45, Math.min(92, Math.round(55 + ratio * 120)));
}

function tokenize(text: string) {
  return Array.from(new Set(
    String(text)
      .toLowerCase()
      .split(/[\s,，。；;、/｜|]+/)
      .map(item => item.trim())
      .filter(item => item.length >= 2)
  ));
}

function buildOpportunities(myProfile: ValueProfile, targetProfile: ValueProfile, sharedTags: string[], complementTags: string[]) {
  const items: string[] = [];
  if (targetProfile.service_capabilities && myProfile.vision_needs) {
    items.push('对方的服务能力可以回应你当前写下的愿景需求，适合先做一次轻量沟通。');
  }
  if (myProfile.service_capabilities && targetProfile.vision_needs) {
    items.push('你的能力也可能反向支持对方需求，存在双向协作空间。');
  }
  if (sharedTags.length > 0) {
    items.push(`你们共同活跃在${sharedTags.map(tag => SYSTEM_LABELS[tag] || tag).join('、')}领域，沟通成本较低。`);
  } else if (complementTags.length > 0) {
    items.push(`对方在${complementTags.map(tag => SYSTEM_LABELS[tag] || tag).join('、')}领域可形成补位。`);
  }
  return items.length > 0 ? items : ['双方公开档案信息还不完整，建议先通过一次15分钟互相介绍建立上下文。'];
}

function buildRisks(myProfile: ValueProfile, targetProfile: ValueProfile, sharedTags: string[], trustFit: number) {
  const risks: string[] = [];
  if (!myProfile.vision_needs || !targetProfile.service_capabilities) {
    risks.push('一方的需求或服务能力描述不足，容易出现期待不一致。');
  }
  if (sharedTags.length === 0) {
    risks.push('当前系统标签没有直接重合，建议先确认共同目标。');
  }
  if (trustFit < 60) {
    risks.push('双方信任基础偏弱，首次合作建议采用小范围、短周期验证。');
  }
  return risks;
}

function buildNextActions(totalScore: number, myProfile: ValueProfile, targetProfile: ValueProfile) {
  const actions = [
    '先交换各自当前最想解决的一个问题。',
    '约一次15-30分钟线上沟通，明确是否有具体协作场景。',
  ];
  if (totalScore >= 75) {
    actions.push('可以直接设计一次小型试合作：明确交付物、时间、费用或互换价值。');
  } else {
    actions.push('暂不建议直接进入长期合作，先用一次低成本沟通验证匹配度。');
  }
  if (!myProfile.core_value || !targetProfile.core_value) {
    actions.push('双方都应先补全核心价值档案，让Agent后续判断更准确。');
  }
  return actions;
}

function buildSummary(totalScore: number, myName: string, targetName: string, opportunities: string[]) {
  const level = totalScore >= 75 ? '较高' : totalScore >= 60 ? '中等' : '初步';
  return `${myName || '你'} 与 ${targetName || '对方'} 的协作匹配度为${level}。${opportunities[0] || '建议先补充公开档案后再判断下一步。'}`;
}

export default router;
