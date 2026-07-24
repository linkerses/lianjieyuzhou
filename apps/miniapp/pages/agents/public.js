const app = getApp();

Page({
  data: {
    cid: '',
    agent: null,
    loading: true,
  },

  onLoad(options = {}) {
    if (options.cid) {
      this.setData({ cid: options.cid });
      this.loadAgent(options.cid);
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: '缺少Agent ID', icon: 'none' });
    }
  },

  async loadAgent(cid) {
    this.setData({ loading: true });
    try {
      const res = await app.request({ url: `/agents/public/${cid}` });
      this.setData({
        agent: this.formatAgent(res.data),
        loading: false,
      });
      wx.setNavigationBarTitle({ title: res.data.nickname || '公开档案' });
    } catch (err) {
      wx.showToast({ title: err.error || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  applyMatch() {
    if (!this.data.agent) return;
    wx.navigateTo({
      url: `/pages/match/report?target_cid=${this.data.agent.cid}`,
    });
  },

  copyCid() {
    if (!this.data.agent) return;
    wx.setClipboardData({
      data: this.data.agent.cid,
      success: () => wx.showToast({ title: '已复制CID', icon: 'none' }),
    });
  },

  formatAgent(agent) {
    return {
      ...agent,
      initial: agent.nickname ? agent.nickname.slice(0, 1) : '?',
    };
  },
});
