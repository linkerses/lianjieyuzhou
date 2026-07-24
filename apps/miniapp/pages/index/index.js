// 首页：推荐流 + Agent状态摘要

const app = getApp();

const SYSTEM_LABELS = {
  health: '健康',
  living: '生活',
  connection: '连接',
  growth: '成长',
  wealth: '财富',
  create: '创造',
  explore: '探索',
  spirit: '精神',
  future: '未来',
};

const DELIVERY_LABELS = {
  online: '线上',
  offline: '线下',
  hybrid: '线上/线下',
};

const TAG_LABELS = {
  health: '🫀 健康',
  living: '🏠 生活',
  connection: '🤝 连接',
  growth: '📚 成长',
  wealth: '💰 财富',
  create: '✨ 创造',
  explore: '🌍 探索',
  spirit: '🧘 精神',
  future: '🔮 未来',
};

Page({
  data: {
    userLoaded: false,
    isNewUser: false,
    agentSummary: {
      nickname: '',
      life_stage_tags: [],
      trust_score: 0,
      energy_status: '',
    },
    profileGuide: null,
    onboardingTasks: [],
    onboardingProgressText: '0/4',
    // 首页三段式内容
    agentNote: null,             // Agent提醒卡片
    recommendations: [],         // 预演推荐列表
    latestServices: [],
    recentTransactions: [],      // 最近交易
    loading: {
      agent: true,
      recommend: true,
      latest: true,
      transactions: true,
      onboarding: true,
    },
  },

  onLoad() {
    this.init();
  },

  onShow() {
    // 每次显示刷新推荐和交易（服务完成后回来看首页能看到更新）
    if (this.data.userLoaded) {
      this.loadAgent();
      this.loadRecommendations();
      this.loadLatestServices();
      this.loadTransactions();
    }
  },

  async init() {
    // 检查登录状态
    if (!app.globalData.cid) {
      // 未登录，尝试自动登录
      const loginRes = await app.login();
      if (!loginRes.success) {
        wx.showToast({ title: '登录失败', icon: 'none' });
        return;
      }
    }

    this.data.userLoaded = true;

    if (app.globalData.isNewUser) {
      this.setData({ isNewUser: true });
    }

    await Promise.all([
      this.loadAgent(),
      this.loadRecommendations(),
      this.loadLatestServices(),
      this.loadTransactions(),
    ]);
  },

  // 加载Agent摘要
  async loadAgent() {
    try {
      const res = await app.request({ url: '/agents/me' });
      if (res.data) {
        const profileGuide = this.buildProfileGuide(res.data);
        this.setData({
          'agentSummary.nickname': res.data.nickname,
          'agentSummary.life_stage_tags': this.formatTags(res.data.life_stage_tags || []),
          'agentSummary.trust_score': res.data.trust_score || 0,
          'agentSummary.energy_status': res.data.energy_status || 'unknown',
          profileGuide,
          'loading.agent': false,
        });

        // 新用户引导
        if (this.data.isNewUser && profileGuide) {
          this.showOnboarding();
        }

        this.loadOnboardingTasks(res.data);

        // 检查Agent是否有提醒
        this.checkAgentNote();
      }
    } catch (err) {
      console.error('[loadAgent error]', err);
      this.setData({ 'loading.agent': false });
    }
  },

  // Agent提醒：调用技能系统的状态扫描
  async checkAgentNote() {
    try {
      const res = await app.request({
        url: '/skills/state-scan/check',
        method: 'POST',
        data: { agent_cid: app.globalData.cid },
      });

      if (res.data && res.data.triggered && res.data.message) {
        this.setData({
          agentNote: {
            level: res.data.level,
            message: res.data.message,
            suggestions: res.data.suggestions || [],
          },
        });
      } else if (res.data && res.data.level === 'L1') {
        // L1报告也展示，但低调一些
        this.setData({
          agentNote: {
            level: 'L1',
            message: res.data.message || '状态扫描已启动',
            suggestions: [],
          },
        });
      }
    } catch (err) {
      // 技能系统尚不可用，不展示提醒
      console.log('[checkAgentNote]', err);
    }
  },

  // 加载预演推荐
  async loadRecommendations() {
    try {
      const res = await app.request({
        url: '/pre-enact/recommend',
        method: 'POST',
        data: { agent_cid: app.globalData.cid, limit: 3 },
      });

      const recs = (res.data || []).slice(0, 3).map(item => ({
        ...item,
        system_emoji: this.getSystemEmoji(item.primary_system),
      }));

      this.setData({
        recommendations: recs,
        'loading.recommend': false,
      });
    } catch (err) {
      console.error('[loadRecommendations error]', err);
      this.setData({ 'loading.recommend': false });
    }
  },

  async loadLatestServices() {
    try {
      const res = await app.request({
        url: '/services',
        data: { limit: 3 },
      });

      this.setData({
        latestServices: (res.data || []).map(item => this.formatService(item)),
        'loading.latest': false,
      });
    } catch (err) {
      console.error('[loadLatestServices error]', err);
      this.setData({ 'loading.latest': false });
    }
  },

  // 加载最近交易
  async loadTransactions() {
    try {
      const res = await app.request({
        url: '/transactions/mine',
        data: { role: 'buyer' },
      });

      this.setData({
        recentTransactions: (res.data || []).slice(0, 3).map(item => ({
          ...item,
          service_name: item.services && item.services.name ? item.services.name : '服务',
        })),
        'loading.transactions': false,
      });
    } catch (err) {
      console.error('[loadTransactions error]', err);
      this.setData({ 'loading.transactions': false });
    }
  },

  async loadOnboardingTasks(agent) {
    try {
      const [matchesRes, servicesRes, transactionsRes] = await Promise.all([
        app.request({ url: '/matches/mine' }).catch(() => ({ data: [] })),
        app.request({ url: '/services', data: { provider: app.globalData.cid, status: 'all' } }).catch(() => ({ data: [] })),
        app.request({ url: '/transactions/mine' }).catch(() => ({ data: [] })),
      ]);

      const profileDone = !this.buildProfileGuide(agent);
      const plazaVisited = !!wx.getStorageSync('onboarding_plaza_visited');
      const hasMatchReport = (matchesRes.data || []).length > 0;
      const hasServiceOrBooking = (servicesRes.data || []).length > 0 || (transactionsRes.data || []).length > 0;

      const tasks = [
        {
          key: 'profile',
          title: '完善 Agent 档案',
          desc: '补全价值、能力、经历和需求，推荐与匹配会更准确。',
          done: profileDone,
          action: profileDone ? '已完成' : '去完善',
          target: 'agent',
        },
        {
          key: 'plaza',
          title: '浏览 Agent 广场',
          desc: '先看看别人如何展示价值和需求，找到可连接对象。',
          done: plazaVisited,
          action: plazaVisited ? '已浏览' : '去看看',
          target: 'plaza',
        },
        {
          key: 'match',
          title: '生成一次匹配报告',
          desc: '选择一个感兴趣的 Agent，获得合作建议和破冰方向。',
          done: hasMatchReport,
          action: hasMatchReport ? '已生成' : '去匹配',
          target: 'match',
        },
        {
          key: 'service',
          title: '发布或预约一个服务',
          desc: '用一次轻量服务，把价值连接推进到真实协作。',
          done: hasServiceOrBooking,
          action: hasServiceOrBooking ? '已行动' : '去服务',
          target: 'service',
        },
      ];

      const doneCount = tasks.filter(item => item.done).length;
      this.setData({
        onboardingTasks: tasks,
        onboardingProgressText: `${doneCount}/${tasks.length}`,
        'loading.onboarding': false,
      });
    } catch (err) {
      console.error('[loadOnboardingTasks error]', err);
      this.setData({ 'loading.onboarding': false });
    }
  },

  // 新用户引导：完善档案
  showOnboarding() {
    wx.showModal({
      title: '欢迎加入联结宇宙',
      content: '完善你的生命阶段标签，你的Agent才能更精准地为你推荐服务。',
      confirmText: '去完善',
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/agent/agent' });
        }
      },
    });
  },

  // ── 事件处理 ──

  onTapService(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/services/detail?id=${id}` });
  },

  onTapTransaction(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/transaction/detail?id=${id}` });
  },

  onTapNewUserGuide() {
    wx.switchTab({ url: '/pages/agent/agent' });
  },

  onTapOnboardingTask(e) {
    const { target } = e.currentTarget.dataset;
    if (target === 'agent') {
      wx.switchTab({ url: '/pages/agent/agent' });
      return;
    }
    if (target === 'plaza') {
      wx.setStorageSync('onboarding_plaza_visited', true);
      wx.switchTab({ url: '/pages/agents/plaza' });
      return;
    }
    if (target === 'match') {
      wx.setStorageSync('agent_default_tab', 'match');
      wx.switchTab({ url: '/pages/agent/agent' });
      return;
    }
    if (target === 'service') {
      wx.switchTab({ url: '/pages/services/services' });
    }
  },

  goServices() {
    wx.switchTab({ url: '/pages/services/services' });
  },

  goTransactions() {
    wx.navigateTo({ url: '/pages/transaction/transaction' });
  },

  onDismissNote() {
    this.setData({ agentNote: null });
  },

  // ── 工具函数 ──

  getSystemEmoji(system) {
    const map = {
      health: '🫀', living: '🏠', connection: '🤝',
      growth: '📚', wealth: '💰', create: '✨',
      explore: '🌍', spirit: '🧘', future: '🔮',
    };
    return map[system] || '📌';
  },

  buildProfileGuide(agent) {
    const config = agent && agent.agent_config ? agent.agent_config : {};
    const valueProfile = config.value_profile || {};
    const missing = [];

    if (!agent.nickname) missing.push('称呼');
    if (!agent.life_stage_tags || agent.life_stage_tags.length === 0) missing.push('生命阶段标签');
    if (!valueProfile.core_value) missing.push('核心价值');
    if (!valueProfile.service_capabilities) missing.push('服务能力');
    if (!valueProfile.project_experience) missing.push('项目经历');
    if (!valueProfile.vision_needs) missing.push('愿景需求');

    if (missing.length === 0) return null;

    return {
      missing,
      progress: 6 - missing.length,
      title: this.data.isNewUser ? '欢迎来到联结宇宙' : '完善你的 Agent 数字档案',
      desc: `还差 ${missing.slice(0, 3).join('、')}，补全后推荐、匹配报告和公开档案会更准确。`,
    };
  },

  formatService(item) {
    const tags = [
      SYSTEM_LABELS[item.primary_system] || item.primary_system,
      item.secondary_system ? SYSTEM_LABELS[item.secondary_system] || item.secondary_system : '',
      DELIVERY_LABELS[item.delivery_method] || item.delivery_method,
      item.duration_minutes ? `${item.duration_minutes}分钟` : '',
    ].concat(item.suitable_stages || []).filter(Boolean).slice(0, 5);

    return {
      ...item,
      system_label: SYSTEM_LABELS[item.primary_system] || item.primary_system,
      delivery_label: DELIVERY_LABELS[item.delivery_method] || item.delivery_method,
      tags,
    };
  },

  formatTags(tags) {
    return (tags || []).map(tag => TAG_LABELS[tag] || tag);
  },
});
