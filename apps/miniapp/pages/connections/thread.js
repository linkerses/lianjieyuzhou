const app = getApp();

Page({
  data: {
    id: '',
    request: null,
    otherName: '',
    otherCid: '',
    messages: [],
    inputValue: '',
    loading: true,
    submitting: false,
    accepting: false,
    canAccept: false,
    canSend: false,
    statusText: '',
  },

  onLoad(options = {}) {
    if (!options.id) {
      this.setData({ loading: false });
      wx.showToast({ title: '缺少会话ID', icon: 'none' });
      return;
    }
    this.setData({ id: options.id });
    this.loadThread();
  },

  onShow() {
    if (this.data.id) this.loadThread();
  },

  async loadThread() {
    try {
      const res = await app.request({ url: `/trust/requests/${this.data.id}/messages` });
      const request = res.data && res.data.request ? res.data.request : null;
      const messages = res.data && res.data.messages ? res.data.messages : [];
      const myCid = app.globalData.cid || wx.getStorageSync('cid');
      const isRequester = request && request.requester_cid === myCid;
      const other = request ? (isRequester ? request.target : request.requester) : null;
      const otherCid = request ? (isRequester ? request.target_cid : request.requester_cid) : '';
      this.setData({
        request,
        otherName: other && other.nickname ? other.nickname : otherCid,
        otherCid,
        messages: this.formatMessages(messages, myCid),
        canAccept: !!request && request.target_cid === myCid && request.status === 'pending',
        canSend: !!request && request.status === 'accepted',
        statusText: this.getStatusText(request),
        loading: false,
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err.error || '会话加载失败', icon: 'none' });
    }
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  async acceptConnection() {
    if (!this.data.id || this.data.accepting) return;
    this.setData({ accepting: true });
    try {
      await app.request({
        url: `/trust/requests/${this.data.id}/status`,
        method: 'PATCH',
        data: { status: 'accepted' },
      });
      wx.showToast({ title: '已接受联结', icon: 'success' });
      this.setData({ accepting: false });
      this.loadThread();
    } catch (err) {
      this.setData({ accepting: false });
      wx.showToast({ title: err.error || '处理失败', icon: 'none' });
    }
  },

  async sendMessage() {
    const content = (this.data.inputValue || '').trim();
    if (!content) {
      wx.showToast({ title: '请填写留言内容', icon: 'none' });
      return;
    }
    if (!this.data.canSend || this.data.submitting) return;

    this.setData({ submitting: true });
    try {
      await app.request({
        url: `/trust/requests/${this.data.id}/messages`,
        method: 'POST',
        data: { content },
      });
      this.setData({ inputValue: '', submitting: false });
      this.loadThread();
    } catch (err) {
      this.setData({ submitting: false });
      wx.showToast({ title: err.error || '发送失败', icon: 'none' });
    }
  },

  viewOtherAgent() {
    if (!this.data.otherCid) return;
    wx.navigateTo({ url: `/pages/agents/public?cid=${this.data.otherCid}` });
  },

  generateMatchReport() {
    if (!this.data.otherCid) return;
    wx.navigateTo({ url: `/pages/match/report?target_cid=${this.data.otherCid}` });
  },

  getStatusText(request) {
    if (!request) return '';
    const map = {
      pending: '等待回应',
      accepted: '已建立联结',
      ignored: '已暂不处理',
      closed: '已关闭',
    };
    return map[request.status] || request.status || '';
  },

  formatMessages(messages, myCid) {
    return (messages || []).map(item => {
      const date = new Date(item.created_at);
      return {
        ...item,
        isMine: item.sender_cid === myCid,
        createdText: Number.isNaN(date.getTime()) ? '' : `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
      };
    });
  },
});
