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
    valueProfile: {
      core_value: '',
      service_capabilities: '',
      project_experience: '',
      vision_needs: '',
    },
    valueForm: {
      core_value: '',
      service_capabilities: '',
      project_experience: '',
      vision_needs: '',
    },
    basicForm: {
      nickname: '',
      avatar_url: '',
    },
    editingBasicProfile: false,
    editingValueProfile: false,
    skills: [],
    trustInfo: null,
    matchReports: [],
    loading: {
      agent: true,
      skills: true,
      trust: true,
      matches: true,
    },
    editingTags: false,
    tempTags: [],
    systemOptions: SYSTEM_OPTIONS,
    activeTab: 'profile', // profile / skills / trust / match
    matchingTargetCid: '',
    errorMessage: '',
  },

  onLoad(options = {}) {
    if (options.tab) {
      this.setData({ activeTab: options.tab });
    }
    this.loadAll();
  },

  onShow() {
    if (app.globalData.cid && this.data.agent) {
      this.loadTrustInfo();
      this.loadMatchReports();
    }
  },

  async loadAll() {
    if (!app.globalData.cid) {
      const loginRes = await app.login(true);
      if (!loginRes.success) {
        this.setData({
          errorMessage: loginRes.error || '登录失败，请检查网络配置',
          'loading.agent': false,
          'loading.skills': false,
          'loading.trust': false,
          'loading.matches': false,
        });
        return;
      }
    }
    await Promise.all([
      this.loadAgent(),
      this.loadSkills(),
      this.loadTrustInfo(),
      this.loadMatchReports(),
    ]);
  },

  async loadAgent() {
    try {
      const res = await app.request({ url: '/agents/me' });
      if (res.data) {
        const valueProfile = this.normalizeValueProfile(res.data.agent_config);
        const basicProfile = this.normalizeBasicProfile(res.data);
        this.setData({
          agent: res.data,
          basicForm: { ...basicProfile },
          valueProfile,
          valueForm: { ...valueProfile },
          tempTags: res.data.life_stage_tags || [],
          systemOptions: this.markSelectedSystems(res.data.life_stage_tags || []),
          'loading.agent': false,
        });
      }
    } catch (err) {
      console.error('[loadAgent error]', err);
      this.setData({
        errorMessage: err.message || err.errMsg || err.error || 'Agent 数据加载失败',
        'loading.agent': false,
      });
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

  async loadMatchReports() {
    try {
      const res = await app.request({ url: '/matches/mine' });
      this.setData({
        matchReports: (res.data || []).map(item => this.formatMatchReport(item)),
        'loading.matches': false,
      });
    } catch (err) {
      console.error('[loadMatchReports error]', err);
      this.setData({ 'loading.matches': false });
    }
  },

  retryLoad() {
    this.setData({
      errorMessage: '',
      'loading.agent': true,
      'loading.skills': true,
      'loading.trust': true,
      'loading.matches': true,
    });
    this.loadAll();
  },

  startEditBasicProfile() {
    this.setData({
      editingBasicProfile: true,
      basicForm: this.normalizeBasicProfile(this.data.agent),
    });
  },

  cancelEditBasicProfile() {
    this.setData({
      editingBasicProfile: false,
      basicForm: this.normalizeBasicProfile(this.data.agent),
    });
  },

  onBasicInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`basicForm.${field}`]: e.detail.value });
  },

  async saveBasicProfile() {
    const nickname = this.data.basicForm.nickname.trim();
    if (!nickname) {
      wx.showToast({ title: '请填写称呼', icon: 'none' });
      return;
    }

    const currentConfig = this.data.agent && this.data.agent.agent_config
      ? this.data.agent.agent_config
      : {};

    try {
      const res = await app.request({
        url: '/agents/me',
        method: 'PATCH',
        data: {
          nickname,
          agent_config: {
            ...currentConfig,
            avatar_url: this.data.basicForm.avatar_url.trim(),
          },
        },
      });

      if (res.data) {
        this.setData({
          agent: res.data,
          basicForm: this.normalizeBasicProfile(res.data),
          editingBasicProfile: false,
        });
        wx.setStorageSync('nickname', res.data.nickname);
        app.globalData.nickname = res.data.nickname;
        wx.showToast({ title: '资料已更新', icon: 'success' });
      }
    } catch (err) {
      wx.showToast({ title: err.error || '保存失败', icon: 'none' });
    }
  },

  startEditValueProfile() {
    this.setData({
      editingValueProfile: true,
      valueForm: { ...this.data.valueProfile },
    });
  },

  cancelEditValueProfile() {
    this.setData({
      editingValueProfile: false,
      valueForm: { ...this.data.valueProfile },
    });
  },

  onValueInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`valueForm.${field}`]: e.detail.value,
    });
  },

  async saveValueProfile() {
    const currentConfig = this.data.agent && this.data.agent.agent_config
      ? this.data.agent.agent_config
      : {};
    const valueProfile = this.normalizeValueProfile({
      value_profile: this.data.valueForm,
    });

    try {
      const res = await app.request({
        url: '/agents/me',
        method: 'PATCH',
        data: {
          agent_config: {
            ...currentConfig,
            value_profile: valueProfile,
          },
        },
      });

      if (res.data) {
        this.setData({
          agent: res.data,
          valueProfile,
          valueForm: { ...valueProfile },
          editingValueProfile: false,
        });
        wx.showToast({ title: '档案已更新', icon: 'success' });
      }
    } catch (err) {
      console.error('[saveValueProfile error]', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // ── 标签编辑 ──

  startEditTags() {
    const tags = this.data.agent && this.data.agent.life_stage_tags
      ? this.data.agent.life_stage_tags
      : [];

    this.setData({
      editingTags: true,
      tempTags: [...tags],
      systemOptions: this.markSelectedSystems(tags),
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
    this.setData({
      tempTags: tags,
      systemOptions: this.markSelectedSystems(tags),
    });
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
          systemOptions: this.markSelectedSystems(res.data.life_stage_tags || []),
        });
        wx.showToast({ title: '已更新', icon: 'success' });
      }
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  cancelEditTags() {
    const tags = this.data.agent && this.data.agent.life_stage_tags
      ? this.data.agent.life_stage_tags
      : [];

    this.setData({
      editingTags: false,
      tempTags: [...tags],
      systemOptions: this.markSelectedSystems(tags),
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

  goTrustNetwork() {
    this.setData({ activeTab: 'trust' });
  },

  onMatchCidInput(e) {
    this.setData({ matchingTargetCid: e.detail.value.trim() });
  },

  generateMatchReport() {
    const targetCid = this.data.matchingTargetCid;
    if (!targetCid) {
      wx.showToast({ title: '请输入对方CID', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/match/report?target_cid=${targetCid}` });
  },

  goAgentPlaza() {
    wx.navigateTo({ url: '/pages/agents/plaza' });
  },

  openMatchReport(e) {
    wx.navigateTo({ url: `/pages/match/report?id=${e.currentTarget.dataset.id}` });
  },

  formatMatchReport(item) {
    const target = item.target && item.target.nickname ? item.target.nickname : item.target_cid;
    const requester = item.requester && item.requester.nickname ? item.requester.nickname : item.requester_cid;
    const date = new Date(item.created_at);
    const createdText = Number.isNaN(date.getTime())
      ? ''
      : `${date.getMonth() + 1}月${date.getDate()}日`;

    return {
      ...item,
      title: `${requester} × ${target}`,
      created_text: createdText,
    };
  },

  markSelectedSystems(tags) {
    return SYSTEM_OPTIONS.map(item => ({
      ...item,
      selected: tags.includes(item.value),
    }));
  },

  normalizeValueProfile(config) {
    const profile = config && config.value_profile ? config.value_profile : {};
    return {
      core_value: profile.core_value || '',
      service_capabilities: profile.service_capabilities || '',
      project_experience: profile.project_experience || '',
      vision_needs: profile.vision_needs || '',
    };
  },

  normalizeBasicProfile(agent) {
    const config = agent && agent.agent_config ? agent.agent_config : {};
    return {
      nickname: agent && agent.nickname ? agent.nickname : '',
      avatar_url: config.avatar_url || '',
    };
  },
});
