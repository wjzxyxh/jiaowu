import api from './api'

export const teacherHoursService = {
  // 获取教师课时
  getTeacherHours: async (params = {}) => {
    // 后端API路径是 /api/teacher-hours
    return api.get('/teacher-hours', { params })
  },

  // 更新教师课时记录（激励和备注）
  updateTeacherHours: async (hoursId, data) => {
    return api.put(`/teacher-hours/${hoursId}`, data)
  },

  // 结算教师课时（批量）
  settleTeacherHours: async (hoursIds, isSettled) => {
    return api.post('/teacher-hours/settle', {
      hours_ids: hoursIds,
      is_settled: isSettled,
    })
  },

  // 导出教师课时Excel
  exportTeacherHours: (month, teacherId) => {
    let url = `/api/export/teacher-hours?month=${month}`
    if (teacherId) {
      url += `&teacher_id=${teacherId}`
    }
    window.open(url, '_blank')
  },
}
