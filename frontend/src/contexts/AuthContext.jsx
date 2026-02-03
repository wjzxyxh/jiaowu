import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { authService } from '../services/authService'
import { useActivityTracker } from '../hooks/useActivityTracker'

// Create context with a default value to prevent hydration issues
const AuthContext = createContext({
  user: null,
  loading: true,
  login: async () => ({ success: false, error: '认证服务未初始化' }),
  logout: async () => {},
  checkAuth: async () => {},
})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const checkAuthRef = useRef(false) // 防止重复调用
  const retryTimeoutRef = useRef(null) // 保存重试定时器引用
  const retryCountRef = useRef(0) // 记录重试次数

  const checkAuth = useCallback(async () => {
    try {
      const response = await authService.getCurrentUser()
      // 成功获取用户信息，重置重试计数器
      retryCountRef.current = 0
      if (response.user) {
        setUser(response.user)
      } else {
        setUser(null)
      }
    } catch (error) {
      // 处理不同类型的错误：可能是对象、字符串或Error实例
      let status = null
      let errorMessage = ''

      if (typeof error === 'string') {
        errorMessage = error
      } else if (typeof error === 'object' && error !== null) {
        status = error.status || error?.response?.status
        errorMessage = error.error || error.message || '未知错误'
      } else {
        errorMessage = String(error)
      }

      // 429 请求过于频繁：不视为认证失败，保持当前用户状态，稍后重试
      if (status === 429) {
        console.warn('检查登录状态时请求过于频繁，稍后重试:', errorMessage)
        // 不设置 user 为 null，保持当前状态
        // 清除之前的重试定时器
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current)
        }
        // 延迟后重试
        retryTimeoutRef.current = setTimeout(() => {
          retryCountRef.current = 0 // 重置计数器
          checkAuth()
        }, 2000) // 2秒后重试
        setLoading(false)
        return
      }

      // 401未登录是正常情况，不需要记录错误
      if (status !== 401) {
        // 检查是否是网络错误（可能是临时的，比如页面刚加载时）
        const isNetworkError = !status && (error.isNetworkError || errorMessage.includes('网络') || errorMessage.includes('Network') || errorMessage.includes('Failed to fetch'))

        if (isNetworkError) {
          // 网络错误可能是临时的，使用 warn 而不是 error，避免在控制台显示过多错误
          console.warn('检查登录状态时出现网络问题（可能是临时性的）:', errorMessage)
        } else if (status === 500) {
          // 服务器内部错误，可能需要重试
          console.warn(`服务器内部错误 [HTTP ${status}]，可能需要刷新页面:`, errorMessage)
          // 对于500错误，限制重试次数，避免无限重试
          if (retryCountRef.current < 2) {
            retryCountRef.current += 1
            console.log(`尝试重新检查登录状态... (第 ${retryCountRef.current} 次)`)
            // 清除之前的重试定时器
            if (retryTimeoutRef.current) {
              clearTimeout(retryTimeoutRef.current)
            }
            retryTimeoutRef.current = setTimeout(() => {
              checkAuth()
            }, 2000) // 增加到2秒，避免频繁请求
            setLoading(false)
            return
          } else {
            console.error('服务器错误重试次数已达上限，停止重试')
            retryCountRef.current = 0 // 重置计数器
          }
        } else if (status) {
          // 其他状态码的错误
          console.error(`检查登录状态失败 [HTTP ${status}]:`, errorMessage)
        } else {
          // 其他错误，使用 warn 避免误报
          console.warn('检查登录状态时出现问题:', errorMessage)
        }
      }
      // 只有非429错误才清除用户状态
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 防止在 React.StrictMode 下重复调用
    if (!checkAuthRef.current) {
      checkAuthRef.current = true
      checkAuth()
    }

    // 清理函数：组件卸载时清除重试定时器
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
    }
  }, [checkAuth])

  const login = async (username, password) => {
    try {
      const response = await authService.login(username, password)
      if (response.success && response.user) {
        setUser(response.user)
        return { success: true }
      }
      return { success: false, error: response.error || '登录失败' }
    } catch (error) {
      console.error('登录错误详情:', error)
      console.error('错误类型:', typeof error)
      
      // 安全地序列化错误对象，避免循环引用
      try {
        const errorInfo = {
          error: error?.error,
          message: error?.message,
          status: error?.status,
          responseStatus: error?.response?.status,
          responseData: error?.response?.data
        }
        console.error('错误信息:', errorInfo)
      } catch (e) {
        console.error('无法序列化错误对象:', e)
      }
      
      // 尝试从错误对象中提取错误信息（支持多种错误格式）
      let errorMessage = '登录失败'
      
      if (typeof error === 'string') {
        errorMessage = error
      } else if (error && typeof error === 'object') {
        // 检查各种可能的错误信息字段
        errorMessage = error.error || 
                      error.message || 
                      error.response?.data?.error || 
                      error.response?.data?.message ||
                      error.details ||
                      (error.status === 500 ? '服务器内部错误，请稍后重试' : '登录失败')
      }
      
      console.error('提取的错误信息:', errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } catch (error) {
      console.error('登出失败:', error)
    } finally {
      setUser(null)
      // 清除所有本地缓存
      localStorage.clear()
      sessionStorage.clear()
      // 使用window.location重定向到登录页（确保清除所有状态）
      window.location.href = '/login'
    }
  }, [])

  // 处理无活动超时（24小时无操作）
  const handleInactive = useCallback(async () => {
    console.log('检测到24小时无操作，自动退出登录')
    // 显示提示信息
    alert('由于24小时未操作，您的账户已自动退出，请重新登录')
    await logout()
  }, [logout])

  // 集成活动检测：仅在用户已登录时启用
  useActivityTracker(user ? handleInactive : null, 86400000) // 24小时 = 86400000毫秒

  // 关闭浏览器/标签页：自动登出并清缓存。地址栏回车刷新：不登出，仅清本地缓存（刷新后仍保持登录）。
  // 实现：beforeunload 只清 localStorage/sessionStorage，不调用 /api/logout（否则刷新也会登出）；
  // 关闭浏览器后的“自动登出”由服务端使用 session cookie（浏览器关闭后 cookie 失效）实现。
  const UNLOAD_COOKIE = '_ul'
  const UNLOAD_COOKIE_MAX_AGE = 3
  const REFRESH_THRESHOLD_MS = 1500

  useEffect(() => {
    if (!user) return

    const setUnloadCookie = () => {
      try {
        document.cookie = `${UNLOAD_COOKIE}=${Date.now()}; path=/; max-age=${UNLOAD_COOKIE_MAX_AGE}; SameSite=Lax`
      } catch (e) {}
    }

    const handleBeforeUnload = () => {
      setUnloadCookie()
      localStorage.clear()
      sessionStorage.clear()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [user])

  // 页面加载时清除“即将卸载”的 cookie 标记（用于区分刷新场景，仅做清理）
  useEffect(() => {
    const match = document.cookie.match(/(?:^| )_ul=(\d+)(?:;|$)/)
    const ts = match ? match[1] : null
    if (!ts) return
    const t = parseInt(ts, 10)
    if (Number.isNaN(t)) return
    if (Date.now() - t < REFRESH_THRESHOLD_MS) {
      document.cookie = '_ul=; path=/; max-age=0'
    }
  }, [])

  const value = {
    user,
    loading,
    login: login || (async () => ({ success: false, error: '认证服务未就绪' })),
    logout: logout || (async () => {
      setUser(null)
      localStorage.clear()
      sessionStorage.clear()
    }),
    checkAuth: checkAuth || (async () => {}),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
