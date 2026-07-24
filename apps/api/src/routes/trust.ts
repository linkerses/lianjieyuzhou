import { Router, Request, Response } from 'express';
import { supabase, getCurrentCid } from '../lib/supabase';
import { CreateConnectionSchema } from '../lib/validation';

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

    const { data, error } = await supabase
      .from('auth_records')
      .insert({
        granter_cid: cid,
        grantee_cid: body.target_cid,
        auth_scope: 'read',
        data_fields: ['public_profile'],
        duration: 'permanent',
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data: { ...data, target_nickname: target.nickname, already_connected: false } });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '发起连接失败' });
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

export default router;
