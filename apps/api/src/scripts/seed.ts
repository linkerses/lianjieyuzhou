// ══════════════════════════════════════════════
//  联结宇宙 · 种子数据脚本
//  运行方式: npx tsx src/scripts/seed.ts
//  用途: 初始化开发环境数据（Agent + 服务）
// ══════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 请设置 SUPABASE_URL 和 SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('\n  🌱 联结宇宙 · 种子数据初始化\n');

  // ── 1. 创建开发者测试 Agent ──
  console.log('  📦 创建测试 Agent...');

  const { data: devAgent, error: agentErr } = await supabase
    .from('agents')
    .upsert({
      cid: 'UC-M-0001',
      nickname: '开发者',
      wechat_openid: 'dev_mode',
      life_stage_tags: ['wealth', 'create'],
      trust_threshold: 'open',
      energy_status: '输出期',
      trust_score: 4.0,
    })
    .select()
    .single();

  if (agentErr) {
    console.error('  ❌ 创建Agent失败:', agentErr.message);
  } else {
    console.log(`  ✅ Agent ${devAgent.cid} (${devAgent.nickname})`);
  }

  // ── 2. 创建妙手堂服务方 Agent ──
  console.log('  📦 创建妙手堂服务方 Agent...');

  const { data: mstAgent, error: mstErr } = await supabase
    .from('agents')
    .upsert({
      cid: 'UC-B-0001',
      nickname: '陈氏自在妙手堂',
      wechat_openid: 'mst_001',
      life_stage_tags: ['health', 'spirit'],
      trust_threshold: 'open',
      energy_status: '输出期',
      trust_score: 4.5,
    })
    .select()
    .single();

  if (mstErr) {
    console.error('  ❌ 创建妙手堂Agent失败:', mstErr.message);
  } else {
    console.log(`  ✅ Agent ${mstAgent.cid} (${mstAgent.nickname})`);
  }

  // ── 3. 创建第二个测试Agent（模拟梁宇帆） ──
  const { data: lyfAgent, error: lyfErr } = await supabase
    .from('agents')
    .upsert({
      cid: 'UC-M-0002',
      nickname: '梁宇帆',
      wechat_openid: 'lyf_test',
      life_stage_tags: ['create', 'living'],
      trust_threshold: 'medium',
      energy_status: '输出期',
      trust_score: 4.2,
    })
    .select()
    .single();

  if (lyfErr) {
    console.error('  ❌ 创建梁宇帆Agent失败:', lyfErr.message);
  } else {
    console.log(`  ✅ Agent ${lyfAgent.cid} (${lyfAgent.nickname})`);
  }

  // ── 4. 创建妙手堂服务 ──
  console.log('  📦 创建测试服务...');

  const services = [
    {
      provider_cid: 'UC-B-0001',
      name: '全息疼痛调理（肩颈）',
      primary_system: 'health',
      secondary_system: 'spirit',
      suitable_stages: ['输出期', '调整期', 'survival_base'],
      description: '陈氏四代非遗铃医传承，以徒手全息手法针对肩颈疼痛的深度调理。' +
        '75分钟完整调理流程：触诊定位 → 深层松解 → 气血引导 → 巩固养护。' +
        '\n\n适合人群：长期伏案工作者、久坐肩颈僵硬、慢性肩颈疼痛者。',
      price: 398,
      duration_minutes: 75,
      delivery_method: 'offline',
      location: '东莞万江店（距雨天屋檐驾车约30分钟）',
      trust_score: 4.5,
      status: 'active',
    },
    {
      provider_cid: 'UC-B-0001',
      name: '全息疼痛调理（腰部）',
      primary_system: 'health',
      suitable_stages: ['输出期', 'survival_base'],
      description: '针对腰部酸痛、久坐不适的全息手法调理。适用慢性腰肌劳损、久站/久坐导致的腰部不适。',
      price: 398,
      duration_minutes: 75,
      delivery_method: 'offline',
      location: '东莞万江店',
      trust_score: 4.5,
      status: 'active',
    },
    {
      provider_cid: 'UC-B-0001',
      name: '家庭康养评估（首次体验）',
      primary_system: 'health',
      secondary_system: 'living',
      suitable_stages: ['输入期', '调整期', 'survival_base'],
      description: '上门评估家庭成员的整体健康状态，给出个性化的居家康养建议。' +
        '包含：体质评估、环境健康评估、起居习惯建议、简易调理手法教学。',
      price: 298,
      duration_minutes: 90,
      delivery_method: 'offline',
      location: '东莞市内上门',
      trust_score: 4.0,
      status: 'active',
    },
    {
      provider_cid: 'UC-M-0002',
      name: '空间造场咨询（1v1）',
      primary_system: 'living',
      secondary_system: 'create',
      suitable_stages: ['生长', '开花', '输出期'],
      description: '梁宇帆（雨天屋檐创始人）1对1空间造场咨询。' +
        '帮助有场地的人找到场地的"主角"——借景不造景的四步造场法。',
      price: 200,
      duration_minutes: 60,
      delivery_method: 'online',
      trust_score: 4.2,
      status: 'active',
    },
  ];

  for (const service of services) {
    const { error: svcErr } = await supabase
      .from('services')
      .insert(service);

    if (svcErr) {
      console.error(`  ❌ 创建服务"${service.name}"失败:`, svcErr.message);
    } else {
      console.log(`  ✅ 服务: ${service.name} (${service.price}元)`);
    }
  }

  // ── 完成 ──
  console.log('\n  ─────────────────────────────');
  console.log('  ✅ 种子数据初始化完成');
  console.log('  📊 测试联结者: UC-M-0001 (开发者) / UC-M-0002 (梁宇帆)');
  console.log('  🏪 服务方: UC-B-0001 (妙手堂)');
  console.log('  💡 开发模式登录 code=dev_mode\n');
}

seed().catch(console.error);
