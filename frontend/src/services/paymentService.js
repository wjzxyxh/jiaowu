import api from './api'

export const paymentService = {
  // 获取缴费列表
  getPayments: async (params = {}) => {
    return api.get('/payments', { params })
  },

  // 创建缴费记录
  createPayment: async (data) => {
    return api.post('/payments', data)
  },

  // 删除缴费记录
  deletePayment: async (id) => {
    return api.delete(`/payments/${id}`)
  },
}
