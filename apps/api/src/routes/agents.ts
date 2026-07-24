import { Router, Request, Response } from 'express';
import { supabase, getCurrentCid } from '../lib/supabase';
import { CreateAgentSchema, UpdateAgentSchema, UpsertProfileSchema, UpdateSkillSchema } from '../lib/validation';

const router = Router();

// ── 创建Agent ──
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = CreateAgentSchema.parse(req.body);

    // 生成CID: UC-{类型}-{序号}
    const { count } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true });

    const seq = String((count || 0) + 1).padStart(4, '0');
    const cid = `UC-M-${seq}`;

    const { data, error } = await supabase
      .from('agents')
      .insert({ cid, ...body })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '创建Agent失败' });
  }
});

// ── 获取当前Agent ──
router.get('/me', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('cid', cid)
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err: any) {
    res.status(404).json({ error: 'Agent不存在' });
  }
});

// ── 获取指定Agent ──
// ── 公开Agent档案 ──
router.get('/public', async (req: Request, res: Response) => {
  try {
    const { tag, limit, sort } = req.query;
    const parsedLimit = Number(limit);

    let query = supabase
      .from('agents')
      .select('cid, nickname, life_stage_tags, trust_score, energy_status, status, agent_config, updated_at')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 50) : 30);

    if (tag) {
      query = query.contains('life_stage_tags', [String(tag)]);
    }

    const { data, error } = await query;
    if (error) throw error;

    const publicAgents = (data || []).map(formatPublicAgent);
    const serviceCounts = await getActiveServiceCounts(publicAgents.map(agent => agent.cid));
    const agents = publicAgents
      .map(agent => ({
        ...agent,
        service_count: serviceCounts[agent.cid] || 0,
        profile_completion: calculateProfileCompletion(agent),
      }))
      .map(agent => ({
        ...agent,
        recommendation_score: calculateRecommendationScore(agent),
      }));

    res.json({ data: sortPublicAgents(agents, String(sort || 'recommended')) });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取Agent广场失败' });
  }
});

router.get('/public/:cid', async (req: Request, res: Response) => {
  try {
    const { cid } = req.params;
    const { data, error } = await supabase
      .from('agents')
      .select('cid, nickname, life_stage_tags, trust_score, energy_status, status, agent_config')
      .eq('cid', cid)
      .single();

    if (error) throw error;
    res.json({ data: formatPublicAgent(data) });
  } catch (err: any) {
    res.status(404).json({ error: 'Agent不存在' });
  }
});

function formatPublicAgent(data: any) {
  const config = data.agent_config || {};
  const profile = config.value_profile || {};
  const basicProfile = config.basic_profile || {};

  return {
    cid: data.cid,
    nickname: data.nickname,
    avatar_url: config.avatar_url || '',
    basic_profile: {
      province: basicProfile.province || '',
      city: basicProfile.city || '',
      gender: basicProfile.gender || '',
      bio: basicProfile.bio || '',
    },
    life_stage_tags: data.life_stage_tags || [],
    trust_score: data.trust_score || 0,
    energy_status: data.energy_status || 'unknown',
    status: data.status,
    value_profile: {
      core_value: profile.core_value || '',
      service_capabilities: profile.service_capabilities || '',
      project_experience: profile.project_experience || '',
      vision_needs: profile.vision_needs || '',
    },
  };
}

async function getActiveServiceCounts(cids: string[]) {
  if (cids.length === 0) return {} as Record<string, number>;

  const { data } = await supabase
    .from('services')
    .select('provider_cid')
    .in('provider_cid', cids)
    .eq('status', 'active');

  return (data || []).reduce((acc: Record<string, number>, item: any) => {
    acc[item.provider_cid] = (acc[item.provider_cid] || 0) + 1;
    return acc;
  }, {});
}

function calculateProfileCompletion(agent: any) {
  const profile = agent.value_profile || {};
  const fields = [
    agent.nickname,
    agent.avatar_url,
    agent.basic_profile?.province,
    agent.basic_profile?.city,
    agent.basic_profile?.gender,
    agent.basic_profile?.bio,
    agent.life_stage_tags && agent.life_stage_tags.length > 0 ? 'tags' : '',
    profile.core_value,
    profile.service_capabilities,
    profile.project_experience,
    profile.vision_needs,
  ];
  const completed = fields.filter(value => String(value || '').trim().length > 0).length;
  return Math.round((completed / fields.length) * 100);
}

function calculateRecommendationScore(agent: any) {
  const trust = Number(agent.trust_score || 0) * 10;
  const services = Math.min(Number(agent.service_count || 0), 5) * 8;
  const completion = Number(agent.profile_completion || 0) * 0.35;
  return Math.round(trust + services + completion);
}

function sortPublicAgents(agents: any[], sort: string) {
  const list = [...agents];
  if (sort === 'trust') {
    return list.sort((a, b) => Number(b.trust_score || 0) - Number(a.trust_score || 0));
  }
  if (sort === 'services') {
    return list.sort((a, b) => Number(b.service_count || 0) - Number(a.service_count || 0));
  }
  if (sort === 'complete') {
    return list.sort((a, b) => Number(b.profile_completion || 0) - Number(a.profile_completion || 0));
  }
  if (sort === 'latest') {
    return list;
  }
  return list.sort((a, b) => Number(b.recommendation_score || 0) - Number(a.recommendation_score || 0));
}

router.get('/:cid', async (req: Request, res: Response) => {
  try {
    const { cid } = req.params;
    const { data, error } = await supabase
      .from('agents')
      .select('cid, nickname, life_stage_tags, trust_score, energy_status, status')
      .eq('cid', cid)
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err: any) {
    res.status(404).json({ error: 'Agent不存在' });
  }
});

// ── 更新Agent ──
router.patch('/me', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const body = UpdateAgentSchema.parse(req.body);
    const { data, error } = await supabase
      .from('agents')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('cid', cid)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新Agent失败' });
  }
});

// ── 获取Agent档案（某层） ──
router.get('/me/profile/:layer', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const { layer } = req.params;
    const { data, error } = await supabase
      .from('agent_profiles')
      .select('*')
      .eq('agent_cid', cid)
      .eq('layer', layer)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json({ data: data || null });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── 更新Agent档案（某层） ──
router.patch('/me/profile/:layer', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const { layer } = req.params;
    const body = UpsertProfileSchema.parse({ ...req.body, layer });

    // Upsert: 存在则更新，不存在则创建
    const { data: existing } = await supabase
      .from('agent_profiles')
      .select('id')
      .eq('agent_cid', cid)
      .eq('layer', layer)
      .single();

    let result;
    if (existing) {
      result = await supabase
        .from('agent_profiles')
        .update({ data: body.data, visibility: body.visibility, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from('agent_profiles')
        .insert({ agent_cid: cid, layer, data: body.data, visibility: body.visibility })
        .select()
        .single();
    }

    if (result.error) throw result.error;
    res.json({ data: result.data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新档案失败' });
  }
});

// ── 切换技能开关 ──
router.patch('/me/skills', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const body = UpdateSkillSchema.parse(req.body);

    // 从当前Agent配置中更新技能状态
    const { data: agent } = await supabase
      .from('agents')
      .select('skill_status')
      .eq('cid', cid)
      .single();

    if (!agent) return res.status(404).json({ error: 'Agent不存在' });

    const skillStatus = { ...(agent.skill_status as object || {}), [body.skill]: body.status };

    const { data, error } = await supabase
      .from('agents')
      .update({ skill_status: skillStatus, updated_at: new Date().toISOString() })
      .eq('cid', cid)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新技能状态失败' });
  }
});

export default router;
