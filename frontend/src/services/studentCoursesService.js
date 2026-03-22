import api from './api'

export const studentCoursesService = {
  // 获取已缴费需要排课的学生课程列表
  // throughMonth/throughWeek：与排课页「月+周」一致时，累计与剩余课时均按截至该周日的已确认消耗计算
  getPaidCoursesNeedScheduling: async (opts = {}) => {
    const params = {}
    if (opts.throughMonth && opts.throughWeek != null && opts.throughWeek !== '') {
      params.through_month = opts.throughMonth
      params.through_week = String(opts.throughWeek)
    }
    const response = await api.get('/students/paid-courses-need-scheduling', { params })
    return response.courses || []
  },

  // 获取学生-课程的默认排课设置
  getDefaultSchedule: async (studentId, courseId) => {
    return api.get(`/students/${studentId}/courses/${courseId}/default-schedule`)
  },

  // 更新学生-课程的默认排课设置
  updateDefaultSchedule: async (studentId, courseId, data) => {
    return api.put(`/students/${studentId}/courses/${courseId}/default-schedule`, data)
  },

  // 更新学生是否排除在排课下拉列表中的标记
  updateExcludeFromScheduling: async (studentId, excluded) => {
    return api.put(`/students/${studentId}/exclude-from-scheduling`, {
      excluded_from_scheduling: excluded
    })
  },

  // 更新学生-课程是否暂停排课（进行中时可切换，暂停后不再参与排课）
  updateSchedulingPaused: async (studentId, courseId, paused) => {
    return api.put(`/students/${studentId}/courses/${courseId}/scheduling-paused`, {
      paused
    })
  },

  // 获取所有学生的默认课程映射（{student_id: course_id}）
  getDefaultCourseMap: async () => {
    return api.get('/students/default-course-map')
  },
}
