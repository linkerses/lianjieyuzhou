import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { AdminUpdateAgentSchema } from '../lib/validation';

const router = Router();

router.use((req: Request, res: Response, next) => {
  const adminToken = process.env.ADMIN_TOKEN;
  const requestToken = req.headers['x-admin-token'];

  if (!adminToken) {
    return res.status(503).json({ error: '管理员接口未配置' });
  }

  if (requestToken !== adminToken) {
    return res.status(403).json({ error: '管理员密钥无效' });
  }

  next();
});

router.patch('/agents/:cid', async (req: Request, res: Response) => {
  try {
    const { cid } = req.params;
    const body = AdminUpdateAgentSchema.parse(req.body);

    const { data: existing, error: readError } = await supabase
      .from('agents')
      .select('agent_config')
      .eq('cid', cid)
      .single();

    if (readError) throw readError;
    if (!existing) return res.status(404).json({ error: 'Agent不存在' });

    const currentConfig = (existing.agent_config || {}) as Record<string, any>;
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.nickname !== undefined) updateData.nickname = body.nickname;
    if (body.life_stage_tags !== undefined) updateData.life_stage_tags = body.life_stage_tags;
    if (body.trust_score !== undefined) updateData.trust_score = body.trust_score;
    if (body.energy_status !== undefined) updateData.energy_status = body.energy_status;
    if (body.status !== undefined) updateData.status = body.status;

    if (body.agent_config !== undefined || body.value_profile !== undefined) {
      updateData.agent_config = {
        ...currentConfig,
        ...(body.agent_config || {}),
        value_profile: {
          ...((currentConfig.value_profile || {}) as Record<string, any>),
          ...((body.agent_config && body.agent_config.value_profile) || {}),
          ...(body.value_profile || {}),
        },
      };
    }

    const { data, error } = await supabase
      .from('agents')
      .update(updateData)
      .eq('cid', cid)
      .select('cid, nickname, life_stage_tags, trust_score, energy_status, status, agent_config, updated_at')
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新Agent失败' });
  }
});

export default router;
