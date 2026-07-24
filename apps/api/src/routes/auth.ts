import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { generateToken, isDevLoginEnabled } from '../lib/auth-token';

const router = Router();

interface WechatLoginResponse {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

// ── 微信小程序登录 ──
// 前端调用 wx.login() 获取 code，传给此接口
// 后端用 code 换取 openid，查找或创建 Agent
router.post('/wechat-login', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: '缺少微信登录code' });

    // V0.2 开发模式：使用 dev_mode 跳过微信登录
    if (code === 'dev_mode' || code === 'dev_seller') {
      if (!isDevLoginEnabled()) {
        return res.status(403).json({ error: '开发登录已关闭' });
      }
      return await handleDevLogin(res, code);
    }

    const appId = process.env.WECHAT_APP_ID || '';
    const appSecret = process.env.WECHAT_APP_SECRET || '';

    if (!appId || !appSecret) {
      return res.status(500).json({ error: '微信支付未配置' });
    }

    // 调用微信接口换取 openid
    const wxResp = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`
    );
    const wxData = (await wxResp.json()) as WechatLoginResponse;

    if (wxData.errcode) {
      return res.status(400).json({ error: `微信登录失败: ${wxData.errmsg}` });
    }

    const { openid } = wxData;
    if (!openid) {
      return res.status(400).json({ error: '微信登录失败: 缺少openid' });
    }

    // 查找是否已有 Agent
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('cid, nickname, life_stage_tags')
      .eq('wechat_openid', openid)
      .single();

    if (existingAgent) {
      // 已有 Agent，返回现有信息
      return res.json({
        data: {
          cid: existingAgent.cid,
          nickname: existingAgent.nickname,
          is_new: false,
          token: generateToken(existingAgent.cid),
        },
      });
    }

    // 新用户：自动创建 Agent（基本信息待补充）
    const { count } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true });

    const seq = String((count || 0) + 1).padStart(4, '0');
    const cid = `UC-M-${seq}`;

    const { data: newAgent, error } = await supabase
      .from('agents')
      .insert({
        cid,
        nickname: `联结者${seq}`,
        wechat_openid: openid,
        life_stage_tags: [],
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      data: {
        cid: newAgent.cid,
        nickname: newAgent.nickname,
        is_new: true,
        token: generateToken(newAgent.cid),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '登录失败' });
  }
});

// ── 开发模式模拟登录 ──
async function handleDevLogin(res: Response, code = 'dev_mode') {
  // 查找或创建开发者测试用 Agent
  const isSeller = code === 'dev_seller';
  const devCid = isSeller ? 'UC-B-0001' : 'UC-M-0001';
  const nickname = isSeller ? '陈氏自在妙手堂' : '开发者';
  const wechatOpenid = isSeller ? 'dev_seller' : 'dev_mode';
  const lifeStageTags = isSeller ? ['health', 'spirit'] : ['wealth', 'create'];

  const { data: existing } = await supabase
    .from('agents')
    .select('cid, nickname')
    .eq('cid', devCid)
    .maybeSingle();

  if (existing) {
    return res.json({
      data: {
        cid: existing.cid,
        nickname: existing.nickname,
        is_new: false,
        token: generateToken(existing.cid),
      },
    });
  }

  // 创建开发用 Agent
  const { data: newAgent, error } = await supabase
    .from('agents')
    .insert({
      cid: devCid,
      nickname,
      wechat_openid: wechatOpenid,
      life_stage_tags: lifeStageTags,
    })
    .select()
    .single();

  if (error) throw error;

  res.json({
    data: {
      cid: newAgent.cid,
      nickname: newAgent.nickname,
      is_new: true,
      token: generateToken(newAgent.cid),
    },
  });
}
export default router;
