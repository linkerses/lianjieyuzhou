// 服务列表

const app = getApp();

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
        services: res.data || [],
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
});
