const app = getApp();

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'health', label: '健康' },
  { key: 'living', label: '生活' },
  { key: 'connection', label: '连接' },
  { key: 'growth', label: '成长' },
  { key: 'wealth', label: '财富' },
  { key: 'create', label: '创造' },
  { key: 'explore', label: '探索' },
  { key: 'spirit', label: '精神' },
  { key: 'future', label: '未来' },
];

Page({
  data: {
    agents: [],
    filters: FILTERS,
    activeFilter: 'all',
    loading: true,
  },

  onLoad() {
    this.loadAgents();
  },

  onShow() {
    if (!this.data.loading) {
      this.loadAgents();
    }
  },

  async loadAgents() {
    this.setData({ loading: true });
    try {
      const params = { limit: 30 };
      if (this.data.activeFilter !== 'all') {
        params.tag = this.data.activeFilter;
      }
      const res = await app.request({ url: '/agents/public', data: params });
      this.setData({
        agents: (res.data || []).map(item => this.formatAgent(item)),
        loading: false,
      });
    } catch (err) {
      console.error('[loadAgentPlaza error]', err);
      wx.showToast({ title: err.error || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  switchFilter(e) {
    const key = e.currentTarget.dataset.key;
    if (key !== this.data.activeFilter) {
      this.setData({ activeFilter: key }, () => this.loadAgents());
    }
  },

  viewAgent(e) {
    wx.navigateTo({ url: `/pages/agents/public?cid=${e.currentTarget.dataset.cid}` });
  },

  applyMatch(e) {
    wx.navigateTo({ url: `/pages/match/report?target_cid=${e.currentTarget.dataset.cid}` });
  },

  formatAgent(item) {
    const profile = item.value_profile || {};
    const initial = item.nickname ? item.nickname.slice(0, 1) : '?';
    return {
      ...item,
      initial,
      core_value: profile.core_value || '暂未填写核心价值',
      service_capabilities: profile.service_capabilities || '暂未填写服务能力',
    };
  },
});
