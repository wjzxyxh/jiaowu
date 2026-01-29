import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { studentCoursesService } from '../services/studentCoursesService'
import { othersService } from '../services/othersService'
import Modal from '../components/Modal'
import './StudentCourses.css'

const StudentCourses = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const [showModal, setShowModal] = useState(false)
  const [editingCourse, setEditingCourse] = useState(null)
  const [defaultTimeSlot, setDefaultTimeSlot] = useState('')
  const [defaultWeekday, setDefaultWeekday] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20

  // 获取已缴费需要排课的学生课程列表
  const { data: courses = [], isLoading, error } = useQuery({
    queryKey: ['paid-courses-need-scheduling'],
    queryFn: () => studentCoursesService.getPaidCoursesNeedScheduling(),
    staleTime: 5 * 60 * 1000, // 5分钟内使用缓存数据
    refetchInterval: 2 * 60 * 1000, // 每2分钟自动刷新
    refetchIntervalInBackground: false, // 只在页面可见时刷新
  })

  // 分页数据计算
  const paginatedCourses = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return courses.slice(start, end)
  }, [courses, currentPage])

  const totalPages = Math.ceil(courses.length / pageSize)

  // 获取时段列表（用于编辑默认排课）
  const { data: timeSlots = [] } = useQuery({
    queryKey: ['time-slots', '启用'],
    queryFn: () => othersService.getTimeSlots({ status: '启用' }),
    staleTime: 10 * 60 * 1000,
  })

  // 获取默认排课设置
  const { data: defaultScheduleData } = useQuery({
    queryKey: ['default-schedule', editingCourse?.student_id, editingCourse?.course_id],
    queryFn: () =>
      editingCourse
        ? studentCoursesService.getDefaultSchedule(editingCourse.student_id, editingCourse.course_id)
        : null,
    enabled: !!editingCourse && showModal,
  })

  // 更新默认排课设置
  const updateMutation = useMutation({
    mutationFn: ({ studentId, courseId, data }) =>
      studentCoursesService.updateDefaultSchedule(studentId, courseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['paid-courses-need-scheduling'])
      alert('保存成功！')
      setShowModal(false)
      setEditingCourse(null)
    },
    onError: (error) => {
      alert('保存失败：' + (error.error || error.message))
    },
  })

  // 标记：勾选后该学生不出现在新增排课的学生下拉中
  const markMutation = useMutation({
    mutationFn: ({ studentId, excluded }) =>
      studentCoursesService.updateExcludeFromScheduling(studentId, excluded),
    onSuccess: () => {
      queryClient.invalidateQueries(['paid-courses-need-scheduling'])
    },
    onError: (error) => {
      alert('标记失败：' + (error.error || error.message))
    },
  })

  const handleToggleMark = (course) => {
    markMutation.mutate({
      studentId: course.student_id,
      excluded: !course.excluded_from_scheduling,
    })
  }

  // 当模态框打开时，加载默认设置
  useEffect(() => {
    if (showModal && defaultScheduleData) {
      setDefaultTimeSlot(defaultScheduleData.default_time_slot || '')
      setDefaultWeekday(defaultScheduleData.default_weekday || '')
    }
  }, [showModal, defaultScheduleData])

  // 显示编辑默认排课模态框
  const handleShowEditModal = (course) => {
    setEditingCourse(course)
    setShowModal(true)
    // 重置表单（等待数据加载）
    setDefaultTimeSlot('')
    setDefaultWeekday('')
  }

  // 关闭模态框
  const handleCloseModal = () => {
    setShowModal(false)
    setEditingCourse(null)
    setDefaultTimeSlot('')
    setDefaultWeekday('')
  }

  // 保存默认排课设置
  const handleSaveSchedule = (e) => {
    e.preventDefault()
    if (!editingCourse) return

    updateMutation.mutate({
      studentId: editingCourse.student_id,
      courseId: editingCourse.course_id,
      data: {
        default_time_slot: defaultTimeSlot,
        default_weekday: defaultWeekday,
      },
    })
  }

  // 去排课
  const handleGoToSchedule = (studentId, courseId) => {
    // 设置标记，表示从student-courses页面进入
    sessionStorage.setItem('fromStudentCourses', 'true')
    // 保存学生ID，用于返回时自动标记
    sessionStorage.setItem('studentIdToMark', studentId.toString())
    // 导航到courses页面
    navigate(`/courses?student_id=${studentId}&course_id=${courseId}`)
  }

  // 复制课程（文本格式）
  const handleCopyCourses = (studentId) => {
    // 设置标记，表示要复制课程文本
    sessionStorage.setItem('copyCoursesText', 'true')
    sessionStorage.setItem('copyStudentId', studentId.toString())
    // 设置标记，表示从student-courses页面进入
    sessionStorage.setItem('fromStudentCourses', 'true')
    // 导航到courses页面
    navigate(`/courses?student_id=${studentId}&copy_courses=true`)
  }

  // 分页处理函数
  const changePage = (delta) => {
    setCurrentPage((prev) => {
      const newPage = prev + delta
      if (newPage < 1) return 1
      if (newPage > totalPages) return totalPages
      return newPage
    })
  }

  // 当数据变化时，如果当前页超出范围，重置到第一页
  useEffect(() => {
    if (courses.length > 0 && currentPage > totalPages) {
      setCurrentPage(1)
    }
  }, [courses.length, totalPages, currentPage])

  if (isLoading) {
    return (
      <div className="student-courses-page" style={{ width: '100%' }}>
        <div className="loading" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          正在加载数据...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="student-courses-page" style={{ width: '100%' }}>
        <div className="empty-state" style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>⚠️</div>
          <div style={{ fontSize: '18px', marginBottom: '10px' }}>加载失败</div>
          <div style={{ fontSize: '14px', color: '#999' }}>{error.error || error.message}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="student-courses-page" style={{ width: '100%' }}>
      <div className="page-header">
        <h1>学生课程</h1>
      </div>

      <div className="student-courses-container">
        {courses.length > 0 ? (
          <>
            <div className="table-container">
              <table className="data-table student-courses-table">
                <thead>
                  <tr>
                    <th style={{ width: '5%', textAlign: 'center' }}>序号</th>
                    <th style={{ width: '5%', textAlign: 'center' }}>标记</th>
                    <th style={{ width: '12%' }}>学生</th>
                    <th style={{ width: '8%' }}>年级</th>
                    <th style={{ width: '15%' }}>课程</th>
                    <th style={{ width: '10%' }}>科目</th>
                    <th style={{ width: '12%' }}>默认上课时间</th>
                    <th style={{ width: '10%' }}>默认上课星期</th>
                    <th style={{ textAlign: 'right', width: '8%' }}>总课时</th>
                    <th style={{ textAlign: 'right', width: '8%' }}>已消耗</th>
                    <th style={{ textAlign: 'right', width: '8%' }}>剩余课时</th>
                    <th style={{ textAlign: 'center', width: '12%' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCourses.map((course, index) => {
                    // 计算全局序号（从1开始，延续上一页）
                    const globalIndex = (currentPage - 1) * pageSize + index + 1
                    return (
                      <tr key={`${course.student_id}-${course.course_id}`}>
                        <td style={{ textAlign: 'center' }}>{globalIndex}</td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={!!course.excluded_from_scheduling}
                            onChange={() => handleToggleMark(course)}
                            disabled={markMutation.isLoading}
                            title="勾选后该学生不出现在新增排课的学生下拉中"
                          />
                        </td>
                        <td>{course.student_name}</td>
                        <td>{course.grade || '-'}</td>
                        <td>{course.course_name}</td>
                        <td>{course.subject || '-'}</td>
                        <td>{course.default_time_slot || '-'}</td>
                        <td>{course.default_weekday || '-'}</td>
                        <td style={{ textAlign: 'right' }}>{course.total_paid_hours || 0}</td>
                        <td style={{ textAlign: 'right' }}>{course.consumed_hours || 0}</td>
                        <td style={{ textAlign: 'right' }} className="remaining-hours">
                          {course.remaining_hours ? course.remaining_hours.toFixed(1) : '0.0'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => handleGoToSchedule(course.student_id, course.course_id)}
                            className="btn-link"
                            style={{ marginRight: '8px' }}
                          >
                            去排课
                          </button>
                          <button
                            onClick={() => handleCopyCourses(course.student_id)}
                            className="btn-link"
                            style={{
                              marginRight: '8px',
                              color: '#28a745',
                              borderColor: '#28a745',
                              cursor: 'pointer'
                            }}
                            title="复制课程"
                          >
                            复制课程
                          </button>
                          <button onClick={() => handleShowEditModal(course)} className="btn-link edit-default">
                            编辑默认
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* 分页控件 */}
            {totalPages > 1 && (
              <div
                style={{
                  marginTop: '20px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <button
                  className="btn btn-secondary"
                  onClick={() => changePage(-1)}
                  disabled={currentPage === 1}
                >
                  上一页
                </button>
                <span style={{ padding: '0 15px' }}>
                  第 {currentPage} 页，共 {totalPages} 页（共 {courses.length} 条）
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={() => changePage(1)}
                  disabled={currentPage === totalPages}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>暂无需要排课的学生课程</div>
            <div style={{ fontSize: '14px', color: '#999' }}>所有已缴费的学生课程都已排完课</div>
          </div>
        )}
      </div>

      {/* 编辑默认排课设置模态框 */}
      <Modal isOpen={showModal} onClose={handleCloseModal} title="设置默认排课">
        {editingCourse && (
          <form onSubmit={handleSaveSchedule}>
            <div className="form-group">
              <label>学生</label>
              <input type="text" value={editingCourse.student_name} readOnly />
            </div>
            <div className="form-group">
              <label>课程</label>
              <input type="text" value={editingCourse.course_name} readOnly />
            </div>
            <div className="form-group">
              <label>默认上课时段</label>
              <select value={defaultTimeSlot} onChange={(e) => setDefaultTimeSlot(e.target.value)}>
                <option value="">-- 请选择时段 --</option>
                {Array.isArray(timeSlots) &&
                  timeSlots.map((slot) => (
                    <option key={slot.id} value={slot.name}>
                      {slot.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-group">
              <label>默认上课星期</label>
              <select value={defaultWeekday} onChange={(e) => setDefaultWeekday(e.target.value)}>
                <option value="">-- 请选择星期 --</option>
                <option value="周一">周一</option>
                <option value="周二">周二</option>
                <option value="周三">周三</option>
                <option value="周四">周四</option>
                <option value="周五">周五</option>
                <option value="周六">周六</option>
                <option value="周日">周日</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={handleCloseModal}>
                取消
              </button>
              <button type="submit" className="btn btn-primary" disabled={updateMutation.isLoading}>
                {updateMutation.isLoading ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

export default StudentCourses
