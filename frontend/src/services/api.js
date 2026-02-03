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

      // 处理429请求过于频繁错误
      if (status === 429) {
        const errorObj = {
          error: '请求过于频繁，请稍后再试',
          message: '为了保护服务器性能，您的请求频率过高，请等待片刻后重试',
          status: 429,
          isRateLimitError: true,
          retryAfter: data.retry_after || 60 // 默认60秒后重试
        }
        return Promise.reject(errorObj)
      }

      // 确保错误对象包含status信息和错误消息
      const errorObj = typeof data === 'object' && data !== null ? data : { error: data || '请求失败' }
      errorObj.status = status
      errorObj.response = { 
        status,
        data: data || {}
      }
      
      // 如果没有error字段，尝试从data中提取
      if (!errorObj.error && data) {
        if (typeof data === 'string') {
          errorObj.error = data
        } else if (data.error) {
          errorObj.error = data.error
        } else if (data.message) {
          errorObj.error = data.message
        } else {
          errorObj.error = `服务器错误 [HTTP ${status}]`
        }
      } else if (!errorObj.error) {
        errorObj.error = `服务器错误 [HTTP ${status}]`
      }

      return Promise.reject(errorObj)
    }
    // 网络错误或其他错误，返回一致的对象结构
    const errorMessage = error.message || error.toString() || '网络请求失败'
    return Promise.reject({
      error: errorMessage,
      message: errorMessage,
      isNetworkError: true,
    })
  }
)

export default api
