const app = getApp();

Page({
  data: {
    targetCid: '',
    id: '',
    report: null,
    targetServices: [],
    followMarked: false,
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
      const loginRes = await app.login(true);
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
      const loginRes = await app.login(true);
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
      this.setData({ targetServices: res.data || [] });
    } catch (err) {
      console.log('[loadTargetServices]', err);
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

  getScoreColor(score) {
    if (score >= 75) return '#2D3E2F';
    if (score >= 60) return '#B8860B';
    return '#999';
  },
});
