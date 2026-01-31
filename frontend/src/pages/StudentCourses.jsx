import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import html2canvas from 'html2canvas'
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
  // 筛选：是否标记、是否复制、是否截图
  const [filterMarked, setFilterMarked] = useState('all')   // 'all' | 'marked' | 'unmarked'
  const [filterCopied, setFilterCopied] = useState('all') // 'all' | 'copied' | 'not_copied'
  const [filterScreenshot, setFilterScreenshot] = useState('all') // 'all' | 'screenshot' | 'not_screenshot'
  const [batchOperating, setBatchOperating] = useState(false)
  const [screenshotStudents, setScreenshotStudents] = useState(new Set()) // 已截图的学生ID
  const [screenshotTarget, setScreenshotTarget] = useState(null) // 待截图的 { studentId, studentName, courses, weekInfoLabel, monthFilter, weekFilter }
  const screenshotCaptureRef = useRef(null)
  const copyCacheRef = useRef(Object.create(null)) // 手机端：缓存 { text, count }，下次点击时同步复制（在用户手势内）
  const [copyFallbackModal, setCopyFallbackModal] = useState(null) // 复制失败时显示 { text, count }，用户可手动复制或点击按钮重试
  const SCHEDULED_STORAGE_KEY = 'studentCoursesScheduled'
  const [scheduledRows, setScheduledRows] = useState(() => {
    try {
      const raw = sessionStorage.getItem(SCHEDULED_STORAGE_KEY)
      if (raw) {
        const arr = JSON.parse(raw)
        return new Set(Array.isArray(arr) ? arr : [])
      }
    } catch (_) {}
    return new Set()
  }) // 已排课的行：Set of "studentId-courseId"
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
      if (filterScreenshot === 'screenshot' && !screenshotStudents.has(course.student_id)) return false
      if (filterScreenshot === 'not_screenshot' && screenshotStudents.has(course.student_id)) return false
      return true
    })
  }, [courses, filterMarked, filterCopied, filterScreenshot, copiedStudents, screenshotStudents])

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

  // 预取当前页学生的当周排课数据，便于「复制」时一次点击即可同步复制（在用户手势内）
  const studentWeekCoursesKey = (month, week, studentId) => ['student-week-courses', month, week, studentId]
  useEffect(() => {
    if (!paginatedCourses.length) return
    const today = new Date()
    const month = today.toISOString().slice(0, 7)
    const week = getWeekInMonth(today).toString()
    const studentIds = [...new Set(paginatedCourses.map((c) => c.student_id))]
    studentIds.forEach((sid) => {
      queryClient.prefetchQuery({
        queryKey: studentWeekCoursesKey(month, week, sid),
        queryFn: () => courseService.getCourses({ month, week, student_id: sid }),
        staleTime: 2 * 60 * 1000,
      })
    })
  }, [paginatedCourses, queryClient])

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
      alert('当前筛选结果为空，无法全部勾选。')
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
  // 重置：清除所有标记、已复制、已截图、已排课记录
  const handleReset = async () => {
    if (!window.confirm('确定要重置吗？这将清除所有标记、已复制、已截图、已排课记录。')) {
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
      
      // 清除所有已复制、已截图、已排课记录
      setCopiedStudents(new Set())
      setScreenshotStudents(new Set())
      setScheduledRows(new Set())
      try {
        sessionStorage.removeItem(SCHEDULED_STORAGE_KEY)
      } catch (_) {}

      // 重置筛选条件
      setFilterMarked('all')
      setFilterCopied('all')
      setFilterScreenshot('all')
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

  // 去排课；点击后变为已排课，再次点击已排课则恢复为排课
  const handleGoToSchedule = (studentId, courseId) => {
    const key = `${studentId}-${courseId}`
    if (scheduledRows.has(key)) {
      setScheduledRows((prev) => {
        const next = new Set(prev)
        next.delete(key)
        try {
          sessionStorage.setItem(SCHEDULED_STORAGE_KEY, JSON.stringify([...next]))
        } catch (_) {}
        return next
      })
      return
    }
    setScheduledRows((prev) => {
      const next = new Set([...prev, key])
      try {
        sessionStorage.setItem(SCHEDULED_STORAGE_KEY, JSON.stringify([...next]))
      } catch (_) {}
      return next
    })
    sessionStorage.setItem('fromStudentCourses', 'true')
    sessionStorage.setItem('studentIdToMark', studentId.toString())
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

  // 根据排课数据构建待复制文本，供复制和预取共用
  const buildCopyText = useCallback((coursesToCopy, weekLabel, timeSlotsData) => {
    if (!coursesToCopy || coursesToCopy.length === 0) return null
    const studentName = coursesToCopy[0].student_name
    const lines = []
    if (weekLabel) {
      lines.push(`${studentName}  ${weekLabel}`)
    } else {
      lines.push(studentName)
    }
    lines.push('')
    const timeSlotOrderMap = new Map()
    ;(timeSlotsData || []).forEach((slot) => {
      const order = slot.sort_order != null ? slot.sort_order : 999
      timeSlotOrderMap.set(slot.name, order)
    })
    const weekdayOrder = { '周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 7 }
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
      if (isNewDate) {
        if (lastDate !== '') lines.push('---')
        lines.push(`${dateStr}  ${course.weekday || ''}`)
      }
      lines.push(`${course.course_name || '-'}  ${course.teacher_name || '-'}  ${course.time_slot || ''}`)
      lastDate = dateStr
    })
    return { text: lines.join('\n'), count: sortedCourses.length }
  }, [])

  // 降级复制方法（兼容旧浏览器、手机端）：textarea 需在视口内且部分可见，部分浏览器对完全隐藏元素不执行 copy
  const fallbackCopyTextToClipboard = useCallback((text, count) => {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.setAttribute('readonly', '')
    textArea.style.position = 'fixed'
    textArea.style.left = '0'
    textArea.style.top = '0'
    textArea.style.width = '2px'
    textArea.style.height = '2px'
    textArea.style.padding = '0'
    textArea.style.border = 'none'
    textArea.style.outline = 'none'
    textArea.style.boxShadow = 'none'
    textArea.style.background = 'transparent'
    textArea.style.opacity = '0.1'
    textArea.style.pointerEvents = 'none'
    textArea.style.zIndex = '9999'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    textArea.setSelectionRange(0, text.length)
    let successful = false
    try {
      successful = document.execCommand('copy')
    } catch (err) {
      console.error('降级复制方法失败:', err)
    }
    try {
      document.body.removeChild(textArea)
    } catch (_) {}
    if (successful) {
      alert(`已复制 ${count} 条排课信息到剪贴板`)
      return true
    }
    return false
  }, [])

  // 仅构建要复制的文本（供移动端先缓存、复制失败弹窗等使用）
  const buildCoursesCopyText = useCallback((coursesToCopy, weekLabel, timeSlotsData) => {
    if (coursesToCopy.length === 0) return null
    const studentName = coursesToCopy[0].student_name
    const lines = []
    if (weekLabel) {
      lines.push(`${studentName}  ${weekLabel}`)
    } else {
      lines.push(studentName)
    }
    lines.push('')
    const timeSlotOrderMap = new Map()
    ;(timeSlotsData || []).forEach((slot) => {
      const order = slot.sort_order !== null && slot.sort_order !== undefined ? slot.sort_order : 999
      timeSlotOrderMap.set(slot.name, order)
    })
    const weekdayOrder = { '周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 7 }
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
      if (isNewDate) {
        if (lastDate !== '') lines.push('---')
        lines.push(`${dateStr}  ${course.weekday || ''}`)
      }
      lines.push(`${course.course_name || '-'}  ${course.teacher_name || '-'}  ${course.time_slot || ''}`)
      lastDate = dateStr
    })
    return { textToCopy: lines.join('\n'), count: sortedCourses.length }
  }, [])

  // 复制课程信息到剪贴板的辅助函数，返回 Promise，仅复制成功时 resolve
  const copyCoursesToClipboard = useCallback((coursesToCopy, weekLabel, timeSlotsData) => {
    const built = buildCoursesCopyText(coursesToCopy, weekLabel, timeSlotsData)
    if (!built) {
      alert('该学生本周暂无排课信息')
      return Promise.reject(new Error('无排课信息'))
    }
    const { textToCopy, count } = built
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard
        .writeText(textToCopy)
        .then(() => {
          alert(`已复制 ${count} 条排课信息到剪贴板`)
          return { success: true }
        })
        .catch((err) => {
          console.error('复制失败:', err)
          const ok = fallbackCopyTextToClipboard(textToCopy, count)
          if (ok) return { success: true }
          return { success: false, textToCopy, count }
        })
    }
    const ok = fallbackCopyTextToClipboard(textToCopy, count)
    return Promise.resolve(ok ? { success: true } : { success: false, textToCopy, count })
  }, [fallbackCopyTextToClipboard, buildCoursesCopyText])

  // 复制课程：优先用预取缓存同步复制（一次点击）；无缓存时再拉取并复制
  const handleCopyCourses = async (studentId) => {
    if (copiedStudents.has(studentId)) {
      setCopiedStudents((prev) => {
        const next = new Set(prev)
        next.delete(studentId)
        return next
      })
      return
    }

    const today = new Date()
    const currentMonth = today.toISOString().slice(0, 7)
    const currentWeek = getWeekInMonth(today).toString()
    const cacheKey = `${studentId}-${currentMonth}-${currentWeek}`
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

    // 1）预取缓存或上次失败缓存的文本：在用户手势内同步复制（一次点击）
    const cachedData = queryClient.getQueryData(studentWeekCoursesKey(currentMonth, currentWeek, studentId))
    if (cachedData && Array.isArray(cachedData)) {
      const validCourses = cachedData.filter((c) => c.status !== '删除')
      const studentCourses = validCourses.filter((c) => String(c.student_id) === String(studentId))
      const weekDateRange = getCurrentWeekDateRange(currentMonth, currentWeek)
      if (weekDateRange) {
        const weekInfoLabel = `${weekDateRange.year}年${String(weekDateRange.month).padStart(2, '0')}月 第${currentWeek}周 ${String(weekDateRange.startDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.startDate.getDate()).padStart(2, '0')} 至 ${String(weekDateRange.endDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.endDate.getDate()).padStart(2, '0')}`
        const built = buildCoursesCopyText(studentCourses, weekInfoLabel, timeSlots)
        if (built) {
          const { textToCopy, count } = built
          const ok = fallbackCopyTextToClipboard(textToCopy, count)
          if (ok) {
            setCopiedStudents((prev) => new Set([...prev, studentId]))
            return
          }
          setCopyFallbackModal({ text: textToCopy, count })
          return
        }
      }
    }

    // 手机端：若有上次失败缓存的文本，同步复制或弹窗
    if (isMobile && copyCacheRef.current[cacheKey]) {
      const { text, count } = copyCacheRef.current[cacheKey]
      const ok = fallbackCopyTextToClipboard(text, count)
      if (ok) {
        setCopiedStudents((prev) => new Set([...prev, studentId]))
        return
      }
      setCopyFallbackModal({ text, count })
      return
    }

    // 2）无缓存：拉取数据后复制，并写入缓存供下次一次点击复制
    try {
      const weekDateRange = getCurrentWeekDateRange(currentMonth, currentWeek)
      if (!weekDateRange) {
        alert('无法计算当前周的日期范围')
        return
      }
      const weekInfoLabel = `${weekDateRange.year}年${String(weekDateRange.month).padStart(2, '0')}月 第${currentWeek}周 ${String(weekDateRange.startDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.startDate.getDate()).padStart(2, '0')} 至 ${String(weekDateRange.endDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.endDate.getDate()).padStart(2, '0')}`
      const coursesData = await courseService.getCourses({
        month: currentMonth,
        week: currentWeek,
        student_id: studentId,
      })
      queryClient.setQueryData(studentWeekCoursesKey(currentMonth, currentWeek, studentId), coursesData)
      const validCourses = (coursesData || []).filter((c) => c.status !== '删除')
      const studentCourses = validCourses.filter((c) => String(c.student_id) === String(studentId))
      const built = buildCoursesCopyText(studentCourses, weekInfoLabel, timeSlots)
      if (!built) {
        alert('该学生本周暂无排课信息')
        return
      }
      const { textToCopy, count } = built

      if (isMobile) {
        copyCacheRef.current[cacheKey] = { text: textToCopy, count }
        alert('请再点一次「复制」完成复制')
        return
      }

      const result = await copyCoursesToClipboard(studentCourses, weekInfoLabel, timeSlots)
      if (result.success) {
        setCopiedStudents((prev) => new Set([...prev, studentId]))
      } else {
        setCopyFallbackModal({ text: result.textToCopy, count: result.count })
      }
    } catch (error) {
      if (error?.message === '无排课信息') return
      console.error('获取排课数据失败:', error)
      alert('获取排课数据失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    }
  }

  // 在弹窗内点击「复制」时执行（处于新的用户手势内，成功率更高）
  const handleCopyFromFallbackModal = useCallback(() => {
    if (!copyFallbackModal) return
    const { text, count } = copyFallbackModal
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        alert(`已复制 ${count} 条排课信息到剪贴板`)
        setCopyFallbackModal(null)
      }).catch(() => {
        const ok = fallbackCopyTextToClipboard(text, count)
        if (ok) setCopyFallbackModal(null)
      })
    } else {
      const ok = fallbackCopyTextToClipboard(text, count)
      if (ok) setCopyFallbackModal(null)
    }
  }, [copyFallbackModal, fallbackCopyTextToClipboard])

  // 截图：获取该学生当周课表（星期模式），渲染后截图为图片，点击后标记为已截图；再次点击已截图则恢复为截图
  const handleScreenshot = async (studentId, studentName) => {
    if (screenshotStudents.has(studentId)) {
      setScreenshotStudents((prev) => {
        const next = new Set(prev)
        next.delete(studentId)
        return next
      })
      return
    }

    try {
      const today = new Date()
      const currentMonth = today.toISOString().slice(0, 7)
      const currentWeek = getWeekInMonth(today).toString()
      const weekDateRange = getCurrentWeekDateRange(currentMonth, currentWeek)
      if (!weekDateRange) {
        alert('无法计算当前周的日期范围')
        return
      }
      const weekInfoLabel = `${weekDateRange.year}年${String(weekDateRange.month).padStart(2, '0')}月 第${currentWeek}周 ${String(weekDateRange.startDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.startDate.getDate()).padStart(2, '0')} 至 ${String(weekDateRange.endDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.endDate.getDate()).padStart(2, '0')}`
      const coursesData = await courseService.getCourses({
        month: currentMonth,
        week: currentWeek,
        student_id: studentId,
      })
      const validCourses = (coursesData || []).filter((c) => c.status !== '删除' && String(c.student_id) === String(studentId))
      setScreenshotTarget({
        studentId,
        studentName: studentName || '',
        courses: validCourses,
        weekInfoLabel,
        monthFilter: currentMonth,
        weekFilter: currentWeek,
      })
    } catch (error) {
      console.error('获取课表失败:', error)
      alert('获取课表失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    }
  }

  // 当 screenshotTarget 设置后，等待 DOM 渲染完成再截取；截取前临时设为可见；手机端多等一会并强制重排
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
            const fileName = `${target.studentName}_课表_${target.monthFilter}_第${target.weekFilter}周.png`
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
            setScreenshotStudents((prev) => new Set([...prev, target.studentId]))
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
                <div className="filter-item">
                  <span className="filter-name">是否截图</span>
                  <select
                    value={filterScreenshot}
                    onChange={(e) => { setFilterScreenshot(e.target.value); setCurrentPage(1) }}
                    className="filter-select"
                  >
                    <option value="all">全部</option>
                    <option value="screenshot">已截图</option>
                    <option value="not_screenshot">未截图</option>
                  </select>
                </div>
              </div>
              <div className="toolbar-divider" aria-hidden="true" />
              <div className="toolbar-actions">
                <button
                  type="button"
                  className="btn btn-secondary toolbar-btn"
                  onClick={handleToggleSelectAll}
                  disabled={batchOperating || filteredCourses.length === 0}
                  title={filteredCourses.length === 0 ? '当前筛选结果为空，无法操作' : ''}
                >
                  {batchOperating ? '处理中...' : (isAllMarked ? '取消勾选' : '全部勾选')}
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
                <tbody>{paginatedCourses.map((course, index) => {
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
                            style={{
                              marginRight: '8px',
                              color: scheduledRows.has(`${course.student_id}-${course.course_id}`) ? '#ff9800' : '#667eea',
                              borderColor: scheduledRows.has(`${course.student_id}-${course.course_id}`) ? '#ff9800' : '#667eea',
                              cursor: 'pointer'
                            }}
                            title={scheduledRows.has(`${course.student_id}-${course.course_id}`) ? '点击恢复为排课' : '去排课'}
                          >
                            {scheduledRows.has(`${course.student_id}-${course.course_id}`) ? '已排课' : '排课'}
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
                            onClick={() => handleScreenshot(course.student_id, course.student_name)}
                            className="btn-link"
                            style={{
                              marginRight: '8px',
                              color: screenshotStudents.has(course.student_id) ? '#ff9800' : '#17a2b8',
                              borderColor: screenshotStudents.has(course.student_id) ? '#ff9800' : '#17a2b8',
                              cursor: 'pointer'
                            }}
                            title={screenshotStudents.has(course.student_id) ? '点击恢复为截图' : '截取当周课表（星期模式）'}
                          >
                            {screenshotStudents.has(course.student_id) ? '已截图' : '截图'}
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
                  })}</tbody>
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
                  {(filterMarked !== 'all' || filterCopied !== 'all' || filterScreenshot !== 'all') ? ` / 全部 ${courses.length} 条` : ''}）
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

      {/* 截图用：在视口内不可见渲染当周课表；手机端必须整表在视口内才能被绘制，故用 100% 宽+小字号 */}
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
        const thStyle = { padding: isMobile ? '4px 2px' : '10px', border: '1px solid #dee2e6', textAlign: 'center', color: isMobile ? '#000' : undefined, overflow: 'visible' }
        const thSlotStyle = { ...thStyle, minWidth: isMobile ? '48px' : '80px' }
        const thWeekdayStyle = { ...thStyle, minWidth: isMobile ? '56px' : '120px' }
        const tdStyle = { padding: isMobile ? '3px 2px' : '8px 6px', border: '1px solid #dee2e6', verticalAlign: 'top', color: isMobile ? '#000' : undefined, overflow: 'visible', wordBreak: 'break-word', minWidth: isMobile ? '56px' : '120px' }
        const tdSlotStyle = { ...tdStyle, fontWeight: 600, background: '#f5f5f5', whiteSpace: 'nowrap', minWidth: isMobile ? '48px' : '80px' }
        const tdCourseStyle = { ...tdStyle, background: '#fffde7' }
        const sortedSlots = (timeSlots || []).slice().sort((a, b) => {
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
                  {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((weekday) => {
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
                              overflow: 'visible',
                            }}
                          >
                            {[course.course_name || course.subject, course.teacher_name, course.classroom].filter(Boolean).join(' ')}
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
              {screenshotTarget.studentName}  {screenshotTarget.weekInfoLabel}
            </div>
            <table style={{ borderCollapse: 'collapse', border: '1px solid #dee2e6', tableLayout: 'auto', width: 'auto' }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  <th style={thSlotStyle}>时段</th>
                  {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((weekday) => {
                    const weekRange = getCurrentWeekDateRange(screenshotTarget.monthFilter, screenshotTarget.weekFilter)
                    let dateStr = ''
                    if (weekRange && weekRange.startDate && weekRange.endDate) {
                      const weekdayMap = { 0: '周日', 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六' }
                      let d = new Date(weekRange.startDate)
                      const endTime = weekRange.endDate.getTime()
                      while (d.getTime() <= endTime) {
                        if (weekdayMap[d.getDay()] === weekday) {
                          dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                          break
                        }
                        d.setDate(d.getDate() + 1)
                      }
                    }
                    return (
                      <th key={weekday} style={thWeekdayStyle}>
                        <div style={{ lineHeight: 1.3 }}>{weekday}</div>
                        {dateStr && (
                          <div style={{ marginTop: isMobile ? '4px' : '6px', fontSize: isMobile ? '10px' : '12px', color: isMobile ? '#000' : '#666' }}>{dateStr}</div>
                        )}
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

      {/* 复制失败时：可手动选择文本或点击「复制」按钮重试（新用户手势下成功率更高） */}
      <Modal
        isOpen={!!copyFallbackModal}
        onClose={() => setCopyFallbackModal(null)}
        title="复制失败，请手动复制或点击下方按钮重试"
      >
        {copyFallbackModal && (
          <>
            <p style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>
              共 {copyFallbackModal.count} 条排课信息。可长按下方文本框全选后拷贝，或点击「复制到剪贴板」重试。
            </p>
            <textarea
              readOnly
              value={copyFallbackModal.text}
              style={{
                width: '100%',
                minHeight: '180px',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                resize: 'vertical',
              }}
              onClick={(e) => e.target.select()}
            />
            <div className="form-actions" style={{ marginTop: '14px' }}>
              <button type="button" className="btn" onClick={() => setCopyFallbackModal(null)}>
                关闭
              </button>
              <button type="button" className="btn btn-primary" onClick={handleCopyFromFallbackModal}>
                复制到剪贴板
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

export default StudentCourses
