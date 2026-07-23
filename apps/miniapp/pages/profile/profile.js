// 我的页面

const app = getApp();

Page({
  data: {
    agent: null,
    trustInfo: null,
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    try {
      const [agentRes, trustRes] = await Promise.all([
        app.request({ url: '/agents/me' }).catch(() => null),
        app.request({ url: '/trust/my-score' }).catch(() => null),
      ]);
      this.setData({
        agent: agentRes?.data || null,
        trustInfo: trustRes?.data || null,
      });
    } catch (err) {
      console.error('[loadData]', err);
    }
  },

  goAgent() {
    wx.switchTab({ url: '/pages/agent/agent' });
  },

  goTransactions() {
    wx.switchTab({ url: '/pages/transaction/transaction' });
  },

  goTrustNetwork() {
    wx.navigateTo({ url: '/pages/agent/agent?tab=trust' });
  },

  // 完善档案快捷入口
  goEditTags() {
    wx.switchTab({ url: '/pages/agent/agent' });
  },

  // V0.2: 开发模式切换（仅在开发环境使用）
  showDevInfo() {
    wx.showModal({
      title: '开发信息',
      content: `CID: ${app.globalData.cid}\nAPI: ${app.globalData.apiBase}`,
      confirmText: '复制CID',
      success: (res) => {
        if (res.confirm && app.globalData.cid) {
          wx.setClipboardData({ data: app.globalData.cid });
        }
      },
    });
  },
});
