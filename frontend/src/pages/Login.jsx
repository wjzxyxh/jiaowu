import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Login.css'

const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await login(username, password)
      if (result.success) {
        navigate('/')
      } else {
        setError(result.error || '登录失败')
      }
    } catch (err) {
      console.error('登录错误详情:', err)
      console.error('错误类型:', typeof err)
      
      // 安全地获取错误对象信息，避免循环引用
      try {
        if (err && typeof err === 'object') {
          const errorInfo = {
            error: err.error,
            message: err.message,
            status: err.status,
            responseStatus: err.response?.status,
            responseData: err.response?.data
          }
          console.error('错误信息:', errorInfo)
          console.error('错误对象键:', Object.keys(err))
        }
      } catch (e) {
        console.error('无法解析错误对象:', e)
      }
      
      // 尝试从错误对象中提取错误信息（支持多种错误格式）
      let errorMessage = '登录失败，请稍后重试'
      
      if (typeof err === 'string') {
        errorMessage = err
      } else if (err && typeof err === 'object') {
        // 检查各种可能的错误信息字段
        errorMessage = err.error || 
                      err.message || 
                      err.response?.data?.error || 
                      err.response?.data?.message ||
                      err.details ||
                      (err.status === 500 ? '服务器内部错误，请稍后重试' : '登录失败，请稍后重试')
      }
      
      console.error('提取的错误信息:', errorMessage)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>教务管理系统</h1>
        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}
          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
