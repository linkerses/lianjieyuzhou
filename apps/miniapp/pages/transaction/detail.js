// 交易详情 + 评分

const app = getApp();

Page({
  data: {
    transaction: null,
    serviceName: '',
    statusLabel: '',
    statusHint: '',
    roleLabel: '',
    amountText: '',
    scheduledText: '',
    completedText: '',
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
        statusHint: this.buildStatusHint(transaction, isBuyer, isSeller),
        roleLabel: isBuyer ? '我是买方' : (isSeller ? '我是服务方' : '相关方'),
        amountText: this.formatAmount(transaction.amount),
        scheduledText: this.formatDateTime(transaction.scheduled_at),
        completedText: this.formatDateTime(transaction.completed_at),
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

  formatAmount(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return '面议';
    return `${amount}元`;
  },

  formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    const time = date.getTime();
    if (!Number.isFinite(time)) return String(value);
    const pad = n => String(n).padStart(2, '0');
    return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  buildStatusHint(transaction, isBuyer, isSeller) {
    if (!transaction) return '';
    if (transaction.status === 'pending') {
      return isSeller
        ? '请确认你是否能接这个预约。确认后，买方会看到服务已开始。'
        : '预约已提交，等待服务方确认。你可以先准备背景资料和问题清单。';
    }
    if (transaction.status === 'confirmed') {
      return isBuyer
        ? '服务正在进行中。完成后由你确认交付，确认后再进入评分。'
        : '你已确认开始服务。完成交付后，提醒买方确认完成。';
    }
    if (transaction.status === 'completed') {
      return isBuyer
        ? '服务已完成，请提交评分和文字反馈，形成双方信任记录。'
        : '买方已确认完成，等待买方评分。';
    }
    if (transaction.status === 'rated') {
      return '本次协作已形成信任记录，可作为后续匹配和服务推荐依据。';
    }
    if (transaction.status === 'cancelled') {
      return '本次预约已取消，不会继续进入服务流程。';
    }
    return '请根据当前状态处理下一步。';
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
