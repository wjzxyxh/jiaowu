import React from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { studentCoursesService } from '../services/studentCoursesService'
import './Layout.css'
import './CoursesLayout.css'

const CoursesLayout = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const isFetching = useIsFetching()
  const [showUserMenu, setShowUserMenu] = React.useState(false)
  const [showNotifications, setShowNotifications] = React.useState(false)
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  // 用于防抖的引用，防止快速连续的路由变化导致过于频繁的刷新
  const lastRefreshTime = React.useRef(0)
  const refreshTimeoutRef = React.useRef(null)

  // 点击外部关闭菜单
  React.useEffect(() => {
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

  // 检查是否从student-courses页面进入（通过URL参数或sessionStorage）
  const [fromStudentCourses, setFromStudentCourses] = React.useState(false)

  // 路由变化时自动刷新页面数据（每次进入都刷新）
  React.useEffect(() => {
    const currentPath = location.pathname
    const now = Date.now()

    // 定义需要自动刷新的主要页面查询键
    const refreshRoutes = {
      '/courses': ['courses'], // 排课管理页面
    }

    const queryKeys = refreshRoutes[currentPath]

    if (queryKeys) {
      // 防抖逻辑：确保两次刷新之间至少间隔500ms
      const timeSinceLastRefresh = now - lastRefreshTime.current
      const minRefreshInterval = 500 // 500ms最小刷新间隔

      // 清除之前的定时器
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }

      if (timeSinceLastRefresh >= minRefreshInterval) {
        // 足够的时间过去了，直接刷新
        console.log(`进入 ${currentPath}，自动刷新数据...`)
        lastRefreshTime.current = now
        setIsRefreshing(true)
        queryKeys.forEach(queryKey => {
          queryClient.invalidateQueries([queryKey])
        })
        // 短暂延迟后重置刷新状态
        setTimeout(() => setIsRefreshing(false), 1000)
        console.log(`已刷新查询: ${queryKeys.join(', ')}`)
      } else {
        // 时间不够，延迟到足够时间后再刷新
        const delay = minRefreshInterval - timeSinceLastRefresh
        console.log(`进入 ${currentPath}，${delay}ms后刷新数据（防抖）...`)

        refreshTimeoutRef.current = setTimeout(() => {
          lastRefreshTime.current = Date.now()
          setIsRefreshing(true)
          queryKeys.forEach(queryKey => {
            queryClient.invalidateQueries([queryKey])
          })
          // 短暂延迟后重置刷新状态
          setTimeout(() => setIsRefreshing(false), 1000)
          console.log(`已刷新查询: ${queryKeys.join(', ')}`)
        }, delay)
      }
    }

    // 清理函数：清除定时器
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [location.pathname, queryClient])

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hasStudentId = params.has('student_id')

    const fromStudentCoursesFlag = sessionStorage.getItem('fromStudentCourses')

    if (hasStudentId) {
      setFromStudentCourses(true)
      sessionStorage.setItem('fromStudentCourses', 'true')
    } else if (fromStudentCoursesFlag === 'true' && location.pathname === '/courses') {
      setFromStudentCourses(true)
    } else {
      if (location.pathname !== '/courses') {
        sessionStorage.removeItem('fromStudentCourses')
        setFromStudentCourses(false)
      } else {
        setFromStudentCourses(false)
      }
    }
  }, [location.pathname, location.search])

  return (
    <div className="courses-layout">
      {/* 全局加载指示器 - 调整位置以适应课程页面布局 */}
      {isFetching > 0 && (
        <div
          style={{
            position: 'fixed',
            top: '80px', // 与导航栏高度保持一致
            right: '20px',
            background: 'rgba(0, 123, 255, 0.9)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        >
          <style>
            {`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}
          </style>
          <div
            style={{
              width: '8px',
              height: '8px',
              border: '1px solid white',
              borderTop: '1px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}
          />
          加载中...
        </div>
      )}

      {/* 课程页面专用导航栏 */}
      <header className="layout-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1 }}>
          <h1 style={{ margin: 0 }}>教务管理系统</h1>
          {!isHomePage && (
            <Link
              to={fromStudentCourses && location.pathname === '/courses' ? '/student-courses' : '/'}
              className="back-home-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                background: 'rgba(255, 255, 255, 0.15)',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '25px',
                fontSize: '14px',
                fontWeight: '500',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                transition: 'all 0.3s',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                position: 'relative',
                zIndex: 1,
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.25)'
                e.target.style.transform = 'translateY(-1px)'
                e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.15)'
                e.target.style.transform = 'translateY(0)'
                e.target.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'
              }}
              onClick={async () => {
                if (fromStudentCourses && location.pathname === '/courses') {
                  const studentIdToMark = sessionStorage.getItem('studentIdToMark')
                  if (studentIdToMark) {
                    try {
                      await studentCoursesService.updateExcludeFromScheduling(
                        parseInt(studentIdToMark),
                        true
                      )
                      queryClient.invalidateQueries(['paid-courses-need-scheduling'])
                    } catch (error) {
                      console.error('自动标记学生失败:', error)
                    }
                    sessionStorage.removeItem('studentIdToMark')
                  }
                  sessionStorage.removeItem('fromStudentCourses')
                }
              }}
            >
              <span>←</span>
              <span>{fromStudentCourses && location.pathname === '/courses' ? '返回预排课' : '返回首页'}</span>
            </Link>
          )}
        </div>
        <div className="header-actions">
          {/* 刷新按钮 */}
          <button
            className="refresh-btn"
            disabled={isRefreshing}
            onClick={() => {
              // 获取当前页面的查询键
              const currentPath = location.pathname
              const refreshRoutes = {
                '/courses': ['courses'],
              }

              const queryKeys = refreshRoutes[currentPath]
              if (queryKeys && !isRefreshing) {
                // 手动刷新也更新最后刷新时间
                lastRefreshTime.current = Date.now()
                setIsRefreshing(true)
                console.log(`手动刷新 ${currentPath} 数据...`)
                queryKeys.forEach(queryKey => {
                  queryClient.invalidateQueries([queryKey])
                })
                // 短暂延迟后重置刷新状态
                setTimeout(() => setIsRefreshing(false), 1000)
                console.log(`已刷新查询: ${queryKeys.join(', ')}`)
              }
            }}
            style={{
              background: isRefreshing ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              marginRight: '12px',
              transition: 'all 0.3s',
              opacity: isRefreshing ? 0.6 : 1,
              backdropFilter: 'blur(10px)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              fontWeight: '500',
            }}
            onMouseEnter={(e) => {
              if (!isRefreshing) {
                e.target.style.background = 'rgba(255, 255, 255, 0.25)';
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isRefreshing) {
                e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
              }
            }}
            title={isRefreshing ? "刷新中..." : "刷新页面数据"}
          >
            {isRefreshing ? '⏳' : '🔄'} {isRefreshing ? '刷新中' : '刷新'}
          </button>

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

      {/* 课程页面专用内容区域 */}
      <main className="courses-layout-main">
        <Outlet />
      </main>
    </div>
  )
}

export default CoursesLayout