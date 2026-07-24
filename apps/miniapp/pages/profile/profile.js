// 我的页面

const app = getApp();

const FEEDBACK_TYPES = [
  { key: 'suggestion', label: '功能建议' },
  { key: 'confusing', label: '看不懂 / 不会用' },
  { key: 'service_need', label: '想要的服务' },
  { key: 'bug', label: '错误 / 无法操作' },
  { key: 'other', label: '其他' },
];

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
    agent: null,
    agentAvatar: '?',
    agentName: '联结者',
    agentCid: '',
    agentTags: [],
    hasAgentTags: false,
    trustInfo: null,
    todoItems: [],
    hasTodos: false,
    quickActions: [],
    feedbackTypes: FEEDBACK_TYPES,
    feedbackTypeIndex: 0,
    selectedFeedbackTypeLabel: FEEDBACK_TYPES[0].label,
    feedbackContent: '',
    feedbackContact: '',
    submittingFeedback: false,
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
      const agentTags = agent && agent.life_stage_tags ? this.formatTags(agent.life_stage_tags) : [];
      const transactions = txRes && txRes.data ? txRes.data : [];
      const todoItems = this.buildTodoItems(transactions);
      const quickActions = this.buildQuickActions(agent, todoItems);

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
        quickActions,
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

  onQuickAction(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'agent') {
      this.goAgent();
    } else if (key === 'plaza') {
      wx.switchTab({ url: '/pages/agents/plaza' });
    } else if (key === 'seller') {
      this.goSellerWorkbench();
    } else if (key === 'transactions') {
      this.goTransactions();
    }
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

  onFeedbackTypeChange(e) {
    const feedbackTypeIndex = Number(e.detail.value || 0);
    const type = this.data.feedbackTypes[feedbackTypeIndex] || this.data.feedbackTypes[0];
    this.setData({
      feedbackTypeIndex,
      selectedFeedbackTypeLabel: type.label,
    });
  },

  onFeedbackInput(e) {
    this.setData({ feedbackContent: e.detail.value });
  },

  onFeedbackContactInput(e) {
    this.setData({ feedbackContact: e.detail.value });
  },

  async submitFeedback() {
    const content = (this.data.feedbackContent || '').trim();
    if (content.length < 5) {
      wx.showToast({ title: '请至少写 5 个字', icon: 'none' });
      return;
    }

    this.setData({ submittingFeedback: true });
    try {
      const type = this.data.feedbackTypes[this.data.feedbackTypeIndex] || this.data.feedbackTypes[0];
      await app.request({
        url: '/feedback',
        method: 'POST',
        data: {
          type: type.key,
          page: 'profile',
          content,
          contact: (this.data.feedbackContact || '').trim(),
        },
      });
      this.setData({
        feedbackContent: '',
        feedbackContact: '',
        feedbackTypeIndex: 0,
        selectedFeedbackTypeLabel: this.data.feedbackTypes[0].label,
        submittingFeedback: false,
      });
      wx.showToast({ title: '已提交反馈', icon: 'success' });
    } catch (err) {
      this.setData({ submittingFeedback: false });
      wx.showToast({ title: err.error || '提交失败', icon: 'none' });
    }
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

  buildQuickActions(agent, todoItems) {
    const profile = agent && agent.agent_config && agent.agent_config.value_profile
      ? agent.agent_config.value_profile
      : {};
    const hasValueProfile = !!(
      profile.core_value &&
      profile.service_capabilities &&
      profile.project_experience &&
      profile.vision_needs
    );

    if (todoItems.length > 0) {
      return [
        { key: 'transactions', title: '处理协作事项', desc: '先处理预约、交付或评价' },
        { key: 'plaza', title: '看看新连接', desc: '从 Agent 广场找下一位匹配对象' },
      ];
    }

    if (!hasValueProfile) {
      return [
        { key: 'agent', title: '完善数字档案', desc: '补齐价值、能力、经历和需求' },
        { key: 'seller', title: '发布一个服务', desc: '把可交付能力变成可预约服务' },
      ];
    }

    return [
      { key: 'plaza', title: '发起一次匹配', desc: '选择感兴趣的人生成匹配报告' },
      { key: 'seller', title: '维护服务内容', desc: '更新服务介绍、定价和上下架状态' },
    ];
  },

  formatTags(tags) {
    return (tags || []).map(tag => TAG_LABELS[tag] || tag);
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
