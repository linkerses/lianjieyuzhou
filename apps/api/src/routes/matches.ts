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

interface DemandPost {
  title?: string;
  description?: string;
  status?: string;
}

router.get('/mine', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const { data, error } = await supabase
      .from('agent_matches')
      .select(`
        id, requester_cid, target_cid, total_score, summary,
        opportunities, risks, next_actions, created_at, status,
        requester:agents!agent_matches_requester_cid_fkey(cid, nickname),
        target:agents!agent_matches_target_cid_fkey(cid, nickname)
      `)
      .or(`requester_cid.eq.${cid},target_cid.eq.${cid}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取匹配历史失败' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const { data, error } = await supabase
      .from('agent_matches')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: '匹配报告不存在' });
    if (data.requester_cid !== cid && data.target_cid !== cid) {
      return res.status(403).json({ error: '无权查看该匹配报告' });
    }

    res.json({ data: data.report });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取匹配报告失败' });
  }
});

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

    const report = buildMatchReport(me, target);
    const { data: saved, error: saveError } = await supabase
      .from('agent_matches')
      .insert({
        requester_cid: cid,
        target_cid: body.target_cid,
        total_score: report.total_score,
        dimensions: report.dimensions,
        summary: report.summary,
        opportunities: report.opportunities,
        risks: report.risks,
        next_actions: report.next_actions,
        report,
      })
      .select('id, created_at')
      .single();

    if (saveError) throw saveError;
    res.json({ data: { ...report, id: saved.id, created_at: saved.created_at } });
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
  const matchType = classifyMatch(myProfile, targetProfile, myTags, targetTags, totalScore);
  const evidence = buildEvidence(matchType.key, myProfile, targetProfile, sharedTags, complementTags);
  const entrypoints = buildEntrypoints(matchType.key, myProfile, targetProfile, target.nickname);
  const nextActions = buildNextActions(totalScore, matchType.key, myProfile, targetProfile);
  const conclusion = buildConclusion(totalScore, matchType.label, me.nickname, target.nickname);

  return {
    id: `match-${me.cid}-${target.cid}-${Date.now()}`,
    created_at: new Date().toISOString(),
    source_agent: publicAgent(me, myProfile),
    target_agent: publicAgent(target, targetProfile),
    match_type: matchType,
    conclusion,
    total_score: totalScore,
    dimensions: {
      demand_fit: demandFit,
      reverse_demand_fit: reverseDemandFit,
      value_fit: valueFit,
      system_fit: systemFit,
      trust_fit: trustFit,
    },
    summary: conclusion,
    evidence,
    collaboration_entrypoints: entrypoints,
    opportunities,
    risks,
    next_actions: nextActions,
  };
}

function getValueProfile(config: any): ValueProfile {
  return config && config.value_profile ? config.value_profile : {};
}

function getOpenDemands(config: any): DemandPost[] {
  const posts = config && Array.isArray(config.demand_posts) ? config.demand_posts : [];
  return posts.filter((item: DemandPost) => item && item.status === 'open' && item.title);
}

function publicAgent(agent: any, profile: ValueProfile) {
  return {
    cid: agent.cid,
    nickname: agent.nickname,
    life_stage_tags: agent.life_stage_tags || [],
    trust_score: agent.trust_score || 0,
    energy_status: agent.energy_status || 'unknown',
    value_profile: profile,
    demand_posts: getOpenDemands(agent.agent_config),
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

function classifyMatch(myProfile: ValueProfile, targetProfile: ValueProfile, myTags: string[], targetTags: string[], totalScore: number) {
  const myNeed = hasText(myProfile.vision_needs);
  const targetNeed = hasText(targetProfile.vision_needs);
  const myCapability = hasText(myProfile.service_capabilities);
  const targetCapability = hasText(targetProfile.service_capabilities);
  const sharedTags = myTags.filter(tag => targetTags.includes(tag));

  if (myNeed && targetCapability && scoreTextFit(myProfile.vision_needs, targetProfile.service_capabilities) >= 58) {
    return { key: 'need_service', label: '需求-服务型' };
  }
  if (myCapability && targetNeed && scoreTextFit(targetProfile.vision_needs, myProfile.service_capabilities) >= 58) {
    return { key: 'resource_exchange', label: '资源互补型' };
  }
  if (sharedTags.length > 0 && totalScore >= 60) {
    return { key: 'peer_cocreation', label: '同阶段共创型' };
  }
  if (targetCapability && !myCapability) {
    return { key: 'mentor_support', label: '经验支持型' };
  }
  return { key: 'exploratory', label: '轻量认识型' };
}

function buildConclusion(totalScore: number, matchTypeLabel: string, myName: string, targetName: string) {
  if (totalScore >= 75) {
    return `${myName || '你'}和${targetName || '对方'}属于${matchTypeLabel}，建议直接用一次小交付或短沟通验证合作。`;
  }
  if (totalScore >= 60) {
    return `${myName || '你'}和${targetName || '对方'}属于${matchTypeLabel}，适合先交换需求边界，再决定是否推进。`;
  }
  return `${myName || '你'}和${targetName || '对方'}目前更适合轻量认识，暂不建议直接进入正式合作。`;
}

function buildEvidence(matchType: string, myProfile: ValueProfile, targetProfile: ValueProfile, sharedTags: string[], complementTags: string[]) {
  const items: string[] = [];
  if (matchType === 'need_service') {
    items.push(`你的当前需求是「${shortText(myProfile.vision_needs)}」，对方能力里出现了可回应的方向。`);
    items.push(`对方能力描述为「${shortText(targetProfile.service_capabilities)}」，适合先验证一次具体问题。`);
  } else if (matchType === 'resource_exchange') {
    items.push(`对方有明确需求「${shortText(targetProfile.vision_needs)}」，你的能力可能形成反向支持。`);
    items.push(`你的能力描述为「${shortText(myProfile.service_capabilities)}」，可以先提出一个小范围帮助。`);
  } else if (matchType === 'peer_cocreation') {
    items.push(`你们共同处在${sharedTags.map(tag => SYSTEM_LABELS[tag] || tag).join('、')}相关方向，理解成本较低。`);
    items.push('双方适合先互相拆解一个真实问题，而不是一开始谈长期合作。');
  } else if (matchType === 'mentor_support') {
    items.push(`对方已有能力沉淀「${shortText(targetProfile.service_capabilities)}」，适合向其请教路径或预约服务。`);
    items.push('你可以先把自己的问题压缩成一个具体场景，让对方判断是否能支持。');
  } else {
    items.push('双方公开信息还不足，当前结论只能支持轻量认识。');
    items.push('建议先补充需求、服务能力和项目经历后再重新匹配。');
  }

  if (sharedTags.length > 0) {
    items.push(`共同标签：${sharedTags.map(tag => SYSTEM_LABELS[tag] || tag).join('、')}。`);
  } else if (complementTags.length > 0) {
    items.push(`对方补充方向：${complementTags.map(tag => SYSTEM_LABELS[tag] || tag).join('、')}。`);
  }
  return items.filter(item => !item.includes('「」')).slice(0, 3);
}

function buildEntrypoints(matchType: string, myProfile: ValueProfile, targetProfile: ValueProfile, targetName: string) {
  if (matchType === 'need_service') {
    return [
      `把你的需求收窄成一个问题，发给${targetName || '对方'}判断是否能交付。`,
      '如果对方已有服务，优先预约一次低金额或短时长服务验证。',
    ];
  }
  if (matchType === 'resource_exchange') {
    return [
      `先告诉${targetName || '对方'}：你能为其当前需求提供哪一个具体资源或动作。`,
      '用一次资源互换或样本共创测试双方配合感。',
    ];
  }
  if (matchType === 'peer_cocreation') {
    return [
      '各自带一个正在推进的问题，做一次30分钟互相拆解。',
      '沟通后只保留一个3-7天能完成的小共创动作。',
    ];
  }
  if (matchType === 'mentor_support') {
    return [
      '先请对方看你的当前卡点，并请求一个方向判断。',
      '如果对方有服务，优先用一次咨询替代泛泛聊天。',
    ];
  }
  return [
    '先看对方公开档案，不急着谈合作。',
    '只发起一次低承诺沟通，确认彼此是否值得继续了解。',
  ];
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

function buildNextActions(totalScore: number, matchType: string, myProfile: ValueProfile, targetProfile: ValueProfile) {
  const actionByType: Record<string, string> = {
    need_service: '先用一句话说明你的需求、预算或时间边界，再询问对方是否能交付。',
    resource_exchange: '先提出一个你能给对方的具体资源，再询问对方是否愿意互换一次。',
    peer_cocreation: '先约一次30分钟问题互拆，不讨论长期合作。',
    mentor_support: '先请对方判断你的下一步路径，不要直接索要完整方案。',
    exploratory: '先补充双方档案，再重新生成匹配报告。',
  };
  const actions = [actionByType[matchType] || actionByType.exploratory];
  actions.push(totalScore >= 75
    ? '把下一步拆成一个3-7天可完成的小任务，并写清交付物。'
    : '先做一次低承诺沟通，确认目标一致后再推进。');
  if (!myProfile.core_value || !targetProfile.core_value) {
    actions.push('双方都应先补全核心价值档案，让Agent后续判断更准确。');
  }
  return actions.slice(0, 3);
}

function buildSummary(totalScore: number, myName: string, targetName: string, opportunities: string[]) {
  const level = totalScore >= 75 ? '较高' : totalScore >= 60 ? '中等' : '初步';
  return `${myName || '你'} 与 ${targetName || '对方'} 的协作匹配度为${level}。${opportunities[0] || '建议先补充公开档案后再判断下一步。'}`;
}

function hasText(value = '') {
  return String(value || '').trim().length >= 4;
}

function shortText(value = '', max = 42) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export default router;
