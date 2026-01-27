import React, { createContext, useContext, useState, useEffect } from 'react'
import { authService } from '../services/authService'

const AuthContext = createContext(null)

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

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await authService.getCurrentUser()
      if (response.user) {
        setUser(response.user)
      }
    } catch (error) {
      console.error('检查登录状态失败:', error)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

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
    login,
    logout,
    checkAuth,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
