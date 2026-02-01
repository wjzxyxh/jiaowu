import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { permissionService } from '../services/permissionService'

/**
 * 权限检查Hook
 * 返回当前用户的模块权限和功能权限
 */
export const usePermissions = () => {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const { data: permissions, isLoading } = useQuery({
    queryKey: ['permissions-current-user'],
    queryFn: () => permissionService.getCurrentUserPermissions(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5分钟缓存
    cacheTime: 10 * 60 * 1000, // 10分钟缓存
  })

  const grantedModules = permissions?.modules || []
  const functionPermissions = permissions?.function_permissions || {}

  /**
   * 检查用户是否有模块权限
   * @param {string} moduleCode - 模块代码
   * @returns {boolean}
   */
  const hasModulePermission = (moduleCode) => {
    if (isAdmin) return true
    return grantedModules.includes(moduleCode)
  }

  /**
   * 检查用户是否有功能权限
   * @param {string} moduleCode - 模块代码
   * @param {string} functionCode - 功能代码
   * @returns {boolean}
   */
  const hasFunctionPermission = (moduleCode, functionCode) => {
    if (isAdmin) return true
    
    // 先检查模块权限
    if (!hasModulePermission(moduleCode)) {
      return false
    }

    // 检查功能权限
    const moduleFuncPerms = functionPermissions[moduleCode]
    if (!moduleFuncPerms) {
      // 如果没有设置功能权限，默认授权（向后兼容）
      return true
    }

    // 如果功能权限中明确设置为false，则拒绝
    if (moduleFuncPerms[functionCode] === false) {
      return false
    }

    // 如果功能权限中设置为true或未设置，则授权
    return moduleFuncPerms[functionCode] !== false
  }

  return {
    isLoading,
    isAdmin,
    grantedModules,
    functionPermissions,
    hasModulePermission,
    hasFunctionPermission,
  }
}
