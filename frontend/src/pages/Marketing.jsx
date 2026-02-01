import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { marketingService } from '../services/marketingService'
import { courseService } from '../services/courseService'
import { teacherService } from '../services/teacherService'
import { courseManageService } from '../services/courseManageService'
import { othersService } from '../services/othersService'
import Modal from '../components/Modal'
import './Marketing.css'

const SOURCE_OPTIONS = [
  { value: '', label: '请选择' },
  { value: '转介绍', label: '转介绍' },
  { value: '传单', label: '传单' },
  { value: '家教中介', label: '家教中介' },
  { value: '其它', label: '其它' },
]

const Marketing = () => {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editingDraft, setEditingDraft] = useState(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleDraft, setScheduleDraft] = useState(null)
  const navigate = useNavigate()

  const { data: drafts = [], isLoading: draftsLoading } = useQuery({
    queryKey: ['marketing-drafts'],
    queryFn: marketingService.getDrafts,
  })

  const { data: trials = [], isLoading: trialsLoading } = useQuery({
    queryKey: ['marketing-trials'],
    queryFn: marketingService.getTrials,
  })

  const { data: submitted = [], isLoading: submittedLoading } = useQuery({
    queryKey: ['marketing-submitted'],
    queryFn: marketingService.getSubmitted,
  })

  // 合并所有状态的线索ID（draft、trial、submitted），用于查询排课名单
  // 确保不论状态选什么，都能显示在排课名单中
  const allLeadIds = useMemo(() => {
    const draftIds = drafts.map((d) => d.id).filter(Boolean)
    const trialIds = trials.map((t) => t.id).filter(Boolean)
    const submittedIds = submitted.map((s) => s.id).filter(Boolean)
    return [...new Set([...draftIds, ...trialIds, ...submittedIds])]
  }, [drafts, trials, submitted])

  const { data: scheduleList = [], isLoading: scheduleLoading } = useQuery({
    queryKey: ['marketing-schedules', allLeadIds],
    queryFn: () =>
      courseService.getCourses({
        trial_lead_ids: allLeadIds.length > 0 ? allLeadIds.join(',') : '',
        scope: 'leads',
      }),
    // 确保始终查询排课记录，不论线索状态如何
    enabled: true,
  })

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers-for-schedule'],
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

  const { data: courseList = [] } = useQuery({
    queryKey: ['courses-list'],
    queryFn: () => courseManageService.getCourses({ status: '启用' }),
  })

  const createDraftMutation = useMutation({
    mutationFn: (data) =>
      marketingService.createLead({
        ...data,
        lead_status: 'draft',
        saved_at: new Date().toISOString(),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['marketing-drafts'])
      setShowModal(false)
      setEditingDraft(null)
      return data
    },
    onError: (error) => {
      alert('暂存失败：' + (error?.error || error?.message || '未知错误'))
    },
  })

  const createTrialMutation = useMutation({
    mutationFn: (data) =>
      marketingService.createLead({
        ...data,
        lead_status: 'trial',
        saved_at: new Date().toISOString(),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['marketing-drafts'])
      queryClient.invalidateQueries(['marketing-trials'])
      queryClient.invalidateQueries(['marketing-schedules'])
      setShowModal(false)
      setEditingDraft(null)
      // 自动打开排课弹窗
      setScheduleDraft(data)
      setShowScheduleModal(true)
      return data
    },
    onError: (error) => {
      alert('保存失败：' + (error?.error || error?.message || '未知错误'))
    },
  })

  const updateDraftMutation = useMutation({
    mutationFn: ({ id, data }) => marketingService.updateLead(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['marketing-drafts'])
      setShowModal(false)
      setEditingDraft(null)
      return data
    },
    onError: (error) => {
      alert('更新失败：' + (error?.error || error?.message || '未知错误'))
    },
  })

  const deleteDraftMutation = useMutation({
    mutationFn: marketingService.deleteLead,
    onSuccess: () => {
      queryClient.invalidateQueries(['marketing-drafts'])
    },
    onError: (error) => {
      alert('移除失败：' + (error?.error || error?.message || '未知错误'))
    },
  })

  const createScheduleMutation = useMutation({
    mutationFn: courseService.createCourse,
    onSuccess: () => {
      queryClient.invalidateQueries(['marketing-schedules'])
      queryClient.invalidateQueries(['marketing-drafts'])
      queryClient.invalidateQueries(['marketing-trials'])
      queryClient.invalidateQueries(['marketing-submitted'])
      setShowScheduleModal(false)
      setScheduleDraft(null)
      alert('排课保存成功')
    },
    onError: (error) => {
      alert('排课保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const updateTrialStatusMutation = useMutation({
    mutationFn: ({ id, trial_status }) => courseService.updateCourse(id, { trial_status }),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['marketing-schedules'])
      queryClient.invalidateQueries(['marketing-drafts'])
      queryClient.invalidateQueries(['marketing-trials'])
      queryClient.invalidateQueries(['marketing-submitted'])
      if (data.trial_status === '成功') {
        alert('状态已更新为成功！\n学生信息已自动添加到学生管理页面（/students），该学员的所有试课课程已转为正式课程。')
      } else if (data.trial_status === '再试') {
        alert('状态已更新为再试！\n该记录已恢复至待确认名单，原排课记录保留，可以在待确认名单中再次进行排课。')
      } else {
        alert('状态更新成功')
      }
    },
    onError: (error) => {
      alert('状态更新失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const handleUpdateTrialStatus = (courseId, trialStatus) => {
    updateTrialStatusMutation.mutate({ id: courseId, trial_status: trialStatus })
  }

  const deleteScheduleMutation = useMutation({
    mutationFn: courseService.deleteCourse,
    onSuccess: () => {
      queryClient.invalidateQueries(['marketing-schedules'])
      alert('排课记录已删除（学生信息不受影响）')
    },
    onError: (error) => {
      alert('删除失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const handleDeleteSchedule = (courseId) => {
    if (window.confirm('确定要删除这条排课记录吗？\n注意：删除排课记录不会影响学生管理页面的学生信息。')) {
      deleteScheduleMutation.mutate(courseId)
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingDraft(null)
  }

  const collectFormData = (formEl) => {
    const formData = new FormData(formEl)
    const obj = Object.fromEntries(formData)
    const canBeEmptyFields = ['enrollment_date', 'source']
    const data = {}
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        if (canBeEmptyFields.includes(key) || value !== '') {
          data[key] = value
        }
      }
    }
    return data
  }

  const handleSaveDraft = (e) => {
    e.preventDefault()
    const form = e.target.closest('form')
    if (!form) return
    const data = collectFormData(form)
    if (!data.name?.trim()) {
      alert('请至少填写姓名')
      return
    }
    if (editingDraft) {
      updateDraftMutation.mutate({ id: editingDraft.id, data })
    } else {
      createDraftMutation.mutate(data)
    }
  }

  const updateToTrialMutation = useMutation({
    mutationFn: ({ id, data }) => marketingService.updateLead(id, { ...data, lead_status: 'trial' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['marketing-drafts'])
      queryClient.invalidateQueries(['marketing-trials'])
      queryClient.invalidateQueries(['marketing-schedules'])
      setShowModal(false)
      setEditingDraft(null)
      // 自动打开排课弹窗
      setScheduleDraft(data)
      setShowScheduleModal(true)
    },
    onError: (error) => {
      alert('保存失败：' + (error?.error || error?.message || '未知错误'))
    },
  })

  const handleSaveToSchedule = (e) => {
    e.preventDefault()
    const form = e.target.closest('form')
    if (!form) return
    const data = collectFormData(form)
    if (!data.name?.trim()) {
      alert('请至少填写姓名')
      return
    }
    if (editingDraft) {
      // 编辑时，更新为trial状态，然后打开排课弹窗
      updateToTrialMutation.mutate({ id: editingDraft.id, data })
    } else {
      // 新建时，创建trial状态的线索，然后自动打开排课弹窗
      createTrialMutation.mutate(data)
    }
  }

  const handleRemoveDraft = (id) => {
    if (window.confirm('确定彻底删除该条记录？将从数据库中永久删除，此操作不可恢复。')) {
      deleteDraftMutation.mutate(id)
    }
  }

  const handleEditDraft = (draft) => {
    setEditingDraft(draft)
    setShowModal(true)
  }

  const handleOpenSchedule = (draft) => {
    setScheduleDraft(draft)
    setShowScheduleModal(true)
  }

  const handleCloseScheduleModal = () => {
    setShowScheduleModal(false)
    setScheduleDraft(null)
  }

  const handleViewTimetable = (s) => {
    const leadId = s.marketing_lead_id
    if (leadId) navigate(`/marketing/timetable?lead_id=${leadId}`)
  }

  return (
    <div className="marketing-page">
      <div className="page-header">
        <h1>营销模块</h1>
      </div>
      <p className="marketing-desc">
        在此新增的学员可「暂存」至待确认名单，支持编辑与移除。
      </p>

      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => { setEditingDraft(null); setShowModal(true) }}>
          新增学生
        </button>
      </div>

      {/* 待确认列表 */}
      <div className="drafts-section">
        <h2>待确认名单</h2>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>来源</th>
                <th>年级</th>
                <th>联系电话</th>
                <th>家长姓名</th>
                <th>暂存时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {draftsLoading ? (
                <tr>
                  <td colSpan="7" className="empty-tip">加载中...</td>
                </tr>
              ) : drafts.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-tip">暂无待确认记录</td>
                </tr>
              ) : (
                drafts.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{d.source || '-'}</td>
                    <td>{d.grade || '-'}</td>
                    <td>{d.phone || '-'}</td>
                    <td>{d.parent_name || '-'}</td>
                    <td>{d.saved_at ? new Date(d.saved_at).toLocaleString() : '-'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        onClick={() => handleOpenSchedule(d)}
                        title="为该学员排课"
                      >
                        排课
                      </button>
                      <button
                        type="button"
                        className="btn btn-warning btn-sm"
                        onClick={() => handleEditDraft(d)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRemoveDraft(d.id)}
                      >
                        移除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 排课名单 */}
      <div className="schedule-section">
        <h2>排课名单</h2>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>学生</th>
                <th>年级</th>
                <th>科目</th>
                <th>课程</th>
                <th>老师</th>
                <th>星期</th>
                <th>日期</th>
                <th>时段</th>
                <th>教室</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {scheduleLoading ? (
                <tr>
                  <td colSpan="11" className="empty-tip">加载中...</td>
                </tr>
              ) : scheduleList.length === 0 ? (
                <tr>
                  <td colSpan="11" className="empty-tip">暂无排课记录</td>
                </tr>
              ) : (
                scheduleList.map((s) => {
                  const isFormalStudent = s.trial_status === '成功'
                  const isRetry = s.trial_status === '再试'
                  const isStatusLocked = isFormalStudent || isRetry
                  return (
                    <tr key={s.id} style={isFormalStudent ? { backgroundColor: '#f0f9ff' } : {}}>
                      <td>
                        {s.student_name || '-'}
                        {isFormalStudent && (
                          <span style={{ marginLeft: '5px', color: '#28a745', fontSize: '12px' }} title="已转为正式学生">
                            ✓
                          </span>
                        )}
                        {isRetry && (
                          <span style={{ marginLeft: '5px', color: '#ffc107', fontSize: '12px' }} title="已设为再试">
                            ↻
                          </span>
                        )}
                      </td>
                      <td>{s.grade || '-'}</td>
                      <td>{s.subject || '-'}</td>
                      <td>{s.course_name || '-'}</td>
                      <td>{s.teacher_name || '-'}</td>
                      <td>{s.weekday || '-'}</td>
                      <td>{s.course_date || '-'}</td>
                      <td>{s.time_slot || '-'}</td>
                      <td>{s.classroom || '-'}</td>
                      <td>
                        <select
                          value={s.trial_status || ''}
                          onChange={(e) => handleUpdateTrialStatus(s.id, e.target.value)}
                          className="form-control"
                          style={{ minWidth: '100px' }}
                          disabled={isStatusLocked}
                          title={isFormalStudent ? '已转为正式学生，状态不可修改' : isRetry ? '已设为再试，状态不可修改' : ''}
                        >
                          <option value="">-- 请选择 --</option>
                          <option value="成功">成功</option>
                          <option value="失败">失败</option>
                          <option value="再试">再试</option>
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-info"
                          onClick={() => handleViewTimetable(s)}
                          title="点击查看课表"
                          style={{ marginRight: '5px' }}
                        >
                          查看课表
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDeleteSchedule(s.id)}
                          title="删除排课记录（不会删除学生信息）"
                          disabled={deleteScheduleMutation.isLoading}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingDraft ? '编辑待确认学生' : '新增学生'}
      >
        <form
          onSubmit={handleSaveDraft}
          id="marketing-student-form"
        >
          <div className="form-group">
            <label>姓名 *</label>
            <input
              type="text"
              name="name"
              defaultValue={editingDraft?.name ?? ''}
              required
              maxLength={50}
            />
          </div>
          <div className="form-group">
            <label>来源</label>
            <select name="source" defaultValue={editingDraft?.source ?? ''}>
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value || 'empty'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>年级</label>
            <input type="text" name="grade" defaultValue={editingDraft?.grade ?? ''} />
          </div>
          <div className="form-group">
            <label>登记日期</label>
            <input
              type="date"
              name="enrollment_date"
              defaultValue={editingDraft?.enrollment_date ?? ''}
            />
          </div>
          <div className="form-group">
            <label>状态</label>
            <select name="status" defaultValue={editingDraft?.status ?? '在校'}>
              <option value="在校">在校</option>
              <option value="离校">离校</option>
            </select>
          </div>
          <div className="form-group">
            <label>联系电话</label>
            <input type="text" name="phone" defaultValue={editingDraft?.phone ?? ''} />
          </div>
          <div className="form-group">
            <label>家长姓名</label>
            <input type="text" name="parent_name" defaultValue={editingDraft?.parent_name ?? ''} />
          </div>
          <div className="form-group">
            <label>家长电话</label>
            <input type="text" name="parent_phone" defaultValue={editingDraft?.parent_phone ?? ''} />
          </div>
          <div className="form-group">
            <label>地址</label>
            <input type="text" name="address" defaultValue={editingDraft?.address ?? ''} />
          </div>
          <div className="form-group">
            <label>备注/学习记录</label>
            <textarea
              name="notes"
              rows="4"
              placeholder="请输入备注或学习记录"
              defaultValue={editingDraft?.notes ?? ''}
            />
          </div>
          <div className="form-actions marketing-actions">
            <button type="button" className="btn" onClick={handleCloseModal}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSaveDraft}
              disabled={createDraftMutation.isLoading || updateDraftMutation.isLoading || createTrialMutation.isLoading}
            >
              暂存
            </button>
            <button 
              type="button" 
              className="btn btn-primary" 
              onClick={handleSaveToSchedule}
              disabled={createDraftMutation.isLoading || updateDraftMutation.isLoading || createTrialMutation.isLoading || updateToTrialMutation.isLoading}
            >
              {(createDraftMutation.isLoading || updateDraftMutation.isLoading || createTrialMutation.isLoading || updateToTrialMutation.isLoading) ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </Modal>

      {showScheduleModal && scheduleDraft && (
        <ScheduleModal
          isOpen={showScheduleModal}
          onClose={handleCloseScheduleModal}
          draft={scheduleDraft}
          teachers={teachers}
          courseList={courseList}
          timeSlots={timeSlots}
          classrooms={classrooms}
          onSubmit={(data) => createScheduleMutation.mutate(data)}
          isLoading={createScheduleMutation.isLoading}
        />
      )}
    </div>
  )
}

function ScheduleModal({ isOpen, onClose, draft, teachers, courseList, timeSlots, classrooms, onSubmit, isLoading }) {
  const subjects = useMemo(() => {
    const set = new Set()
    ;(courseList || []).forEach((c) => { if (c.subject) set.add(c.subject) })
    return Array.from(set).sort()
  }, [courseList])

  const [form, setForm] = useState({
    subject: '',
    course_id: '',
    teacher_id: '',
    weekday: '',
    course_date: '',
    time_slot: '',
    classroom: '',
  })

  useEffect(() => {
    if (!isOpen) return
    setForm({
      subject: '',
      course_id: '',
      teacher_id: '',
      weekday: '',
      course_date: '',
      time_slot: '',
      classroom: '',
    })
  }, [isOpen])

  const filteredCourses = useMemo(() => {
    if (!form.subject || !courseList) return []
    return courseList.filter((c) => c.subject === form.subject)
  }, [courseList, form.subject])

  const handleDateChange = (date) => {
    if (date) {
      const d = new Date(date + 'T00:00:00')
      const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
      setForm((p) => ({ ...p, course_date: date, weekday: wd }))
    } else {
      setForm((p) => ({ ...p, course_date: date }))
    }
  }

  const handleWeekdayChange = (wd) => {
    setForm((p) => ({ ...p, weekday: wd }))
    const map = { 周日: 0, 周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6 }
    const today = new Date()
    for (let i = 0; i < 14; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      if (d.getDay() === map[wd]) {
        setForm((p) => ({ ...p, course_date: d.toISOString().slice(0, 10) }))
        return
      }
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      marketing_lead_id: draft.id,
      subject: form.subject,
      course_id: form.course_id ? parseInt(form.course_id) : null,
      teacher_id: parseInt(form.teacher_id),
      weekday: form.weekday || null,
      course_date: form.course_date,
      time_slot: form.time_slot || null,
      classroom: form.classroom || null,
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="新增排课">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>学生 *</label>
          <div style={{ padding: '8px 12px', background: '#f0f9ff', borderRadius: '4px' }}>
            {draft.name} {draft.grade ? `（${draft.grade}）` : ''}
          </div>
        </div>
        <div className="form-group">
          <label>科目 *</label>
          <select
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value, course_id: '' })}
            required
          >
            <option value="">-- 请选择科目 --</option>
            {subjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {form.subject && (
          <div className="form-group">
            <label>课程（可选）</label>
            <select
              value={form.course_id}
              onChange={(e) => setForm({ ...form, course_id: e.target.value })}
            >
              <option value="">-- 请选择课程 --</option>
              {filteredCourses.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.subject})</option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group">
          <label>老师 *</label>
          <select
            value={form.teacher_id}
            onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
            required
          >
            <option value="">-- 请选择老师 --</option>
            {(teachers || []).map((t) => (
              <option key={t.id} value={t.id}>{t.name} {t.subject ? `(${t.subject})` : ''}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>星期 *</label>
          <select
            value={form.weekday}
            onChange={(e) => handleWeekdayChange(e.target.value)}
            required
          >
            <option value="">-- 请选择星期 --</option>
            {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>日期 *</label>
          <input
            type="date"
            value={form.course_date}
            onChange={(e) => handleDateChange(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>时段 *</label>
          <select
            value={form.time_slot}
            onChange={(e) => setForm({ ...form, time_slot: e.target.value })}
            required
          >
            <option value="">-- 请选择时段 --</option>
            {(timeSlots || []).map((s) => (
              <option key={s.id} value={s.name}>{s.name} {s.start_time && s.end_time ? `(${s.start_time}-${s.end_time})` : ''}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>教室 *</label>
          <select
            value={form.classroom}
            onChange={(e) => setForm({ ...form, classroom: e.target.value })}
            required
          >
            <option value="">-- 请选择教室 --</option>
            {(classrooms || []).map((r) => (
              <option key={r.id} value={r.name}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="form-actions marketing-actions">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default Marketing
