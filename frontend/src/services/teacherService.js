import api from './api'

export const teacherService = {
  // 获取教师列表
  getTeachers: async (params = {}) => {
    return api.get('/teachers', { params })
  },

  // 获取单个教师
  getTeacher: async (id) => {
    return api.get(`/teachers/${id}`)
  },

  // 创建教师
  createTeacher: async (data) => {
    return api.post('/teachers', data)
  },

  // 更新教师
  updateTeacher: async (id, data) => {
    return api.put(`/teachers/${id}`, data)
  },

  // 删除教师
  deleteTeacher: async (id) => {
    return api.delete(`/teachers/${id}`)
  },
}
