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
    systemLabels: {
      health: '健康',
      living: '生活',
      connection: '连接',
      growth: '成长',
      wealth: '财富',
      create: '创造',
      explore: '探索',
      spirit: '精神',
      future: '未来',
    },
  },

  onLoad(options = {}) {
    if (options.role && ['all', 'buyer', 'seller'].includes(options.role)) {
      this.setData({ activeTab: options.role });
    }
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
        transactions: (res.data || []).map(item => this.formatTransaction(item)),
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

  formatTransaction(item) {
    const isSeller = item.seller_cid === app.globalData.cid;
    const isBuyer = item.buyer_cid === app.globalData.cid;
    const system = item.services && item.services.primary_system ? item.services.primary_system : '';
    return {
      ...item,
      service_name: item.services && item.services.name ? item.services.name : '服务',
      service_system: this.data.systemLabels[system] || system,
      status_label: this.data.statusLabels[item.status] || item.status,
      amount_text: this.formatAmount(item.amount),
      scheduled_text: this.formatDateTime(item.scheduled_at),
      role_label: isSeller ? '服务方' : (isBuyer ? '买方' : '相关方'),
      counterparty_label: isSeller ? '买方' : '服务方',
      counterparty_cid: isSeller ? item.buyer_cid : item.seller_cid,
      action_hint: this.buildActionHint(item, isBuyer, isSeller),
      urgency_class: this.getUrgencyClass(item, isBuyer, isSeller),
    };
  },

  formatAmount(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return '面议';
    return `${amount}元`;
  },

  formatDateTime(value) {
    if (!value) return '未约时间';
    const date = new Date(value);
    const time = date.getTime();
    if (!Number.isFinite(time)) return String(value);
    const pad = n => String(n).padStart(2, '0');
    return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  buildActionHint(item, isBuyer, isSeller) {
    if (item.status === 'pending') {
      return isSeller ? '请确认是否开始服务' : '等待服务方确认';
    }
    if (item.status === 'confirmed') {
      return isBuyer ? '服务完成后确认交付' : '服务中，完成后提醒买方确认';
    }
    if (item.status === 'completed') {
      return isBuyer ? '请提交评分' : '等待买方评分';
    }
    if (item.status === 'rated') return '已形成信任记录';
    if (item.status === 'cancelled') return '预约已取消';
    return '查看详情';
  },

  getUrgencyClass(item, isBuyer, isSeller) {
    if (item.status === 'pending' && isSeller) return 'urgent';
    if (item.status === 'completed' && isBuyer && !item.actual_score) return 'urgent';
    if (item.status === 'confirmed') return 'active';
    if (item.status === 'rated') return 'done';
    return '';
  },
});
