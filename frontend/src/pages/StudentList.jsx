import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentService } from '../services/studentService'
import { courseService } from '../services/courseService'
import { usePermissions } from '../hooks/usePermissions'
import Modal from '../components/Modal'
import './Students.css'

const StudentList = () => {
  const queryClient = useQueryClient()
  const { hasFunctionPermission } = usePermissions()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [enrollmentYear, setEnrollmentYear] = useState('')
  const [trialResultFilter, setTrialResultFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
  const [trialStatusStudent, setTrialStatusStudent] = useState(null)
  const [showTrialStatusModal, setShowTrialStatusModal] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const perPage = 20

  // 根据选择的年份计算开始和结束日期
  const enrollmentDateStart = enrollmentYear ? `${enrollmentYear}-01-01` : ''
  const enrollmentDateEnd = enrollmentYear ? `${enrollmentYear}-12-31` : ''

  // 生成年份选项（当前年份往前5年，往后2年）
  const currentYear = new Date().getFullYear()
  const yearOptions = []
  for (let i = currentYear + 2; i >= currentYear - 5; i--) {
    yearOptions.push(i)
  }

  // 获取学生列表（带分页）
  const { data, isLoading } = useQuery({
    queryKey: ['student-list', page, statusFilter, gradeFilter, searchKeyword, enrollmentDateStart, enrollmentDateEnd],
    queryFn: () =>
      studentService.getStudents({
        status: statusFilter || undefined,
        grade: gradeFilter || undefined,
        search: searchKeyword || undefined,
        enrollment_date_start: enrollmentDateStart || undefined,
        enrollment_date_end: enrollmentDateEnd || undefined,
        page,
        per_page: perPage,
      }),
  })


  // 获取所有试课排课记录，用于获取试课状态
  const { data: allTrialCourses = [] } = useQuery({
    queryKey: ['all-trial-courses'],
    queryFn: () => courseService.getCourses({ scope: 'leads' }),
  })

  // 无排课时也设置了试课状态的线索（name+grade+trial_status）
  const { data: trialStatusMap = [] } = useQuery({
    queryKey: ['trial-status-map'],
    queryFn: () => studentService.getTrialStatusMap(),
  })

  let students = data?.students || []
  const pagination = data?.pagination || {
    page: 1,
    total_pages: 1,
    total: 0,
    has_prev: false,
    has_next: false,
    per_page: perPage,
  }

  // 获取唯一年级列表
  const grades = [...new Set(students.map((s) => s.grade).filter(Boolean))].sort()

  // 根据试课结果筛选：成功 / 失败 / 再试 / 未选择
  if (trialResultFilter) {
    students = students.filter((student) => {
      const studentTrialCourses = allTrialCourses.filter(
        (c) => c.student_name === student.name && (c.grade || '') === (student.grade || '')
      )
      const leadTrial = trialStatusMap.find(
        (x) => x.name === student.name && (x.grade || '') === (student.grade || '')
      )

      const hasSuccess = studentTrialCourses.some((c) => c.trial_status === '成功') || leadTrial?.trial_status === '成功'
      const hasFail = studentTrialCourses.some((c) => c.trial_status === '失败') || leadTrial?.trial_status === '失败'
      const hasRetry = studentTrialCourses.some((c) => c.trial_status === '再试') || leadTrial?.trial_status === '再试'
      const hasAnyStatus = hasSuccess || hasFail || hasRetry

      if (trialResultFilter === 'success') {
        return hasSuccess
      }
      if (trialResultFilter === 'fail') {
        return hasFail
      }
      if (trialResultFilter === 'retry') {
        return hasRetry
      }
      if (trialResultFilter === 'none') {
        return !hasAnyStatus
      }
      return true
    })
  }

  const createMutation = useMutation({
    mutationFn: studentService.createStudent,
    onSuccess: () => {
      queryClient.invalidateQueries(['student-list'])
      setShowModal(false)
      setEditingStudent(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => studentService.updateStudent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['student-list'])
      setShowModal(false)
      setEditingStudent(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => studentService.deleteStudent(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['student-list'])
      alert(data?.message || '已彻底删除该学生及其相关数据。')
    },
    onError: (error) => {
      alert('删除失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const handleEdit = (student) => {
    setEditingStudent(student)
    setShowModal(true)
  }

  const handleDelete = (student) => {
    if (
      !window.confirm(
        `确定要彻底删除学生「${student.name}」吗？\n\n删除后将永久移除该学生及其所有相关数据（排课记录、课时统计、缴费记录等），且不可恢复。`
      )
    ) return
    deleteMutation.mutate(student.id)
  }

  const updateOneTrialStatusMutation = useMutation({
    mutationFn: ({ courseId, trialStatus }) => {
      const value = trialStatus === '未选择' ? null : trialStatus
      return courseService.updateCourse(courseId, { trial_status: value })
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['all-trial-courses'])
      queryClient.invalidateQueries(['student-list'])
      queryClient.invalidateQueries(['marketing-drafts'])
      queryClient.invalidateQueries(['marketing-schedules'])
      // 清空或修改试课状态后，学生管理页也需要刷新
      queryClient.invalidateQueries(['students'])
      queryClient.refetchQueries({ queryKey: ['marketing-schedules'] })
    },
    onError: (error) => {
      alert('更新试课状态失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const handleOpenTrialStatus = (student) => {
    setTrialStatusStudent(student)
    setShowTrialStatusModal(true)
  }

  const handleCloseTrialStatusModal = () => {
    setShowTrialStatusModal(false)
    setTrialStatusStudent(null)
  }

  const handleSetCourseTrialStatus = (courseId, trialStatus) => {
    updateOneTrialStatusMutation.mutate({ courseId, trialStatus })
  }

  const handleSetNoCourseTrialStatus = (trialStatus) => {
    if (!trialStatusStudent) return
    console.log('[调试] 设置试课状态:', { studentId: trialStatusStudent.id, studentName: trialStatusStudent.name, trialStatus })
    studentService.setTrialStatus(trialStatusStudent.id, trialStatus)
      .then((response) => {
        console.log('[调试] 设置试课状态成功:', response)
        queryClient.invalidateQueries(['trial-status-map'])
        queryClient.invalidateQueries(['all-trial-courses'])
        queryClient.invalidateQueries(['student-list'])
        // 强制刷新营销待确认名单
        queryClient.invalidateQueries(['marketing-drafts'])
        queryClient.refetchQueries({ queryKey: ['marketing-drafts'] })
        queryClient.invalidateQueries(['marketing-schedules'])
        // 同步刷新学生管理页
        queryClient.invalidateQueries(['students'])
        alert('试课状态已更新')
        // 关闭弹窗
        setShowTrialStatusModal(false)
        setTrialStatusStudent(null)
      })
      .catch((err) => {
        console.error('[调试] 设置试课状态失败:', err)
        alert('更新试课状态失败：' + (err?.response?.data?.error || err?.message || '未知错误'))
      })
  }

  // 批量操作
  const batchTrialMutation = useMutation({
    mutationFn: ({ studentIds, trialStatus }) => studentService.batchSetTrialStatus(studentIds, trialStatus),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['student-list'])
      queryClient.invalidateQueries(['all-trial-courses'])
      queryClient.invalidateQueries(['trial-status-map'])
      queryClient.invalidateQueries(['students'])
      queryClient.invalidateQueries(['marketing-drafts'])
      queryClient.invalidateQueries(['marketing-schedules'])
      setSelectedIds(new Set())
      alert(data?.message || '批量操作成功！')
    },
    onError: (error) => {
      alert('批量操作失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const handleToggleSelect = (studentId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) {
        next.delete(studentId)
      } else {
        next.add(studentId)
      }
      return next
    })
  }

  const handleToggleSelectAll = () => {
    if (selectedIds.size === students.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(students.map((s) => s.id)))
    }
  }

  const handleBatchConfirmTrialSuccess = () => {
    if (selectedIds.size === 0) {
      alert('请先选择学生')
      return
    }
    if (!window.confirm(`确认将选中的 ${selectedIds.size} 个学生的试课状态设为「成功」？`)) return
    batchTrialMutation.mutate({ studentIds: [...selectedIds], trialStatus: '成功' })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const formDataObj = Object.fromEntries(formData)

    const data = {}
    const canBeEmptyFields = ['enrollment_date', 'source']

    for (const [key, value] of Object.entries(formDataObj)) {
      if (value !== null && value !== undefined) {
        if (canBeEmptyFields.includes(key) || value !== '') {
          data[key] = value
        }
      }
    }

    const nameVal = (data.name || '').toString().trim()
    const gradeVal = (data.grade !== undefined && data.grade !== null ? data.grade : '').toString().trim()
    if (!nameVal) {
      alert('姓名不能为空')
      return
    }
    if (!gradeVal) {
      alert('年级不能为空')
      return
    }
    data.name = nameVal
    data.grade = gradeVal

    if (editingStudent) {
      updateMutation.mutate({ id: editingStudent.id, data })
    } else {
      createMutation.mutate({ ...formDataObj, name: nameVal, grade: gradeVal })
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingStudent(null)
  }


  const handleSearchKeyup = (e) => {
    if (e.key === 'Enter') {
      setPage(1)
    }
  }

  const clearFilters = () => {
    setStatusFilter('')
    setGradeFilter('')
    setSearchKeyword('')
    setEnrollmentYear('')
    setTrialStatusFilter('')
    setTrialResultFilter('')
    setPage(1)
  }

  const exportStudentList = () => {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (gradeFilter) params.set('grade', gradeFilter)
    if (searchKeyword) params.set('search', searchKeyword)
    if (enrollmentDateStart) params.set('enrollment_date_start', enrollmentDateStart)
    if (enrollmentDateEnd) params.set('enrollment_date_end', enrollmentDateEnd)
    const queryString = params.toString()
    window.open(`/api/export/student-list${queryString ? '?' + queryString : ''}`, '_blank')
  }

  const changePage = (delta) => {
    const newPage = page + delta
    if (newPage >= 1 && newPage <= pagination.total_pages) {
      setPage(newPage)
    }
  }

  return (
    <div className="students-page">
      <div className="page-header">
        <h1>学生名单</h1>
      </div>

      <div className="toolbar">
        {hasFunctionPermission('students', 'add') && (
          <button className="btn btn-primary" onClick={() => { setEditingStudent(null); setShowModal(true) }}>
            新增学生
          </button>
        )}
        {hasFunctionPermission('students', 'edit') && (
          <button
            className="btn btn-success"
            onClick={handleBatchConfirmTrialSuccess}
            disabled={selectedIds.size === 0 || batchTrialMutation.isLoading}
            style={{ marginLeft: '8px' }}
          >
            {batchTrialMutation.isLoading ? '处理中...' : `确认试课成功${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
          </button>
        )}
        <button
          className="btn btn-secondary"
          onClick={exportStudentList}
          style={{ marginLeft: '8px' }}
        >
          导出Excel
        </button>
      </div>

      {/* 筛选条件 */}
      <div className="filters">
        <div className="filter-group">
          <label>状态：</label>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">全部</option>
            <option value="在校">在校</option>
            <option value="离校">离校</option>
          </select>
        </div>
        <div className="filter-group">
          <label>年级：</label>
          <select value={gradeFilter} onChange={(e) => { setGradeFilter(e.target.value); setPage(1) }}>
            <option value="">全部</option>
            {grades.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>试课状态：</label>
          <select
            value={trialResultFilter}
            onChange={(e) => {
              setTrialResultFilter(e.target.value)
              setPage(1)
            }}
          >
            <option value="">全部</option>
            <option value="success">成功</option>
            <option value="fail">失败</option>
            <option value="retry">再试</option>
            <option value="none">未选择</option>
          </select>
        </div>
        <div className="filter-group">
          <label>登记年份：</label>
          <select value={enrollmentYear} onChange={(e) => { setEnrollmentYear(e.target.value); setPage(1) }}>
            <option value="">全部</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>{year}年</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>搜索：</label>
          <input
            type="text"
            placeholder="姓名、电话、家长姓名"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onKeyUp={handleSearchKeyup}
            style={{ width: '200px' }}
          />
        </div>
        <button className="btn" onClick={clearFilters}>清除筛选</button>
      </div>

      {/* 学生列表 */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input
                  type="checkbox"
                  checked={students.length > 0 && selectedIds.size === students.length}
                  onChange={handleToggleSelectAll}
                  title="全选/取消全选"
                />
              </th>
              <th>序号</th>
              <th>姓名</th>
              <th>年级</th>
              <th>状态</th>
              <th>试课状态</th>
              <th>登记日期</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="8" className="empty-tip">加载中...</td>
              </tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan="8" className="empty-tip">暂无学生</td>
              </tr>
            ) : (
              students.map((student, index) => {
                // 计算序号（从1开始）
                const rowIndex = (pagination.page - 1) * (pagination.per_page || perPage) + index + 1
                
                // 获取该学生的所有试课状态（从排课记录中查找）
                const studentTrialCourses = allTrialCourses.filter(
                  (c) => c.student_name === student.name && (c.grade || '') === (student.grade || '') && c.trial_status
                )
                // 无排课时从线索的 trial_status 取（学生名单页直接设置的）
                const leadTrial = trialStatusMap.find(
                  (x) => x.name === student.name && (x.grade || '') === (student.grade || '')
                )
                // 按日期排序，获取所有不同的试课状态及对应的课程
                const sortedTrialCourses = [...studentTrialCourses].sort(
                  (a, b) => new Date(b.course_date) - new Date(a.course_date)
                )
                // 按状态分组，每个状态显示对应的课程名称
                const statusCourseMap = {}
                sortedTrialCourses.forEach((course) => {
                  const status = course.trial_status
                  if (!statusCourseMap[status]) {
                    statusCourseMap[status] = []
                  }
                  const courseName = course.course_name || course.subject || '未知课程'
                  if (!statusCourseMap[status].includes(courseName)) {
                    statusCourseMap[status].push(courseName)
                  }
                })
                if (Object.keys(statusCourseMap).length === 0 && leadTrial?.trial_status) {
                  statusCourseMap[leadTrial.trial_status] = []
                }
                
                return (
                <tr key={student.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(student.id)}
                      onChange={() => handleToggleSelect(student.id)}
                    />
                  </td>
                  <td>{rowIndex}</td>
                  <td>{student.name}</td>
                  <td>{student.grade || '-'}</td>
                  <td>
                    <span className={`status-badge status-${student.status === '在校' ? 'normal' : 'deleted'}`}>
                      {student.status}
                    </span>
                  </td>
                  <td>
                    {Object.keys(statusCourseMap).length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {Object.entries(statusCourseMap).map(([status, courseNames], idx) => (
                          <span
                            key={idx}
                            style={{
                              color: status === '成功' ? '#28a745' : status === '失败' ? '#dc3545' : status === '再试' ? '#ffc107' : '#666',
                              fontWeight: '500',
                              fontSize: '12px',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              backgroundColor: status === '成功' ? '#d4edda' : status === '失败' ? '#f8d7da' : status === '再试' ? '#fff3cd' : '#e9ecef',
                              display: 'inline-block'
                            }}
                            title={courseNames.length > 0 ? courseNames.join('、') : status}
                          >
                            {courseNames.length > 0 ? `${status}(${courseNames.join('、')})` : status}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#666' }}>-</span>
                    )}
                  </td>
                  <td>{student.enrollment_date ? new Date(student.enrollment_date + 'T00:00:00').toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-'}</td>
                  <td>
                    {hasFunctionPermission('students', 'edit') && (
                      <button className="btn btn-warning btn-sm" onClick={() => handleEdit(student)} style={{ marginRight: '5px' }}>
                        编辑
                      </button>
                    )}
                    {hasFunctionPermission('students', 'delete') && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(student)}
                        disabled={deleteMutation.isLoading}
                        style={{ marginRight: '5px' }}
                        title="彻底删除该学生及其相关数据，不可恢复"
                      >
                        删除
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => handleOpenTrialStatus(student)}
                      disabled={updateOneTrialStatusMutation.isLoading}
                      style={{ marginRight: '5px', backgroundColor: '#17a2b8', color: '#fff' }}
                      title="修改该学生的试课状态（成功/失败/再试/未选择）"
                    >
                      试课
                    </button>
                  </td>
                </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {pagination.total_pages > 1 && (
        <div className="pagination">
          <button className="btn" onClick={() => changePage(-1)} disabled={!pagination.has_prev}>
            上一页
          </button>
          <span>
            第 {pagination.page} 页 / 共 {pagination.total_pages} 页（共 {pagination.total} 条）
          </span>
          <button className="btn" onClick={() => changePage(1)} disabled={!pagination.has_next}>
            下一页
          </button>
        </div>
      )}

      {/* 新增/编辑学生模态框 */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingStudent ? '编辑学生' : '新增学生'}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>姓名 *</label>
            <input
              type="text"
              name="name"
              defaultValue={editingStudent?.name ?? ''}
              required
              maxLength={50}
            />
          </div>
          <div className="form-group">
            <label>年级 *</label>
            <input
              type="text"
              name="grade"
              defaultValue={editingStudent?.grade ?? ''}
              required
              maxLength={20}
            />
          </div>
          <div className="form-group">
            <label>状态</label>
            <select name="status" defaultValue={editingStudent?.status ?? '在校'}>
              <option value="在校">在校</option>
              <option value="离校">离校</option>
            </select>
          </div>
          <div className="form-group">
            <label>联系电话</label>
            <input type="text" name="phone" defaultValue={editingStudent?.phone ?? ''} />
          </div>
          <div className="form-group">
            <label>家长姓名</label>
            <input type="text" name="parent_name" defaultValue={editingStudent?.parent_name ?? ''} />
          </div>
          <div className="form-group">
            <label>家长电话</label>
            <input type="text" name="parent_phone" defaultValue={editingStudent?.parent_phone ?? ''} />
          </div>
          <div className="form-group">
            <label>地址</label>
            <input type="text" name="address" defaultValue={editingStudent?.address ?? ''} />
          </div>
          <div className="form-group">
            <label>来源</label>
            <input type="text" name="source" defaultValue={editingStudent?.source ?? ''} />
          </div>
          <div className="form-group">
            <label>登记日期</label>
            <input
              type="date"
              name="enrollment_date"
              defaultValue={editingStudent?.enrollment_date ?? new Date().toISOString().split('T')[0]}
            />
          </div>
          <div className="form-group">
            <label>备注</label>
            <textarea
              name="notes"
              rows="4"
              defaultValue={editingStudent?.notes ?? ''}
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={handleCloseModal}>
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isLoading || updateMutation.isLoading}
            >
              {createMutation.isLoading || updateMutation.isLoading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 设置试课状态模态框 */}
      <Modal
        isOpen={showTrialStatusModal}
        onClose={handleCloseTrialStatusModal}
        title={trialStatusStudent ? `设置试课状态 - ${trialStatusStudent.name}${trialStatusStudent.grade ? `（${trialStatusStudent.grade}）` : ''}` : '设置试课状态'}
      >
        <div className="form-group">
          {trialStatusStudent && (
            <div style={{ marginTop: '8px' }}>
              {(() => {
                const coursesForStudent = allTrialCourses.filter(
                  (c) => c.student_name === trialStatusStudent.name && (c.grade || '') === (trialStatusStudent.grade || '')
                )
                const leadTrial = trialStatusMap.find(
                  (x) => x.name === trialStatusStudent.name && (x.grade || '') === (trialStatusStudent.grade || '')
                )
                if (coursesForStudent.length === 0) {
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <select
                        value={leadTrial?.trial_status ?? ''}
                        onChange={(e) => handleSetNoCourseTrialStatus(e.target.value === '' ? null : e.target.value)}
                        style={{ minWidth: '100px' }}
                      >
                        <option value="">未选择</option>
                        <option value="成功">成功</option>
                        <option value="失败">失败</option>
                        <option value="再试">再试</option>
                      </select>
                    </div>
                  )
                }
                return (
                  <table className="data-table" style={{ marginTop: '8px', fontSize: '14px' }}>
                    <thead>
                      <tr>
                        <th>课程 / 日期</th>
                        <th>试课状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coursesForStudent
                        .sort((a, b) => new Date(b.course_date) - new Date(a.course_date))
                        .map((c) => (
                          <tr key={c.id}>
                            <td>
                              {c.course_name || c.subject || '未知'} · {c.course_date ? new Date(c.course_date + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : ''}
                              {c.time_slot ? ` ${c.time_slot}` : ''}
                            </td>
                            <td>
                              <select
                                value={c.trial_status ?? ''}
                                onChange={(e) => handleSetCourseTrialStatus(c.id, e.target.value === '' ? null : e.target.value)}
                                disabled={updateOneTrialStatusMutation.isLoading}
                                style={{ minWidth: '100px' }}
                              >
                                <option value="">未选择</option>
                                <option value="成功">成功</option>
                                <option value="失败">失败</option>
                                <option value="再试">再试</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )
              })()}
            </div>
          )}
        </div>
        <div className="form-actions" style={{ marginTop: '16px' }}>
          <button type="button" className="btn" onClick={handleCloseTrialStatusModal}>
            关闭
          </button>
        </div>
      </Modal>
    </div>
  )
}

export default StudentList
