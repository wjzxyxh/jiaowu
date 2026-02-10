import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentService } from '../services/studentService'
import { usePermissions } from '../hooks/usePermissions'
import Modal from '../components/Modal'
import './Students.css'

const Students = () => {
  const queryClient = useQueryClient()
  const { hasFunctionPermission } = usePermissions()
    const [page, setPage] = useState(1)
    const [statusFilter, setStatusFilter] = useState('')
    const [gradeFilter, setGradeFilter] = useState('')
    const [searchKeyword, setSearchKeyword] = useState('')
    const [enrollmentDateStart, setEnrollmentDateStart] = useState('')
    const [enrollmentDateEnd, setEnrollmentDateEnd] = useState('')
    const [showModal, setShowModal] = useState(false)
    const [editingStudent, setEditingStudent] = useState(null)

    const perPage = 20

  // 获取学生列表（带分页）
  const { data, isLoading, error } = useQuery({
    queryKey: ['students', page, statusFilter, gradeFilter, searchKeyword, enrollmentDateStart, enrollmentDateEnd],
    queryFn: () =>
      studentService.getStudents({
        status: statusFilter || undefined,
        grade: gradeFilter || undefined,
        search: searchKeyword || undefined,
        enrollment_date_start: enrollmentDateStart || undefined,
        enrollment_date_end: enrollmentDateEnd || undefined,
        page,
        per_page: perPage,
        trial_success_only: true,
      }),
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    retry: false,
  })

  const students = data?.students || []
  const pagination = data?.pagination || {
    page: 1,
    total_pages: 1,
    total: 0,
    has_prev: false,
    has_next: false,
    per_page: perPage,
  }

  // 调试信息
  useEffect(() => {
    console.log('Students页面状态:', {
      data,
      isLoading,
      error: error?.error || error?.message,
      errorStatus: error?.status,
      hasData: !!data?.students,
      studentsCount: data?.students?.length,
      pagination,
    })
  }, [data, isLoading, error, pagination])

  // 获取所有学生用于年级筛选下拉框（延迟加载）
  const { data: allStudentsData } = useQuery({
    queryKey: ['students-all-grades'],
    queryFn: () => studentService.getStudents({ per_page: 1000, trial_success_only: true }),
    staleTime: 30 * 60 * 1000,
    cacheTime: 60 * 60 * 1000,
    retry: false,
    enabled: false, // 默认不加载
  })

  // 获取唯一年级列表（从当前数据中提取，避免额外请求）
  const grades = useMemo(() => {
    // 优先从当前查询结果中提取年级
    const currentGrades = [...new Set(students.map((s) => s.grade).filter(Boolean))]
    // 如果有缓存的所有学生数据，也从中提取
    const allStudents = allStudentsData?.students || []
    const allGrades = [...new Set(allStudents.map((s) => s.grade).filter(Boolean))]
    // 合并并去重
    const combined = [...new Set([...currentGrades, ...allGrades])]
    return combined.sort()
  }, [students, allStudentsData])

  // 学生数据变更后需要刷新的所有关联查询
  const invalidateStudentRelated = () => {
    queryClient.invalidateQueries(['students'])
    queryClient.invalidateQueries(['students-all-grades'])
    queryClient.invalidateQueries(['student-list']) // 学生名单页
    queryClient.invalidateQueries(['payments']) // 缴费页面（显示学生信息）
    queryClient.invalidateQueries(['paid-courses-need-scheduling']) // 排课管理
    queryClient.invalidateQueries(['stats']) // 课时统计
  }

  const deleteMutation = useMutation({
    mutationFn: ({ id }) => studentService.removeFromManagement(id),
    onSuccess: (data) => {
      invalidateStudentRelated()
      alert(data?.message || '已从学生管理页移除，该学生仍保留在学生名单页。')
    },
    onError: (error) => {
      alert('操作失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const createMutation = useMutation({
    mutationFn: studentService.createStudent,
    onSuccess: () => {
      invalidateStudentRelated()
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
      invalidateStudentRelated()
      setShowModal(false)
      setEditingStudent(null)
      alert('保存成功！')
    },
    onError: (error) => {
      console.error('更新学生失败:', error)
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  // 加载年级选项（延迟加载，避免429错误）
  useEffect(() => {
    // 延迟2秒后加载，避免与主查询冲突
    const timer = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ['students-all-grades'],
        queryFn: () => studentService.getStudents({ per_page: 1000, trial_success_only: true }),
        staleTime: 30 * 60 * 1000,
      })
    }, 2000)
    return () => clearTimeout(timer)
  }, [queryClient])

  const handleDelete = (student) => {
    if (
      window.confirm(
        '确定要从学生管理页移除该学生吗？\n\n该学生将不再显示在学生管理页，其排课、缴费、课时统计等数据会被彻底删除，但仍会在学生名单页保留基本信息。'
      )
    ) {
      deleteMutation.mutate({ id: student.id })
    }
  }

  const handleEdit = (student) => {
    setEditingStudent(student)
    setShowModal(true)
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

    if (!data.name) {
      alert('姓名不能为空')
      return
    }

    if (editingStudent) {
      updateMutation.mutate({ id: editingStudent.id, data })
    } else {
      createMutation.mutate(formDataObj)
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
    setEnrollmentDateStart('')
    setEnrollmentDateEnd('')
    setPage(1)
  }

  const changePage = (delta) => {
    const newPage = page + delta
    if (newPage >= 1 && newPage <= pagination.total_pages) {
      setPage(newPage)
    }
  }

  const exportStudents = () => {
    const params = new URLSearchParams()
    params.set('trial_success_only', 'true')
    if (statusFilter) params.set('status', statusFilter)
    if (gradeFilter) params.set('grade', gradeFilter)
    if (searchKeyword) params.set('search', searchKeyword)
    if (enrollmentDateStart) params.set('enrollment_date_start', enrollmentDateStart)
    if (enrollmentDateEnd) params.set('enrollment_date_end', enrollmentDateEnd)
    window.open(`/api/export/students?${params.toString()}`, '_blank')
  }

  const handleImportFile = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    if (!window.confirm('确定要导入学生数据吗？\n\n注意：已存在的学生将被跳过。')) {
      e.target.value = ''
      return
    }

    fetch('/api/import/students', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          alert('导入失败：' + data.error)
        } else {
          alert(data.message)
          queryClient.invalidateQueries(['students'])
          queryClient.invalidateQueries(['students-all-grades'])
        }
      })
      .catch((error) => {
        console.error('导入失败:', error)
        alert('导入失败：' + error.message)
      })
      .finally(() => {
        e.target.value = ''
      })
  }

  const importStudents = () => {
    document.getElementById('import-file').click()
  }

  const isRateLimit = error && (error?.response?.status === 429 || error?.status === 429)
  const hasData = Array.isArray(students) && students.length > 0
  
  // 确保即使数据为空，页面也能显示
  console.log('Students渲染检查:', {
    isLoading,
    hasError: !!error,
    hasData,
    studentsLength: students?.length,
    willShowLoading: isLoading && !hasData && !data,
    willShowError: error && !hasData && !isLoading,
    willShowContent: !(isLoading && !hasData && !data) && !(error && !hasData && !isLoading),
  })

  // 显示加载状态（只在首次加载且没有缓存数据时）
  if (isLoading && !hasData && !data) {
    return (
      <div className="students-page" style={{ width: '100%' }}>
        <div className="page-header">
          <h1>学生管理</h1>
        </div>
        <div className="loading">加载中...</div>
      </div>
    )
  }

  // 显示错误状态（只在没有数据时）
  if (error && !hasData && !isLoading) {
    return (
      <div className="students-page" style={{ width: '100%' }}>
        <div className="page-header">
          <h1>学生管理</h1>
        </div>
        <div className="error">
          {isRateLimit ? (
            <div>
              <p>请求过于频繁，请稍后再试</p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setTimeout(() => {
                    queryClient.invalidateQueries(['students'])
                  }, 5000)
                }}
                style={{ marginTop: '10px' }}
              >
                5秒后刷新
              </button>
            </div>
          ) : (
            <div>
              <p>加载失败: {error.error || error.message}</p>
              <button
                className="btn btn-primary"
                onClick={() => queryClient.invalidateQueries(['students'])}
                style={{ marginTop: '10px' }}
              >
                重试
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 计算序号起始值
  const startIndex = (pagination.page - 1) * (pagination.per_page || perPage) + 1

  // 确保students是数组
  const safeStudents = Array.isArray(students) ? students : []

  // 确保页面始终渲染
  return (
    <div className="students-page" style={{ width: '100%', minHeight: '400px' }}>
      
      {isRateLimit && hasData && (
        <div
          style={{
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ color: '#856404' }}>
            ⚠️ 请求过于频繁，当前显示的是缓存数据。请稍后再试或点击刷新按钮。
          </span>
          <button
            className="btn btn-primary"
            onClick={() => {
              setTimeout(() => {
                queryClient.invalidateQueries(['students'])
              }, 5000)
            }}
            style={{ marginLeft: '10px' }}
          >
            5秒后刷新
          </button>
        </div>
      )}

      <div className="page-header">
        <h1>学生管理</h1>
      </div>

      <div className="toolbar">
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="file"
            id="import-file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        </div>

        {/* 筛选区域 */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginTop: '10px' }}>
        <input
          type="text"
          placeholder="搜索姓名/电话/家长..."
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          onKeyUp={handleSearchKeyup}
          style={{ width: '200px', padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px' }}
        />

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          style={{ width: '120px', padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px' }}
        >
          <option value="">全部状态</option>
          <option value="在校">在校</option>
          <option value="离校">离校</option>
        </select>

        <select
          value={gradeFilter}
          onChange={(e) => {
            setGradeFilter(e.target.value)
            setPage(1)
          }}
          style={{ width: '120px', padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px' }}
        >
          <option value="">全部年级</option>
          {grades.map((grade) => (
            <option key={grade} value={grade}>
              {grade}
            </option>
          ))}
        </select>

        <label className="enrollment-date-filter" style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <span>登记日期:</span>
          <input
            type="date"
            value={enrollmentDateStart}
            onChange={(e) => {
              setEnrollmentDateStart(e.target.value)
              setPage(1)
            }}
            style={{ width: '150px', padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
          <span>至</span>
          <input
            type="date"
            value={enrollmentDateEnd}
            onChange={(e) => {
              setEnrollmentDateEnd(e.target.value)
              setPage(1)
            }}
            style={{ width: '150px', padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
        </label>

          <button className="btn btn-secondary" onClick={clearFilters}>
            清除筛选
          </button>
          <button className="btn btn-secondary" onClick={exportStudents}>
            导出Excel
          </button>
        </div>
      </div>
      
      {/* 显示加载状态 */}
      {isLoading && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
          正在加载学生数据...
        </div>
      )}

      <div className="table-wrapper" style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: '60px' }}>序号</th>
            <th>姓名</th>
            <th>来源</th>
            <th>年级</th>
            <th style={{ minWidth: '110px' }}>登记日期</th>
            <th style={{ minWidth: '70px' }}>状态</th>
            <th>联系电话</th>
            <th>家长姓名</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {safeStudents.length > 0 ? (
            safeStudents.map((student, index) => {
              const rowIndex = startIndex + index
              return (
                <tr key={student.id}>
                  <td>{rowIndex}</td>
                  <td>{student.name}</td>
                  <td>{student.source || '-'}</td>
                  <td>{student.grade || '-'}</td>
                  <td>{student.enrollment_date || '-'}</td>
                  <td>
                    <span className={`status-badge status-${student.status === '在校' ? 'normal' : 'deleted'}`}>
                      {student.status}
                    </span>
                  </td>
                  <td>{student.phone || '-'}</td>
                  <td>{student.parent_name || '-'}</td>
                  <td>
                    {hasFunctionPermission('students', 'edit') && (
                      <button className="btn btn-warning" onClick={() => handleEdit(student)}>
                        编辑
                      </button>
                    )}
                    {hasFunctionPermission('students', 'delete') && (
                      <button className="btn btn-danger" onClick={() => handleDelete(student)}>
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              )
            })
          ) : (
            <tr>
              <td colSpan="9" style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                {isRateLimit ? '请求过于频繁，请稍后再试' : '暂无学生数据'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {/* 分页控件 */}
      {pagination.total_pages > 1 && (
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
            disabled={!pagination.has_prev}
          >
            上一页
          </button>
          <span style={{ padding: '0 15px' }}>
            第 {pagination.page} 页，共 {pagination.total_pages} 页（共 {pagination.total} 条）
          </span>
          <button
            className="btn btn-secondary"
            onClick={() => changePage(1)}
            disabled={!pagination.has_next}
          >
            下一页
          </button>
        </div>
      )}

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
              defaultValue={editingStudent?.name || ''}
              required
              maxLength={50}
            />
          </div>
          <div className="form-group">
            <label>来源</label>
            <select name="source" defaultValue={editingStudent?.source || ''}>
              <option value="">请选择</option>
              <option value="转介绍">转介绍</option>
              <option value="传单">传单</option>
              <option value="家教中介">家教中介</option>
              <option value="其它">其它</option>
            </select>
          </div>
          <div className="form-group">
            <label>年级</label>
            <input type="text" name="grade" defaultValue={editingStudent?.grade || ''} />
          </div>
          <div className="form-group">
            <label>登记日期</label>
            <input
              type="date"
              name="enrollment_date"
              defaultValue={editingStudent?.enrollment_date || ''}
            />
          </div>
          <div className="form-group">
            <label>状态</label>
            <select name="status" defaultValue={editingStudent?.status || '在校'}>
              <option value="在校">在校</option>
              <option value="离校">离校</option>
            </select>
          </div>
          <div className="form-group">
            <label>联系电话</label>
            <input type="text" name="phone" defaultValue={editingStudent?.phone || ''} />
          </div>
          <div className="form-group">
            <label>家长姓名</label>
            <input type="text" name="parent_name" defaultValue={editingStudent?.parent_name || ''} />
          </div>
          <div className="form-group">
            <label>家长电话</label>
            <input type="text" name="parent_phone" defaultValue={editingStudent?.parent_phone || ''} />
          </div>
          <div className="form-group">
            <label>地址</label>
            <input type="text" name="address" defaultValue={editingStudent?.address || ''} />
          </div>
          <div className="form-group">
            <label>备注/学习记录</label>
            <textarea name="notes" rows="4" placeholder="请输入备注或学习记录" defaultValue={editingStudent?.notes || ''}></textarea>
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={handleCloseModal}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              {editingStudent ? '更新' : '创建'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Students
