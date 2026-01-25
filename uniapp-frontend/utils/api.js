/**
 * API请求封装
 * 统一处理请求、响应、错误处理
 */

// API基础地址 - 根据实际情况修改
const BASE_URL = 'http://localhost:80'  // 开发环境
// const BASE_URL = 'https://your-domain.com'  // 生产环境

/**
 * 请求拦截器
 */
const request = (options) => {
    return new Promise((resolve, reject) => {
        // 获取token
        const token = uni.getStorageSync('token')
        
        // 显示加载提示
        if (options.loading !== false) {
            uni.showLoading({
                title: options.loadingText || '加载中...',
                mask: true
            })
        }
        
        // 发起请求
        uni.request({
            url: BASE_URL + options.url,
            method: options.method || 'GET',
            data: options.data || {},
            header: {
                'Content-Type': options.contentType || 'application/json',
                'Authorization': token ? `Bearer ${token}` : '',
                ...options.header
            },
            success: (res) => {
                // 隐藏加载提示
                if (options.loading !== false) {
                    uni.hideLoading()
                }
                
                // 处理响应
                if (res.statusCode === 200) {
                    // 检查业务状态码
                    if (res.data.error) {
                        // 业务错误
                        if (res.statusCode === 401 || res.data.session_expired) {
                            // 会话过期，跳转登录
                            handleSessionExpired()
                            reject(new Error(res.data.error || '登录已过期'))
                        } else {
                            uni.showToast({
                                title: res.data.error || '请求失败',
                                icon: 'none'
                            })
                            reject(new Error(res.data.error))
                        }
                    } else {
                        resolve(res.data)
                    }
                } else if (res.statusCode === 401) {
                    // 未授权，跳转登录
                    handleSessionExpired()
                    reject(new Error('登录已过期'))
                } else {
                    uni.showToast({
                        title: `请求失败: ${res.statusCode}`,
                        icon: 'none'
                    })
                    reject(new Error(`HTTP错误: ${res.statusCode}`))
                }
            },
            fail: (err) => {
                // 隐藏加载提示
                if (options.loading !== false) {
                    uni.hideLoading()
                }
                
                console.error('请求失败:', err)
                uni.showToast({
                    title: '网络请求失败',
                    icon: 'none'
                })
                reject(err)
            }
        })
    })
}

/**
 * 处理会话过期
 */
const handleSessionExpired = () => {
    uni.showModal({
        title: '提示',
        content: '您的账号在其他地方登录，当前会话已失效。是否重新登录？',
        success: (res) => {
            if (res.confirm) {
                // 清除本地数据
                uni.removeStorageSync('token')
                uni.removeStorageSync('userInfo')
                // 跳转登录页
                uni.reLaunch({
                    url: '/pages/login/login'
                })
            }
        }
    })
}

/**
 * API方法封装
 */
const api = {
    // 认证相关
    login: (data) => request({
        url: '/api/login',
        method: 'POST',
        data,
        loadingText: '登录中...'
    }),
    
    logout: () => request({
        url: '/api/logout',
        method: 'POST'
    }),
    
    getCurrentUser: () => request({
        url: '/api/current-user',
        method: 'GET'
    }),
    
    // 学生管理
    getStudents: (params) => request({
        url: '/api/students',
        method: 'GET',
        data: params
    }),
    
    createStudent: (data) => request({
        url: '/api/students',
        method: 'POST',
        data
    }),
    
    updateStudent: (id, data) => request({
        url: `/api/students/${id}`,
        method: 'PUT',
        data
    }),
    
    deleteStudent: (id) => request({
        url: `/api/students/${id}`,
        method: 'DELETE'
    }),
    
    // 教师管理
    getTeachers: (params) => request({
        url: '/api/teachers',
        method: 'GET',
        data: params
    }),
    
    createTeacher: (data) => request({
        url: '/api/teachers',
        method: 'POST',
        data
    }),
    
    updateTeacher: (id, data) => request({
        url: `/api/teachers/${id}`,
        method: 'PUT',
        data
    }),
    
    deleteTeacher: (id) => request({
        url: `/api/teachers/${id}`,
        method: 'DELETE'
    }),
    
    // 课程管理
    getCourses: (params) => request({
        url: '/api/courses',
        method: 'GET',
        data: params
    }),
    
    createCourse: (data) => request({
        url: '/api/courses',
        method: 'POST',
        data
    }),
    
    updateCourse: (id, data) => request({
        url: `/api/courses/${id}`,
        method: 'PUT',
        data
    }),
    
    deleteCourse: (id) => request({
        url: `/api/courses/${id}`,
        method: 'DELETE'
    }),
    
    // 课程配置管理
    getCoursesManage: (params) => request({
        url: '/api/courses_manage',
        method: 'GET',
        data: params
    }),
    
    createCourseManage: (data) => request({
        url: '/api/courses_manage',
        method: 'POST',
        data
    }),
    
    updateCourseManage: (id, data) => request({
        url: `/api/courses_manage/${id}`,
        method: 'PUT',
        data
    }),
    
    deleteCourseManage: (id) => request({
        url: `/api/courses_manage/${id}`,
        method: 'DELETE'
    }),
    
    // 缴费管理
    getPayments: (params) => request({
        url: '/api/payments',
        method: 'GET',
        data: params
    }),
    
    createPayment: (data) => request({
        url: '/api/payments',
        method: 'POST',
        data
    }),
    
    deletePayment: (id) => request({
        url: `/api/payments/${id}`,
        method: 'DELETE'
    }),
    
    // 财务统计
    getFinance: (params) => request({
        url: '/api/finance',
        method: 'GET',
        data: params
    }),
    
    updateFinance: (data) => request({
        url: '/api/finance',
        method: 'PUT',
        data
    }),
    
    // 学生课时统计
    getStats: (params) => request({
        url: '/api/stats',
        method: 'GET',
        data: params
    }),
    
    // 教师课时统计
    getTeacherHours: (params) => request({
        url: '/api/teacher-hours',
        method: 'GET',
        data: params
    }),
    
    // 日历
    getCalendar: (params) => request({
        url: '/api/calendar',
        method: 'GET',
        data: params
    }),
    
    // 通知
    getNotifications: () => request({
        url: '/api/notifications',
        method: 'GET'
    }),
    
    getUnreadCount: () => request({
        url: '/api/notifications/unread-count',
        method: 'GET'
    }),
    
    markNotificationRead: (id) => request({
        url: `/api/notifications/${id}/read`,
        method: 'POST'
    }),
    
    markAllNotificationsRead: () => request({
        url: '/api/notifications/mark-all-read',
        method: 'POST'
    }),
    
    // 用户管理
    updateProfile: (data) => request({
        url: '/api/users/profile',
        method: 'PUT',
        data
    }),
    
    // 权限管理
    getPermissions: () => request({
        url: '/api/permissions/current-user',
        method: 'GET'
    }),
    
    // 其他管理（时段、教室等）
    getTimeSlots: () => request({
        url: '/api/time-slots',
        method: 'GET'
    }),
    
    getClassrooms: () => request({
        url: '/api/classrooms',
        method: 'GET'
    })
}

export default api
