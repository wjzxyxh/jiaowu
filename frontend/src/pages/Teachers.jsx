import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teacherService } from '../services/teacherService'
import { courseManageService } from '../services/courseManageService'
import api from '../services/api'
import Modal from '../components/Modal'
import './Teachers.css'

const Teachers = () => {
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showBioModal, setShowBioModal] = useState(false)
  const [selectedBio, setSelectedBio] = useState({ name: '', bio: '' })
  const [editingTeacher, setEditingTeacher] = useState(null)
  const queryClient = useQueryClient()

  const { data: teachers = [], isLoading, error } = useQuery({
    queryKey: ['teachers', statusFilter],
    queryFn: () => teacherService.getTeachers({ status: statusFilter }),
  })

  // 获取科目列表
  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => {
      return api.get('/courses_manage/subjects')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: teacherService.deleteTeacher,
    onSuccess: () => {
      queryClient.invalidateQueries(['teachers'])
      alert('删除成功')
    },
    onError: (error) => {
      alert('删除失败: ' + (error?.response?.data?.error || error?.message))
    },
  })

  const createMutation = useMutation({
    mutationFn: teacherService.createTeacher,
    onSuccess: () => {
      queryClient.invalidateQueries(['teachers'])
      setShowModal(false)
      setEditingTeacher(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => teacherService.updateTeacher(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['teachers'])
      setShowModal(false)
      setEditingTeacher(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const handleDelete = (id) => {
    if (
      window.confirm(
        '确定要删除这个教师吗？\n\n注意：删除教师将同时删除以下所有相关数据：\n- 所有排课记录\n- 教师课时统计\n- 教师成本记录\n\n此操作不可恢复！'
      )
    ) {
      deleteMutation.mutate(id)
    }
  }

  const handleEdit = (teacher) => {
    setEditingTeacher(teacher)
    setShowModal(true)
  }

  const handleShowBio = (teacher) => {
    setSelectedBio({ name: teacher.name || '教师', bio: teacher.bio || '' })
    setShowBioModal(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const data = Object.fromEntries(formData)

    // 转换数值字段
    if (data.base_salary) {
      data.base_salary = parseFloat(data.base_salary) || 0
    }

    // 确保状态字段有默认值
    if (!data.status) {
      data.status = '启用'
    }

    if (editingTeacher) {
      updateMutation.mutate({ id: editingTeacher.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingTeacher(null)
  }

  // 格式化简介显示（只显示前3个字）
  const formatBio = (bio) => {
    if (!bio || bio.length === 0) return { display: '-', hasMore: false }
    if (bio.length <= 3) return { display: bio, hasMore: false }
    return { display: bio.substring(0, 3), hasMore: true }
  }

  if (isLoading) return <div className="loading">加载中...</div>
  if (error) return <div className="error">加载失败: {error?.response?.data?.error || error?.message}</div>

  return (
    <div className="teachers-page" style={{ width: '100%' }}>
      <div className="page-header">
        <h1>教师管理</h1>
      </div>

      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          新增教师
        </button>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
          <tr>
            <th>ID</th>
            <th>姓名</th>
            <th>科目</th>
            <th>联系电话</th>
            <th>简介</th>
            <th>底薪</th>
            <th>兼职/全职</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {Array.isArray(teachers) && teachers.length > 0 ? (
            teachers.map((teacher, index) => {
              const bioInfo = formatBio(teacher.bio)
              return (
                <tr key={teacher.id}>
                  <td>{index + 1}</td>
                  <td>{teacher.name}</td>
                  <td>{teacher.subject || '-'}</td>
                  <td>{teacher.phone || '-'}</td>
                  <td>
                    {bioInfo.display}
                    {bioInfo.hasMore && (
                      <span className="bio-more-link" onClick={() => handleShowBio(teacher)} style={{ color: '#007bff', textDecoration: 'underline', cursor: 'pointer', marginLeft: '5px' }}>
                        更多
                      </span>
                    )}
                  </td>
                  <td>¥{teacher.base_salary || 0}</td>
                  <td>{teacher.employment_type || '-'}</td>
                  <td>
                    <span className={`status-badge status-${teacher.status === '启用' ? 'normal' : 'deleted'}`}>
                      {teacher.status}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-warning" onClick={() => handleEdit(teacher)}>
                      编辑
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDelete(teacher.id)}>
                      删除
                    </button>
                  </td>
                </tr>
              )
            })
          ) : (
            <tr>
              <td colSpan="9" style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                暂无教师数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {/* 新增/编辑教师模态框 */}
      <Modal isOpen={showModal} onClose={handleCloseModal} title={editingTeacher ? '编辑教师' : '新增教师'}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>姓名 *</label>
            <input type="text" name="name" defaultValue={editingTeacher?.name || ''} required />
          </div>
          <div className="form-group">
            <label>科目</label>
            {subjects.length > 0 ? (
              <select name="subject" defaultValue={editingTeacher?.subject || ''}>
                <option value="">-- 请选择科目 --</option>
                {subjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            ) : (
              <input type="text" name="subject" defaultValue={editingTeacher?.subject || ''} />
            )}
          </div>
          <div className="form-group">
            <label>联系电话</label>
            <input type="text" name="phone" defaultValue={editingTeacher?.phone || ''} />
          </div>
          <div className="form-group">
            <label>简介</label>
            <textarea name="bio" rows="4" placeholder="请输入教师简介" defaultValue={editingTeacher?.bio || ''}></textarea>
          </div>
          <div className="form-group">
            <label>底薪</label>
            <input type="number" name="base_salary" step="0.01" defaultValue={editingTeacher?.base_salary || 0} />
          </div>
          <div className="form-group">
            <label>兼职/全职</label>
            <select name="employment_type" defaultValue={editingTeacher?.employment_type || '兼职'}>
              <option value="兼职">兼职</option>
              <option value="全职">全职</option>
            </select>
          </div>
          <div className="form-group">
            <label>状态</label>
            <select name="status" defaultValue={editingTeacher?.status || '启用'}>
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

      {/* 简介模态框 */}
      <Modal isOpen={showBioModal} onClose={() => setShowBioModal(false)} title={`${selectedBio.name} - 简介`}>
        <div style={{ padding: '20px', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordWrap: 'break-word', maxHeight: '60vh', overflowY: 'auto' }}>
          {selectedBio.bio || '暂无简介'}
        </div>
        <div className="form-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="btn btn-primary" onClick={() => setShowBioModal(false)}>
            关闭
          </button>
        </div>
      </Modal>
    </div>
  )
}

export default Teachers
