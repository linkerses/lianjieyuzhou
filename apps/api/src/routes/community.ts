import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

router.get('/posts', async (req: Request, res: Response) => {
  try {
    const parsedLimit = Number(req.query.limit);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 20) : 6;

    const { data, error } = await supabase
      .from('community_posts')
      .select('id, type, title, summary, action_text, target_type, target_id, target_cid, target_url, is_pinned, sort_weight, published_at, created_at')
      .eq('status', 'active')
      .order('is_pinned', { ascending: false })
      .order('sort_weight', { ascending: false })
      .order('published_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取社区动态失败' });
  }
});

export default router;
