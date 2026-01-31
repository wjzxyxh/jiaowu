import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { financeService } from '../services/financeService'
import './Finance.css'

const Finance = () => {
  const queryClient = useQueryClient()
  const currentMonth = new Date().toISOString().slice(0, 7)
  const currentYear = new Date().getFullYear()

  const [viewMode, setViewMode] = useState('month') // 'month' or 'year'
  const [monthFilter, setMonthFilter] = useState(currentMonth)
  const [yearFilter, setYearFilter] = useState(currentYear)
  const [activeTab, setActiveTab] = useState('overview') // 'overview', 'cost', 'salary', 'profit'

  // 下拉月份选项：与 teacher-hours 一致，当前月前 24 个月到当前月后 12 个月
  const monthOptions = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 24, 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 12, 1)
    const list = []
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      list.push({ value: `${y}-${String(m).padStart(2, '0')}`, label: `${y}年${m}月` })
    }
    return list
  }, [])
  const [showRevenueDetail, setShowRevenueDetail] = useState(false)
  const [expandedStudentDetails, setExpandedStudentDetails] = useState(new Set())

  // 成本输入状态
  const [costInputs, setCostInputs] = useState({
    rent: 0,
    utilities: 0,
    marketing_flyer: 0,
    marketing_labor: 0,
    other_paper: 0,
    other_toner: 0,
  })

  // 获取财务数据
  const { data: finance, isLoading, error } = useQuery({
    queryKey: ['finance', viewMode, viewMode === 'month' ? monthFilter : yearFilter],
    queryFn: () => {
      const params = viewMode === 'month' ? { month: monthFilter } : { year: yearFilter }
      return financeService.getFinance(params)
    },
    staleTime: 10 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
  })

  // 更新财务记录
  const updateMutation = useMutation({
    mutationFn: (data) => financeService.updateFinance(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['finance'])
    },
  })

  // 当财务数据加载时，更新成本输入状态
  useEffect(() => {
    if (finance) {
      setCostInputs({
        rent: finance.rent || 0,
        utilities: finance.utilities || 0,
        marketing_flyer: finance.marketing_flyer || 0,
        marketing_labor: finance.marketing_labor || 0,
        other_paper: finance.other_paper || 0,
        other_toner: finance.other_toner || 0,
      })
    }
  }, [finance])

  // 计算总成本
  const totalCost = useMemo(() => {
    if (!finance) return 0
    const partTimeSalary = finance.part_time_salary || 0
    const fullTimeSalary = finance.full_time_salary || 0
    const teacherCost = partTimeSalary + fullTimeSalary
    const rentUtilities = (costInputs.rent || 0) + (costInputs.utilities || 0)
    const marketingCost = (costInputs.marketing_flyer || 0) + (costInputs.marketing_labor || 0)
    const otherCost = (costInputs.other_paper || 0) + (costInputs.other_toner || 0)
    return teacherCost + rentUtilities + marketingCost + otherCost
  }, [finance, costInputs])

  // 计算净利润
  const monthlyProfit = useMemo(() => {
    if (!finance) return 0
    const monthlyRevenue = finance.monthly_revenue || 0
    return monthlyRevenue - totalCost
  }, [finance, totalCost])

  // 切换查看模式
  const handleViewModeChange = (mode) => {
    setViewMode(mode)
    if (mode === 'month' && !monthFilter) {
      setMonthFilter(currentMonth)
    } else if (mode === 'year' && !yearFilter) {
      setYearFilter(currentYear)
    }
  }

  // 更新成本
  const handleCostChange = (field, value) => {
    if (viewMode === 'year') {
      alert('年份数据是聚合数据，不能直接编辑。请切换到月份视图进行编辑。')
      return
    }
    setCostInputs((prev) => ({ ...prev, [field]: parseFloat(value) || 0 }))
  }

  // 保存成本更改
  const handleSaveCosts = () => {
    if (viewMode === 'year') {
      alert('年份数据不支持修改。请切换到月份视图进行修改。')
      return
    }
    const revenueMode = finance?.revenue_mode || '课耗模式'
    updateMutation.mutate({
      month: monthFilter,
      ...costInputs,
      revenue_mode: revenueMode,
    })
  }

  // 更新收入计算模式
  const handleRevenueModeChange = (mode) => {
    if (viewMode === 'year') {
      alert('年份数据不支持修改收入计算模式。请切换到月份视图进行修改。')
      return
    }
    const wasExpanded = showRevenueDetail
    updateMutation.mutate({
      month: monthFilter,
      ...costInputs,
      revenue_mode: mode,
    })
    // 保持明细展开状态
    if (wasExpanded) {
      setTimeout(() => setShowRevenueDetail(true), 100)
    }
  }

  // 切换学生单价明细
  const toggleStudentPriceDetail = (index) => {
    const newExpanded = new Set(expandedStudentDetails)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedStudentDetails(newExpanded)
  }

  // 渲染收入明细
  const renderRevenueDetail = () => {
    if (!finance?.revenue_detail) return null

    const detail = finance.revenue_detail
    const isYearView = viewMode === 'year'

    if (detail.mode === '缴费模式') {
      return (
        <div style={{ padding: '15px', background: '#f8f9fa', borderTop: '1px solid #dee2e6' }}>
          <div style={{ marginBottom: '15px' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333', fontSize: '14px' }}>缴费明细</h4>
            {detail.paid_list && detail.paid_list.length > 0 ? (
              <div className="table-wrapper">
                <table className="revenue-detail-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>学生</th>
                    <th>金额（元）</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.paid_list.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.date}</td>
                      <td>{item.student_name}</td>
                      <td className="amount">{item.amount.toFixed(2)}</td>
                      <td>{item.remark || ''}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={2}>
                      <strong>缴费小计</strong>
                    </td>
                    <td className="amount">
                      <strong>{detail.total_paid.toFixed(2)}</strong>
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
              </div>
            ) : (
              <p style={{ color: '#999', margin: '10px 0' }}>暂无缴费记录</p>
            )}
          </div>

          <div style={{ marginBottom: '15px' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333', fontSize: '14px' }}>退费明细</h4>
            {detail.refund_list && detail.refund_list.length > 0 ? (
              <div className="table-wrapper">
                <table className="revenue-detail-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>学生</th>
                    <th>金额（元）</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.refund_list.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.date}</td>
                      <td>{item.student_name}</td>
                      <td className="amount">{item.amount.toFixed(2)}</td>
                      <td>{item.remark || ''}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={2}>
                      <strong>退费小计</strong>
                    </td>
                    <td className="amount">
                      <strong>{detail.total_refund.toFixed(2)}</strong>
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
              </div>
            ) : (
              <p style={{ color: '#999', margin: '10px 0' }}>暂无退费记录</p>
            )}
          </div>

          <div>
            <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '10px 0' }}>
              营业收入 = {detail.total_paid.toFixed(2)} - {detail.total_refund.toFixed(2)} ={' '}
              {detail.total_revenue.toFixed(2)} 元
            </p>
          </div>
        </div>
      )
    } else if (detail.mode === '年份汇总') {
      return (
        <div style={{ padding: '15px', background: '#f8f9fa', borderTop: '1px solid #dee2e6' }}>
          <div>
            <h4 style={{ margin: '0 0 10px 0', color: '#333', fontSize: '14px' }}>年份汇总</h4>
            <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '10px 0' }}>
              年度总收入：{detail.total_revenue.toFixed(2)} 元
            </p>
            <p style={{ color: '#999', margin: '10px 0' }}>
              年份数据为全年各月份数据的汇总，详细明细请切换到月份视图查看。
            </p>
          </div>
        </div>
      )
    } else {
      // 课耗模式
      return (
        <div style={{ padding: '15px', background: '#f8f9fa', borderTop: '1px solid #dee2e6' }}>
          <div>
            <h4 style={{ margin: '0 0 10px 0', color: '#333', fontSize: '14px' }}>学生课耗明细</h4>
            {detail.student_list && detail.student_list.length > 0 ? (
              <div className="table-wrapper">
                <table className="revenue-detail-table">
                <thead>
                  <tr>
                    <th>学生</th>
                    <th>当月课耗（课时）</th>
                    <th>实际单价（元/课时）</th>
                    <th>收入（元）</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.student_list.map((item, index) => (
                    <React.Fragment key={index}>
                      <tr>
                        <td>{item.student_name}</td>
                        <td className="amount">{item.actual_hours.toFixed(2)}</td>
                        <td className="amount">{item.unit_price.toFixed(2)}</td>
                        <td className="amount">{item.revenue.toFixed(2)}</td>
                        <td>
                          {item.price_detail && item.price_detail.length > 0 && (
                            <button
                              onClick={() => toggleStudentPriceDetail(index)}
                              style={{
                                padding: '2px 8px',
                                fontSize: '11px',
                                background: expandedStudentDetails.has(index) ? '#dc3545' : '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                              }}
                            >
                              {expandedStudentDetails.has(index) ? '隐藏明细' : '查看明细'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedStudentDetails.has(index) && item.price_detail && item.price_detail.length > 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: '10px', background: '#fff' }}>
                            <div style={{ marginLeft: '20px' }}>
                              <strong>单价明细：</strong>
                              <table
                                style={{
                                  width: '100%',
                                  marginTop: '8px',
                                  borderCollapse: 'collapse',
                                }}
                              >
                                <thead>
                                  <tr style={{ background: '#e9ecef' }}>
                                    <th style={{ padding: '6px', textAlign: 'left', border: '1px solid #dee2e6', fontSize: '12px' }}>
                                      缴费日期
                                    </th>
                                    <th style={{ padding: '6px', textAlign: 'right', border: '1px solid #dee2e6', fontSize: '12px' }}>
                                      消耗课时
                                    </th>
                                    <th style={{ padding: '6px', textAlign: 'right', border: '1px solid #dee2e6', fontSize: '12px' }}>
                                      单价（元/课时）
                                    </th>
                                    <th style={{ padding: '6px', textAlign: 'right', border: '1px solid #dee2e6', fontSize: '12px' }}>
                                      收入（元）
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.price_detail.map((detailItem, detailIdx) => (
                                    <tr key={detailIdx}>
                                      <td style={{ padding: '6px', border: '1px solid #dee2e6', fontSize: '12px' }}>
                                        {detailItem.payment_date}
                                      </td>
                                      <td style={{ padding: '6px', textAlign: 'right', border: '1px solid #dee2e6', fontSize: '12px' }}>
                                        {detailItem.hours.toFixed(2)}
                                      </td>
                                      <td style={{ padding: '6px', textAlign: 'right', border: '1px solid #dee2e6', fontSize: '12px' }}>
                                        {detailItem.unit_price.toFixed(2)}
                                      </td>
                                      <td style={{ padding: '6px', textAlign: 'right', border: '1px solid #dee2e6', fontSize: '12px' }}>
                                        {detailItem.revenue.toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  <tr className="total-row">
                    <td>
                      <strong>合计</strong>
                    </td>
                    <td className="amount"></td>
                    <td className="amount"></td>
                    <td className="amount">
                      <strong>{detail.total_revenue.toFixed(2)}</strong>
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
              </div>
            ) : (
              <p style={{ color: '#999', margin: '10px 0' }}>暂无学生课耗记录</p>
            )}
          </div>
        </div>
      )
    }
  }

  const periodLabel = viewMode === 'year' ? '年' : '月'
  const isYearView = viewMode === 'year'

  if (isLoading) return <div className="loading">加载中...</div>
  if (error) return <div className="error">加载失败: {error.error || error.message}</div>
  if (!finance || Object.keys(finance).length === 0) {
    return <div className="no-data">暂无财务数据</div>
  }

  return (
    <div className="finance-page" style={{ width: '100%' }}>
      <div className="page-header">
        <h1>财务统计</h1>
      </div>

      {/* 工具栏 */}
      <div className="toolbar" style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontWeight: 'normal', margin: 0 }}>查看方式：</label>
          <select
            value={viewMode}
            onChange={(e) => handleViewModeChange(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' }}
          >
            <option value="month">月份</option>
            <option value="year">年份</option>
          </select>
        </div>
        {viewMode === 'month' ? (
          <div className="month-picker-wrap" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => {
                const [y, m] = monthFilter.split('-').map(Number)
                const prev = new Date(y, m - 2, 1)
                setMonthFilter(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`)
              }}
              style={{
                padding: '6px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                background: '#f5f5f5',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              上月
            </button>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                minWidth: '120px',
                fontSize: '14px',
              }}
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setMonthFilter(currentMonth)}
              style={{
                padding: '6px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                background: '#e8f4fd',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              本月
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontWeight: 'normal', margin: 0 }}>选择年份：</label>
            <input
              type="number"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              min="2020"
              max="2099"
              style={{
                width: '120px',
                padding: '6px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>
        )}
      </div>

      {/* 标签页切换 */}
      <div className="tab-container">
        <div className="tab-buttons">
          <button
            className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            总览
          </button>
          <button
            className={`tab-button ${activeTab === 'cost' ? 'active' : ''}`}
            onClick={() => setActiveTab('cost')}
          >
            成本
          </button>
          <button
            className={`tab-button ${activeTab === 'salary' ? 'active' : ''}`}
            onClick={() => setActiveTab('salary')}
          >
            工资
          </button>
          <button
            className={`tab-button ${activeTab === 'profit' ? 'active' : ''}`}
            onClick={() => setActiveTab('profit')}
          >
            利润
          </button>
        </div>

        {/* 总览页面 */}
        {activeTab === 'overview' && (
          <div className="tab-content active">
            {/* 财务概览 */}
            <div className="finance-overview">
              <div className="finance-card income">
                <h4>当{periodLabel}收入</h4>
                <div className="value">{(finance.monthly_revenue || 0).toFixed(2)}</div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>元</div>
              </div>
              <div className="finance-card">
                <h4>总课耗</h4>
                <div className="value">{(finance.total_class_hours || 0).toFixed(2)}</div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>课时</div>
              </div>
              <div className="finance-card cost">
                <h4>总成本</h4>
                <div className="value">{totalCost.toFixed(2)}</div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>元</div>
              </div>
              <div className="finance-card profit">
                <h4>当{periodLabel}利润</h4>
                <div className="value">{monthlyProfit.toFixed(2)}</div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>元</div>
              </div>
            </div>

            {/* 缴费情况 */}
            <div className="finance-section">
              <h3>缴费情况</h3>
              <div className="finance-overview">
                <div className="finance-card">
                  <h4>当{periodLabel}缴费</h4>
                  <div className="value">{finance.payment_detail?.count_paid || 0}</div>
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>笔</div>
                  <div style={{ fontSize: '14px', color: '#28a745', marginTop: '5px' }}>
                    {(finance.payment_detail?.total_paid || 0).toFixed(2)} 元
                  </div>
                </div>
                <div className="finance-card">
                  <h4>当{periodLabel}退费</h4>
                  <div className="value">{finance.payment_detail?.count_refund || 0}</div>
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>笔</div>
                  <div style={{ fontSize: '14px', color: '#dc3545', marginTop: '5px' }}>
                    {(finance.payment_detail?.total_refund || 0).toFixed(2)} 元
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 成本页面 */}
        {activeTab === 'cost' && (
          <div className="tab-content active">
            <div className="finance-section">
              <h3>成本表</h3>
              <div className="table-wrapper">
                <table className="cost-table">
                <thead>
                  <tr>
                    <th>成本项目</th>
                    <th>金额（元）</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>&nbsp;&nbsp;兼职老师工资</td>
                    <td className="amount">{(finance.part_time_salary || 0).toFixed(2)}</td>
                    <td>自动计算</td>
                  </tr>
                  <tr>
                    <td>&nbsp;&nbsp;全职老师工资</td>
                    <td className="amount">{(finance.full_time_salary || 0).toFixed(2)}</td>
                    <td>自动计算</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>老师工资</strong>
                    </td>
                    <td className="amount">
                      {((finance.part_time_salary || 0) + (finance.full_time_salary || 0)).toFixed(2)}
                    </td>
                    <td>兼职老师工资 + 全职老师工资</td>
                  </tr>
                  <tr>
                    <td>&nbsp;&nbsp;房租</td>
                    <td className="amount">
                      <input
                        type="number"
                        value={costInputs.rent}
                        step="0.01"
                        disabled={isYearView}
                        onChange={(e) => handleCostChange('rent', e.target.value)}
                        onBlur={handleSaveCosts}
                        style={{ width: '150px', textAlign: 'left', padding: '4px', border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                    </td>
                    <td>手动输入</td>
                  </tr>
                  <tr>
                    <td>&nbsp;&nbsp;水电</td>
                    <td className="amount">
                      <input
                        type="number"
                        value={costInputs.utilities}
                        step="0.01"
                        disabled={isYearView}
                        onChange={(e) => handleCostChange('utilities', e.target.value)}
                        onBlur={handleSaveCosts}
                        style={{ width: '150px', textAlign: 'left', padding: '4px', border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                    </td>
                    <td>手动输入</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>房租水电小计</strong>
                    </td>
                    <td className="amount">{(costInputs.rent + costInputs.utilities).toFixed(2)}</td>
                    <td>房租 + 水电</td>
                  </tr>
                  <tr>
                    <td>&nbsp;&nbsp;营销</td>
                    <td className="amount">
                      <input
                        type="number"
                        value={costInputs.marketing_flyer}
                        step="0.01"
                        disabled={isYearView}
                        onChange={(e) => handleCostChange('marketing_flyer', e.target.value)}
                        onBlur={handleSaveCosts}
                        style={{ width: '150px', textAlign: 'left', padding: '4px', border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                    </td>
                    <td>手动输入</td>
                  </tr>
                  <tr>
                    <td>&nbsp;&nbsp;教务</td>
                    <td className="amount">
                      <input
                        type="number"
                        value={costInputs.marketing_labor}
                        step="0.01"
                        disabled={isYearView}
                        onChange={(e) => handleCostChange('marketing_labor', e.target.value)}
                        onBlur={handleSaveCosts}
                        style={{ width: '150px', textAlign: 'left', padding: '4px', border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                    </td>
                    <td>手动输入</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>营销成本小计</strong>
                    </td>
                    <td className="amount">{(costInputs.marketing_flyer + costInputs.marketing_labor).toFixed(2)}</td>
                    <td>营销 + 教务</td>
                  </tr>
                  <tr>
                    <td>&nbsp;&nbsp;打印纸</td>
                    <td className="amount">
                      <input
                        type="number"
                        value={costInputs.other_paper}
                        step="0.01"
                        disabled={isYearView}
                        onChange={(e) => handleCostChange('other_paper', e.target.value)}
                        onBlur={handleSaveCosts}
                        style={{ width: '150px', textAlign: 'left', padding: '4px', border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                    </td>
                    <td>手动输入</td>
                  </tr>
                  <tr>
                    <td>&nbsp;&nbsp;打印粉</td>
                    <td className="amount">
                      <input
                        type="number"
                        value={costInputs.other_toner}
                        step="0.01"
                        disabled={isYearView}
                        onChange={(e) => handleCostChange('other_toner', e.target.value)}
                        onBlur={handleSaveCosts}
                        style={{ width: '150px', textAlign: 'left', padding: '4px', border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                    </td>
                    <td>手动输入</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>其它成本小计</strong>
                    </td>
                    <td className="amount">{(costInputs.other_paper + costInputs.other_toner).toFixed(2)}</td>
                    <td>打印纸 + 打印粉</td>
                  </tr>
                  <tr className="total-row">
                    <td>
                      <strong>成本合计</strong>
                    </td>
                    <td className="amount">{totalCost.toFixed(2)}</td>
                    <td>所有成本项目之和</td>
                  </tr>
                </tbody>
              </table>
            </div>
            </div>
          </div>
        )}

        {/* 工资页面 */}
        {activeTab === 'salary' && (
          <div className="tab-content active">
            <div className="finance-section">
              <h3>老师工资明细</h3>
              <div className="teacher-cost-detail">
                <table className="cost-table">
                  <thead>
                    <tr>
                      <th>老师姓名</th>
                      <th>底薪</th>
                      <th>课时成本</th>
                      <th>经验</th>
                      <th>激励</th>
                      <th>小计</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finance.teacher_cost_detail && finance.teacher_cost_detail.length > 0 ? (
                      finance.teacher_cost_detail.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.teacher_name}</td>
                          <td className="amount">{item.base_salary.toFixed(2)}</td>
                          <td className="amount">{item.course_cost.toFixed(2)}</td>
                          <td className="amount">{(item.experience_cost || 0).toFixed(2)}</td>
                          <td className="amount">{item.incentive.toFixed(2)}</td>
                          <td className="amount">
                            <strong>{item.total.toFixed(2)}</strong>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                          暂无数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="total-row">
                      <td>
                        <strong>总计</strong>
                      </td>
                      <td className="amount">
                        {finance.teacher_cost_detail
                          ? finance.teacher_cost_detail.reduce((sum, item) => sum + (item.base_salary || 0), 0).toFixed(2)
                          : '0.00'}
                      </td>
                      <td className="amount">
                        {finance.teacher_cost_detail
                          ? finance.teacher_cost_detail.reduce((sum, item) => sum + (item.course_cost || 0), 0).toFixed(2)
                          : '0.00'}
                      </td>
                      <td className="amount">
                        {finance.teacher_cost_detail
                          ? finance.teacher_cost_detail.reduce((sum, item) => sum + (item.experience_cost || 0), 0).toFixed(2)
                          : '0.00'}
                      </td>
                      <td className="amount">
                        {finance.teacher_cost_detail
                          ? finance.teacher_cost_detail.reduce((sum, item) => sum + (item.incentive || 0), 0).toFixed(2)
                          : '0.00'}
                      </td>
                      <td className="amount">
                        {finance.teacher_cost_detail
                          ? finance.teacher_cost_detail.reduce((sum, item) => sum + (item.total || 0), 0).toFixed(2)
                          : '0.00'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 利润页面 */}
        {activeTab === 'profit' && (
          <div className="tab-content active">
            <div className="finance-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0 }}>利润表</h3>
                {!isYearView && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{ fontWeight: 'normal', margin: 0 }}>计算模式：</label>
                    <select
                      value={finance.revenue_mode || '课耗模式'}
                      onChange={(e) => handleRevenueModeChange(e.target.value)}
                      style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' }}
                    >
                      <option value="课耗模式">课耗模式</option>
                      <option value="缴费模式">缴费模式</option>
                    </select>
                  </div>
                )}
              </div>
              <table className="profit-table">
                <thead>
                  <tr>
                    <th>项目</th>
                    <th>金额（元）</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>营业收入</strong>
                      {finance.revenue_detail && (
                        <button
                          onClick={() => setShowRevenueDetail(!showRevenueDetail)}
                          style={{
                            marginLeft: '10px',
                            padding: '2px 8px',
                            fontSize: '12px',
                            background: showRevenueDetail ? '#dc3545' : '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                          }}
                        >
                          {showRevenueDetail ? '隐藏明细' : '查看明细'}
                        </button>
                      )}
                    </td>
                    <td className="amount">{(finance.monthly_revenue || 0).toFixed(2)}</td>
                    <td>
                      {isYearView
                        ? '年份汇总数据'
                        : finance.revenue_mode === '缴费模式'
                        ? '当月缴费 - 当月退费'
                        : '当月课耗 × 学生单价'}
                    </td>
                  </tr>
                  {showRevenueDetail && finance.revenue_detail && (
                    <tr>
                      <td colSpan={3} style={{ padding: 0 }}>
                        {renderRevenueDetail()}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td>
                      <strong>营业成本</strong>
                    </td>
                    <td className="amount">{totalCost.toFixed(2)}</td>
                    <td>老师工资 + 房租水电 + 营销成本 + 其它成本</td>
                  </tr>
                  <tr className="total-row">
                    <td>
                      <strong>净利润</strong>
                    </td>
                    <td className="amount">{monthlyProfit.toFixed(2)}</td>
                    <td>营业收入 - 营业成本</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Finance
