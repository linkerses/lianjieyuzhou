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
    todoItems: [],
    hasTodos: false,
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    try {
      const [agentRes, trustRes, txRes] = await Promise.all([
        app.request({ url: '/agents/me' }).catch(() => null),
        app.request({ url: '/trust/my-score' }).catch(() => null),
        app.request({ url: '/transactions/mine' }).catch(() => null),
      ]);
      const agent = agentRes && agentRes.data ? agentRes.data : null;
      const agentTags = agent && agent.life_stage_tags ? agent.life_stage_tags : [];
      const transactions = txRes && txRes.data ? txRes.data : [];
      const todoItems = this.buildTodoItems(transactions);

      this.setData({
        agent,
        agentAvatar: agent && agent.nickname ? agent.nickname[0] : '?',
        agentName: agent && agent.nickname ? agent.nickname : '联结者',
        agentCid: agent && agent.cid ? agent.cid : '',
        agentTags,
        hasAgentTags: agentTags.length > 0,
        trustInfo: trustRes && trustRes.data ? trustRes.data : null,
        todoItems,
        hasTodos: todoItems.length > 0,
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

  openTodo(e) {
    wx.navigateTo({ url: `/pages/transaction/detail?id=${e.currentTarget.dataset.id}` });
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

  buildTodoItems(transactions) {
    const cid = app.globalData.cid;
    return (transactions || [])
      .map(item => {
        const serviceName = item.services && item.services.name ? item.services.name : '服务';
        if (item.seller_cid === cid && item.status === 'pending') {
          return {
            id: item.id,
            title: '新预约待确认',
            desc: serviceName,
            tag: '服务方',
          };
        }
        if (item.buyer_cid === cid && item.status === 'confirmed') {
          return {
            id: item.id,
            title: '服务进行中',
            desc: '完成后记得确认交付',
            tag: '买方',
          };
        }
        if (item.buyer_cid === cid && item.status === 'completed' && !item.actual_score) {
          return {
            id: item.id,
            title: '待评价',
            desc: serviceName,
            tag: '买方',
          };
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, 5);
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
