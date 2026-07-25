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
    priceText: '',
    serviceMeta: [],
    noteTemplates: [
      '我想解决的问题是：\n目前情况：\n希望本次服务后得到：',
      '我正在做的项目：\n卡住的地方：\n希望服务方提前了解：',
      '我适合线上沟通，期望先做一次初步诊断。',
    ],
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
    // 生成未来7天的日期选项，默认从明天开始，避免误选已过时间。
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i + 1);
      const label = `${d.getMonth() + 1}月${d.getDate()}日 ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]}`;
      const value = this.formatDateValue(d);
      dates.push({ label, value });
    }
    this.setData({
      dateOptions: dates,
      scheduledDate: dates[0] ? dates[0].value : '',
      selectedDateLabel: dates[0] ? dates[0].label : '',
      scheduledTime: '10:00',
    });
  },

  async loadService(id) {
    try {
      const res = await app.request({ url: `/services/${id}` });
      this.setData({
        service: res.data,
        priceText: this.formatPrice(res.data && res.data.price),
        serviceMeta: this.buildServiceMeta(res.data),
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

  useNoteTemplate(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    const template = this.data.noteTemplates[index] || this.data.noteTemplates[0];
    this.setData({ note: template });
  },

  formatPrice(price) {
    const value = Number(price || 0);
    if (!Number.isFinite(value) || value <= 0) return '面议';
    return `${value}元`;
  },

  buildServiceMeta(service) {
    if (!service) return [];
    const deliveryMap = {
      online: '线上',
      offline: '线下',
      hybrid: '线上/线下',
    };
    return [
      service.duration_minutes ? `${service.duration_minutes}分钟` : '',
      deliveryMap[service.delivery_method] || service.delivery_method || '',
      service.delivery_count ? `已交付 ${service.delivery_count}次` : '',
    ].filter(Boolean);
  },

  formatDateValue(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  },

  async submitBooking() {
    if (!this.data.scheduledDate || !this.data.scheduledTime) {
      wx.showToast({ title: '请选择预约时间', icon: 'none' });
      return;
    }

    if ((this.data.note || '').trim().length < 8) {
      wx.showToast({ title: '请补充预约备注', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      if (this.data.service && this.data.service.provider_cid === app.globalData.cid) {
        wx.showToast({ title: '不能预约自己的服务', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }

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
