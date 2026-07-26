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

const GENDER_OPTIONS = ['未设置', '男', '女', '其他'];
const ENERGY_OPTIONS = ['未设置', '输出期', '输入期', '调整期'];

const SERVICE_STATUS_LABELS = {
  pending: '待审核',
  active: '已上架',
  paused: '已暂停',
  archived: '已归档',
};

const DELIVERY_LABELS = {
  online: '线上',
  offline: '线下',
  hybrid: '线上/线下',
};

const TAG_LABELS = SYSTEM_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const DEFAULT_DEMAND_FORM = {
  id: '',
  title: '',
  description: '',
};

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
      province: '',
      city: '',
      gender: '',
      bio: '',
    },
    basicProfile: {
      avatar_url: '',
      province: '',
      city: '',
      gender: '',
      bio: '',
    },
    lifeStageTagLabels: [],
    genderOptions: GENDER_OPTIONS,
    energyOptions: ENERGY_OPTIONS,
    genderIndex: 0,
    energyIndex: 0,
    editingBasicProfile: false,
    editingValueProfile: false,
    editingDemand: false,
    demandForm: { ...DEFAULT_DEMAND_FORM },
    demandPosts: [],
    openDemandPosts: [],
    inactiveDemandPosts: [],
    services: [],
    skills: [],
    trustInfo: null,
    trustNetwork: {
      outgoing: [],
      incoming: [],
      traded: [],
      connections: [],
    },
    connectionRequests: {
      incoming: [],
      outgoing: [],
    },
    matchReports: [],
    loading: {
      agent: true,
      skills: true,
      services: true,
      trust: true,
      network: true,
      requests: true,
      matches: true,
    },
    editingTags: false,
    tempTags: [],
    systemOptions: SYSTEM_OPTIONS,
    activeTab: 'profile', // profile / demands / services / skills / trust / match
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
    const targetTab = wx.getStorageSync('agent_default_tab');
    if (targetTab) {
      wx.removeStorageSync('agent_default_tab');
      this.setData({ activeTab: targetTab });
    }
    if (app.globalData.cid && this.data.agent) {
      this.loadTrustInfo();
      this.loadTrustNetwork();
      this.loadConnectionRequests();
      this.loadMatchReports();
    }
  },

  async loadAll() {
    if (!app.globalData.cid) {
      const loginRes = await app.login();
      if (!loginRes.success) {
        this.setData({
          errorMessage: loginRes.error || '登录失败，请检查网络配置',
          'loading.agent': false,
          'loading.skills': false,
          'loading.services': false,
          'loading.trust': false,
          'loading.network': false,
          'loading.requests': false,
          'loading.matches': false,
        });
        return;
      }
    }
    await Promise.all([
      this.loadAgent(),
      this.loadMyServices(),
      this.loadSkills(),
      this.loadTrustInfo(),
      this.loadTrustNetwork(),
      this.loadConnectionRequests(),
      this.loadMatchReports(),
    ]);
  },

  async loadAgent() {
    try {
      const res = await app.request({ url: '/agents/me' });
      if (res.data) {
        const valueProfile = this.normalizeValueProfile(res.data.agent_config);
        const basicProfile = this.normalizeBasicProfile(res.data);
        const demandState = this.normalizeDemandState(res.data.agent_config);
        this.setData({
          agent: res.data,
          basicProfile,
          basicForm: { ...basicProfile },
          energyIndex: this.getEnergyIndex(res.data.energy_status),
          lifeStageTagLabels: this.formatTags(res.data.life_stage_tags || []),
          valueProfile,
          valueForm: { ...valueProfile },
          ...demandState,
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

  async loadMyServices() {
    try {
      const res = await app.request({
        url: '/services',
        data: { provider: app.globalData.cid, status: 'all' },
      });

      this.setData({
        services: (res.data || []).map(item => this.formatService(item)),
        'loading.services': false,
      });
    } catch (err) {
      console.error('[loadMyServices error]', err);
      this.setData({ 'loading.services': false });
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

  async loadTrustNetwork() {
    try {
      const res = await app.request({ url: '/trust/network/mine' });
      const data = res.data || {};
      this.setData({
        trustNetwork: {
          outgoing: this.formatConnectionAgents(data.outgoing || []),
          incoming: this.formatConnectionAgents(data.incoming || []),
          traded: this.formatConnectionAgents(data.traded || []),
          connections: this.formatConnectionAgents(data.connections || []),
        },
        'loading.network': false,
      });
    } catch (err) {
      console.error('[loadTrustNetwork error]', err);
      this.setData({ 'loading.network': false });
    }
  },

  async loadConnectionRequests() {
    try {
      const res = await app.request({ url: '/trust/requests/mine' });
      const data = res.data || {};
      this.setData({
        connectionRequests: {
          incoming: (data.incoming || []).map(item => this.formatConnectionRequest(item, 'incoming')),
          outgoing: (data.outgoing || []).map(item => this.formatConnectionRequest(item, 'outgoing')),
        },
        'loading.requests': false,
      });
    } catch (err) {
      console.error('[loadConnectionRequests error]', err);
      this.setData({ 'loading.requests': false });
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
      'loading.services': true,
      'loading.trust': true,
      'loading.network': true,
      'loading.requests': true,
      'loading.matches': true,
    });
    this.loadAll();
  },

  startEditBasicProfile() {
    this.setData({
      editingBasicProfile: true,
      basicForm: this.normalizeBasicProfile(this.data.agent),
      genderIndex: this.getGenderIndex(this.normalizeBasicProfile(this.data.agent).gender),
      energyIndex: this.getEnergyIndex(this.data.agent && this.data.agent.energy_status),
    });
  },

  cancelEditBasicProfile() {
    this.setData({
      editingBasicProfile: false,
      basicForm: this.normalizeBasicProfile(this.data.agent),
      genderIndex: this.getGenderIndex(this.normalizeBasicProfile(this.data.agent).gender),
      energyIndex: this.getEnergyIndex(this.data.agent && this.data.agent.energy_status),
    });
  },

  onBasicInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`basicForm.${field}`]: e.detail.value });
  },

  onGenderChange(e) {
    const genderIndex = Number(e.detail.value || 0);
    const gender = this.data.genderOptions[genderIndex] || '';
    this.setData({
      genderIndex,
      'basicForm.gender': gender === '未设置' ? '' : gender,
    });
  },

  onEnergyChange(e) {
    const energyIndex = Number(e.detail.value || 0);
    this.setData({ energyIndex });
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
          energy_status: this.getEnergyValueByIndex(this.data.energyIndex),
          agent_config: {
            ...currentConfig,
            avatar_url: this.data.basicForm.avatar_url.trim(),
            basic_profile: {
              province: this.data.basicForm.province.trim(),
              city: this.data.basicForm.city.trim(),
              gender: this.data.basicForm.gender.trim(),
              bio: this.data.basicForm.bio.trim(),
            },
          },
        },
      });

      if (res.data) {
        const basicProfile = this.normalizeBasicProfile(res.data);
        this.setData({
          agent: res.data,
          basicProfile,
          basicForm: { ...basicProfile },
          genderIndex: this.getGenderIndex(basicProfile.gender),
          energyIndex: this.getEnergyIndex(res.data.energy_status),
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
          lifeStageTagLabels: this.formatTags(res.data.life_stage_tags || []),
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

  viewConnectionAgent(e) {
    wx.navigateTo({ url: `/pages/agents/public?cid=${e.currentTarget.dataset.cid}` });
  },

  matchConnectionAgent(e) {
    wx.navigateTo({ url: `/pages/match/report?target_cid=${e.currentTarget.dataset.cid}` });
  },

  openConnectionThread(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/connections/thread?id=${id}` });
  },

  async updateConnectionRequest(e) {
    const { id, status } = e.currentTarget.dataset;
    const labelMap = {
      accepted: '已接受',
      ignored: '已忽略',
      closed: '已关闭',
    };
    try {
      await app.request({
        url: `/trust/requests/${id}/status`,
        method: 'PATCH',
        data: { status },
      });
      wx.showToast({ title: labelMap[status] || '已处理', icon: 'success' });
      this.loadConnectionRequests();
      this.loadTrustNetwork();
    } catch (err) {
      wx.showToast({ title: err.error || '处理失败', icon: 'none' });
    }
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
    wx.switchTab({ url: '/pages/agents/plaza' });
  },

  // ── 需求动态 ──

  startCreateDemand() {
    this.setData({
      editingDemand: true,
      demandForm: { ...DEFAULT_DEMAND_FORM },
    });
  },

  startEditDemand(e) {
    const id = e.currentTarget.dataset.id;
    const demand = this.data.demandPosts.find(item => item.id === id);
    if (!demand) return;
    this.setData({
      editingDemand: true,
      demandForm: {
        id: demand.id,
        title: demand.title,
        description: demand.description,
      },
    });
  },

  cancelEditDemand() {
    this.setData({
      editingDemand: false,
      demandForm: { ...DEFAULT_DEMAND_FORM },
    });
  },

  onDemandInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`demandForm.${field}`]: e.detail.value });
  },

  async saveDemand() {
    const title = this.data.demandForm.title.trim();
    const description = this.data.demandForm.description.trim();
    if (!title) {
      wx.showToast({ title: '请填写需求标题', icon: 'none' });
      return;
    }
    if (!description) {
      wx.showToast({ title: '请描述具体需求', icon: 'none' });
      return;
    }

    const now = new Date().toISOString();
    let demandPosts = [...this.data.demandPosts];
    if (this.data.demandForm.id) {
      demandPosts = demandPosts.map(item => item.id === this.data.demandForm.id
        ? { ...item, title, description, updated_at: now }
        : item);
    } else {
      demandPosts.unshift({
        id: `demand_${Date.now()}`,
        title,
        description,
        status: 'open',
        created_at: now,
        updated_at: now,
      });
    }

    await this.saveDemandPosts(demandPosts, '需求已发布');
    this.setData({
      editingDemand: false,
      demandForm: { ...DEFAULT_DEMAND_FORM },
    });
  },

  async updateDemandStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const demandPosts = this.data.demandPosts.map(item => item.id === id
      ? { ...item, status, updated_at: new Date().toISOString() }
      : item);
    const titleMap = {
      open: '已重新公开',
      resolved: '已标记解决',
      hidden: '已隐藏',
    };
    await this.saveDemandPosts(demandPosts, titleMap[status] || '已更新');
  },

  async saveDemandPosts(demandPosts, toastTitle) {
    const cleanDemandPosts = demandPosts.map(item => ({
      id: item.id,
      title: item.title,
      description: item.description,
      status: item.status,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));
    const currentConfig = this.data.agent && this.data.agent.agent_config
      ? this.data.agent.agent_config
      : {};
    const valueProfile = this.normalizeValueProfile(currentConfig);
    const syncedValueProfile = {
      ...valueProfile,
      vision_needs: this.composeOpenDemandSummary(cleanDemandPosts),
    };

    try {
      const res = await app.request({
        url: '/agents/me',
        method: 'PATCH',
        data: {
          agent_config: {
            ...currentConfig,
            demand_posts: cleanDemandPosts,
            value_profile: syncedValueProfile,
          },
        },
      });

      const demandState = this.normalizeDemandState(res.data ? res.data.agent_config : { demand_posts: cleanDemandPosts });
      this.setData({
        agent: res.data || this.data.agent,
        valueProfile: syncedValueProfile,
        valueForm: { ...syncedValueProfile },
        ...demandState,
      });
      wx.showToast({ title: toastTitle, icon: 'success' });
    } catch (err) {
      console.error('[saveDemandPosts error]', err);
      wx.showToast({ title: '需求保存失败', icon: 'none' });
    }
  },

  goCreateService() {
    wx.navigateTo({ url: '/pages/seller/service-form' });
  },

  goManageServices() {
    wx.navigateTo({ url: '/pages/seller/workbench?tab=services' });
  },

  goEditService(e) {
    wx.navigateTo({ url: `/pages/seller/service-form?id=${e.currentTarget.dataset.id}` });
  },

  goServiceDetail(e) {
    wx.navigateTo({ url: `/pages/services/detail?id=${e.currentTarget.dataset.id}` });
  },

  async updateServiceStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    try {
      await app.request({
        url: `/services/${id}`,
        method: 'PATCH',
        data: { status },
      });
      wx.showToast({ title: status === 'active' ? '已上架' : '已暂停', icon: 'success' });
      this.loadMyServices();
    } catch (err) {
      wx.showToast({ title: err.error || '操作失败', icon: 'none' });
    }
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

  formatTags(tags) {
    return (tags || []).map(tag => TAG_LABELS[tag] || tag);
  },

  formatConnectionAgents(agents) {
    return (agents || []).map(item => ({
      ...item,
      life_stage_tag_labels: this.formatTags(item.life_stage_tags || []),
    }));
  },

  formatConnectionRequest(item, direction) {
    const other = direction === 'incoming' ? item.requester : item.target;
    const date = new Date(item.created_at);
    return {
      ...item,
      other,
      other_name: other && other.nickname ? other.nickname : direction === 'incoming' ? item.requester_cid : item.target_cid,
      other_cid: direction === 'incoming' ? item.requester_cid : item.target_cid,
      status_label: this.getConnectionRequestStatusLabel(item.status),
      created_text: Number.isNaN(date.getTime()) ? '' : `${date.getMonth() + 1}月${date.getDate()}日`,
      can_accept: direction === 'incoming' && item.status === 'pending',
      can_close: direction === 'outgoing' && item.status === 'pending',
      can_message: item.status === 'accepted',
    };
  },

  getConnectionRequestStatusLabel(status) {
    const map = {
      pending: '待处理',
      accepted: '已接受',
      ignored: '已忽略',
      closed: '已关闭',
    };
    return map[status] || status || '-';
  },

  formatService(item) {
    const tags = [
      TAG_LABELS[item.primary_system] || item.primary_system,
      item.secondary_system ? TAG_LABELS[item.secondary_system] || item.secondary_system : '',
      DELIVERY_LABELS[item.delivery_method] || item.delivery_method,
      item.duration_minutes ? `${item.duration_minutes}分钟` : '',
    ].concat(item.suitable_stages || []).filter(Boolean).slice(0, 5);

    return {
      ...item,
      system_label: TAG_LABELS[item.primary_system] || item.primary_system,
      delivery_label: DELIVERY_LABELS[item.delivery_method] || item.delivery_method,
      status_label: SERVICE_STATUS_LABELS[item.status] || item.status || '已上架',
      can_activate: item.status !== 'active',
      can_pause: item.status === 'active',
      tags,
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
    const profile = config.basic_profile || {};
    return {
      nickname: agent && agent.nickname ? agent.nickname : '',
      avatar_url: config.avatar_url || '',
      province: profile.province || '',
      city: profile.city || '',
      gender: profile.gender || '',
      bio: profile.bio || '',
    };
  },

  normalizeDemandState(config) {
    const posts = this.normalizeDemandPosts(config && config.demand_posts ? config.demand_posts : []);
    return {
      demandPosts: posts,
      openDemandPosts: posts.filter(item => item.status === 'open'),
      inactiveDemandPosts: posts.filter(item => item.status !== 'open'),
    };
  },

  normalizeDemandPosts(posts) {
    return (posts || [])
      .filter(item => item && item.title)
      .map(item => ({
        id: item.id || `demand_${Date.now()}`,
        title: item.title || '',
        description: item.description || '',
        status: item.status || 'open',
        created_at: item.created_at || '',
        updated_at: item.updated_at || '',
        status_label: this.getDemandStatusLabel(item.status || 'open'),
      }));
  },

  getDemandStatusLabel(status) {
    const map = {
      open: '进行中',
      resolved: '已解决',
      hidden: '已隐藏',
    };
    return map[status] || status;
  },

  composeOpenDemandSummary(posts) {
    return (posts || [])
      .filter(item => item.status === 'open')
      .map(item => `${item.title}：${item.description}`)
      .join('\n');
  },

  getGenderIndex(gender) {
    const index = GENDER_OPTIONS.indexOf(gender || '未设置');
    return index >= 0 ? index : 0;
  },

  getEnergyIndex(status) {
    const index = ENERGY_OPTIONS.indexOf(status || '未设置');
    return index >= 0 ? index : 0;
  },

  getEnergyValueByIndex(index) {
    const value = ENERGY_OPTIONS[index] || '未设置';
    return value === '未设置' ? 'unknown' : value;
  },
});
