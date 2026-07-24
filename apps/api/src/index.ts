import express from 'express';
import cors from 'cors';

import agentsRouter from './routes/agents';
import servicesRouter from './routes/services';
import transactionsRouter from './routes/transactions';
import authRouter from './routes/auth';
import preEnactRouter from './routes/pre-enact';
import skillsRouter from './routes/skills';
import trustRouter from './routes/trust';
import matchesRouter from './routes/matches';
import adminRouter from './routes/admin';
import feedbackRouter from './routes/feedback';
import { verifyToken } from './lib/auth-token';

const app = express();
const PORT = process.env.PORT || 3001;

// ── 中间件 ──
app.use(cors());
app.use(express.json());

// Auth中间件：从Token中提取CID注入请求头
app.use('/api', (req, _res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const payload = verifyToken(authHeader.slice(7));
    if (payload) {
      req.headers['x-connector-cid'] = payload.cid;
    }
  }
  next();
});

// ── 路由 ──
app.use('/api/agents', agentsRouter);
app.use('/api/services', servicesRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/auth', authRouter);
app.use('/api/pre-enact', preEnactRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/trust', trustRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/admin', adminRouter);

// ── 健康检查 ──
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.2.0',
    name: '联结宇宙 · AI基建平台 + 中枢平台',
    time: new Date().toISOString(),
  });
});

// ── 全局错误处理 ──
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// ── 启动 ──
app.listen(PORT, () => {
  console.log(`\n  🚀 联结宇宙 API 已启动`);
  console.log(`  📡 端口: ${PORT}`);
  console.log(`  ⏰ 时间: ${new Date().toISOString()}`);
  console.log(`  📁 环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n  API 文档:`);
  console.log(`  GET  /api/health           — 健康检查`);
  console.log(`  POST /api/auth/wechat-login — 微信登录`);
  console.log(`  POST /api/agents            — 创建Agent`);
  console.log(`  GET  /api/agents/me         — 我的Agent`);
  console.log(`  PATCH /api/agents/me        — 更新Agent`);
  console.log(`  GET  /api/agents/me/profile/:layer — Agent档案`);
  console.log(`  PATCH /api/agents/me/profile/:layer — 更新档案`);
  console.log(`  PATCH /api/agents/me/skills — 切换技能`);
  console.log(`  GET  /api/services          — 服务列表`);
  console.log(`  POST /api/services          — 上架服务`);
  console.log(`  GET  /api/services/:id      — 服务详情`);
  console.log(`  POST /api/transactions      — 创建交易`);
  console.log(`  GET  /api/transactions/mine — 我的交易`);
  console.log(`  POST /api/transactions/:id/feedback — 评分`);
  console.log(`  POST /api/pre-enact/score   — 预演评分`);
  console.log(`  POST /api/pre-enact/recommend — 推荐列表`);
  console.log(`  GET  /api/skills/definitions  — 技能定义`);
  console.log(`  GET  /api/skills/mine         — 我的技能`);
  console.log(`  GET  /api/trust/my-score      — 我的信任评分`);
  console.log(`  GET  /api/trust/network/mine  — 信任网络`);
  console.log(`  POST /api/matches/analyze     — Agent匹配报告`);
  console.log(`  POST /api/feedback            — 内测反馈`);
  console.log(`\n  🔧 开发模式: code=dev_mode 可跳过微信登录\n`);
});
