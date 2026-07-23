import { Router, Request, Response } from 'express';
import { supabase, getCurrentCid } from '../lib/supabase';
import { CreateTransactionSchema, FeedbackSchema } from '../lib/validation';

const router = Router();

// ── 创建交易（预约） ──
router.post('/', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const body = CreateTransactionSchema.parse(req.body);

    // 获取服务信息
    const { data: service } = await supabase
      .from('services')
      .select('provider_cid, price')
      .eq('id', body.service_id)
      .single();

    if (!service) return res.status(404).json({ error: '服务不存在' });
    if (service.provider_cid === cid) return res.status(400).json({ error: '不能预约自己的服务' });

    // 自动确认时间：服务预约时间或72小时后
    const autoReleaseAt = body.scheduled_at
      ? new Date(new Date(body.scheduled_at).getTime() + 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        buyer_cid: cid,
        seller_cid: service.provider_cid,
        service_id: body.service_id,
        amount: service.price,
        scheduled_at: body.scheduled_at || null,
        auto_release_at: autoReleaseAt,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '创建交易失败' });
  }
});

// ── 我的交易列表 ──
router.get('/mine', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const { role, status } = req.query;

    let query = supabase
      .from('transactions')
      .select(`
        *,
        services!inner(name, primary_system)
      `)
      .or(`buyer_cid.eq.${cid},seller_cid.eq.${cid}`);

    if (role === 'buyer') {
      query = query.eq('buyer_cid', cid);
    } else if (role === 'seller') {
      query = query.eq('seller_cid', cid);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取交易列表失败' });
  }
});

// ── 交易详情 ──
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const { id } = req.params;
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    // 只有交易双方能看
    if (data.buyer_cid !== cid && data.seller_cid !== cid) {
      return res.status(403).json({ error: '无权查看' });
    }

    res.json({ data });
  } catch (err: any) {
    res.status(404).json({ error: '交易不存在' });
  }
});

// ── 更新交易状态（确认完成/取消） ──
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const { id } = req.params;
    const { status } = req.body;

    if (!['confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: '无效的状态变更' });
    }

    const { data: transaction } = await supabase
      .from('transactions')
      .select('buyer_cid, seller_cid, service_id, status')
      .eq('id', id)
      .single();

    if (!transaction) return res.status(404).json({ error: '交易不存在' });

    // 权限校验
    if (status === 'confirmed') {
      // 服务方确认
      if (transaction.seller_cid !== cid) return res.status(403).json({ error: '仅服务方可以确认开始' });
    } else if (status === 'completed') {
      // 买方确认完成
      if (transaction.buyer_cid !== cid) return res.status(403).json({ error: '仅买方可以确认完成' });
    } else if (status === 'cancelled') {
      // 双方都可取消
      if (transaction.buyer_cid !== cid && transaction.seller_cid !== cid) {
        return res.status(403).json({ error: '无权取消' });
      }
    }

    const updateData: any = { status, updated_at: new Date().toISOString() };
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新交易状态失败' });
  }
});

// ── 提交评分反馈 ──
router.post('/:id/feedback', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const { id } = req.params;
    const body = FeedbackSchema.parse(req.body);

    const { data: transaction } = await supabase
      .from('transactions')
      .select('buyer_cid, seller_cid, service_id, status')
      .eq('id', id)
      .single();

    if (!transaction) return res.status(404).json({ error: '交易不存在' });

    // 只有买方可以评分
    if (transaction.buyer_cid !== cid) return res.status(403).json({ error: '仅买方可以评分' });
    if (transaction.status !== 'completed') return res.status(400).json({ error: '交易尚未完成，无法评分' });

    const updateData: any = {
      actual_score: body.actual_score,
      buyer_note: body.buyer_note,
      status: 'rated',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // 记录预演偏差
    await supabase
      .from('pre_enact_logs')
      .update({ actual_score: body.actual_score })
      .eq('service_id', transaction.service_id)
      .eq('agent_cid', cid)
      .is('actual_score', null);

    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '提交评分失败' });
  }
});

export default router;
