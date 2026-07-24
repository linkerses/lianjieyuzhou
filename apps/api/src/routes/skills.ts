import { Router, Request, Response } from 'express';
import { supabase, getCurrentCid } from '../lib/supabase';

const router = Router();

// ── 技能定义 ──
const SKILL_DEFINITIONS = {
  state_scan: {
    name: '🫀 状态扫描',
    system: 'health',
    description: '周期性评估联结者的身体状态，识别异常信号（睡眠/疲劳/疼痛）',
    levels: ['L1 监测级', 'L2 建议级', 'L3 干预级'],
  },
  growth_path: {
    name: '📚 成长路径',
    system: 'growth',
    description: '根据联结者的生命阶段推荐学习方向，追踪技能成长轨迹',
    levels: ['L1 监测级', 'L2 建议级'],
  },
  spirit_charge: {
    name: '🧘 精神充电',
    system: 'spirit',
    description: '当联结者出现迷茫/焦虑信号时，提供简短的引导练习',
    levels: ['L1 监测级', 'L2 建议级', 'L3 干预级'],
  },
  space_diagnosis: {
    name: '🏠 空间诊断',
    system: 'living',
    description: '评估联结者的生活环境质量，给出改善建议',
    levels: ['L1 监测级', 'L2 建议级'],
  },
  relation_heat: {
    name: '🤝 关系热度',
    system: 'connection',
    description: '扫描联结者的社交网络健康度，提醒"你最近和谁失联了"',
    levels: ['L1 监测级', 'L2 建议级'],
  },
  asset_board: {
    name: '💰 资产看板',
    system: 'wealth',
    description: '梳理联结者的收入/支出/资产结构，提示财务风险',
    levels: ['L1 监测级', 'L2 建议级'],
  },
  creation_catalyze: {
    name: '✨ 创作催化',
    system: 'create',
    description: '识别联结者的创作冲动，提醒"你有一个想法该落地了"',
    levels: ['L1 监测级', 'L2 建议级', 'L3 干预级'],
  },
  explore_trigger: {
    name: '🌍 探索触发',
    system: 'explore',
    description: '根据联结者的状态推荐"该出去走走"',
    levels: ['L1 监测级', 'L2 建议级'],
  },
  future_predict: {
    name: '🔮 未来预判',
    system: 'future',
    description: '基于联结者当前轨迹推演3个月/1年/3年后的可能状态',
    levels: ['L1 监测级', 'L2 建议级'],
  },
};

// ── 获取所有技能定义 ──
router.get('/definitions', async (_req: Request, res: Response) => {
  res.json({ data: SKILL_DEFINITIONS });
});

// ── 获取我的技能状态 ──
router.get('/mine', async (req: Request, res: Response) => {
  try {
    const cid = getCurrentCid(req);
    if (!cid) return res.status(401).json({ error: '未登录' });

    const { data: agent } = await supabase
      .from('agents')
      .select('skill_status, life_stage_tags')
      .eq('cid', cid)
      .single();

    if (!agent) return res.status(404).json({ error: 'Agent不存在' });

    const skillStatus = (agent.skill_status || {}) as Record<string, string>;
    const tags = (agent.life_stage_tags || []) as string[];

    // 组装技能列表（含定义）
    const skills = Object.entries(SKILL_DEFINITIONS).map(([key, def]) => ({
      key,
      ...def,
      status: skillStatus[key] || 'inactive',
      // 如果联结者的活跃系统包含技能归属系统，标记为"推荐开启"
      recommended: tags.includes(def.system),
    }));

    res.json({ data: skills });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '获取技能状态失败' });
  }
});

