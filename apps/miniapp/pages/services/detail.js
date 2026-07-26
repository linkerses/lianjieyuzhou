// 服务详情页

const app = getApp();

Page({
  data: {
    service: null,
    preEnact: null,
    preScoreColor: '#999',
    dimensionScores: {
      resonance: 0,
      stage_fit: 0,
      history: 0,
      trust: 0,
    },
    serviceSystemText: '',
    deliveryMethodText: '',
    priceText: '',
    providerInitial: '?',
    descriptionSections: [],
    summaryPills: [],
    loading: true,
    booking: false,
  },

  onLoad(options) {
    const { id } = options;
    if (id) {
      this.loadDetail(id);
    }
  },

  async loadDetail(serviceId) {
    this.setData({ loading: true });
    try {
      // 并行加载服务详情和预演评分
      const [serviceRes, preRes] = await Promise.all([
        app.request({ url: `/services/${serviceId}` }),
        app.request({
          url: '/pre-enact/score',
          method: 'POST',
          data: { agent_cid: app.globalData.cid, service_id: serviceId },
        }).catch(() => null), // 预演评分失败不影响服务详情展示
      ]);

      const service = serviceRes.data;
      const preEnact = preRes && preRes.data ? preRes.data : null;
      const dimensions = preEnact && preEnact.dimensions ? preEnact.dimensions : {};

      this.setData({
        service,
        preEnact,
        preScoreColor: this.getScoreColor(preEnact && preEnact.total_score),
        dimensionScores: {
          resonance: dimensions.resonance || 0,
          stage_fit: dimensions.stage_fit || 0,
          history: dimensions.history || 0,
          trust: dimensions.trust || 0,
        },
        serviceSystemText: this.formatServiceSystem(service),
        deliveryMethodText: this.formatDeliveryMethod(service && service.delivery_method),
        priceText: this.formatPrice(service && service.price),
        providerInitial: this.getProviderInitial(service),
        descriptionSections: this.parseDescriptionSections(service && service.description),
        summaryPills: this.buildSummaryPills(service),
        loading: false,
      });
    } catch (err) {
      console.error('[loadDetail error]', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 预约服务
  onBook() {
    if (!this.data.service) return;
    wx.navigateTo({
      url: `/pages/booking/booking?service_id=${this.data.service.id}&seller_cid=${this.data.service.provider_cid}`,
    });
  },

  // 联系服务方：先提交轻量联结申请，不直接进入聊天。
  onContact() {
    if (!this.data.service) return;
    const service = this.data.service;
    wx.showModal({
      title: '联系服务方',
      editable: true,
      placeholderText: '写一句你想咨询的问题',
      content: `给 ${service.provider_nickname || service.provider_cid} 留一句联结理由`,
      confirmText: '发送',
      success: async (res) => {
        if (!res.confirm) return;
        const message = (res.content || '').trim();
        if (message.length < 2) {
          wx.showToast({ title: '请写一句联结理由', icon: 'none' });
          return;
        }
        try {
          const result = await app.request({
            url: '/trust/connect',
            method: 'POST',
            data: {
              target_cid: service.provider_cid,
              message,
              source_type: 'service',
              source_id: service.id,
            },
          });
          wx.showToast({
            title: result.data && result.data.already_connected ? '已联结过' : result.data && result.data.already_requested ? '已申请过' : '申请已发送',
            icon: 'success',
          });
        } catch (err) {
          wx.showToast({ title: err.error || '发送失败', icon: 'none' });
        }
      },
    });
  },

  viewProviderAgent() {
    if (!this.data.service || !this.data.service.provider_cid) return;
    wx.navigateTo({
      url: `/pages/agents/public?cid=${this.data.service.provider_cid}`,
    });
  },

  applyProviderMatch() {
    if (!this.data.service || !this.data.service.provider_cid) return;
    wx.navigateTo({
      url: `/pages/match/report?target_cid=${this.data.service.provider_cid}`,
    });
  },

  getScoreColor(score) {
    if (!score) return '#999';
    if (score >= 80) return '#2D3E2F';
    if (score >= 60) return '#B8860B';
    return '#999';
  },

  formatServiceSystem(service) {
    if (!service) return '';
    const primary = this.formatSystem(service.primary_system);
    const secondary = service.secondary_system ? this.formatSystem(service.secondary_system) : '';
    return secondary ? `${primary} + ${secondary}` : primary;
  },

  formatSystem(system) {
    const map = {
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
    return map[system] || system || '';
  },

  formatPrice(price) {
    const value = Number(price || 0);
    if (!Number.isFinite(value) || value <= 0) return '面议';
    return `${value}元`;
  },

  getProviderInitial(service) {
    const name = service && (service.provider_nickname || service.provider_cid);
    return name ? String(name).slice(0, 1) : '?';
  },

  buildSummaryPills(service) {
    if (!service) return [];
    return [
      this.formatServiceSystem(service),
      service.duration_minutes ? `${service.duration_minutes}分钟` : '',
      this.formatDeliveryMethod(service.delivery_method),
      service.delivery_count ? `交付 ${service.delivery_count}次` : '',
    ].filter(Boolean);
  },

  formatDeliveryMethod(method) {
    if (method === 'online') return '线上';
    if (method === 'offline') return '线下';
    return '线上/线下';
  },

  parseDescriptionSections(text = '') {
    if (!text) return [];

    if (text.indexOf('服务介绍：') === -1) {
      return [{ label: '服务介绍', text }];
    }

    return [
      { label: '服务介绍', text: this.extractSection(text, '服务介绍：', '适合谁：') },
      { label: '适合人群', text: this.extractSection(text, '适合谁：', '交付物：') || this.extractSection(text, '适合谁：', '不适合谁：') },
      { label: '交付物', text: this.extractSection(text, '交付物：', '案例描述：') },
      { label: '案例描述', text: this.extractSection(text, '案例描述：', '不适合谁：') },
      { label: '不适合谁', text: this.extractSection(text, '不适合谁：', '') },
    ].filter(item => item.text);
  },

  extractSection(text, start, end) {
    const startIndex = text.indexOf(start);
    if (startIndex === -1) return '';
    const contentStart = startIndex + start.length;
    const endIndex = end ? text.indexOf(end, contentStart) : -1;
    return text.slice(contentStart, endIndex === -1 ? undefined : endIndex).trim();
  },
});
