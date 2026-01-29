import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { studentCoursesService } from '../services/studentCoursesService'
import { othersService } from '../services/othersService'
import { courseService } from '../services/courseService'
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
  const [copiedStudents, setCopiedStudents] = useState(new Set()) // 记录已复制过的学生ID
  // 筛选：是否标记、是否点击复制课程
  const [filterMarked, setFilterMarked] = useState('all')   // 'all' | 'marked' | 'unmarked'
  const [filterCopied, setFilterCopied] = useState('all') // 'all' | 'copied' | 'not_copied'
  const [batchOperating, setBatchOperating] = useState(false)
  const pageSize = 20

  // 获取已缴费需要排课的学生课程列表
  const { data: courses = [], isLoading, error } = useQuery({
    queryKey: ['paid-courses-need-scheduling'],
    queryFn: () => studentCoursesService.getPaidCoursesNeedScheduling(),
    staleTime: 5 * 60 * 1000, // 5分钟内使用缓存数据
    refetchInterval: 2 * 60 * 1000, // 每2分钟自动刷新
    refetchIntervalInBackground: false, // 只在页面可见时刷新
  })

  // 按筛选条件过滤
  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      if (filterMarked === 'marked' && !course.excluded_from_scheduling) return false
      if (filterMarked === 'unmarked' && course.excluded_from_scheduling) return false
      if (filterCopied === 'copied' && !copiedStudents.has(course.student_id)) return false
      if (filterCopied === 'not_copied' && copiedStudents.has(course.student_id)) return false
      return true
    })
  }, [courses, filterMarked, filterCopied, copiedStudents])

  // 分页数据计算（基于筛选后的列表）
  const paginatedCourses = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return filteredCourses.slice(start, end)
  }, [filteredCourses, currentPage])

  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / pageSize))

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

  // 判断当前筛选结果是否全部已标记
  const isAllMarked = useMemo(() => {
    if (filteredCourses.length === 0) return false
    const uniqueStudentIds = [...new Set(filteredCourses.map((c) => c.student_id))]
    return uniqueStudentIds.every((id) => {
      const course = filteredCourses.find((c) => c.student_id === id)
      return course?.excluded_from_scheduling === true
    })
  }, [filteredCourses])

  // 全选/取消勾选切换（根据当前状态自动切换）
  const handleToggleSelectAll = async () => {
    const studentIds = [...new Set(filteredCourses.map((c) => c.student_id))]
    if (studentIds.length === 0) {
      alert('当前筛选结果为空，无法操作。')
      return
    }
    setBatchOperating(true)
    try {
      const shouldMark = !isAllMarked // 如果全部已标记，则取消；否则全选
      for (const id of studentIds) {
        await markMutation.mutateAsync({ studentId: id, excluded: shouldMark })
      }
      queryClient.invalidateQueries(['paid-courses-need-scheduling'])
    } catch (e) {
      const errorMsg = isAllMarked ? '批量取消标记失败：' : '批量标记失败：'
      alert(errorMsg + (e?.message || e))
    } finally {
      setBatchOperating(false)
    }
  }

  // 全选（当前筛选结果中所有学生标记为“已标记”）
  const handleSelectAll = async () => {
    const studentIds = [...new Set(filteredCourses.map((c) => c.student_id))]
    if (studentIds.length === 0) {
      alert('当前筛选结果为空，无法全选。')
      return
    }
    setBatchOperating(true)
    try {
      for (const id of studentIds) {
        await markMutation.mutateAsync({ studentId: id, excluded: true })
      }
      queryClient.invalidateQueries(['paid-courses-need-scheduling'])
    } catch (e) {
      alert('批量标记失败：' + (e?.message || e))
    } finally {
      setBatchOperating(false)
    }
  }

  // 取消勾选（当前筛选结果中所有学生取消“已标记”）
  const handleDeselectAll = async () => {
    const studentIds = [...new Set(filteredCourses.map((c) => c.student_id))]
    if (studentIds.length === 0) {
      alert('当前筛选结果为空，无法取消勾选。')
      return
    }
    setBatchOperating(true)
    try {
      for (const id of studentIds) {
        await markMutation.mutateAsync({ studentId: id, excluded: false })
      }
      queryClient.invalidateQueries(['paid-courses-need-scheduling'])
    } catch (e) {
      alert('批量取消标记失败：' + (e?.message || e))
    } finally {
      setBatchOperating(false)
    }
  }

  // 恢复：重置筛选条件为“全部”
  // 重置：清除所有标记和已复制记录
  const handleReset = async () => {
    if (!window.confirm('确定要重置吗？这将清除所有标记和已复制记录。')) {
      return
    }

    setBatchOperating(true)
    try {
      // 清除所有已标记（取消所有标记）
      const allMarkedStudentIds = [...new Set(
        courses.filter((c) => c.excluded_from_scheduling).map((c) => c.student_id)
      )]
      
      for (const id of allMarkedStudentIds) {
        await markMutation.mutateAsync({ studentId: id, excluded: false })
      }
      
      // 清除所有已复制记录
      setCopiedStudents(new Set())
      
      // 重置筛选条件
      setFilterMarked('all')
      setFilterCopied('all')
      setCurrentPage(1)
      
      queryClient.invalidateQueries(['paid-courses-need-scheduling'])
      alert('重置成功！')
    } catch (e) {
      alert('重置失败：' + (e?.message || e))
    } finally {
      setBatchOperating(false)
    }
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

  // 计算当前日期所在的周数
  const getWeekInMonth = (date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const dayOfMonth = date.getDate()
    const firstDay = new Date(year, month, 1)
    const firstDayWeekday = firstDay.getDay()
    if (firstDayWeekday === 0) {
      if (dayOfMonth === 1) return 1
      const firstMonday = new Date(year, month, 2)
      const daysFromFirstMonday = dayOfMonth - firstMonday.getDate()
      const weekNum = Math.floor(daysFromFirstMonday / 7) + 2
      return Math.min(weekNum, 5)
    } else {
      const daysToSunday = 7 - firstDayWeekday
      const firstSunday = new Date(year, month, 1 + daysToSunday)
      if (dayOfMonth <= firstSunday.getDate()) return 1
      const daysToMonday = 7 - firstDayWeekday
      const firstMonday = new Date(year, month, 1 + daysToMonday)
      const daysFromFirstMonday = dayOfMonth - firstMonday.getDate()
      const weekNum = Math.floor(daysFromFirstMonday / 7) + 2
      return Math.min(weekNum, 5)
    }
  }

  // 计算当前周的日期范围
  const getCurrentWeekDateRange = (month, week) => {
    if (!month || !week) return null
    const [year, monthNum] = month.split('-').map(Number)
    const weekNum = parseInt(week)
    const firstDay = new Date(year, monthNum - 1, 1)
    const firstDayWeekday = firstDay.getDay()
    const lastDay = new Date(year, monthNum, 0)
    const monthEnd = lastDay.getDate()
    let startDate, endDate
    if (weekNum === 1) {
      if (firstDayWeekday === 0) {
        startDate = new Date(year, monthNum - 1, 1)
        endDate = new Date(year, monthNum - 1, 1)
      } else {
        const daysToSunday = 7 - firstDayWeekday
        const firstSundayDate = Math.min(1 + daysToSunday, monthEnd)
        startDate = new Date(year, monthNum - 1, 1)
        endDate = new Date(year, monthNum - 1, firstSundayDate)
      }
    } else {
      let daysToMonday
      if (firstDayWeekday === 0) daysToMonday = 1
      else if (firstDayWeekday === 1) daysToMonday = 0
      else daysToMonday = 8 - firstDayWeekday
      const firstMondayDate = 1 + daysToMonday
      const startDateNum = firstMondayDate + (weekNum - 2) * 7
      if (startDateNum > monthEnd) return null
      startDate = new Date(year, monthNum - 1, startDateNum)
      const endDateNum = Math.min(startDateNum + 6, monthEnd)
      endDate = new Date(year, monthNum - 1, endDateNum)
    }
    return { startDate, endDate, year, month: monthNum }
  }

  // 降级复制方法（兼容旧浏览器）
  const fallbackCopyTextToClipboard = useCallback((text, count) => {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    try {
      const successful = document.execCommand('copy')
      if (successful) {
        alert(`已复制 ${count} 条排课信息到剪贴板`)
      } else {
        alert('复制失败，请手动复制')
      }
    } catch (err) {
      console.error('降级复制方法失败:', err)
      alert('复制失败，请手动复制')
    }
    document.body.removeChild(textArea)
  }, [])

  // 复制课程信息到剪贴板的辅助函数
  const copyCoursesToClipboard = useCallback((coursesToCopy, weekLabel, timeSlotsData) => {
    if (coursesToCopy.length === 0) {
      alert('该学生本周暂无排课信息')
      return
    }
    
    const studentName = coursesToCopy[0].student_name
    const lines = []
    if (weekLabel) {
      // 学生与时间放在同一行，中间两个空格
      lines.push(`${studentName}  ${weekLabel}`)
    } else {
      lines.push(studentName)
    }
    lines.push('')
    
    // 建立时段名称到 sort_order 的映射（用于按时段排序）
    const timeSlotOrderMap = new Map()
    ;(timeSlotsData || []).forEach((slot) => {
      const order = slot.sort_order !== null && slot.sort_order !== undefined ? slot.sort_order : 999
      timeSlotOrderMap.set(slot.name, order)
    })
    
    // 星期顺序映射（用于排序）
    const weekdayOrder = { '周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 7 }
    
    // 按日期、星期和时段排序
    const sortedCourses = [...coursesToCopy].sort((a, b) => {
      const dateCompare = (a.course_date || '').localeCompare(b.course_date || '')
      if (dateCompare !== 0) return dateCompare
      const weekdayA = weekdayOrder[a.weekday] || 999
      const weekdayB = weekdayOrder[b.weekday] || 999
      if (weekdayA !== weekdayB) return weekdayA - weekdayB
      const orderA = timeSlotOrderMap.get(a.time_slot) ?? 999
      const orderB = timeSlotOrderMap.get(b.time_slot) ?? 999
      if (orderA !== orderB) return orderA - orderB
      return (a.time_slot || '').localeCompare(b.time_slot || '')
    })
    
    // 格式化日期：去掉年份，只保留 MM-DD
    const formatDateWithoutYear = (dateStr) => {
      if (!dateStr) return '-'
      const parts = dateStr.split('-')
      if (parts.length >= 3) return `${parts[1]}-${parts[2]}`
      return dateStr
    }
    
    let lastDate = ''
    sortedCourses.forEach((course) => {
      const dateStr = formatDateWithoutYear(course.course_date)
      const isNewDate = dateStr !== lastDate
      
      // 换了日期：先加分割线（非第一条），再写「日期 星期」单独一行
      if (isNewDate) {
        if (lastDate !== '') {
          lines.push('---')
        }
        lines.push(`${dateStr}  ${course.weekday || ''}`)
      }
      
      // 一条课程记录：课程 老师 时段（相邻字段留2个空格）
      const courseLine = `${course.course_name || '-'}  ${course.teacher_name || '-'}  ${course.time_slot || ''}`
      lines.push(courseLine)
      
      lastDate = dateStr
    })
    
    const textToCopy = lines.join('\n')
    
    // 复制到剪贴板
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(textToCopy)
        .then(() => {
          alert(`已复制 ${sortedCourses.length} 条排课信息到剪贴板`)
        })
        .catch((err) => {
          console.error('复制失败:', err)
          fallbackCopyTextToClipboard(textToCopy, sortedCourses.length)
        })
    } else {
      fallbackCopyTextToClipboard(textToCopy, sortedCourses.length)
    }
  }, [fallbackCopyTextToClipboard])

  // 复制课程：获取该学生当周的排课数据并复制到剪贴板（不跳转页面）
  // 如果已复制，再次点击会清除复制状态
  const handleCopyCourses = async (studentId) => {
    // 如果已复制，清除复制状态
    if (copiedStudents.has(studentId)) {
      setCopiedStudents((prev) => {
        const next = new Set(prev)
        next.delete(studentId)
        return next
      })
      return
    }

    try {
      // 计算当前日期所在的月份和周数
      const today = new Date()
      const currentMonth = today.toISOString().slice(0, 7)
      const currentWeek = getWeekInMonth(today).toString()
      
      // 获取当前周的日期范围
      const weekDateRange = getCurrentWeekDateRange(currentMonth, currentWeek)
      if (!weekDateRange) {
        alert('无法计算当前周的日期范围')
        return
      }
      
      // 构建周信息标签
      const weekInfoLabel = `${weekDateRange.year}年${String(weekDateRange.month).padStart(2, '0')}月 第${currentWeek}周 ${String(weekDateRange.startDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.startDate.getDate()).padStart(2, '0')} 至 ${String(weekDateRange.endDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.endDate.getDate()).padStart(2, '0')}`
      
      // 获取该学生当周的排课数据
      const coursesData = await courseService.getCourses({
        month: currentMonth,
        week: currentWeek,
        student_id: studentId,
      })
      
      // 过滤掉已删除的课程
      const validCourses = coursesData.filter((c) => c.status !== '删除')
      
      // 过滤出该学生的课程
      const studentCourses = validCourses.filter((c) => String(c.student_id) === String(studentId))
      
      // 复制到剪贴板
      copyCoursesToClipboard(studentCourses, weekInfoLabel, timeSlots)
      
      // 标记该学生已复制
      setCopiedStudents((prev) => new Set([...prev, studentId]))
    } catch (error) {
      console.error('获取排课数据失败:', error)
      alert('获取排课数据失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    }
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
            {/* 工具栏：筛选、全选、取消勾选、重置 */}
            <div className="student-courses-toolbar">
              <div className="toolbar-filters">
                <span className="toolbar-section-label">筛选</span>
                <div className="filter-item">
                  <span className="filter-name">是否标记</span>
                  <select
                    value={filterMarked}
                    onChange={(e) => { setFilterMarked(e.target.value); setCurrentPage(1) }}
                    className="filter-select"
                  >
                    <option value="all">全部</option>
                    <option value="marked">已标记</option>
                    <option value="unmarked">未标记</option>
                  </select>
                </div>
                <div className="filter-item">
                  <span className="filter-name">是否复制</span>
                  <select
                    value={filterCopied}
                    onChange={(e) => { setFilterCopied(e.target.value); setCurrentPage(1) }}
                    className="filter-select"
                  >
                    <option value="all">全部</option>
                    <option value="copied">已复制</option>
                    <option value="not_copied">未复制</option>
                  </select>
                </div>
              </div>
              <div className="toolbar-divider" aria-hidden="true" />
              <div className="toolbar-actions">
                <span className="toolbar-section-label">批量</span>
                <button
                  type="button"
                  className="btn btn-secondary toolbar-btn"
                  onClick={handleToggleSelectAll}
                  disabled={batchOperating || filteredCourses.length === 0}
                  title={filteredCourses.length === 0 ? '当前筛选结果为空，无法操作' : ''}
                >
                  {batchOperating ? '处理中...' : (isAllMarked ? '取消勾选' : '全选')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary toolbar-btn toolbar-btn-reset"
                  onClick={handleReset}
                  disabled={batchOperating}
                >
                  {batchOperating ? '处理中...' : '重置'}
                </button>
              </div>
            </div>
            <div className="table-container">
              <table className="data-table student-courses-table">
                <thead>
                  <tr>
                    <th style={{ width: '5%', textAlign: 'center' }}>序号</th>
                    <th style={{ width: '5%', textAlign: 'center' }}>标记</th>
                    <th style={{ width: '12%' }}>学生</th>
                    <th style={{ width: '8%' }}>年级</th>
                    <th style={{ width: '15%' }}>课程</th>
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
                            排课
                          </button>
                          <button
                            onClick={() => handleCopyCourses(course.student_id)}
                            className="btn-link"
                            style={{
                              marginRight: '8px',
                              color: copiedStudents.has(course.student_id) ? '#ff9800' : '#28a745',
                              borderColor: copiedStudents.has(course.student_id) ? '#ff9800' : '#28a745',
                              cursor: 'pointer'
                            }}
                            title={copiedStudents.has(course.student_id) ? "点击恢复为复制" : "复制"}
                          >
                            {copiedStudents.has(course.student_id) ? '已复制' : '复制'}
                          </button>
                          <button 
                            onClick={() => handleShowEditModal(course)} 
                            className="btn-link edit-default"
                            style={{ marginRight: '0' }}
                          >
                            编辑
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
                  第 {currentPage} 页，共 {totalPages} 页（当前 {filteredCourses.length} 条
                  {(filterMarked !== 'all' || filterCopied !== 'all') ? ` / 全部 ${courses.length} 条` : ''}）
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