// ── 技能运行：状态扫描（L3干预级）──
//
// 扫描条件：当联结者连续高强度工作超过阈值时触发
// 此接口由定时任务或Agent主动调用
router.post('/state-scan/check', async (req: Request, res: Response) => {
  try {
    const { agent_cid } = req.body;
    if (!agent_cid) return res.status(400).json({ error: '缺少agent_cid' });

    const { data: agent } = await supabase
      .from('agents')
      .select('cid, skill_status')
      .eq('cid', agent_cid)
      .single();

    if (!agent) return res.status(404).json({ error: 'Agent不存在' });

    // 检查技能是否开启
    const skillStatus = (agent.skill_status || {}) as Record<string, string>;
    if (skillStatus.state_scan !== 'active') {
      return res.json({ data: { triggered: false, reason: '技能未开启' } });
    }

    // V0.2: 简化版状态扫描
    // V1.0: 将接入真实活动数据
    const checkResult = {
      triggered: false,
      level: null as string | null,
      message: null as string | null,
      suggestions: [] as string[],
    };

    // 获取联结者最近3笔交易的间隔（判断活跃度）
    const { data: recentTransactions } = await supabase
      .from('transactions')
      .select('created_at')
      .eq('buyer_cid', agent_cid)
      .order('created_at', { ascending: false })
      .limit(3);

    // V0.2: 如果联结者没有交易记录且技能刚开启，发送欢迎式监测报告
    if (!recentTransactions || recentTransactions.length === 0) {
      checkResult.message = '状态扫描已启动。你的Agent将定期关注你的身体信号，并在需要时提醒你。';
      checkResult.level = 'L1';
    }

    // 获取联结者最近的预演记录评分偏差（判断状态变化）
    const { data: recentLogs } = await supabase
      .from('pre_enact_logs')
      .select('total_score, actual_score')
      .eq('agent_cid', agent_cid)
      .not('actual_score', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentLogs && recentLogs.length >= 2) {
      const avgDeviation = recentLogs.reduce((sum, log) => {
        return sum + ((Number(log.actual_score || 0) * 20) - log.total_score);
      }, 0) / recentLogs.length;

      // 如果实际评分持续低于预演评分，可能反映联结者状态下滑
      if (avgDeviation < -10) {
        checkResult.triggered = true;
        checkResult.level = 'L3';
        checkResult.message = '检测到你近期的服务体验评分低于预期，是否想聊聊最近的状态？';
        checkResult.suggestions = ['预约一次健康调理', '与联结者聊聊', '做一次状态评估'];
      }
    }

    res.json({ data: checkResult });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '状态扫描失败' });
  }
});

// ── 技能运行：成长路径（L1监测级）──
router.post('/growth-path/check', async (req: Request, res: Response) => {
  try {
    const { agent_cid } = req.body;
    if (!agent_cid) return res.status(400).json({ error: '缺少agent_cid' });

    const { data: agent } = await supabase
      .from('agents')
      .select('cid, life_stage_tags, skill_status')
      .eq('cid', agent_cid)
      .single();

    if (!agent) return res.status(404).json({ error: 'Agent不存在' });

    const skillStatus = (agent.skill_status || {}) as Record<string, string>;
    if (skillStatus.growth_path !== 'active') {
      return res.json({ data: { triggered: false, reason: '技能未开启' } });
    }

    const tags = (agent.life_stage_tags || []) as string[];
    const systemLabelMap: Record<string, string> = {
      health: '🫀 健康', living: '🏠 生活', connection: '🤝 连接',
      growth: '📚 成长', wealth: '💰 财富', create: '✨ 创造',
      explore: '🌍 探索', spirit: '🧘 精神', future: '🔮 未来',
    };

    const suggestions = tags.length > 0
      ? tags.map((t: string) => `你在${systemLabelMap[t] || t}领域还有成长空间，是否想了解一下相关资源？`)
      : ['完善你的生命阶段标签，你的Agent将为你推荐更精准的成长方向'];

    res.json({
      data: {
        triggered: true,
        level: 'L1',
        message: `你当前活跃在 ${tags.map((t: string) => systemLabelMap[t] || t).join('、') || '暂无'} 领域`,
        suggestions,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '成长路径扫描失败' });
  }
});

// ── 技能运行：精神充电（L1+L3）──
router.post('/spirit-charge/check', async (req: Request, res: Response) => {
  try {
    const { agent_cid } = req.body;
    if (!agent_cid) return res.status(400).json({ error: '缺少agent_cid' });

    const { data: agent } = await supabase
      .from('agents')
      .select('cid, skill_status')
      .eq('cid', agent_cid)
      .single();

    if (!agent) return res.status(404).json({ error: 'Agent不存在' });

    const skillStatus = (agent.skill_status || {}) as Record<string, string>;
    if (skillStatus.spirit_charge !== 'active') {
      return res.json({ data: { triggered: false, reason: '技能未开启' } });
    }

    // V0.2: 简化版——基于交易活跃度和预演偏差推断状态
    const { data: recentLogs } = await supabase
      .from('pre_enact_logs')
      .select('total_score')
      .eq('agent_cid', agent_cid)
      .order('created_at', { ascending: false })
      .limit(3);

    // 只是提供一个温和的"你还好吗"检查
    res.json({
      data: {
        triggered: true,
        level: 'L1',
        message: '精神充电技能已开启。当你感觉需要停下来的时候，你的Agent会在这里。',
        suggestions: ['试试3分钟呼吸练习（在对话中输入"3分钟呼吸"）', '回顾一下你最近的成果', '约一位联结者聊聊天'],
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '精神充电扫描失败' });
  }
});

export default router;
