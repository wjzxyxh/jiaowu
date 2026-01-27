import api from './api'

export const courseManageService = {
  // 获取课程列表
  getCourses: async (params = {}) => {
    return api.get('/courses_manage', { params })
  },

  // 创建课程
  createCourse: async (data) => {
    return api.post('/courses_manage', data)
  },

  // 更新课程
  updateCourse: async (id, data) => {
    return api.put(`/courses_manage/${id}`, data)
  },

  // 删除课程
  deleteCourse: async (id) => {
    return api.delete(`/courses_manage/${id}`)
  },
}
