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

const SORTS = [
  { key: 'recommended', label: '推荐' },
  { key: 'latest', label: '最新' },
  { key: 'trust', label: '信任' },
  { key: 'services', label: '有服务' },
  { key: 'complete', label: '档案完整' },
];

const TAG_LABELS = FILTERS.reduce((acc, item) => {
  if (item.key !== 'all') acc[item.key] = item.label;
  return acc;
}, {});

Page({
  data: {
    agents: [],
    filters: FILTERS,
    sorts: SORTS,
    activeFilter: 'all',
    activeSort: 'recommended',
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
      const params = { limit: 30, sort: this.data.activeSort };
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

  switchSort(e) {
    const key = e.currentTarget.dataset.key;
    if (key !== this.data.activeSort) {
      this.setData({ activeSort: key }, () => this.loadAgents());
    }
  },

  viewAgent(e) {
    wx.navigateTo({ url: `/pages/agents/public?cid=${e.currentTarget.dataset.cid}` });
  },

  applyMatch(e) {
    wx.navigateTo({ url: `/pages/match/report?target_cid=${e.currentTarget.dataset.cid}` });
  },

  clearFilter() {
    if (this.data.activeFilter === 'all') return;
    this.setData({ activeFilter: 'all' }, () => this.loadAgents());
  },

  formatAgent(item) {
    const profile = item.value_profile || {};
    const initial = item.nickname ? item.nickname.slice(0, 1) : '?';
    const serviceCount = item.service_count || 0;
    const completion = item.profile_completion || 0;
    const hasCompleteProfile = completion >= 80;
    return {
      ...item,
      initial,
      core_value: profile.core_value || '暂未填写核心价值',
      service_capabilities: profile.service_capabilities || '暂未填写服务能力',
      project_experience: profile.project_experience || '',
      vision_needs: profile.vision_needs || '暂未填写愿景需求',
      service_badge: serviceCount > 0 ? `${serviceCount}个服务` : '暂无服务',
      completion_badge: `档案${completion}%`,
      service_badge_class: serviceCount > 0 ? 'metric-pill strong' : 'metric-pill',
      completion_badge_class: hasCompleteProfile ? 'metric-pill strong' : 'metric-pill',
      has_complete_profile: hasCompleteProfile,
      life_stage_tag_labels: this.formatTags(item.life_stage_tags || []),
      contact_reason: this.buildContactReason(profile, serviceCount, completion),
    };
  },

  formatTags(tags) {
    return (tags || []).map(tag => TAG_LABELS[tag] || tag);
  },

  buildContactReason(profile, serviceCount, completion) {
    if (profile.service_capabilities && profile.vision_needs) {
      return '能力和需求都已公开，适合先生成匹配报告再沟通。';
    }
    if (serviceCount > 0) {
      return '已有可预约服务，适合从一次轻量体验开始。';
    }
    if (completion >= 80) {
      return '档案较完整，适合先查看公开档案判断合作方向。';
    }
    return '档案还在完善中，建议先查看基础信息或等待对方补充。';
  },
});
