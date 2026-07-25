const API_BASE = 'https://api.linkerses.com/api';
// const API_BASE = 'http://localhost:3001/api';

App({
  globalData: {
    cid: null,
    nickname: null,
    token: null,
    agentData: null,
    apiBase: API_BASE,
    isNewUser: false,
  },

  loginPromise: null,

  onLaunch() {
    const token = wx.getStorageSync('token');
    const cid = wx.getStorageSync('cid');
    const nickname = wx.getStorageSync('nickname');

    if (token && cid) {
      this.globalData.token = token;
      this.globalData.cid = cid;
      this.globalData.nickname = nickname;
    }
  },

  async login(devMode = false, devCode = 'dev_mode') {
    if (!devMode && this.loginPromise) {
      return this.loginPromise;
    }

    const task = this.doLogin(devMode, devCode);
    if (!devMode) {
      this.loginPromise = task;
    }

    try {
      return await task;
    } finally {
      if (!devMode) {
        this.loginPromise = null;
      }
    }
  },

  async doLogin(devMode = false, devCode = 'dev_mode') {
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
        retryAuth: false,
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
      return { success: false, error: err.error || err.message || '登录异常' };
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

  request({ url, method = 'GET', data = {}, retryAuth = true }) {
    return new Promise((resolve, reject) => {
      const token = this.globalData.token || wx.getStorageSync('token');

      wx.request({
        url: this.globalData.apiBase + url,
        method,
        data,
        header: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
            return;
          }

          if (res.statusCode === 401 && retryAuth && url !== '/auth/wechat-login') {
            this.logout();
            this.login()
              .then((loginRes) => {
                if (!loginRes || !loginRes.success) {
                  reject(res.data || { error: '未登录' });
                  return null;
                }
                return this.request({ url, method, data, retryAuth: false });
              })
              .then((retryRes) => {
                if (retryRes) resolve(retryRes);
              })
              .catch(reject);
            return;
          }

          reject(res.data || { message: '请求失败' });
        },
        fail: reject,
      });
    });
  },
});
