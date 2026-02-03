import { useEffect, useRef, useCallback } from 'react'

/**
 * 活动检测Hook
 * 监听用户活动（鼠标移动、点击、键盘输入、滚动等），如果指定时间内无操作，触发回调
 * @param {Function} onInactive - 无活动时触发的回调函数
 * @param {number} inactiveTime - 无活动时间（毫秒），默认24小时（86400000ms）
 */
export const useActivityTracker = (onInactive, inactiveTime = 86400000) => {
  const timeoutRef = useRef(null)
  const lastActivityRef = useRef(Date.now())

  // 重置活动计时器
  const resetTimer = useCallback(() => {
    // 清除之前的定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // 更新最后活动时间
    lastActivityRef.current = Date.now()

    // 设置新的定时器
    timeoutRef.current = setTimeout(() => {
      if (onInactive) {
        onInactive()
      }
    }, inactiveTime)
  }, [onInactive, inactiveTime])

  // 处理用户活动
  const handleActivity = useCallback(() => {
    resetTimer()
  }, [resetTimer])

  useEffect(() => {
    // 监听各种用户活动事件
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
      'keydown',
    ]

    // 添加事件监听器
    events.forEach((event) => {
      document.addEventListener(event, handleActivity, true)
    })

    // 初始化计时器
    resetTimer()

    // 清理函数：移除事件监听器和定时器
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity, true)
      })
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [handleActivity, resetTimer])

  // 手动重置计时器（供外部调用）
  return {
    resetTimer,
  }
}
