import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { calendarService } from '../services/calendarService'
import { studentService } from '../services/studentService'
import { teacherService } from '../services/teacherService'
import { othersService } from '../services/othersService'
import './Calendar.css'

const Calendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [teacherFilter, setTeacherFilter] = useState('')
  const [studentFilter, setStudentFilter] = useState('')
  const [classroomFilter, setClassroomFilter] = useState('')

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`

  // 计算月份的开始和结束日期
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ['calendar-courses', startDate, endDate, teacherFilter, studentFilter, classroomFilter],
    queryFn: () =>
      calendarService.getCalendarCourses({
        start_date: startDate,
        end_date: endDate,
        teacher_id: teacherFilter || undefined,
        student_id: studentFilter || undefined,
        classroom: classroomFilter || undefined,
      }),
  })

  // 使用统一的学生查询key，共享缓存
  const { data: studentsData } = useQuery({
    queryKey: ['students', '在校'],
    queryFn: () => studentService.getStudents({ status: '在校', per_page: 1000 }),
    staleTime: 10 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    retry: false,
    placeholderData: (previousData) => previousData,
  })

  // 从返回的数据中提取students数组
  const students = Array.isArray(studentsData?.students) ? studentsData.students : (Array.isArray(studentsData) ? studentsData : [])

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers-for-calendar'],
    queryFn: () => teacherService.getTeachers({ status: '启用' }),
  })

  // 从 /api/classrooms 获取教室列表
  const { data: classroomsData = [] } = useQuery({
    queryKey: ['classrooms-for-calendar'],
    queryFn: () => othersService.getClassrooms({ status: '启用' }),
  })

  const classrooms = Array.isArray(classroomsData) ? classroomsData : []

  // 导航函数
  const previousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // 显示事件详情
  const showEventDetail = (event) => {
    const confirmedText = event.is_confirmed ? '是（已确认）' : '否（未确认）'
    alert(`学生: ${event.student_name}\n教师: ${event.teacher_name}\n科目: ${event.title}\n时段: ${event.time_slot || '未设置'}\n教室: ${event.classroom || '未设置'}\n状态: ${event.status}\n已确认: ${confirmedText}`)
  }

  // 渲染日历
  const renderCalendar = () => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    
    // 从周日开始（Flask 的逻辑）
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - startDate.getDay()) // 设置为该周的第一天（周日）

    const days = []
    // 星期标题：从周日开始
    const weekDays = ['日', '一', '二', '三', '四', '五', '六']

    // 添加星期标题
    const headers = weekDays.map((day) => (
      <div key={day} className="calendar-day-header">
        {day}
      </div>
    ))

    // 渲染42个日期单元格（6行 x 7天）
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const current = new Date(startDate)

    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(current)
      const cellYear = cellDate.getFullYear()
      const cellMonth = cellDate.getMonth()
      const cellDay = cellDate.getDate()
      const dateStr = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(cellDay).padStart(2, '0')}`

      const isOtherMonth = cellMonth !== month
      const isToday = cellDate.getTime() === today.getTime()

      // 获取该日期的事件
      const dayEvents = events.filter((e) => e.start === dateStr)

      days.push(
        <div
          key={i}
          className={`calendar-day ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}
        >
          <div className="day-number">{cellDay}</div>
          <div className="calendar-day-events" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2px' }}>
            {dayEvents.map((event) => {
              let eventClass = 'calendar-event'
              if (event.is_confirmed) {
                eventClass += ' confirmed'
              } else {
                if (event.status === '正常') {
                  eventClass += ' normal'
                } else if (event.status === '请假') {
                  eventClass += ' leave'
                } else if (event.status === '跑空') {
                  eventClass += ' empty'
                }
              }

              return (
                <div
                  key={event.id}
                  className={eventClass}
                  onClick={() => showEventDetail(event)}
                  title={`${event.title || ''} - ${event.is_confirmed ? '已确认' : '未确认'}`}
                >
                  {event.title || ''}
                </div>
              )
            })}
          </div>
        </div>
      )

      current.setDate(current.getDate() + 1)
    }

    return { headers, days }
  }

  const { headers, days } = renderCalendar()

  if (isLoading) return <div className="loading">加载中...</div>
  if (error) return <div className="error">加载失败: {error?.response?.data?.error || error?.message}</div>

  return (
    <div className="calendar-page">
      <div className="page-header">
        <h1>课程表日历</h1>
      </div>

      <div className="calendar-filters">
        <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
          <option value="">全部教师</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name}
            </option>
          ))}
        </select>
        <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
          <option value="">全部学生</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </select>
        <select value={classroomFilter} onChange={(e) => setClassroomFilter(e.target.value)}>
          <option value="">全部教室</option>
          {classrooms.map((classroom) => (
            <option key={classroom.id || classroom.name} value={classroom.name}>
              {classroom.name}
            </option>
          ))}
        </select>
      </div>

      <div className="calendar-container">
        <div className="calendar-header">
          <div className="calendar-nav">
            <button className="btn" onClick={previousMonth}>
              ← 上月
            </button>
            <h2>
              {year}年{month + 1}月
            </h2>
            <button className="btn" onClick={nextMonth}>
              下月 →
            </button>
            <button className="btn" onClick={goToToday}>
              今天
            </button>
          </div>
        </div>
        <div className="calendar-grid">
          {headers}
          {days}
        </div>
      </div>
    </div>
  )
}

export default Calendar
