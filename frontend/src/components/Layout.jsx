import React, { useState, useEffect } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Layout.css'

const Layout = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.user-menu') && !e.target.closest('.notification-btn')) {
        setShowUserMenu(false)
        setShowNotifications(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    if (window.confirm('确定要退出登录吗？')) {
      await logout()
      navigate('/login')
    }
  }

  const roleMap = {
    admin: '管理员',
    teacher: '教务',
    finance: '财务',
    readonly: '只读',
    user: '用户',
  }

  const displayName = user?.real_name || user?.username || '用户'

  // 判断是否在首页
  const isHomePage = location.pathname === '/'

  return (
    <div className="layout">
      <header className="layout-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1 }}>
          <h1 style={{ margin: 0 }}>教务管理系统</h1>
          {!isHomePage && (
            <Link
              to="/"
              className="back-home-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '20px',
                fontSize: '14px',
                fontWeight: '500',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                transition: 'all 0.3s',
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.2)'
              }}
            >
              <span>←</span>
              <span>返回首页</span>
            </Link>
          )}
        </div>
        <div className="header-actions">
          {/* 通知中心 */}
          <div className="notification-btn" onClick={() => setShowNotifications(!showNotifications)}>
            <span>🔔</span>
            {/* TODO: 显示未读数量 */}
          </div>

          {/* 用户菜单 */}
          <div className="user-menu">
            <div className="user-trigger" onClick={() => setShowUserMenu(!showUserMenu)}>
              <span>{displayName}</span>
              <span>▼</span>
            </div>
            {showUserMenu && (
              <div className="user-dropdown">
                <div className="user-info">
                  <div className="user-name">{displayName}</div>
                  <div className="user-role">{roleMap[user?.role] || '用户'}</div>
                </div>
                <div className="user-actions">
                  <button onClick={handleLogout}>退出登录</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
