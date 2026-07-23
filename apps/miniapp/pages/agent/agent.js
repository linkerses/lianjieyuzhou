// 我的Agent页面：档案管理 + 技能管理 + 授权管理

const app = getApp();
const SYSTEM_OPTIONS = [
  { value: 'health', label: '🫀 健康' },
  { value: 'living', label: '🏠 生活' },
  { value: 'connection', label: '🤝 连接' },
  { value: 'growth', label: '📚 成长' },
  { value: 'wealth', label: '💰 财富' },
  { value: 'create', label: '✨ 创造' },
  { value: 'explore', label: '🌍 探索' },
  { value: 'spirit', label: '🧘 精神' },
  { value: 'future', label: '🔮 未来' },
];

Page({
  data: {
    agent: null,
    skills: [],
    trustInfo: null,
    loading: {
      agent: true,
      skills: true,
      trust: true,
    },
    editingTags: false,
    tempTags: [],
    systemOptions: SYSTEM_OPTIONS,
    activeTab: 'profile', // profile / skills / trust
  },

  onLoad() {
    this.loadAll();
  },

  onShow() {
    if (app.globalData.cid && this.data.agent) {
      this.loadTrustInfo();
    }
  },

  async loadAll() {
    if (!app.globalData.cid) {
      await app.login(true);
    }
    await Promise.all([
      this.loadAgent(),
      this.loadSkills(),
      this.loadTrustInfo(),
    ]);
  },

  async loadAgent() {
    try {
      const res = await app.request({ url: '/agents/me' });
      if (res.data) {
        this.setData({
          agent: res.data,
          tempTags: res.data.life_stage_tags || [],
          'loading.agent': false,
        });
      }
    } catch (err) {
      console.error('[loadAgent error]', err);
      this.setData({ 'loading.agent': false });
    }
  },

  async loadSkills() {
    try {
      const res = await app.request({ url: '/skills/mine' });
      if (res.data) {
        this.setData({
          skills: res.data,
          'loading.skills': false,
        });
      }
    } catch (err) {
      console.error('[loadSkills error]', err);
      this.setData({ 'loading.skills': false });
    }
  },

  async loadTrustInfo() {
    try {
      const res = await app.request({ url: '/trust/my-score' });
      if (res.data) {
        this.setData({
          trustInfo: res.data,
          'loading.trust': false,
        });
      }
    } catch (err) {
      console.error('[loadTrustInfo error]', err);
      this.setData({ 'loading.trust': false });
    }
  },

  // ── 标签编辑 ──

  startEditTags() {
    this.setData({
      editingTags: true,
      tempTags: [...(this.data.agent?.life_stage_tags || [])],
    });
  },

  toggleTag(e) {
    const tag = e.currentTarget.dataset.value;
    let tags = [...this.data.tempTags];
    if (tags.includes(tag)) {
      tags = tags.filter(t => t !== tag);
    } else {
      if (tags.length >= 3) {
        wx.showToast({ title: '最多选择3个', icon: 'none' });
        return;
      }
      tags.push(tag);
    }
    this.setData({ tempTags: tags });
  },

  async saveTags() {
    if (this.data.tempTags.length === 0) {
      wx.showToast({ title: '至少选择1个标签', icon: 'none' });
      return;
    }

    try {
      const res = await app.request({
        url: '/agents/me',
        method: 'PATCH',
        data: { life_stage_tags: this.data.tempTags },
      });

      if (res.data) {
        this.setData({
          'agent.life_stage_tags': res.data.life_stage_tags,
          editingTags: false,
        });
        wx.showToast({ title: '已更新', icon: 'success' });
      }
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  cancelEditTags() {
    this.setData({
      editingTags: false,
      tempTags: [...(this.data.agent?.life_stage_tags || [])],
    });
  },

  // ── 技能开关 ──

  async toggleSkill(e) {
    const { key, status } = e.currentTarget.dataset;
    const newStatus = status === 'active' ? 'inactive' : 'active';

    try {
      const res = await app.request({
        url: '/agents/me/skills',
        method: 'PATCH',
        data: { skill: key, status: newStatus },
      });

      if (res.data) {
        // 更新本地技能状态
        const skills = this.data.skills.map(s => {
          if (s.key === key) s.status = newStatus;
          return s;
        });
        this.setData({ skills });
        wx.showToast({ title: newStatus === 'active' ? '已开启' : '已关闭', icon: 'success' });
      }
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // ── 切换Tab ──

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },
});
