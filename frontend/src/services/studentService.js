import api from './api'

export const studentService = {
  // 获取学生列表
  getStudents: async (params = {}) => {
    try {
      const response = await api.get('/students', { params })
      // 后端返回格式: { students: [...], pagination: {...} }
      // 返回完整响应对象，包含students和pagination
      if (response.students && response.pagination) {
        return response
      }
      // 兼容旧格式：如果只有students数组，包装成标准格式
      if (Array.isArray(response)) {
        return {
          students: response,
          pagination: {
            page: 1,
            total_pages: 1,
            total: response.length,
            has_prev: false,
            has_next: false,
          },
        }
      }
      // 如果格式不对，返回空数据
      return {
        students: [],
        pagination: {
          page: 1,
          total_pages: 1,
          total: 0,
          has_prev: false,
          has_next: false,
        },
      }
    } catch (error) {
      // 如果是429错误（请求过于频繁），抛出错误让React Query处理
      if (error?.response?.status === 429 || error?.status === 429) {
        console.warn('getStudents: 请求过于频繁，请稍后再试。')
        throw error
      }
      console.error('getStudents 错误:', error)
      // 其他错误返回空数据
      return {
        students: [],
        pagination: {
          page: 1,
          total_pages: 1,
          total: 0,
          has_prev: false,
          has_next: false,
        },
      }
    }
  },

  // 获取单个学生
  getStudent: async (id) => {
    return api.get(`/students/${id}`)
  },

  // 创建学生
  createStudent: async (data) => {
    return api.post('/students', data)
  },

  // 更新学生
  updateStudent: async (id, data) => {
    return api.put(`/students/${id}`, data)
  },

  // 删除学生（彻底删除，仅学生名单页使用）
  deleteStudent: async (id) => {
    return api.delete(`/students/${id}`)
  },

  // 仅从学生管理页移除（不删库），学生仍保留在学生名单页
  removeFromManagement: async (id) => {
    return api.post(`/students/${id}/remove-from-management`)
  },

  // 设置学生试课状态（有排课则更新排课；无排课时写入线索的 trial_status）
  setTrialStatus: async (id, trialStatus) => {
    return api.post(`/students/${id}/set-trial-status`, {
      trial_status: trialStatus === '未选择' || trialStatus == null ? null : trialStatus,
    })
  },

  // 上传学生照片
  uploadPhoto: async (id, file) => {
    const formData = new FormData()
    formData.append('photo', file)
    return api.post(`/students/${id}/photo`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  // 获取指定学生+课程的剩余课时（与缴费页一致：总缴费－已确认消耗）
  getRemainingHours: async (studentId, courseId) => {
    const response = await api.get(`/students/${studentId}/remaining-hours`, {
      params: { course_id: courseId },
    })
    return response.remaining_hours ?? 0
  },

  // 获取试课状态映射（无排课时也设置了试课状态的线索）
  getTrialStatusMap: async () => {
    try {
      const res = await api.get('/marketing/leads/trial-status-map')
      return res?.items ?? []
    } catch (error) {
      console.error('getTrialStatusMap 错误:', error)
      return []
    }
  },
}
