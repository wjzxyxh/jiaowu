import api from './api'

export const financeService = {
  // 获取财务记录
  getFinance: async (params = {}) => {
    return api.get('/finance', { params })
  },

  // 更新财务记录
  updateFinance: async (data) => {
    return api.put('/finance', data)
  },
}
