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

const DEFAULT_AGENT_HUB_ITEMS = [
  { tab: 'profile', title: '档案', desc: '加载中', metric: '-', state: 'todo' },
  { tab: 'demands', title: '需求', desc: '加载中', metric: '-', state: 'todo' },
  { tab: 'services', title: '服务', desc: '加载中', metric: '-', state: 'todo' },
  { tab: 'skills', title: '技能', desc: '加载中', metric: '-', state: 'todo' },
  { tab: 'trust', title: '信任', desc: '加载中', metric: '-', state: 'todo' },
  { tab: 'match', title: '匹配', desc: '加载中', metric: '-', state: 'todo' },
];

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
    connectionTodoItems: [],
    otherTodoItems: [],
    hasTodos: false,
    hasConnectionTodos: false,
    quickActions: [],
    agentHubItems: DEFAULT_AGENT_HUB_ITEMS,
    feedbackTypes: FEEDBACK_TYPES,
    feedbackTypeIndex: 0,
    selectedFeedbackTypeLabel: FEEDBACK_TYPES[0].label,
    feedbackContent: '',
    feedbackContact: '',
    submittingFeedback: false,
    showAbout: false,
    loadingData: false,
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    if (this.data.loadingData) return;
    this.setData({ loadingData: true });

    try {
      if (!app.globalData.token && !wx.getStorageSync('token')) {
        const loginRes = await app.login();
        if (!loginRes.success) {
          wx.showToast({ title: loginRes.error || '登录失败', icon: 'none' });
          this.setData({ loadingData: false });
          return;
        }
      }

      const [agentRes, trustRes, txRes, servicesRes, matchesRes, connectionReqRes] = await Promise.all([
        app.request({ url: '/agents/me' }).catch(() => null),
        app.request({ url: '/trust/my-score' }).catch(() => null),
        app.request({ url: '/transactions/mine' }).catch(() => null),
        app.request({
          url: '/services',
          data: { provider: app.globalData.cid, status: 'all' },
        }).catch(() => null),
        app.request({ url: '/matches/mine' }).catch(() => null),
        app.request({ url: '/trust/requests/mine' }).catch(() => null),
      ]);
      const agent = agentRes && agentRes.data ? agentRes.data : null;
      const agentTags = agent && agent.life_stage_tags ? this.formatTags(agent.life_stage_tags) : [];
      const transactions = txRes && txRes.data ? txRes.data : [];
      const services = servicesRes && servicesRes.data ? servicesRes.data : [];
      const matches = matchesRes && matchesRes.data ? matchesRes.data : [];
      const connectionRequests = connectionReqRes && connectionReqRes.data ? connectionReqRes.data : { incoming: [], outgoing: [] };
      const todoItems = this.buildTodoItems(transactions, connectionRequests);
      const connectionTodoItems = todoItems.filter(item => item.type === 'connection');
      const otherTodoItems = todoItems.filter(item => item.type !== 'connection');
      const quickActions = this.buildQuickActions(agent, todoItems);
      const agentHubItems = this.buildAgentHubItems(agent, services, matches, trustRes && trustRes.data, connectionRequests);

      this.setData({
        agent,
        agentAvatar: agent && agent.nickname ? agent.nickname[0] : '?',
        agentName: agent && agent.nickname ? agent.nickname : '联结者',
        agentCid: agent && agent.cid ? agent.cid : '',
        agentTags,
        hasAgentTags: agentTags.length > 0,
        trustInfo: trustRes && trustRes.data ? trustRes.data : null,
        todoItems,
        connectionTodoItems,
        otherTodoItems,
        hasTodos: todoItems.length > 0,
        hasConnectionTodos: connectionTodoItems.length > 0,
        quickActions,
        agentHubItems,
        loadingData: false,
      });
    } catch (err) {
      console.error('[loadData]', err);
      this.setData({ loadingData: false });
    }
  },

  goAgent() {
    wx.navigateTo({ url: '/pages/agent/agent' });
  },

  goAgentTab(e) {
    const tab = e.currentTarget.dataset.tab || 'profile';
    wx.setStorageSync('agent_default_tab', tab);
    wx.navigateTo({ url: '/pages/agent/agent' });
  },

  goTransactions() {
    wx.navigateTo({ url: '/pages/transaction/transaction' });
  },

  goCollaborationCenter() {
    const hasPendingConnection = (this.data.todoItems || []).some(item => item.type === 'connection');
    if (hasPendingConnection) {
      wx.navigateTo({ url: '/pages/agent/agent?tab=trust' });
      return;
    }
    this.goTransactions();
  },

  openTodo(e) {
    const { id, type } = e.currentTarget.dataset;
    if (type === 'connection') {
      wx.navigateTo({ url: `/pages/connections/thread?id=${id}` });
      return;
    }
    wx.navigateTo({ url: `/pages/transaction/detail?id=${id}` });
  },

  openConnectionThread(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/connections/thread?id=${id}` });
  },

  async updateConnectionTodo(e) {
    const { id, status } = e.currentTarget.dataset;
    if (!id || !status) return;
    const labelMap = {
      accepted: '已接受',
      ignored: '已忽略',
    };
    try {
      await app.request({
        url: `/trust/requests/${id}/status`,
        method: 'PATCH',
        data: { status },
      });
      wx.showToast({ title: labelMap[status] || '已处理', icon: 'success' });
      this.loadData();
    } catch (err) {
      wx.showToast({ title: err.error || '处理失败', icon: 'none' });
    }
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

  // 关于联结宇宙
  onShowAbout() {
    this.setData({ showAbout: true });
  },

  onHideAbout() {
    this.setData({ showAbout: false });
  },

  noop() {},

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

  buildTodoItems(transactions, connectionRequests = {}) {
    const cid = app.globalData.cid;
    const incomingConnections = (connectionRequests.incoming || [])
      .filter(item => item && (item.status === 'pending' || item.status === 'accepted'))
      .map(item => this.formatConnectionTodo(item, 'incoming'));
    const outgoingConnections = (connectionRequests.outgoing || [])
      .filter(item => item && (item.status === 'pending' || item.status === 'accepted'))
      .map(item => this.formatConnectionTodo(item, 'outgoing'));
    const connectionTodos = [...incomingConnections, ...outgoingConnections]
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return (b.updatedTime || 0) - (a.updatedTime || 0);
      })
      .slice(0, 4);

    const transactionTodos = (transactions || [])
      .map(item => {
        const serviceName = item.services && item.services.name ? item.services.name : '服务';
        if (item.seller_cid === cid && item.status === 'pending') {
          return {
            id: item.id,
            type: 'transaction',
            title: '新预约待确认',
            desc: serviceName,
            tag: '服务方',
          };
        }
        if (item.buyer_cid === cid && item.status === 'confirmed') {
          return {
            id: item.id,
            type: 'transaction',
            title: '服务进行中',
            desc: '完成后记得确认交付',
            tag: '买方',
          };
        }
        if (item.buyer_cid === cid && item.status === 'completed' && !item.actual_score) {
          return {
            id: item.id,
            type: 'transaction',
            title: '待评价',
            desc: serviceName,
            tag: '买方',
          };
        }
        return null;
      })
      .filter(Boolean);

    return [...connectionTodos, ...transactionTodos].slice(0, 6);
  },

  formatConnectionTodo(item, direction) {
    const other = direction === 'incoming' ? item.requester : item.target;
    const otherName = other && other.nickname
      ? other.nickname
      : direction === 'incoming' ? item.requester_cid : item.target_cid;
    const isDemandMessage = item.source_type === 'demand';
    const updatedTime = new Date(item.updated_at || item.responded_at || item.created_at).getTime();
    const base = {
      id: item.id,
      type: 'connection',
      desc: `${otherName}：${item.message || (isDemandMessage ? '想回应你的需求' : '想与你建立联结')}`,
      updatedTime: Number.isNaN(updatedTime) ? 0 : updatedTime,
    };

    if (direction === 'incoming' && item.status === 'pending') {
      return {
        ...base,
        title: isDemandMessage ? '有人回应了你的需求' : '新的联结申请',
        tag: isDemandMessage ? '需求消息' : '待回复',
        actionText: '查看并回复',
        rank: 0,
      };
    }

    if (direction === 'outgoing' && item.status === 'pending') {
      return {
        ...base,
        title: '联结申请已发出',
        tag: '等待中',
        actionText: '查看状态',
        rank: 1,
      };
    }

    return {
      ...base,
      title: direction === 'incoming' ? '已建立联结' : '我发起的联结',
      tag: '会话',
      actionText: '继续留言',
      rank: 2,
    };
  },

  buildQuickActions(agent, todoItems) {
    const profile = agent && agent.agent_config && agent.agent_config.value_profile
      ? agent.agent_config.value_profile
      : {};
    const hasValueProfile = !!(
      profile.core_value &&
      profile.service_capabilities &&
      profile.project_experience
    );

    if (todoItems.length > 0) {
      return [
        { key: 'transactions', title: '处理协作事项', desc: '先处理预约、交付或评价' },
        { key: 'plaza', title: '看看新联结', desc: '从 Agent 广场找下一位匹配对象' },
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

  buildAgentHubItems(agent, services, matches, trustInfo, connectionRequests = {}) {
    const config = agent && agent.agent_config ? agent.agent_config : {};
    const profile = config.value_profile || {};
    const demandPosts = Array.isArray(config.demand_posts) ? config.demand_posts : [];
    const openDemands = demandPosts.filter(item => item && item.status === 'open' && item.title);
    const activeServices = (services || []).filter(item => item && item.status === 'active');
    const skillStatus = agent && agent.skill_status ? agent.skill_status : {};
    const activeSkills = Object.keys(skillStatus).filter(key => skillStatus[key] === 'active');
    const profileFields = [
      profile.core_value,
      profile.service_capabilities,
      profile.project_experience,
    ];
    const completeProfileFields = profileFields.filter(value => String(value || '').trim()).length;
    const profileStatus = `${completeProfileFields}/${profileFields.length}`;
    const trustScore = trustInfo && trustInfo.trust_score !== undefined ? Number(trustInfo.trust_score || 0) : 0;
    const pendingConnections = (connectionRequests.incoming || []).filter(item => item && item.status === 'pending').length;

    return [
      {
        tab: 'profile',
        title: '档案',
        desc: completeProfileFields >= profileFields.length ? '已完整' : '待补全',
        metric: profileStatus,
        state: completeProfileFields >= profileFields.length ? 'done' : 'todo',
      },
      {
        tab: 'demands',
        title: '需求',
        desc: openDemands.length > 0 ? '公开中' : '待发布',
        metric: `${openDemands.length}条`,
        state: openDemands.length > 0 ? 'active' : 'todo',
      },
      {
        tab: 'services',
        title: '服务',
        desc: activeServices.length > 0 ? '已上架' : '待上架',
        metric: `${activeServices.length}个`,
        state: activeServices.length > 0 ? 'active' : 'todo',
      },
      {
        tab: 'skills',
        title: '技能',
        desc: activeSkills.length > 0 ? '已开启' : '待开启',
        metric: `${activeSkills.length}项`,
        state: activeSkills.length > 0 ? 'done' : 'todo',
      },
      {
        tab: 'trust',
        title: '信任',
        desc: pendingConnections > 0 ? '有联结申请' : trustScore > 0 ? '有记录' : '待积累',
        metric: pendingConnections > 0 ? `${pendingConnections}条` : trustScore.toFixed(1),
        state: pendingConnections > 0 ? 'active' : trustScore > 0 ? 'done' : 'todo',
      },
      {
        tab: 'match',
        title: '匹配',
        desc: matches.length > 0 ? '已有报告' : '待生成',
        metric: `${matches.length}份`,
        state: matches.length > 0 ? 'active' : 'todo',
      },
    ];
  },

  formatTags(tags) {
    return (tags || []).map(tag => TAG_LABELS[tag] || tag);
  },

  // 完善档案快捷入口
  goEditTags() {
    wx.navigateTo({ url: '/pages/agent/agent' });
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
