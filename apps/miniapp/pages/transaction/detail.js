// 交易详情 + 评分

const app = getApp();

Page({
  data: {
    transaction: null,
    serviceName: '',
    statusLabel: '',
    isBuyer: false,
    isSeller: false,
    counterpartyLabel: '',
    counterpartyCid: '',
    loading: true,
    scoring: false,
    // 评分表单
    rating: 0,
    note: '',
    // 状态标签
    statusLabels: {
      pending: '⏳ 待服务',
      confirmed: '🔧 服务中',
      completed: '✅ 已完成（待评分）',
      rated: '⭐ 已评分',
      disputed: '⚠️ 争议中',
      cancelled: '❌ 已取消',
    },
  },

  onLoad(options) {
    const { id } = options;
    if (id) this.loadDetail(id);
  },

  async loadDetail(id) {
    this.setData({ loading: true });
    try {
      const res = await app.request({ url: `/transactions/${id}` });
      const transaction = res.data;
      const isBuyer = transaction && transaction.buyer_cid === app.globalData.cid;
      const isSeller = transaction && transaction.seller_cid === app.globalData.cid;

      this.setData({
        transaction,
        serviceName: transaction && transaction.services && transaction.services.name ? transaction.services.name : '—',
        statusLabel: this.data.statusLabels[transaction.status] || transaction.status,
        isBuyer,
        isSeller,
        counterpartyLabel: isBuyer ? '服务方' : '买方',
        counterpartyCid: isBuyer ? transaction.seller_cid : transaction.buyer_cid,
        loading: false,
      });
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 服务方确认
  async confirmService() {
    try {
      await app.request({
        url: `/transactions/${this.data.transaction.id}/status`,
        method: 'PATCH',
        data: { status: 'confirmed' },
      });
      wx.showToast({ title: '已确认', icon: 'success' });
      this.loadDetail(this.data.transaction.id);
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 买方确认完成
  async completeService() {
    try {
      await app.request({
        url: `/transactions/${this.data.transaction.id}/status`,
        method: 'PATCH',
        data: { status: 'completed' },
      });
      wx.showToast({ title: '已确认完成', icon: 'success' });
      this.loadDetail(this.data.transaction.id);
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 开始评分
  startScoring() {
    this.setData({ scoring: true });
  },

  onRatingChange(e) {
    this.setData({ rating: e.detail.value });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  async submitFeedback() {
    if (this.data.rating === 0) {
      wx.showToast({ title: '请选择评分', icon: 'none' });
      return;
    }

    try {
      await app.request({
        url: `/transactions/${this.data.transaction.id}/feedback`,
        method: 'POST',
        data: {
          actual_score: this.data.rating,
          buyer_note: this.data.note,
        },
      });
      wx.showToast({ title: '评分已提交', icon: 'success' });
      this.setData({ scoring: false });
      this.loadDetail(this.data.transaction.id);
    } catch (err) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    }
  },

});
