import api from './api'

export const calendarService = {
  // 获取日历课程数据
  getCalendarCourses: async (params = {}) => {
    return api.get('/calendar/courses', { params })
  },
}
