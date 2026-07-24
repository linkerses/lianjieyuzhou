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
    },
  },

  onLoad() {
    this.init();
  },

  onShow() {
    // 每次显示刷新推荐和交易（服务完成后回来看首页能看到更新）
    if (this.data.userLoaded) {
      this.loadRecommendations();
      this.loadLatestServices();
      this.loadTransactions();
    }
  },

  async init() {
    // 检查登录状态
    if (!app.globalData.cid) {
      // 未登录，尝试自动登录
      const loginRes = await app.login(true); // 开发模式
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
        this.setData({
          'agentSummary.nickname': res.data.nickname,
          'agentSummary.life_stage_tags': res.data.life_stage_tags || [],
          'agentSummary.trust_score': res.data.trust_score || 0,
          'agentSummary.energy_status': res.data.energy_status || 'unknown',
          'loading.agent': false,
        });

        // 新用户引导
        if (this.data.isNewUser && (!res.data.life_stage_tags || res.data.life_stage_tags.length === 0)) {
          this.showOnboarding();
        }

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
        data: { agent_cid: app.globalData.cid, limit: 5 },
      });

      const recs = (res.data || []).map(item => ({
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

  // 新用户引导：完善档案
  showOnboarding() {
    wx.showModal({
      title: '欢迎加入联结宇宙',
      content: '完善你的生命阶段标签，你的Agent才能更精准地为你推荐服务。',
      confirmText: '去完善',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/agent/agent' });
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
    wx.navigateTo({ url: '/pages/agent/agent' });
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
});
