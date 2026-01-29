import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { authService } from '../services/authService'

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

  const checkAuth = useCallback(async () => {
    try {
      const response = await authService.getCurrentUser()
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
          // 对于500错误，尝试重试一次
          if (!error._retryAttempted) {
            error._retryAttempted = true
            console.log('尝试重新检查登录状态...')
            setTimeout(() => {
              checkAuth()
            }, 1000)
            setLoading(false)
            return
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
      return { success: false, error: '登录失败' }
    } catch (error) {
      return { success: false, error: error.error || '登录失败' }
    }
  }

  const logout = async () => {
    try {
      await authService.logout()
    } catch (error) {
      console.error('登出失败:', error)
    } finally {
      setUser(null)
      localStorage.clear()
      sessionStorage.clear()
    }
  }

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
