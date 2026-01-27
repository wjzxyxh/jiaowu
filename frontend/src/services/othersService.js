import api from './api'

export const othersService = {
  // 获取时段列表
  getTimeSlots: async (params = {}) => {
    return api.get('/time-slots', { params })
  },

  // 创建时段
  createTimeSlot: async (data) => {
    return api.post('/time-slots', data)
  },

  // 更新时段
  updateTimeSlot: async (id, data) => {
    return api.put(`/time-slots/${id}`, data)
  },

  // 删除时段
  deleteTimeSlot: async (id) => {
    return api.delete(`/time-slots/${id}`)
  },

  // 获取教室列表
  getClassrooms: async (params = {}) => {
    return api.get('/classrooms', { params })
  },

  // 创建教室
  createClassroom: async (data) => {
    return api.post('/classrooms', data)
  },

  // 更新教室
  updateClassroom: async (id, data) => {
    return api.put(`/classrooms/${id}`, data)
  },

  // 删除教室
  deleteClassroom: async (id) => {
    return api.delete(`/classrooms/${id}`)
  },

  // 获取财务配置
  getFinanceConfig: async () => {
    return api.get('/finance-config')
  },

  // 更新财务配置
  updateFinanceConfig: async (data) => {
    if (data.id === 0) {
      // 创建新配置
      return api.post('/finance-config', { key: data.key, value: data.value, description: data.description })
    } else {
      // 更新现有配置
      return api.put(`/finance-config/${data.id}`, { value: data.value, description: data.description })
    }
  },

  // 创建财务配置
  createFinanceConfig: async (data) => {
    return api.post('/finance-config', data)
  },
}
