import api from './api'

export const courseService = {
  // 获取排课列表
  getCourses: async (params = {}) => {
    return api.get('/courses', { params })
  },

  // 创建排课
  createCourse: async (data) => {
    return api.post('/courses', data)
  },

  // 更新排课
  updateCourse: async (id, data) => {
    return api.put(`/courses/${id}`, data)
  },

  // 删除排课
  deleteCourse: async (id) => {
    return api.delete(`/courses/${id}`)
  },

  // 确认上课
  confirmCourse: async (id) => {
    return api.post(`/courses/${id}/confirm`)
  },

  // 批量确认
  batchConfirm: async (ids) => {
    return api.post('/courses/batch-confirm', { course_ids: ids })
  },

  // 批量取消确认
  batchCancelConfirm: async (ids) => {
    return api.post('/courses/batch-cancel-confirm', { course_ids: ids })
  },

  // 检查课程冲突
  checkConflicts: async (data) => {
    return api.post('/courses/check-conflicts', data)
  },
}
