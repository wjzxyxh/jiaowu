import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { othersService } from '../services/othersService'
import api from '../services/api'
import Modal from '../components/Modal'
import './OthersManage.css'

const OthersManage = () => {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('time-slots')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [editingConfig, setEditingConfig] = useState(null)

  // 获取时段列表
  const { data: timeSlots = [], isLoading: timeSlotsLoading } = useQuery({
    queryKey: ['time-slots'],
    queryFn: () => othersService.getTimeSlots(),
    enabled: activeTab === 'time-slots',
  })

  // 获取教室列表
  const { data: classrooms = [], isLoading: classroomsLoading } = useQuery({
    queryKey: ['classrooms'],
    queryFn: () => othersService.getClassrooms(),
    enabled: activeTab === 'classrooms',
  })

  // 获取财务配置
  const { data: financeConfigs = [], isLoading: financeConfigsLoading } = useQuery({
    queryKey: ['finance-config'],
    queryFn: () => othersService.getFinanceConfig(),
    enabled: activeTab === 'finance',
  })

  // ==================== 时段管理 ====================

  const deleteTimeSlotMutation = useMutation({
    mutationFn: othersService.deleteTimeSlot,
    onSuccess: () => {
      queryClient.invalidateQueries(['time-slots'])
      alert('删除成功')
    },
    onError: (error) => {
      alert('删除失败：' + (error?.response?.data?.error || error?.message))
    },
  })

  const createTimeSlotMutation = useMutation({
    mutationFn: othersService.createTimeSlot,
    onSuccess: () => {
      queryClient.invalidateQueries(['time-slots'])
      setShowModal(false)
      setEditingItem(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const updateTimeSlotMutation = useMutation({
    mutationFn: ({ id, data }) => othersService.updateTimeSlot(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['time-slots'])
      setShowModal(false)
      setEditingItem(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const handleDeleteTimeSlot = (id) => {
    if (window.confirm('确定要删除这个时段吗？')) {
      deleteTimeSlotMutation.mutate(id)
    }
  }

  const handleEditTimeSlot = (slot) => {
    setEditingItem({ type: 'time-slot', data: slot })
    setShowModal(true)
  }

  const handleSubmitTimeSlot = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const data = Object.fromEntries(formData)
    data.sort_order = parseInt(data.sort_order) || 0

    if (editingItem?.type === 'time-slot' && editingItem.data) {
      updateTimeSlotMutation.mutate({ id: editingItem.data.id, data })
    } else {
      createTimeSlotMutation.mutate(data)
    }
  }

  // ==================== 教室管理 ====================

  const deleteClassroomMutation = useMutation({
    mutationFn: othersService.deleteClassroom,
    onSuccess: () => {
      queryClient.invalidateQueries(['classrooms'])
      alert('删除成功')
    },
    onError: (error) => {
      alert('删除失败：' + (error?.response?.data?.error || error?.message))
    },
  })

  const createClassroomMutation = useMutation({
    mutationFn: othersService.createClassroom,
    onSuccess: () => {
      queryClient.invalidateQueries(['classrooms'])
      setShowModal(false)
      setEditingItem(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const updateClassroomMutation = useMutation({
    mutationFn: ({ id, data }) => othersService.updateClassroom(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['classrooms'])
      setShowModal(false)
      setEditingItem(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const handleDeleteClassroom = (id) => {
    if (window.confirm('确定要删除这个教室吗？')) {
      deleteClassroomMutation.mutate(id)
    }
  }

  const handleEditClassroom = (classroom) => {
    setEditingItem({ type: 'classroom', data: classroom })
    setShowModal(true)
  }

  const handleSubmitClassroom = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const data = Object.fromEntries(formData)
    data.sort_order = parseInt(data.sort_order) || 0

    if (editingItem?.type === 'classroom' && editingItem.data) {
      updateClassroomMutation.mutate({ id: editingItem.data.id, data })
    } else {
      createClassroomMutation.mutate(data)
    }
  }

  // ==================== 财务管理 ====================

  const updateFinanceConfigMutation = useMutation({
    mutationFn: ({ id, key, data }) => {
      if (id === 0) {
        // 创建新配置
        return othersService.createFinanceConfig({ key, value: data.value, description: data.description })
      } else {
        // 更新现有配置
        return api.put(`/finance-config/${id}`, data)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['finance-config'])
      setShowModal(false)
      setEditingConfig(null)
      alert('保存成功！')
    },
    onError: (error) => {
      alert('保存失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const handleEditFinanceConfig = (config) => {
    setEditingConfig(config)
    setShowModal(true)
  }

  const handleSubmitFinanceConfig = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const data = {
      value: parseInt(formData.get('value')),
      description: formData.get('description'),
    }

    updateFinanceConfigMutation.mutate({
      id: editingConfig.id || 0,
      key: editingConfig.key,
      data,
    })
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingItem(null)
    setEditingConfig(null)
  }

  const isLoading = timeSlotsLoading || classroomsLoading || financeConfigsLoading

  if (isLoading && activeTab !== 'finance') {
    return <div className="loading">加载中...</div>
  }

  return (
    <div className="others-manage-page" style={{ width: '100%' }}>
      <div className="page-header">
        <h1>其它管理</h1>
      </div>

      {/* 标签页 */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'time-slots' ? 'active' : ''}`} onClick={() => setActiveTab('time-slots')}>
          时段管理
        </button>
        <button className={`tab ${activeTab === 'classrooms' ? 'active' : ''}`} onClick={() => setActiveTab('classrooms')}>
          教室管理
        </button>
        <button className={`tab ${activeTab === 'finance' ? 'active' : ''}`} onClick={() => setActiveTab('finance')}>
          财务管理
        </button>
      </div>

      {/* 时段管理标签页 */}
      {activeTab === 'time-slots' && (
        <div className="tab-content active">
          <div className="toolbar">
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingItem({ type: 'time-slot', data: null })
                setShowModal(true)
              }}
            >
              新增时段
            </button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>时段名称</th>
                <th>开始时间</th>
                <th>结束时间</th>
                <th>排序</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {timeSlots.length > 0 ? (
                timeSlots.map((slot) => (
                  <tr key={slot.id}>
                    <td>{slot.id}</td>
                    <td>{slot.name || ''}</td>
                    <td>{slot.start_time || ''}</td>
                    <td>{slot.end_time || ''}</td>
                    <td>{slot.sort_order || 0}</td>
                    <td>
                      <span className={`status-badge status-${slot.status === '启用' ? 'normal' : 'deleted'}`}>
                        {slot.status || '启用'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-warning" onClick={() => handleEditTimeSlot(slot)}>
                        编辑
                      </button>
                      <button className="btn btn-danger" onClick={() => handleDeleteTimeSlot(slot.id)}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                    暂无时段数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 教室管理标签页 */}
      {activeTab === 'classrooms' && (
        <div className="tab-content active">
          <div className="toolbar">
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingItem({ type: 'classroom', data: null })
                setShowModal(true)
              }}
            >
              新增教室
            </button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>教室名称</th>
                <th>排序</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {classrooms.length > 0 ? (
                classrooms.map((classroom) => (
                  <tr key={classroom.id}>
                    <td>{classroom.id}</td>
                    <td>{classroom.name || ''}</td>
                    <td>{classroom.sort_order || 0}</td>
                    <td>
                      <span className={`status-badge status-${classroom.status === '启用' ? 'normal' : 'deleted'}`}>
                        {classroom.status || '启用'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-warning" onClick={() => handleEditClassroom(classroom)}>
                        编辑
                      </button>
                      <button className="btn btn-danger" onClick={() => handleDeleteClassroom(classroom.id)}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                    暂无教室数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 财务管理标签页 */}
      {activeTab === 'finance' && (
        <div className="tab-content active">
          <div className="toolbar">
            <button className="btn btn-primary" onClick={() => queryClient.invalidateQueries(['finance-config'])}>
              刷新
            </button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>配置项</th>
                <th>说明</th>
                <th>当前值</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {financeConfigs.length > 0 ? (
                financeConfigs.map((config) => {
                  const configName =
                    config.key === 'min_hours_for_scheduling'
                      ? '最低排课课时'
                      : config.key === 'min_hours_for_reminder'
                        ? '提醒课时阈值'
                        : config.key
                  return (
                    <tr key={config.id || config.key}>
                      <td>{configName}</td>
                      <td>{config.description || ''}</td>
                      <td>
                        <strong>{config.value}</strong>
                      </td>
                      <td>
                        <button className="btn btn-warning" onClick={() => handleEditFinanceConfig(config)}>
                          编辑
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                    暂无配置数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 时段管理模态框 */}
      {showModal && editingItem?.type === 'time-slot' && (
        <Modal
          isOpen={showModal}
          onClose={handleCloseModal}
          title={editingItem.data ? '编辑时段' : '新增时段'}
        >
          <form onSubmit={handleSubmitTimeSlot}>
            <div className="form-group">
              <label>时段名称 *</label>
              <input type="text" name="name" defaultValue={editingItem.data?.name || ''} required placeholder="如：8:10-9:30" />
            </div>
            <div className="form-group">
              <label>开始时间 *</label>
              <input type="text" name="start_time" defaultValue={editingItem.data?.start_time || ''} required placeholder="如：8:10" />
            </div>
            <div className="form-group">
              <label>结束时间 *</label>
              <input type="text" name="end_time" defaultValue={editingItem.data?.end_time || ''} required placeholder="如：9:30" />
            </div>
            <div className="form-group">
              <label>排序顺序</label>
              <input type="number" name="sort_order" defaultValue={editingItem.data?.sort_order || 0} min="0" />
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

      {/* 教室管理模态框 */}
      {showModal && editingItem?.type === 'classroom' && (
        <Modal
          isOpen={showModal}
          onClose={handleCloseModal}
          title={editingItem.data ? '编辑教室' : '新增教室'}
        >
          <form onSubmit={handleSubmitClassroom}>
            <div className="form-group">
              <label>教室名称 *</label>
              <input type="text" name="name" defaultValue={editingItem.data?.name || ''} required placeholder="如：A1" />
            </div>
            <div className="form-group">
              <label>排序顺序</label>
              <input type="number" name="sort_order" defaultValue={editingItem.data?.sort_order || 0} min="0" />
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

      {/* 财务管理模态框 */}
      {showModal && editingConfig && (
        <FinanceConfigModal
          isOpen={showModal}
          onClose={handleCloseModal}
          config={editingConfig}
          onSubmit={handleSubmitFinanceConfig}
          isLoading={updateFinanceConfigMutation.isLoading}
        />
      )}
    </div>
  )
}

// 财务配置模态框组件
const FinanceConfigModal = ({ isOpen, onClose, config, onSubmit, isLoading }) => {
  const [configValue, setConfigValue] = useState(config.value || 0)

  React.useEffect(() => {
    if (isOpen) {
      setConfigValue(config.value || 0)
    }
  }, [isOpen, config])

  const configName =
    config.key === 'min_hours_for_scheduling'
      ? '最低排课课时'
      : config.key === 'min_hours_for_reminder'
        ? '提醒课时阈值'
        : config.key

  const handleDecrease = () => {
    setConfigValue((prev) => prev - 1)
  }

  const handleIncrease = () => {
    setConfigValue((prev) => prev + 1)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    formData.set('value', configValue.toString())
    onSubmit(e)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="编辑财务配置">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>配置项</label>
          <input type="text" value={configName} disabled style={{ background: '#f5f5f5' }} />
        </div>
        <div className="form-group">
          <label>说明</label>
          <input
            type="text"
            name="description"
            defaultValue={config.description || ''}
            disabled
            style={{ background: '#f5f5f5' }}
          />
        </div>
        <div className="form-group">
          <label>配置值 *</label>
          <div className="number-input-group">
            <button type="button" className="decrease" onClick={handleDecrease}>
              -
            </button>
            <input
              type="number"
              id="config-value-input"
              name="value"
              value={configValue}
              step="1"
              required
              readOnly
              style={{ background: '#fff' }}
            />
            <button type="button" className="increase" onClick={handleIncrease}>
              +
            </button>
          </div>
          <small style={{ color: '#666', display: 'block', marginTop: '5px' }}>
            {config.key === 'min_hours_for_scheduling'
              ? '当学生剩余课时低于此值时，将无法进行排课'
              : '当学生剩余课时低于此值时，系统会进行缴费提醒'}
          </small>
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

export default OthersManage
