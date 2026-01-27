import api from './api'

export const authService = {
  // 登录
  login: async (username, password) => {
    return api.post('/login', { username, password })
  },

  // 登出
  logout: async () => {
    return api.post('/logout')
  },

  // 获取当前用户信息
  getCurrentUser: async () => {
    return api.get('/current-user')
  },
}
