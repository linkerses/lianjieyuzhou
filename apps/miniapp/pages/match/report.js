const app = getApp();

Page({
  data: {
    targetCid: '',
    id: '',
    report: null,
    targetServices: [],
    primaryService: null,
    followMarked: false,
    actionHint: '',
    primaryActionTitle: '',
    primaryActionText: '',
    actionCards: [],
    loading: true,
    scoreColor: '#999',
  },

  onLoad(options = {}) {
    if (options.id) {
      this.setData({ id: options.id });
      this.loadReport(options.id);
    } else if (options.target_cid) {
      this.setData({ targetCid: options.target_cid });
      this.generateReport(options.target_cid);
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: '缺少匹配对象', icon: 'none' });
    }
  },

  async loadReport(id) {
    if (!app.globalData.cid) {
      const loginRes = await app.login();
      if (!loginRes.success) {
        this.setData({ loading: false });
        wx.showToast({ title: '登录失败', icon: 'none' });
        return;
      }
    }

    this.setData({ loading: true });
    try {
      const res = await app.request({ url: `/matches/${id}` });
      this.setData({
        report: res.data,
        scoreColor: this.getScoreColor(res.data.total_score),
        loading: false,
      });
      this.afterReportLoaded(res.data);
    } catch (err) {
      wx.showToast({ title: err.error || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  async generateReport(targetCid) {
    if (!app.globalData.cid) {
      const loginRes = await app.login();
      if (!loginRes.success) {
        this.setData({ loading: false });
        wx.showToast({ title: '登录失败', icon: 'none' });
        return;
      }
    }

    this.setData({ loading: true });
    try {
      const res = await app.request({
        url: '/matches/analyze',
        method: 'POST',
        data: { target_cid: targetCid },
      });
      this.setData({
        report: res.data,
        scoreColor: this.getScoreColor(res.data.total_score),
        loading: false,
      });
      this.afterReportLoaded(res.data);
    } catch (err) {
      wx.showToast({ title: err.error || '生成失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  viewTargetAgent() {
    if (!this.data.report) return;
    wx.navigateTo({
      url: `/pages/agents/public?cid=${this.data.report.target_agent.cid}`,
    });
  },

  async afterReportLoaded(report) {
    const targetCid = report && report.target_agent ? report.target_agent.cid : '';
    if (!targetCid) return;
    this.setData({
      followMarked: !!wx.getStorageSync(`match_follow_${report.id || targetCid}`),
    });
    try {
      const res = await app.request({
        url: '/services',
        data: { provider: targetCid, limit: 3 },
      });
      const services = res.data || [];
      this.setData({
        targetServices: services,
        primaryService: services.length > 0 ? services[0] : null,
        actionHint: this.getActionHint(report, services),
        primaryActionTitle: services.length > 0 ? `预约「${services[0].name}」` : '先发起连接',
        primaryActionText: services.length > 0 ? '立即预约服务' : '发起连接',
        actionCards: this.buildActionCards(report, services),
      });
    } catch (err) {
      console.log('[loadTargetServices]', err);
      this.setData({
        actionHint: this.getActionHint(report, []),
        primaryActionTitle: '先发起连接',
        primaryActionText: '发起连接',
        actionCards: this.buildActionCards(report, []),
      });
    }
  },

  async connectTarget() {
    if (!this.data.report) return;
    try {
      const res = await app.request({
        url: '/trust/connect',
        method: 'POST',
        data: { target_cid: this.data.report.target_agent.cid },
      });
      wx.showToast({
        title: res.data && res.data.already_connected ? '已连接过' : '已发起连接',
        icon: 'success',
      });
    } catch (err) {
      wx.showToast({ title: err.error || '连接失败', icon: 'none' });
    }
  },

  markFollowUp() {
    if (!this.data.report) return;
    wx.setStorageSync(`match_follow_${this.data.report.id || this.data.report.target_agent.cid}`, true);
    this.setData({ followMarked: true });
    wx.showToast({ title: '已标记跟进', icon: 'success' });
  },

  bookService(e) {
    const serviceId = e.currentTarget.dataset.id;
    const sellerCid = e.currentTarget.dataset.seller;
    wx.navigateTo({ url: `/pages/booking/booking?service_id=${serviceId}&seller_cid=${sellerCid}` });
  },

  takePrimaryAction() {
    if (this.data.primaryService) {
      wx.navigateTo({
        url: `/pages/booking/booking?service_id=${this.data.primaryService.id}&seller_cid=${this.data.primaryService.provider_cid}`,
      });
      return;
    }
    this.connectTarget();
  },

  viewService(e) {
    wx.navigateTo({ url: `/pages/services/detail?id=${e.currentTarget.dataset.id}` });
  },

  copySummary() {
    if (!this.data.report) return;
    const report = this.data.report;
    const text = [
      `Agent匹配度：${report.total_score}/100`,
      report.summary,
      '下一步建议：',
      ...(report.next_actions || []).map((item, index) => `${index + 1}. ${item}`),
    ].join('\n');
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制报告摘要', icon: 'none' }),
    });
  },

  copyIntentMessage() {
    if (!this.data.report) return;
    const report = this.data.report;
    const targetName = report.target_agent && report.target_agent.nickname
      ? report.target_agent.nickname
      : report.target_agent.cid;
    const nextAction = report.next_actions && report.next_actions.length > 0
      ? report.next_actions[0]
      : '建议先做一次轻量沟通，确认双方目标、资源和可协作事项。';
    const text = [
      `${targetName}，你好，我看了我们的 Agent 匹配报告。`,
      `匹配度：${report.total_score}/100。`,
      `我的理解：${report.summary}`,
      `建议下一步：${nextAction}`,
      '如果你也感兴趣，我们可以先约一次短沟通，确认是否适合继续推进。',
    ].join('\n');

    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制合作意向', icon: 'none' }),
    });
  },

  getActionHint(report, services) {
    if (services && services.length > 0) {
      return '对方已有可预约服务，建议直接选择一个低风险服务开始验证。';
    }
    if (report && report.total_score >= 75) {
      return '匹配度较高，建议先发起连接，再复制合作意向进行沟通。';
    }
    if (report && report.total_score >= 60) {
      return '匹配度中等，建议先看公开档案，确认需求和能力是否足够具体。';
    }
    return '匹配度偏探索，建议先收藏报告或补充双方档案后再判断。';
  },

  buildActionCards(report, services) {
    const hasService = services && services.length > 0;
    const score = report ? Number(report.total_score || 0) : 0;
    return [
      {
        title: hasService ? '从服务开始' : '先建立连接',
        desc: hasService
          ? '对方已有可预约服务，适合用一次小交付验证合作感。'
          : '对方暂无上架服务，先连接并复制破冰话术沟通。',
      },
      {
        title: '发送破冰话术',
        desc: '复制系统生成的合作意向，发给对方后再确认时间和目标。',
      },
      {
        title: score >= 75 ? '推进试合作' : '先做轻沟通',
        desc: score >= 75
          ? '匹配度较高，可以设计一次边界清楚的小型试合作。'
          : '匹配度仍需验证，建议先用 15-30 分钟沟通补齐信息。',
      },
    ];
  },

  getScoreColor(score) {
    if (score >= 75) return '#2D3E2F';
    if (score >= 60) return '#B8860B';
    return '#999';
  },
});
