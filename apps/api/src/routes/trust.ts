import { Router, Request, Response } from 'express';
import { supabase, getCurrentCid } from '../lib/supabase';
import { CreateConnectionSchema, UpdateConnectionRequestSchema, CreateConnectionMessageSchema } from '../lib/validation';

const router = Router();

router.post('/connect', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const body = CreateConnectionSchema.parse(req.body);
    if (body.target_cid === cid) {
      return res.status(400).json({ error: '不能连接自己的Agent' });
    }

    const { data: target } = await supabase
      .from('agents')
      .select('cid, nickname')
      .eq('cid', body.target_cid)
      .single();

    if (!target) return res.status(404).json({ error: '目标Agent不存在' });

    const { data: existing } = await supabase
      .from('auth_records')
      .select('*')
      .eq('granter_cid', cid)
      .eq('grantee_cid', body.target_cid)
      .eq('auth_scope', 'read')
      .eq('status', 'active')
      .contains('data_fields', ['public_profile'])
      .limit(1);

    if (existing && existing.length > 0) {
      return res.json({ data: { ...existing[0], target_nickname: target.nickname, already_connected: true } });
    }

    const { data: pending } = await supabase
      .from('connection_requests')
      .select('id, status, created_at')
      .eq('requester_cid', cid)
      .eq('target_cid', body.target_cid)
      .eq('status', 'pending')
      .limit(1);

    if (pending && pending.length > 0) {
      return res.json({
        data: {
          ...pending[0],
          target_nickname: target.nickname,
          already_requested: true,
          already_connected: false,
        },
      });
    }

    const { data, error } = await supabase
      .from('connection_requests')
      .insert({
        requester_cid: cid,
        target_cid: body.target_cid,
        message: body.message || '我对你的公开档案或需求感兴趣，希望先建立一次轻量连接。',
        source_type: body.source_type || 'agent',
        source_id: body.source_id || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data: { ...data, target_nickname: target.nickname, already_requested: false, already_connected: false } });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '发起连接失败' });
  }
});

