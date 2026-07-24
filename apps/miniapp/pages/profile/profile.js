// 我的页面

const app = getApp();

Page({
  data: {
    agent: null,
    agentAvatar: '?',
    agentName: '联结者',
    agentCid: '',
    agentTags: [],
    hasAgentTags: false,
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
      const agent = agentRes && agentRes.data ? agentRes.data : null;
      const agentTags = agent && agent.life_stage_tags ? agent.life_stage_tags : [];

      this.setData({
        agent,
        agentAvatar: agent && agent.nickname ? agent.nickname[0] : '?',
        agentName: agent && agent.nickname ? agent.nickname : '联结者',
        agentCid: agent && agent.cid ? agent.cid : '',
        agentTags,
        hasAgentTags: agentTags.length > 0,
        trustInfo: trustRes && trustRes.data ? trustRes.data : null,
      });
    } catch (err) {
      console.error('[loadData]', err);
    }
  },

  goAgent() {
    wx.switchTab({ url: '/pages/agent/agent' });
  },

  goTransactions() {
    wx.navigateTo({ url: '/pages/transaction/transaction' });
  },

  goSellerWorkbench() {
    wx.navigateTo({ url: '/pages/seller/workbench' });
  },

  switchDevRole() {
    wx.showActionSheet({
      itemList: ['切换为买方测试账号', '切换为服务方测试账号'],
      success: async (res) => {
        const code = res.tapIndex === 1 ? 'dev_seller' : 'dev_mode';
        app.logout();
        const loginRes = await app.login(true, code);
        if (loginRes.success) {
          wx.showToast({ title: '已切换身份', icon: 'success' });
          this.loadData();
        } else {
          wx.showToast({ title: '切换失败', icon: 'none' });
        }
      },
    });
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
