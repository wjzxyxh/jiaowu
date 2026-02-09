import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '../hooks/usePermissions'
import { paymentService } from '../services/paymentService'
import { studentService } from '../services/studentService'
import { studentCoursesService } from '../services/studentCoursesService'
import { courseManageService } from '../services/courseManageService'
import { statsService } from '../services/statsService'
import { othersService } from '../services/othersService'
import Modal from '../components/Modal'
import './Payments.css'

const Payments = () => {
  const queryClient = useQueryClient()
  const { hasFunctionPermission } = usePermissions()
  
  // 从 localStorage 恢复页面状态
  const STORAGE_KEY = 'payments_page_state'
  
  // 使用 useMemo 缓存初始状态，避免重复调用
  const initialState = useMemo(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      console.log('[Payments] 读取 localStorage:', { saved, key: STORAGE_KEY })
      if (saved) {
        const parsed = JSON.parse(saved)
        // 确保 viewMode 是有效的值
        const viewMode = parsed.viewMode === 'reminder' ? 'reminder' : 'record'
        console.log('[Payments] 从 localStorage 恢复初始状态:', { viewMode, savedData: parsed })
        return {
          viewMode,
          yearFilter: parsed.yearFilter || '',
          monthFilter: parsed.monthFilter || '',
          studentFilter: parsed.studentFilter || '',
          typeFilter: parsed.typeFilter || '',
          statusFilter: parsed.statusFilter || '',
          currentPage: parsed.currentPage || 1,
        }
      } else {
        console.log('[Payments] localStorage 中没有保存的状态，使用默认状态 (record)')
      }
    } catch (e) {
      console.error('[Payments] 加载状态失败:', e)
    }
    return {
      viewMode: 'record',
      yearFilter: '',
      monthFilter: '',
      studentFilter: '',
      typeFilter: '',
      statusFilter: '',
      currentPage: 1,
    }
  }, []) // 只在组件挂载时执行一次
  
  const [viewMode, setViewMode] = useState(initialState.viewMode) // 'record' 或 'reminder'
  const [yearFilter, setYearFilter] = useState(initialState.yearFilter) // 默认全部年份
  const [monthFilter, setMonthFilter] = useState(initialState.monthFilter) // 默认全部月份
  const [studentFilter, setStudentFilter] = useState(initialState.studentFilter)
  const [typeFilter, setTypeFilter] = useState(initialState.typeFilter)
  const [statusFilter, setStatusFilter] = useState(initialState.statusFilter)
  const [currentPage, setCurrentPage] = useState(initialState.currentPage)
  const [showModal, setShowModal] = useState(false)
  const [paymentType, setPaymentType] = useState('缴费') // '缴费' 或 '退费'
  const [selectedStudentId, setSelectedStudentId] = useState(null) // 用于从提醒页面跳转
  const [editingPayment, setEditingPayment] = useState(null) // 编辑时传入的缴费记录
  const [showCourseSetModal, setShowCourseSetModal] = useState(false)
  const [courseSetStudentId, setCourseSetStudentId] = useState(null)
  const [courseSetStudentName, setCourseSetStudentName] = useState('')

  // 学生默认课程映射（从后端加载，保存时同步到后端）
  const [defaultCourseMap, setDefaultCourseMap] = useState({})

  // 从后端加载默认课程映射
  const { data: backendCourseMap } = useQuery({
    queryKey: ['default-course-map'],
    queryFn: () => studentCoursesService.getDefaultCourseMap(),
    staleTime: 5 * 60 * 1000,
  })

  // 后端数据加载后更新 defaultCourseMap
  useEffect(() => {
    if (backendCourseMap && typeof backendCourseMap === 'object') {
      // 后端返回 {student_id: course_id}，key 是字符串
      const map = {}
      for (const [sid, cid] of Object.entries(backendCourseMap)) {
        map[sid] = cid
      }
      setDefaultCourseMap(map)
    }
  }, [backendCourseMap])

  const saveDefaultCourse = async (studentId, courseId) => {
    // 立即更新前端状态
    setDefaultCourseMap((prev) => {
      const next = { ...prev, [studentId]: courseId }
      return next
    })
    // 同步到后端：创建 StudentCourseDefaultSchedule 记录
    if (courseId) {
      try {
        await studentCoursesService.updateDefaultSchedule(studentId, courseId, {
          default_time_slot: '',
          default_weekday: '',
          default_teacher_id: null,
          default_classroom: '',
        })
        // 刷新默认课程映射和预排课数据
        queryClient.invalidateQueries(['default-course-map'])
        queryClient.invalidateQueries(['paid-courses-need-scheduling'])
      } catch (err) {
        console.warn('保存默认课程到后端失败:', err)
        alert('保存课程失败：' + (err?.message || '未知错误'))
      }
    }
  }

  const perPage = 20
  
  // 使用 ref 保存最新的状态值，确保保存时使用最新值
  const stateRef = useRef({ viewMode, yearFilter, monthFilter, studentFilter, typeFilter, statusFilter, currentPage })
  
  // 更新 ref 当状态变化时
  useEffect(() => {
    stateRef.current = { viewMode, yearFilter, monthFilter, studentFilter, typeFilter, statusFilter, currentPage }
  }, [viewMode, yearFilter, monthFilter, studentFilter, typeFilter, statusFilter, currentPage])
  
  // 组件挂载后验证并同步 localStorage 中的状态（确保刷新后状态正确）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      console.log('[Payments] 组件挂载后检查 localStorage:', { saved, key: STORAGE_KEY })
      if (saved) {
        const parsed = JSON.parse(saved)
        const savedViewMode = parsed.viewMode === 'reminder' ? 'reminder' : 'record'
        console.log(`[Payments] 组件挂载后检查状态: 当前=${viewMode}, 保存=${savedViewMode}`)
        // 如果保存的状态与当前状态不一致，恢复保存的状态
        if (savedViewMode !== viewMode) {
          console.log(`[Payments] 检测到状态不一致（当前: ${viewMode}, 保存: ${savedViewMode}），恢复保存的状态`)
          setViewMode(savedViewMode)
        } else {
          console.log(`[Payments] 状态一致，无需恢复`)
        }
      } else {
        console.log('[Payments] 组件挂载后检查: localStorage 中没有保存的状态')
      }
    } catch (e) {
      console.error('[Payments] 验证状态时出错:', e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 只在组件挂载时执行一次
  
  // 保存页面状态到 localStorage（状态变化时立即保存）
  useEffect(() => {
    const stateToSave = {
      viewMode,
      yearFilter,
      monthFilter,
      studentFilter,
      typeFilter,
      statusFilter,
      currentPage,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave))
      console.log('[Payments] 保存状态到 localStorage:', stateToSave)
    } catch (e) {
      console.error('Failed to save payments page state:', e)
    }
  }, [viewMode, yearFilter, monthFilter, studentFilter, typeFilter, statusFilter, currentPage])

  // 同一学生+课程的分组键：course_id 为空时用 course_name 区分不同课程，避免合并剩余课时
  const getPaymentGroupKey = useCallback((p) => {
    if (p.course_id != null && p.course_id !== '') return `${p.student_id}_${p.course_id}`
    const name = (p.course_name || '').trim()
    return name ? `${p.student_id}_null_${name}` : `${p.student_id}_null`
  }, [])

  // 构建查询参数
  const paymentParams = useMemo(() => {
    const params = {}
    if (monthFilter) {
      const monthStr = String(monthFilter).padStart(2, '0')
      params.month = `${yearFilter}-${monthStr}`
    } else if (yearFilter) {
      params.year = yearFilter
    }
    if (studentFilter) params.student_id = studentFilter
    if (typeFilter) params.type = typeFilter
    // status 筛选在客户端处理
    return params
  }, [yearFilter, monthFilter, studentFilter, typeFilter])

  // 获取缴费列表（缴费记录与缴费提醒共用，需始终拉取以正确显示剩余课时与提醒）
  const { data: paymentsData = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments', paymentParams],
    queryFn: () => paymentService.getPayments(paymentParams),
    enabled: true,
  })

  const payments = Array.isArray(paymentsData) ? paymentsData : paymentsData.payments || []

  // 获取当前月份的课时统计（用于显示剩余课时）
  const currentMonth = new Date().toISOString().slice(0, 7)
  const { data: statsData = [] } = useQuery({
    queryKey: ['stats', currentMonth],
    queryFn: () => statsService.getStats({ month: currentMonth }),
    staleTime: 5 * 60 * 1000,
  })

  // 获取财务配置（提醒阈值）
  const { data: financeConfigs = [] } = useQuery({
    queryKey: ['finance-config'],
    queryFn: () => othersService.getFinanceConfig(),
    staleTime: 30 * 60 * 1000,
  })

  const reminderThreshold = useMemo(() => {
    const config = financeConfigs.find((c) => c.key === 'min_hours_for_reminder')
    return config ? config.value : 3
  }, [financeConfigs])

  // 创建剩余课时映射（按学生和课程）
  const remainingHoursMap = useMemo(() => {
    const map = {}
    if (Array.isArray(statsData)) {
      statsData.forEach((s) => {
        const key = `${s.student_id}_${s.course_id || 'null'}`
        map[key] = s.remaining_hours || 0
      })
    }
    return map
  }, [statsData])

  // 获取学生列表（只显示 /students 页面中的学生，即试课状态为成功的学生）
  const { data: studentsData } = useQuery({
    queryKey: ['students', 'all'],
    queryFn: () => studentService.getStudents({ per_page: 1000, trial_success_only: true }),
    staleTime: 10 * 60 * 1000,
  })

  const students = studentsData?.students || studentsData || []

  // 获取课程列表
  const { data: courses = [] } = useQuery({
    queryKey: ['courses-manage'],
    queryFn: () => courseManageService.getCourses({ status: '启用' }),
    staleTime: 10 * 60 * 1000,
  })

  // 处理缴费数据：添加剩余课时和状态信息，并排序
  const processedPayments = useMemo(() => {
    let processed = payments.map((p) => {
      const status = p.status || '进行中'
      const groupKey = getPaymentGroupKey(p)
      const legacyKey = `${p.student_id}_${p.course_id || 'null'}`
      const remainingHours = p.remaining_hours !== undefined ? p.remaining_hours : (remainingHoursMap[groupKey] ?? remainingHoursMap[legacyKey] ?? 0)
      const remainingCost = p.remaining_cost !== undefined ? p.remaining_cost : remainingHours * (p.unit_price || 0)
      const schedulingPaused = !!p.scheduling_paused

      return {
        ...p,
        _status: status,
        _remainingHours: remainingHours,
        _remainingCost: remainingCost,
        _schedulingPaused: schedulingPaused,
      }
    })

    // 获取所有有缴费记录的学生ID集合
    const studentsWithPayments = new Set(processed.map((p) => p.student_id))

    // 为没有缴费记录的学生创建虚拟记录（同时考虑学生筛选）
    students.forEach((student) => {
      if (!studentsWithPayments.has(student.id)) {
        // 如果选择了学生筛选，跳过不匹配的
        if (studentFilter && String(student.id) !== String(studentFilter)) return
        // 如果筛选退费，不显示未缴费虚拟记录
        if (typeFilter === '退费') return
        // 如果按年/月筛选，未缴费记录无日期，不显示
        if (yearFilter || monthFilter) return
        processed.push({
          id: null,
          student_id: student.id,
          student_name: student.name,
          course_id: null,
          course_name: null,
          type: '缴费',
          payment_date: null,
          paid_amount: 0,
          discount_rate: 0,
          class_hours: 0,
          unit_price: 0,
          remaining_hours: 0,
          remaining_cost: 0,
          status: null,
          notes: null,
          scheduling_paused: false,
          _status: '未缴费',
          _remainingHours: 0,
          _remainingCost: 0,
          _schedulingPaused: false,
          _isNoPayment: true, // 标记为无缴费记录
        })
      }
    })

    // 应用状态筛选（欠费 / 进行中 / 暂停排课 / 结束 / 未缴费）
    if (statusFilter) {
      if (statusFilter === '暂停排课') {
        processed = processed.filter((p) => p._status === '进行中' && p._schedulingPaused)
      } else if (statusFilter === '进行中') {
        processed = processed.filter((p) => p._status === '进行中' && !p._schedulingPaused)
      } else {
        processed = processed.filter((p) => p._status === statusFilter)
      }
    }

    // 排序：欠费最前，其次未缴费，然后进行中/暂停排课按剩余课时升序，结束放最后
    processed.sort((a, b) => {
      if (a._status === '结束' && b._status !== '结束') return 1
      if (a._status !== '结束' && b._status === '结束') return -1
      if (a._status === '欠费' && b._status !== '欠费') return -1
      if (a._status !== '欠费' && b._status === '欠费') return 1
      if (a._status === '未缴费' && b._status !== '未缴费') return -1
      if (a._status !== '未缴费' && b._status === '未缴费') return 1
      if (a._status !== '结束' && b._status !== '结束') {
        return a._remainingHours - b._remainingHours
      }
      return 0
    })

    return processed
  }, [payments, remainingHoursMap, statusFilter, studentFilter, typeFilter, yearFilter, monthFilter, getPaymentGroupKey, students])

  // 计算合计（所有筛选后的数据，排除未缴费记录）
  const totals = useMemo(() => {
    let totalPaidAmount = 0
    let totalDiscount = 0
    let totalRefundAmount = 0
    let totalRemainingCost = 0

    processedPayments.forEach((p) => {
      // 排除未缴费记录
      if (p._status === '未缴费') return
      
      const multiplier = p.type === '退费' ? -1 : 1
      totalPaidAmount += (p.paid_amount || 0) * multiplier
      totalDiscount += (p.discount_rate || 0) * multiplier
      if (p.type === '退费') {
        totalRefundAmount += Math.abs(p.paid_amount || 0)
      }
      if (p.type === '缴费') {
        totalRemainingCost += p._remainingCost || 0
      }
    })

    return {
      totalPaidAmount,
      totalDiscount,
      totalRefundAmount,
      totalRemainingCost,
    }
  }, [processedPayments])

  // 同一学生同一课程（缴费、非结束）的累计剩余课时：按缴费日期从前往后累计（1月28日+1月29日+...）
  const cumulativeRemainingByKey = useMemo(() => {
    const byKey = {}
    for (const p of processedPayments) {
      // 排除未缴费记录
      if (p._status === '未缴费' || p.type !== '缴费' || p._status === '结束') continue
      const key = getPaymentGroupKey(p)
      if (!byKey[key]) byKey[key] = []
      byKey[key].push(p)
    }
    const map = {}
    for (const key of Object.keys(byKey)) {
      const list = byKey[key].sort((a, b) => (a.payment_date || '').localeCompare(b.payment_date || ''))
      map[key] = list.reduce((sum, p) => sum + (p._remainingHours || 0), 0)
    }
    return map
  }, [processedPayments, getPaymentGroupKey])

  // 分页
  const totalPages = Math.ceil(processedPayments.length / perPage)
  const startIndex = (currentPage - 1) * perPage
  const paginatedPayments = processedPayments.slice(startIndex, startIndex + perPage)

  // 缴费提醒：同一学生同一课程累计剩余课时 <= 阈值时展示（含欠费，需补足欠费）
  const reminderData = useMemo(() => {
    if (viewMode !== 'reminder') return []
    const list = []
    const seen = new Set()
    for (const p of processedPayments) {
      // 排除未缴费记录
      if (p._status === '未缴费' || p.type !== '缴费' || p._status === '结束') continue
      const key = getPaymentGroupKey(p)
      if (seen.has(key)) continue
      const cumulative = cumulativeRemainingByKey[key] ?? 0
      if (cumulative > reminderThreshold) continue
      seen.add(key)
      list.push({
        student_id: p.student_id,
        course_id: p.course_id,
        course_name: p.course_name,
        student_name: p.student_name,
        remaining_hours: cumulative,
      })
    }
    return list
  }, [viewMode, processedPayments, cumulativeRemainingByKey, reminderThreshold, getPaymentGroupKey])

  // Mutations
  const createMutation = useMutation({
    mutationFn: paymentService.createPayment,
    onSuccess: () => {
      queryClient.invalidateQueries(['payments'])
      queryClient.invalidateQueries(['stats'])
      setShowModal(false)
      setSelectedStudentId(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => paymentService.updatePayment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['payments'])
      queryClient.invalidateQueries(['stats'])
      setShowModal(false)
      setEditingPayment(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: paymentService.deletePayment,
    onSuccess: () => {
      queryClient.invalidateQueries(['payments'])
      queryClient.invalidateQueries(['stats'])
      alert('删除成功！')
    },
    onError: (error) => {
      alert('删除失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const toggleSchedulingPausedMutation = useMutation({
    mutationFn: ({ studentId, courseId, paused }) =>
      studentCoursesService.updateSchedulingPaused(studentId, courseId, paused),
    onSuccess: () => {
      queryClient.invalidateQueries(['payments'])
      // 使排课管理、学生课程、全部排课等页面的「需要排课」列表及时更新
      queryClient.invalidateQueries(['paid-courses-need-scheduling'])
    },
    onError: (error) => {
      alert('操作失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const handleToggleSchedulingPaused = (p) => {
    if (p.type !== '缴费' || !p.course_id || p._status === '结束' || p._status === '欠费') return
    const newPaused = !p._schedulingPaused
    toggleSchedulingPausedMutation.mutate({
      studentId: p.student_id,
      courseId: p.course_id,
      paused: newPaused,
    })
  }

  // 初始化年份选项
  useEffect(() => {
    // 年份选项在渲染时生成
  }, [])

  // 处理筛选变化时重置到第一页
  useEffect(() => {
    setCurrentPage(1)
  }, [yearFilter, monthFilter, studentFilter, typeFilter, statusFilter])

  // 处理从提醒页面跳转
  useEffect(() => {
    if (selectedStudentId && showModal) {
      // 模态框打开后设置学生
      setTimeout(() => {
        const studentSelect = document.getElementById('payment-student-select')
        if (studentSelect) {
          studentSelect.value = selectedStudentId
          const changeEvent = new Event('change', { bubbles: true })
          studentSelect.dispatchEvent(changeEvent)
        }
      }, 100)
    }
  }, [selectedStudentId, showModal])

  const handleDelete = (id) => {
    if (window.confirm('确定要删除这条缴费记录吗？')) {
      deleteMutation.mutate(id)
    }
  }

  // 保存状态的辅助函数
  const saveStateToStorage = useCallback((newViewMode) => {
    try {
      // 使用 ref 中的最新值
      const stateToSave = {
        viewMode: newViewMode,
        yearFilter: stateRef.current.yearFilter,
        monthFilter: stateRef.current.monthFilter,
        studentFilter: stateRef.current.studentFilter,
        typeFilter: stateRef.current.typeFilter,
        statusFilter: stateRef.current.statusFilter,
        currentPage: stateRef.current.currentPage,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave))
      console.log(`[Payments] 立即保存状态到 localStorage (${newViewMode}):`, stateToSave)
    } catch (e) {
      console.error('[Payments] 保存状态失败:', e)
    }
  }, [])

  const handleShowPaymentRecord = () => {
    console.log('[Payments] 切换到缴费记录视图')
    setViewMode('record')
    // 立即保存状态
    saveStateToStorage('record')
  }

  const handleShowPaymentReminder = () => {
    console.log('[Payments] 切换到缴费提醒视图')
    setViewMode('reminder')
    // 立即保存状态
    saveStateToStorage('reminder')
  }

  const handleAddPayment = () => {
    setPaymentType('缴费')
    setSelectedStudentId(null)
    setEditingPayment(null)
    setShowModal(true)
  }

  const handleAddRefund = () => {
    setPaymentType('退费')
    setSelectedStudentId(null)
    setEditingPayment(null)
    setShowModal(true)
  }

  const handleEditPayment = (p) => {
    setPaymentType(p.type || '缴费')
    setEditingPayment(p)
    setSelectedStudentId(null)
    setShowModal(true)
  }

  const handleOpenCourseSet = (studentId, studentName) => {
    setCourseSetStudentId(studentId)
    setCourseSetStudentName(studentName)
    setShowCourseSetModal(true)
  }

  const handleReminderAddPayment = (studentId) => {
    setViewMode('record')
    setPaymentType('缴费')
    setSelectedStudentId(studentId)
    setShowModal(true)
  }

  const handleExportPayments = () => {
    let url = '/api/export/payments'
    const params = []
    if (yearFilter) params.push(`year=${yearFilter}`)
    if (monthFilter) params.push(`month=${monthFilter}`)
    if (params.length > 0) url += '?' + params.join('&')
    window.open(url, '_blank')
  }

  const changePage = (delta) => {
    const newPage = currentPage + delta
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
    }
  }

  const clearFilters = () => {
    setYearFilter('')
    setMonthFilter('')
    setStudentFilter('')
    setTypeFilter('')
    setStatusFilter('')
    setCurrentPage(1)
  }

  // 生成年份选项
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const years = []
    for (let i = currentYear; i >= currentYear - 10; i--) {
      years.push(i)
    }
    return years
  }, [])

  if (paymentsLoading && viewMode === 'record') {
    return <div className="loading">加载中...</div>
  }

  return (
    <div className="payments-page" style={{ width: '100%' }}>
      <div className="page-header">
        <h1>缴费管理</h1>
      </div>

      {/* 合计栏 */}
      <div
        id="payment-totals-summary"
        style={{
          marginBottom: '20px',
          padding: '15px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div style={{ textAlign: 'center', color: 'white' }}>
            <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '5px' }}>缴费总额</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }} id="total-paid-amount">
              {totals.totalPaidAmount.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'center', color: 'white' }}>
            <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '5px' }}>优惠总额</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }} id="total-discount">
              {totals.totalDiscount.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'center', color: 'white' }}>
            <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '5px' }}>退费总额</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }} id="total-refund-amount">
              {totals.totalRefundAmount.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'center', color: 'white' }}>
            <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '5px' }}>剩余费用</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }} id="total-remaining-cost">
              {totals.totalRemainingCost.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="toolbar">
        <button
          className={`btn ${viewMode === 'record' ? 'btn-primary' : 'btn-secondary'}`}
          id="btn-payment-record"
          onClick={handleShowPaymentRecord}
        >
          缴费记录
        </button>
        <button
          className={`btn ${viewMode === 'reminder' ? 'btn-primary' : 'btn-secondary'}`}
          id="btn-payment-reminder"
          onClick={handleShowPaymentReminder}
        >
          缴费提醒
        </button>
        {hasFunctionPermission('payments', 'export') && (
          <button className="btn btn-secondary" onClick={handleExportPayments}>
            导出Excel
          </button>
        )}
        <select id="payment-year" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
          <option value="">全部年份</option>
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}年
            </option>
          ))}
        </select>
        <select
          id="payment-month"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px' }}
        >
          <option value="">全部月份</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
            <option key={month} value={month}>
              {month}月
            </option>
          ))}
        </select>
        <select id="payment-student-filter" value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
          <option value="">全部学生</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select id="payment-type-filter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">全部类型</option>
          <option value="缴费">缴费</option>
          <option value="退费">退费</option>
        </select>
        <select id="payment-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">全部状态</option>
          <option value="欠费">欠费</option>
          <option value="进行中">进行中</option>
          <option value="暂停排课">暂停排课</option>
          <option value="结束">结束</option>
          <option value="未缴费">未缴费</option>
        </select>
        <button className="btn btn-secondary" onClick={clearFilters}>
          清除筛选
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          {hasFunctionPermission('payments', 'add') && (
            <button className="btn btn-primary" onClick={handleAddPayment}>
              新增缴费
            </button>
          )}
          {hasFunctionPermission('payments', 'add') && (
            <button className="btn btn-warning" onClick={handleAddRefund}>
              新增退费
            </button>
          )}
        </div>
      </div>

      {/* 缴费记录视图 */}
      {viewMode === 'record' && (
        <div id="payment-record-view">
          <div className="table-wrapper">
            <table className="data-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>类型</th>
                <th>日期</th>
                <th>学生</th>
                <th>课程</th>
                <th>原始费用</th>
                <th>优惠</th>
                <th>金额</th>
                <th>节数</th>
                <th>单价</th>
                <th>剩余课时</th>
                <th>剩余费用</th>
                <th>状态</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="payments-table-body">
              {paginatedPayments.length > 0 ? (
                paginatedPayments.map((p, index) => {
                  const sequenceNumber = startIndex + index + 1
                  const type = p.type || '缴费'
                  const status = p._status
                  const remainingHours = p._remainingHours
                  const remainingCost = p._remainingCost

                  const typeBadge =
                    type === '退费' ? (
                      <span className="status-badge" style={{ background: '#dc3545', color: 'white' }}>
                        退费
                      </span>
                    ) : (
                      <span className="status-badge" style={{ background: '#28a745', color: 'white' }}>
                        缴费
                      </span>
                    )

                  const amountColor = type === '退费' ? { color: '#dc3545', fontWeight: 'bold' } : {}
                  const amountPrefix = type === '退费' ? '-' : ''

                  const canToggleScheduling = type === '缴费' && p.course_id && status === '进行中'
                  const statusBadge =
                    status === '未缴费' ? (
                      <span className="status-badge" style={{ background: '#ffc107', color: '#000' }}>
                        未缴费
                      </span>
                    ) : status === '欠费' ? (
                      <span className="status-badge" style={{ background: '#dc3545', color: 'white' }}>
                        欠费
                      </span>
                    ) : status === '结束' ? (
                      <span className="status-badge" style={{ background: '#6c757d', color: 'white' }}>
                        结束
                      </span>
                    ) : p._schedulingPaused ? (
                      <span
                        role="button"
                        tabIndex={0}
                        className="status-badge"
                        style={{
                          background: '#fd7e14',
                          color: 'white',
                          cursor: canToggleScheduling ? 'pointer' : 'default',
                        }}
                        title={canToggleScheduling ? '点击恢复为进行中，可排课' : ''}
                        onClick={() => canToggleScheduling && handleToggleSchedulingPaused(p)}
                        onKeyDown={(e) =>
                          canToggleScheduling && (e.key === 'Enter' || e.key === ' ') && handleToggleSchedulingPaused(p)
                        }
                      >
                        暂停排课
                      </span>
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        className="status-badge"
                        style={{
                          background: '#17a2b8',
                          color: 'white',
                          cursor: canToggleScheduling ? 'pointer' : 'default',
                        }}
                        title={canToggleScheduling ? '点击暂停排课，之后将不再进行排课' : ''}
                        onClick={() => canToggleScheduling && handleToggleSchedulingPaused(p)}
                        onKeyDown={(e) =>
                          canToggleScheduling && (e.key === 'Enter' || e.key === ' ') && handleToggleSchedulingPaused(p)
                        }
                      >
                        进行中
                      </span>
                    )

                  const remainingHoursColor = remainingHours < 0 ? { color: '#dc3545', fontWeight: 'bold' } : {}
                  const remainingCostColor = remainingCost < 0 ? { color: '#dc3545', fontWeight: 'bold' } : {}
                  const remainingCostPrefix = remainingCost < 0 ? '-' : ''

                  const cumulativeKey = getPaymentGroupKey(p)
                  const cumulativeHours = type === '缴费' && status !== '结束' ? (cumulativeRemainingByKey[cumulativeKey] ?? 0) : 0
                  const hoursLow = cumulativeHours <= reminderThreshold && type === '缴费' && status !== '结束'
                  const isArrears = status === '欠费'
                  const isNoPayment = status === '未缴费'
                  const needsReminder = isArrears || hoursLow || isNoPayment // 未缴费也需要提醒
                  const rowStyle =
                    status === '结束'
                      ? { color: '#999', opacity: 0.7 }
                      : needsReminder
                        ? { color: '#dc3545', backgroundColor: 'rgba(220, 53, 69, 0.08)' }
                        : {}

                  return (
                    <tr key={isNoPayment ? `no-payment-${p.student_id}` : p.id} style={rowStyle}>
                      <td>{sequenceNumber}</td>
                      <td>{typeBadge}</td>
                      <td>{isNoPayment ? '-' : (p.payment_date || '-')}</td>
                      <td>
                        {p.student_name}
                      </td>
                      <td>
                        {p.course_name || (isNoPayment && defaultCourseMap[p.student_id] ? (
                          <span style={{ color: '#17a2b8', fontStyle: 'italic', fontSize: '12px' }}>
                            {courses.find((c) => c.id === defaultCourseMap[p.student_id])?.name || '-'}
                            <span style={{ color: '#999' }}>（默认）</span>
                          </span>
                        ) : '-')}
                      </td>
                      <td>{isNoPayment ? '-' : ((p.original_amount || 0).toFixed(2))}</td>
                      <td>{isNoPayment ? '-' : ((p.discount_rate || 0).toFixed(2))}</td>
                      <td style={amountColor}>
                        {isNoPayment ? '-' : `${amountPrefix}${(p.paid_amount || 0).toFixed(2)}`}
                      </td>
                      <td>{isNoPayment ? '-' : (p.class_count || 0)}</td>
                      <td>{isNoPayment ? '-' : (p.unit_price ? p.unit_price.toFixed(2) : '-')}</td>
                      <td style={remainingHoursColor}>{isNoPayment ? '-' : remainingHours.toFixed(2)}</td>
                      <td style={remainingCostColor}>
                        {isNoPayment ? '-' : `${remainingCostPrefix}${Math.abs(remainingCost).toFixed(2)}`}
                      </td>
                      <td>{statusBadge}</td>
                      <td>{p.remark || '-'}</td>
                      <td>
                        {isNoPayment ? (
                          <>
                            {hasFunctionPermission('payments', 'add') && (
                              <button
                                className="btn btn-primary"
                                style={{ marginRight: '4px' }}
                                onClick={() => {
                                  setSelectedStudentId(p.student_id)
                                  setPaymentType('缴费')
                                  setEditingPayment(null)
                                  setShowModal(true)
                                }}
                              >
                                新增缴费
                              </button>
                            )}
                            <button
                              className="btn btn-secondary"
                              onClick={() => handleOpenCourseSet(p.student_id, p.student_name)}
                              title="设置新增缴费时的默认课程"
                            >
                              设置课程
                            </button>
                          </>
                        ) : (
                          <>
                            {hasFunctionPermission('payments', 'edit') && (
                              <button
                                className="btn btn-secondary"
                                style={{ marginRight: '8px' }}
                                onClick={() => handleEditPayment(p)}
                              >
                                编辑
                              </button>
                            )}
                            {hasFunctionPermission('payments', 'delete') && (
                              <button className="btn btn-danger" onClick={() => handleDelete(p.id)}>
                                删除
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="15" style={{ textAlign: 'center', padding: '20px' }}>
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          {/* 分页控件 */}
          {totalPages > 1 && (
            <div
              id="payment-pagination"
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '10px',
                marginTop: '20px',
                padding: '10px',
              }}
            >
              <button
                id="payment-prev-btn"
                className="btn btn-secondary"
                onClick={() => changePage(-1)}
                disabled={currentPage === 1}
              >
                上一页
              </button>
              <span id="payment-page-info" style={{ padding: '0 10px' }}>
                第 {currentPage} 页，共 {totalPages} 页
              </span>
              <button
                id="payment-next-btn"
                className="btn btn-secondary"
                onClick={() => changePage(1)}
                disabled={currentPage === totalPages}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      )}

      {/* 缴费提醒视图 */}
      {viewMode === 'reminder' && (
        <div id="payment-reminder-view">
          <div className="table-wrapper">
            <table className="data-table">
            <thead>
              <tr>
                <th>学生</th>
                <th>课程</th>
                <th>年级</th>
                <th>剩余课时</th>
                <th>联系电话</th>
                <th>家长姓名</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="payment-reminder-table-body">
              {reminderData.length > 0 ? (
                reminderData.map((s) => {
                  const student = students.find((st) => st.id === s.student_id) || {}
                  const remainingHours = s.remaining_hours || 0
                  const urgencyStyle =
                    remainingHours < 0
                      ? { color: '#dc3545', fontWeight: 'bold' }
                      : remainingHours < 1
                        ? { color: '#ff6b6b', fontWeight: 'bold' }
                        : { color: '#ff9800', fontWeight: 'bold' }
                  const urgencyText =
                    remainingHours < 0
                      ? '（需要补足欠费）'
                      : remainingHours < 1
                        ? '（急需缴费）'
                        : '（建议缴费）'

                  return (
                    <tr key={`${s.student_id}_${s.course_id ?? 'null'}_${(s.course_name || '').trim()}`}>
                      <td style={urgencyStyle}>
                        {s.student_name}
                        {urgencyText}
                      </td>
                      <td>{(s.course_name || '').trim() || '-'}</td>
                      <td>{student.grade || '-'}</td>
                      <td style={urgencyStyle}>{remainingHours.toFixed(2)}</td>
                      <td>{student.phone || '-'}</td>
                      <td>{student.parent_name || '-'}</td>
                      <td>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleReminderAddPayment(s.student_id)}
                        >
                          立即缴费
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>
                    暂无需要缴费提醒的学生
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* 设置课程弹窗 */}
      {showCourseSetModal && (
        <Modal
          isOpen={showCourseSetModal}
          onClose={() => setShowCourseSetModal(false)}
          title={`设置默认课程 - ${courseSetStudentName}`}
        >
          <div className="form-group">
            <label>选择课程</label>
            <select
              value={defaultCourseMap[courseSetStudentId] || ''}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value) : null
                saveDefaultCourse(courseSetStudentId, val)
              }}
            >
              <option value="">-- 不设置默认课程 --</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (单价: {c.unit_price}元)
                </option>
              ))}
            </select>
            <small style={{ color: '#666', display: 'block', marginTop: '8px' }}>
              设置后，为该学生新增缴费时将自动选中此课程
            </small>
          </div>
          <div className="form-actions" style={{ marginTop: '16px' }}>
            <button type="button" className="btn" onClick={() => setShowCourseSetModal(false)}>
              关闭
            </button>
          </div>
        </Modal>
      )}

      {/* 新增缴费/退费模态框 */}
      {showModal && (
        <PaymentModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false)
            setSelectedStudentId(null)
            setEditingPayment(null)
          }}
          paymentType={paymentType}
          students={students}
          courses={courses}
          stats={statsData}
          financeConfigs={financeConfigs}
          selectedStudentId={selectedStudentId}
          editingPayment={editingPayment}
          defaultCourseMap={defaultCourseMap}
          onSubmit={(data) =>
            editingPayment
              ? updateMutation.mutate({ id: editingPayment.id, data })
              : createMutation.mutate(data)
          }
          isLoading={createMutation.isLoading || updateMutation.isLoading}
        />
      )}
    </div>
  )
}

// 缴费/退费模态框组件
const PaymentModal = ({
  isOpen,
  onClose,
  paymentType,
  students,
  courses,
  stats,
  financeConfigs,
  selectedStudentId,
  editingPayment,
  defaultCourseMap = {},
  onSubmit,
  isLoading,
}) => {
  const [selectedStudent, setSelectedStudent] = useState('')
  const [selectedCourse, setSelectedCourse] = useState('')
  const [classCount, setClassCount] = useState('')
  const [originalAmount, setOriginalAmount] = useState('')
  const [discountRate, setDiscountRate] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [remark, setRemark] = useState('')
  const [paymentDate, setPaymentDate] = useState('')

  const reminderThreshold = financeConfigs.find((c) => c.key === 'min_hours_for_reminder')?.value || 3
  const isEditMode = !!editingPayment

  // 创建剩余课时映射
  const remainingHoursMap = useMemo(() => {
    const map = {}
    if (Array.isArray(stats)) {
      stats.forEach((s) => {
        const key = `${s.student_id}_${s.course_id || 'null'}`
        map[key] = s.remaining_hours || 0
      })
    }
    return map
  }, [stats])

  // 编辑模式：用 editingPayment 预填表单
  useEffect(() => {
    if (isOpen && editingPayment) {
      setSelectedStudent(String(editingPayment.student_id))
      setSelectedCourse(editingPayment.course_id != null ? String(editingPayment.course_id) : '')
      setClassCount(String(editingPayment.class_count ?? ''))
      setOriginalAmount(editingPayment.original_amount != null ? String(editingPayment.original_amount) : '')
      setDiscountRate(editingPayment.discount_rate != null ? String(editingPayment.discount_rate) : '')
      setPaidAmount(editingPayment.paid_amount != null ? String(editingPayment.paid_amount) : '')
      setRemark(editingPayment.remark || '')
      setPaymentDate(editingPayment.payment_date || new Date().toISOString().split('T')[0])
    }
  }, [isOpen, editingPayment])

  // 当模态框打开时（非编辑），设置选中的学生和默认课程
  useEffect(() => {
    if (isOpen && !editingPayment && selectedStudentId) {
      setSelectedStudent(selectedStudentId.toString())
      // 预选默认课程
      const defCourseId = defaultCourseMap[selectedStudentId]
      if (defCourseId) {
        setSelectedCourse(String(defCourseId))
      }
    } else if (isOpen && !editingPayment) {
      setSelectedStudent('')
    }
  }, [isOpen, selectedStudentId, editingPayment, defaultCourseMap])

  // 重置表单（关闭时或非编辑打开时）
  useEffect(() => {
    if (!isOpen) {
      setSelectedStudent('')
      setSelectedCourse('')
      setClassCount('')
      setOriginalAmount('')
      setDiscountRate('')
      setPaidAmount('')
      setRemark('')
      setPaymentDate('')
    } else if (!editingPayment) {
      setPaymentDate(new Date().toISOString().split('T')[0])
    }
  }, [isOpen, editingPayment])

  // 计算缴费金额
  useEffect(() => {
    const original = parseFloat(originalAmount) || 0
    const discount = parseFloat(discountRate) || 0
    const paid = original - discount
    setPaidAmount(paid > 0 ? paid.toFixed(2) : '0.00')
  }, [originalAmount, discountRate])

  // 当选择课程时，自动计算原始费用
  const handleCourseChange = (e) => {
    const courseId = e.target.value
    setSelectedCourse(courseId)
    const course = courses.find((c) => c.id === parseInt(courseId))
    if (course && classCount) {
      const amount = course.unit_price * parseFloat(classCount)
      setOriginalAmount(amount.toFixed(2))
    } else {
      setOriginalAmount('')
    }
  }

  // 当输入节数时，如果有课程，自动计算原始费用
  const handleClassCountChange = (e) => {
    const count = e.target.value
    setClassCount(count)
    if (selectedCourse && count) {
      const course = courses.find((c) => c.id === parseInt(selectedCourse))
      if (course) {
        const amount = course.unit_price * parseFloat(count)
        setOriginalAmount(amount.toFixed(2))
      }
    }
  }

  // 获取当前学生的剩余课时显示
  const getRemainingHoursDisplay = () => {
    if (!selectedStudent) {
      return { text: '请选择学生查看剩余课时', style: { background: '#f5f5f5', color: '#333' } }
    }

    const studentId = parseInt(selectedStudent)
    const courseId = selectedCourse ? parseInt(selectedCourse) : null
    const key = `${studentId}_${courseId || 'null'}`
    const remainingHours = remainingHoursMap[key] || 0

    if (courseId) {
      const course = courses.find((c) => c.id === courseId)
      const courseName = course ? course.name : '未知课程'
      if (remainingHours < reminderThreshold) {
        return {
          text: `⚠️ ${courseName} 剩余课时: ${remainingHours.toFixed(2)}，低于 ${reminderThreshold}`,
          style: { background: '#fff3cd', color: '#856404' },
        }
      } else {
        return {
          text: `${courseName} 剩余课时: ${remainingHours.toFixed(2)}`,
          style: { background: '#d4edda', color: '#155724' },
        }
      }
    } else {
      // 显示该学生所有课程的剩余课时
      const studentStats = stats.filter((s) => s.student_id === studentId)
      if (studentStats.length > 0) {
        const hoursList = studentStats
          .map((st) => `${st.course_name || '未命名课程'}: ${st.remaining_hours || 0}`)
          .join('; ')
        return {
          text: `剩余课时: ${hoursList}`,
          style: { background: '#f5f5f5', color: '#333' },
        }
      } else {
        return {
          text: '剩余课时: 0',
          style: { background: '#f5f5f5', color: '#333' },
        }
      }
    }
  }

  const remainingHoursDisplay = getRemainingHoursDisplay()

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = {
      type: paymentType,
      payment_date: e.target.payment_date.value,
      student_id: parseInt(selectedStudent),
      course_id: selectedCourse ? parseInt(selectedCourse) : null,
      class_count: parseInt(classCount),
      original_amount: parseFloat(originalAmount),
      discount_rate: parseFloat(discountRate) || 0,
      remark: remark || '',
    }

    if (!data.course_id) {
      alert('必须指定课程')
      return
    }

    onSubmit(data)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`新增${paymentType}`}>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>{paymentType}日期 *</label>
          <input
            type="date"
            name="payment_date"
            defaultValue={new Date().toISOString().split('T')[0]}
            required
          />
        </div>
        <div className="form-group">
          <label>学生 *</label>
          <select
            id="payment-student-select"
            name="student_id"
            value={selectedStudent}
            onChange={(e) => setSelectedStudent(e.target.value)}
            required
          >
            <option value="">请选择学生</option>
            {students.map((s) => {
              const studentStats = stats.filter((st) => st.student_id === s.id)
              let displayText = s.name
              if (studentStats.length > 0) {
                const hoursList = studentStats
                  .map((st) => `${st.course_name || '未命名课程'}(${st.remaining_hours || 0})`)
                  .join('; ')
                displayText += ` - 剩余课时: ${hoursList}`
              } else {
                displayText += ' - 剩余课时: 0'
              }
              return (
                <option key={s.id} value={s.id}>
                  {displayText}
                </option>
              )
            })}
          </select>
        </div>
        <div
          id="payment-remaining-hours-display"
          style={{
            margin: '-10px 0 15px 0',
            padding: '8px',
            ...remainingHoursDisplay.style,
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          <span id="payment-remaining-hours-text">{remainingHoursDisplay.text}</span>
        </div>
        <div className="form-group">
          <label>课程（可选）</label>
          <select
            id="payment-course-select"
            name="course_id"
            value={selectedCourse}
            onChange={handleCourseChange}
          >
            <option value="">-- 选择课程（可选，将自动计算费用）--</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id} data-price={c.unit_price}>
                {c.name} (单价: {c.unit_price}元)
              </option>
            ))}
          </select>
          <small style={{ color: '#666' }}>选择课程后，将根据课程单价和报课节数自动计算原始费用</small>
        </div>
        <div className="form-group">
          <label>{paymentType === '退费' ? '退费' : '报课'}节数 *</label>
          <input
            type="number"
            id="payment-class-count"
            name="class_count"
            step="1"
            required
            min="1"
            value={classCount}
            onChange={handleClassCountChange}
          />
        </div>
        <div className="form-group">
          <label>原始费用 *</label>
          <input
            type="number"
            id="payment-original-amount"
            name="original_amount"
            step="0.01"
            required
            value={originalAmount}
            onChange={(e) => setOriginalAmount(e.target.value)}
          />
          <small style={{ color: '#666' }}>选择课程后将自动计算，也可手动输入</small>
        </div>
        <div className="form-group">
          <label>优惠（可为负数，负数表示加价）</label>
          <input
            type="number"
            id="payment-discount-rate"
            name="discount_rate"
            step="0.01"
            value={discountRate}
            onChange={(e) => setDiscountRate(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>{paymentType === '退费' ? '退费' : '缴费'}金额</label>
          <input
            type="number"
            id="payment-paid-amount"
            name="paid_amount"
            step="0.01"
            value={paidAmount}
            readOnly
            style={{ backgroundColor: '#f5f5f5' }}
          />
          <small style={{ color: '#666' }}>自动计算：原始费用 - 优惠（优惠为负数时表示加价）</small>
        </div>
        <div className="form-group">
          <label>备注</label>
          <textarea name="remark" rows="3" value={remark} onChange={(e) => setRemark(e.target.value)}></textarea>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose} disabled={isLoading}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default Payments
