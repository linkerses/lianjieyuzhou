import { Router, Request, Response } from 'express';
import { supabase, getCurrentCid } from '../lib/supabase';
import { CreateServiceSchema, UpdateServiceSchema } from '../lib/validation';

const router = Router();

// ── 上架服务 ──
router.post('/', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const body = CreateServiceSchema.parse(req.body);
    const { data, error } = await supabase
      .from('services')
      .insert({ provider_cid: cid, status: 'active', ...body })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '上架服务失败' });
  }
});

// ── 服务列表（支持筛选） ──
router.get('/', async (req: Request, res: Response) => {
  try {
    const { system, status, provider, limit } = req.query;

    let query = supabase
      .from('services')
      .select(`
        id, name, primary_system, secondary_system, suitable_stages, price,
        duration_minutes, delivery_method, trust_score,
        delivery_count, avg_rating, status, created_at,
        provider_cid,
        agents!inner(nickname)
      `);

    if (system) {
      query = query.or(`primary_system.eq.${system},secondary_system.eq.${system}`);
    }
    if (status && status !== 'all') {
      query = query.eq('status', status);
    } else {
      query = query.eq('status', 'active'); // 默认只看上架的
    }
    if (provider) {
      query = query.eq('provider_cid', provider);
    }

    const parsedLimit = Number(limit);
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      query = query.limit(Math.min(parsedLimit, 50));
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    // 格式化输出
    const services = data?.map(s => ({
      ...s,
      provider_nickname: (s as any).agents?.nickname,
      agents: undefined,
    }));

    res.json({ data: services });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取服务列表失败' });
  }
});

// ── 服务详情 ──
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('services')
      .select(`
        *,
        agents!inner(nickname)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json({
      data: {
        ...data,
        provider_nickname: (data as any).agents?.nickname,
        agents: undefined,
      },
    });
  } catch (err: any) {
    res.status(404).json({ error: '服务不存在' });
  }
});

// ── 更新服务 ──
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const body = UpdateServiceSchema.parse(req.body);

    // 只能更新自己的服务
    const { data: service } = await supabase
      .from('services')
      .select('provider_cid')
      .eq('id', req.params.id)
      .single();

    if (!service) return res.status(404).json({ error: '服务不存在' });
    if (service.provider_cid !== cid) return res.status(403).json({ error: '无权操作' });

    const { data, error } = await supabase
      .from('services')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新服务失败' });
  }
});

export default router;
