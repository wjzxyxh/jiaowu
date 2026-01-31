import React, { useMemo, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import html2canvas from 'html2canvas'
import { courseService } from '../services/courseService'
import { othersService } from '../services/othersService'
import {
  getMonthAndWeekContainingDate,
  getWeekDateMap,
  WEEKDAYS,
  sortTimeSlots,
} from '../utils/weekUtils'
import './Marketing.css'
import './TimetablePage.css'

const TimetablePage = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const leadId = searchParams.get('lead_id')
  const captureRef = useRef(null)

  const { data: timeSlots = [] } = useQuery({
    queryKey: ['time-slots'],
    queryFn: () => othersService.getTimeSlots({ status: '启用' }),
  })

  const { data: scheduleList = [], isLoading } = useQuery({
    queryKey: ['marketing-schedules', leadId],
    queryFn: () =>
      courseService.getCourses({
        trial_lead_ids: leadId || '',
        scope: 'leads',
      }),
    enabled: !!leadId,
  })

  const studentCourses = useMemo(() => {
    if (!leadId) return []
    return scheduleList.filter((c) => String(c.marketing_lead_id) === String(leadId))
  }, [scheduleList, leadId])

  const studentName = studentCourses[0]?.student_name || '学员'
  const grade = studentCourses[0]?.grade || ''

  const titleText = useMemo(() => {
    const subjects = [...new Set(studentCourses.map((c) => c.subject).filter(Boolean))]
    const subjectStr = subjects.length > 0 ? subjects.join('、') : ''
    const parts = [studentName, grade, subjectStr].filter(Boolean)
    return parts.length > 0 ? `${parts.join('-')}(试课表)` : '试课表'
  }, [studentName, grade, studentCourses])

  const sortedTimeSlots = useMemo(() => sortTimeSlots(timeSlots), [timeSlots])

  const { dateMap, weekInfo } = useMemo(() => {
    try {
      const dates = studentCourses.map((c) => c.course_date).filter(Boolean)
      if (dates.length === 0) return { dateMap: {}, weekInfo: '' }
      const minDate = new Date(Math.min(...dates.map((d) => new Date(d + 'T00:00:00').getTime())))
      if (isNaN(minDate.getTime())) return { dateMap: {}, weekInfo: '' }
      const { currentMonth, currentWeek } = getMonthAndWeekContainingDate(minDate)
      const map = getWeekDateMap(currentMonth, currentWeek)
      const [y, m] = currentMonth.split('-')
      const info = `${y}年${m}月 第${currentWeek}周`
      return { dateMap: map, weekInfo: info }
    } catch (err) {
      console.error('计算日期映射失败:', err)
      return { dateMap: {}, weekInfo: '' }
    }
  }, [studentCourses])

  const handleCapture = () => {
    const el = captureRef.current
    if (!el) return

    const clone = el.cloneNode(true)
    clone.style.cssText =
      'position:fixed;left:-9999px;top:0;overflow:visible!important;z-index:-9999;visibility:visible;width:max-content;min-width:fit-content;padding:24px;padding-bottom:60px;background:#fff;'
    
    // 确保表格容器完全展开
    const grid = clone.querySelector('.timetable-grid-wrapper')
    if (grid) {
      grid.style.overflow = 'visible'
      grid.style.width = 'max-content'
      grid.style.maxWidth = 'none'
    }
    
    // 确保表格完全展开，包含所有列（周一到周日共8列：时段+7个星期）
    let table = clone.querySelector('.timetable-grid')
    if (table) {
      table.style.width = 'max-content'
      table.style.tableLayout = 'auto'
      table.style.minWidth = 'max-content'
      // 确保所有列都可见，强制显示所有8列
      const thead = table.querySelector('thead')
      if (thead) {
        const ths = thead.querySelectorAll('th')
        // 确保所有8列都显示（时段 + 周一到周日）
        ths.forEach((th) => {
          th.style.display = 'table-cell'
          th.style.visibility = 'visible'
          th.style.width = 'auto'
          th.style.minWidth = '100px'
        })
      }
      const tbody = table.querySelector('tbody')
      if (tbody) {
        const trs = tbody.querySelectorAll('tr')
        trs.forEach((tr) => {
          const tds = tr.querySelectorAll('td')
          // 确保每行都有8列
          tds.forEach((td) => {
            td.style.display = 'table-cell'
            td.style.visibility = 'visible'
            td.style.width = 'auto'
            td.style.minWidth = '100px'
          })
        })
      }
    }
    
    document.body.appendChild(clone)

    // 强制触发重排，确保所有列和行都渲染
    clone.offsetHeight
    
    // 等待布局完成，确保所有时段行和列都渲染（增加等待时间确保所有行渲染）
    setTimeout(() => {
      // 检查表格，确保所有行都渲染
      table = clone.querySelector('.timetable-grid')
      if (!table) {
        document.body.removeChild(clone)
        alert('截图失败：未找到表格元素')
        return
      }
      
      const ths = table.querySelectorAll('thead th')
      const trs = table.querySelectorAll('tbody tr')
      
      // 强制所有行渲染
      trs.forEach((tr) => {
        tr.style.display = 'table-row'
        tr.offsetHeight // 强制重排
      })
      
      // 计算表格实际需要的宽度和高度
      // 宽度：8列（时段+周一到周日）
      const tableWidth = Math.max(table.scrollWidth || 0, table.offsetWidth || 0, 1000)
      
      // 高度：计算所有行的实际高度
      let totalRowHeight = 0
      trs.forEach((tr) => {
        totalRowHeight += tr.offsetHeight || 0
      })
      const headerHeight = table.querySelector('thead')?.offsetHeight || 50
      const tableHeight = headerHeight + totalRowHeight + 100 // 表头 + 所有时段行 + 底部padding（增加以确保完整）
      
      const w = Math.max(clone.scrollWidth || 0, clone.offsetWidth || 0, tableWidth, 1)
      const h = Math.max(clone.scrollHeight || 0, clone.offsetHeight || 0, tableHeight, (clone.offsetHeight || 0) + 80, 1)

        html2canvas(clone, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          width: w,
          height: h,
          windowWidth: Math.max(w, 1200), // 确保视口足够宽
          windowHeight: Math.max(h, 2000), // 确保视口足够高，包含所有时段行
          scrollX: 0,
          scrollY: 0,
          logging: false,
        onclone: (clonedDoc, clonedEl) => {
          // 在克隆文档中确保表格完全展开，包含所有时段行和列
          clonedEl.style.paddingBottom = '80px' // 增加底部padding，确保所有时段行都显示
          const clonedGrid = clonedEl.querySelector('.timetable-grid-wrapper')
          if (clonedGrid) {
            clonedGrid.style.overflow = 'visible'
            clonedGrid.style.width = 'max-content'
            clonedGrid.style.maxWidth = 'none'
            clonedGrid.style.height = 'auto'
          }
          const clonedTable = clonedEl.querySelector('.timetable-grid')
          if (clonedTable) {
            clonedTable.style.width = 'max-content'
            clonedTable.style.minWidth = '1000px'
            clonedTable.style.tableLayout = 'auto'
            clonedTable.style.height = 'auto'
            // 确保所有列都显示（包括时段列）
            const clonedThs = clonedTable.querySelectorAll('thead th')
            clonedThs.forEach((th) => {
              th.style.display = 'table-cell'
              th.style.visibility = 'visible'
              th.style.width = 'auto'
            })
            // 确保所有行都显示（包括所有时段行）
            const clonedTrs = clonedTable.querySelectorAll('tbody tr')
            clonedTrs.forEach((tr) => {
              tr.style.display = 'table-row'
              tr.style.visibility = 'visible'
              const clonedTds = tr.querySelectorAll('td')
              clonedTds.forEach((td) => {
                td.style.display = 'table-cell'
                td.style.visibility = 'visible'
                td.style.width = 'auto'
              })
            })
          }
        },
      })
        .then((canvas) => {
          document.body.removeChild(clone)
          const name = (studentName || '课表').replace(/\s/g, '')
          const link = document.createElement('a')
          link.download = `排课表_${name}.png`
          link.href = canvas.toDataURL('image/png')
          link.click()
        })
        .catch((err) => {
          if (clone.parentNode) document.body.removeChild(clone)
          console.error('截图失败:', err)
          alert('截图失败，请重试')
        })
    }, 200) // 增加延迟时间，确保所有时段行都完全渲染
  }

  if (!leadId) {
    return (
      <div className="marketing-page timetable-page">
        <div className="page-header">
          <h1>试课表</h1>
        </div>
        <p>缺少参数，请从营销模块进入。</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/marketing')}>
          返回营销
        </button>
      </div>
    )
  }

  return (
    <div className="marketing-page timetable-page">
      <div className="page-header">
        <div className="page-header-actions">
          <button type="button" className="btn" onClick={() => navigate('/marketing')}>
            返回营销
          </button>
          <button type="button" className="btn btn-primary" onClick={handleCapture}>
            截取课表
          </button>
        </div>
      </div>

      <div
        ref={captureRef}
        className="marketing-timetable-capture timetable-content"
        style={{ background: '#fff', overflow: 'visible' }}
      >
        {(weekInfo || titleText) && (
          <div className="timetable-info-row">
            {weekInfo && <span className="timetable-week-info">{weekInfo}</span>}
            {titleText && <span className="timetable-title-text">{titleText}</span>}
          </div>
        )}
        {isLoading ? (
          <div className="empty-tip">加载中...</div>
        ) : studentCourses.length === 0 ? (
          <div className="empty-tip">暂无排课</div>
        ) : (
          <div className="timetable-grid-wrapper">
              <table className="data-table timetable-grid">
                <thead>
                  <tr>
                    <th>时段</th>
                    {WEEKDAYS.map((wd) => {
                      const dateStr = dateMap[wd] || ''
                      const dateDisplay = dateStr ? dateStr.slice(5, 10) : ''
                      return (
                        <th key={wd}>
                          <div className="week-name">{wd}</div>
                          {dateDisplay && <div className="week-date">{dateDisplay}</div>}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedTimeSlots.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ padding: '20px', textAlign: 'center', color: '#999' }}>请先设置时段信息</td>
                    </tr>
                  ) : (
                    sortedTimeSlots.map((slot) => {
                      const slotName = slot.name || slot
                      return (
                        <tr key={slotName}>
                          <td>{slotName}</td>
                          {WEEKDAYS.map((wd) => {
                            const matched = studentCourses.filter(
                              (c) => (c.time_slot || '').trim() === String(slotName).trim() && (c.weekday || '').trim() === wd
                            )
                            return (
                              <td key={wd}>
                                {matched.length > 0 ? (
                                  matched.map((c) => (
                                    <div key={c.id} className="course-cell-inner" style={{ background: '#f0f9ff' }}>
                                      {[c.subject || c.course_name, c.teacher_name, c.classroom].filter(Boolean).join(' · ')}
                                    </div>
                                  ))
                                ) : null}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default TimetablePage
