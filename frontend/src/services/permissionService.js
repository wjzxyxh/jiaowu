import api from './api'

export const permissionService = {
  // 获取所有模块列表
  getModules: async () => {
    return api.get('/permissions/modules')
  },

  // 获取用户权限
  getUserPermissions: async (userId) => {
    return api.get(`/permissions/users/${userId}`)
  },

  // 更新用户权限
  updateUserPermission: async (userId, module, data) => {
    return api.put(`/permissions/users/${userId}/modules/${module}`, data)
  },

  // 批量更新用户权限
  batchUpdateUserPermissions: async (userId, permissions) => {
    return api.put(`/permissions/users/${userId}/modules`, { permissions })
  },

  // 获取所有用户
  getUsers: async () => {
    return api.get('/users')
  },

  // 获取当前用户权限
  getCurrentUserPermissions: async () => {
    return api.get('/permissions/current-user')
  },

  // 创建用户
  createUser: async (data) => {
    return api.post('/users', data)
  },

  // 更新用户
  updateUser: async (userId, data) => {
    return api.put(`/users/${userId}`, data)
  },

  // 删除用户
  deleteUser: async (userId) => {
    return api.delete(`/users/${userId}`)
  },
}
