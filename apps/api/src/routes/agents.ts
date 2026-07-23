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
