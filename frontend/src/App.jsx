import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { usePermissions } from './hooks/usePermissions'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Students from './pages/Students'
import Teachers from './pages/Teachers'
import Courses from './pages/Courses'
import Payments from './pages/Payments'
import Stats from './pages/Stats'
import Finance from './pages/Finance'
import TeacherHours from './pages/TeacherHours'
import Calendar from './pages/Calendar'
import AllCourses from './pages/AllCourses'
import StudentCourses from './pages/StudentCourses'
import CoursesManage from './pages/CoursesManage'
import OthersManage from './pages/OthersManage'
import Permissions from './pages/Permissions'
import StudentList from './pages/StudentList'
import Layout from './components/Layout'
import CoursesLayout from './components/CoursesLayout'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="loading">加载中...</div>
  }

  return user ? children : <Navigate to="/login" replace />
}

function ProtectedRoute({ children, moduleCode, requireAdmin = false }) {
  const { user, loading } = useAuth()
  const { hasModulePermission, isAdmin, isLoading } = usePermissions()

  if (loading || isLoading) {
    return <div className="loading">加载中...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // 如果要求管理员权限
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />
  }

  // 如果需要模块权限检查
  if (moduleCode && !hasModulePermission(moduleCode)) {
    return <Navigate to="/" replace />
  }

  return children
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route 
          path="students" 
          element={
            <ProtectedRoute moduleCode="students">
              <Students />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="teachers" 
          element={
            <ProtectedRoute moduleCode="teachers">
              <Teachers />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="payments" 
          element={
            <ProtectedRoute moduleCode="payments">
              <Payments />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="stats" 
          element={
            <ProtectedRoute moduleCode="stats">
              <Stats />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="finance" 
          element={
            <ProtectedRoute moduleCode="finance">
              <Finance />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="teacher-hours" 
          element={
            <ProtectedRoute moduleCode="teacher_hours">
              <TeacherHours />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="calendar" 
          element={
            <ProtectedRoute moduleCode="calendar">
              <Calendar />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="all-courses" 
          element={
            <ProtectedRoute moduleCode="all_courses">
              <AllCourses />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="student-courses" 
          element={
            <ProtectedRoute moduleCode="student_courses">
              <StudentCourses />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="courses-manage" 
          element={
            <ProtectedRoute moduleCode="courses_manage">
              <CoursesManage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="others-manage" 
          element={
            <ProtectedRoute moduleCode="others_manage">
              <OthersManage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="student-list" 
          element={
            <ProtectedRoute moduleCode="student_list">
              <StudentList />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="permissions" 
          element={
            <ProtectedRoute requireAdmin={true}>
              <Permissions />
            </ProtectedRoute>
          } 
        />
      </Route>
      <Route
        path="/courses"
        element={
          <PrivateRoute>
            <CoursesLayout />
          </PrivateRoute>
        }
      >
        <Route 
          index 
          element={
            <ProtectedRoute moduleCode="courses">
              <Courses />
            </ProtectedRoute>
          } 
        />
      </Route>
    </Routes>
  )
}

export default App