router.get('/requests/mine', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const [incomingResult, outgoingResult] = await Promise.all([
      supabase
        .from('connection_requests')
        .select(`
          id, requester_cid, target_cid, message, source_type, source_id, status, created_at, updated_at, responded_at,
          requester:agents!connection_requests_requester_cid_fkey(cid, nickname, trust_score, life_stage_tags, agent_config)
        `)
        .eq('target_cid', cid)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('connection_requests')
        .select(`
          id, requester_cid, target_cid, message, source_type, source_id, status, created_at, updated_at, responded_at,
          target:agents!connection_requests_target_cid_fkey(cid, nickname, trust_score, life_stage_tags, agent_config)
        `)
        .eq('requester_cid', cid)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (incomingResult.error) throw incomingResult.error;
    if (outgoingResult.error) throw outgoingResult.error;

    const incoming = incomingResult.data || [];
    const outgoing = outgoingResult.data || [];
    const messageMeta = await getConnectionMessageMeta([...incoming, ...outgoing].map((item: any) => item.id));

    res.json({
      data: {
        incoming: incoming.map((item: any) => ({
          ...item,
          ...(messageMeta.get(item.id) || { messages_count: 0, latest_message: null }),
          requester: item.requester ? formatConnectionAgent(item.requester) : null,
        })),
        outgoing: outgoing.map((item: any) => ({
          ...item,
          ...(messageMeta.get(item.id) || { messages_count: 0, latest_message: null }),
          target: item.target ? formatConnectionAgent(item.target) : null,
        })),
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取连接申请失败' });
  }
});

router.patch('/requests/:id/status', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const body = UpdateConnectionRequestSchema.parse(req.body);
    const { data: request, error: readError } = await supabase
      .from('connection_requests')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (readError) throw readError;
    if (!request) return res.status(404).json({ error: '连接申请不存在' });
    if (body.status === 'closed' && request.requester_cid !== cid) {
      return res.status(403).json({ error: '只有申请人可以关闭申请' });
    }
    if (body.status !== 'closed' && request.target_cid !== cid) {
      return res.status(403).json({ error: '只有接收方可以处理申请' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: '该申请已处理' });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('connection_requests')
      .update({
        status: body.status,
        responded_at: now,
        updated_at: now,
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    if (body.status === 'accepted') {
      await ensureActiveConnection(request.requester_cid, request.target_cid);
    }

    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '处理连接申请失败' });
  }
});

router.get('/requests/:id/messages', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const { data: request, error: requestError } = await supabase
      .from('connection_requests')
      .select(`
        id, requester_cid, target_cid, message, source_type, source_id, status, created_at, updated_at, responded_at,
        requester:agents!connection_requests_requester_cid_fkey(cid, nickname, trust_score, life_stage_tags, agent_config),
        target:agents!connection_requests_target_cid_fkey(cid, nickname, trust_score, life_stage_tags, agent_config)
      `)
      .eq('id', req.params.id)
      .single();

    if (requestError) throw requestError;
    if (!request) return res.status(404).json({ error: '联结申请不存在' });
    if (request.requester_cid !== cid && request.target_cid !== cid) {
      return res.status(403).json({ error: '无权查看该联结会话' });
    }

    const { data: messages, error: messageError } = await supabase
      .from('connection_messages')
      .select('id, request_id, sender_cid, content, created_at')
      .eq('request_id', req.params.id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (messageError) throw messageError;

    res.json({
      data: {
        request: {
          ...request,
          requester: request.requester ? formatConnectionAgent(request.requester) : null,
          target: request.target ? formatConnectionAgent(request.target) : null,
        },
        messages: messages || [],
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取联结会话失败' });
  }
});

router.post('/requests/:id/messages', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const body = CreateConnectionMessageSchema.parse(req.body);
    const content = body.content.trim();
    if (!content) return res.status(400).json({ error: '请填写留言内容' });

    const { data: request, error: requestError } = await supabase
      .from('connection_requests')
      .select('id, requester_cid, target_cid, status')
      .eq('id', req.params.id)
      .single();

    if (requestError) throw requestError;
    if (!request) return res.status(404).json({ error: '联结申请不存在' });
    if (request.requester_cid !== cid && request.target_cid !== cid) {
      return res.status(403).json({ error: '无权回复该联结会话' });
    }
    if (request.status !== 'accepted') {
      return res.status(400).json({ error: '接受联结后才能继续留言' });
    }

    const { data, error } = await supabase
      .from('connection_messages')
      .insert({
        request_id: req.params.id,
        sender_cid: cid,
        content,
      })
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('connection_requests')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.status(201).json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '发送联结留言失败' });
  }
});

