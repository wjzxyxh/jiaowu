import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teacherHoursService } from '../services/teacherHoursService'
import { teacherService } from '../services/teacherService'
import './TeacherHours.css'

const TeacherHours = () => {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [currentTab, setCurrentTab] = useState('parttime') // 'fulltime' or 'parttime'
  const [monthFilter, setMonthFilter] = useState(currentMonth)
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [selectedRows, setSelectedRows] = useState(new Set())
  const [expandedDetails, setExpandedDetails] = useState(new Set())

  const employmentType = currentTab === 'fulltime' ? '全职' : '兼职'

  const queryClient = useQueryClient()

  // 获取教师列表
  const { data: teachersData = [] } = useQuery({
    queryKey: ['teachers', currentTab],
    queryFn: () => teacherService.getTeachers({ status: '启用' }),
    staleTime: 10 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
  })

  // 过滤教师列表（根据当前标签页）
  const filteredTeachers = useMemo(() => {
    return Array.isArray(teachersData)
      ? teachersData.filter((t) => {
          const empType = t.employment_type || '兼职'
          const status = t.status || '启用'
          return empType === employmentType && status === '启用'
        })
      : []
  }, [teachersData, employmentType])

  // 获取教师课时数据
  const { data: hoursData = [], isLoading, error } = useQuery({
    queryKey: ['teacher-hours', monthFilter, employmentType],
    queryFn: () => teacherHoursService.getTeacherHours({ month: monthFilter, employment_type: employmentType }),
    staleTime: 10 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
  })

  // 过滤数据（根据选中的教师）
  const filteredHours = useMemo(() => {
    if (!Array.isArray(hoursData)) return []
    if (!selectedTeacherId) return hoursData
    return hoursData.filter((h) => h.teacher_id == selectedTeacherId)
  }, [hoursData, selectedTeacherId])

  // 分组数据（按教师和月份）
  const groupedData = useMemo(() => {
    const grouped = {}
    filteredHours.forEach((h) => {
      const key = `${h.teacher_id}-${h.month}`
      if (!grouped[key]) {
        grouped[key] = {
          teacher_id: h.teacher_id,
          teacher_name: h.teacher_name,
          month: h.month,
          courses: [],
          total_hours_all: 0,
          total_course_salary: 0,
          total_experience_cost: 0,
          total_salary: 0,
          base_salary: h.base_salary || 0,
          incentive: h.incentive || 0,
          remark: h.remark || '',
          updated_at: h.updated_at,
          employment_type: h.employment_type || employmentType,
          calculation_details: [],
          is_settled: h.is_settled || false,
          settled_at: h.settled_at || null,
          hours_ids: [],
          id: h.id, // 使用第一个记录的ID作为主ID
        }
      }
      // 收集hours_id
      if (h.id && !grouped[key].hours_ids.includes(h.id)) {
        grouped[key].hours_ids.push(h.id)
      }
      // 如果任何一个记录已结算，则整个分组标记为已结算
      if (h.is_settled) {
        grouped[key].is_settled = true
        if (h.settled_at && (!grouped[key].settled_at || h.settled_at > grouped[key].settled_at)) {
          grouped[key].settled_at = h.settled_at
        }
      }
      // 添加课程信息
      grouped[key].courses.push({
        course_id: h.course_id,
        course_name: h.course_name,
        total_hours: h.total_hours || 0,
        course_salary: h.course_salary || 0,
        experience_cost: h.experience_cost || 0,
        course_details: h.course_details || [],
        calculation_details: h.calculation_details || [],
      })
      grouped[key].total_hours_all += h.total_hours || 0
      // 注意：每个课程记录的course_salary已经包含了该教师该月份所有课程的工资
      if (grouped[key].total_course_salary === 0) {
        grouped[key].total_course_salary = h.course_salary || 0
      }
      if (grouped[key].total_experience_cost === 0) {
        grouped[key].total_experience_cost = h.experience_cost || 0
      }
      // 合并计算明细（去重）
      if (h.calculation_details && h.calculation_details.length > 0) {
        const existingKeys = new Set(
          grouped[key].calculation_details.map((d) => `${d.student_name}-${d.course_name}`)
        )
        h.calculation_details.forEach((detail) => {
          const detailKey = `${detail.student_name}-${detail.course_name}`
          if (!existingKeys.has(detailKey)) {
            grouped[key].calculation_details.push(detail)
            existingKeys.add(detailKey)
          }
        })
      }
    })

    // 计算总工资
    Object.keys(grouped).forEach((key) => {
      const group = grouped[key]
      group.total_salary =
        group.total_course_salary + group.total_experience_cost + group.base_salary + group.incentive
    })

    return Object.values(grouped)
  }, [filteredHours, employmentType])

  // 更新教师课时记录
  const updateMutation = useMutation({
    mutationFn: ({ hoursId, data }) => teacherHoursService.updateTeacherHours(hoursId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['teacher-hours'])
    },
  })

  // 结算教师课时
  const settleMutation = useMutation({
    mutationFn: ({ hoursIds, isSettled }) => teacherHoursService.settleTeacherHours(hoursIds, isSettled),
    onSuccess: () => {
      queryClient.invalidateQueries(['teacher-hours'])
      setSelectedRows(new Set())
    },
  })

  // 切换标签页
  const switchTab = (tab) => {
    setCurrentTab(tab)
    setSelectedTeacherId('')
    setSelectedRows(new Set())
  }

  // 切换全选
  const toggleSelectAll = (checked) => {
    if (checked) {
      const allRowKeys = new Set(groupedData.map((h) => `${h.teacher_id}-${h.month}`))
      setSelectedRows(allRowKeys)
    } else {
      setSelectedRows(new Set())
    }
  }

  // 切换单行选择
  const toggleRowSelection = (rowKey) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(rowKey)) {
      newSelected.delete(rowKey)
    } else {
      newSelected.add(rowKey)
    }
    setSelectedRows(newSelected)
  }

  // 更新激励或备注
  const handleUpdateRecord = (rowKey, field, value) => {
    const group = groupedData.find((g) => `${g.teacher_id}-${g.month}` === rowKey)
    if (!group || !group.hours_ids || group.hours_ids.length === 0) return

    // 使用第一个 hours_id 来更新（因为同一教师同一月份的所有记录共享激励和备注）
    const hoursId = group.hours_ids[0]

    const data = {}
    if (field === 'incentive') {
      data.incentive = parseFloat(value) || 0
    } else if (field === 'remark') {
      data.remark = value
    }

    updateMutation.mutate({ hoursId, data })
  }

  // 结算单个记录
  const handleSettleRecord = (hoursIds, isSettled) => {
    const action = isSettled ? '确认结算' : '取消结算'
    if (!window.confirm(`确定要${action}这些课时记录吗？`)) {
      return
    }
    settleMutation.mutate({ hoursIds, isSettled })
  }

  // 批量结算
  const handleBatchSettle = (isSettled) => {
    if (selectedRows.size === 0) {
      alert('请先选择要操作的记录')
      return
    }

    const allHoursIds = []
    selectedRows.forEach((rowKey) => {
      const group = groupedData.find((g) => `${g.teacher_id}-${g.month}` === rowKey)
      if (group) {
        allHoursIds.push(...group.hours_ids)
      }
    })

    if (allHoursIds.length === 0) {
      alert('没有找到要操作的记录')
      return
    }

    const action = isSettled ? '确认结算' : '取消结算'
    if (!window.confirm(`确定要${action}选中的 ${selectedRows.size} 条记录吗？`)) {
      return
    }

    settleMutation.mutate({ hoursIds: allHoursIds, isSettled })
  }

  // 导出Excel
  const handleExport = () => {
    teacherHoursService.exportTeacherHours(monthFilter, selectedTeacherId || null)
  }

  // 切换计算详情
  const toggleCalculationDetails = (rowKey) => {
    const newExpanded = new Set(expandedDetails)
    if (newExpanded.has(rowKey)) {
      newExpanded.delete(rowKey)
    } else {
      newExpanded.add(rowKey)
    }
    setExpandedDetails(newExpanded)
  }

  // 渲染课程详情HTML
  const renderCourseDetails = (group) => {
    if (!group.courses || group.courses.length === 0) {
      return <span style={{ color: '#999', fontStyle: 'italic' }}>暂无上课记录</span>
    }

    // 收集第一个课程的所有详情
    const allCourseDetails = group.courses[0]?.course_details || []

    return group.courses
      .map((course) => {
        // 只显示属于当前课程的学生-课程详情
        const filteredDetails = allCourseDetails.filter((detail) => {
          const parts = detail.split(': ')
          const studentCoursePart = parts[0] || ''
          const studentCourseMatch = studentCoursePart.match(/^(.+?)-(.+)$/)
          const detailCourseName = studentCourseMatch ? studentCourseMatch[2] : ''
          return detailCourseName === course.course_name
        })

        if (filteredDetails.length === 0) {
          return null
        }

        const courseDetailHtml = filteredDetails.map((detail) => {
          const parts = detail.split(': ')
          const studentCoursePart = parts[0] || ''
          const timesPart = parts[1] || ''

          const studentCourseMatch = studentCoursePart.match(/^(.+?)-(.+)$/)
          const studentName = studentCourseMatch ? studentCourseMatch[1] : ''
          const courseName = studentCourseMatch ? studentCourseMatch[2] : ''

          // 分离各个时间，并格式化日期（只显示日）
          const times = timesPart
            .split('; ')
            .filter((t) => t.trim())
            .map((time) => {
              return time.replace(/(\d{4})-(\d{2})-(\d{2})/g, '$3')
            })

          // 将时间按每2个分组
          const timesPerRow = 2
          const timeRows = []
          for (let i = 0; i < times.length; i += timesPerRow) {
            timeRows.push(times.slice(i, i + timesPerRow))
          }

          return (
            <div
              key={detail}
              style={{
                margin: '2px 0',
                padding: '4px 5px',
                background: '#f5f5f5',
                borderRadius: '2px',
                fontSize: '10px',
              }}
            >
              <div style={{ marginBottom: '2px', lineHeight: 1.3 }}>
                <span style={{ color: '#667eea', fontWeight: 500, fontSize: '10px' }}>{studentName}</span>
                <span style={{ color: '#764ba2', fontWeight: 500, marginLeft: '2px', fontSize: '10px' }}>
                  -{courseName}
                </span>
                <span style={{ color: '#666' }}>:</span>
              </div>
              <div style={{ marginLeft: '6px', color: '#333' }}>
                {timeRows.map((row, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: '1px',
                      display: 'flex',
                      flexWrap: 'nowrap',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {row.map((time, timeIdx) => (
                      <span
                        key={timeIdx}
                        style={{
                          display: 'inline-block',
                          flex: '0 1 auto',
                          padding: '1px 3px',
                          background: 'white',
                          borderRadius: '2px',
                          whiteSpace: 'nowrap',
                          fontSize: '9px',
                        }}
                      >
                        {time}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )
        })

        return (
          <div
            key={course.course_id}
            style={{
              marginBottom: '8px',
              padding: '6px',
              background: '#e3f2fd',
              borderLeft: '3px solid #2196f3',
              borderRadius: '3px',
            }}
          >
            <div style={{ fontWeight: 'bold', color: '#1976d2', marginBottom: '4px', fontSize: '11px' }}>
              {course.course_name} <span style={{ color: '#666', fontWeight: 'normal' }}>({course.total_hours}课时)</span>
            </div>
            <div style={{ marginLeft: '8px' }}>{courseDetailHtml}</div>
          </div>
        )
      })
      .filter(Boolean)
  }

  // 渲染计算详情
  const renderCalculationDetails = (group) => {
    const calculationDetails = group.calculation_details || []
    if (calculationDetails.length === 0) {
      return <div style={{ marginTop: '10px', padding: '10px', color: '#999', fontStyle: 'italic' }}>暂无计算明细</div>
    }

    const totalExperienceCost = calculationDetails.reduce((sum, detail) => {
      return sum + (detail.experience_subtotal || 0)
    }, 0)

    const calculatedCourseSalary = calculationDetails.reduce((sum, detail) => {
      return sum + (detail.subtotal || 0)
    }, 0)

    const baseSalary = group.base_salary || 0
    const experienceCost = group.total_experience_cost || 0
    const incentive = group.incentive || 0
    const totalSalary = group.total_salary || 0

    return (
      <div style={{ marginTop: '10px', padding: '10px', background: '#f8f9fa', borderRadius: '4px', fontSize: '12px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#495057' }}>计算明细：</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#e9ecef' }}>
              <th style={{ padding: '6px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>学生-课程</th>
              <th style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>课时</th>
              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>单价</th>
              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>小计</th>
              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>经验</th>
            </tr>
          </thead>
          <tbody>
            {calculationDetails.map((detail, idx) => (
              <tr key={idx}>
                <td style={{ padding: '6px', borderBottom: '1px solid #dee2e6' }}>
                  {detail.student_name}-{detail.course_name}
                </td>
                <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                  {detail.hours}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>
                  {detail.cost_per_class.toFixed(2)}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>
                  {detail.subtotal.toFixed(2)}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>
                  {(detail.experience_subtotal || 0).toFixed(2)}
                </td>
              </tr>
            ))}
            <tr style={{ background: '#e9ecef', fontWeight: 'bold' }}>
              <td style={{ padding: '6px' }} colSpan={3}>
                课时工资小计：
              </td>
              <td style={{ padding: '6px', textAlign: 'right' }}>{calculatedCourseSalary.toFixed(2)}</td>
              <td style={{ padding: '6px', textAlign: 'right' }}></td>
            </tr>
            {experienceCost > 0 && (
              <tr style={{ background: '#e1f5fe', fontWeight: 'bold' }}>
                <td style={{ padding: '6px' }} colSpan={3}>
                  经验：
                </td>
                <td style={{ padding: '6px', textAlign: 'right' }}></td>
                <td style={{ padding: '6px', textAlign: 'right' }}>{experienceCost.toFixed(2)}</td>
              </tr>
            )}
            {currentTab === 'fulltime' && (
              <tr style={{ background: '#fff3cd', fontWeight: 'bold' }}>
                <td style={{ padding: '6px' }} colSpan={3}>
                  底薪：
                </td>
                <td style={{ padding: '6px', textAlign: 'right' }}>{baseSalary.toFixed(2)}</td>
                <td style={{ padding: '6px', textAlign: 'right' }}></td>
              </tr>
            )}
            <tr style={{ background: '#ffeaa7', fontWeight: 'bold' }}>
              <td style={{ padding: '6px' }} colSpan={3}>
                激励：
              </td>
              <td style={{ padding: '6px', textAlign: 'right' }}>{incentive.toFixed(2)}</td>
              <td style={{ padding: '6px', textAlign: 'right' }}></td>
            </tr>
            <tr style={{ background: '#d4edda', fontWeight: 'bold' }}>
              <td style={{ padding: '6px' }} colSpan={3}>
                总工资：
              </td>
              <td style={{ padding: '6px', textAlign: 'right', color: '#28a745' }} colSpan={2}>
                {totalSalary.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  // 计算总工资（用于实时更新显示）
  const calculateTotalSalary = (group, incentive) => {
    return (
      group.total_course_salary +
      group.total_experience_cost +
      group.base_salary +
      (incentive || group.incentive || 0)
    )
  }

  const isAllSelected = groupedData.length > 0 && selectedRows.size === groupedData.length
  const hasSelected = selectedRows.size > 0

  if (isLoading) return <div className="loading">加载中...</div>
  if (error) return <div className="error">加载失败: {error.error || error.message}</div>

  return (
    <div className="teacher-hours-page" style={{ width: '100%' }}>
      <div className="page-header">
        <h1>老师课时</h1>
      </div>

      {/* 标签页 */}
      <div className="tabs">
        <button className={`tab ${currentTab === 'fulltime' ? 'active' : ''}`} onClick={() => switchTab('fulltime')}>
          全职
        </button>
        <button className={`tab ${currentTab === 'parttime' ? 'active' : ''}`} onClick={() => switchTab('parttime')}>
          兼职
        </button>
      </div>

      {/* 工具栏 */}
      <div className="toolbar" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <input
          type="month"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px' }}
        />
        <select
          value={selectedTeacherId}
          onChange={(e) => setSelectedTeacherId(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px' }}
        >
          <option value="">全部老师</option>
          {filteredTeachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={handleExport} style={{ marginLeft: '10px' }}>
          导出Excel
        </button>
        <button
          className="btn btn-success"
          id="batch-settle-btn"
          onClick={() => handleBatchSettle(true)}
          disabled={!hasSelected}
          style={{
            marginLeft: '10px',
            padding: '6px 12px',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: hasSelected ? 'pointer' : 'not-allowed',
            opacity: hasSelected ? 1 : 0.6,
          }}
        >
          批量确认结算
        </button>
        <button
          className="btn btn-secondary"
          id="batch-cancel-settle-btn"
          onClick={() => handleBatchSettle(false)}
          disabled={!hasSelected}
          style={{
            marginLeft: '10px',
            padding: '6px 12px',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: hasSelected ? 'pointer' : 'not-allowed',
            opacity: hasSelected ? 1 : 0.6,
          }}
        >
          批量取消结算
        </button>
      </div>

      {/* 表格 */}
      <div className="table-wrapper">
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={(e) => toggleSelectAll(e.target.checked)}
              />
            </th>
            <th>姓名</th>
            <th>月份</th>
            <th style={{ width: '250px', maxWidth: '280px' }}>上课时间</th>
            <th>课时</th>
            {currentTab === 'fulltime' && <th>底薪</th>}
            <th>课时费</th>
            <th>经验</th>
            <th>激励</th>
            <th>总工资</th>
            <th>备注</th>
            <th>结算状态</th>
          </tr>
        </thead>
        <tbody>
          {groupedData.length > 0 ? (
            groupedData.map((group, index) => {
              const rowKey = `${group.teacher_id}-${group.month}`
              const isSelected = selectedRows.has(rowKey)
              const isExpanded = expandedDetails.has(rowKey)
              const baseSalary = group.base_salary || 0
              const courseSalary = group.total_course_salary || 0
              const experienceCost = group.total_experience_cost || 0
              const incentive = group.incentive || 0
              const totalSalary = group.total_salary || 0
              const remark = group.remark || ''
              const is_settled = group.is_settled || false
              const settled_at = group.settled_at || null
              const calculationDetails = group.calculation_details || []

              return (
                <React.Fragment key={rowKey}>
                  <tr>
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRowSelection(rowKey)}
                      />
                    </td>
                    <td>{group.teacher_name}</td>
                    <td>{group.month}</td>
                    <td style={{ minWidth: '250px', maxWidth: '280px', wordWrap: 'break-word', padding: '5px', fontSize: '10px' }}>
                      {renderCourseDetails(group)}
                    </td>
                    <td>
                      <div style={{ fontWeight: 'bold', color: '#1976d2', marginBottom: '4px' }}>
                        总计: {group.total_hours_all}
                      </div>
                      {group.courses.map((c) => (
                        <div key={c.course_id} style={{ fontSize: '11px', color: '#666', margin: '2px 0' }}>
                          {c.course_name}: {c.total_hours}
                        </div>
                      ))}
                    </td>
                    {currentTab === 'fulltime' && <td>{baseSalary.toFixed(2)}</td>}
                    <td>{courseSalary.toFixed(2)}</td>
                    <td>{experienceCost.toFixed(2)}</td>
                    <td>
                      <input
                        type="number"
                        value={incentive.toFixed(2)}
                        step="0.01"
                        min="0"
                        onChange={(e) => {
                          const newIncentive = parseFloat(e.target.value) || 0
                          // 实时更新总工资显示
                          const newTotal = calculateTotalSalary(group, newIncentive)
                          const totalSalaryElement = document.getElementById(`${rowKey}-total-salary`)
                          if (totalSalaryElement) {
                            totalSalaryElement.textContent = newTotal.toFixed(2)
                          }
                        }}
                        onBlur={(e) => {
                          const newIncentive = parseFloat(e.target.value) || 0
                          handleUpdateRecord(rowKey, 'incentive', newIncentive)
                        }}
                        style={{
                          width: '80px',
                          padding: '4px',
                          border: '1px solid #ddd',
                          borderRadius: '3px',
                        }}
                      />
                    </td>
                    <td style={{ fontWeight: 'bold', color: '#28a745' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span id={`${rowKey}-total-salary`}>{totalSalary.toFixed(2)}</span>
                        {calculationDetails.length > 0 && (
                          <button
                            onClick={() => toggleCalculationDetails(rowKey)}
                            style={{
                              padding: '2px 8px',
                              fontSize: '11px',
                              background: isExpanded ? '#dc3545' : '#667eea',
                              color: 'white',
                              border: 'none',
                              borderRadius: '3px',
                              cursor: 'pointer',
                            }}
                          >
                            {isExpanded ? '隐藏计算' : '查看计算'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <textarea
                        value={remark}
                        onChange={(e) => {
                          // 可以实时更新，但只在blur时保存
                        }}
                        onBlur={(e) => {
                          handleUpdateRecord(rowKey, 'remark', e.target.value)
                        }}
                        style={{
                          width: '150px',
                          minHeight: '40px',
                          padding: '4px',
                          border: '1px solid #ddd',
                          borderRadius: '3px',
                          fontSize: '12px',
                          resize: 'vertical',
                        }}
                        placeholder="请输入备注"
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {is_settled ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span style={{ color: '#28a745', fontWeight: 'bold' }}>已结算</span>
                          {settled_at && <span style={{ fontSize: '11px', color: '#666' }}>{settled_at}</span>}
                          <button
                            onClick={() => handleSettleRecord(group.hours_ids, false)}
                            style={{
                              padding: '2px 8px',
                              fontSize: '11px',
                              background: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '3px',
                              cursor: 'pointer',
                              marginTop: '4px',
                            }}
                          >
                            取消结算
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleSettleRecord(group.hours_ids, true)}
                          style={{
                            padding: '4px 12px',
                            fontSize: '12px',
                            background: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                          }}
                        >
                          确认结算
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && calculationDetails.length > 0 && (
                    <tr>
                      <td colSpan={currentTab === 'fulltime' ? 12 : 11} style={{ padding: '15px', background: '#f8f9fa' }}>
                        {renderCalculationDetails(group)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })
          ) : (
            <tr>
              <td colSpan={currentTab === 'fulltime' ? 12 : 11} style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                暂无课时数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}

export default TeacherHours
