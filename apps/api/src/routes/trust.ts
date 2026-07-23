import { Router, Request, Response } from 'express';
import { supabase, getCurrentCid } from '../lib/supabase';

const router = Router();

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

// ── 查另一个联结者的信任评分 ──
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

// ── 获取信任网络 ──
router.get('/network/mine', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    // 获取直接授权连接（我授权的）
    const { data: myAuths } = await supabase
      .from('auth_records')
      .select('grantee_cid, auth_scope, status, created_at')
      .eq('granter_cid', cid)
      .eq('status', 'active');

    // 获取授权给我的
    const { data: authToMe } = await supabase
      .from('auth_records')
      .select('granter_cid, auth_scope, status, created_at')
      .eq('grantee_cid', cid)
      .eq('status', 'active');

    // 获取我完成的交易方
    const { data: myTransactions } = await supabase
      .from('transactions')
      .select('seller_cid, actual_score')
      .eq('buyer_cid', cid)
      .eq('status', 'rated')
      .limit(20);

    const directConnections = (myAuths || []).map(a => a.grantee_cid);
    const connectedToMe = (authToMe || []).map(a => a.granter_cid);
    const tradedWith = (myTransactions || []).map(t => t.seller_cid);

    // 合并所有连接CID
    const allConnectedCids = [...new Set([...directConnections, ...connectedToMe, ...tradedWith])];

    // 获取连接详情
    const { data: connectedAgents } = allConnectedCids.length > 0
      ? await supabase
          .from('agents')
          .select('cid, nickname, trust_score')
          .in('cid', allConnectedCids)
      : { data: [] };

    res.json({
      data: {
        direct_auth_count: myAuths?.length || 0,
        auth_to_me_count: authToMe?.length || 0,
        traded_count: tradedWith.length,
        connections: connectedAgents || [],
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取信任网络失败' });
  }
});

export default router;
