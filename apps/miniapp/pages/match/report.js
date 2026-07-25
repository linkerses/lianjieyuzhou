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
    concreteActions: [],
    keyFindings: [],
    entrypoints: [],
    cautionItems: [],
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
        primaryActionTitle: services.length > 0 ? `先预约「${services[0].name}」` : '先发起连接',
        primaryActionText: services.length > 0 ? '预约这个服务' : '发起连接',
        concreteActions: this.buildConcreteActions(report, services),
        keyFindings: this.buildKeyFindings(report),
        entrypoints: this.buildEntrypoints(report),
        cautionItems: this.buildCautionItems(report),
      });
    } catch (err) {
      console.log('[loadTargetServices]', err);
      this.setData({
        actionHint: this.getActionHint(report, []),
        primaryActionTitle: '先发起连接',
        primaryActionText: '发起连接',
        concreteActions: this.buildConcreteActions(report, []),
        keyFindings: this.buildKeyFindings(report),
        entrypoints: this.buildEntrypoints(report),
        cautionItems: this.buildCautionItems(report),
      });
    }
  },

  async connectTarget() {
    if (!this.data.report) return;
    const target = this.data.report.target_agent;
    wx.showModal({
      title: '发起连接',
      editable: true,
      placeholderText: '写一句你想连接对方的原因',
      content: `给 ${target.nickname || target.cid} 留一句连接理由`,
      confirmText: '发送',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;
        const message = (modalRes.content || '').trim();
        if (message.length < 2) {
          wx.showToast({ title: '请写一句连接理由', icon: 'none' });
          return;
        }
        try {
          const res = await app.request({
            url: '/trust/connect',
            method: 'POST',
            data: {
              target_cid: target.cid,
              message,
              source_type: 'match',
              source_id: this.data.report.id || '',
            },
          });
          wx.showToast({
            title: res.data && res.data.already_connected ? '已连接过' : res.data && res.data.already_requested ? '已申请过' : '申请已发送',
            icon: 'success',
          });
        } catch (err) {
          wx.showToast({ title: err.error || '连接失败', icon: 'none' });
        }
      },
    });
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
      `我理解我们可以先从一个很小的点验证：${nextAction}`,
      '如果你也感兴趣，我们可以先约 15 分钟，确认目标、边界和下一步动作。',
    ].join('\n');

    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制合作意向', icon: 'none' }),
    });
  },

  getActionHint(report, services) {
    if (report && report.collaboration_entrypoints && report.collaboration_entrypoints.length > 0) {
      return report.collaboration_entrypoints[0];
    }
    if (services && services.length > 0) {
      return '不要先聊太散。对方已有服务，优先用一次小交付验证是否合适。';
    }
    if (report && report.total_score >= 75) {
      return '匹配度较高，先建立连接，并把沟通目标压缩到一次 15 分钟短沟通。';
    }
    if (report && report.total_score >= 60) {
      return '先别急着合作。先看对方档案，确认需求和能力是否足够具体。';
    }
    return '当前更适合观察。先补充双方需求和服务边界，再重新判断。';
  },

  buildConcreteActions(report, services) {
    if (report && report.next_actions && report.next_actions.length > 0) {
      return report.next_actions.slice(0, 2);
    }
    const hasService = services && services.length > 0;
    const score = report ? Number(report.total_score || 0) : 0;
    if (hasService) {
      return [
        `先点预约「${services[0].name}」，用一次小交付验证配合感。`,
        '预约备注里写清楚：你的目标、当前卡点、希望对方交付什么。',
      ];
    }
    if (score >= 75) {
      return [
        '先发起连接，说明你对哪一个需求或能力感兴趣。',
        '约一次 15 分钟短沟通，只确认目标、资源、下一步小实验。',
      ];
    }
    if (score >= 60) {
      return [
        '先看对方档案，确认对方需求是否与你的能力有关。',
        '只问一个具体问题：现在最需要别人帮你推进哪一步？',
      ];
    }
    return [
      '暂时不要推进合作，先把双方需求和服务边界写清楚。',
      '如果仍感兴趣，只做一次低承诺沟通，不谈正式合作。',
    ];
  },

  buildKeyFindings(report) {
    return (report && report.evidence && report.evidence.length > 0 ? report.evidence : report && report.opportunities ? report.opportunities : [])
      .filter(Boolean)
      .slice(0, 3);
  },

  buildEntrypoints(report) {
    return (report && report.collaboration_entrypoints ? report.collaboration_entrypoints : [])
      .filter(Boolean)
      .slice(0, 2);
  },

  buildCautionItems(report) {
    return (report && report.risks ? report.risks : [])
      .filter(Boolean)
      .slice(0, 2);
  },

  getScoreColor(score) {
    if (score >= 75) return '#2D3E2F';
    if (score >= 60) return '#B8860B';
    return '#999';
  },
});
