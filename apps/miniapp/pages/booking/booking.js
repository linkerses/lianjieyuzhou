// 预约页面

const app = getApp();

Page({
  data: {
    serviceId: '',
    sellerCid: '',
    service: null,
    loading: true,
    submitting: false,
    // 预约表单
    scheduledDate: '',
    selectedDateLabel: '',
    scheduledTime: '',
    note: '',
    dateOptions: [],
    timeOptions: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '19:00', '20:00'],
  },

  onLoad(options) {
    const { service_id, seller_cid } = options;
    this.setData({ serviceId: service_id, sellerCid: seller_cid });
    this.initDates();
    this.loadService(service_id);
  },

  initDates() {
    // 生成未来7天的日期选项
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const label = `${d.getMonth() + 1}月${d.getDate()}日 ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]}`;
      const value = d.toISOString().split('T')[0];
      dates.push({ label, value });
    }
    this.setData({ dateOptions: dates });
  },

  async loadService(id) {
    try {
      const res = await app.request({ url: `/services/${id}` });
      this.setData({
        service: res.data,
        loading: false,
      });
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onDateChange(e) {
    const selected = this.data.dateOptions[Number(e.detail.value)];
    this.setData({
      scheduledDate: selected ? selected.value : '',
      selectedDateLabel: selected ? selected.label : '',
    });
  },

  onTimeChange(e) {
    this.setData({ scheduledTime: this.data.timeOptions[e.detail.value] });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  async submitBooking() {
    if (!this.data.scheduledDate || !this.data.scheduledTime) {
      wx.showToast({ title: '请选择预约时间', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      const scheduledAt = `${this.data.scheduledDate}T${this.data.scheduledTime}:00+08:00`;

      const res = await app.request({
        url: '/transactions',
        method: 'POST',
        data: {
          service_id: this.data.serviceId,
          seller_cid: this.data.sellerCid,
          scheduled_at: scheduledAt,
          booking_note: this.data.note.trim(),
        },
      });

      if (res.data) {
        wx.showToast({ title: '预约成功', icon: 'success' });

        // V0.2: 跳转到交易详情页
        setTimeout(() => {
          wx.redirectTo({ url: `/pages/transaction/detail?id=${res.data.id}` });
        }, 1500);
      }
    } catch (err) {
      const message = err.error || err.message || err.errMsg || '请稍后重试';
      wx.showToast({ title: '预约失败: ' + message, icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
