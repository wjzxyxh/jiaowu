import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { statsService } from '../services/statsService'
import { studentService } from '../services/studentService'
import './Stats.css'

const Stats = () => {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [monthFilter, setMonthFilter] = useState(currentMonth)
  const [selectedStudentId, setSelectedStudentId] = useState('')

  // 获取学生列表（在校状态）
  const { data: studentsData = [] } = useQuery({
    queryKey: ['students', '在校'],
    queryFn: () => studentService.getStudents({ status: '在校', per_page: 1000 }),
    staleTime: 10 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    select: (data) => {
      if (data.students) return data.students
      if (Array.isArray(data)) return data
      return []
    },
  })

  // 获取课时统计数据
  const { data: statsData = [], isLoading, error } = useQuery({
    queryKey: ['stats', monthFilter, selectedStudentId],
    queryFn: () => {
      const params = { month: monthFilter }
      if (selectedStudentId) {
        params.student_id = selectedStudentId
      }
      return statsService.getStats(params)
    },
    staleTime: 10 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
  })

  // 按课程统计剩余课时
  const courseRemainingHours = useMemo(() => {
    const courseHours = {}
    if (Array.isArray(statsData)) {
      statsData.forEach((s) => {
        const courseName = s.course_name || '未知课程'
        if (!courseHours[courseName]) {
          courseHours[courseName] = 0
        }
        courseHours[courseName] += s.remaining_hours || 0
      })
    }
    return courseHours
  }, [statsData])

  // 按学生和课程分组数据
  const groupedData = useMemo(() => {
    if (!Array.isArray(statsData)) return []

    const grouped = {}
    statsData.forEach((s) => {
      const key = `${s.student_id}-${s.student_name}`
      if (!grouped[key]) {
        grouped[key] = {
          student_id: s.student_id,
          student_name: s.student_name,
          courses: [],
        }
      }
      grouped[key].courses.push(s)
    })

    // 如果学生只有一个课程，直接返回；如果有多个课程，为每个课程返回一行
    const result = []
    Object.values(grouped).forEach((studentGroup) => {
      if (studentGroup.courses.length === 1) {
        result.push(studentGroup.courses[0])
      } else {
        result.push(...studentGroup.courses)
      }
    })

    return result
  }, [statsData])

  // 渲染上课日期和时段
  const renderCourseDetails = (stat) => {
    const courseDetails = stat.course_details || []
    if (courseDetails.length === 0) {
      return <span style={{ color: '#999', fontStyle: 'italic' }}>暂无上课记录</span>
    }

    return courseDetails.map((detail, idx) => {
      // 解析格式：老师姓名:日期(星期) 时段;日期(星期) 时段;
      const colonIndex = detail.indexOf(':')
      if (colonIndex === -1) {
        return (
          <div
            key={idx}
            style={{
              margin: '3px 0',
              padding: '4px 8px',
              background: '#f5f5f5',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          >
            {detail}
          </div>
        )
      }

      const teacherName = detail.substring(0, colonIndex)
      const timesPart = detail.substring(colonIndex + 1)

      // 解析时间段（用分号分隔）
      const timeSlots = timesPart.split(';').filter((t) => t.trim())

      return (
        <div
          key={idx}
          style={{
            margin: '5px 0',
            padding: '8px',
            background: '#f5f5f5',
            borderRadius: '4px',
            fontSize: '12px',
          }}
        >
          <div style={{ fontWeight: 'bold', color: '#667eea', marginBottom: '4px' }}>{teacherName}:</div>
          <div style={{ color: '#666', marginLeft: '10px' }}>
            {timeSlots.map((time, timeIdx) => (
              <div key={timeIdx} style={{ margin: '2px 0' }}>
                {time}
              </div>
            ))}
          </div>
        </div>
      )
    })
  }

  // 导出Excel
  const handleExport = () => {
    statsService.exportStats(monthFilter, selectedStudentId || null)
  }

  if (isLoading) return <div className="loading">加载中...</div>
  if (error) return <div className="error">加载失败: {error.error || error.message}</div>

  return (
    <div className="stats-page" style={{ width: '100%' }}>
      <div className="page-header">
        <h1>学生课时</h1>
      </div>

      {/* 工具栏 */}
      <div className="toolbar" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <input
          type="month"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px' }}
        />
        <select
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px' }}
        >
          <option value="">全部学生</option>
          {Array.isArray(studentsData) &&
            studentsData.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
        </select>
        <button className="btn btn-primary" onClick={handleExport} style={{ marginLeft: '10px' }}>
          导出Excel
        </button>
      </div>

      {/* 表格 */}
      <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>姓名</th>
            <th>课程</th>
            <th>当月课时</th>
            <th>上月累计课时</th>
            <th>本月累计课时</th>
            <th>剩余课时</th>
            <th>当月上课日期(时段)</th>
          </tr>
        </thead>
        <tbody>
          {groupedData.length > 0 ? (
            groupedData.map((stat, index) => {
              const courseName = stat.course_name || '未知课程'
              const totalRemainingHours = courseRemainingHours[courseName] || 0

              return (
                <tr key={`${stat.student_id}-${stat.course_id}-${index}`}>
                  <td>{stat.student_name}</td>
                  <td style={{ fontWeight: 'bold', color: '#1976d2' }}>{courseName}</td>
                  <td>{stat.actual_hours || 0}</td>
                  <td>{stat.last_month_total || 0}</td>
                  <td>{stat.current_month_total || 0}</td>
                  <td>
                    <div style={{ fontWeight: 'bold', color: '#28a745', marginBottom: '2px' }}>
                      {stat.remaining_hours || 0}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666' }}>({courseName}总计: {totalRemainingHours})</div>
                  </td>
                  <td style={{ maxWidth: '350px', wordWrap: 'break-word', padding: '10px' }}>
                    {renderCourseDetails(stat)}
                  </td>
                </tr>
              )
            })
          ) : (
            <tr>
              <td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                暂无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default Stats
