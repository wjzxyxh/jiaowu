import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import html2canvas from 'html2canvas'
import { usePermissions } from '../hooks/usePermissions'
import { studentCoursesService } from '../services/studentCoursesService'
import { othersService } from '../services/othersService'
import { courseService } from '../services/courseService'
import { teacherService } from '../services/teacherService'
import Modal from '../components/Modal'
import './StudentCourses.css'

const StudentCourses = () => {
  const queryClient = useQueryClient()
  const { hasFunctionPermission } = usePermissions()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  // 从 URL 恢复周偏移，使地址栏回车/刷新后仍停留在所选周
  const initialWeekOffset = (() => {
    const v = searchParams.get('weekOffset')
    if (v === null || v === '') return 0
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : 0
  })()
  const [showModal, setShowModal] = useState(false)
  const [editingCourse, setEditingCourse] = useState(null)
  const [defaultTimeSlot, setDefaultTimeSlot] = useState('')
  const [defaultWeekday, setDefaultWeekday] = useState('')
  const [defaultTeacherId, setDefaultTeacherId] = useState('')
  const [defaultClassroom, setDefaultClassroom] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [weekOffset, setWeekOffset] = useState(initialWeekOffset) // 相对本周的周数偏移，可任意整数（负=过去，0=本周，正=未来）

  // 地址栏回车或前进/后退时，从 URL 恢复周偏移，使页面停留在所选周
  useEffect(() => {
    const month = searchParams.get('month')
    const week = searchParams.get('week')
    if (month && week) return // 有 month+week 时由下方 effect 处理，不把 weekOffset 置 0
    const v = searchParams.get('weekOffset')
    if (v === null || v === '') {
      setWeekOffset(0)
      return
    }
    const n = parseInt(v, 10)
    if (Number.isFinite(n)) setWeekOffset(n)
  }, [searchParams])

  // 从课程页「返回预排课」带 month+week 时，计算对应 weekOffset 并替换 URL，使预排课停留在对应周
  useEffect(() => {
    const month = searchParams.get('month')
    const week = searchParams.get('week')
    if (!month || !week) return
    const range = getCurrentWeekDateRange(month, week)
    if (!range) return
    const targetMonday = new Date(range.startDate)
    targetMonday.setHours(0, 0, 0, 0)
    const today = new Date()
    const daysSinceMonday = (today.getDay() + 6) % 7
    const thisMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysSinceMonday)
    thisMonday.setHours(0, 0, 0, 0)
    const diffMs = targetMonday.getTime() - thisMonday.getTime()
    const offset = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000))
    setWeekOffset(offset)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('month')
    nextParams.delete('week')
    if (offset !== 0) nextParams.set('weekOffset', String(offset))
    setSearchParams(nextParams, { replace: true })
  }, [searchParams])

  const setWeekOffsetAndUrl = useCallback((valueOrUpdater) => {
    setWeekOffset((prev) => {
      const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater
      const nextParams = new URLSearchParams(searchParams)
      if (next === 0) {
        nextParams.delete('weekOffset')
      } else {
        nextParams.set('weekOffset', String(next))
      }
      setSearchParams(nextParams, { replace: true })
      return next
    })
  }, [searchParams, setSearchParams])

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
  const CONFIRMED_STORAGE_KEY = 'studentCoursesConfirmed'
  const autoMarkedStudentsRef = useRef(new Set()) // 记录已自动标记的学生ID，避免重复标记
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
  // 已确认的行：Set of "studentId-courseId-month-week"
  const [confirmedRows, setConfirmedRows] = useState(() => {
    try {
      const raw = sessionStorage.getItem(CONFIRMED_STORAGE_KEY)
      if (raw) {
        const arr = JSON.parse(raw)
        return new Set(Array.isArray(arr) ? arr : [])
      }
    } catch (_) {}
    return new Set()
  })
  const pageSize = 20

  // 获取已缴费需要排课的学生课程列表（每条为 student+course，同一学生多门课程为多条，全部展示）
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

  // 计算日期所在的周数（以每个月的第一个周一为第1周的开始）
  const getWeekInMonth = (date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const dayOfMonth = date.getDate()
    
    // 找到当月第一个周一
    const firstDay = new Date(year, month, 1)
    const firstDayWeekday = firstDay.getDay() // 0=Sunday, 1=Monday, ..., 6=Saturday
    
    // 计算到第一个周一需要多少天
    let offset = 0
    if (firstDayWeekday === 0) {
      offset = 1 // 周日，第一个周一是第二天
    } else if (firstDayWeekday === 1) {
      offset = 0 // 周一，第一个周一就是第一天
    } else {
      offset = 8 - firstDayWeekday // 周二到周六
    }
    
    const firstMonday = new Date(year, month, 1 + offset)
    
    // 如果当前日期在第一个周一之前，返回1（或者可以返回0表示不属于该月的周）
    if (dayOfMonth < firstMonday.getDate()) {
      return 1
    }
    
    // 计算从第一个周一开始过了多少天
    const daysFromFirstMonday = dayOfMonth - firstMonday.getDate()
    // 计算是第几周（第1周从0天开始，第2周从7天开始，...）
    const weekNum = Math.floor(daysFromFirstMonday / 7) + 1
    
    return Math.min(weekNum, 5) // 最多5周
  }

  // 计算当前周的日期范围（以每个月的第一个周一为第1周的开始）
  const getCurrentWeekDateRange = (month, week) => {
    if (!month || !week) return null
    const [year, monthNum] = month.split('-').map(Number)
    const weekNum = parseInt(week)
    
    // 找到当月第一个周一
    const firstDay = new Date(year, monthNum - 1, 1)
    const firstDayWeekday = firstDay.getDay() // 0=Sunday, 1=Monday, ..., 6=Saturday
    
    // 计算到第一个周一需要多少天
    let offset = 0
    if (firstDayWeekday === 0) {
      offset = 1 // 周日，第一个周一是第二天
    } else if (firstDayWeekday === 1) {
      offset = 0 // 周一，第一个周一就是第一天
    } else {
      offset = 8 - firstDayWeekday // 周二到周六
    }
    
    const firstMonday = new Date(year, monthNum - 1, 1 + offset)
    
    // 计算第weekNum周的开始日期（第1周从第一个周一开始）
    const startDate = new Date(firstMonday)
    startDate.setDate(firstMonday.getDate() + (weekNum - 1) * 7)
    
    // 计算第weekNum周的结束日期（周一到周日，共7天）
    const endDate = new Date(startDate)
    endDate.setDate(startDate.getDate() + 6)
    
    return { startDate, endDate, year, month: monthNum }
  }

  // 计算目标周的日期（根据 weekOffset：-1=上周，0=本周，1=下周）
  const targetWeekDate = useMemo(() => {
    const today = new Date()
    const targetDate = new Date(today)
    targetDate.setDate(today.getDate() + weekOffset * 7)
    return targetDate
  }, [weekOffset])

  // 获取时段列表（用于编辑默认排课）
  const { data: timeSlots = [] } = useQuery({
    queryKey: ['time-slots', '启用'],
    queryFn: () => othersService.getTimeSlots({ status: '启用' }),
    staleTime: 10 * 60 * 1000,
  })

  // 获取老师列表（用于默认上课老师）
  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers', '启用'],
    queryFn: () => teacherService.getTeachers({ status: '启用' }),
    staleTime: 10 * 60 * 1000,
    enabled: showModal,
  })

  // 获取教室列表（用于默认教室下拉）
  const { data: classrooms = [] } = useQuery({
    queryKey: ['classrooms', '启用'],
    queryFn: () => othersService.getClassrooms({ status: '启用' }),
    staleTime: 10 * 60 * 1000,
    enabled: showModal,
  })

  // 预取当前页学生的选择周的排课数据，便于「复制」时一次点击即可同步复制（在用户手势内）
  const studentWeekCoursesKey = (month, week, studentId) => ['student-week-courses', month, week, studentId]
  useEffect(() => {
    if (!paginatedCourses.length) return
    const targetMonth = targetWeekDate.toISOString().slice(0, 7)
    const targetWeek = getWeekInMonth(targetWeekDate).toString()
    const studentIds = [...new Set(paginatedCourses.map((c) => c.student_id))]
    studentIds.forEach((sid) => {
      queryClient.prefetchQuery({
        queryKey: studentWeekCoursesKey(targetMonth, targetWeek, sid),
        queryFn: () => courseService.getCourses({ month: targetMonth, week: targetWeek, student_id: sid }),
        staleTime: 2 * 60 * 1000,
      })
    })
  }, [paginatedCourses, queryClient, targetWeekDate])

  // 查询当前选择周的所有排课数据（用于判断"已排课"状态）
  const targetMonth = targetWeekDate.toISOString().slice(0, 7)
  const targetWeek = getWeekInMonth(targetWeekDate).toString()
  const { data: currentWeekCourses = [] } = useQuery({
    queryKey: ['courses', targetMonth, targetWeek],
    queryFn: () => courseService.getCourses({ month: targetMonth, week: targetWeek }),
    staleTime: 2 * 60 * 1000,
  })

  // 计算当前选择周有排课的学生ID集合
  const studentsWithCoursesInCurrentWeek = useMemo(() => {
    const studentsSet = new Set()
    currentWeekCourses.forEach((course) => {
      if (course.status !== '删除' && course.student_id) {
        studentsSet.add(course.student_id)
      }
    })
    return studentsSet
  }, [currentWeekCourses])

  // 计算当前选择周内每个（学生-课程）的当周已消耗课时（只统计已确认的排课：正常+1，请假-1，跑空+0.5）
  const consumedInCurrentWeekByKey = useMemo(() => {
    const map = {}
    currentWeekCourses.forEach((record) => {
      if (record.status === '删除' || !record.student_id || !record.course_id) return
      if (!record.is_confirmed) return // 未确认的课程不计入已消耗
      const key = `${record.student_id}-${record.course_id}`
      if (!map[key]) map[key] = 0
      if (record.status === '正常') map[key] += 1
      else if (record.status === '请假') map[key] -= 1
      else if (record.status === '跑空') map[key] += 0.5
    })
    return map
  }, [currentWeekCourses])

  // 自动标记：如果选择的周有学生的排课，则自动将该学生标记为已排课（excluded_from_scheduling = true）
  useEffect(() => {
    if (!courses.length || isLoading) return

    const checkAndAutoMark = async () => {
      try {
        const targetMonth = targetWeekDate.toISOString().slice(0, 7)
        const targetWeek = getWeekInMonth(targetWeekDate).toString()

        // 查询选择的周所有排课记录（不指定 student_id，获取所有学生的排课）
        const weekCourses = await courseService.getCourses({
          month: targetMonth,
          week: targetWeek,
        })

        // 找出当周有排课的学生ID集合（排除已删除的排课）
        const studentsWithCourses = new Set()
        weekCourses.forEach((course) => {
          if (course.status !== '删除' && course.student_id) {
            studentsWithCourses.add(course.student_id)
          }
        })

        // 对于当周有排课的学生，如果还未标记，则自动标记
        const studentsToMark = []
        const uniqueStudentIds = [...new Set(courses.map((c) => c.student_id))]
        uniqueStudentIds.forEach((studentId) => {
          const course = courses.find((c) => c.student_id === studentId)
          if (
            studentsWithCourses.has(studentId) &&
            course &&
            !course.excluded_from_scheduling &&
            !autoMarkedStudentsRef.current.has(`${studentId}-${targetMonth}-${targetWeek}`)
          ) {
            studentsToMark.push(studentId)
            autoMarkedStudentsRef.current.add(`${studentId}-${targetMonth}-${targetWeek}`)
          }
        })

        // 批量标记这些学生
        if (studentsToMark.length > 0) {
          console.log(`[自动标记] 发现 ${studentsToMark.length} 个学生需要自动标记:`, studentsToMark)
          // 注意：不再更新 scheduledRows，因为"已排课"状态现在基于实时查询当前周的排课数据

          // 批量标记所有学生（直接调用 API，避免触发 markMutation 的 onSuccess）
          const markPromises = studentsToMark.map(async (studentId) => {
            try {
              await studentCoursesService.updateExcludeFromScheduling(studentId, true)
            } catch (err) {
              console.warn(`[自动标记] 标记学生 ${studentId} 失败:`, err)
              autoMarkedStudentsRef.current.delete(`${studentId}-${targetMonth}-${targetWeek}`) // 标记失败时从记录中移除，允许重试
              throw err
            }
          })
          
          try {
            await Promise.all(markPromises)
            console.log(`[自动标记] 成功标记 ${studentsToMark.length} 个学生`)
            // 所有标记完成后，强制刷新数据以确保 UI 更新
            queryClient.invalidateQueries(['paid-courses-need-scheduling'])
            // 强制重新获取数据
            await queryClient.refetchQueries({ queryKey: ['paid-courses-need-scheduling'] })
            console.log('[自动标记] 数据已刷新')
          } catch (err) {
            console.error('[自动标记] 批量标记过程中出错:', err)
          }
        }
      } catch (error) {
        console.error('检查并自动标记失败:', error)
      }
    }

    // 延迟执行，避免频繁调用
    const timer = setTimeout(checkAndAutoMark, 500)
    return () => clearTimeout(timer)
  }, [courses, isLoading, queryClient, targetWeekDate])

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
    const newExcluded = !course.excluded_from_scheduling
    markMutation.mutate({
      studentId: course.student_id,
      excluded: newExcluded,
    })
    // 如果手动取消标记，清除自动标记记录，以便选择的周有排课时能再次自动标记
    if (!newExcluded) {
      const targetMonth = targetWeekDate.toISOString().slice(0, 7)
      const targetWeek = getWeekInMonth(targetWeekDate).toString()
      autoMarkedStudentsRef.current.delete(`${course.student_id}-${targetMonth}-${targetWeek}`)
    }
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
      setDefaultTeacherId(defaultScheduleData.default_teacher_id != null ? String(defaultScheduleData.default_teacher_id) : '')
      setDefaultClassroom(defaultScheduleData.default_classroom || '')
    }
  }, [showModal, defaultScheduleData])

  // 显示编辑默认排课模态框
  const handleShowEditModal = (course) => {
    setEditingCourse(course)
    setShowModal(true)
    // 重置表单（等待数据加载）
    setDefaultTimeSlot('')
    setDefaultWeekday('')
    setDefaultTeacherId('')
    setDefaultClassroom('')
  }

  // 关闭模态框
  const handleCloseModal = () => {
    setShowModal(false)
    setEditingCourse(null)
    setDefaultTimeSlot('')
    setDefaultWeekday('')
    setDefaultTeacherId('')
    setDefaultClassroom('')
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
        default_teacher_id: defaultTeacherId ? parseInt(defaultTeacherId, 10) : null,
        default_classroom: defaultClassroom || '',
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

  // 检查该学生当周所有排课是否都已确认
  const checkStudentAllCoursesConfirmed = useCallback((studentId) => {
    if (!currentWeekCourses || currentWeekCourses.length === 0) {
      return false
    }
    
    // 获取该学生当周的所有排课（排除删除状态）
    const studentCourses = currentWeekCourses.filter(
      (c) => 
        String(c.student_id) === String(studentId) &&
        c.status !== '删除'
    )
    
    // 如果没有排课，返回 false
    if (studentCourses.length === 0) {
      return false
    }
    
    // 检查是否所有排课都已确认
    const allConfirmed = studentCourses.every((c) => c.is_confirmed === true)
    
    return allConfirmed
  }, [currentWeekCourses])

  // 确认：点击后跳转到课程页面，返回后如果所有课程都已确认则变为已确认
  // 如果该学生当周所有课程都已确认，即使点击已确认按钮也不会变为确认
  const handleConfirm = (studentId, courseId) => {
    const targetMonth = targetWeekDate.toISOString().slice(0, 7)
    const targetWeek = getWeekInMonth(targetWeekDate).toString()
    const key = `${studentId}-${courseId}-${targetMonth}-${targetWeek}`
    
    // 如果已确认，检查该学生当周所有课程是否都已确认
    if (confirmedRows.has(key)) {
      // 如果该学生当周所有课程都已确认，不允许取消确认
      const allConfirmed = checkStudentAllCoursesConfirmed(studentId)
      if (allConfirmed) {
        // 不允许取消确认，保持已确认状态
        return
      }
      
      // 如果该学生当周有未确认的课程，允许取消确认
      setConfirmedRows((prev) => {
        const next = new Set(prev)
        next.delete(key)
        try {
          sessionStorage.setItem(CONFIRMED_STORAGE_KEY, JSON.stringify([...next]))
        } catch (_) {}
        return next
      })
      return
    }
    
    // 跳转到课程页面，传递学生ID、月份和周数
    sessionStorage.setItem('fromStudentCoursesConfirm', 'true')
    sessionStorage.setItem('confirmStudentId', studentId.toString())
    sessionStorage.setItem('confirmCourseId', courseId.toString())
    sessionStorage.setItem('confirmMonth', targetMonth)
    sessionStorage.setItem('confirmWeek', targetWeek)
    navigate(`/courses?student_id=${studentId}&month=${targetMonth}&week=${targetWeek}`)
  }

  // 检查从课程页面返回后是否需要更新确认状态（只依赖课程页设置的 allCoursesConfirmed 等标记）
  const checkAndUpdateConfirmStatus = useCallback(() => {
    const allCoursesConfirmed = sessionStorage.getItem('allCoursesConfirmed') === 'true'
    const confirmStudentId = sessionStorage.getItem('confirmStudentId') || sessionStorage.getItem('confirmedStudentId')
    const confirmCourseId = sessionStorage.getItem('confirmCourseId') || sessionStorage.getItem('confirmedCourseId')
    const confirmMonth = sessionStorage.getItem('confirmMonth') || sessionStorage.getItem('confirmedMonth')
    const confirmWeek = sessionStorage.getItem('confirmWeek') || sessionStorage.getItem('confirmedWeek')
    
    // 有“全部已确认”的标记且有学生/周信息即可（不要求 fromStudentCoursesConfirm）
    if (!allCoursesConfirmed || !confirmStudentId || !confirmMonth || !confirmWeek) {
      const fromConfirm = sessionStorage.getItem('fromStudentCoursesConfirm')
      if (fromConfirm === 'true') {
        sessionStorage.removeItem('fromStudentCoursesConfirm')
        sessionStorage.removeItem('confirmStudentId')
        sessionStorage.removeItem('confirmCourseId')
        sessionStorage.removeItem('confirmMonth')
        sessionStorage.removeItem('confirmWeek')
        sessionStorage.removeItem('allCoursesConfirmed')
        sessionStorage.removeItem('confirmedStudentId')
        sessionStorage.removeItem('confirmedCourseId')
        sessionStorage.removeItem('confirmedMonth')
        sessionStorage.removeItem('confirmedWeek')
      }
      return false
    }
    
    // 清除标记，避免重复更新
    sessionStorage.removeItem('fromStudentCoursesConfirm')
    sessionStorage.removeItem('confirmStudentId')
    sessionStorage.removeItem('confirmCourseId')
    sessionStorage.removeItem('confirmMonth')
    sessionStorage.removeItem('confirmWeek')
    sessionStorage.removeItem('allCoursesConfirmed')
    sessionStorage.removeItem('confirmedStudentId')
    sessionStorage.removeItem('confirmedCourseId')
    sessionStorage.removeItem('confirmedMonth')
    sessionStorage.removeItem('confirmedWeek')
    
    // 使当周课程数据重新拉取，按钮才能根据最新 is_confirmed 显示「已确认」
    queryClient.invalidateQueries({ queryKey: ['courses', confirmMonth, confirmWeek] })
    
    // 若指定了某一门课的 courseId，只标记该课；否则标记该学生当周在本页列表中的所有课
    if (confirmCourseId) {
      const key = `${confirmStudentId}-${confirmCourseId}-${confirmMonth}-${confirmWeek}`
      setConfirmedRows((prev) => {
        const next = new Set([...prev, key])
        try {
          sessionStorage.setItem(CONFIRMED_STORAGE_KEY, JSON.stringify([...next]))
        } catch (_) {}
        return next
      })
    } else {
      // 该学生当周全部确认：为当前列表中该学生的每门课都打上已确认
      const studentCourseRows = courses.filter((c) => String(c.student_id) === String(confirmStudentId))
      setConfirmedRows((prev) => {
        const next = new Set(prev)
        studentCourseRows.forEach((row) => {
          next.add(`${row.student_id}-${row.course_id}-${confirmMonth}-${confirmWeek}`)
        })
        try {
          sessionStorage.setItem(CONFIRMED_STORAGE_KEY, JSON.stringify([...next]))
        } catch (_) {}
        return next
      })
    }
    return true
  }, [courses, queryClient])

  // 当路径变化时检查（从 /courses 返回时），并刷新当周课程数据以便按钮显示最新确认状态
  useEffect(() => {
    if (location.pathname === '/student-courses') {
      checkAndUpdateConfirmStatus()
      const month = targetWeekDate.toISOString().slice(0, 7)
      const week = getWeekInMonth(targetWeekDate).toString()
      queryClient.invalidateQueries({ queryKey: ['courses', month, week] })
    }
  }, [location.pathname, checkAndUpdateConfirmStatus, targetWeekDate, queryClient])

  // 页面可见性变化时也检查（处理浏览器返回按钮的情况）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && location.pathname === '/student-courses') {
        // 延迟一点时间，确保页面完全加载
        setTimeout(() => {
          checkAndUpdateConfirmStatus()
        }, 100)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [location.pathname, checkAndUpdateConfirmStatus])

  // 页面加载时也检查一次，以及数据加载完成后检查
  useEffect(() => {
    if (location.pathname === '/student-courses' && !isLoading) {
      // 延迟一点时间，确保页面完全加载和数据已加载
      setTimeout(() => {
        checkAndUpdateConfirmStatus()
      }, 300)
    }
  }, [isLoading, checkAndUpdateConfirmStatus]) // 当数据加载完成时也检查

  // 当当前周的课程数据更新时也检查（确保能检测到确认状态的变化）
  useEffect(() => {
    if (location.pathname === '/student-courses' && currentWeekCourses.length > 0) {
      setTimeout(() => {
        checkAndUpdateConfirmStatus()
      }, 200)
    }
  }, [currentWeekCourses, checkAndUpdateConfirmStatus])

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
  const handleCopyCourses = useCallback(async (studentId) => {
    if (copiedStudents.has(studentId)) {
      setCopiedStudents((prev) => {
        const next = new Set(prev)
        next.delete(studentId)
        return next
      })
      return
    }

    const targetMonth = targetWeekDate.toISOString().slice(0, 7)
    const targetWeek = getWeekInMonth(targetWeekDate).toString()
    const cacheKey = `${studentId}-${targetMonth}-${targetWeek}`
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

    // 1）预取缓存或上次失败缓存的文本：在用户手势内同步复制（一次点击）
    const cachedData = queryClient.getQueryData(studentWeekCoursesKey(targetMonth, targetWeek, studentId))
    if (cachedData && Array.isArray(cachedData)) {
      const validCourses = cachedData.filter((c) => c.status !== '删除')
      const studentCourses = validCourses.filter((c) => String(c.student_id) === String(studentId))
      const weekDateRange = getCurrentWeekDateRange(targetMonth, targetWeek)
      if (weekDateRange) {
        const weekInfoLabel = `${weekDateRange.year}年${String(weekDateRange.month).padStart(2, '0')}月 第${targetWeek}周 ${String(weekDateRange.startDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.startDate.getDate()).padStart(2, '0')} 至 ${String(weekDateRange.endDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.endDate.getDate()).padStart(2, '0')}`
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
      const weekDateRange = getCurrentWeekDateRange(targetMonth, targetWeek)
      if (!weekDateRange) {
        alert('无法计算选择周的日期范围')
        return
      }
      const weekInfoLabel = `${weekDateRange.year}年${String(weekDateRange.month).padStart(2, '0')}月 第${targetWeek}周 ${String(weekDateRange.startDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.startDate.getDate()).padStart(2, '0')} 至 ${String(weekDateRange.endDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.endDate.getDate()).padStart(2, '0')}`
      const coursesData = await courseService.getCourses({
        month: targetMonth,
        week: targetWeek,
        student_id: studentId,
      })
      queryClient.setQueryData(studentWeekCoursesKey(targetMonth, targetWeek, studentId), coursesData)
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
  }, [targetWeekDate, queryClient, timeSlots, buildCoursesCopyText, fallbackCopyTextToClipboard, copyCacheRef, copiedStudents])

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

  // 截图：获取该学生已排课的第一周课表（星期模式），渲染后截图为图片，点击后标记为已截图；再次点击已截图则恢复为截图
  const handleScreenshot = async (studentId, studentName, studentGrade) => {
    if (screenshotStudents.has(studentId)) {
      setScreenshotStudents((prev) => {
        const next = new Set(prev)
        next.delete(studentId)
        return next
      })
      return
    }

    try {
      // 查询该学生已排课的第一周：从当前日期往前推3个月，往后推6个月
      const today = new Date()
      let foundWeek = null
      let foundMonth = null
      let foundCourses = null
      let foundWeekInfoLabel = null

      // 生成要查询的月份列表（往前3个月到往后6个月）
      const monthsToCheck = []
      for (let i = -3; i <= 6; i++) {
        const checkDate = new Date(today.getFullYear(), today.getMonth() + i, 1)
        const monthStr = checkDate.toISOString().slice(0, 7)
        monthsToCheck.push(monthStr)
      }

      // 按时间顺序查询每一周，找出第一个有排课的周
      for (const monthStr of monthsToCheck) {
        if (foundWeek) break // 已找到，停止查询

        // 每个月最多5周
        for (let weekNum = 1; weekNum <= 5; weekNum++) {
          try {
            const coursesData = await courseService.getCourses({
              month: monthStr,
              week: weekNum.toString(),
              student_id: studentId,
            })
            const validCourses = (coursesData || []).filter((c) => c.status !== '删除' && String(c.student_id) === String(studentId))
            
            if (validCourses.length > 0) {
              // 找到第一个有排课的周
              foundMonth = monthStr
              foundWeek = weekNum.toString()
              foundCourses = validCourses
              
              const weekDateRange = getCurrentWeekDateRange(monthStr, weekNum.toString())
              if (weekDateRange) {
                foundWeekInfoLabel = `${weekDateRange.year}年${String(weekDateRange.month).padStart(2, '0')}月 第${weekNum}周 ${String(weekDateRange.startDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.startDate.getDate()).padStart(2, '0')} 至 ${String(weekDateRange.endDate.getMonth() + 1).padStart(2, '0')}-${String(weekDateRange.endDate.getDate()).padStart(2, '0')}`
              }
              break // 找到后跳出内层循环
            }
          } catch (err) {
            // 如果某周查询失败，继续查询下一周
            console.warn(`查询 ${monthStr} 第${weekNum}周失败:`, err)
            continue
          }
        }
      }

      if (!foundWeek || !foundCourses || foundCourses.length === 0) {
        alert('该学生还没有排课记录，无法截图')
        return
      }

      setScreenshotTarget({
        studentId,
        studentName: studentName || '',
        studentGrade: studentGrade || '',
        courses: foundCourses,
        weekInfoLabel: foundWeekInfoLabel || '',
        monthFilter: foundMonth,
        weekFilter: foundWeek,
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

  // 当前选择的周及日期范围（必须在所有 early return 之前调用，遵守 Hooks 顺序）
  const currentWeekLabel = useMemo(() => {
    const targetMonth = targetWeekDate.toISOString().slice(0, 7)
    const targetWeek = getWeekInMonth(targetWeekDate).toString()
    const weekDateRange = getCurrentWeekDateRange(targetMonth, targetWeek)
    if (!weekDateRange) return null
    const { startDate, endDate, year, month } = weekDateRange
    const startM = String(startDate.getMonth() + 1).padStart(2, '0')
    const startD = String(startDate.getDate()).padStart(2, '0')
    const endM = String(endDate.getMonth() + 1).padStart(2, '0')
    const endD = String(endDate.getDate()).padStart(2, '0')
    return `${year}年${String(month).padStart(2, '0')}月 第${targetWeek}周 ${startM}月${startD}日-${endM}月${endD}日`
  }, [targetWeekDate])

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
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ margin: 0 }}>预排课</h1>
        {currentWeekLabel && (
          <>
            <span
              className="current-week-label"
              style={{
                display: 'inline-block',
                padding: '6px 16px',
                fontSize: '15px',
                fontWeight: '600',
                color: '#1a73e8',
                backgroundColor: '#e8f0fe',
                border: '1px solid #1a73e8',
                borderRadius: '8px',
                letterSpacing: '0.02em',
              }}
            >
              {currentWeekLabel}
            </span>
            <div style={{ display: 'flex', gap: '8px', marginLeft: '8px' }}>
              <button
                onClick={() => setWeekOffsetAndUrl((prev) => prev - 1)}
                style={{
                  padding: '6px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: weekOffset < 0 ? '#fff' : '#1a73e8',
                  backgroundColor: weekOffset < 0 ? '#1a73e8' : '#fff',
                  border: '1px solid #1a73e8',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                title="上一周（可连续点击）"
                onMouseEnter={(e) => {
                  if (weekOffset >= 0) {
                    e.target.style.backgroundColor = '#e8f0fe'
                  }
                }}
                onMouseLeave={(e) => {
                  if (weekOffset >= 0) {
                    e.target.style.backgroundColor = '#fff'
                  }
                }}
              >
                上周
              </button>
              <button
                onClick={() => setWeekOffsetAndUrl(0)}
                style={{
                  padding: '6px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: weekOffset === 0 ? '#fff' : '#1a73e8',
                  backgroundColor: weekOffset === 0 ? '#1a73e8' : '#fff',
                  border: '1px solid #1a73e8',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                title="本周"
                onMouseEnter={(e) => {
                  if (weekOffset !== 0) {
                    e.target.style.backgroundColor = '#e8f0fe'
                  }
                }}
                onMouseLeave={(e) => {
                  if (weekOffset !== 0) {
                    e.target.style.backgroundColor = '#fff'
                  }
                }}
              >
                本周
              </button>
              <button
                onClick={() => setWeekOffsetAndUrl((prev) => prev + 1)}
                style={{
                  padding: '6px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: weekOffset > 0 ? '#fff' : '#1a73e8',
                  backgroundColor: weekOffset > 0 ? '#1a73e8' : '#fff',
                  border: '1px solid #1a73e8',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                title="下一周（可连续点击）"
                onMouseEnter={(e) => {
                  if (weekOffset <= 0) {
                    e.target.style.backgroundColor = '#e8f0fe'
                  }
                }}
                onMouseLeave={(e) => {
                  if (weekOffset <= 0) {
                    e.target.style.backgroundColor = '#fff'
                  }
                }}
              >
                下周
              </button>
            </div>
          </>
        )}
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
                {hasFunctionPermission('student_courses', 'batch_select') && (
                  <button
                    type="button"
                    className="btn btn-secondary toolbar-btn"
                    onClick={handleToggleSelectAll}
                    disabled={batchOperating || filteredCourses.length === 0}
                    title={filteredCourses.length === 0 ? '当前筛选结果为空，无法操作' : ''}
                  >
                    {batchOperating ? '处理中...' : (isAllMarked ? '取消勾选' : '全部勾选')}
                  </button>
                )}
                {hasFunctionPermission('student_courses', 'reset') && (
                  <button
                    type="button"
                    className="btn btn-secondary toolbar-btn toolbar-btn-reset"
                    onClick={handleReset}
                    disabled={batchOperating}
                  >
                    {batchOperating ? '处理中...' : '重置'}
                  </button>
                )}
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
                    <th style={{ width: '12%' }}>默认时间</th>
                    <th style={{ width: '10%' }}>默认星期</th>
                    <th style={{ width: '10%' }}>默认老师</th>
                    <th style={{ width: '8%' }}>默认教室</th>
                    <th style={{ textAlign: 'right', width: '8%' }}>总课时</th>
                    <th style={{ textAlign: 'right', width: '10%' }} title="当周：当前选择周已消耗；累计：全部已确认消耗">已消耗（当周/累计）</th>
                    <th style={{ textAlign: 'right', width: '8%' }} title="剩余课时 = 总课时 - 累计已消耗">剩余课时</th>
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
                            checked={studentsWithCoursesInCurrentWeek.has(course.student_id)}
                            readOnly
                            disabled
                            title="当前选择周已排课则勾选，否则不勾选（与排课按钮状态一致）"
                          />
                        </td>
                        <td>{course.student_name}</td>
                        <td>{course.grade || '-'}</td>
                        <td>{course.course_name}</td>
                        <td>{course.default_time_slot || '-'}</td>
                        <td>{course.default_weekday || '-'}</td>
                        <td>{course.default_teacher_name || '-'}</td>
                        <td>{course.default_classroom || '-'}</td>
                        <td style={{ textAlign: 'right' }}>{course.total_paid_hours || 0}</td>
                        <td style={{ textAlign: 'right' }}>
                          {(() => {
                            const key = `${course.student_id}-${course.course_id}`
                            const weekConsumed = consumedInCurrentWeekByKey[key] ?? 0
                            const totalConsumed = course.consumed_hours ?? 0
                            const weekStr = Number.isInteger(weekConsumed) ? String(weekConsumed) : weekConsumed.toFixed(1)
                            return `${weekStr} / ${totalConsumed}`
                          })()}
                        </td>
                        <td style={{ textAlign: 'right' }} className="remaining-hours">
                          {course.remaining_hours != null ? Number(course.remaining_hours).toFixed(1) : '0.0'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {hasFunctionPermission('student_courses', 'schedule') && (() => {
                            // 检查当前选择的周是否有该学生的排课
                            const hasScheduledInCurrentWeek = studentsWithCoursesInCurrentWeek.has(course.student_id)
                            return (
                              <button 
                                onClick={() => handleGoToSchedule(course.student_id, course.course_id)} 
                                className="btn-link"
                                style={{
                                  marginRight: '8px',
                                  color: hasScheduledInCurrentWeek ? '#ff9800' : '#667eea',
                                  borderColor: hasScheduledInCurrentWeek ? '#ff9800' : '#667eea',
                                  cursor: 'pointer'
                                }}
                                title={hasScheduledInCurrentWeek ? '点击恢复为排课' : '去排课'}
                              >
                                {hasScheduledInCurrentWeek ? '已排课' : '排课'}
                              </button>
                            )
                          })()}
                          {hasFunctionPermission('student_courses', 'confirm') && (() => {
                            // 仅以该生当周所有课程是否均已确认（接口数据）决定按钮显示
                            const isConfirmed = checkStudentAllCoursesConfirmed(course.student_id)
                            const buttonTitle = isConfirmed
                              ? '该学生当周所有课程已确认，无法取消'
                              : '确认'
                            return (
                              <button 
                                onClick={() => handleConfirm(course.student_id, course.course_id)} 
                                className="btn-link"
                                style={{
                                  marginRight: '8px',
                                  color: isConfirmed ? '#ff9800' : '#28a745',
                                  borderColor: isConfirmed ? '#ff9800' : '#28a745',
                                  cursor: isConfirmed ? 'not-allowed' : 'pointer',
                                  opacity: isConfirmed ? 0.7 : 1
                                }}
                                title={buttonTitle}
                                disabled={isConfirmed}
                              >
                                {isConfirmed ? '已确认' : '确认'}
                              </button>
                            )
                          })()}
                          {hasFunctionPermission('student_courses', 'copy') && (
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
                          )}
                          {hasFunctionPermission('student_courses', 'screenshot') && (
                            <button
                              onClick={() => handleScreenshot(course.student_id, course.student_name, course.grade)}
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
                          )}
                          {hasFunctionPermission('student_courses', 'edit_default') && (
                            <button 
                              onClick={() => handleShowEditModal(course)} 
                              className="btn-link edit-default"
                              style={{ marginRight: '0' }}
                            >
                              编辑
                            </button>
                          )}
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
                            {(() => {
                              const courseName = course.course_name || course.subject || ''
                              const teacherName = course.teacher_name || ''
                              const classroom = course.classroom || ''
                              const notes = course.notes || ''
                              const firstLine = [courseName, teacherName, classroom].filter(Boolean).join(' ')
                              return (
                                <>
                                  <div>{firstLine}</div>
                                  {notes && <div style={{ fontSize: '11px', color: '#333', fontWeight: 'bold', textAlign: 'center', marginTop: '2px' }}>{notes}</div>}
                                </>
                              )
                            })()}
                          </div>
                        ))}
                      </td>
                    )
                  })}
                </tr>
              )
            })
        // 生成表头：显示"学生姓名·课程表·年级"
        const headerText = screenshotTarget.studentName
          ? `${screenshotTarget.studentName}·课程表${screenshotTarget.studentGrade ? `·${screenshotTarget.studentGrade}` : ''}`
          : screenshotTarget.weekInfoLabel

        return (
          <div ref={screenshotCaptureRef} style={wrapStyle}>
            <div style={{ marginBottom: isMobile ? '6px' : '12px', fontWeight: 600, fontSize: isMobile ? '14px' : '16px', textAlign: 'center', color: isMobile ? '#000' : undefined }}>
              {headerText}
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
              <label>默认星期</label>
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
            <div className="form-group">
              <label>默认老师</label>
              <select value={defaultTeacherId} onChange={(e) => setDefaultTeacherId(e.target.value)}>
                <option value="">-- 请选择老师 --</option>
                {Array.isArray(teachers) &&
                  teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.subject ? `(${t.subject})` : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-group">
              <label>默认教室</label>
              <select value={defaultClassroom} onChange={(e) => setDefaultClassroom(e.target.value)}>
                <option value="">-- 请选择教室 --</option>
                {Array.isArray(classrooms) &&
                  classrooms.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
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
