import api from './api'

export const statsService = {
  // 获取课时统计
  getStats: async (params = {}) => {
    return api.get('/stats', { params })
  },

  // 导出课时统计Excel
  exportStats: (month, studentId) => {
    let url = `/api/export/stats?month=${month}`
    if (studentId) {
      url += `&student_id=${studentId}`
    }
    window.open(url, '_blank')
  },
}
