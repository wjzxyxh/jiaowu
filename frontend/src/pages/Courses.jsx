import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import html2canvas from 'html2canvas'
import { useAuth } from '../contexts/AuthContext'
import { courseService } from '../services/courseService'
import { studentService } from '../services/studentService'
import { teacherService } from '../services/teacherService'
import { courseManageService } from '../services/courseManageService'
import { othersService } from '../services/othersService'
import { studentCoursesService } from '../services/studentCoursesService'
import { statsService } from '../services/statsService'
import Modal from '../components/Modal'
import { buildConfirmFailureMessage } from '../utils/confirmCourseError'
import './Courses.css'

const Courses = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const studentIdFromUrl = searchParams.get('student_id')
  const courseIdFromUrl = searchParams.get('course_id')
  const copyCoursesFromUrl = searchParams.get('copy_courses') === 'true'
  const fromGoToSchedule = !!(studentIdFromUrl && courseIdFromUrl && !copyCoursesFromUrl)
  const monthFromUrl = searchParams.get('month')
  const weekFromUrl = searchParams.get('week')

  // 获取当月第一个周一（每月第一周从当月的第一个周一开始算起）
  const getFirstMondayOfMonth = (year, monthNum) => {
    const firstDay = new Date(year, monthNum - 1, 1)
    const dayOfWeek = firstDay.getDay() // 0=周日, 1=周一, ..., 6=周六
    const offset = (8 - dayOfWeek) % 7 // 周一->0, 周日->1, 周二->6, ...
    const firstMonday = new Date(year, monthNum - 1, 1 + offset)
    return firstMonday
  }

  // 计算当前月的周数范围（第一周 = 当月第一个周一所在周）
  const getWeekRange = (month) => {
    const [year, monthNum] = month.split('-').map(Number)
    const firstMonday = getFirstMondayOfMonth(year, monthNum)
    const lastDay = new Date(year, monthNum, 0)
    const diffMs = lastDay.getTime() - firstMonday.getTime()
    const maxWeeks = Math.max(1, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1)
    return Array.from({ length: maxWeeks }, (_, i) => (i + 1).toString())
  }

  // 计算当前日期所在的周数（第一周 = 当月第一个周一所在的那一周）
  const getWeekInMonth = (date) => {
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const firstMonday = getFirstMondayOfMonth(year, month)
    if (date < firstMonday) return 1
    const diffMs = date.getTime() - firstMonday.getTime()
    const weekNum = 1 + Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000))
    return Math.max(1, weekNum)
  }

  // 获取「包含给定日期」的那一周所在的月份和周数（周一到周日为一周；如 2 月 1 日周日属于 1 月第 4 周）
  const getMonthAndWeekContainingDate = (date) => {
    const dayOfWeek = date.getDay()
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const mondayOfWeek = new Date(date)
    mondayOfWeek.setDate(date.getDate() - daysToMonday)
    const year = mondayOfWeek.getFullYear()
    const month = mondayOfWeek.getMonth() + 1
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    const week = getWeekInMonth(mondayOfWeek)
    return { currentMonth: monthStr, currentWeek: week.toString() }
  }

  // 初始化当前日期所在的月份和周数（优先用 URL 的 month/week，刷新后保持当前课表）
  const initialWeekState = useMemo(() => {
    const today = new Date()
    const { currentMonth: defaultMonth, currentWeek: defaultWeek } = getMonthAndWeekContainingDate(today)
    if (monthFromUrl && /^\d{4}-\d{2}$/.test(monthFromUrl)) {
      const weekOpts = getWeekRange(monthFromUrl)
      let w
      if (weekFromUrl != null && weekFromUrl !== '') {
        w = weekFromUrl
      } else {
        // 未指定周时，使用包含今天的周（若该周在本月范围内）
        const { currentMonth: curMonth, currentWeek: curWeek } = getMonthAndWeekContainingDate(today)
        if (curMonth === monthFromUrl && weekOpts.includes(curWeek)) {
          w = curWeek
        } else {
          w = weekOpts[0]
        }
      }
      if (weekOpts.includes(String(w))) {
        return { currentMonth: monthFromUrl, currentWeek: String(w) }
      }
    }
    return { currentMonth: defaultMonth, currentWeek: defaultWeek }
  }, [monthFromUrl, weekFromUrl])

  const [viewMode, setViewMode] = useState('week')
  const [weekFilter, setWeekFilter] = useState(initialWeekState.currentWeek)
  const [monthFilter, setMonthFilter] = useState(initialWeekState.currentMonth)

  // URL 无 month/week 或无效时，同步到当前日期所在周；导航回 /courses 时也正确显示当前周
  useEffect(() => {
    setMonthFilter(initialWeekState.currentMonth)
    setWeekFilter(initialWeekState.currentWeek)
  }, [initialWeekState.currentMonth, initialWeekState.currentWeek])

  // 同步课表月份/周数到 URL，刷新后保持在当前课表
  useEffect(() => {
    if (!monthFilter || !weekFilter) return
    const next = new URLSearchParams(searchParams)
    if (next.get('month') !== monthFilter || next.get('week') !== weekFilter) {
      next.set('month', monthFilter)
      next.set('week', weekFilter)
      setSearchParams(next, { replace: true })
    }
  }, [monthFilter, weekFilter, searchParams, setSearchParams])
  const [teacherFilter, setTeacherFilter] = useState('')
  const [classroomFilter, setClassroomFilter] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [studentFilter, setStudentFilter] = useState('') // 筛选学生：student_id 或 ''
  const [confirmFilter, setConfirmFilter] = useState('') // 筛选确认：'' | 'confirmed' | 'unconfirmed'
  const [statusFilter, setStatusFilter] = useState('') // 筛选状态：'' | '正常' | '请假' | '跑空' | '删除'
  const [showModal, setShowModal] = useState(false)
  const [restrictStudentsToInitialStudent, setRestrictStudentsToInitialStudent] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingCourse, setEditingCourse] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const [screenshotTarget, setScreenshotTarget] = useState(null) // 截图用：{ weekInfoLabel, monthFilter, weekFilter, courses, timeSlots }
  const screenshotCaptureRef = useRef(null)

  const weekOptions = getWeekRange(monthFilter)

  // 计算当前周的日期范围（第一周 = 当月第一个周一，周一到周日）
  const getCurrentWeekDateRange = () => {
    if (!monthFilter || !weekFilter) return null

    const [year, month] = monthFilter.split('-').map(Number)
    const weekNum = parseInt(weekFilter)
    const firstMonday = getFirstMondayOfMonth(year, month)
    const startDate = new Date(firstMonday)
    startDate.setDate(startDate.getDate() + (weekNum - 1) * 7)
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 6)
    return { startDate, endDate, year, month }
  }

  const weekDateRange = getCurrentWeekDateRange()
  const weekInfoLabel = weekDateRange
    ? `${weekDateRange.year}年${String(weekDateRange.month).padStart(2, '0')}月 第${weekFilter}周 ${String(weekDateRange.startDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.startDate.getDate()).padStart(2, '0')} 至 ${String(weekDateRange.endDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.endDate.getDate()).padStart(2, '0')}`
    : ''

  // 获取排课数据
  const { data: courses = [], isLoading, error } = useQuery({
    queryKey: ['courses', monthFilter, weekFilter, teacherFilter, classroomFilter, subjectFilter, gradeFilter, studentFilter || studentIdFromUrl],
    queryFn: () =>
      courseService.getCourses({
        month: monthFilter,
        week: weekFilter,
        teacher: teacherFilter || undefined,
        classroom: classroomFilter || undefined,
        subject: subjectFilter || undefined,
        grade: gradeFilter || undefined,
        student_id: studentFilter || studentIdFromUrl || undefined,
      }),
  })

  // 按状态、确认状态筛选
  const validCourses = useMemo(() => {
    let list = courses
    if (statusFilter) {
      list = list.filter((c) => c.status === statusFilter)
    } else {
      list = list.filter((c) => c.status !== '删除')
    }
    if (confirmFilter === 'confirmed') list = list.filter((c) => c.is_confirmed)
    if (confirmFilter === 'unconfirmed') list = list.filter((c) => !c.is_confirmed)
    return list
  }, [courses, statusFilter, confirmFilter])

  // 分页数据
  const paginatedCourses = useMemo(() => {
    if (viewMode === 'week') return validCourses
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return validCourses.slice(start, end)
  }, [validCourses, currentPage, viewMode])

  const totalPages = Math.ceil(validCourses.length / pageSize)

  // 获取筛选选项
  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers-for-course'],
    queryFn: () => teacherService.getTeachers({ status: '启用' }),
  })

  const { data: timeSlots = [] } = useQuery({
    queryKey: ['time-slots'],
    queryFn: () => othersService.getTimeSlots({ status: '启用' }),
  })

  const { data: classrooms = [] } = useQuery({
    queryKey: ['classrooms'],
    queryFn: () => othersService.getClassrooms({ status: '启用' }),
  })

  // 从课程数据中提取唯一的筛选选项
  const filterOptions = useMemo(() => {
    const teachers = new Set()
    const classrooms = new Set()
    const subjects = new Set()
    const grades = new Set()

    validCourses.forEach((c) => {
      if (c.teacher_name) teachers.add(c.teacher_name)
      if (c.classroom) classrooms.add(c.classroom)
      if (c.subject) subjects.add(c.subject)
      if (c.grade) grades.add(c.grade)
    })

    return {
      teachers: Array.from(teachers).sort(),
      classrooms: Array.from(classrooms).sort(),
      subjects: Array.from(subjects).sort(),
      grades: Array.from(grades).sort(),
    }
  }, [validCourses])

  // 使用统一的学生查询key，共享缓存；接口返回 { students: [], pagination }，统一取为数组
  const { data: studentsResponse } = useQuery({
    queryKey: ['students', '在校'],
    queryFn: () => studentService.getStudents({ status: '在校', per_page: 1000 }),
    staleTime: 10 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    retry: false,
    placeholderData: (previousData) => previousData,
  })
  const students = Array.isArray(studentsResponse?.students) ? studentsResponse.students : []

  const { data: courseList = [] } = useQuery({
    queryKey: ['courses-list'],
    queryFn: () => courseManageService.getCourses({ status: '启用' }),
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: courseService.createCourse,
    onSuccess: () => {
      queryClient.invalidateQueries(['courses'])
      setShowModal(false)
      alert('排课创建成功')
    },
    onError: (error) => {
      alert('创建失败: ' + (error?.response?.data?.error || error?.message))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: courseService.deleteCourse,
    onSuccess: () => {
      queryClient.invalidateQueries(['courses'])
      setSelectedIds([])
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
      queryClient.invalidateQueries(['courses'])
      setSelectedIds([])
      alert(`批量删除完成！成功：${result.successCount}条，失败：${result.failCount}条`)
    },
  })

  const confirmMutation = useMutation({
    mutationFn: courseService.confirmCourse,
    onSuccess: () => {
      queryClient.invalidateQueries(['courses'])
      queryClient.invalidateQueries(['dashboard-stats'])
      alert('确认成功')
    },
    onError: (err) => {
      alert(buildConfirmFailureMessage(err).trim())
    },
  })

  const batchConfirmMutation = useMutation({
    mutationFn: (ids) => courseService.batchConfirm(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['courses'])
      setSelectedIds([])
      let message = `成功确认 ${data.confirmed_count} 个排课`
      if (data.already_confirmed_count > 0) {
        message += `，${data.already_confirmed_count} 个已确认`
      }
      alert(message)
    },
    onError: (err) => {
      alert(buildConfirmFailureMessage(err).trim())
    },
  })

  const batchCancelConfirmMutation = useMutation({
    mutationFn: (ids) => courseService.batchCancelConfirm(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['courses'])
      setSelectedIds([])
      let message = `成功取消确认 ${data.cancelled_count} 个排课`
      if (data.already_cancelled_count > 0) {
        message += `，${data.already_cancelled_count} 个未确认`
      }
      alert(message)
    },
  })

  const updateCourseMutation = useMutation({
    mutationFn: ({ id, data }) => courseService.updateCourse(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['courses'])
      alert('更新成功')
    },
  })

  // 处理函数
  const handleDelete = (id) => {
    if (window.confirm('确定要删除这个排课吗？')) {
      deleteMutation.mutate(id)
    }
  }

  const minHoursForReminder = 3
  const handleConfirm = async (course) => {
    const isConfirmed = course.is_confirmed
    if (!isConfirmed && course.student_id && course.course_id) {
      let remainingHours
      try {
        const month = new Date().toISOString().slice(0, 7)
        const stats = await statsService.getStats({
          month,
          student_id: course.student_id,
          course_id: course.course_id,
        })
        if (stats && stats.length > 0) {
          const stat = stats.find((s) => s.student_id === course.student_id && s.course_id === course.course_id)
          if (stat) remainingHours = stat.remaining_hours ?? 0
        }
      } catch (err) {
        console.error('查询剩余课时失败:', err)
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

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) {
      alert('请先选择要删除的排课')
      return
    }
    if (window.confirm(`确定要删除选中的 ${selectedIds.length} 条排课吗？`)) {
      batchDeleteMutation.mutate(selectedIds)
    }
  }

  const handleBatchConfirm = () => {
    const unconfirmedIds = validCourses
      .filter((c) => selectedIds.includes(c.id) && !c.is_confirmed)
      .map((c) => c.id)
    if (unconfirmedIds.length === 0) {
      alert('请先选择要确认的排课')
      return
    }
    if (window.confirm(`确定要批量确认 ${unconfirmedIds.length} 个排课吗？确认后将扣除剩余课时。`)) {
      batchConfirmMutation.mutate(unconfirmedIds)
    }
  }

  const handleBatchCancelConfirm = () => {
    const confirmedIds = validCourses
      .filter((c) => selectedIds.includes(c.id) && c.is_confirmed)
      .map((c) => c.id)
    if (confirmedIds.length === 0) {
      alert('请先选择要取消确认的排课')
      return
    }
    if (window.confirm(`确定要批量取消确认 ${confirmedIds.length} 个排课吗？取消后将恢复剩余课时。`)) {
      batchCancelConfirmMutation.mutate(confirmedIds)
    }
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const selectableIds = paginatedCourses
        .filter((c) => !c.is_confirmed || isAdmin)
        .map((c) => c.id)
      setSelectedIds(selectableIds)
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectCourse = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id)
      } else {
        return [...prev, id]
      }
    })
  }

  const handlePreviousWeek = () => {
    const weekNum = parseInt(weekFilter)
    if (weekNum > 1) {
      setWeekFilter((weekNum - 1).toString())
    } else {
      // 切换到上一月
      const [year, month] = monthFilter.split('-').map(Number)
      let prevMonth, prevYear
      if (month === 1) {
        prevMonth = 12
        prevYear = year - 1
      } else {
        prevMonth = month - 1
        prevYear = year
      }
      const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`
      setMonthFilter(prevMonthStr)
      const prevWeekOptions = getWeekRange(prevMonthStr)
      setWeekFilter(prevWeekOptions[prevWeekOptions.length - 1])
    }
  }

  const handleNextWeek = () => {
    const weekNum = parseInt(weekFilter)
    if (weekNum < weekOptions.length) {
      setWeekFilter((weekNum + 1).toString())
    } else {
      // 切换到下一月
      const [year, month] = monthFilter.split('-').map(Number)
      let nextMonth, nextYear
      if (month === 12) {
        nextMonth = 1
        nextYear = year + 1
      } else {
        nextMonth = month + 1
        nextYear = year
      }
      const nextMonthStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}`
      setMonthFilter(nextMonthStr)
      setWeekFilter('1')
    }
  }

  const handleToggleViewMode = () => {
    setViewMode((prev) => (prev === 'list' ? 'week' : 'list'))
  }

  // 截图：截取当前星期模式课表为图片（仅星期模式下可用）
  const handleScreenshot = () => {
    if (viewMode !== 'week') {
      alert('请先切换到星期模式后再截图')
      return
    }
    setScreenshotTarget({
      weekInfoLabel,
      monthFilter,
      weekFilter,
      courses: validCourses,
      timeSlots: timeSlots || [],
    })
  }

  const handleClearFilters = () => {
    setTeacherFilter('')
    setClassroomFilter('')
    setSubjectFilter('')
    setGradeFilter('')
    setStudentFilter('')
    setConfirmFilter('')
    setStatusFilter('')
  }

  const handleCreateCourse = (data) => {
    createMutation.mutate(data)
  }

  const handleEditCourse = (course) => {
    setEditingCourse(course)
    setShowEditModal(true)
  }

  const handleUpdateCourse = (data) => {
    if (!editingCourse) return
    updateCourseMutation.mutate({ id: editingCourse.id, data })
    setShowEditModal(false)
    setEditingCourse(null)
  }

  // 当月份改变时，重置周数为1
  useEffect(() => {
    if (weekFilter && parseInt(weekFilter) > weekOptions.length) {
      setWeekFilter('1')
    }
  }, [monthFilter, weekOptions.length])

  // 当视图模式或筛选条件改变时，重置到第一页
  useEffect(() => {
    setCurrentPage(1)
  }, [viewMode, teacherFilter, classroomFilter, subjectFilter, gradeFilter, studentFilter, confirmFilter, statusFilter])

  // 截图：screenshotTarget 设置后渲染隐藏表格，延迟后 html2canvas 截取并下载
  useEffect(() => {
    if (!screenshotTarget || !screenshotCaptureRef.current) return
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    const delay = isMobile ? 700 : 250
    const timer = setTimeout(() => {
      const el = screenshotCaptureRef.current
      if (!el) {
        setScreenshotTarget(null)
        return
      }
      const target = screenshotTarget
      el.style.visibility = 'visible'
      el.style.opacity = '1'
      el.style.zIndex = '99999'
      const doCapture = () => {
        if (isMobile) {
          void el.offsetHeight
          void el.scrollHeight
        }
        html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
          .then((canvas) => {
            const fileName = `排课表_${target.monthFilter}_第${target.weekFilter}周.png`
            const link = document.createElement('a')
            link.download = fileName
            link.href = canvas.toDataURL('image/png')
            link.click()
            canvas.toBlob((blob) => {
              if (blob && navigator.clipboard && navigator.clipboard.write) {
                navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                  .catch((clipErr) => console.warn('剪贴板写入失败:', clipErr))
              }
            }, 'image/png')
            setScreenshotTarget(null)
          })
          .catch((err) => {
            console.error('截图失败:', err)
            alert('截图失败，请重试')
            setScreenshotTarget(null)
          })
      }
      requestAnimationFrame(() => requestAnimationFrame(doCapture))
    }, delay)
    return () => clearTimeout(timer)
  }, [screenshotTarget])

  // 去排课：从 student-courses 点击「去排课」进入时，先预取学生课程数据再打开弹窗，避免弹窗内学生字段显示「加载中」
  const hasOpenedGoToScheduleRef = useRef(false)
  useEffect(() => {
    if (!fromGoToSchedule || hasOpenedGoToScheduleRef.current) return
    hasOpenedGoToScheduleRef.current = true
    queryClient
      .prefetchQuery({
        queryKey: ['paid-courses-need-scheduling'],
        queryFn: () => studentCoursesService.getPaidCoursesNeedScheduling(),
      })
      .then(() => {
        setRestrictStudentsToInitialStudent(true)
        setShowModal(true)
      })
      .catch(() => {
        setRestrictStudentsToInitialStudent(true)
        setShowModal(true)
      })
  }, [fromGoToSchedule, queryClient])

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
    if (coursesToCopy.length === 0) return
    
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
    sortedCourses.forEach((course, index) => {
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

  // 复制课程：从 student-courses 点击「复制课程」进入时，复制该学生当周的排课信息到剪贴板
  const hasCopiedCoursesRef = useRef(false)
  useEffect(() => {
    if (!copyCoursesFromUrl || !studentIdFromUrl || hasCopiedCoursesRef.current || isLoading || !validCourses.length) return
    
    // 确保只执行一次
    hasCopiedCoursesRef.current = true
    
    // 获取该学生当周的排课数据
    const studentCourses = validCourses.filter((c) => String(c.student_id) === String(studentIdFromUrl))
    
    if (studentCourses.length === 0) {
      // 延迟一下再检查，可能数据还在加载
      setTimeout(() => {
        const coursesNow = validCourses.filter((c) => String(c.student_id) === String(studentIdFromUrl))
        if (coursesNow.length === 0) {
          alert('该学生本周暂无排课信息')
        } else {
          copyCoursesToClipboard(coursesNow, weekInfoLabel, timeSlots)
        }
      }, 500)
      return
    }
    
    copyCoursesToClipboard(studentCourses, weekInfoLabel, timeSlots)
  }, [copyCoursesFromUrl, studentIdFromUrl, validCourses, isLoading, weekInfoLabel, copyCoursesToClipboard, timeSlots])

  if (isLoading) return <div className="loading">加载中...</div>
  if (error) return <div className="error">加载失败: {error?.response?.data?.error || error?.message}</div>

  return (
    <div className="courses-page" style={{ width: '100%' }}>
      <div className="page-header">
        <h1>排课管理</h1>
      </div>

      {/* 工具栏 */}
      <div className="toolbar" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-start', marginBottom: '15px' }}>
        <button className="btn btn-primary" onClick={() => { setRestrictStudentsToInitialStudent(false); setShowModal(true) }}>
          新增排课
        </button>
        <button className="btn btn-secondary" onClick={handlePreviousWeek} title="上一周">
          ← 上一周
        </button>
        <input
          type="month"
          value={monthFilter}
          onChange={(e) => {
            setMonthFilter(e.target.value)
            setWeekFilter('1')
          }}
          style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px' }}
        />
        <select
          value={weekFilter}
          onChange={(e) => setWeekFilter(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px' }}
        >
          {weekOptions.map((week) => (
            <option key={week} value={week}>
              第{week}周
            </option>
          ))}
        </select>
        <button className="btn btn-secondary" onClick={handleNextWeek} title="下一周">
          下一周 →
        </button>
        <button className="btn btn-secondary" onClick={handleToggleViewMode}>
          {viewMode === 'list' ? '切换到星期模式' : '切换到列表模式'}
        </button>
        {weekInfoLabel && <span className="week-info-label" style={{ marginLeft: '10px' }}>{weekInfoLabel}</span>}
        <button className="btn btn-secondary" onClick={() => setShowCopyModal(true)}>
          复制到指定周
        </button>
        <CopyToNextWeekButton
          courses={validCourses}
          selectedIds={selectedIds}
          monthFilter={monthFilter}
          weekFilter={weekFilter}
          onSuccess={(nextMonth, nextWeek) => {
            queryClient.invalidateQueries(['courses'])
            if (nextMonth != null && nextWeek != null) {
              setMonthFilter(nextMonth)
              setWeekFilter(nextWeek)
            }
          }}
        />
        <button className="btn btn-secondary" onClick={handleScreenshot} title="截取当前周课表（星期模式）为图片" style={{ background: '#28a745', color: '#fff', borderColor: '#28a745' }}>
          截图
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="filter-bar" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <label style={{ display: 'inline-block', margin: 0, fontWeight: 'bold' }}>筛选：</label>
        <select
          value={studentFilter}
          onChange={(e) => setStudentFilter(e.target.value)}
          style={{ display: 'inline-block', padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', width: 'auto', minWidth: '100px' }}
        >
          <option value="">全部学生</option>
          {students.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name || s.student_name || `学生${s.id}`}
            </option>
          ))}
        </select>
        <select
          value={teacherFilter}
          onChange={(e) => setTeacherFilter(e.target.value)}
          style={{ display: 'inline-block', padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', width: 'auto' }}
        >
          <option value="">全部老师</option>
          {filterOptions.teachers.map((teacher) => (
            <option key={teacher} value={teacher}>
              {teacher}
            </option>
          ))}
        </select>
        <select
          value={classroomFilter}
          onChange={(e) => setClassroomFilter(e.target.value)}
          style={{ display: 'inline-block', padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', width: 'auto' }}
        >
          <option value="">全部教室</option>
          {filterOptions.classrooms.map((classroom) => (
            <option key={classroom} value={classroom}>
              {classroom}
            </option>
          ))}
        </select>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          style={{ display: 'inline-block', padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', width: 'auto' }}
        >
          <option value="">全部科目</option>
          {filterOptions.subjects.map((subject) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
        </select>
        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          style={{ display: 'inline-block', padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', width: 'auto' }}
        >
          <option value="">全部年级</option>
          {filterOptions.grades.map((grade) => (
            <option key={grade} value={grade}>
              {grade}
            </option>
          ))}
        </select>
        <select
          value={confirmFilter}
          onChange={(e) => setConfirmFilter(e.target.value)}
          style={{ display: 'inline-block', padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', width: 'auto' }}
        >
          <option value="">全部确认</option>
          <option value="confirmed">已确认</option>
          <option value="unconfirmed">未确认</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ display: 'inline-block', padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', width: 'auto' }}
        >
          <option value="">全部状态</option>
          <option value="正常">正常</option>
          <option value="请假">请假</option>
          <option value="跑空">跑空</option>
        </select>
        <button className="btn btn-secondary" onClick={handleClearFilters} style={{ display: 'inline-block', padding: '6px 12px', width: 'auto' }}>
          清除筛选
        </button>
        <button className="btn btn-success" onClick={handleBatchConfirm} style={{ display: 'inline-block', padding: '6px 12px', width: 'auto', background: '#28a745', color: 'white' }}>
          批量确认
        </button>
        <button className="btn btn-secondary" onClick={handleBatchCancelConfirm} style={{ display: 'inline-block', padding: '6px 12px', width: 'auto', background: '#6c757d', color: 'white' }}>
          批量取消
        </button>
        <button className="btn btn-danger" onClick={handleBatchDelete} style={{ display: 'inline-block', padding: '6px 12px', width: 'auto' }}>
          批量删除
        </button>
      </div>

      {/* 列表视图 */}
      {viewMode === 'list' && (
        <>
          <div className="table-wrapper">
            <table className="data-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={selectedIds.length > 0 && paginatedCourses.filter((c) => !c.is_confirmed || isAdmin).every((c) => selectedIds.includes(c.id))} onChange={handleSelectAll} />
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
                <th>教室</th>
                <th>状态</th>
                <th>确认</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCourses.length > 0 ? (
                paginatedCourses.map((course, index) => {
                  const canEdit = !course.is_confirmed || isAdmin
                  return (
                    <tr key={course.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(course.id)}
                          onChange={() => handleSelectCourse(course.id)}
                          disabled={!canEdit}
                        />
                      </td>
                      <td>{(currentPage - 1) * pageSize + index + 1}</td>
                      <td>{course.student_name || '-'}</td>
                      <td>{course.grade || '-'}</td>
                      <td>{course.subject || '-'}</td>
                      <td>{course.course_name || '-'}</td>
                      <td>{course.teacher_name || '-'}</td>
                      <td>{course.course_date || '-'}</td>
                      <td>{course.weekday || '-'}</td>
                      <td>{course.time_slot || '-'}</td>
                      <td>{course.classroom || '-'}</td>
                      <td>
                        <span className={`status-badge status-${course.status === '正常' ? 'normal' : course.status === '请假' ? 'leave' : course.status === '跑空' ? 'empty' : 'deleted'}`}>
                          {course.status}
                        </span>
                      </td>
                      <td>
                        {course.is_confirmed ? (
                          <span className="status-badge status-normal">已确认</span>
                        ) : (
                          <span className="status-badge" style={{ background: '#fff3cd', color: '#856404' }}>
                            未确认
                          </span>
                        )}
                      </td>
                      <td>
                        {course.is_confirmed ? (
                          <button className="btn btn-secondary" onClick={() => handleConfirm(course)} style={{ marginRight: '8px', padding: '4px 8px', fontSize: '12px' }}>
                            已确认
                          </button>
                        ) : (
                          <button className="btn btn-success" onClick={() => handleConfirm(course)} style={{ marginRight: '8px', padding: '4px 8px', fontSize: '12px' }}>
                            确认
                          </button>
                        )}
                        {canEdit ? (
                          <>
                            <button className="btn btn-warning" onClick={() => handleEditCourse(course)} style={{ marginRight: '8px', padding: '4px 8px', fontSize: '12px' }}>
                              编辑
                            </button>
                            <button className="btn btn-danger" onClick={() => handleDelete(course.id)} style={{ padding: '4px 8px', fontSize: '12px' }}>
                              删除
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-warning" disabled title="无权限编辑已确认上课的排课，只有管理员可以编辑" style={{ marginRight: '8px', padding: '4px 8px', fontSize: '12px', opacity: 0.5, cursor: 'not-allowed' }}>
                              编辑
                            </button>
                            <button className="btn btn-danger" disabled title="无权限删除已确认上课的排课，只有管理员可以删除" style={{ padding: '4px 8px', fontSize: '12px', opacity: 0.5, cursor: 'not-allowed' }}>
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
                  <td colSpan="14" style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                    {weekInfoLabel ? `暂无排课数据（${weekInfoLabel}）` : '暂无排课数据'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          {/* 分页控件 */}
          {totalPages > 1 && (
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                上一页
              </button>
              <span style={{ padding: '0 15px' }}>
                第 {currentPage} 页，共 {totalPages} 页
              </span>
              <button className="btn btn-secondary" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                下一页
              </button>
            </div>
          )}
        </>
      )}

      {/* 星期视图 */}
      {viewMode === 'week' && (
        <WeekView
          courses={validCourses}
          timeSlots={timeSlots}
          monthFilter={monthFilter}
          weekFilter={weekFilter}
          onConfirm={handleConfirm}
          onDelete={handleDelete}
          onEdit={handleEditCourse}
          onSelect={handleSelectCourse}
          selectedIds={selectedIds}
          isAdmin={isAdmin}
        />
      )}

      {/* 截图用：隐藏的当周课表，结构与星期视图一致，仅用于 html2canvas 截取 */}
      {screenshotTarget && (() => {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
        const wrapStyle = {
          position: 'fixed',
          left: 0,
          top: 0,
          width: 'fit-content',
          padding: isMobile ? '8px' : '16px',
          background: '#fff',
          fontFamily: 'sans-serif',
          fontSize: isMobile ? '12px' : '14px',
          color: isMobile ? '#000' : undefined,
          visibility: 'hidden',
          pointerEvents: 'none',
          zIndex: -1,
          overflow: 'visible',
        }
        const thStyle = { padding: isMobile ? '4px 2px' : '10px', border: '1px solid #dee2e6', textAlign: 'center', color: isMobile ? '#000' : undefined }
        const tdStyle = { padding: isMobile ? '3px 2px' : '8px 6px', border: '1px solid #dee2e6', verticalAlign: 'top', color: isMobile ? '#000' : undefined, minWidth: isMobile ? '56px' : '120px' }
        const tdSlotStyle = { ...tdStyle, fontWeight: 600, background: '#f5f5f5', whiteSpace: 'nowrap' }
        const tdCourseStyle = { ...tdStyle, background: '#fffde7' }
        const weekRange = getCurrentWeekDateRange(screenshotTarget.monthFilter, screenshotTarget.weekFilter)
        const weekdayMap = { 0: '周日', 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六' }
        const dateMap = {}
        if (weekRange && weekRange.startDate && weekRange.endDate) {
          let d = new Date(weekRange.startDate)
          const endTime = weekRange.endDate.getTime()
          while (d.getTime() <= endTime) {
            dateMap[weekdayMap[d.getDay()]] = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            d.setDate(d.getDate() + 1)
          }
        }
        const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
        const sortedSlots = (screenshotTarget.timeSlots || []).slice().sort((a, b) => {
          const oa = a.sort_order != null ? a.sort_order : 999
          const ob = b.sort_order != null ? b.sort_order : 999
          return oa - ob || (a.name || '').localeCompare(b.name || '')
        })
        const tbodyRows = sortedSlots.length === 0
          ? (
              <tr>
                <td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: isMobile ? '#000' : '#666' }}>暂无时段或排课数据</td>
              </tr>
            )
          : sortedSlots.map((timeSlot) => {
              const timeSlotName = timeSlot.name || timeSlot
              return (
                <tr key={timeSlotName}>
                  <td style={{ ...tdSlotStyle, fontSize: isMobile ? '11px' : undefined, textAlign: 'center' }}>{timeSlotName}</td>
                  {weekdays.map((weekday) => {
                    const matched = (screenshotTarget.courses || []).filter(
                      (c) => (c.time_slot || '').trim() === timeSlotName.trim() && (c.weekday || '').trim() === weekday
                    )
                    if (matched.length === 0) {
                      return <td key={weekday} style={tdStyle} />
                    }
                    return (
                      <td key={weekday} style={tdCourseStyle}>
                        {matched.map((course, idx) => (
                          <div
                            key={course.id || idx}
                            style={{
                              border: '1px solid #e6e0a0',
                              borderRadius: '4px',
                              padding: isMobile ? '2px 4px' : '4px 6px',
                              marginBottom: idx < matched.length - 1 ? (isMobile ? 2 : 4) : 0,
                              fontSize: isMobile ? '11px' : '13px',
                              background: '#fffde7',
                              color: isMobile ? '#000' : undefined,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {[course.course_name || course.subject, course.student_name, course.teacher_name, course.classroom].filter(Boolean).join(' ')}
                          </div>
                        ))}
                      </td>
                    )
                  })}
                </tr>
              )
            })
        return (
          <div ref={screenshotCaptureRef} style={wrapStyle}>
            <div style={{ marginBottom: isMobile ? '6px' : '12px', fontWeight: 600, fontSize: isMobile ? '14px' : '16px', textAlign: 'center', color: isMobile ? '#000' : undefined }}>
              {screenshotTarget.weekInfoLabel}
            </div>
            <table style={{ borderCollapse: 'collapse', border: '1px solid #dee2e6', tableLayout: 'auto', width: 'auto' }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  <th style={{ ...thStyle, minWidth: isMobile ? '48px' : '80px' }}>时段</th>
                  {weekdays.map((weekday) => {
                    const dateStr = dateMap[weekday] || ''
                    const dateDisplay = dateStr ? `${dateStr.split('-')[1]}-${dateStr.split('-')[2]}` : ''
                    return (
                      <th key={weekday} style={{ ...thStyle, minWidth: isMobile ? '56px' : '120px' }}>
                        <div>{weekday}</div>
                        {dateDisplay && <div style={{ marginTop: '4px', fontSize: isMobile ? '10px' : '12px', color: isMobile ? '#000' : '#666' }}>{dateDisplay}</div>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>{tbodyRows}</tbody>
            </table>
          </div>
        )
      })()}

      {/* 新增排课模态框 */}
      {showModal && (
        <AddCourseModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          students={students}
          teachers={teachers}
          courses={courseList}
          timeSlots={timeSlots}
          classrooms={classrooms}
          monthFilter={monthFilter}
          weekFilter={weekFilter}
          onSubmit={handleCreateCourse}
          initialStudentId={fromGoToSchedule ? studentIdFromUrl : undefined}
          initialCourseId={fromGoToSchedule ? courseIdFromUrl : undefined}
          restrictStudentsToInitialStudent={restrictStudentsToInitialStudent}
        />
      )}

      {/* 复制到指定周模态框 */}
      {showCopyModal && (
        <CopyToSpecifiedWeekModal
          isOpen={showCopyModal}
          onClose={() => setShowCopyModal(false)}
          courses={validCourses}
          selectedIds={selectedIds}
          currentMonth={monthFilter}
          currentWeek={weekFilter}
          onSuccess={(targetMonth, targetWeek) => {
            queryClient.invalidateQueries(['courses'])
            setShowCopyModal(false)
            // 跳转到目标周
            if (targetMonth && targetWeek) {
              setMonthFilter(targetMonth)
              setWeekFilter(targetWeek)
            }
          }}
        />
      )}

      {/* 编辑排课模态框 */}
      {showEditModal && editingCourse && (
        <EditCourseModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false)
            setEditingCourse(null)
          }}
          course={editingCourse}
          onSubmit={handleUpdateCourse}
        />
      )}
    </div>
  )
}

// 星期视图组件
const WeekView = ({ courses, timeSlots, monthFilter, weekFilter, onConfirm, onDelete, onEdit, onSelect, selectedIds, isAdmin }) => {
  // 计算当前周的日期映射（第一周 = 当月第一个周一，周一到周日；日期用实际年月日）
  const dateMap = useMemo(() => {
    if (!monthFilter || !weekFilter) return {}

    const [year, month] = monthFilter.split('-').map(Number)
    const weekNum = parseInt(weekFilter)
    const firstMonday = getFirstMondayOfMonth(year, month)
    const weekStart = new Date(firstMonday)
    weekStart.setDate(weekStart.getDate() + (weekNum - 1) * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    const weekdayMap = { 0: '周日', 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六' }
    const map = {}
    let currentDate = new Date(weekStart)
    const endTime = weekEnd.getTime()

    while (currentDate.getTime() <= endTime) {
      const weekday = weekdayMap[currentDate.getDay()]
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
      map[weekday] = dateStr
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return map
  }, [monthFilter, weekFilter])

  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

  // 按时段排序
  const sortedTimeSlots = useMemo(() => {
    return [...timeSlots].sort((a, b) => {
      const orderA = a.sort_order !== null && a.sort_order !== undefined ? a.sort_order : 999
      const orderB = b.sort_order !== null && b.sort_order !== undefined ? b.sort_order : 999
      if (orderA !== orderB) {
        return orderA - orderB
      }
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [timeSlots])

  return (
    <div className="table-wrapper">
      <table className="data-table" id="week-view-table" style={{ tableLayout: 'auto', minWidth: '100%' }}>
      <thead>
        <tr>
          <th style={{ minWidth: '100px' }}>时段</th>
          {weekdays.map((weekday) => {
            const dateStr = dateMap[weekday] || ''
            const dateDisplay = dateStr ? (
              <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#666' }}>
                {dateStr.split('-')[1]}-{dateStr.split('-')[2]}
              </span>
            ) : null
            return (
              <th key={weekday} style={{ minWidth: '200px' }}>
                {weekday}
                {dateDisplay && <br />}
                {dateDisplay}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {sortedTimeSlots.length === 0 && courses.length === 0 ? (
          <tr>
            <td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
              <div style={{ fontSize: '14px' }}>暂无排课数据</div>
              <div style={{ fontSize: '12px', marginTop: '8px', color: '#999' }}>提示：请检查筛选条件，或尝试切换到其他周查看</div>
            </td>
          </tr>
        ) : sortedTimeSlots.length === 0 ? (
          <tr>
            <td colSpan="8" style={{ textAlign: 'center' }}>请先设置时段信息</td>
          </tr>
        ) : (
          sortedTimeSlots.map((timeSlot) => {
            const timeSlotName = timeSlot.name || timeSlot
            return (
              <tr key={timeSlotName}>
                <td style={{ fontWeight: 'bold', background: '#f5f5f5' }}>{timeSlotName}</td>
                {weekdays.map((weekday) => {
                  const matchedCourses = courses.filter((c) => {
                    const cTimeSlot = (c.time_slot || '').trim()
                    const cWeekday = (c.weekday || '').trim()
                    return cTimeSlot === timeSlotName.trim() && cWeekday === weekday
                  })

                  if (matchedCourses.length === 0) {
                    return <td key={weekday} style={{ padding: '4px', verticalAlign: 'top', minWidth: '200px' }}></td>
                  }

                  return (
                    <td key={weekday} style={{ padding: '4px', verticalAlign: 'top', minWidth: '200px' }}>
                      {matchedCourses.map((course, index) => {
                        const statusClass = course.status === '正常' ? 'normal' : course.status === '请假' ? 'leave' : course.status === '跑空' ? 'empty' : 'deleted'
                        const marginBottom = index < matchedCourses.length - 1 ? '6px' : '0'
                        const confirmedStyle = course.is_confirmed
                          ? { background: '#f5f5f5', opacity: 0.8, color: '#666' }
                          : { background: 'white' }
                        const canEdit = !course.is_confirmed || isAdmin

                        const courseName = course.course_name || course.subject || ''
                        const studentName = course.student_name || ''
                        const teacherName = course.teacher_name || ''
                        const classroom = course.classroom || ''

                        const displayText = [courseName, studentName, teacherName, classroom].filter((item) => item).join(' ')

                        return (
                          <div
                            key={course.id}
                            style={{
                              border: '1px solid #ddd',
                              borderRadius: '3px',
                              padding: '2px 4px',
                              marginBottom,
                              ...confirmedStyle,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', lineHeight: 1.3, wordBreak: 'break-all', whiteSpace: 'normal', flex: '1 1 auto', minWidth: 0 }} title={displayText}>
                                {displayText}
                              </span>
                              <span className={`status-badge status-${statusClass}`} style={{ fontSize: '9px', padding: '1px 3px', flexShrink: 0 }}>
                                {course.status}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {course.is_confirmed ? (
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => onConfirm(course)}
                                  style={{ padding: '1px 4px', fontSize: '10px', background: '#6c757d', color: 'white' }}
                                >
                                  已确认
                                </button>
                              ) : (
                                <button
                                  className="btn btn-success"
                                  onClick={() => onConfirm(course)}
                                  style={{ padding: '1px 4px', fontSize: '10px', background: '#28a745', color: 'white' }}
                                >
                                  确认
                                </button>
                              )}
                              <input
                                type="checkbox"
                                className="course-checkbox"
                                checked={selectedIds.includes(course.id)}
                                onChange={() => onSelect(course.id)}
                                disabled={!canEdit}
                                style={{ margin: 0 }}
                              />
                              {canEdit ? (
                                <>
                                  <button
                                    className="btn btn-warning"
                                    onClick={() => onEdit(course)}
                                    style={{ padding: '1px 4px', fontSize: '10px' }}
                                  >
                                    编辑
                                  </button>
                                  <button className="btn btn-danger" onClick={() => onDelete(course.id)} style={{ padding: '1px 4px', fontSize: '10px' }}>
                                    删除
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="btn btn-warning"
                                    disabled
                                    title="无权限编辑已确认上课的排课，只有管理员可以编辑"
                                    style={{ padding: '1px 4px', fontSize: '10px', opacity: 0.5, cursor: 'not-allowed' }}
                                  >
                                    编辑
                                  </button>
                                  <button
                                    className="btn btn-danger"
                                    disabled
                                    title="无权限删除已确认上课的排课，只有管理员可以删除"
                                    style={{ padding: '1px 4px', fontSize: '10px', opacity: 0.5, cursor: 'not-allowed' }}
                                  >
                                    删除
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </td>
                  )
                })}
              </tr>
            )
          })
        )}
      </tbody>
    </table>
    </div>
  )
}

// 复制到下一周按钮组件
const CopyToNextWeekButton = ({ courses, selectedIds, monthFilter, weekFilter, onSuccess }) => {
  const [isLoading, setIsLoading] = useState(false)

  const handleCopy = async () => {
    if (courses.length === 0) {
      alert('当前周没有排课数据')
      return
    }

    // 计算下一周的日期范围
    const [year, month] = monthFilter.split('-').map(Number)
    const weekNum = parseInt(weekFilter)
    const firstDay = new Date(year, month - 1, 1)
    const firstDayWeekday = firstDay.getDay()
    const lastDay = new Date(year, month, 0)
    const monthEnd = lastDay.getDate()

    let nextWeekMonth, nextWeekNum
    if (weekNum < getWeekRange(monthFilter).length) {
      nextWeekMonth = monthFilter
      nextWeekNum = weekNum + 1
    } else {
      // 下一周在下一个月
      if (month === 12) {
        nextWeekMonth = `${year + 1}-01`
      } else {
        nextWeekMonth = `${year}-${String(month + 1).padStart(2, '0')}`
      }
      nextWeekNum = 1
    }

    // 获取当前周和目标周的日期范围
    const currentWeekRange = getCurrentWeekDateRange(monthFilter, weekNum)
    const nextWeekRange = getCurrentWeekDateRange(nextWeekMonth, nextWeekNum)

    if (!currentWeekRange || !nextWeekRange) {
      alert('无法计算下一周的日期范围')
      return
    }

    // 创建日期映射（按星期匹配）
    const dateMap = new Map()
    const formatDate = (date) => {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }

    let currentDate = new Date(currentWeekRange.startDate)
    const currentEndTime = currentWeekRange.endDate.getTime()
    const nextStartTime = nextWeekRange.startDate.getTime()
    const nextEndTime = nextWeekRange.endDate.getTime()

    while (currentDate.getTime() <= currentEndTime) {
      const currentWeekday = currentDate.getDay()
      const currentDateStr = formatDate(currentDate)

      let targetDate = null
      let checkDate = new Date(nextWeekRange.startDate)

      while (checkDate.getTime() <= nextEndTime) {
        if (checkDate.getDay() === currentWeekday) {
          targetDate = new Date(checkDate)
          break
        }
        checkDate.setDate(checkDate.getDate() + 1)
      }

      if (targetDate) {
        const targetDateStr = formatDate(targetDate)
        dateMap.set(currentDateStr, targetDateStr)
      }

      currentDate.setDate(currentDate.getDate() + 1)
    }

    // 过滤要复制的课程
    let coursesToCopy = courses
    if (selectedIds.length > 0) {
      coursesToCopy = courses.filter((c) => selectedIds.includes(c.id))
    }

    // 检查重复
    const targetWeekCourses = await courseService.getCourses({
      month: nextWeekMonth,
      week: nextWeekNum.toString(),
    })

    const targetWeekCourseKeys = new Set()
    targetWeekCourses.forEach((course) => {
      const dateStr = course.course_date
      const key = `${dateStr}|${course.student_name}|${course.subject}|${course.time_slot || ''}`
      targetWeekCourseKeys.add(key)
    })

    const processedKeys = new Set()
    coursesToCopy = coursesToCopy.filter((course) => {
      const currentDateStr = course.course_date
      const targetDateStr = dateMap.get(currentDateStr)

      if (!targetDateStr) return false

      const key = `${targetDateStr}|${course.student_name}|${course.subject}|${course.time_slot || ''}`

      if (targetWeekCourseKeys.has(key) || processedKeys.has(key)) {
        return false
      }

      processedKeys.add(key)
      return true
    })

    if (coursesToCopy.length === 0) {
      alert('没有可复制的排课记录。\n\n所有排课记录都已存在于下一周，或没有匹配的日期。')
      return
    }

    if (!window.confirm(`确定要将 ${coursesToCopy.length} 条排课复制到下一周吗？`)) {
      return
    }

    setIsLoading(true)

    try {
      let successCount = 0
      let failCount = 0
      const failMessages = []

      const promises = coursesToCopy.map((course) => {
        const currentDateStr = course.course_date
        const targetDateStr = dateMap.get(currentDateStr)

        if (!targetDateStr) {
          failMessages.push(`课程日期 ${currentDateStr} 没有找到对应的下一周日期`)
          failCount++
          return Promise.resolve()
        }

        const newCourseData = {
          student_id: course.student_id,
          teacher_id: course.teacher_id,
          course_date: targetDateStr,
          subject: course.subject,
          time_slot: course.time_slot || '',
          classroom: course.classroom || '',
          course_id: course.course_id || null,
        }

        return courseService
          .createCourse(newCourseData)
          .then((result) => {
            if (result.id) {
              successCount++
            } else {
              failMessages.push(`${currentDateStr} -> ${targetDateStr}: 返回结果异常`)
              failCount++
            }
          })
          .catch((err) => {
            const errorMsg = err?.response?.data?.error || err?.message || '未知错误'
            failMessages.push(`${currentDateStr} -> ${targetDateStr}: ${errorMsg}`)
            failCount++
          })
      })

      await Promise.all(promises)

      let message = `复制完成！成功：${successCount}条，失败：${failCount}条`
      if (failMessages.length > 0) {
        message += '\n\n失败详情：\n' + failMessages.slice(0, 5).join('\n')
        if (failMessages.length > 5) {
          message += `\n... 还有 ${failMessages.length - 5} 条错误`
        }
      }
      alert(message)

      onSuccess(nextWeekMonth, nextWeekNum.toString())
    } catch (err) {
      console.error('复制失败:', err)
      alert('复制失败：' + (err?.message || '未知错误'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button className="btn btn-secondary" onClick={handleCopy} disabled={isLoading} style={{ marginLeft: 0, marginRight: 0 }}>
      {isLoading ? '复制中...' : '复制到下一周'}
    </button>
  )
}

// 辅助：获取当月第一个周一（每月第一周从当月的第一个周一开始算起）
function getFirstMondayOfMonth(year, monthNum) {
  const firstDay = new Date(year, monthNum - 1, 1)
  const dayOfWeek = firstDay.getDay()
  const offset = (8 - dayOfWeek) % 7
  return new Date(year, monthNum - 1, 1 + offset)
}

// 辅助函数：计算指定月份和周数的日期范围（第一周 = 当月第一个周一，周一到周日）
function getCurrentWeekDateRange(monthFilter, weekFilter) {
  if (!monthFilter || !weekFilter) return null

  const [year, month] = monthFilter.split('-').map(Number)
  const weekNum = parseInt(weekFilter)
  const firstMonday = getFirstMondayOfMonth(year, month)
  const startDate = new Date(firstMonday)
  startDate.setDate(startDate.getDate() + (weekNum - 1) * 7)
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 6)
  return { startDate, endDate, year, month }
}

// 辅助函数：计算月份周数范围（第一周 = 当月第一个周一所在周）
function getWeekRange(month) {
  const [year, monthNum] = month.split('-').map(Number)
  const firstMonday = getFirstMondayOfMonth(year, monthNum)
  const lastDay = new Date(year, monthNum, 0)
  const diffMs = lastDay.getTime() - firstMonday.getTime()
  const maxWeeks = Math.max(1, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1)
  return Array.from({ length: maxWeeks }, (_, i) => (i + 1).toString())
}

// 复制到指定周模态框组件
const CopyToSpecifiedWeekModal = ({ isOpen, onClose, courses, selectedIds, currentMonth, currentWeek, onSuccess }) => {
  const [targetMonth, setTargetMonth] = useState(new Date().toISOString().slice(0, 7))
  const [targetWeek, setTargetWeek] = useState('1')
  const [isLoading, setIsLoading] = useState(false)

  const targetWeekOptions = getWeekRange(targetMonth)

  useEffect(() => {
    if (targetWeek && parseInt(targetWeek) > targetWeekOptions.length) {
      setTargetWeek('1')
    }
  }, [targetMonth, targetWeekOptions.length])

  const handleCopy = async () => {
    if (courses.length === 0) {
      alert('当前周没有排课数据')
      return
    }

    const currentWeekRange = getCurrentWeekDateRange(currentMonth, currentWeek)
    const targetWeekRange = getCurrentWeekDateRange(targetMonth, targetWeek)

    if (!currentWeekRange || !targetWeekRange) {
      alert(`目标月份 ${targetMonth} 的第${targetWeek}周不存在，请重新选择`)
      return
    }

    // 创建日期映射
    const dateMap = new Map()
    const formatDate = (date) => {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }

    let currentDate = new Date(currentWeekRange.startDate)
    const currentEndTime = currentWeekRange.endDate.getTime()
    const targetStartTime = targetWeekRange.startDate.getTime()
    const targetEndTime = targetWeekRange.endDate.getTime()

    while (currentDate.getTime() <= currentEndTime) {
      const currentWeekday = currentDate.getDay()
      const currentDateStr = formatDate(currentDate)

      let targetDate = null
      let checkDate = new Date(targetWeekRange.startDate)

      while (checkDate.getTime() <= targetEndTime) {
        if (checkDate.getDay() === currentWeekday) {
          targetDate = new Date(checkDate)
          break
        }
        checkDate.setDate(checkDate.getDate() + 1)
      }

      if (targetDate) {
        const targetDateStr = formatDate(targetDate)
        dateMap.set(currentDateStr, targetDateStr)
      }

      currentDate.setDate(currentDate.getDate() + 1)
    }

    // 过滤要复制的课程
    let coursesToCopy = courses
    if (selectedIds.length > 0) {
      coursesToCopy = courses.filter((c) => selectedIds.includes(c.id))
    }

    // 检查重复
    const targetWeekCourses = await courseService.getCourses({
      month: targetMonth,
      week: targetWeek,
    })

    const targetWeekCourseKeys = new Set()
    targetWeekCourses.forEach((course) => {
      const dateStr = course.course_date
      const key = `${dateStr}|${course.student_name}|${course.subject}|${course.time_slot || ''}`
      targetWeekCourseKeys.add(key)
    })

    const processedKeys = new Set()
    coursesToCopy = coursesToCopy.filter((course) => {
      const currentDateStr = course.course_date
      const targetDateStr = dateMap.get(currentDateStr)

      if (!targetDateStr) return false

      const key = `${targetDateStr}|${course.student_name}|${course.subject}|${course.time_slot || ''}`

      if (targetWeekCourseKeys.has(key) || processedKeys.has(key)) {
        return false
      }

      processedKeys.add(key)
      return true
    })

    if (coursesToCopy.length === 0) {
      alert('没有可复制的排课记录。\n\n所有排课记录都已存在于目标周，或没有匹配的日期。')
      return
    }

    if (!window.confirm(`确定要将 ${coursesToCopy.length} 条排课复制到${targetWeekRange.year}年${targetWeekRange.month}月第${targetWeek}周吗？`)) {
      return
    }

    setIsLoading(true)

    try {
      let successCount = 0
      let failCount = 0
      const failMessages = []

      const promises = coursesToCopy.map((course) => {
        const currentDateStr = course.course_date
        const targetDateStr = dateMap.get(currentDateStr)

        if (!targetDateStr) {
          failMessages.push(`课程日期 ${currentDateStr} 没有找到对应的目标周日期`)
          failCount++
          return Promise.resolve()
        }

        const newCourseData = {
          student_id: course.student_id,
          teacher_id: course.teacher_id,
          course_date: targetDateStr,
          subject: course.subject,
          time_slot: course.time_slot || '',
          classroom: course.classroom || '',
          course_id: course.course_id || null,
        }

        return courseService
          .createCourse(newCourseData)
          .then((result) => {
            if (result.id) {
              successCount++
            } else {
              failMessages.push(`${currentDateStr} -> ${targetDateStr}: 返回结果异常`)
              failCount++
            }
          })
          .catch((err) => {
            const errorMsg = err?.response?.data?.error || err?.message || '未知错误'
            failMessages.push(`${currentDateStr} -> ${targetDateStr}: ${errorMsg}`)
            failCount++
          })
      })

      await Promise.all(promises)

      let message = `复制完成！成功：${successCount}条，失败：${failCount}条`
      if (failMessages.length > 0) {
        message += '\n\n失败详情：\n' + failMessages.slice(0, 5).join('\n')
        if (failMessages.length > 5) {
          message += `\n... 还有 ${failMessages.length - 5} 条错误`
        }
      }
      alert(message)

      onSuccess(targetMonth, targetWeek)
    } catch (err) {
      console.error('复制失败:', err)
      alert('复制失败：' + (err?.message || '未知错误'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="复制到指定周">
      <div style={{ marginTop: '20px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>目标月份：</label>
          <input
            type="month"
            value={targetMonth}
            onChange={(e) => {
              setTargetMonth(e.target.value)
              setTargetWeek('1')
            }}
            style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
        </div>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>目标周数：</label>
          <select
            value={targetWeek}
            onChange={(e) => setTargetWeek(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
          >
            {targetWeekOptions.map((week) => (
              <option key={week} value={week}>
                第{week}周
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={handleCopy} disabled={isLoading}>
            {isLoading ? '复制中...' : '确定'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// 新增排课模态框组件（包含冲突检测、剩余课时显示等功能）
const AddCourseModal = ({ isOpen, onClose, students, teachers, courses, timeSlots, classrooms, monthFilter, weekFilter, onSubmit, initialStudentId, initialCourseId, restrictStudentsToInitialStudent }) => {
  const [formData, setFormData] = useState({
    student_id: '',
    course_id: '',
    subject: '',
    teacher_id: '',
    weekday: '',
    course_date: '',
    time_slot: '',
    classroom: '',
  })
  const [conflicts, setConflicts] = useState([])
  const [remainingHours, setRemainingHours] = useState(0)

  // 获取已缴费需要排课的学生课程列表
  const { data: paidCoursesData } = useQuery({
    queryKey: ['paid-courses-need-scheduling'],
    queryFn: () => studentCoursesService.getPaidCoursesNeedScheduling(),
    enabled: isOpen,
  })

  const paidCourses = paidCoursesData || []

  // 去排课进入时预填学生、课程，并加载默认时段/星期
  useEffect(() => {
    if (!isOpen || !initialStudentId || !initialCourseId || paidCourses.length === 0) return
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
          teacher_id: defaultSchedule.default_teacher_id != null ? String(defaultSchedule.default_teacher_id) : prev.teacher_id,
        }))
      })
      .catch(() => {})
  }, [isOpen, initialStudentId, initialCourseId, paidCourses])

  // 从已缴费课程中提取唯一的学生：去排课进入时只显示对应学生（不受标记影响）；否则只显示未标记学生
  const availableStudents = useMemo(() => {
    const studentMap = {}
    paidCourses.forEach((course) => {
      if (restrictStudentsToInitialStudent && initialStudentId) {
        if (String(course.student_id) !== String(initialStudentId)) return
      } else if (course.excluded_from_scheduling === true) return
      const studentId = course.student_id
      if (!studentMap[studentId]) {
        studentMap[studentId] = {
          id: studentId,
          name: course.student_name,
          grade: course.grade || '',
        }
      }
    })
    return Object.values(studentMap).sort((a, b) => a.name.localeCompare(b.name))
  }, [paidCourses, restrictStudentsToInitialStudent, initialStudentId])

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

  // 计算当前周的日期范围，用于限制日期选择器
  const weekDateRange = useMemo(() => {
    return getCurrentWeekDateRange(monthFilter, weekFilter)
  }, [monthFilter, weekFilter])

  const dateMin = weekDateRange ? formatDate(weekDateRange.startDate) : ''
  const dateMax = weekDateRange ? formatDate(weekDateRange.endDate) : ''

  // 更新剩余课时显示
  useEffect(() => {
    if (!formData.student_id) {
      setRemainingHours(0)
      return
    }

    let hours = 0
    if (formData.course_id) {
      const course = studentPaidCourses.find((c) => c.course_id === parseInt(formData.course_id))
      hours = course ? course.remaining_hours || 0 : 0
    } else {
      studentPaidCourses.forEach((c) => {
        hours += c.remaining_hours || 0
      })
    }
    setRemainingHours(hours)
  }, [formData.student_id, formData.course_id, studentPaidCourses])

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

      // 加载默认排课设置（时段、星期、默认上课老师）
      if (courseId && formData.student_id) {
        try {
          const defaultSchedule = await studentCoursesService.getDefaultSchedule(
            parseInt(formData.student_id),
            parseInt(courseId)
          )
          setFormData((prev) => {
            const next = { ...prev }
            if (defaultSchedule.default_time_slot) next.time_slot = defaultSchedule.default_time_slot
            if (defaultSchedule.default_weekday) next.weekday = defaultSchedule.default_weekday
            if (defaultSchedule.default_teacher_id != null) next.teacher_id = String(defaultSchedule.default_teacher_id)
            return next
          })
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

    // 根据星期更新日期（找到当前周内对应的日期）
    if (weekDateRange && weekday) {
      const weekdayMap = { 周日: 0, 周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6 }
      const targetDay = weekdayMap[weekday]
      let currentDate = new Date(weekDateRange.startDate)
      const endTime = weekDateRange.endDate.getTime()

      while (currentDate.getTime() <= endTime) {
        if (currentDate.getDay() === targetDay) {
          setFormData((prev) => ({
            ...prev,
            course_date: formatDate(currentDate),
          }))
          break
        }
        currentDate.setDate(currentDate.getDate() + 1)
      }
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    if (conflicts.length > 0) {
      alert('存在课程冲突，无法保存。请修改排课信息后再试。')
      return
    }

    onSubmit({
      student_id: parseInt(formData.student_id),
      teacher_id: parseInt(formData.teacher_id),
      course_id: formData.course_id ? parseInt(formData.course_id) : null,
      subject: formData.subject,
      weekday: formData.weekday || null,
      course_date: formData.course_date,
      time_slot: formData.time_slot || null,
      classroom: formData.classroom || null,
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="新增排课">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>学生 *</label>
          {restrictStudentsToInitialStudent ? (
            <>
              <div style={{ padding: '8px 12px', background: '#f5f5f5', borderRadius: '4px', marginBottom: '4px' }}>
                {(() => {
                  const student = availableStudents.find((s) => String(s.id) === String(formData.student_id))
                  return student ? (
                    <span>{student.name} {student.grade ? `（${student.grade}）` : ''} <span style={{ color: '#666', fontSize: '12px' }}>（学生课程页所选学生）</span></span>
                  ) : (
                    <span style={{ color: '#999' }}>{formData.student_id ? '加载中...' : '--'}</span>
                  )
                })()}
              </div>
              <input type="hidden" name="student_id" value={formData.student_id} />
            </>
          ) : (
            <select
              name="student_id"
              value={formData.student_id}
              onChange={(e) => handleStudentChange(e.target.value)}
              required
            >
              <option value="">-- 请选择学生 --</option>
              {availableStudents.map((student) => (
                <option key={student.id} value={String(student.id)}>
                  {student.name} {student.grade ? `(${student.grade})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        <div id="remaining-hours-display" style={{ margin: '-10px 0 15px 0', padding: '8px', background: '#f5f5f5', borderRadius: '4px', fontSize: '14px' }}>
          {formData.student_id ? (
            <span>
              剩余课时：<strong>{remainingHours.toFixed(1)}</strong> 小时
            </span>
          ) : (
            <span>请选择学生查看剩余课时</span>
          )}
        </div>
        <div className="form-group">
            <label>课程（已报名课程）</label>
            <select
              name="course_id"
              value={formData.course_id}
              onChange={(e) => handleCourseChange(e.target.value)}
            >
              <option value="">-- 请选择课程（可选）--</option>
              {filteredCourses.map((c) => (
                <option key={c.course_id} value={c.course_id}>
                  {c.course_name} ({c.subject}) - 剩余 {c.remaining_hours.toFixed(1)} 小时
                </option>
              ))}
            </select>
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
            {subjects.map((subj) => (
              <option key={subj} value={subj}>
                {subj}
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
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name} {teacher.subject ? `(${teacher.subject})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>星期 *</label>
          <select
            name="weekday"
            value={formData.weekday}
            onChange={(e) => handleWeekdayChange(e.target.value)}
            required
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
            min={dateMin}
            max={dateMax}
            required
          />
        </div>
        <div className="form-group">
          <label>时段 *</label>
          <select
            name="time_slot"
            value={formData.time_slot}
            onChange={(e) => setFormData({ ...formData, time_slot: e.target.value })}
            required
          >
            <option value="">-- 请选择时段 --</option>
            {timeSlots.map((slot) => (
              <option key={slot.id} value={slot.name}>
                {slot.name} {slot.start_time && slot.end_time ? `(${slot.start_time}-${slot.end_time})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>教室 *</label>
          <select
            name="classroom"
            value={formData.classroom}
            onChange={(e) => setFormData({ ...formData, classroom: e.target.value })}
            required
          >
            <option value="">-- 请选择教室 --</option>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.name}>
                {classroom.name}
              </option>
            ))}
          </select>
        </div>
        {conflicts.length > 0 && (
          <div id="conflict-warning" style={{ display: 'block', margin: '15px 0', padding: '12px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', color: '#856404' }}>
            <strong>⚠️ 检测到课程冲突：</strong>
            <ul id="conflict-list" style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
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
          <button type="submit" className="btn btn-primary" disabled={conflicts.length > 0}>
            保存
          </button>
        </div>
      </form>
    </Modal>
  )
}

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 编辑排课模态框组件（与 Flask 实现一致：只允许编辑状态）
const EditCourseModal = ({ isOpen, onClose, course, onSubmit }) => {
  const [status, setStatus] = useState(course?.status || '正常')

  // 当模态框打开或课程数据变化时，重置状态
  useEffect(() => {
    if (isOpen && course) {
      setStatus(course.status || '正常')
    }
  }, [isOpen, course])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ status })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="编辑排课">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>状态 *</label>
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
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

export default Courses
