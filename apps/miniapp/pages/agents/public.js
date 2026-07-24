const app = getApp();

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
    const basicProfile = agent.basic_profile || {};
    return {
      ...agent,
      basic_profile: {
        province: basicProfile.province || '',
        city: basicProfile.city || '',
        gender: basicProfile.gender || '',
        bio: basicProfile.bio || '',
      },
      initial: agent.nickname ? agent.nickname.slice(0, 1) : '?',
      life_stage_tag_labels: this.formatTags(agent.life_stage_tags || []),
    };
  },

  formatTags(tags) {
    return (tags || []).map(tag => TAG_LABELS[tag] || tag);
  },
});
