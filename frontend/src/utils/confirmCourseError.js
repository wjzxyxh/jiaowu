/**
 * 确认课程失败时的提示文案（与 api 拦截器一致：4xx 的 response.data 在 err 上）
 * 供 Courses 与 AllCourses 共用。
 */

export function formatDateToMonthDay(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'T00:00:00')
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/**
 * 根据确认失败的错误对象生成提示文案。
 * @param {object} err - 拦截器 reject 的对象（含 required_courses、required_courses_label、error）
 * @returns {string} 用于 alert 的完整文案
 */
export function buildConfirmFailureMessage(err) {
  const data = err && typeof err === 'object' ? err : {}
  const requiredLabel = data.required_courses_label
  const requiredList = data.required_courses
  const backendMsg = data.error || err?.message || ''

  let listStr = requiredLabel || ''
  if (Array.isArray(requiredList) && requiredList.length) {
    const byDate = {}
    requiredList.forEach((c) => {
      const d = c.course_date || ''
      if (!byDate[d]) byDate[d] = []
      if (c.time_slot) byDate[d].push(String(c.time_slot).trim())
    })
    const parts = Object.keys(byDate).sort().map((dateStr) => {
      const dateLabel = formatDateToMonthDay(dateStr)
      const times = byDate[dateStr]
      return times.length ? `${dateLabel} ${times.join('、')}` : dateLabel
    })
    listStr = parts.filter(Boolean).join('；')
  }

  const count = Array.isArray(requiredList) ? requiredList.length : 0
  if (listStr) {
    const head = count ? `还有 ${count} 个课程未确认。\n\n` : ''
    return `${head}因以下课程未确认，导致确认失败：\n${listStr}\n请先确认这些课程后再操作。`
  }
  return `课程确认失败。${backendMsg ? '\n' + backendMsg : ''}`.trim()
}
