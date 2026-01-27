import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { permissionService } from '../services/permissionService'
import Modal from '../components/Modal'
import './Permissions.css'

const Permissions = () => {
  const [activeTab, setActiveTab] = useState('users')
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showEditUserModal, setShowEditUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [localPermissions, setLocalPermissions] = useState([])
  const queryClient = useQueryClient()
  const prevPermissionsKeyRef = useRef(null)
  const prevSelectedUserIdRef = useRef(null)
  const userPermissionsRef = useRef([])

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => permissionService.getUsers(),
  })

  const { data: modules = [] } = useQuery({
    queryKey: ['permission-modules'],
    queryFn: () => permissionService.getModules(),
  })

  const { data: userPermissions = [], isLoading: permsLoading } = useQuery({
    queryKey: ['user-permissions', selectedUserId],
    queryFn: () => permissionService.getUserPermissions(selectedUserId),
    enabled: !!selectedUserId,
  })

  // 更新 ref 以存储最新的 userPermissions
  useEffect(() => {
    userPermissionsRef.current = userPermissions || []
  }, [userPermissions])

  // 当 selectedUserId 变化时，重置 localPermissions
  useEffect(() => {
    if (selectedUserId !== prevSelectedUserIdRef.current) {
      prevSelectedUserIdRef.current = selectedUserId
      prevPermissionsKeyRef.current = null
      setLocalPermissions([])
    }
  }, [selectedUserId])

  // 当 userPermissions 加载完成时，同步到 localPermissions（仅一次）
  useEffect(() => {
    if (!selectedUserId || permsLoading) return

    const perms = userPermissionsRef.current
    // 创建当前权限的 key（用于比较）
    const currentKey = perms && perms.length > 0
      ? JSON.stringify(perms.map((p) => ({ module: p.module, is_granted: p.is_granted })).sort((a, b) => a.module.localeCompare(b.module)))
      : '[]'

    // 只在 key 变化时更新
    if (currentKey !== prevPermissionsKeyRef.current) {
      prevPermissionsKeyRef.current = currentKey
      setLocalPermissions([...perms])
    }
  }, [selectedUserId, permsLoading])

  // 用户管理 mutations
  const createUserMutation = useMutation({
    mutationFn: (data) => permissionService.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['users'])
      setShowAddUserModal(false)
      alert('子管理员创建成功！')
    },
    onError: (error) => {
      alert('创建子管理员失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, data }) => permissionService.updateUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['users'])
      setShowEditUserModal(false)
      setEditingUser(null)
      alert('子管理员更新成功！')
    },
    onError: (error) => {
      alert('更新子管理员失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  const deleteUserMutation = useMutation({
    mutationFn: (userId) => permissionService.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries(['users'])
      alert('子管理员删除成功！')
    },
    onError: (error) => {
      alert('删除子管理员失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  // 权限管理 mutations
  const batchUpdatePermissionsMutation = useMutation({
    mutationFn: ({ userId, permissions }) => permissionService.batchUpdateUserPermissions(userId, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries(['user-permissions', selectedUserId])
      alert('权限保存成功！')
      // 重新加载权限以同步状态
      queryClient.refetchQueries(['user-permissions', selectedUserId])
    },
    onError: (error) => {
      alert('保存权限失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  // 切换标签页
  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'users') {
      queryClient.invalidateQueries(['users'])
    }
  }

  // 用户选择变化
  const handleUserSelect = (userId) => {
    setSelectedUserId(userId)
    setLocalPermissions([])
  }

  // 切换单个权限（仅更新本地状态，不立即保存）
  const handlePermissionToggle = (module, currentValue) => {
    if (!selectedUserId) {
      alert('请先选择子管理员')
      return
    }

    const newValue = !currentValue
    setLocalPermissions((prev) => {
      const existing = prev.find((p) => p.module === module)
      if (existing) {
        return prev.map((p) => (p.module === module ? { ...p, is_granted: newValue } : p))
      } else {
        return [...prev, { module, is_granted: newValue }]
      }
    })
  }

  // 全部授权
  const handleGrantAll = () => {
    if (!selectedUserId) {
      alert('请先选择子管理员')
      return
    }

    const updatedPermissions = modules.map((module) => ({
      module: module.code,
      is_granted: true,
    }))

    setLocalPermissions(updatedPermissions)
  }

  // 全部撤销
  const handleRevokeAll = () => {
    if (!selectedUserId) {
      alert('请先选择子管理员')
      return
    }

    const updatedPermissions = modules.map((module) => ({
      module: module.code,
      is_granted: false,
    }))

    setLocalPermissions(updatedPermissions)
  }

  // 保存权限
  const handleSavePermissions = () => {
    if (!selectedUserId) {
      alert('请先选择子管理员')
      return
    }

    if (!window.confirm('确定要保存权限更改吗？')) {
      return
    }

    batchUpdatePermissionsMutation.mutate({
      userId: selectedUserId,
      permissions: localPermissions,
    })
  }

  // 显示编辑用户模态框
  const handleShowEditUser = (user) => {
    if (user.role === 'admin') {
      alert('不能编辑系统管理员')
      return
    }
    setEditingUser(user)
    setShowEditUserModal(true)
  }

  // 删除用户
  const handleDeleteUser = (user) => {
    if (user.role === 'admin') {
      alert('不能删除系统管理员')
      return
    }

    if (!window.confirm(`确定要删除子管理员 "${user.real_name || user.username}" 吗？\n\n此操作不可恢复！`)) {
      return
    }

    deleteUserMutation.mutate(user.id)
  }

  // 保存用户（新增或编辑）
  const handleSaveUser = (formData, userId) => {
    const data = {
      username: formData.username,
      password: formData.password,
      real_name: formData.real_name || '',
      role: formData.role,
    }

    if (formData.is_active !== undefined) {
      data.is_active = formData.is_active === 'true' || formData.is_active === true
    }

    // 验证密码长度
    if (data.password && data.password.trim() !== '') {
      const passwordBytes = new TextEncoder().encode(data.password).length
      if (passwordBytes > 72) {
        alert('密码长度不能超过72个字符（UTF-8编码）')
        return
      }
    } else if (userId) {
      // 编辑时密码为空则不修改密码
      delete data.password
    }

    if (userId) {
      updateUserMutation.mutate({ userId, data })
    } else {
      createUserMutation.mutate(data)
    }
  }

  // 角色映射
  const roleMap = {
    admin: { name: '系统管理员', class: 'role-admin' },
    teacher: { name: '子管理员（教务）', class: 'role-teacher' },
    finance: { name: '子管理员（财务）', class: 'role-finance' },
    readonly: { name: '子管理员（只读）', class: 'role-readonly' },
  }

  // 格式化日期
  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('zh-CN')
    } catch {
      return dateStr
    }
  }

  if (usersLoading) return <div className="loading">加载中...</div>

  return (
    <div className="permissions-page">
      <div className="page-header">
        <h1>系统管理员 - 用户与权限管理</h1>
      </div>

      <div className="admin-container">
        {/* 标签页 */}
        <div className="admin-tabs">
          <button
            className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => handleTabChange('users')}
          >
            子管理员管理
          </button>
          <button
            className={`admin-tab ${activeTab === 'permissions' ? 'active' : ''}`}
            onClick={() => handleTabChange('permissions')}
          >
            权限授权
          </button>
        </div>

        {/* 用户管理标签页 */}
        {activeTab === 'users' && (
          <div className="tab-content active">
            <div className="users-section">
              <div className="users-toolbar">
                <div>
                  <h2 style={{ margin: 0 }}>子管理员管理</h2>
                  <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
                    管理子管理员账号，子管理员需要授权后才能访问功能模块
                  </p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowAddUserModal(true)}>
                  新增子管理员
                </button>
              </div>
              <table className="users-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>用户名</th>
                    <th>真实姓名</th>
                    <th>角色</th>
                    <th>状态</th>
                    <th>创建时间</th>
                    <th>最后登录</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                        暂无用户
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => {
                      const roleInfo = roleMap[user.role] || { name: user.role, class: '' }
                      const isAdmin = user.role === 'admin'
                      return (
                        <tr key={user.id}>
                          <td>{user.id}</td>
                          <td>{user.username}</td>
                          <td>{user.real_name || '-'}</td>
                          <td>
                            <span className={`role-badge ${roleInfo.class}`}>{roleInfo.name}</span>
                          </td>
                          <td>
                            <span className={`status-badge ${user.is_active ? 'status-active' : 'status-inactive'}`}>
                              {user.is_active ? '启用' : '禁用'}
                            </span>
                          </td>
                          <td>{formatDate(user.created_at)}</td>
                          <td>{formatDate(user.last_login)}</td>
                          <td>
                            <button
                              className="btn btn-warning btn-sm"
                              onClick={() => handleShowEditUser(user)}
                              disabled={isAdmin}
                              title={isAdmin ? '不能编辑管理员' : ''}
                            >
                              编辑
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDeleteUser(user)}
                              disabled={isAdmin}
                              title={isAdmin ? '不能删除管理员' : ''}
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
        )}

        {/* 权限管理标签页 */}
        {activeTab === 'permissions' && (
          <div className="tab-content active">
            <div className="permissions-container">
              <div
                style={{
                  marginBottom: '20px',
                  padding: '15px',
                  background: '#f0f7ff',
                  borderRadius: '8px',
                  borderLeft: '4px solid #667eea',
                }}
              >
                <h3 style={{ margin: '0 0 5px 0', color: '#333' }}>子管理员权限授权</h3>
                <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
                  为子管理员授权功能模块访问权限，未授权的模块将不会显示在首页
                </p>
              </div>

              <div className="user-selector">
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 500 }}>
                  选择子管理员：
                </label>
                <select
                  id="user-select"
                  value={selectedUserId || ''}
                  onChange={(e) => handleUserSelect(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">-- 请选择子管理员 --</option>
                  {users.map((user) => {
                    const roleText = user.role === 'admin' ? '系统管理员' : '子管理员'
                    return (
                      <option key={user.id} value={user.id}>
                        {user.real_name || user.username} ({roleText})
                      </option>
                    )
                  })}
                </select>
              </div>

              {selectedUserId ? (
                <>
                  {permsLoading ? (
                    <div className="loading">加载权限中...</div>
                  ) : (
                    <>
                      <div className="batch-actions">
                        <button className="btn btn-primary" onClick={handleGrantAll}>
                          全部授权
                        </button>
                        <button className="btn btn-secondary" onClick={handleRevokeAll}>
                          全部撤销
                        </button>
                        <button className="btn btn-success" onClick={handleSavePermissions}>
                          保存更改
                        </button>
                      </div>

                      <div className="permissions-grid">
                        {modules.map((module) => {
                          // 优先使用 localPermissions（本地修改），否则使用 userPermissions（服务器数据）
                          const permission =
                            localPermissions.find((p) => p.module === module.code) ||
                            userPermissions.find((p) => p.module === module.code) || {
                              module: module.code,
                              is_granted: false,
                            }
                          const isGranted = permission.is_granted || false
                          const selectedUser = users.find((u) => u.id === selectedUserId)
                          const isAdmin = selectedUser?.role === 'admin'

                          return (
                            <div
                              key={module.code}
                              className={`permission-card ${isGranted ? 'granted' : 'denied'}`}
                            >
                              <div className="permission-info">
                                <div className="permission-name">
                                  <span className="permission-icon">{module.icon}</span>
                                  {module.name}
                                </div>
                                <div className="permission-code">{module.code}</div>
                              </div>
                              {isAdmin ? (
                                <span className="admin-badge">管理员拥有所有权限</span>
                              ) : (
                                <label className="permission-toggle">
                                  <input
                                    type="checkbox"
                                    checked={isGranted}
                                    onChange={() => handlePermissionToggle(module.code, isGranted)}
                                  />
                                  <span className="permission-toggle-slider"></span>
                                </label>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">🔐</div>
                  <div>请选择一个子管理员来管理权限</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 新增用户模态框 */}
      {showAddUserModal && (
        <AddUserModal
          onClose={() => setShowAddUserModal(false)}
          onSave={(formData) => handleSaveUser(formData)}
        />
      )}

      {/* 编辑用户模态框 */}
      {showEditUserModal && editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => {
            setShowEditUserModal(false)
            setEditingUser(null)
          }}
          onSave={(formData) => handleSaveUser(formData, editingUser.id)}
        />
      )}
    </div>
  )
}

// 新增用户模态框组件
const AddUserModal = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    real_name: '',
    role: 'teacher',
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="新增子管理员">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>用户名 *</label>
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
          />
          <small style={{ color: '#666', display: 'block', marginTop: '5px' }}>子管理员的登录用户名</small>
        </div>
        <div className="form-group">
          <label>密码 *</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
            maxLength={72}
          />
          <small style={{ color: '#666', display: 'block', marginTop: '5px' }}>
            密码长度不能超过72个字符
          </small>
        </div>
        <div className="form-group">
          <label>真实姓名</label>
          <input
            type="text"
            name="real_name"
            value={formData.real_name}
            onChange={(e) => setFormData({ ...formData, real_name: e.target.value })}
          />
          <small style={{ color: '#666', display: 'block', marginTop: '5px' }}>
            子管理员的真实姓名（可选）
          </small>
        </div>
        <div className="form-group">
          <label>角色类型 *</label>
          <select
            name="role"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            required
          >
            <option value="teacher">子管理员（教务权限）</option>
            <option value="finance">子管理员（财务权限）</option>
            <option value="readonly">子管理员（只读权限）</option>
          </select>
          <small style={{ color: '#666', display: 'block', marginTop: '5px' }}>
            选择子管理员的角色类型，创建后需要在"权限管理"标签页中授权功能模块
          </small>
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

// 编辑用户模态框组件
const EditUserModal = ({ user, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    password: '',
    real_name: user.real_name || '',
    role: user.role,
    is_active: user.is_active,
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="编辑子管理员">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>用户名</label>
          <input type="text" value={user.username} disabled style={{ background: '#f5f5f5' }} />
          <small style={{ color: '#666' }}>用户名不可修改</small>
        </div>
        <div className="form-group">
          <label>密码</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder="留空则不修改密码"
            maxLength={72}
          />
          <small style={{ color: '#666', display: 'block', marginTop: '5px' }}>
            密码长度不能超过72个字符，留空则不修改密码
          </small>
        </div>
        <div className="form-group">
          <label>真实姓名</label>
          <input
            type="text"
            name="real_name"
            value={formData.real_name}
            onChange={(e) => setFormData({ ...formData, real_name: e.target.value })}
          />
          <small style={{ color: '#666', display: 'block', marginTop: '5px' }}>子管理员的真实姓名</small>
        </div>
        <div className="form-group">
          <label>角色类型 *</label>
          <select
            name="role"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            required
          >
            <option value="teacher">子管理员（教务权限）</option>
            <option value="finance">子管理员（财务权限）</option>
            <option value="readonly">子管理员（只读权限）</option>
          </select>
          <small style={{ color: '#666', display: 'block', marginTop: '5px' }}>
            注意：不能将子管理员角色修改为系统管理员
          </small>
        </div>
        <div className="form-group">
          <label>状态</label>
          <select
            name="is_active"
            value={formData.is_active ? 'true' : 'false'}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
          >
            <option value="true">启用</option>
            <option value="false">禁用</option>
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

export default Permissions
