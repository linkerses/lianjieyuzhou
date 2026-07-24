import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { AdminUpdateAgentSchema, UpdateServiceSchema } from '../lib/validation';

const router = Router();

router.use((req: Request, res: Response, next) => {
  const adminToken = process.env.ADMIN_TOKEN;
  const requestToken = req.headers['x-admin-token'];
  const normalizedToken = Array.isArray(requestToken) ? requestToken[0] : requestToken;

  if (!adminToken) {
    return res.status(503).json({ error: '管理员接口未配置' });
  }

  if (normalizedToken !== adminToken) {
    return res.status(403).json({ error: '管理员密钥无效' });
  }

  next();
});

router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const [
      agentsTotal,
      agentsActive,
      servicesTotal,
      servicesActive,
      transactionsTotal,
      transactionsPending,
      matchesTotal,
    ] = await Promise.all([
      countRows('agents'),
      countRows('agents', query => query.eq('status', 'active')),
      countRows('services'),
      countRows('services', query => query.eq('status', 'active')),
      countRows('transactions'),
      countRows('transactions', query => query.eq('status', 'pending')),
      countRows('agent_matches'),
    ]);

    const { data: recentTransactions, error: txError } = await supabase
      .from('transactions')
      .select('amount')
      .order('created_at', { ascending: false })
      .limit(20);

    if (txError) throw txError;

    const recentTransactionAmount = (recentTransactions || []).reduce((sum, item: any) => {
      return sum + (Number(item.amount) || 0);
    }, 0);

    res.json({
      data: {
        agents_total: agentsTotal,
        agents_active: agentsActive,
        services_total: servicesTotal,
        services_active: servicesActive,
        transactions_total: transactionsTotal,
        transactions_pending: transactionsPending,
        matches_total: matchesTotal,
        recent_transaction_amount: Math.round(recentTransactionAmount * 100) / 100,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取运营总览失败' });
  }
});

router.get('/agents', async (req: Request, res: Response) => {
  try {
    const { q, status, limit } = req.query;
    let query = supabase
      .from('agents')
      .select('cid, nickname, life_stage_tags, trust_score, trust_threshold, energy_status, status, agent_config, created_at, updated_at');

    if (status && status !== 'all') {
      query = query.eq('status', String(status));
    }

    const keyword = sanitizeSearch(String(q || ''));
    if (keyword) {
      query = query.or(`cid.ilike.%${keyword}%,nickname.ilike.%${keyword}%`);
    }

    const parsedLimit = Number(limit);
    query = query.limit(Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50);

    const { data, error } = await query.order('updated_at', { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取Agent列表失败' });
  }
});

router.get('/services', async (req: Request, res: Response) => {
  try {
    const { q, status, provider, limit } = req.query;
    let query = supabase
      .from('services')
      .select(`
        id, provider_cid, name, primary_system, secondary_system, suitable_stages,
        description, price, duration_minutes, delivery_method, location, status,
        trust_score, delivery_count, avg_rating, created_at, updated_at,
        agents!inner(nickname)
      `);

    if (status && status !== 'all') {
      query = query.eq('status', String(status));
    }
    if (provider) {
      query = query.eq('provider_cid', String(provider));
    }

    const keyword = sanitizeSearch(String(q || ''));
    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,provider_cid.ilike.%${keyword}%`);
    }

    const parsedLimit = Number(limit);
    query = query.limit(Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50);

    const { data, error } = await query.order('updated_at', { ascending: false });
    if (error) throw error;

    res.json({
      data: (data || []).map((item: any) => ({
        ...item,
        provider_nickname: item.agents?.nickname,
        agents: undefined,
      })),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取服务列表失败' });
  }
});

router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const { status, cid, limit } = req.query;
    let query = supabase
      .from('transactions')
      .select(`
        id, buyer_cid, seller_cid, service_id, amount, status, pre_score,
        actual_score, booking_note, scheduled_at, completed_at, created_at, updated_at,
        services(name, primary_system)
      `);

    if (status && status !== 'all') {
      query = query.eq('status', String(status));
    }
    if (cid) {
      const safeCid = sanitizeSearch(String(cid));
      query = query.or(`buyer_cid.eq.${safeCid},seller_cid.eq.${safeCid}`);
    }

    const parsedLimit = Number(limit);
    query = query.limit(Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取交易列表失败' });
  }
});

router.get('/matches', async (req: Request, res: Response) => {
  try {
    const { cid, limit } = req.query;
    let query = supabase
      .from('agent_matches')
      .select(`
        id, requester_cid, target_cid, total_score, summary, opportunities,
        risks, next_actions, status, created_at, updated_at,
        requester:agents!agent_matches_requester_cid_fkey(cid, nickname),
        target:agents!agent_matches_target_cid_fkey(cid, nickname)
      `);

    if (cid) {
      const safeCid = sanitizeSearch(String(cid));
      query = query.or(`requester_cid.eq.${safeCid},target_cid.eq.${safeCid}`);
    }

    const parsedLimit = Number(limit);
    query = query.limit(Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取匹配报告列表失败' });
  }
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

router.patch('/services/:id', async (req: Request, res: Response) => {
  try {
    const body = UpdateServiceSchema.parse(req.body);
    const { data, error } = await supabase
      .from('services')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: '服务不存在' });
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新服务失败' });
  }
});

async function countRows(table: string, apply?: (query: any) => any) {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  if (apply) query = apply(query);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

function sanitizeSearch(value: string) {
  return value.trim().replace(/[%,()]/g, '').slice(0, 60);
}

export default router;
