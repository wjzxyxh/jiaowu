import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { allCoursesService } from '../services/allCoursesService'
import { courseService } from '../services/courseService'
import { studentService } from '../services/studentService'
import { teacherService } from '../services/teacherService'
import { courseManageService } from '../services/courseManageService'
import { othersService } from '../services/othersService'
import { statsService } from '../services/statsService'
import { studentCoursesService } from '../services/studentCoursesService'
import Modal from '../components/Modal'
import './AllCourses.css'

const AllCourses = ({ initialStudentId, initialCourseId, openAddModalOnMount }) => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const hasOpenedGoToScheduleRef = React.useRef(false)

  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    student_name: '',
    teacher: '',
    subject: '',
    grade: '',
    date_start: '',
    date_end: '',
    status: '',
    order_by: 'desc',
  })
  const [selectedIds, setSelectedIds] = useState([])
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [editingCourse, setEditingCourse] = useState(null)
  const [minHoursForReminder, setMinHoursForReminder] = useState(3)
  const [minHoursForScheduling, setMinHoursForScheduling] = useState(-1)
  const [remainingHoursMap, setRemainingHoursMap] = useState({})

  const pageSize = 20

  // 从「去排课」进入时自动打开新增排课
  React.useEffect(() => {
    if (!openAddModalOnMount || !initialStudentId || !initialCourseId || hasOpenedGoToScheduleRef.current) return
    hasOpenedGoToScheduleRef.current = true
    setShowAddModal(true)
  }, [openAddModalOnMount, initialStudentId, initialCourseId])

  // 获取排课数据
  const { data, isLoading, error } = useQuery({
    queryKey: ['all-courses', page, filters],
    queryFn: () => allCoursesService.getAllCourses({ page, per_page: pageSize, ...filters }),
  })

  const courses = data?.courses || []
  const total = data?.total || 0
  const totalPages = data?.pages || 1

  // 获取筛选选项（老师、科目、年级）
  const { data: filterData } = useQuery({
    queryKey: ['all-courses-filters'],
    queryFn: () => allCoursesService.getAllCourses({ page: 1, per_page: 1000 }),
    staleTime: 10 * 60 * 1000,
  })

  // 提取唯一的筛选选项
  const filterOptions = useMemo(() => {
    const courses = filterData?.courses || []
    const teachers = new Set()
    const subjects = new Set()
    const grades = new Set()

    courses.forEach((c) => {
      if (c.teacher_name) teachers.add(c.teacher_name)
      if (c.subject) subjects.add(c.subject)
      if (c.grade) grades.add(c.grade)
    })

    return {
      teachers: Array.from(teachers).sort(),
      subjects: Array.from(subjects).sort(),
      grades: Array.from(grades).sort(),
    }
  }, [filterData])

  // 加载财务配置和统计数据
  useEffect(() => {
    Promise.all([
      othersService.getFinanceConfig(),
      statsService.getStats({ month: new Date().toISOString().slice(0, 7) }),
    ])
      .then(([configs, stats]) => {
        const reminderConfig = configs.find((c) => c.key === 'min_hours_for_reminder')
        if (reminderConfig) {
          setMinHoursForReminder(reminderConfig.value)
        }

        const schedulingConfig = configs.find((c) => c.key === 'min_hours_for_scheduling')
        if (schedulingConfig) {
          setMinHoursForScheduling(schedulingConfig.value)
        }

        // 创建剩余课时映射
        const hoursMap = {}
        stats.forEach((s) => {
          const key = s.course_id ? `${s.student_id}-${s.course_id}` : s.student_id
          if (!hoursMap[key] || s.remaining_hours > hoursMap[key]) {
            hoursMap[key] = s.remaining_hours || 0
          }
        })
        setRemainingHoursMap(hoursMap)
      })
      .catch((err) => {
        console.error('加载配置或统计数据失败:', err)
      })
  }, [])

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: courseService.deleteCourse,
    onSuccess: () => {
      queryClient.invalidateQueries(['all-courses'])
      queryClient.invalidateQueries(['courses'])
      alert('删除成功')
    },
  })

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids) => {
      const results = await Promise.allSettled(ids.map((id) => courseService.deleteCourse(id)))
      const successCount = results.filter((r) => r.status === 'fulfilled').length
      const failCount = results.filter((r) => r.status === 'rejected').length
      return { successCount, failCount }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries(['all-courses'])
      queryClient.invalidateQueries(['courses'])
      setSelectedIds([])
      alert(`批量删除完成！成功：${result.successCount}条，失败：${result.failCount}条`)
    },
  })

  const batchConfirmMutation = useMutation({
    mutationFn: (ids) => courseService.batchConfirm(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['all-courses'])
      setSelectedIds([])
      let message = `成功确认 ${data.confirmed_count} 个排课`
      if (data.already_confirmed_count > 0) {
        message += `，${data.already_confirmed_count} 个已确认`
      }
      alert(message)
    },
  })

  const batchCancelConfirmMutation = useMutation({
    mutationFn: (ids) => courseService.batchCancelConfirm(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['all-courses'])
      setSelectedIds([])
      let message = `成功取消确认 ${data.cancelled_count} 个排课`
      if (data.already_cancelled_count > 0) {
        message += `，${data.already_cancelled_count} 个未确认`
      }
      alert(message)
    },
  })

  const confirmMutation = useMutation({
    mutationFn: courseService.confirmCourse,
    onSuccess: () => {
      queryClient.invalidateQueries(['all-courses'])
      queryClient.invalidateQueries(['courses'])
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => courseService.updateCourse(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries(['all-courses'])
      queryClient.invalidateQueries(['courses'])
    },
  })

  const updateCourseMutation = useMutation({
    mutationFn: ({ id, data }) => courseService.updateCourse(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['all-courses'])
      queryClient.invalidateQueries(['courses'])
      setShowEditModal(false)
      setEditingCourse(null)
      alert('更新成功')
    },
  })

  const createCourseMutation = useMutation({
    mutationFn: (data) => courseService.createCourse(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['all-courses'])
      queryClient.invalidateQueries(['courses'])
      setShowAddModal(false)
      alert('新增排课成功')
    },
    onError: (error) => {
      const errorMsg = error?.response?.data?.error || error?.message || '新增排课失败'
      alert(errorMsg)
    },
  })

  // 处理筛选变化
  const handleFilterChange = (key, value) => {
    setFilters({ ...filters, [key]: value })
    setPage(1)
  }

  // 清除筛选
  const handleClearFilters = () => {
    setFilters({
      student_name: '',
      teacher: '',
      subject: '',
      grade: '',
      date_start: '',
      date_end: '',
      status: '',
      order_by: 'desc',
    })
    setPage(1)
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.length === courses.length && courses.length > 0) {
      setSelectedIds([])
    } else {
      setSelectedIds(courses.map((c) => c.id))
    }
  }

  // 切换单个选择
  const toggleSelect = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id))
    } else {
      setSelectedIds([...selectedIds, id])
    }
  }

  // 计算选中未确认和已确认的课程数量
  const selectedCoursesInfo = useMemo(() => {
    const selectedCourses = courses.filter((c) => selectedIds.includes(c.id))
    const unconfirmed = selectedCourses.filter((c) => !c.is_confirmed)
    const confirmed = selectedCourses.filter((c) => c.is_confirmed)
    return { unconfirmed, confirmed }
  }, [courses, selectedIds])

  // 批量确认
  const handleBatchConfirm = () => {
    const unconfirmedIds = selectedCoursesInfo.unconfirmed.map((c) => c.id)
    if (unconfirmedIds.length === 0) {
      alert('请先选择要确认的排课')
      return
    }
    if (window.confirm(`确定要批量确认 ${unconfirmedIds.length} 个排课吗？确认后将扣除剩余课时。`)) {
      batchConfirmMutation.mutate(unconfirmedIds)
    }
  }

  // 批量取消确认
  const handleBatchCancel = () => {
    const confirmedIds = selectedCoursesInfo.confirmed.map((c) => c.id)
    if (confirmedIds.length === 0) {
      alert('请先选择要取消确认的排课')
      return
    }
    if (window.confirm(`确定要批量取消确认 ${confirmedIds.length} 个排课吗？取消后将恢复剩余课时。`)) {
      batchCancelConfirmMutation.mutate(confirmedIds)
    }
  }

  // 批量删除
  const handleBatchDelete = () => {
    if (selectedIds.length === 0) {
      alert('请先选择要删除的排课')
      return
    }
    if (window.confirm(`确定要删除选中的 ${selectedIds.length} 条排课吗？`)) {
      batchDeleteMutation.mutate(selectedIds)
    }
  }

  // 单个删除
  const handleDelete = (id) => {
    if (window.confirm('确定要删除这条排课吗？')) {
      deleteMutation.mutate(id)
    }
  }

  // 单个确认/取消确认
  const handleConfirmCourse = async (course) => {
    const isConfirmed = course.is_confirmed

    // 如果是确认上课，检查剩余课时
    if (!isConfirmed && course.student_id && course.course_id) {
      const key = `${course.student_id}-${course.course_id}`
      let remainingHours = remainingHoursMap[key]

      // 如果映射中没有，尝试从API查询
      if (remainingHours === undefined) {
        try {
          const month = new Date().toISOString().slice(0, 7)
          const stats = await statsService.getStats({
            month,
            student_id: course.student_id,
            course_id: course.course_id,
          })
          if (stats && stats.length > 0) {
            const stat = stats.find(
              (s) => s.student_id === course.student_id && s.course_id === course.course_id
            )
            if (stat) {
              remainingHours = stat.remaining_hours || 0
            }
          }
        } catch (err) {
          console.error('查询剩余课时失败:', err)
        }
      }

      if (remainingHours !== undefined && remainingHours <= minHoursForReminder) {
        if (
          !window.confirm(
            `⚠️ 警告：该学生剩余课时为${remainingHours}，低于或等于提醒阈值${minHoursForReminder}。确认上课后将剩余${remainingHours - 1}课时。\n\n建议先缴费再确认上课，是否继续确认？`
          )
        ) {
          return
        }
      }
    }

    const message = isConfirmed
      ? '确定要取消确认该课程吗？取消后将恢复剩余课时。'
      : '确认该课程已上课？确认后将扣除剩余课时。'

    if (window.confirm(message)) {
      confirmMutation.mutate(course.id)
    }
  }

  // 更新状态
  const handleStatusChange = (courseId, status) => {
    updateStatusMutation.mutate({ id: courseId, status })
  }

  // 显示编辑模态框
  const handleShowEditModal = (course) => {
    if (course.is_confirmed && !isAdmin) {
      alert('无权限编辑已确认上课的排课，只有管理员可以编辑')
      return
    }
    setEditingCourse(course)
    setShowEditModal(true)
  }

  // 保存编辑
  const handleSaveEdit = (formData) => {
    if (!editingCourse) return

    const data = {
      student_id: parseInt(formData.student_id),
      teacher_id: parseInt(formData.teacher_id),
      course_id: formData.course_id ? parseInt(formData.course_id) : null,
      subject: formData.subject,
      weekday: formData.weekday || null,
      course_date: formData.course_date,
      time_slot: formData.time_slot || null,
      classroom: formData.classroom || null,
      status: formData.status,
    }

    updateCourseMutation.mutate({ id: editingCourse.id, data })
  }

  // 显示统计
  const handleShowStatistics = async () => {
    try {
      const statsData = await allCoursesService.getAllCourses({
        page: 1,
        per_page: 10000,
        ...filters,
      })
      const courses = statsData.courses || []

      const stats = {
        total: courses.length,
        confirmed: 0,
        unconfirmed: 0,
        byStatus: { 正常: 0, 请假: 0, 跑空: 0 },
        bySubject: {},
        byTeacher: {},
        byGrade: {},
      }

      courses.forEach((course) => {
        if (course.is_confirmed) {
          stats.confirmed++
        } else {
          stats.unconfirmed++
        }

        const status = course.status || '正常'
        if (stats.byStatus[status] !== undefined) {
          stats.byStatus[status]++
        }

        const subject = course.subject || '未知'
        stats.bySubject[subject] = (stats.bySubject[subject] || 0) + 1

        const teacher = course.teacher_name || '未知'
        stats.byTeacher[teacher] = (stats.byTeacher[teacher] || 0) + 1

        const grade = course.grade || '未知'
        stats.byGrade[grade] = (stats.byGrade[grade] || 0) + 1
      })

      setShowStatsModal(true)
      setEditingCourse({ stats }) // 临时使用 editingCourse 存储统计数据
    } catch (error) {
      console.error('获取统计数据失败:', error)
      alert('获取统计数据失败: ' + (error.message || '未知错误'))
    }
  }

  // 格式化日期
  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  // 获取星期
  const getWeekday = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return weekdays[date.getDay()]
  }

  if (isLoading) return <div className="loading">加载中...</div>
  if (error) return <div className="error">加载失败: {error.error || error.message}</div>

  return (
    <div className="all-courses-page">
      <div className="page-header">
        <h1>全部排课</h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          新增排课
        </button>
      </div>

      <div className="filter-bar">
        <div className="filters-row">
          <label style={{ fontWeight: 'bold' }}>筛选：</label>
          <input
            type="text"
            placeholder="学生"
            value={filters.student_name}
            onChange={(e) => handleFilterChange('student_name', e.target.value)}
          />
          <select value={filters.teacher} onChange={(e) => handleFilterChange('teacher', e.target.value)}>
            <option value="">全部老师</option>
            {filterOptions.teachers.map((teacher) => (
              <option key={teacher} value={teacher}>
                {teacher}
              </option>
            ))}
          </select>
          <select value={filters.subject} onChange={(e) => handleFilterChange('subject', e.target.value)}>
            <option value="">全部科目</option>
            {filterOptions.subjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
          <select value={filters.grade} onChange={(e) => handleFilterChange('grade', e.target.value)}>
            <option value="">全部年级</option>
            {filterOptions.grades.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
          <label>开始日期：</label>
          <input
            type="date"
            value={filters.date_start}
            onChange={(e) => handleFilterChange('date_start', e.target.value)}
          />
          <label>结束日期：</label>
          <input
            type="date"
            value={filters.date_end}
            onChange={(e) => handleFilterChange('date_end', e.target.value)}
          />
          <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}>
            <option value="">全部状态</option>
            <option value="正常">正常</option>
            <option value="请假">请假</option>
            <option value="跑空">跑空</option>
          </select>
          <label style={{ fontWeight: 'bold' }}>排序：</label>
          <select value={filters.order_by} onChange={(e) => handleFilterChange('order_by', e.target.value)}>
            <option value="desc">日期降序（最新在前）</option>
            <option value="asc">日期升序（最早在前）</option>
          </select>
          <button className="btn btn-secondary" onClick={handleClearFilters}>
            清除筛选
          </button>
        </div>
        <div className="batch-actions">
          <button
            className="btn btn-success"
            onClick={handleBatchConfirm}
            disabled={selectedCoursesInfo.unconfirmed.length === 0}
          >
            批量确认 ({selectedCoursesInfo.unconfirmed.length})
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleBatchCancel}
            disabled={selectedCoursesInfo.confirmed.length === 0}
          >
            批量取消 ({selectedCoursesInfo.confirmed.length})
          </button>
          <button className="btn btn-danger" onClick={handleBatchDelete} disabled={selectedIds.length === 0}>
            批量删除 ({selectedIds.length})
          </button>
          <button className="btn btn-info" onClick={handleShowStatistics}>
            统计
          </button>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={selectedIds.length === courses.length && courses.length > 0}
                onChange={toggleSelectAll}
              />
            </th>
            <th>序号</th>
            <th>学生</th>
            <th>年级</th>
            <th>科目</th>
            <th>课程</th>
            <th>老师</th>
            <th>日期</th>
            <th>星期</th>
            <th>时段</th>
            <th>状态</th>
            <th>确认</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {courses.length > 0 ? (
            courses.map((course, index) => {
              const rowNum = (page - 1) * pageSize + index + 1
              const canEdit = !course.is_confirmed || isAdmin
              const rowStyle = course.is_confirmed
                ? { backgroundColor: '#f5f5f5', color: '#666', opacity: 0.8 }
                : {}

              return (
                <tr key={course.id} style={rowStyle}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(course.id)}
                      onChange={() => toggleSelect(course.id)}
                    />
                  </td>
                  <td>{rowNum}</td>
                  <td>{course.student_name || ''}</td>
                  <td>{course.grade || ''}</td>
                  <td>{course.subject || ''}</td>
                  <td>{course.course_name || course.subject || ''}</td>
                  <td>{course.teacher_name || ''}</td>
                  <td>{formatDate(course.course_date)}</td>
                  <td>{getWeekday(course.course_date)}</td>
                  <td>{course.time_slot || ''}</td>
                  <td>
                    <select
                      value={course.status || '正常'}
                      onChange={(e) => handleStatusChange(course.id, e.target.value)}
                      style={{ padding: '4px', border: '1px solid #ddd', borderRadius: '4px' }}
                    >
                      <option value="正常">正常</option>
                      <option value="请假">请假</option>
                      <option value="跑空">跑空</option>
                    </select>
                  </td>
                  <td>
                    {course.is_confirmed ? (
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleConfirmCourse(course)}
                        style={{ background: '#6c757d', color: 'white', padding: '4px 8px', fontSize: '12px' }}
                      >
                        取消确认
                      </button>
                    ) : (
                      <button
                        className="btn btn-success"
                        onClick={() => handleConfirmCourse(course)}
                        style={{ background: '#28a745', color: 'white', padding: '4px 8px', fontSize: '12px' }}
                      >
                        确认上课
                      </button>
                    )}
                  </td>
                  <td>
                    {canEdit ? (
                      <>
                        <button className="btn btn-sm btn-primary" onClick={() => handleShowEditModal(course)}>
                          编辑
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(course.id)}>
                          删除
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled
                          title="无权限编辑已确认上课的排课，只有管理员可以编辑"
                          style={{ opacity: 0.5, cursor: 'not-allowed' }}
                        >
                          编辑
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          disabled
                          title="无权限删除已确认上课的排课，只有管理员可以删除"
                          style={{ opacity: 0.5, cursor: 'not-allowed' }}
                        >
                          删除
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })
          ) : (
            <tr>
              <td colSpan="13" style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                暂无排课数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
            上一页
          </button>
          <span style={{ padding: '0 15px' }}>
            第 {page} 页，共 {totalPages} 页（共 {total} 条记录）
          </span>
          <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            下一页
          </button>
        </div>
      )}

      {/* 新增排课模态框 */}
      {showAddModal && (
        <AddCourseModal
          onClose={() => setShowAddModal(false)}
          onSave={(data) => createCourseMutation.mutate(data)}
          minHoursForScheduling={minHoursForScheduling}
          remainingHoursMap={remainingHoursMap}
          initialStudentId={initialStudentId}
          initialCourseId={initialCourseId}
        />
      )}

      {/* 编辑模态框 */}
      {showEditModal && editingCourse && (
        <EditCourseModal
          course={editingCourse}
          onClose={() => {
            setShowEditModal(false)
            setEditingCourse(null)
          }}
          onSave={handleSaveEdit}
        />
      )}

      {/* 统计模态框 */}
      {showStatsModal && editingCourse?.stats && (
        <StatisticsModal
          stats={editingCourse.stats}
          onClose={() => {
            setShowStatsModal(false)
            setEditingCourse(null)
          }}
        />
      )}
    </div>
  )
}

