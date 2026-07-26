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

const SYSTEM_LABELS = {
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

const DELIVERY_LABELS = {
  online: '线上',
  offline: '线下',
  hybrid: '线上/线下',
};

Page({
  data: {
    cid: '',
    agent: null,
    services: [],
    locationText: '',
    profileSummary: '',
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
      const [agentRes, servicesRes] = await Promise.all([
        app.request({ url: `/agents/public/${cid}` }),
        app.request({ url: '/services', data: { provider: cid, limit: 5 } }).catch(() => ({ data: [] })),
      ]);
      const agent = this.formatAgent(agentRes.data);
      this.setData({
        agent,
        services: (servicesRes.data || []).map(item => this.formatService(item)),
        locationText: this.formatLocation(agent.basic_profile),
        profileSummary: this.buildProfileSummary(agent),
        loading: false,
      });
      wx.setNavigationBarTitle({ title: agentRes.data.nickname || '公开档案' });
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

  startConnection() {
    if (!this.data.agent) return;
    const agent = this.data.agent;
    wx.showModal({
      title: '发起连接',
      editable: true,
      placeholderText: '写一句你为什么想连接对方',
      content: `给 ${agent.nickname || agent.cid} 留一句连接理由`,
      confirmText: '发送',
      success: async (res) => {
        if (!res.confirm) return;
        const message = (res.content || '').trim();
        if (message.length < 2) {
          wx.showToast({ title: '请写一句连接理由', icon: 'none' });
          return;
        }
        try {
          const result = await app.request({
            url: '/trust/connect',
            method: 'POST',
            data: {
              target_cid: agent.cid,
              message,
              source_type: 'agent',
            },
          });
          wx.showToast({
            title: result.data && result.data.already_connected ? '已连接过' : result.data && result.data.already_requested ? '已申请过' : '申请已发送',
            icon: 'success',
          });
        } catch (err) {
          wx.showToast({ title: err.error || '发送失败', icon: 'none' });
        }
      },
    });
  },

  openDemandDetail(e) {
    if (!this.data.agent) return;
    const dataset = e.currentTarget.dataset || {};
    const sourceId = dataset.sourceId;
    if (!sourceId) return;
    wx.navigateTo({
      url: `/pages/demands/detail?cid=${this.data.agent.cid}&source_id=${encodeURIComponent(sourceId)}`,
    });
  },

  viewService(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/services/detail?id=${id}` });
  },

  scrollToSection(e) {
    const target = e.currentTarget.dataset.target;
    if (!target) return;
    wx.pageScrollTo({
      selector: `#${target}`,
      duration: 260,
      offsetTop: 12,
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
    const formatted = {
      ...agent,
      basic_profile: {
        province: basicProfile.province || '',
        city: basicProfile.city || '',
        gender: basicProfile.gender || '',
        bio: basicProfile.bio || '',
      },
      initial: agent.nickname ? agent.nickname.slice(0, 1) : '?',
      life_stage_tag_labels: this.formatTags(agent.life_stage_tags || []),
      demand_posts: this.normalizeDemandPosts(agent.demand_posts || []),
    };
    return formatted;
  },

  normalizeDemandPosts(posts) {
    return (posts || [])
      .filter(item => item && item.status === 'open' && item.title)
      .map(item => ({
        id: item.id || item.title,
        title: item.title || '',
        description: item.description || '',
      }));
  },

  formatTags(tags) {
    return (tags || []).map(tag => TAG_LABELS[tag] || tag);
  },

  formatService(item) {
    const systemLabel = SYSTEM_LABELS[item.primary_system] || item.primary_system || '服务';
    const deliveryLabel = DELIVERY_LABELS[item.delivery_method] || item.delivery_method || '线上/线下';
    return {
      ...item,
      system_label: systemLabel,
      delivery_label: deliveryLabel,
      price_label: this.formatPrice(item.price),
      tags: [
        systemLabel,
        item.secondary_system ? SYSTEM_LABELS[item.secondary_system] || item.secondary_system : '',
        deliveryLabel,
        item.duration_minutes ? `${item.duration_minutes}分钟` : '',
      ].concat(item.suitable_stages || []).filter(Boolean).slice(0, 4),
    };
  },

  formatPrice(price) {
    const value = Number(price || 0);
    if (!Number.isFinite(value) || value <= 0) return '面议';
    return `${value}元`;
  },

  formatLocation(profile) {
    const parts = [profile.province, profile.city].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '位置未填写';
  },

  buildProfileSummary(agent) {
    const profile = agent.value_profile || {};
    if (agent.demand_posts && agent.demand_posts.length > 0) {
      return `正在寻找：${agent.demand_posts[0].title}`;
    }
    if (profile.service_capabilities) {
      return `可提供：${profile.service_capabilities}`;
    }
    if (profile.core_value) {
      return profile.core_value;
    }
    return '档案还在完善中，可以先查看基础信息。';
  },
});
