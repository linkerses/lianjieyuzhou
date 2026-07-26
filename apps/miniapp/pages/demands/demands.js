const app = getApp();

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'health', label: '健康' },
  { key: 'living', label: '生活' },
  { key: 'connection', label: '连接' },
  { key: 'growth', label: '成长' },
  { key: 'wealth', label: '财富' },
  { key: 'create', label: '创造' },
  { key: 'explore', label: '探索' },
  { key: 'spirit', label: '精神' },
  { key: 'future', label: '未来' },
];

const TAG_LABELS = FILTERS.reduce((acc, item) => {
  if (item.key !== 'all') acc[item.key] = item.label;
  return acc;
}, {});

Page({
  data: {
    demands: [],
    filters: FILTERS,
    activeFilter: 'all',
    loading: true,
  },

  onLoad() {
    this.loadDemands();
  },

  onShow() {
    if (!this.data.loading) {
      this.loadDemands();
    }
  },

  async loadDemands() {
    this.setData({ loading: true });
    try {
      const params = { limit: 50, sort: 'latest' };
      if (this.data.activeFilter !== 'all') {
        params.tag = this.data.activeFilter;
      }
      const res = await app.request({ url: '/agents/public', data: params });
      this.setData({
        demands: this.flattenDemands(res.data || []),
        loading: false,
      });
    } catch (err) {
      console.error('[loadDemands error]', err);
      wx.showToast({ title: err.error || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  switchFilter(e) {
    const key = e.currentTarget.dataset.key;
    if (key !== this.data.activeFilter) {
      this.setData({ activeFilter: key }, () => this.loadDemands());
    }
  },

  viewAgent(e) {
    wx.navigateTo({ url: `/pages/agents/public?cid=${e.currentTarget.dataset.cid}` });
  },

  respondDemand(e) {
    const dataset = e.currentTarget.dataset || {};
    const targetCid = dataset.cid;
    const sourceId = dataset.sourceId;
    const title = dataset.title || '这个需求';
    if (!targetCid) return;

    wx.showModal({
      title: '回应需求',
      editable: true,
      placeholderText: '写一句你能提供的帮助、资源或下一步建议',
      content: `给「${title}」留言`,
      confirmText: '发送',
      success: async (res) => {
        if (!res.confirm) return;
        const message = (res.content || '').trim();
        if (message.length < 2) {
          wx.showToast({ title: '请写一句回应内容', icon: 'none' });
          return;
        }
        try {
          const result = await app.request({
            url: '/trust/connect',
            method: 'POST',
            data: {
              target_cid: targetCid,
              message,
              source_type: 'demand',
              source_id: sourceId,
            },
          });
          wx.showToast({
            title: result.data && result.data.already_connected ? '已连接过' : result.data && result.data.already_requested ? '已回应过' : '已发送给对方',
            icon: 'success',
          });
        } catch (err) {
          wx.showToast({ title: err.error || '发送失败', icon: 'none' });
        }
      },
    });
  },

  applyMatch(e) {
    wx.navigateTo({ url: `/pages/match/report?target_cid=${e.currentTarget.dataset.cid}` });
  },

  goPublishDemand() {
    wx.setStorageSync('agent_default_tab', 'demands');
    wx.navigateTo({ url: '/pages/agent/agent' });
  },

  flattenDemands(agents) {
    const demands = [];
    (agents || []).forEach(agent => {
      const posts = (agent.demand_posts || []).filter(item => item && item.status === 'open' && item.title);
      posts.forEach(post => {
        demands.push({
          id: `${agent.cid}_${post.id || post.title}`,
          source_id: post.id || post.title,
          title: post.title || '',
          description: post.description || '',
          created_at: post.created_at || agent.updated_at || '',
          agent_cid: agent.cid,
          nickname: agent.nickname || '联结者',
          initial: agent.nickname ? agent.nickname.slice(0, 1) : '?',
          trust_score: agent.trust_score || 0,
          life_stage_tag_labels: this.formatTags(agent.life_stage_tags || []),
          time_label: this.formatTimeLabel(post.created_at || agent.updated_at),
          action_hint: this.buildActionHint(post, agent),
        });
      });
    });
    return demands.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  },

  buildActionHint(post, agent) {
    const text = `${post.title || ''} ${post.description || ''}`;
    if (/客户|用户|种子|体验|试用|流量|推广/.test(text)) {
      return '适合能提供用户、渠道、试用反馈的人回应。';
    }
    if (/合作|共创|伙伴|合伙|项目/.test(text)) {
      return '适合先发起匹配，看双方是否有共创空间。';
    }
    if (/服务|供应商|设计|开发|运营|拍摄|咨询|交付/.test(text)) {
      return '适合有明确交付能力的人提供服务方案。';
    }
    if (/资源|场地|资金|投资|渠道|商会|政府/.test(text)) {
      return '适合有资源或能做介绍的人建立连接。';
    }
    const tags = agent && agent.life_stage_tags ? agent.life_stage_tags : [];
    if (tags.includes('connection')) {
      return '适合先看发布者档案，再判断能否介绍合适的人。';
    }
    return '如果你能提供经验、资源或服务，可以直接回应需求。';
  },

  formatTimeLabel(value) {
    if (!value) return '刚刚';
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return '刚刚';
    const diff = Date.now() - time;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}分钟前`;
    if (diff < day) return `${Math.floor(diff / hour)}小时前`;
    if (diff < 7 * day) return `${Math.floor(diff / day)}天前`;
    const date = new Date(time);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  formatTags(tags) {
    return (tags || []).map(tag => TAG_LABELS[tag] || tag);
  },
});
