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

  // 联系服务方（V0.2：复制CID，后续可做直接通信）
  onContact() {
    if (this.data.service) {
      wx.setClipboardData({
        data: this.data.service.provider_cid,
        success: () => wx.showToast({ title: '已复制联结者ID', icon: 'none' }),
      });
    }
  },

  getScoreColor(score) {
    if (!score) return '#999';
    if (score >= 80) return '#2D3E2F';
    if (score >= 60) return '#B8860B';
    return '#999';
  },

  formatServiceSystem(service) {
    if (!service) return '';
    return service.secondary_system
      ? `${service.primary_system} + ${service.secondary_system}`
      : service.primary_system;
  },

  formatDeliveryMethod(method) {
    if (method === 'online') return '线上';
    if (method === 'offline') return '线下';
    return '线上/线下';
  },
});
