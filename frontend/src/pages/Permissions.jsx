import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { permissionService } from '../services/permissionService'
import Modal from '../components/Modal'
import './Permissions.css'

const Permissions = () => {
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showEditUserModal, setShowEditUserModal] = useState(false)
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const [showPermissionDetailModal, setShowPermissionDetailModal] = useState(false)
  const [viewingUserId, setViewingUserId] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [localPermissions, setLocalPermissions] = useState([])
  const [searchKeyword, setSearchKeyword] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
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
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries(['user-permissions', variables.userId])
      alert('权限保存成功！')
      // 重新加载权限以同步状态
      queryClient.refetchQueries(['user-permissions', variables.userId])
    },
    onError: (error) => {
      alert('保存权限失败：' + (error?.response?.data?.error || error?.message || '未知错误'))
    },
  })

  // 打开权限授权模态框
  const handleOpenPermissionModal = (userId) => {
    setSelectedUserId(userId)
    setShowPermissionModal(true)
    setLocalPermissions([])
  }

  // 关闭权限授权模态框
  const handleClosePermissionModal = () => {
    setShowPermissionModal(false)
    setSelectedUserId(null)
    setLocalPermissions([])
  }

  // 打开授权状态详情模态框
  const handleOpenPermissionDetailModal = (userId) => {
    setViewingUserId(userId)
    setShowPermissionDetailModal(true)
  }

  // 关闭授权状态详情模态框
  const handleClosePermissionDetailModal = () => {
    setShowPermissionDetailModal(false)
    setViewingUserId(null)
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
        return [...prev, { module, is_granted: newValue, function_permissions: {} }]
      }
    })
  }

  // 切换功能权限（仅更新本地状态，不立即保存）
  const handleFunctionPermissionToggle = (module, functionCode, currentValue) => {
    if (!selectedUserId) {
      alert('请先选择子管理员')
      return
    }

    const newValue = !currentValue
    setLocalPermissions((prev) => {
      const existing = prev.find((p) => p.module === module)
      const functionPerms = existing?.function_permissions || {}
      const updatedFunctionPerms = { ...functionPerms, [functionCode]: newValue }
      
      if (existing) {
        return prev.map((p) => 
          p.module === module 
            ? { ...p, function_permissions: updatedFunctionPerms }
            : p
        )
      } else {
        return [...prev, { module, is_granted: false, function_permissions: updatedFunctionPerms }]
      }
    })
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
    }, {
      onSuccess: () => {
        handleClosePermissionModal()
        // 刷新用户权限查询
        queryClient.invalidateQueries(['user-permissions'])
      }
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

  // 获取用户授权状态摘要
  const getUserPermissionSummary = (userId) => {
    // 使用缓存的权限数据
    const userPerms = queryClient.getQueryData(['user-permissions', userId])
    if (!userPerms || userPerms.length === 0) {
      return { granted: 0, total: modules.length, text: '未授权' }
    }
    const grantedCount = userPerms.filter((p) => p.is_granted).length
    if (grantedCount === 0) {
      return { granted: 0, total: modules.length, text: '未授权' }
    }
    if (grantedCount === modules.length) {
      return { granted: grantedCount, total: modules.length, text: '全部授权' }
    }
    return { granted: grantedCount, total: modules.length, text: `${grantedCount}/${modules.length}` }
  }

  // 预加载所有用户的权限信息（用于在列表中显示）
  useEffect(() => {
    users.forEach((user) => {
      if (user.role !== 'admin') {
        queryClient.prefetchQuery({
          queryKey: ['user-permissions', user.id],
          queryFn: () => permissionService.getUserPermissions(user.id),
          staleTime: 5 * 60 * 1000, // 5分钟
        })
      }
    })
  }, [users, queryClient])

  // 过滤用户列表
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      // 搜索关键词过滤
      if (searchKeyword) {
        const keyword = searchKeyword.toLowerCase()
        const matchUsername = user.username?.toLowerCase().includes(keyword)
        const matchRealName = user.real_name?.toLowerCase().includes(keyword)
        if (!matchUsername && !matchRealName) {
          return false
        }
      }
      // 角色过滤
      if (roleFilter !== 'all' && user.role !== roleFilter) {
        return false
      }
      return true
    })
  }, [users, searchKeyword, roleFilter])

  if (usersLoading) return <div className="loading">加载中...</div>

  return (
    <div className="permissions-page">
      <div className="page-header">
        <h1>系统管理员 - 用户与权限管理</h1>
      </div>

      <div className="admin-container">
        <div className="users-section">
          <div className="users-toolbar">
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="搜索用户名或姓名..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  width: '200px',
                }}
              />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              >
                <option value="all">所有角色</option>
                <option value="teacher">教务</option>
                <option value="finance">财务</option>
                <option value="readonly">只读</option>
              </select>
              <button className="btn btn-primary" onClick={() => setShowAddUserModal(true)}>
                新增子管理员
              </button>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="users-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>用户名</th>
                <th>真实姓名</th>
                <th>角色</th>
                <th>状态</th>
                <th>授权状态</th>
                <th>创建时间</th>
                <th>最后登录</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                    {users.length === 0 ? '暂无用户' : '没有找到匹配的用户'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const roleInfo = roleMap[user.role] || { name: user.role, class: '' }
                  const isAdmin = user.role === 'admin'
                  const permissionSummary = isAdmin ? { granted: modules.length, total: modules.length, text: '全部授权' } : getUserPermissionSummary(user.id)
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
                      <td>
                        <span
                          className="permission-status-link"
                          onClick={() => handleOpenPermissionDetailModal(user.id)}
                          style={{
                            color: permissionSummary.granted > 0 ? '#667eea' : '#999',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            fontWeight: 500
                          }}
                        >
                          {permissionSummary.text}
                        </span>
                      </td>
                      <td>{formatDate(user.created_at)}</td>
                      <td>{formatDate(user.last_login)}</td>
                      <td>
                        <button
                          className="btn btn-info btn-sm"
                          onClick={() => handleOpenPermissionModal(user.id)}
                          disabled={isAdmin}
                          title={isAdmin ? '管理员拥有所有权限' : '设置权限'}
                          style={{ marginRight: '5px' }}
                        >
                          权限
                        </button>
                        <button
                          className="btn btn-warning btn-sm"
                          onClick={() => handleShowEditUser(user)}
                          disabled={isAdmin}
                          title={isAdmin ? '不能编辑管理员' : ''}
                          style={{ marginRight: '5px' }}
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

      {/* 权限授权模态框（按模块与功能自行勾选） */}
      {showPermissionModal && selectedUserId && (
        <PermissionModal
          userId={selectedUserId}
          users={users}
          modules={modules}
          userPermissions={userPermissions}
          localPermissions={localPermissions}
          setLocalPermissions={setLocalPermissions}
          permsLoading={permsLoading}
          onClose={handleClosePermissionModal}
          onSave={handleSavePermissions}
          onPermissionToggle={handlePermissionToggle}
          onFunctionPermissionToggle={handleFunctionPermissionToggle}
        />
      )}

      {/* 授权状态详情模态框 */}
      {showPermissionDetailModal && viewingUserId && (
        <PermissionDetailModal
          userId={viewingUserId}
          users={users}
          modules={modules}
          onClose={handleClosePermissionDetailModal}
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

// 权限授权模态框组件（按模块与功能自行勾选）
const PermissionModal = ({
  userId,
  users,
  modules,
  userPermissions,
  localPermissions,
  setLocalPermissions,
  permsLoading,
  onClose,
  onSave,
  onPermissionToggle,
  onFunctionPermissionToggle,
}) => {
  const selectedUser = useMemo(() => users.find((u) => u.id === userId), [users, userId])
  const isAdmin = selectedUser?.role === 'admin'

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`权限授权 - ${selectedUser?.real_name || selectedUser?.username}`}
      style={{ maxWidth: '90%', width: '1200px' }}
      headerActions={
        !permsLoading ? (
          <button type="button" className="perm-modal__save" onClick={onSave}>
            保存更改
          </button>
        ) : null
      }
    >
      <div className="permissions-modal-content perm-modal">
        {permsLoading ? (
          <div className="loading">加载权限中...</div>
        ) : (
          <>
            <div className="perm-modal__list">
              {modules.map((module) => {
                const permission =
                  localPermissions.find((p) => p.module === module.code) ||
                  userPermissions.find((p) => p.module === module.code) || {
                    module: module.code,
                    is_granted: false,
                    function_permissions: {},
                  }
                const isGranted = permission.is_granted || false
                const functionPerms = permission.function_permissions || {}
                const moduleFunctions = module.functions || []

                return (
                  <div
                    key={module.code}
                    className={`perm-module-card ${isGranted || isAdmin ? 'is-granted' : ''}`}
                  >
                    <div className="perm-module-card__head">
                      <div className="perm-module-card__title-wrap">
                        <span className="perm-module-card__icon">{module.icon}</span>
                        <div>
                          <div className="perm-module-card__name">{module.name}</div>
                          <div className="perm-module-card__code">{module.code}</div>
                        </div>
                      </div>
                      {isAdmin ? (
                        <div className="perm-modal__admin-badge">
                          👑 管理员拥有所有权限
                        </div>
                      ) : (
                        <label className="perm-module-card__toggle">
                          <input
                            type="checkbox"
                            checked={isGranted}
                            onChange={() => onPermissionToggle(module.code, isGranted)}
                          />
                          <span>模块权限</span>
                        </label>
                      )}
                    </div>
                    {!isAdmin && isGranted && moduleFunctions.length > 0 && (
                      <div className="perm-module-card__body">
                        <div className="perm-module-card__functions">
                          <div className="perm-module-card__functions-label">工具栏功能</div>
                          <div className="perm-module-card__functions-grid">
                            {moduleFunctions.map((func) => {
                              const funcGranted = functionPerms[func.code] !== undefined ? functionPerms[func.code] : true
                              return (
                                <label
                                  key={func.code}
                                  className={`perm-func-item ${funcGranted ? 'is-checked' : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={funcGranted}
                                    onChange={() => onFunctionPermissionToggle(module.code, func.code, funcGranted)}
                                  />
                                  <span>{func.name}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// 授权状态详情模态框组件
const PermissionDetailModal = ({ userId, users, modules, onClose }) => {
  const queryClient = useQueryClient()
  const { data: userPermissions = [], isLoading } = useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: () => permissionService.getUserPermissions(userId),
    enabled: !!userId,
  })

  const selectedUser = users.find((u) => u.id === userId)
  const isAdmin = selectedUser?.role === 'admin'

  if (isLoading) {
    return (
      <Modal isOpen={true} onClose={onClose} title={`授权状态详情 - ${selectedUser?.real_name || selectedUser?.username}`}>
        <div className="loading">加载中...</div>
      </Modal>
    )
  }

  return (
    <Modal isOpen={true} onClose={onClose} title={`授权状态详情 - ${selectedUser?.real_name || selectedUser?.username}`} style={{ maxWidth: '90%', width: '1000px' }}>
      <div className="permission-detail-content">
        {isAdmin ? (
          <div style={{ 
            padding: '20px', 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '12px',
            color: 'white',
            textAlign: 'center',
            fontSize: '16px',
            fontWeight: 600
          }}>
            👑 管理员拥有所有权限
          </div>
        ) : (
          <div className="permissions-grid">
            {modules.map((module) => {
              const permission = userPermissions.find((p) => p.module === module.code) || {
                module: module.code,
                is_granted: false,
                function_permissions: {},
              }
              const isGranted = permission.is_granted || false
              const functionPerms = permission.function_permissions || {}
              const moduleFunctions = module.functions || []

              return (
                <div
                  key={module.code}
                  className={`permission-card ${isGranted ? 'granted' : 'denied'}`}
                  style={{ marginBottom: '20px' }}
                >
                  <div className="permission-info" style={{ marginBottom: '15px' }}>
                    <div className="permission-name">
                      <span className="permission-icon">{module.icon}</span>
                      {module.name}
                    </div>
                    <div className="permission-code">{module.code}</div>
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <span style={{ 
                      fontWeight: 600, 
                      color: isGranted ? '#28a745' : '#dc3545',
                      fontSize: '14px'
                    }}>
                      {isGranted ? '✓ 已授权' : '✗ 未授权'}
                    </span>
                  </div>
                  {isGranted && moduleFunctions.length > 0 && (
                    <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '2px solid #e8ecf0' }}>
                      <div style={{ fontSize: '13px', color: '#667eea', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        🔧 工具栏功能
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {moduleFunctions.map((func) => {
                          const funcGranted = functionPerms[func.code] !== undefined ? functionPerms[func.code] : true
                          return (
                            <div
                              key={func.code}
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '10px', 
                                fontSize: '14px',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                background: funcGranted ? '#f0f7ff' : '#f8f9fa',
                              }}
                            >
                              <span style={{ 
                                color: funcGranted ? '#28a745' : '#dc3545',
                                fontWeight: 600,
                                fontSize: '16px'
                              }}>
                                {funcGranted ? '✓' : '✗'}
                              </span>
                              <span style={{ color: '#333', fontWeight: 500 }}>{func.name}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}

export default Permissions
