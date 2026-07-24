import { Router, Request, Response } from 'express';
import { supabase, getCurrentCid } from '../lib/supabase';
import { BetaFeedbackSchema } from '../lib/validation';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const body = BetaFeedbackSchema.parse(req.body);
    const { data, error } = await supabase
      .from('beta_feedback')
      .insert({
        agent_cid: cid,
        type: body.type,
        page: body.page || null,
        content: body.content,
        contact: body.contact || null,
        status: 'open',
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '提交反馈失败' });
  }
});

export default router;
