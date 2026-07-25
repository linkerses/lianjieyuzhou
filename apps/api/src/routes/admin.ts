import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import {
  AdminUpdateAgentSchema,
  CreateCommunityPostSchema,
  UpdateCommunityPostSchema,
  UpdateServiceSchema,
} from '../lib/validation';

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
      connectionRequestsPending,
    ] = await Promise.all([
      countRows('agents'),
      countRows('agents', query => query.eq('status', 'active')),
      countRows('services'),
      countRows('services', query => query.eq('status', 'active')),
      countRows('transactions'),
      countRows('transactions', query => query.eq('status', 'pending')),
      countRows('agent_matches'),
      countRows('connection_requests', query => query.eq('status', 'pending')),
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
        connection_requests_pending: connectionRequestsPending,
        recent_transaction_amount: Math.round(recentTransactionAmount * 100) / 100,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取运营总览失败' });
  }
});

router.get('/actions', async (_req: Request, res: Response) => {
  try {
    const [pendingTx, incompleteAgents, inactiveServices, highMatches] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, buyer_cid, seller_cid, amount, status, created_at, services(name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('agents')
        .select('cid, nickname, life_stage_tags, agent_config, updated_at')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(50),
      supabase
        .from('services')
        .select('id, provider_cid, name, status, updated_at, agents!inner(nickname)')
        .in('status', ['pending', 'paused'])
        .order('updated_at', { ascending: false })
        .limit(10),
      supabase
        .from('agent_matches')
        .select(`
          id, requester_cid, target_cid, total_score, summary, status, created_at,
          requester:agents!agent_matches_requester_cid_fkey(cid, nickname),
          target:agents!agent_matches_target_cid_fkey(cid, nickname)
        `)
        .gte('total_score', 75)
        .eq('status', 'generated')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const errors = [pendingTx.error, incompleteAgents.error, inactiveServices.error, highMatches.error].filter(Boolean);
    if (errors.length > 0) throw errors[0];

    const agentsToComplete = (incompleteAgents.data || [])
      .map((agent: any) => ({
        ...agent,
        completion: calculateAgentCompletion(agent),
      }))
      .filter((agent: any) => agent.completion < 80)
      .slice(0, 10);

    res.json({
      data: {
        pending_transactions: pendingTx.data || [],
        incomplete_agents: agentsToComplete,
        inactive_services: (inactiveServices.data || []).map((service: any) => ({
          ...service,
          provider_nickname: service.agents?.nickname,
          agents: undefined,
        })),
        high_score_matches: highMatches.data || [],
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取待处理事项失败' });
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

router.get('/demands', async (req: Request, res: Response) => {
  try {
    const { q, status, cid, limit } = req.query;
    let query = supabase
      .from('agents')
      .select('cid, nickname, life_stage_tags, trust_score, status, agent_config, updated_at')
      .order('updated_at', { ascending: false });

    if (cid) {
      query = query.eq('cid', String(cid));
    }

    const parsedLimit = Number(limit);
    query = query.limit(Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 80);

    const { data, error } = await query;
    if (error) throw error;

    const keyword = sanitizeSearch(String(q || '')).toLowerCase();
    const statusFilter = String(status || 'all');
    const demands = (data || []).flatMap((agent: any) => {
      const posts = Array.isArray(agent.agent_config?.demand_posts)
        ? agent.agent_config.demand_posts
        : [];
      return posts
        .filter((post: any) => post && post.title)
        .map((post: any) => ({
          id: post.id || '',
          title: post.title || '',
          description: post.description || '',
          status: post.status || 'open',
          created_at: post.created_at || '',
          updated_at: post.updated_at || '',
          agent_cid: agent.cid,
          agent_nickname: agent.nickname,
          agent_status: agent.status,
          trust_score: agent.trust_score || 0,
          life_stage_tags: agent.life_stage_tags || [],
        }));
    })
      .filter((post: any) => statusFilter === 'all' || post.status === statusFilter)
      .filter((post: any) => {
        if (!keyword) return true;
        return [
          post.id,
          post.title,
          post.description,
          post.agent_cid,
          post.agent_nickname,
        ].some(value => String(value || '').toLowerCase().includes(keyword));
      })
      .sort((a: any, b: any) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));

    res.json({ data: demands });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取需求列表失败' });
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

router.get('/connection-requests', async (req: Request, res: Response) => {
  try {
    const { status, cid, limit } = req.query;
    let query = supabase
      .from('connection_requests')
      .select(`
        id, requester_cid, target_cid, message, source_type, source_id, status, created_at, updated_at, responded_at,
        requester:agents!connection_requests_requester_cid_fkey(cid, nickname),
        target:agents!connection_requests_target_cid_fkey(cid, nickname)
      `);

    if (status && status !== 'all') {
      query = query.eq('status', String(status));
    }
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
    res.status(400).json({ error: err.message || '获取连接申请列表失败' });
  }
});

router.get('/feedback', async (req: Request, res: Response) => {
  try {
    const { status, type, limit } = req.query;
    let query = supabase
      .from('beta_feedback')
      .select('id, agent_cid, type, page, content, contact, status, created_at, resolved_at, agents(nickname)')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', String(status));
    }
    if (type && type !== 'all') {
      query = query.eq('type', String(type));
    }

    const parsedLimit = Number(limit);
    query = query.limit(Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50);

    const { data, error } = await query;
    if (error) throw error;
    res.json({
      data: (data || []).map((item: any) => ({
        ...item,
        agent_nickname: item.agents?.nickname,
        agents: undefined,
      })),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取内测反馈失败' });
  }
});

router.patch('/feedback/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body || {};
    if (!['open', 'reviewing', 'resolved', 'ignored'].includes(status)) {
      return res.status(400).json({ error: '无效的反馈状态' });
    }

    const updateData: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === 'resolved' || status === 'ignored') {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('beta_feedback')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: '反馈不存在' });
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新反馈状态失败' });
  }
});

router.get('/community-posts', async (req: Request, res: Response) => {
  try {
    const { status, type, limit } = req.query;
    let query = supabase
      .from('community_posts')
      .select('*');

    if (status && status !== 'all') {
      query = query.eq('status', String(status));
    }
    if (type && type !== 'all') {
      query = query.eq('type', String(type));
    }

    const parsedLimit = Number(limit);
    query = query.limit(Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50);

    const { data, error } = await query
      .order('is_pinned', { ascending: false })
      .order('sort_weight', { ascending: false })
      .order('published_at', { ascending: false })
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取社区动态失败' });
  }
});

router.post('/community-posts', async (req: Request, res: Response) => {
  try {
    const body = CreateCommunityPostSchema.parse(req.body);
    const { data, error } = await supabase
      .from('community_posts')
      .insert(normalizeCommunityPost(body))
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '创建社区动态失败' });
  }
});

router.patch('/community-posts/:id', async (req: Request, res: Response) => {
  try {
    const body = UpdateCommunityPostSchema.parse(req.body);
    const { data, error } = await supabase
      .from('community_posts')
      .update({
        ...normalizeCommunityPost(body),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: '社区动态不存在' });
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新社区动态失败' });
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

    if (
      body.agent_config !== undefined
      || body.value_profile !== undefined
      || body.basic_profile !== undefined
      || body.avatar_url !== undefined
    ) {
      updateData.agent_config = {
        ...currentConfig,
        ...(body.agent_config || {}),
        avatar_url: body.avatar_url !== undefined ? body.avatar_url : currentConfig.avatar_url,
        basic_profile: {
          ...((currentConfig.basic_profile || {}) as Record<string, any>),
          ...((body.agent_config && body.agent_config.basic_profile) || {}),
          ...(body.basic_profile || {}),
        },
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

router.patch('/agents/:cid/demands/:demandId', async (req: Request, res: Response) => {
  try {
    const { cid, demandId } = req.params;
    const { title, description, status } = req.body || {};
    if (status !== undefined && !['open', 'resolved', 'hidden'].includes(status)) {
      return res.status(400).json({ error: '无效的需求状态' });
    }

    const { data: existing, error: readError } = await supabase
      .from('agents')
      .select('agent_config')
      .eq('cid', cid)
      .single();

    if (readError) throw readError;
    if (!existing) return res.status(404).json({ error: 'Agent不存在' });

    const currentConfig = (existing.agent_config || {}) as Record<string, any>;
    const demandPosts = Array.isArray(currentConfig.demand_posts)
      ? currentConfig.demand_posts
      : [];
    let found = false;
    const updatedPosts = demandPosts.map((post: any) => {
      if (String(post.id || '') !== demandId) return post;
      found = true;
      return {
        ...post,
        title: title !== undefined ? String(title).trim().slice(0, 120) : post.title,
        description: description !== undefined ? String(description).trim().slice(0, 1000) : post.description,
        status: status || post.status || 'open',
        updated_at: new Date().toISOString(),
      };
    });

    if (!found) return res.status(404).json({ error: '需求不存在' });

    const valueProfile = {
      ...((currentConfig.value_profile || {}) as Record<string, any>),
      vision_needs: composeOpenDemandSummary(updatedPosts),
    };
    const agentConfig = {
      ...currentConfig,
      demand_posts: updatedPosts,
      value_profile: valueProfile,
    };

    const { data, error } = await supabase
      .from('agents')
      .update({ agent_config: agentConfig, updated_at: new Date().toISOString() })
      .eq('cid', cid)
      .select('cid, nickname, agent_config, updated_at')
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新需求失败' });
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

router.patch('/transactions/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body || {};
    if (!['confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: '无效的交易状态' });
    }

    const updateData: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: '交易不存在' });
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新交易状态失败' });
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

function calculateAgentCompletion(agent: any) {
  const config = agent.agent_config || {};
  const profile = config.value_profile || {};
  const fields = [
    agent.nickname,
    agent.life_stage_tags && agent.life_stage_tags.length > 0 ? 'tags' : '',
    profile.core_value,
    profile.service_capabilities,
    profile.project_experience,
    profile.vision_needs,
  ];
  const completed = fields.filter(value => String(value || '').trim().length > 0).length;
  return Math.round((completed / fields.length) * 100);
}

function composeOpenDemandSummary(posts: any[]) {
  return (posts || [])
    .filter(item => item && item.status === 'open' && item.title)
    .map(item => `${item.title}：${item.description || ''}`)
    .join('\n');
}

function normalizeCommunityPost(input: Record<string, any>) {
  const data: Record<string, any> = {};
  const allowed = [
    'type',
    'title',
    'summary',
    'action_text',
    'target_type',
    'target_id',
    'target_cid',
    'target_url',
    'status',
    'is_pinned',
    'sort_weight',
    'published_at',
  ];

  allowed.forEach(key => {
    if (input[key] !== undefined) data[key] = input[key];
  });

  if (data.title !== undefined) data.title = String(data.title).trim();
  if (data.summary !== undefined) data.summary = String(data.summary || '').trim();
  if (data.action_text !== undefined) data.action_text = String(data.action_text || '查看').trim() || '查看';
  if (data.target_id !== undefined) data.target_id = data.target_id ? String(data.target_id).trim() : null;
  if (data.target_cid !== undefined) data.target_cid = data.target_cid ? String(data.target_cid).trim() : null;
  if (data.target_url !== undefined) data.target_url = data.target_url ? String(data.target_url).trim() : null;
  if (data.published_at === null || data.published_at === '') delete data.published_at;

  return data;
}

export default router;
