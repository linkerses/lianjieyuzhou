# 🔗 联结宇宙 · 联结者端到端协同网络

联结宇宙是一个面向全生命周期的社区事务网络，通过数字化智能体（Agent）网络实现联结者之间的精准匹配与信任协作。

## 项目结构

```
lianjie-agent/
├── apps/
│   ├── api/          后端 API（Node.js/TypeScript + Supabase）
│   │   ├── src/
│   │   │   ├── index.ts         启动入口
│   │   │   ├── lib/             工具库（Supabase客户端、验证）
│   │   │   ├── routes/          路由模块
│   │   │   │   ├── agents.ts    Agent CRUD
│   │   │   │   ├── services.ts  服务库
│   │   │   │   ├── transactions.ts 交易
│   │   │   │   ├── auth.ts      微信登录
│   │   │   │   ├── pre-enact.ts 预演算法引擎
│   │   │   │   ├── skills.ts    技能系统
│   │   │   │   └── trust.ts     信任评分
│   │   │   └── scripts/
│   │   │       └── seed.ts      种子数据
│   │   ├── supabase/migrations/ 数据库迁移
│   │   ├── .env.example
│   │   └── package.json
│   │
│   ├── miniapp/      微信小程序（C端服务端口）
│   │   ├── pages/
│   │   │   ├── index/          首页（推荐流）
│   │   │   ├── services/       服务列表+详情
│   │   │   ├── booking/        预约
│   │   │   ├── agent/          我的Agent（档案+技能）
│   │   │   ├── transaction/    交易列表+详情
│   │   │   └── profile/        我的
│   │   ├── app.js
│   │   ├── app.json
│   │   └── app.wxss
│   │
│   └── admin/        Web管理后台（Next.js，待搭建）
│
├── docs/              文档
├── scripts/           工具脚本
└── README.md
```

## 技术栈

| 层 | 技术 | 用途 |
|:---|:-----|:-----|
| 数据库 | Supabase (PostgreSQL) + RLS | Agent档案、服务库、交易、授权 |
| 后端 | Node.js/TypeScript + Supabase SDK | API路由、预演算法引擎、技能运行 |
| 前端 | 微信小程序 | C端服务端口 |
| AI | Claude API | 预演算法、技能系统 |
| 支付 | 微信支付 | 交易结算 |
| Auth | Supabase Auth + 微信登录 | 认证 |

## 快速开始

### 1. 数据库

1. 在 [Supabase](https://supabase.com) 创建项目
2. 运行迁移：在 SQL Editor 中执行 `supabase/migrations/001_initial_schema.sql`
3. 启用 Auth 并配置微信登录（V0.2 开发模式可跳过）

### 2. 后端

```bash
cd apps/api
cp .env.example .env
# 编辑 .env 填入 SUPABASE_URL 和 SUPABASE_SERVICE_KEY

npm install
npm run seed   # 初始化种子数据
npm run dev    # 启动开发服务器（端口3001）
```

### 3. 前端（微信小程序）

1. 用微信开发者工具打开 `apps/miniapp`
2. 修改 `app.js` 中的 `API_BASE` 指向本地或部署的后端
3. 编译运行

### 4. 开发模式登录

后端 `POST /api/auth/wechat-login` 传入 `{ code: "dev_mode" }` 即可跳过微信登录，自动绑定测试Agent（UC-M-0001）。

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| POST | /api/auth/wechat-login | 微信登录 |
| POST | /api/agents | 创建Agent |
| GET | /api/agents/me | 获取我的Agent |
| PATCH | /api/agents/me | 更新Agent |
| GET | /api/agents/me/profile/:layer | 获取档案层 |
| PATCH | /api/agents/me/profile/:layer | 更新档案层 |
| PATCH | /api/agents/me/skills | 切换技能 |
| GET | /api/services | 服务列表 |
| POST | /api/services | 上架服务 |
| GET | /api/services/:id | 服务详情 |
| POST | /api/transactions | 创建交易 |
| PATCH | /api/transactions/:id/status | 更新交易状态 |
| POST | /api/transactions/:id/feedback | 提交评分 |
| POST | /api/pre-enact/score | 预演评分 |
| POST | /api/pre-enact/recommend | 推荐列表 |
| GET | /api/skills/mine | 我的技能 |
| GET | /api/trust/my-score | 信任评分 |
| GET | /api/trust/network/mine | 信任网络 |

## 版本

当前版本：V0.2（MVP开发中）→ 目标 V1.0（2026 Q4）
