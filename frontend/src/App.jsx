import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
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
import Marketing from './pages/Marketing'
import TimetablePage from './pages/TimetablePage'
import Layout from './components/Layout'
import CoursesLayout from './components/CoursesLayout'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="loading">加载中...</div>
  }

  return user ? children : <Navigate to="/login" replace />
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
        <Route path="students" element={<Students />} />
        <Route path="teachers" element={<Teachers />} />
        <Route path="payments" element={<Payments />} />
        <Route path="stats" element={<Stats />} />
        <Route path="finance" element={<Finance />} />
        <Route path="teacher-hours" element={<TeacherHours />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="all-courses" element={<AllCourses />} />
        <Route path="student-courses" element={<StudentCourses />} />
        <Route path="courses-manage" element={<CoursesManage />} />
        <Route path="others-manage" element={<OthersManage />} />
        <Route path="marketing" element={<Marketing />} />
        <Route path="marketing/timetable" element={<TimetablePage />} />
        <Route path="permissions" element={<Permissions />} />
      </Route>
      <Route
        path="/courses"
        element={
          <PrivateRoute>
            <CoursesLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Courses />} />
      </Route>
    </Routes>
  )
}

export default App
