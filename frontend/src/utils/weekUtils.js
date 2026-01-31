/**
 * 星期与时段逻辑 - 与 /courses 页面一致
 * 第一周 = 当月第一个周一所在周，周一到周日为一周
 */

export function getFirstMondayOfMonth(year, monthNum) {
  const firstDay = new Date(year, monthNum - 1, 1)
  const dayOfWeek = firstDay.getDay() // 0=周日, 1=周一, ..., 6=周六
  const offset = (8 - dayOfWeek) % 7
  return new Date(year, monthNum - 1, 1 + offset)
}

export function getCurrentWeekDateRange(monthFilter, weekFilter) {
  if (!monthFilter || !weekFilter) return null

  const [year, month] = monthFilter.split('-').map(Number)
  const weekNum = parseInt(weekFilter)
  const firstMonday = getFirstMondayOfMonth(year, month)
  const startDate = new Date(firstMonday)
  startDate.setDate(startDate.getDate() + (weekNum - 1) * 7)
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 6)
  return { startDate, endDate, year, month }
}

export function getWeekInMonth(date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const firstMonday = getFirstMondayOfMonth(year, month)
  if (date < firstMonday) return 1
  const diffMs = date.getTime() - firstMonday.getTime()
  const weekNum = 1 + Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000))
  return Math.max(1, weekNum)
}

/** 获取包含给定日期的那一周的月份和周数（周一到周日为一周） */
export function getMonthAndWeekContainingDate(date) {
  const dayOfWeek = date.getDay()
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const mondayOfWeek = new Date(date)
  mondayOfWeek.setDate(date.getDate() - daysToMonday)
  const year = mondayOfWeek.getFullYear()
  const month = mondayOfWeek.getMonth() + 1
  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const week = getWeekInMonth(mondayOfWeek)
  return { currentMonth: monthStr, currentWeek: week.toString() }
}

/** 星期顺序（与 courses 一致） */
export const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** 根据 month/week 计算每个星期的日期映射 */
export function getWeekDateMap(monthFilter, weekFilter) {
  const range = getCurrentWeekDateRange(monthFilter, weekFilter)
  if (!range) return {}

  const weekdayMap = { 0: '周日', 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六' }
  const map = {}
  let currentDate = new Date(range.startDate)
  const endTime = range.endDate.getTime()

  while (currentDate.getTime() <= endTime) {
    const weekday = weekdayMap[currentDate.getDay()]
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
    map[weekday] = dateStr
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return map
}

/** 按时段排序（与 courses 一致：sort_order 优先，其次 name） */
export function sortTimeSlots(timeSlots) {
  return [...(timeSlots || [])].sort((a, b) => {
    const orderA = a.sort_order != null ? a.sort_order : 999
    const orderB = b.sort_order != null ? b.sort_order : 999
    if (orderA !== orderB) return orderA - orderB
    return (a.name || '').localeCompare(b.name || '')
  })
}
