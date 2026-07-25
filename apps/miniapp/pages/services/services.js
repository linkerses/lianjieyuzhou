// 服务列表

const app = getApp();

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
    services: [],
    loading: true,
    activeFilter: 'all',
    filters: [
      { key: 'all', label: '全部' },
      { key: 'health', label: '🫀 健康' },
      { key: 'living', label: '🏠 生活' },
      { key: 'connection', label: '🤝 连接' },
      { key: 'growth', label: '📚 成长' },
      { key: 'wealth', label: '💰 财富' },
      { key: 'create', label: '✨ 创造' },
      { key: 'explore', label: '🌍 探索' },
      { key: 'spirit', label: '🧘 精神' },
      { key: 'future', label: '🔮 未来' },
    ],
  },

  onLoad() {
    this.loadServices();
  },

  onShow() {
    if (this.data.services.length > 0 && !this.data.loading) {
      this.loadServices();
    }
  },

  async loadServices() {
    this.setData({ loading: true });
    try {
      const params = {};
      if (this.data.activeFilter !== 'all') {
        params.system = this.data.activeFilter;
      }

      const res = await app.request({ url: '/services', data: params });
      this.setData({
        services: (res.data || []).map(item => this.formatService(item)),
        loading: false,
      });
    } catch (err) {
      console.error('[loadServices error]', err);
      this.setData({ loading: false });
    }
  },

  switchFilter(e) {
    const key = e.currentTarget.dataset.key;
    if (key !== this.data.activeFilter) {
      this.setData({ activeFilter: key }, () => {
        this.loadServices();
      });
    }
  },

  onTapService(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/services/detail?id=${id}` });
  },

  clearFilter() {
    if (this.data.activeFilter === 'all') return;
    this.setData({ activeFilter: 'all' }, () => this.loadServices());
  },

  formatService(item) {
    const systemLabel = SYSTEM_LABELS[item.primary_system] || item.primary_system;
    const deliveryLabel = DELIVERY_LABELS[item.delivery_method] || item.delivery_method || '线上/线下';
    const tags = [
      systemLabel,
      item.secondary_system ? SYSTEM_LABELS[item.secondary_system] || item.secondary_system : '',
      deliveryLabel,
      item.duration_minutes ? `${item.duration_minutes}分钟` : '',
    ].concat(item.suitable_stages || []).filter(Boolean).slice(0, 5);

    return {
      ...item,
      system_label: systemLabel,
      delivery_label: deliveryLabel,
      price_label: this.formatPrice(item.price),
      fit_hint: this.buildFitHint(item, systemLabel),
      tags,
    };
  },

  formatPrice(price) {
    const value = Number(price || 0);
    if (!Number.isFinite(value) || value <= 0) return '面议';
    return `${value}元`;
  },

  buildFitHint(item, systemLabel) {
    const stages = Array.isArray(item.suitable_stages) ? item.suitable_stages.filter(Boolean) : [];
    if (stages.length > 0) {
      return `适合：${stages.slice(0, 2).join('、')}`;
    }
    if (item.delivery_count > 0) {
      return `已有 ${item.delivery_count} 次交付记录，适合先看详情再预约。`;
    }
    return `适合正在处理「${systemLabel}」相关问题的人先了解。`;
  },
});
