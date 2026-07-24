// 服务方工作台

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

const SERVICE_STATUS_LABELS = {
  pending: '待审核',
  active: '已上架',
  paused: '已暂停',
  archived: '已归档',
};

Page({
  data: {
    loading: true,
    activeTab: 'orders',
    transactions: [],
    services: [],
    pendingOrders: [],
    confirmedOrders: [],
    completedOrders: [],
    statCards: [],
    statusLabels: {
      pending: '待开始',
      confirmed: '服务中',
      completed: '待评分',
      rated: '已评分',
      disputed: '争议中',
      cancelled: '已取消',
    },
  },

  onLoad() {
    this.loadWorkbench();
  },

  onShow() {
    this.loadWorkbench();
  },

  async loadWorkbench() {
    if (!app.globalData.cid) {
      await app.login(true);
    }

    this.setData({ loading: true });
    try {
      const [txRes, serviceRes] = await Promise.all([
        app.request({ url: '/transactions/mine', data: { role: 'seller' } }),
        app.request({ url: '/services', data: { provider: app.globalData.cid, status: 'all' } }).catch(() => ({ data: [] })),
      ]);

      const transactions = (txRes.data || []).map(item => ({
        ...item,
        service_name: item.services && item.services.name ? item.services.name : '服务',
        service_system: item.services && item.services.primary_system ? item.services.primary_system : '',
        status_label: this.data.statusLabels[item.status] || item.status,
        scheduled_text: this.formatTime(item.scheduled_at),
        created_text: this.formatTime(item.created_at),
        can_confirm: item.status === 'pending',
      }));
      const services = (serviceRes.data || []).map(item => this.formatService(item));
      const pendingOrders = transactions.filter(item => item.status === 'pending');
      const confirmedOrders = transactions.filter(item => item.status === 'confirmed');
      const completedOrders = transactions.filter(item => item.status === 'completed' || item.status === 'rated');

      this.setData({
        transactions,
        services,
        pendingOrders,
        confirmedOrders,
        completedOrders,
        statCards: [
          { label: '待开始', value: pendingOrders.length },
          { label: '服务中', value: confirmedOrders.length },
          { label: '已完成', value: completedOrders.length },
          { label: '我的服务', value: services.length },
        ],
        loading: false,
      });
    } catch (err) {
      console.error('[loadSellerWorkbench error]', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  goTransactionDetail(e) {
    wx.navigateTo({ url: `/pages/transaction/detail?id=${e.currentTarget.dataset.id}` });
  },

  goServiceDetail(e) {
    wx.navigateTo({ url: `/pages/services/detail?id=${e.currentTarget.dataset.id}` });
  },

  goCreateService() {
    wx.navigateTo({ url: '/pages/seller/service-form' });
  },

  goEditService(e) {
    wx.navigateTo({ url: `/pages/seller/service-form?id=${e.currentTarget.dataset.id}` });
  },

  formatService(item) {
    const tags = [
      SYSTEM_LABELS[item.primary_system] || item.primary_system,
      item.secondary_system ? SYSTEM_LABELS[item.secondary_system] || item.secondary_system : '',
      DELIVERY_LABELS[item.delivery_method] || item.delivery_method,
      item.duration_minutes ? `${item.duration_minutes}分钟` : '',
    ].concat(item.suitable_stages || []).filter(Boolean).slice(0, 5);

    return {
      ...item,
      system_label: SYSTEM_LABELS[item.primary_system] || item.primary_system,
      delivery_label: DELIVERY_LABELS[item.delivery_method] || item.delivery_method,
      status_label: SERVICE_STATUS_LABELS[item.status] || item.status || '已上架',
      price_label: `${item.price || 0}元`,
      can_activate: item.status !== 'active',
      can_pause: item.status === 'active',
      tags,
    };
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
      this.loadWorkbench();
    } catch (err) {
      wx.showToast({ title: err.error || '操作失败', icon: 'none' });
    }
  },

  async confirmOrder(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await app.request({
        url: `/transactions/${id}/status`,
        method: 'PATCH',
        data: { status: 'confirmed' },
      });
      wx.showToast({ title: '已确认开始', icon: 'success' });
      this.loadWorkbench();
    } catch (err) {
      wx.showToast({ title: err.error || '确认失败', icon: 'none' });
    }
  },

  goTransactions() {
    wx.navigateTo({ url: '/pages/transaction/transaction?role=seller' });
  },

  formatTime(value) {
    if (!value) return '未约定';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = n => String(n).padStart(2, '0');
    return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },
});
