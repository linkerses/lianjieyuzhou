// 发布 / 编辑服务

const app = getApp();

const SYSTEM_OPTIONS = [
  { value: 'health', label: '🫀 健康' },
  { value: 'living', label: '🏠 生活' },
  { value: 'connection', label: '🤝 连接' },
  { value: 'growth', label: '📚 成长' },
  { value: 'wealth', label: '💰 财富' },
  { value: 'create', label: '✨ 创造' },
  { value: 'explore', label: '🌍 探索' },
  { value: 'spirit', label: '🧘 精神' },
  { value: 'future', label: '🔮 未来' },
];

const DELIVERY_OPTIONS = [
  { value: 'online', label: '线上' },
  { value: 'offline', label: '线下' },
  { value: 'hybrid', label: '线上/线下' },
];

const DEFAULT_FORM = {
  name: '',
  primary_system: 'create',
  secondary_system: '',
  suitable_stages_text: '',
  description: '',
  suitable_for: '',
  not_suitable_for: '',
  price: '',
  duration_minutes: '',
  delivery_method: 'online',
  location: '',
};

Page({
  data: {
    id: '',
    isEdit: false,
    loading: false,
    submitting: false,
    pageTitle: '发布服务',
    submitButtonText: '上架服务',
    form: { ...DEFAULT_FORM },
    systemOptions: SYSTEM_OPTIONS,
    secondarySystemOptions: [{ value: '', label: '不设置' }, ...SYSTEM_OPTIONS],
    deliveryOptions: DELIVERY_OPTIONS,
    primarySystemLabel: '✨ 创造',
    secondarySystemLabel: '不设置',
    deliveryMethodLabel: '线上',
  },

  onLoad(options = {}) {
    if (options.id) {
      this.setData({ id: options.id, isEdit: true, pageTitle: '编辑服务', submitButtonText: '保存修改' });
      wx.setNavigationBarTitle({ title: '编辑服务' });
      this.loadService(options.id);
    } else {
      wx.setNavigationBarTitle({ title: '发布服务' });
      this.syncLabels();
    }
  },

  async loadService(id) {
    this.setData({ loading: true });
    try {
      const res = await app.request({ url: `/services/${id}` });
      const service = res.data || {};
      const parsedDescription = this.parseDescription(service.description || '');
      this.setData({
        form: {
          name: service.name || '',
          primary_system: service.primary_system || 'create',
          secondary_system: service.secondary_system || '',
          suitable_stages_text: (service.suitable_stages || []).join('、'),
          description: parsedDescription.description,
          suitable_for: parsedDescription.suitable_for,
          not_suitable_for: parsedDescription.not_suitable_for,
          price: service.price ? String(service.price) : '',
          duration_minutes: service.duration_minutes ? String(service.duration_minutes) : '',
          delivery_method: service.delivery_method || 'online',
          location: service.location || '',
        },
        loading: false,
      });
      this.syncLabels();
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onPrimarySystemChange(e) {
    const item = this.data.systemOptions[Number(e.detail.value)];
    this.setData({ 'form.primary_system': item.value }, () => this.syncLabels());
  },

  onSecondarySystemChange(e) {
    const item = this.data.secondarySystemOptions[Number(e.detail.value)];
    this.setData({ 'form.secondary_system': item.value }, () => this.syncLabels());
  },

  onDeliveryChange(e) {
    const item = this.data.deliveryOptions[Number(e.detail.value)];
    this.setData({ 'form.delivery_method': item.value }, () => this.syncLabels());
  },

  syncLabels() {
    const primary = this.data.systemOptions.find(item => item.value === this.data.form.primary_system);
    const secondary = this.data.secondarySystemOptions.find(item => item.value === this.data.form.secondary_system);
    const delivery = this.data.deliveryOptions.find(item => item.value === this.data.form.delivery_method);
    this.setData({
      primarySystemLabel: primary ? primary.label : '请选择',
      secondarySystemLabel: secondary ? secondary.label : '不设置',
      deliveryMethodLabel: delivery ? delivery.label : '请选择',
    });
  },

  validateForm() {
    const form = this.data.form;
    if (!form.name.trim()) return '请填写服务名称';
    if (!form.description.trim()) return '请填写服务介绍';
    if (!form.suitable_for.trim()) return '请填写适合谁';
    if (!form.price || Number(form.price) <= 0) return '请填写有效价格';
    if (form.duration_minutes && Number(form.duration_minutes) <= 0) return '时长必须大于0';
    if ((form.delivery_method === 'offline' || form.delivery_method === 'hybrid') && !form.location.trim()) {
      return '线下服务请填写地点';
    }
    return '';
  },

  buildPayload() {
    const form = this.data.form;
    const stages = form.suitable_stages_text
      .split(/[、,，\n]/)
      .map(item => item.trim())
      .filter(Boolean);
    const payload = {
      name: form.name.trim(),
      primary_system: form.primary_system,
      secondary_system: form.secondary_system || null,
      suitable_stages: stages,
      description: this.composeDescription(form),
      price: Number(form.price),
      delivery_method: form.delivery_method,
      location: form.location.trim(),
    };
    if (form.duration_minutes) {
      payload.duration_minutes = Number(form.duration_minutes);
    }
    return payload;
  },

  composeDescription(form) {
    return [
      '服务介绍：',
      form.description.trim(),
      '',
      '适合谁：',
      form.suitable_for.trim(),
      '',
      '不适合谁：',
      form.not_suitable_for.trim() || '暂无明确限制，预约前可先沟通确认。',
    ].join('\n');
  },

  parseDescription(text) {
    const fallback = {
      description: text,
      suitable_for: '',
      not_suitable_for: '',
    };

    if (!text || text.indexOf('服务介绍：') === -1) return fallback;

    return {
      description: this.extractSection(text, '服务介绍：', '适合谁：') || '',
      suitable_for: this.extractSection(text, '适合谁：', '不适合谁：') || '',
      not_suitable_for: this.extractSection(text, '不适合谁：', '') || '',
    };
  },

  extractSection(text, start, end) {
    const startIndex = text.indexOf(start);
    if (startIndex === -1) return '';
    const contentStart = startIndex + start.length;
    const endIndex = end ? text.indexOf(end, contentStart) : -1;
    return text.slice(contentStart, endIndex === -1 ? undefined : endIndex).trim();
  },

  async submitService() {
    const error = this.validateForm();
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }

    this.setData({ submitting: true, submitButtonText: '保存中...' });
    try {
      await app.request({
        url: this.data.isEdit ? `/services/${this.data.id}` : '/services',
        method: this.data.isEdit ? 'PATCH' : 'POST',
        data: this.buildPayload(),
      });
      wx.showToast({ title: this.data.isEdit ? '已更新' : '已上架', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      wx.showToast({ title: err.error || '保存失败', icon: 'none' });
      this.setData({
        submitting: false,
        submitButtonText: this.data.isEdit ? '保存修改' : '上架服务',
      });
    }
  },
});
