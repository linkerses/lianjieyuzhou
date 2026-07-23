// 交易列表

const app = getApp();

Page({
  data: {
    transactions: [],
    loading: true,
    activeTab: 'all',
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'buyer', label: '作为买方' },
      { key: 'seller', label: '作为服务方' },
    ],
    statusLabels: {
      pending: '待服务',
      confirmed: '服务中',
      completed: '已完成',
      rated: '已评分',
      disputed: '争议中',
      cancelled: '已取消',
    },
  },

  onLoad() {
    this.loadTransactions();
  },

  onShow() {
    this.loadTransactions();
  },

  async loadTransactions() {
    this.setData({ loading: true });
    try {
      const params = {};
      if (this.data.activeTab !== 'all') {
        params.role = this.data.activeTab;
      }

      const res = await app.request({ url: '/transactions/mine', data: params });
      this.setData({
        transactions: res.data || [],
        loading: false,
      });
    } catch (err) {
      console.error('[loadTransactions error]', err);
      this.setData({ loading: false });
    }
  },

  switchTab(e) {
    const key = e.currentTarget.dataset.key;
    if (key !== this.data.activeTab) {
      this.setData({ activeTab: key }, () => {
        this.loadTransactions();
      });
    }
  },

  onTapTransaction(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/transaction/detail?id=${id}` });
  },
});
