import axios from 'axios'

// API基础URL配置
// 如果设置了 VITE_API_BASE_URL 环境变量，使用该值
// 否则使用相对路径 /api（通过Vite代理）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

// 创建axios实例
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // 允许携带cookie
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    if (error.response) {
      const status = error.response.status
      const data = error.response.data || {}
      
      // 处理401未授权错误
      if (status === 401) {
        if (data?.session_expired) {
          // 会话失效，清除本地数据并跳转到登录页
          localStorage.clear()
          sessionStorage.clear()
          window.location.href = '/login'
        }
      }
      
      // 确保错误对象包含status信息，以便React Query识别429错误
      const errorObj = typeof data === 'object' && data !== null ? data : { error: data }
      errorObj.status = status
      errorObj.response = { status }
      
      return Promise.reject(errorObj)
    }
    return Promise.reject(error.message)
  }
)

export default api
