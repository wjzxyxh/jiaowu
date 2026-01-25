/**
 * 通用工具函数
 */

/**
 * 格式化日期
 */
export const formatDate = (date, format = 'YYYY-MM-DD') => {
    if (!date) return ''
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hour = String(d.getHours()).padStart(2, '0')
    const minute = String(d.getMinutes()).padStart(2, '0')
    const second = String(d.getSeconds()).padStart(2, '0')
    
    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hour)
        .replace('mm', minute)
        .replace('ss', second)
}

/**
 * 格式化时间
 */
export const formatTime = (date) => {
    return formatDate(date, 'HH:mm')
}

/**
 * 格式化日期时间
 */
export const formatDateTime = (date) => {
    return formatDate(date, 'YYYY-MM-DD HH:mm:ss')
}

/**
 * 获取角色中文名称
 */
export const getRoleName = (role) => {
    const roleMap = {
        'admin': '管理员',
        'teacher': '教务',
        'finance': '财务',
        'readonly': '只读',
        'user': '用户'
    }
    return roleMap[role] || '用户'
}

/**
 * 防抖函数
 */
export const debounce = (func, wait) => {
    let timeout
    return function(...args) {
        clearTimeout(timeout)
        timeout = setTimeout(() => {
            func.apply(this, args)
        }, wait)
    }
}

/**
 * 节流函数
 */
export const throttle = (func, wait) => {
    let timeout
    return function(...args) {
        if (!timeout) {
            timeout = setTimeout(() => {
                timeout = null
                func.apply(this, args)
            }, wait)
        }
    }
}
