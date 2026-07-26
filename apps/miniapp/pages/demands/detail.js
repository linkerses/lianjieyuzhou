const app = getApp();

const TAG_LABELS = {
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

Page({
  data: {
    cid: '',
    sourceId: '',
    demand: null,
    agent: null,
    tagLabels: [],
    locationText: '',
    loading: true,
    showResponsePanel: false,
    responseMessage: '',
    submittingResponse: false,
  },

  onLoad(options = {}) {
    const cid = options.cid || '';
    const sourceId = decodeURIComponent(options.source_id || '');
    if (!cid || !sourceId) {
      this.setData({ loading: false });
      wx.showToast({ title: '缺少需求信息', icon: 'none' });
      return;
    }
    this.setData({ cid, sourceId });
    this.loadDemand(cid, sourceId);
  },

  async loadDemand(cid, sourceId) {
    this.setData({ loading: true });
    try {
      const res = await app.request({ url: `/agents/public/${cid}` });
      const agent = res.data || {};
      const demand = this.findDemand(agent.demand_posts || [], sourceId);
      if (!demand) {
        wx.showToast({ title: '需求不存在或已关闭', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      this.setData({
        agent: this.formatAgent(agent),
        demand,
        tagLabels: this.formatTags(agent.life_stage_tags || []),
        locationText: this.formatLocation(agent.basic_profile || {}),
        loading: false,
      });
      wx.setNavigationBarTitle({ title: demand.title || '需求详情' });
    } catch (err) {
      console.error('[loadDemand detail error]', err);
      wx.showToast({ title: err.error || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  findDemand(posts, sourceId) {
    const openPosts = (posts || []).filter(item => item && item.status === 'open' && item.title);
    const demand = openPosts.find(item => String(item.id || item.title) === String(sourceId));
    if (!demand) return null;
    return {
      id: demand.id || demand.title,
      title: demand.title || '',
      description: demand.description || '',
      created_at: demand.created_at || '',
      time_label: this.formatTimeLabel(demand.created_at),
    };
  },

  respondDemand() {
    if (!this.data.agent || !this.data.demand) return;
    this.setData({
      showResponsePanel: true,
      responseMessage: '',
    });
  },

  closeResponsePanel() {
    if (this.data.submittingResponse) return;
    this.setData({
      showResponsePanel: false,
      responseMessage: '',
    });
  },

  noop() {},

  onResponseInput(e) {
    this.setData({ responseMessage: e.detail.value });
  },

  async submitResponse() {
    if (!this.data.agent || !this.data.demand || this.data.submittingResponse) return;
    const agent = this.data.agent;
    const demand = this.data.demand;
    const message = (this.data.responseMessage || '').trim();
    if (message.length < 2) {
      wx.showToast({ title: '请写一句回应内容', icon: 'none' });
      return;
    }

    this.setData({ submittingResponse: true });
    try {
      const result = await app.request({
        url: '/trust/connect',
        method: 'POST',
        data: {
          target_cid: agent.cid,
          message,
          source_type: 'demand',
          source_id: demand.id,
        },
      });
      this.setData({
        showResponsePanel: false,
        responseMessage: '',
        submittingResponse: false,
      });
      wx.showToast({
        title: result.data && result.data.already_connected ? '已连接过' : result.data && result.data.already_requested ? '已回应过' : '已发送给对方',
        icon: 'success',
      });
    } catch (err) {
      this.setData({ submittingResponse: false });
      wx.showToast({ title: err.error || '发送失败', icon: 'none' });
    }
  },

  viewAgent() {
    if (!this.data.agent || !this.data.agent.cid) return;
    wx.navigateTo({ url: `/pages/agents/public?cid=${this.data.agent.cid}` });
  },

  formatAgent(agent) {
    const profile = agent.value_profile || {};
    const basicProfile = agent.basic_profile || {};
    return {
      ...agent,
      initial: agent.nickname ? agent.nickname.slice(0, 1) : '?',
      basic_profile: basicProfile,
      core_value: profile.core_value || '对方暂未填写核心价值。',
      trust_score: agent.trust_score || 0,
    };
  },

  formatTags(tags) {
    return (tags || []).map(tag => TAG_LABELS[tag] || tag);
  },

  formatLocation(profile) {
    const parts = [profile.province, profile.city].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '位置未填写';
  },

  formatTimeLabel(value) {
    if (!value) return '刚刚';
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return '刚刚';
    const diff = Date.now() - time;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}分钟前`;
    if (diff < day) return `${Math.floor(diff / hour)}小时前`;
    if (diff < 7 * day) return `${Math.floor(diff / day)}天前`;
    const date = new Date(time);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },
});
