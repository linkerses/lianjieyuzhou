// 联结宇宙 · 微信小程序
// AI基建平台 + C端服务端口

const API_BASE = 'https://api.linkerses.com/api';
// 开发模式：使用本地服务
// const API_BASE = 'http://localhost:3001/api';

App({
  globalData: {
    cid: null,           // 当前登录联结者CID
    nickname: null,       // 昵称
    token: null,          // 认证Token
    agentData: null,      // Agent完整数据
    apiBase: API_BASE,
    isNewUser: false,     // 是否新注册用户
  },

  onLaunch() {
    // 检查是否已登录
    const token = wx.getStorageSync('token');
    const cid = wx.getStorageSync('cid');
    const nickname = wx.getStorageSync('nickname');

    if (token && cid) {
      this.globalData.token = token;
      this.globalData.cid = cid;
      this.globalData.nickname = nickname;
    }
  },

  // 登录（微信登录或开发模式）
  async login(devMode = false, devCode = 'dev_mode') {
    try {
      let code = '';

      if (devMode) {
        code = devCode;
      } else {
        const loginRes = await wx.login();
        code = loginRes.code;
      }

      const res = await this.request({
        url: '/auth/wechat-login',
        method: 'POST',
        data: { code },
      });

      if (res.data) {
        const { cid, nickname, token, is_new } = res.data;
        this.globalData.cid = cid;
        this.globalData.nickname = nickname;
        this.globalData.token = token;
        this.globalData.isNewUser = is_new;

        wx.setStorageSync('token', token);
        wx.setStorageSync('cid', cid);
        wx.setStorageSync('nickname', nickname);

        return { success: true, isNew: is_new };
      }
      return { success: false, error: '登录失败' };
    } catch (err) {
      console.error('[login error]', err);
      return { success: false, error: err.message || '登录异常' };
    }
  },

  logout() {
    this.globalData.cid = null;
    this.globalData.nickname = null;
    this.globalData.token = null;
    this.globalData.agentData = null;
    this.globalData.isNewUser = false;
    wx.removeStorageSync('token');
    wx.removeStorageSync('cid');
    wx.removeStorageSync('nickname');
  },

  // 统一请求封装
  request({ url, method = 'GET', data = {} }) {
    return new Promise((resolve, reject) => {
      const token = this.globalData.token || wx.getStorageSync('token');

      wx.request({
        url: this.globalData.apiBase + url,
        method,
        data,
        header: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else {
            reject(res.data || { message: '请求失败' });
          }
        },
        fail: (err) => {
          reject(err);
        },
      });
    });
  },
});