// ── 我的信任评分 ──
router.get('/my-score', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const { data: agent } = await supabase
      .from('agents')
      .select('cid, trust_score')
      .eq('cid', cid)
      .single();

    if (!agent) return res.status(404).json({ error: 'Agent不存在' });

    // 统计交易数据
    const [asBuyer, asSeller] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, status')
        .eq('buyer_cid', cid),
      supabase
        .from('transactions')
        .select('id, status, actual_score')
        .eq('seller_cid', cid)
        .eq('status', 'rated'),
    ]);

    const totalTransactions = (asBuyer.data?.length || 0) + (asSeller.data?.length || 0);
    const completedDeliveries = asSeller.data?.length || 0;
    const avgRating = asSeller.data && asSeller.data.length > 0
      ? asSeller.data.reduce((sum, t) => sum + (t.actual_score || 0), 0) / asSeller.data.length
      : 0;

    res.json({
      data: {
        trust_score: agent.trust_score,
        total_transactions: totalTransactions,
        completed_deliveries: completedDeliveries,
        avg_rating: Math.round(avgRating * 100) / 100,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── 获取我的信任网络 ──
router.get('/network/mine', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const [myAuthsResult, authToMeResult, myTransactionsResult] = await Promise.all([
      supabase
        .from('auth_records')
        .select('grantee_cid, auth_scope, status, created_at')
        .eq('granter_cid', cid)
        .eq('status', 'active'),
      supabase
        .from('auth_records')
        .select('granter_cid, auth_scope, status, created_at')
        .eq('grantee_cid', cid)
        .eq('status', 'active'),
      supabase
        .from('transactions')
        .select('seller_cid, actual_score')
        .eq('buyer_cid', cid)
        .eq('status', 'rated')
        .limit(20),
    ]);

    const myAuths = myAuthsResult.data || [];
    const authToMe = authToMeResult.data || [];
    const myTransactions = myTransactionsResult.data || [];
    const outgoingCids = myAuths.map(a => a.grantee_cid);
    const incomingCids = authToMe.map(a => a.granter_cid);
    const tradedCids = myTransactions.map(t => t.seller_cid);
    const allConnectedCids = [...new Set([...outgoingCids, ...incomingCids, ...tradedCids])];

    const { data: connectedAgents } = allConnectedCids.length > 0
      ? await supabase
          .from('agents')
          .select('cid, nickname, trust_score, life_stage_tags, agent_config')
          .in('cid', allConnectedCids)
      : { data: [] };

    const agentMap = new Map((connectedAgents || []).map((agent: any) => [agent.cid, formatConnectionAgent(agent)]));

    res.json({
      data: {
        direct_auth_count: myAuths.length,
        auth_to_me_count: authToMe.length,
        traded_count: tradedCids.length,
        outgoing: outgoingCids.map(targetCid => agentMap.get(targetCid)).filter(Boolean),
        incoming: incomingCids.map(sourceCid => agentMap.get(sourceCid)).filter(Boolean),
        traded: tradedCids.map(sellerCid => agentMap.get(sellerCid)).filter(Boolean),
        connections: allConnectedCids.map(connectedCid => agentMap.get(connectedCid)).filter(Boolean),
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取信任网络失败' });
  }
});

router.get('/:cid', async (req: Request, res: Response) => {
  try {
    const { cid } = req.params;
    const { data: agent } = await supabase
      .from('agents')
      .select('cid, nickname, trust_score')
      .eq('cid', cid)
      .single();

    if (!agent) return res.status(404).json({ error: '联结者不存在' });

    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('seller_cid', cid)
      .eq('status', 'rated');

    res.json({
      data: {
        cid: agent.cid,
        nickname: agent.nickname,
        trust_score: agent.trust_score,
        completed_transactions: count || 0,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

function formatConnectionAgent(agent: any) {
  const config = agent.agent_config || {};
  return {
    cid: agent.cid,
    nickname: agent.nickname,
    trust_score: agent.trust_score || 0,
    life_stage_tags: agent.life_stage_tags || [],
    avatar_url: config.avatar_url || '',
  };
}

async function ensureActiveConnection(requesterCid: string, targetCid: string) {
  const { data: existing } = await supabase
    .from('auth_records')
    .select('id')
    .eq('granter_cid', requesterCid)
    .eq('grantee_cid', targetCid)
    .eq('auth_scope', 'read')
    .eq('status', 'active')
    .contains('data_fields', ['public_profile'])
    .limit(1);

  if (existing && existing.length > 0) return existing[0];

  const { data, error } = await supabase
    .from('auth_records')
    .insert({
      granter_cid: requesterCid,
      grantee_cid: targetCid,
      auth_scope: 'read',
      data_fields: ['public_profile'],
      duration: 'permanent',
      status: 'active',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getConnectionMessageMeta(requestIds: string[]) {
  const ids = [...new Set((requestIds || []).filter(Boolean))];
  const meta = new Map<string, any>();
  if (ids.length === 0) return meta;

  const { data, error } = await supabase
    .from('connection_messages')
    .select('id, request_id, sender_cid, content, created_at')
    .in('request_id', ids)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw error;

  (data || []).forEach((message: any) => {
    const current = meta.get(message.request_id) || {
      messages_count: 0,
      latest_message: null,
    };
    current.messages_count += 1;
    if (!current.latest_message) {
      current.latest_message = message;
    }
    meta.set(message.request_id, current);
  });

  return meta;
}

export default router;
