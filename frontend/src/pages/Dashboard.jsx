import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { permissionService } from '../services/permissionService'
import './Dashboard.css'

const MODULE_CONFIG = [
  { code: 'students', name: '学生管理', icon: '👥', path: '/students', desc: '管理学生信息，包括姓名、年级、联系方式等' },
  { code: 'teachers', name: '教师管理', icon: '👨‍🏫', path: '/teachers', desc: '管理教师信息，设置底薪和课时成本' },
  { code: 'courses_manage', name: '课程管理', icon: '📚', path: '/courses-manage', desc: '管理课程信息，设置课程单价' },
  { code: 'courses', name: '排课管理', icon: '📅', path: '/courses', desc: '为学生排课，管理课程安排' },
  { code: 'all_courses', name: '全部排课', icon: '📋', path: '/all-courses', desc: '查看所有排课记录，支持筛选、删除、新增等操作' },
  { code: 'student_courses', name: '学生课程', icon: '📚', path: '/student-courses', desc: '查看已缴费需要排课的学生课程列表' },
  { code: 'payments', name: '缴费管理', icon: '💰', path: '/payments', desc: '记录学生缴费信息，管理剩余课时' },
  { code: 'stats', name: '学生课时', icon: '📊', path: '/stats', desc: '查看学生课时统计和剩余课时' },
  { code: 'teacher_hours', name: '老师课时', icon: '👨‍🏫', path: '/teacher-hours', desc: '查看老师课时统计' },
  { code: 'finance', name: '财务统计', icon: '💵', path: '/finance', desc: '查看收支情况和利润统计' },
  { code: 'others_manage', name: '其它管理', icon: '⚙️', path: '/others-manage', desc: '管理时段和教室设置' },
  { code: 'calendar', name: '课程表日历', icon: '📆', path: '/calendar', desc: '日历视图查看课程安排，支持筛选和查看详情' },
]

const Dashboard = () => {
  const { user } = useAuth()
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/dashboard/stats'),
  })

  const { data: permissions, isLoading: permsLoading } = useQuery({
    queryKey: ['permissions-current-user'],
    queryFn: () => permissionService.getCurrentUserPermissions(),
    enabled: !!user,
  })

  const grantedModules = permissions?.modules || []
  const isAdmin = user?.role === 'admin'

  // 根据权限过滤模块
  const modulesToShow = isAdmin
    ? MODULE_CONFIG
    : MODULE_CONFIG.filter((m) => grantedModules.includes(m.code))

  if (statsLoading || permsLoading) return <div className="loading">加载中...</div>
  if (statsError) return <div className="error">加载失败: {statsError.error || statsError.message}</div>

  return (
    <div className="dashboard" style={{ width: '100%' }}>
      <div className="modules-section">
        <div className="function-grid">
          {modulesToShow.map((module) => (
            <Link key={module.code} to={module.path} className="function-card-link">
              <div className="function-card">
                <div className="function-icon">{module.icon}</div>
                <h3>{module.name}</h3>
                <p>{module.desc}</p>
              </div>
            </Link>
          ))}
          {isAdmin && (
            <Link to="/permissions" className="function-card-link">
              <div className="function-card" style={{ border: '2px solid #667eea' }}>
                <div className="function-icon">🔐</div>
                <h3>系统管理员</h3>
                <p>管理用户权限，授权用户访问指定功能模块</p>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
