import api from './api'

export const allCoursesService = {
  // 获取全部排课（支持分页和筛选）
  getAllCourses: async (params = {}) => {
    const response = await api.get('/all_courses', { params })
    return {
      courses: response.courses || [],
      total: response.total || 0,
      page: response.page || 1,
      per_page: response.per_page || 20,
      pages: response.pages || 1,
    }
  },
}