// 编辑课程模态框组件
const EditCourseModal = ({ course, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    student_id: course.student_id || '',
    teacher_id: course.teacher_id || '',
    course_id: course.course_id || '',
    subject: course.subject || '',
    weekday: course.weekday || '',
    course_date: course.course_date ? course.course_date.split('T')[0] : '',
    time_slot: course.time_slot || '',
    classroom: course.classroom || '',
    status: course.status || '正常',
  })

  const { data: students } = useQuery({
    queryKey: ['students', '在校'],
    queryFn: () => studentService.getStudents({ status: '在校', per_page: 1000 }),
    select: (data) => data.students || [],
  })

  const { data: teachers } = useQuery({
    queryKey: ['teachers', '启用'],
    queryFn: () => teacherService.getTeachers({ status: '启用' }),
  })

  const { data: courses } = useQuery({
    queryKey: ['courses_manage'],
    queryFn: () => courseManageService.getCourses(),
  })

  const { data: timeSlots } = useQuery({
    queryKey: ['time-slots', '启用'],
    queryFn: () => othersService.getTimeSlots({ status: '启用' }),
  })

  const { data: classrooms } = useQuery({
    queryKey: ['classrooms', '启用'],
    queryFn: () => othersService.getClassrooms({ status: '启用' }),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="编辑排课">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>学生 *</label>
          <select
            name="student_id"
            value={formData.student_id}
            onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
            required
          >
            <option value="">-- 请选择学生 --</option>
            {(students || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.grade || ''})
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>课程（已报名课程）</label>
          <select
            name="course_id"
            value={formData.course_id}
            onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
          >
            <option value="">-- 选择课程（可选）--</option>
            {(courses || [])
              .filter((c) => c.status === '启用')
              .map((c) => (
                <option key={c.id} value={c.id} data-subject={c.subject}>
                  {c.name} ({c.subject})
                </option>
              ))}
          </select>
        </div>
        <div className="form-group">
          <label>科目 *</label>
          <input
            type="text"
            name="subject"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>老师 *</label>
          <select
            name="teacher_id"
            value={formData.teacher_id}
            onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
            required
          >
            <option value="">-- 请选择老师 --</option>
            {(teachers || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.subject || ''})
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>星期</label>
          <select
            name="weekday"
            value={formData.weekday}
            onChange={(e) => setFormData({ ...formData, weekday: e.target.value })}
          >
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
        <div className="form-group">
          <label>日期 *</label>
          <input
            type="date"
            name="course_date"
            value={formData.course_date}
            onChange={(e) => setFormData({ ...formData, course_date: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>时段</label>
          <select
            name="time_slot"
            value={formData.time_slot}
            onChange={(e) => setFormData({ ...formData, time_slot: e.target.value })}
          >
            <option value="">-- 请选择时段 --</option>
            {(timeSlots || []).map((slot) => (
              <option key={slot.name} value={slot.name}>
                {slot.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>教室</label>
          <select
            name="classroom"
            value={formData.classroom}
            onChange={(e) => setFormData({ ...formData, classroom: e.target.value })}
          >
            <option value="">-- 请选择教室 --</option>
            {(classrooms || []).map((room) => (
              <option key={room.name} value={room.name}>
                {room.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>状态 *</label>
          <select
            name="status"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            required
          >
            <option value="正常">正常</option>
            <option value="请假">请假</option>
            <option value="跑空">跑空</option>
          </select>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary">
            保存
          </button>
        </div>
      </form>
    </Modal>
  )
}

// 统计模态框组件
const StatisticsModal = ({ stats, onClose }) => {
  const subjectEntries = Object.entries(stats.bySubject).sort((a, b) => b[1] - a[1])
  const teacherEntries = Object.entries(stats.byTeacher).sort((a, b) => b[1] - a[1])
  const gradeEntries = Object.entries(stats.byGrade).sort((a, b) => b[1] - a[1])

  return (
    <Modal isOpen={true} onClose={onClose} title="排课统计信息">
      <div style={{ marginTop: '20px' }}>
        <h3>总体统计</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <tr>
            <th style={{ padding: '8px', border: '1px solid #ddd', background: '#f5f5f5' }}>项目</th>
            <th style={{ padding: '8px', border: '1px solid #ddd', background: '#f5f5f5' }}>数量</th>
          </tr>
          <tr>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>总排课数</td>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>{stats.total}</td>
          </tr>
          <tr>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>已确认</td>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>{stats.confirmed}</td>
          </tr>
          <tr>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>未确认</td>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>{stats.unconfirmed}</td>
          </tr>
        </table>

        <h3>按状态统计</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <tr>
            <th style={{ padding: '8px', border: '1px solid #ddd', background: '#f5f5f5' }}>状态</th>
            <th style={{ padding: '8px', border: '1px solid #ddd', background: '#f5f5f5' }}>数量</th>
          </tr>
          <tr>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>正常</td>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>{stats.byStatus.正常}</td>
          </tr>
          <tr>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>请假</td>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>{stats.byStatus.请假}</td>
          </tr>
          <tr>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>跑空</td>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>{stats.byStatus.跑空}</td>
          </tr>
        </table>

        <h3>按科目统计</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <tr>
            <th style={{ padding: '8px', border: '1px solid #ddd', background: '#f5f5f5' }}>科目</th>
            <th style={{ padding: '8px', border: '1px solid #ddd', background: '#f5f5f5' }}>数量</th>
          </tr>
          {subjectEntries.map(([subject, count]) => (
            <tr key={subject}>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>{subject}</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>{count}</td>
            </tr>
          ))}
        </table>

        <h3>按老师统计</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <tr>
            <th style={{ padding: '8px', border: '1px solid #ddd', background: '#f5f5f5' }}>老师</th>
            <th style={{ padding: '8px', border: '1px solid #ddd', background: '#f5f5f5' }}>数量</th>
          </tr>
          {teacherEntries.map(([teacher, count]) => (
            <tr key={teacher}>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>{teacher}</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>{count}</td>
            </tr>
          ))}
        </table>

        <h3>按年级统计</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <tr>
            <th style={{ padding: '8px', border: '1px solid #ddd', background: '#f5f5f5' }}>年级</th>
            <th style={{ padding: '8px', border: '1px solid #ddd', background: '#f5f5f5' }}>数量</th>
          </tr>
          {gradeEntries.map(([grade, count]) => (
            <tr key={grade}>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>{grade}</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>{count}</td>
            </tr>
          ))}
        </table>
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          关闭
        </button>
      </div>
    </Modal>
  )
}

// 新增排课模态框组件
const AddCourseModal = ({ onClose, onSave, minHoursForScheduling, remainingHoursMap, initialStudentId, initialCourseId }) => {
  const [formData, setFormData] = useState({
    student_id: '',
    course_id: '',
    subject: '',
    teacher_id: '',
    weekday: '',
    course_date: '',
    time_slot: '',
    classroom: '',
    status: '正常',
  })
  const [conflicts, setConflicts] = useState([])
  const [remainingHours, setRemainingHours] = useState(0)

  // 获取已缴费需要排课的学生课程列表
  const { data: paidCoursesData } = useQuery({
    queryKey: ['paid-courses-need-scheduling'],
    queryFn: () => studentCoursesService.getPaidCoursesNeedScheduling(),
  })

  const paidCourses = paidCoursesData || []

  // 去排课进入时预填学生、课程、科目，并加载默认时段/星期
  useEffect(() => {
    if (!initialStudentId || !initialCourseId || paidCourses.length === 0) return
    const course = paidCourses.find(
      (c) => String(c.student_id) === String(initialStudentId) && String(c.course_id) === String(initialCourseId)
    )
    if (!course) return
    setFormData((prev) => ({
      ...prev,
      student_id: String(initialStudentId),
      course_id: String(initialCourseId),
      subject: course.subject || prev.subject,
    }))
    studentCoursesService
      .getDefaultSchedule(parseInt(initialStudentId, 10), parseInt(initialCourseId, 10))
      .then((defaultSchedule) => {
        setFormData((prev) => ({
          ...prev,
          student_id: String(initialStudentId),
          course_id: String(initialCourseId),
          subject: course.subject || prev.subject,
          time_slot: defaultSchedule.default_time_slot || prev.time_slot,
          weekday: defaultSchedule.default_weekday || prev.weekday,
        }))
      })
      .catch(() => {})
  }, [initialStudentId, initialCourseId, paidCourses])

  // 从已缴费课程中提取唯一的学生：去排课进入时仅显示该学生；否则仅显示未被勾选的学生
  const students = useMemo(() => {
    const studentMap = {}
    paidCourses.forEach((course) => {
      if (initialStudentId) {
        if (String(course.student_id) !== String(initialStudentId)) return
      } else if (course.excluded_from_scheduling === true) return
      const studentId = course.student_id
      if (!studentMap[studentId]) {
        studentMap[studentId] = {
          id: studentId,
          name: course.student_name,
          grade: course.grade || '',
          total_remaining_hours: 0,
        }
      }
      studentMap[studentId].total_remaining_hours += (course.remaining_hours || 0)
    })
    return Object.values(studentMap).sort((a, b) => a.name.localeCompare(b.name))
  }, [paidCourses, initialStudentId])

  // 获取当前学生已缴费的课程列表
  const studentPaidCourses = useMemo(() => {
    if (!formData.student_id) return []
    return paidCourses.filter((c) => c.student_id === parseInt(formData.student_id))
  }, [paidCourses, formData.student_id])

  // 根据科目过滤课程
  const filteredCourses = useMemo(() => {
    if (!formData.subject) return studentPaidCourses
    return studentPaidCourses.filter((c) => c.subject === formData.subject)
  }, [studentPaidCourses, formData.subject])

  // 获取科目列表
  const subjects = useMemo(() => {
    const subjectSet = new Set()
    studentPaidCourses.forEach((c) => {
      if (c.subject) subjectSet.add(c.subject)
    })
    return Array.from(subjectSet).sort()
  }, [studentPaidCourses])

  const { data: teachers } = useQuery({
    queryKey: ['teachers', '启用'],
    queryFn: () => teacherService.getTeachers({ status: '启用' }),
  })

  const { data: timeSlots } = useQuery({
    queryKey: ['time-slots', '启用'],
    queryFn: () => othersService.getTimeSlots({ status: '启用' }),
  })

  const { data: classrooms } = useQuery({
    queryKey: ['classrooms', '启用'],
    queryFn: () => othersService.getClassrooms({ status: '启用' }),
  })

  // 更新剩余课时显示
  useEffect(() => {
    if (!formData.student_id) {
      setRemainingHours(0)
      return
    }

    let hours = 0
    if (formData.course_id) {
      const key = `${formData.student_id}-${formData.course_id}`
      hours = remainingHoursMap[key] || 0
    } else {
      Object.keys(remainingHoursMap).forEach((key) => {
        if (key.startsWith(`${formData.student_id}-`) || key === formData.student_id) {
          hours += remainingHoursMap[key] || 0
        }
      })
    }
    setRemainingHours(hours)
  }, [formData.student_id, formData.course_id, remainingHoursMap])

  // 检查课程冲突
  useEffect(() => {
    if (!formData.course_date || !formData.time_slot || !formData.teacher_id || !formData.student_id) {
      setConflicts([])
      return
    }

    const timeoutId = setTimeout(() => {
      courseService
        .checkConflicts({
          course_date: formData.course_date,
          time_slot: formData.time_slot,
          teacher_id: formData.teacher_id,
          classroom: formData.classroom || '',
          student_id: formData.student_id,
        })
        .then((data) => {
          if (data.has_conflict && data.conflicts) {
            setConflicts(data.conflicts)
          } else {
            setConflicts([])
          }
        })
        .catch((err) => {
          console.error('检查冲突失败:', err)
          setConflicts([])
        })
    }, 500) // 防抖

    return () => clearTimeout(timeoutId)
  }, [formData.course_date, formData.time_slot, formData.teacher_id, formData.classroom, formData.student_id])

  // 学生选择变化时，更新科目和课程
  const handleStudentChange = (studentId) => {
    setFormData({
      ...formData,
      student_id: studentId,
      course_id: '',
      subject: '',
    })
  }

  // 科目选择变化时，更新课程列表
  const handleSubjectChange = (subject) => {
    setFormData({
      ...formData,
      subject,
      course_id: '',
    })
  }

  // 课程选择变化时，更新科目和默认设置
  const handleCourseChange = async (courseId) => {
    const course = filteredCourses.find((c) => c.course_id === parseInt(courseId))
    if (course) {
      setFormData({
        ...formData,
        course_id: courseId,
        subject: course.subject,
      })

      // 加载默认排课设置
      if (courseId && formData.student_id) {
        try {
          const defaultSchedule = await studentCoursesService.getDefaultSchedule(
            parseInt(formData.student_id),
            parseInt(courseId)
          )
          if (defaultSchedule.default_time_slot) {
            setFormData((prev) => ({
              ...prev,
              time_slot: defaultSchedule.default_time_slot,
            }))
          }
          if (defaultSchedule.default_weekday) {
            setFormData((prev) => ({
              ...prev,
              weekday: defaultSchedule.default_weekday,
            }))
          }
        } catch (err) {
          console.error('加载默认设置失败:', err)
        }
      }
    } else {
      setFormData({
        ...formData,
        course_id: courseId,
      })
    }
  }

  // 日期变化时，更新星期
  const handleDateChange = (date) => {
    if (date) {
      const d = new Date(date + 'T00:00:00')
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      setFormData({
        ...formData,
        course_date: date,
        weekday: weekdays[d.getDay()],
      })
    } else {
      setFormData({
        ...formData,
        course_date: date,
      })
    }
  }

  // 星期变化时，更新日期（如果日期已设置，调整到该星期）
  const handleWeekdayChange = (weekday) => {
    setFormData({
      ...formData,
      weekday,
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    // 检查剩余课时
    if (formData.student_id) {
      const student = students.find((s) => s.id === parseInt(formData.student_id))
      if (student && student.total_remaining_hours < minHoursForScheduling) {
        alert(
          `无法排课！学生剩余课时为 ${student.total_remaining_hours.toFixed(1)}，低于 ${minHoursForScheduling}。请先缴费！`
        )
        return
      }
    }

    // 检查冲突
    if (conflicts.length > 0) {
      alert('存在课程冲突，无法保存。请修改排课信息后再试。')
      return
    }

    const data = {
      student_id: parseInt(formData.student_id),
      teacher_id: parseInt(formData.teacher_id),
      course_id: formData.course_id ? parseInt(formData.course_id) : null,
      subject: formData.subject,
      weekday: formData.weekday || null,
      course_date: formData.course_date,
      time_slot: formData.time_slot || null,
      classroom: formData.classroom || null,
      status: formData.status,
    }

    onSave(data)
  }

  const hasConflict = conflicts.length > 0
  const schedulingThreshold = minHoursForScheduling !== undefined ? minHoursForScheduling : -1
  const showWarning = remainingHours <= schedulingThreshold && remainingHours >= 0

  return (
    <Modal isOpen={true} onClose={onClose} title="新增排课">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>学生 *</label>
          <select
            name="student_id"
            value={formData.student_id}
            onChange={(e) => handleStudentChange(e.target.value)}
            required
            disabled={!!initialStudentId && students.length <= 1}
          >
            <option value="">-- 请选择学生 --</option>
            {students.map((s) => {
              const warning = s.total_remaining_hours < schedulingThreshold ? ' ⚠️' : ''
              return (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.grade || ''}) - 总剩余课时: {s.total_remaining_hours.toFixed(1)}
                  {warning}
                </option>
              )
            })}
          </select>
        </div>

        <div
          style={{
            margin: '-10px 0 15px 0',
            padding: '8px',
            background: showWarning ? '#fff3cd' : '#f5f5f5',
            border: showWarning ? '1px solid #ffc107' : 'none',
            borderRadius: '4px',
            fontSize: '14px',
            color: showWarning ? '#856404' : '#333',
          }}
        >
          {formData.student_id ? (
            <>
              剩余课时: {remainingHours.toFixed(1)}
              {showWarning && ` (低于阈值 ${schedulingThreshold})`}
            </>
          ) : (
            '请选择学生查看剩余课时'
          )}
        </div>

        <div className="form-group">
          <label>科目（已报名科目）*</label>
          <select
            name="subject"
            value={formData.subject}
            onChange={(e) => handleSubjectChange(e.target.value)}
            required
          >
            <option value="">-- 请选择科目 --</option>
            {subjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>课程（已报名课程）</label>
          <select
            name="course_id"
            value={formData.course_id}
            onChange={(e) => handleCourseChange(e.target.value)}
          >
            <option value="">-- 选择课程（可选）--</option>
            {filteredCourses.map((course) => (
              <option key={course.course_id} value={course.course_id}>
                {course.course_name} ({course.subject})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>老师 *</label>
          <select
            name="teacher_id"
            value={formData.teacher_id}
            onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
            required
          >
            <option value="">-- 请选择老师 --</option>
            {(teachers || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.subject || ''})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>星期</label>
          <select
            name="weekday"
            value={formData.weekday}
            onChange={(e) => handleWeekdayChange(e.target.value)}
          >
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

        <div className="form-group">
          <label>日期 *</label>
          <input
            type="date"
            name="course_date"
            value={formData.course_date}
            onChange={(e) => handleDateChange(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label>时段</label>
          <select
            name="time_slot"
            value={formData.time_slot}
            onChange={(e) => setFormData({ ...formData, time_slot: e.target.value })}
          >
            <option value="">-- 请选择时段 --</option>
            {(timeSlots || []).map((slot) => (
              <option key={slot.name} value={slot.name}>
                {slot.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>教室</label>
          <select
            name="classroom"
            value={formData.classroom}
            onChange={(e) => setFormData({ ...formData, classroom: e.target.value })}
          >
            <option value="">-- 请选择教室 --</option>
            {(classrooms || []).map((room) => (
              <option key={room.name} value={room.name}>
                {room.name}
              </option>
            ))}
          </select>
        </div>

        {hasConflict && (
          <div
            style={{
              margin: '15px 0',
              padding: '12px',
              background: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              color: '#856404',
            }}
          >
            <strong>⚠️ 检测到课程冲突：</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              {conflicts.map((conflict, index) => (
                <li key={index}>{conflict.message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={hasConflict}>
            保存
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default AllCourses
