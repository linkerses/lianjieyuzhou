// 服务方工作台

const app = getApp();

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
        app.request({ url: '/services', data: { provider: app.globalData.cid } }).catch(() => ({ data: [] })),
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
      const services = serviceRes.data || [];
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
