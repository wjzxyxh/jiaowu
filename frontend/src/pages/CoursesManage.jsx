import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '../hooks/usePermissions'
import { courseManageService } from '../services/courseManageService'
import { teacherService } from '../services/teacherService'
import { studentService } from '../services/studentService'
import api from '../services/api'
import Modal from '../components/Modal'
import './CoursesManage.css'

/** 课程成本相关 API 错误文案（兼容 axios 拦截器抛出的对象） */
function teacherCostApiErrorMessage(err) {
  if (err == null) return '未知错误'
  if (typeof err === 'string') return err
  return err.error || err.message || err?.response?.data?.error || '未知错误'
}

const CoursesManage = () => {
  const { hasFunctionPermission } = usePermissions()
  const [activeTab, setActiveTab] = useState('courses')
  const [showModal, setShowModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [historyData, setHistoryData] = useState([])
  const queryClient = useQueryClient()

  /** 课程成本写入库后，刷新依赖课酬/财务统计的页面数据 */
  const invalidateTeacherCostRelated = () => {
    queryClient.invalidateQueries({ queryKey: ['teacher-course-costs'] })
    queryClient.invalidateQueries({ queryKey: ['teacher-hours'] })
    queryClient.invalidateQueries({ queryKey: ['finance'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
  }

  // 课程管理数据
  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['courses-manage'],
    queryFn: () => courseManageService.getCourses(),
  })

  // 课程成本数据
  const { data: teacherCosts = [], isLoading: teacherCostsLoading } = useQuery({
    queryKey: ['teacher-course-costs'],
    queryFn: async () => {
      return api.get('/teacher-course-costs')
    },
  })

  // 经验成本数据
  const { data: experienceCosts = [], isLoading: experienceCostsLoading } = useQuery({
    queryKey: ['teacher-experience-costs'],
    queryFn: async () => {
      return api.get('/teacher-experience-costs')
    },
    enabled: activeTab === 'experience-costs',
  })

  // 获取教师列表（用于下拉选择）
  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers', '启用'],
    queryFn: () => teacherService.getTeachers({ status: '启用' }),
  })

  // 获取学生列表（用于经验成本）
  const { data: studentsData } = useQuery({
    queryKey: ['students', '在校'],
    queryFn: () => studentService.getStudents({ status: '在校', per_page: 1000 }),
    enabled: activeTab === 'experience-costs',
  })

  const students = studentsData?.students || studentsData || []

  // 课程成本列表：筛选条件（科目、课程类型、教师、状态；状态默认「启用」）
  const [costListFilters, setCostListFilters] = useState({
    subject: '',
    courseType: '',
    teacher: '',
    status: '启用',
  })

  const teacherCostRows = useMemo(() => {
    return teacherCosts.map((tc) => {
      const course = courses.find((c) => c.id === tc.course_id)
      const status = tc.status === '停用' ? '停用' : '启用'
      return {
        ...tc,
        status,
        subject: course?.subject || '未分类',
        courseType: course?.name || tc.course_name || '',
      }
    })
  }, [teacherCosts, courses])

  const isTeacherCostStopped = (line) => line.status === '停用'

  const patchTeacherCostStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      return api.put(`/teacher-course-costs/${id}`, { status })
    },
    onSuccess: () => {
      invalidateTeacherCostRelated()
    },
    onError: (error) => {
      alert('更新状态失败：' + teacherCostApiErrorMessage(error))
    },
  })

  const enabledTeachersSorted = useMemo(() => {
    return [...teachers].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'))
  }, [teachers])

  const costsByTeacherId = useMemo(() => {
    const m = {}
    teacherCostRows.forEach((r) => {
      if (!m[r.teacher_id]) m[r.teacher_id] = []
      m[r.teacher_id].push(r)
    })
    return m
  }, [teacherCostRows])

  const costFilterOptions = useMemo(() => {
    const subjects = new Set()
    const courseTypes = new Set()
    teacherCostRows.forEach((r) => {
      subjects.add(r.subject)
      courseTypes.add(r.courseType)
    })
    courses
      .filter((c) => c.status === '启用')
      .forEach((c) => {
        if (c.subject) subjects.add(c.subject)
        if (c.name) courseTypes.add(c.name)
      })
    return {
      subjects: Array.from(subjects).sort((a, b) => a.localeCompare(b, 'zh-CN')),
      courseTypes: Array.from(courseTypes).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    }
  }, [teacherCostRows, courses])

  /** 每位启用教师一块；成本行经科目/课程/状态筛选；无匹配成本时整块可隐藏（仍保留无成本教师） */
  const teacherCostTableBlocks = useMemo(() => {
    const hasLineDimFilter = Boolean(
      costListFilters.subject ||
        costListFilters.courseType ||
        costListFilters.status !== '',
    )

    const lineSort = (a, b) => {
      const bySub = a.subject.localeCompare(b.subject, 'zh-CN')
      if (bySub !== 0) return bySub
      return a.courseType.localeCompare(b.courseType, 'zh-CN')
    }

    const filterLines = (lines) =>
      lines.filter((r) => {
        if (costListFilters.subject && r.subject !== costListFilters.subject) return false
        if (costListFilters.courseType && r.courseType !== costListFilters.courseType) return false
        if (costListFilters.status !== '') {
          const st = r.status === '停用' ? '停用' : '启用'
          if (st !== costListFilters.status) return false
        }
        return true
      })

    const blocks = []

    enabledTeachersSorted.forEach((t) => {
      if (costListFilters.teacher && t.name !== costListFilters.teacher) return
      const allLines = costsByTeacherId[t.id] || []
      const lines = filterLines(allLines).sort(lineSort)
      if (lines.length === 0 && hasLineDimFilter && allLines.length > 0) return
      blocks.push({ kind: 'teacher', teacher: t, lines })
    })

    const listedIds = new Set(enabledTeachersSorted.map((t) => t.id))
    const orphanById = {}
    teacherCostRows.forEach((r) => {
      if (listedIds.has(r.teacher_id)) return
      if (!orphanById[r.teacher_id]) orphanById[r.teacher_id] = []
      orphanById[r.teacher_id].push(r)
    })
    Object.keys(orphanById)
      .map((id) => Number(id))
      .sort((a, b) => {
        const an = orphanById[a][0]?.teacher_name || ''
        const bn = orphanById[b][0]?.teacher_name || ''
        return an.localeCompare(bn, 'zh-CN')
      })
      .forEach((tid) => {
        const allLines = orphanById[tid]
        const name = allLines[0]?.teacher_name || `教师#${tid}`
        if (costListFilters.teacher && name !== costListFilters.teacher) return
        const lines = filterLines(allLines).sort(lineSort)
        if (lines.length === 0 && hasLineDimFilter && allLines.length > 0) return
        blocks.push({ kind: 'orphan', teacherId: tid, teacherName: name, lines })
      })

    return blocks
  }, [enabledTeachersSorted, costsByTeacherId, teacherCostRows, costListFilters])

  const openNewTeacherCostForTeacher = (teacher) => {
    setEditingItem({ type: 'teacher-cost', data: { teacher_id: teacher.id } })
    setShowModal(true)
  }

  // ==================== 课程管理 ====================

  // 课程数据变更后需要刷新的所有关联查询
  const invalidateCourseRelated = () => {
    queryClient.invalidateQueries(['courses-manage'])
    queryClient.invalidateQueries(['teacher-course-costs'])
    queryClient.invalidateQueries(['payments']) // 缴费页面（显示课程信息）
    queryClient.invalidateQueries(['paid-courses-need-scheduling']) // 排课管理
    queryClient.invalidateQueries(['all-courses']) // 全部排课
    queryClient.invalidateQueries(['courses']) // 排课页面
  }

  const deleteCourseMutation = useMutation({
    mutationFn: courseManageService.deleteCourse,
    onSuccess: () => {
      invalidateCourseRelated()
      alert('删除成功')
    },
    onError: (error) => {
      alert('删除失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const createCourseMutation = useMutation({
    mutationFn: courseManageService.createCourse,
    onSuccess: () => {
      invalidateCourseRelated()
      setShowModal(false)
      setEditingItem(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const updateCourseMutation = useMutation({
    mutationFn: ({ id, data }) => courseManageService.updateCourse(id, data),
    onSuccess: () => {
      invalidateCourseRelated()
      setShowModal(false)
      setEditingItem(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const handleDeleteCourse = (id) => {
    if (window.confirm(
      '确定要删除这个课程吗？\n\n' +
      '删除课程可能产生以下影响：\n' +
      '• 如果该课程下有排课记录，将无法删除\n' +
      '• 如果该课程下有课程成本记录，需先删除相关成本记录\n' +
      '• 如果该课程下有经验成本记录，需先删除相关记录\n' +
      '• 相关的缴费记录将失去课程关联'
    )) {
      deleteCourseMutation.mutate(id)
    }
  }

  const handleEditCourse = (course) => {
    setEditingItem({ type: 'course', data: course })
    setShowModal(true)
  }

  const handleSubmitCourse = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const data = Object.fromEntries(formData)
    data.unit_price = parseFloat(data.unit_price) || 0

    if (editingItem?.type === 'course' && editingItem.data) {
      updateCourseMutation.mutate({ id: editingItem.data.id, data })
    } else {
      createCourseMutation.mutate(data)
    }
  }

  // ==================== 课程成本管理 ====================

  const deleteTeacherCostMutation = useMutation({
    mutationFn: async (id) => {
      return api.delete(`/teacher-course-costs/${id}`)
    },
    onSuccess: () => {
      invalidateTeacherCostRelated()
      alert('删除成功')
    },
    onError: (error) => {
      alert('删除失败：' + teacherCostApiErrorMessage(error))
    },
  })

  const createTeacherCostMutation = useMutation({
    mutationFn: async (data) => {
      return api.post('/teacher-course-costs', data)
    },
    onSuccess: () => {
      invalidateTeacherCostRelated()
      setShowModal(false)
      setEditingItem(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + teacherCostApiErrorMessage(error))
    },
  })

  const updateTeacherCostMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return api.put(`/teacher-course-costs/${id}`, data)
    },
    onSuccess: () => {
      invalidateTeacherCostRelated()
      setShowModal(false)
      setEditingItem(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + teacherCostApiErrorMessage(error))
    },
  })

  const handleDeleteTeacherCost = (id) => {
    if (window.confirm('确定要删除这条课程成本记录吗？')) {
      deleteTeacherCostMutation.mutate(id)
    }
  }

  const handleEditTeacherCost = (cost) => {
    setEditingItem({ type: 'teacher-cost', data: cost })
    setShowModal(true)
  }

  const handleShowTeacherCostHistory = async (costId) => {
    try {
      const data = await api.get(`/teacher-course-costs/${costId}/history`)
      setHistoryData(data)
      setShowHistoryModal(true)
    } catch (error) {
      alert('获取操作记录失败：' + teacherCostApiErrorMessage(error))
    }
  }

  const handleSubmitTeacherCost = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const teacherSelect = e.target.querySelector('[name="teacher_id"]')
    const courseSelect = e.target.querySelector('[name="course_id"]')

    const teacherOption = teacherSelect.options[teacherSelect.selectedIndex]
    const courseOption = courseSelect.options[courseSelect.selectedIndex]

    const statusRaw = formData.get('cost_record_status')
    const data = {
      teacher_id: parseInt(formData.get('teacher_id')),
      teacher_name: teacherOption.getAttribute('data-name') || teacherOption.textContent.split(' (')[0],
      course_id: parseInt(formData.get('course_id')),
      course_name: courseOption.getAttribute('data-name') || courseOption.textContent.split(' (')[0],
      cost_per_class: parseFloat(formData.get('cost_per_class')),
      status: statusRaw === '停用' ? '停用' : '启用',
    }

    if (editingItem?.type === 'teacher-cost' && editingItem.data?.id) {
      updateTeacherCostMutation.mutate({ id: editingItem.data.id, data })
    } else {
      createTeacherCostMutation.mutate(data)
    }
  }

  // ==================== 经验成本管理 ====================

  const deleteExperienceCostMutation = useMutation({
    mutationFn: async (id) => {
      return api.delete(`/teacher-experience-costs/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['teacher-experience-costs'])
      alert('删除成功')
    },
    onError: (error) => {
      alert('删除失败：' + (error?.response?.data?.error || error?.message))
    },
  })

  const createExperienceCostMutation = useMutation({
    mutationFn: async (data) => {
      return api.post('/teacher-experience-costs', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['teacher-experience-costs'])
      setShowModal(false)
      setEditingItem(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const updateExperienceCostMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return api.put(`/teacher-experience-costs/${id}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['teacher-experience-costs'])
      setShowModal(false)
      setEditingItem(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const handleDeleteExperienceCost = (id) => {
    if (window.confirm('确定要删除这条经验成本记录吗？')) {
      deleteExperienceCostMutation.mutate(id)
    }
  }

  const handleEditExperienceCost = (cost) => {
    setEditingItem({ type: 'experience-cost', data: cost })
    setShowModal(true)
  }

  const handleShowExperienceCostHistory = async (costId) => {
    try {
      const data = await api.get(`/teacher-experience-costs/${costId}/history`)
      setHistoryData(data)
      setShowHistoryModal(true)
    } catch (error) {
      alert('获取操作记录失败：' + teacherCostApiErrorMessage(error))
    }
  }

  const handleSubmitExperienceCost = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const teacherSelect = e.target.querySelector('[name="teacher_id"]')
    const courseSelect = e.target.querySelector('[name="course_id"]')
    const studentSelect = e.target.querySelector('[name="student_id"]')

    const teacherOption = teacherSelect.options[teacherSelect.selectedIndex]
    const courseOption = courseSelect.options[courseSelect.selectedIndex]
    const studentOption = studentSelect ? studentSelect.options[studentSelect.selectedIndex] : null

    const data = {
      teacher_id: parseInt(formData.get('teacher_id')),
      teacher_name: teacherOption.getAttribute('data-name') || teacherOption.textContent.split(' (')[0],
      course_id: parseInt(formData.get('course_id')),
      course_name: courseOption.getAttribute('data-name') || courseOption.textContent.split(' (')[0],
      experience_cost: parseFloat(formData.get('experience_cost')) || 0,
    }

    if (studentOption && studentOption.value) {
      data.student_id = parseInt(studentOption.value)
      data.student_name = studentOption.getAttribute('data-name') || studentOption.textContent.split(' (')[0]
    }

    const startDateInput = e.target.querySelector('[name="start_date"]')
    const endDateInput = e.target.querySelector('[name="end_date"]')
    if (startDateInput && startDateInput.value) {
      data.start_date = startDateInput.value
    }
    if (endDateInput && endDateInput.value) {
      data.end_date = endDateInput.value
    }

    if (editingItem?.type === 'experience-cost' && editingItem.data) {
      updateExperienceCostMutation.mutate({ id: editingItem.data.id, data })
    } else {
      createExperienceCostMutation.mutate(data)
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingItem(null)
  }

  const isLoading = coursesLoading || teacherCostsLoading || experienceCostsLoading

  if (isLoading) return <div className="loading">加载中...</div>

  return (
    <div className="courses-manage-page" style={{ width: '100%' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '16px' }}>
        <h1>课程成本</h1>
        <button className="btn btn-primary" onClick={() => {
          if (activeTab === 'courses') {
            setEditingItem({ type: 'course', data: null })
          } else if (activeTab === 'teacher-costs') {
            setEditingItem({ type: 'teacher-cost', data: null })
          } else if (activeTab === 'experience-costs') {
            setEditingItem({ type: 'experience-cost', data: null })
          }
          setShowModal(true)
        }}>
          新增
        </button>
      </div>

      {/* 标签页 */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'courses' ? 'active' : ''}`} onClick={() => setActiveTab('courses')}>
          课程信息
        </button>
        <button className={`tab ${activeTab === 'teacher-costs' ? 'active' : ''}`} onClick={() => setActiveTab('teacher-costs')}>
          课程成本
        </button>
        <button className={`tab ${activeTab === 'experience-costs' ? 'active' : ''}`} onClick={() => setActiveTab('experience-costs')}>
          经验成本
        </button>
      </div>

      {/* 课程管理标签页 */}
      {activeTab === 'courses' && (
        <div className="tab-content active">
          {(() => {
            // 按科目分组
            const subjectMap = {}
            courses.forEach(course => {
              const subject = course.subject || '未分类'
              if (!subjectMap[subject]) {
                subjectMap[subject] = []
              }
              subjectMap[subject].push(course)
            })

            const subjects = Object.keys(subjectMap).sort()

            if (subjects.length === 0) {
              return (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  暂无课程数据
                </div>
              )
            }

            // 构建表格行
            const tableRows = []
            subjects.forEach(subject => {
              const subjectCourses = subjectMap[subject]

              subjectCourses.forEach((course, idx) => {
                tableRows.push({
                  subject,
                  course,
                  isFirstOfSubject: idx === 0,
                  subjectRowSpan: subjectCourses.length,
                })
              })
            })

            return (
              <div className="table-wrapper">
                <table className="data-table cost-grouped-table">
                  <thead>
                    <tr>
                      <th>科目</th>
                      <th>课程</th>
                      <th>课程单价</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, index) => (
                        <tr key={row.course.id} className={`${row.isFirstOfSubject ? 'subject-first-row' : ''} course-first-row`}>
                          {row.isFirstOfSubject && (
                            <td rowSpan={row.subjectRowSpan} className="subject-cell">
                              <span className="subject-tag">{row.subject}</span>
                            </td>
                          )}
                          <td className="course-name-cell">{row.course.name}</td>
                          <td className="course-price-cell">¥{row.course.unit_price}</td>
                          <td>
                            <span className={`status-badge status-${row.course.status === '启用' ? 'normal' : 'deleted'}`}>
                              {row.course.status}
                            </span>
                          </td>
                          <td className="action-cell">
                            {hasFunctionPermission('courses_manage', 'edit') && (
                              <button className="btn btn-warning" onClick={() => handleEditCourse(row.course)}>编辑</button>
                            )}
                            {hasFunctionPermission('courses_manage', 'delete') && (
                              <button className="btn btn-danger" onClick={() => handleDeleteCourse(row.course.id)}>删除</button>
                            )}
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </div>
      )}

      {/* 课程成本标签页：每行以教师为分组；每位启用教师均出现，多条成本拆多行（教师列合并） */}
      {activeTab === 'teacher-costs' && (
        <div className="tab-content active">
          <div className="cost-list-toolbar">
            <div className="cost-filter-bar">
              <label className="cost-filter-item">
                <span className="cost-filter-label">教师</span>
                <select
                  value={costListFilters.teacher}
                  onChange={(e) => setCostListFilters((f) => ({ ...f, teacher: e.target.value }))}
                >
                  <option value="">全部教师</option>
                  {enabledTeachersSorted.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cost-filter-item">
                <span className="cost-filter-label">科目</span>
                <select
                  value={costListFilters.subject}
                  onChange={(e) => setCostListFilters((f) => ({ ...f, subject: e.target.value }))}
                >
                  <option value="">全部科目</option>
                  {costFilterOptions.subjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cost-filter-item">
                <span className="cost-filter-label">课程类型</span>
                <select
                  value={costListFilters.courseType}
                  onChange={(e) => setCostListFilters((f) => ({ ...f, courseType: e.target.value }))}
                >
                  <option value="">全部课程类型</option>
                  {costFilterOptions.courseTypes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cost-filter-item">
                <span className="cost-filter-label">状态</span>
                <select
                  value={costListFilters.status}
                  onChange={(e) => setCostListFilters((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="启用">启用</option>
                  <option value="停用">停用</option>
                  <option value="">全部</option>
                </select>
              </label>
              <button
                type="button"
                className="btn btn-secondary cost-filter-clear"
                onClick={() =>
                  setCostListFilters({ subject: '', courseType: '', teacher: '', status: '启用' })
                }
              >
                清除筛选
              </button>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="data-table cost-teacher-rows-table">
              <thead>
                <tr>
                  <th>教师</th>
                  <th>科目</th>
                  <th>课程类型</th>
                  <th style={{ textAlign: 'right' }}>每次课成本</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {enabledTeachersSorted.length === 0 && teacherCostTableBlocks.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: '#999' }}>
                      暂无启用教师，请先在教师管理中维护并启用教师
                    </td>
                  </tr>
                ) : teacherCostTableBlocks.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: '#999' }}>
                      当前筛选下无数据，请调整筛选或点击「清除筛选」
                    </td>
                  </tr>
                ) : (
                  teacherCostTableBlocks.flatMap((block) => {
                    const keyBase = block.kind === 'teacher' ? `t-${block.teacher.id}` : `o-${block.teacherId}`
                    if (block.lines.length === 0) {
                      return [
                        <tr key={`${keyBase}-empty`}>
                          <td className="teacher-name-cell">
                            {block.kind === 'teacher' ? (
                              block.teacher.name
                            ) : (
                              <>
                                {block.teacherName}
                                <span className="cost-orphan-hint">（非启用教师，仅历史成本）</span>
                              </>
                            )}
                          </td>
                          <td colSpan="4" className="cost-no-lines-cell">
                            暂无课程成本
                          </td>
                          <td className="action-cell">
                            {block.kind === 'teacher' && hasFunctionPermission('courses_manage', 'edit') && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '4px 12px', fontSize: 13 }}
                                onClick={() => openNewTeacherCostForTeacher(block.teacher)}
                              >
                                新增成本
                              </button>
                            )}
                          </td>
                        </tr>,
                      ]
                    }
                    return block.lines.map((line, idx) => (
                      <tr key={line.id} className={isTeacherCostStopped(line) ? 'cost-row-readonly' : undefined}>
                        {idx === 0 && (
                          <td rowSpan={block.lines.length} className="teacher-name-cell">
                            {block.kind === 'teacher' ? (
                              block.teacher.name
                            ) : (
                              <>
                                {block.teacherName}
                                <span className="cost-orphan-hint">（非启用教师）</span>
                              </>
                            )}
                          </td>
                        )}
                        <td>{line.subject}</td>
                        <td>{line.courseType}</td>
                        <td
                          className="cost-per-class-cell"
                          style={{ textAlign: 'right', color: '#e67e22', fontWeight: 600 }}
                        >
                          ¥{Number(line.cost_per_class).toFixed(2)}
                        </td>
                        <td className="cost-status-cell">
                          {hasFunctionPermission('courses_manage', 'edit') ? (
                            <button
                              type="button"
                              className={`cost-status-toggle ${isTeacherCostStopped(line) ? 'is-stopped' : 'is-active'}`}
                              disabled={patchTeacherCostStatusMutation.isPending}
                              onClick={() =>
                                patchTeacherCostStatusMutation.mutate({
                                  id: line.id,
                                  status: isTeacherCostStopped(line) ? '启用' : '停用',
                                })
                              }
                              title={isTeacherCostStopped(line) ? '点击恢复为启用' : '点击设为停用（灰显且不可编辑）'}
                            >
                              {line.status}
                            </button>
                          ) : (
                            <span className="cost-status-text">{line.status}</span>
                          )}
                        </td>
                        <td className="action-cell" style={{ whiteSpace: 'nowrap' }}>
                          {hasFunctionPermission('courses_manage', 'edit') && !isTeacherCostStopped(line) && (
                            <button type="button" className="btn btn-warning" onClick={() => handleEditTeacherCost(line)}>
                              编辑
                            </button>
                          )}
                          {hasFunctionPermission('courses_manage', 'delete') && !isTeacherCostStopped(line) && (
                            <button type="button" className="btn btn-danger" onClick={() => handleDeleteTeacherCost(line.id)}>
                              删除
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-info"
                            style={{ background: '#17a2b8', color: 'white' }}
                            onClick={() => handleShowTeacherCostHistory(line.id)}
                          >
                            操作记录
                          </button>
                        </td>
                      </tr>
                    ))
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 经验成本标签页 */}
      {activeTab === 'experience-costs' && (
        <div className="tab-content active">
          <div className="toolbar">
            <button className="btn btn-primary" onClick={() => {
              setEditingItem({ type: 'experience-cost', data: null })
              setShowModal(true)
            }}>
              新增经验成本
            </button>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>教师姓名</th>
                  <th>课程</th>
                  <th>学生</th>
                  <th>经验（每次课）</th>
                  <th>生效时间段</th>
                  <th>操作</th>
                </tr>
              </thead>
            <tbody>
              {experienceCosts.length > 0 ? (
                experienceCosts.map((ec) => {
                  let timeRange = ''
                  if (ec.start_date && ec.end_date) {
                    const startMonth = ec.start_date.substring(0, 7)
                    const endMonth = ec.end_date.substring(0, 7)
                    timeRange = `${startMonth} 至 ${endMonth}`
                  } else if (ec.start_date) {
                    const startMonth = ec.start_date.substring(0, 7)
                    timeRange = `${startMonth} 起`
                  } else if (ec.end_date) {
                    const endMonth = ec.end_date.substring(0, 7)
                    timeRange = `至 ${endMonth}`
                  } else {
                    timeRange = <span style={{ color: '#999' }}>永久有效</span>
                  }
                  return (
                    <tr key={ec.id}>
                      <td>{ec.id}</td>
                      <td>{ec.teacher_name}</td>
                      <td>{ec.course_name}</td>
                      <td>{ec.student_name || <span style={{ color: '#999' }}>所有学生</span>}</td>
                      <td>{ec.experience_cost.toFixed(2)}</td>
                      <td>{timeRange}</td>
                      <td>
                        <button className="btn btn-warning" onClick={() => handleEditExperienceCost(ec)}>
                          编辑
                        </button>
                        <button className="btn btn-danger" onClick={() => handleDeleteExperienceCost(ec.id)}>
                          删除
                        </button>
                        <button className="btn btn-info" onClick={() => handleShowExperienceCostHistory(ec.id)} style={{ background: '#17a2b8', color: 'white' }}>
                          操作记录
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                    暂无经验成本数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* 课程管理模态框 */}
      {showModal && editingItem?.type === 'course' && (
        <Modal isOpen={showModal} onClose={handleCloseModal} title={editingItem.data ? '编辑课程' : '新增课程'}>
          <form onSubmit={handleSubmitCourse}>
            <div className="form-group">
              <label>课程 *</label>
              <input type="text" name="name" defaultValue={editingItem.data?.name || ''} required />
            </div>
            <div className="form-group">
              <label>科目 *</label>
              <input type="text" name="subject" defaultValue={editingItem.data?.subject || ''} required />
            </div>
            <div className="form-group">
              <label>课程单价 *</label>
              <input type="number" name="unit_price" step="0.01" defaultValue={editingItem.data?.unit_price || 0} required min="0" />
            </div>
            <div className="form-group">
              <label>课程描述（可选）</label>
              <textarea name="description" placeholder="可不填写" defaultValue={editingItem.data?.description || ''}></textarea>
            </div>
            <div className="form-group">
              <label>状态</label>
              <select name="status" defaultValue={editingItem.data?.status || '启用'}>
                <option value="启用">启用</option>
                <option value="停用">停用</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={handleCloseModal}>
                取消
              </button>
              <button type="submit" className="btn btn-primary">
                保存
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 课程成本模态框 */}
      {showModal && editingItem?.type === 'teacher-cost' && (
        <Modal
          isOpen={showModal}
          onClose={handleCloseModal}
          title={editingItem.data?.id ? '编辑课程成本' : '新增课程成本'}
        >
          <form
            key={`tc-form-${editingItem.data?.id ?? 'new'}-${editingItem.data?.teacher_id ?? ''}-${editingItem.data?.course_id ?? ''}-${editingItem.data?.status ?? ''}`}
            onSubmit={handleSubmitTeacherCost}
          >
            <div className="form-group">
              <label>教师 *</label>
              <select name="teacher_id" required defaultValue={editingItem.data?.teacher_id || ''}>
                <option value="">-- 请选择教师 --</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id} data-name={t.name}>
                    {t.name} ({t.subject || ''})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>课程 *</label>
              <select name="course_id" required defaultValue={editingItem.data?.course_id || ''}>
                <option value="">-- 请选择课程 --</option>
                {courses
                  .filter((c) => c.status === '启用')
                  .map((c) => (
                    <option key={c.id} value={c.id} data-name={c.name}>
                      {c.name} ({c.subject})
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-group">
              <label>每次课成本 *</label>
              <input
                type="number"
                name="cost_per_class"
                step="0.01"
                defaultValue={editingItem.data?.cost_per_class != null ? editingItem.data.cost_per_class : 145}
                required
                min="0"
                placeholder="请输入每次课的成本"
              />
            </div>
            <div className="form-group">
              <label>状态</label>
              <select
                name="cost_record_status"
                defaultValue={editingItem.data?.status === '停用' ? '停用' : '启用'}
              >
                <option value="启用">启用</option>
                <option value="停用">停用</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={handleCloseModal}>
                取消
              </button>
              <button type="submit" className="btn btn-primary">
                保存
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 经验成本模态框 */}
      {showModal && editingItem?.type === 'experience-cost' && (
        <ExperienceCostModal
          isOpen={showModal}
          onClose={handleCloseModal}
          editingItem={editingItem}
          teachers={teachers}
          courses={courses}
          students={students}
          onSubmit={handleSubmitExperienceCost}
        />
      )}

      {/* 操作记录模态框 */}
      {showHistoryModal && (
        <HistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          historyData={historyData}
          type={activeTab === 'teacher-costs' ? 'teacher-cost' : 'experience-cost'}
        />
      )}

    </div>
  )
}

// 经验成本模态框组件
const ExperienceCostModal = ({ isOpen, onClose, editingItem, teachers, courses, students, onSubmit }) => {
  const [occupiedRanges, setOccupiedRanges] = useState([])
  const [rangeWarning, setRangeWarning] = useState('')
  const [formData, setFormData] = useState({
    teacher_id: editingItem?.data?.teacher_id || '',
    course_id: editingItem?.data?.course_id || '',
    student_id: editingItem?.data?.student_id || '',
    experience_cost: editingItem?.data?.experience_cost || 0,
    start_date: editingItem?.data?.start_date ? editingItem.data.start_date.substring(0, 7) : '',
    end_date: editingItem?.data?.end_date ? editingItem.data.end_date.substring(0, 7) : '',
  })

  // 当 editingItem 变化时，更新 formData
  React.useEffect(() => {
    if (isOpen) {
      setFormData({
        teacher_id: editingItem?.data?.teacher_id || '',
        course_id: editingItem?.data?.course_id || '',
        student_id: editingItem?.data?.student_id || '',
        experience_cost: editingItem?.data?.experience_cost || 0,
        start_date: editingItem?.data?.start_date ? editingItem.data.start_date.substring(0, 7) : '',
        end_date: editingItem?.data?.end_date ? editingItem.data.end_date.substring(0, 7) : '',
      })
      setRangeWarning('')
      setOccupiedRanges([])
    }
  }, [isOpen, editingItem])

  // 加载已占用的时间段
  const loadOccupiedRanges = async (excludeId) => {
    if (!formData.teacher_id || !formData.course_id) {
      setOccupiedRanges([])
      return
    }

    try {
      const params = {
        teacher_id: formData.teacher_id,
        course_id: formData.course_id,
      }
      if (formData.student_id) {
        params.student_id = formData.student_id
      } else {
        params.student_id = 0
      }

      const costs = await api.get('/teacher-experience-costs', { params })
      const filtered = excludeId ? costs.filter((c) => c.id !== excludeId) : costs
      setOccupiedRanges(filtered)
    } catch (error) {
      // 404 错误是正常的（没有数据），不需要显示错误
      if (error.status !== 404) {
        console.error('加载已占用时间段失败:', error)
      }
      setOccupiedRanges([])
    }
  }

  // 检查时间段是否重合
  const checkTimeRange = async (excludeId) => {
    if (!formData.start_date && !formData.end_date) {
      setRangeWarning('')
      return
    }

    if (formData.start_date && formData.end_date && formData.start_date > formData.end_date) {
      setRangeWarning('开始年月不能晚于结束年月')
      return
    }

    if (!formData.teacher_id || !formData.course_id) {
      return
    }

    try {
      const params = {
        teacher_id: formData.teacher_id,
        course_id: formData.course_id,
      }
      if (formData.student_id) {
        params.student_id = formData.student_id
      } else {
        params.student_id = 0
      }

      const costs = await api.get('/teacher-experience-costs', { params })
      const filtered = excludeId ? costs.filter((c) => c.id !== excludeId) : costs

      // 检查时间段是否重合
      for (const cost of filtered) {
        const existingStart = cost.start_date
        const existingEnd = cost.end_date

        if (!existingStart && !existingEnd) {
          setRangeWarning('已存在永久有效的记录，时间段不能重合')
          return
        }

        if (!formData.start_date && !formData.end_date) {
          setRangeWarning('已存在其他记录，不能设置永久有效')
          return
        }

        // 检查时间段是否重合（按年月比较）
        const existingStartMonth = existingStart ? existingStart.substring(0, 7) : null
        const existingEndMonth = existingEnd ? existingEnd.substring(0, 7) : null
        const startMonth = formData.start_date || null
        const endMonth = formData.end_date || null

        let overlap = false

        if (existingStartMonth && existingEndMonth) {
          if (endMonth && startMonth) {
            if (startMonth <= existingEndMonth && endMonth >= existingStartMonth) {
              overlap = true
            }
          } else if (startMonth) {
            if (startMonth <= existingEndMonth) {
              overlap = true
            }
          } else if (endMonth) {
            if (endMonth >= existingStartMonth) {
              overlap = true
            }
          }
        } else if (existingStartMonth) {
          if (endMonth && startMonth) {
            if (startMonth <= existingStartMonth || endMonth >= existingStartMonth) {
              overlap = true
            }
          } else if (startMonth) {
            if (startMonth <= existingStartMonth) {
              overlap = true
            }
          } else if (endMonth) {
            if (endMonth >= existingStartMonth) {
              overlap = true
            }
          }
        } else if (existingEndMonth) {
          if (endMonth && startMonth) {
            if (startMonth <= existingEndMonth) {
              overlap = true
            }
          } else if (startMonth) {
            if (startMonth <= existingEndMonth) {
              overlap = true
            }
          } else if (endMonth) {
            if (endMonth >= existingEndMonth) {
              overlap = true
            }
          }
        }

        if (overlap) {
          let existingRange = ''
          if (existingStart && existingEnd) {
            const startMonth = existingStart.substring(0, 7)
            const endMonth = existingEnd.substring(0, 7)
            existingRange = `${startMonth} 至 ${endMonth}`
          } else if (existingStart) {
            const startMonth = existingStart.substring(0, 7)
            existingRange = `${startMonth} 起`
          } else if (existingEnd) {
            const endMonth = existingEnd.substring(0, 7)
            existingRange = `至 ${endMonth}`
          } else {
            existingRange = '永久有效'
          }

          setRangeWarning(`时间段与现有记录重合（现有记录时间段：${existingRange}），请调整时间段`)
          return
        }
      }

      setRangeWarning('')
    } catch (error) {
      // 404 错误是正常的（没有数据），不需要显示错误
      if (error.status !== 404) {
        console.error('检查时间段失败:', error)
      }
      setRangeWarning('')
    }
  }

  React.useEffect(() => {
    if (isOpen && formData.teacher_id && formData.course_id) {
      loadOccupiedRanges(editingItem?.data?.id)
    }
  }, [isOpen, formData.teacher_id, formData.course_id, formData.student_id])

  React.useEffect(() => {
    if (isOpen && formData.teacher_id && formData.course_id) {
      checkTimeRange(editingItem?.data?.id)
    }
  }, [isOpen, formData.start_date, formData.end_date, formData.teacher_id, formData.course_id, formData.student_id])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (rangeWarning) {
      alert('时间段存在冲突，请调整后再保存')
      return
    }
    onSubmit(e)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingItem?.data ? '编辑经验成本' : '新增经验成本'}>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>教师 *</label>
          <select
            name="teacher_id"
            required
            value={formData.teacher_id}
            onChange={(e) => {
              setFormData({ ...formData, teacher_id: e.target.value })
              loadOccupiedRanges(editingItem?.data?.id)
            }}
          >
            <option value="">-- 请选择教师 --</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id} data-name={t.name}>
                {t.name} ({t.subject || ''})
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>课程 *</label>
          <select
            name="course_id"
            required
            value={formData.course_id}
            onChange={(e) => {
              setFormData({ ...formData, course_id: e.target.value })
              loadOccupiedRanges(editingItem?.data?.id)
            }}
          >
            <option value="">-- 请选择课程 --</option>
            {courses
              .filter((c) => c.status === '启用')
              .map((c) => (
                <option key={c.id} value={c.id} data-name={c.name}>
                  {c.name} ({c.subject})
                </option>
              ))}
          </select>
        </div>
        <div className="form-group">
          <label>学生（可选）</label>
          <select
            name="student_id"
            value={formData.student_id}
            onChange={(e) => {
              setFormData({ ...formData, student_id: e.target.value })
              loadOccupiedRanges(editingItem?.data?.id)
            }}
          >
            <option value="">所有学生（可选）</option>
            {students.map((s) => (
              <option key={s.id} value={s.id} data-name={s.name}>
                {s.name}
                {s.grade ? ` (${s.grade})` : ''}
              </option>
            ))}
          </select>
          <small style={{ color: '#666' }}>不选择学生表示对所有学生生效</small>
        </div>
        <div className="form-group">
          <label>经验（每次课） *</label>
          <input
            type="number"
            name="experience_cost"
            step="0.01"
            value={formData.experience_cost}
            onChange={(e) => setFormData({ ...formData, experience_cost: parseFloat(e.target.value) || 0 })}
            required
            min="0"
            placeholder="默认为0"
          />
        </div>
        <div className="form-group">
          <label>生效开始年月（可选）</label>
          <input
            type="month"
            name="start_date"
            value={formData.start_date}
            onChange={(e) => {
              setFormData({ ...formData, start_date: e.target.value })
              checkTimeRange(editingItem?.data?.id)
            }}
          />
          <small style={{ color: '#666' }}>不填写表示从创建时生效</small>
          {occupiedRanges.length > 0 && (
            <div style={{ marginTop: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>已占用的时间段：</div>
              <div style={{ fontSize: '12px', color: '#999' }}>
                {occupiedRanges.map((c) => {
                  let range = ''
                  if (c.start_date && c.end_date) {
                    const startMonth = c.start_date.substring(0, 7)
                    const endMonth = c.end_date.substring(0, 7)
                    range = `${startMonth} 至 ${endMonth}`
                  } else if (c.start_date) {
                    const startMonth = c.start_date.substring(0, 7)
                    range = `${startMonth} 起`
                  } else if (c.end_date) {
                    const endMonth = c.end_date.substring(0, 7)
                    range = `至 ${endMonth}`
                  } else {
                    range = '永久有效'
                  }
                  const studentInfo = c.student_name ? ` (${c.student_name})` : ' (所有学生)'
                  return (
                    <div key={c.id} style={{ color: '#999', textDecoration: 'line-through' }}>
                      {range}
                      {studentInfo}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {rangeWarning && (
            <div style={{ marginTop: '8px', padding: '8px', background: '#fff3cd', borderRadius: '4px', color: '#856404', fontSize: '12px' }}>
              {rangeWarning}
            </div>
          )}
        </div>
        <div className="form-group">
          <label>生效结束年月（可选）</label>
          <input
            type="month"
            name="end_date"
            value={formData.end_date}
            onChange={(e) => {
              setFormData({ ...formData, end_date: e.target.value })
              checkTimeRange(editingItem?.data?.id)
            }}
          />
          <small style={{ color: '#666' }}>不填写表示永久有效</small>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={!!rangeWarning}>
            保存
          </button>
        </div>
      </form>
    </Modal>
  )
}

// 操作记录模态框组件
const HistoryModal = ({ isOpen, onClose, historyData, type }) => {
  if (historyData.length === 0) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="操作记录">
        <div style={{ padding: '20px', textAlign: 'center' }}>暂无操作记录</div>
        <div className="form-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="操作记录">
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        <div className="table-wrapper">
          <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>操作类型</th>
              {type === 'experience-cost' && <th>学生</th>}
              <th>{type === 'teacher-cost' ? '每次课成本' : '经验（每次课）'}</th>
              {type === 'experience-cost' && <th>生效时间段</th>}
              <th>操作时间</th>
            </tr>
          </thead>
          <tbody>
            {historyData.map((h, index) => {
              const operationMap = {
                创建: '创建',
                更新: '更新',
                删除: '删除',
              }

              let changeInfo = ''
              if (h.operation === '更新') {
                const changes = []
                if (type === 'teacher-cost') {
                  if (h.old_cost_per_class !== null && h.old_cost_per_class !== undefined && h.old_cost_per_class !== h.cost_per_class) {
                    changes.push(`成本: ${h.old_cost_per_class.toFixed(2)} → ${h.cost_per_class.toFixed(2)}`)
                  }
                } else {
                  if (h.old_experience_cost !== null && h.old_experience_cost !== undefined && h.old_experience_cost !== h.experience_cost) {
                    changes.push(`经验: ${h.old_experience_cost.toFixed(2)} → ${h.experience_cost.toFixed(2)}`)
                  }
                  if (h.old_start_date !== h.start_date || h.old_end_date !== h.end_date) {
                    const oldStartMonth = h.old_start_date ? h.old_start_date.substring(0, 7) : null
                    const oldEndMonth = h.old_end_date ? h.old_end_date.substring(0, 7) : null
                    const newStartMonth = h.start_date ? h.start_date.substring(0, 7) : null
                    const newEndMonth = h.end_date ? h.end_date.substring(0, 7) : null

                    const oldRange = oldStartMonth && oldEndMonth ? `${oldStartMonth} 至 ${oldEndMonth}` : oldStartMonth ? `${oldStartMonth} 起` : oldEndMonth ? `至 ${oldEndMonth}` : '永久有效'
                    const newRange = newStartMonth && newEndMonth ? `${newStartMonth} 至 ${newEndMonth}` : newStartMonth ? `${newStartMonth} 起` : newEndMonth ? `至 ${newEndMonth}` : '永久有效'
                    changes.push(`时间段: ${oldRange} → ${newRange}`)
                  }
                }
                if (changes.length > 0) {
                  changeInfo = <small style={{ color: '#666' }}>{changes.join('; ')}</small>
                }
              }

              if (type === 'teacher-cost') {
                return (
                  <tr key={index}>
                    <td>{operationMap[h.operation] || h.operation}</td>
                    <td>
                      {h.cost_per_class.toFixed(2)}
                      {changeInfo && <br />}
                      {changeInfo}
                    </td>
                    <td>{h.created_at}</td>
                  </tr>
                )
              } else {
                const startMonth = h.start_date ? h.start_date.substring(0, 7) : null
                const endMonth = h.end_date ? h.end_date.substring(0, 7) : null
                const timeRange = startMonth && endMonth ? `${startMonth} 至 ${endMonth}` : startMonth ? `${startMonth} 起` : endMonth ? `至 ${endMonth}` : '永久有效'

                return (
                  <tr key={index}>
                    <td>{operationMap[h.operation] || h.operation}</td>
                    <td>{h.student_name || <span style={{ color: '#999' }}>所有学生</span>}</td>
                    <td>
                      {h.experience_cost.toFixed(2)}
                      {changeInfo && <br />}
                      {changeInfo}
                    </td>
                    <td>{timeRange}</td>
                    <td>{h.created_at}</td>
                  </tr>
                )
              }
            })}
          </tbody>
        </table>
        </div>
      </div>
      <div className="form-actions" style={{ marginTop: '20px' }}>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          关闭
        </button>
      </div>
    </Modal>
  )
}

export default CoursesManage
