"""
Export路由模块
从app_old.py提取
"""
from flask import Blueprint, request, jsonify, render_template, send_from_directory, Response
from flask_login import login_required, current_user
from extensions import db, limiter
from models import (
    Student, Teacher, Course, StudentCourse, ClassHoursStats, Payment, 
    TeacherHours, FinanceRecord, TimeSlot, Classroom, FinanceConfig,
    TeacherCourseCost, TeacherCourseCostHistory, TeacherExperienceCost,
    TeacherExperienceCostHistory, TeacherResume, User, LoginLog, 
    OperationLog, Notification
)
from utils import (
    allowed_file, get_original_filename, get_safe_storage_filename,
    get_client_ip, log_operation, require_permission, get_current_month,
    get_weekday, check_course_conflicts
)
from services import (
    create_notification, check_and_create_notifications,
    update_class_hours_stats, update_teacher_hours,
    get_finance_config, calculate_remaining_hours_from_payments,
    calculate_actual_unit_price, update_finance_record
)
from config import Config
import os
from datetime import datetime, date, timedelta
from sqlalchemy import func, extract
from sqlalchemy.orm import joinedload
import calendar
import io
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
import json
from urllib.parse import quote
from werkzeug.utils import secure_filename

bp = Blueprint('export', __name__)

def create_excel_response(wb, filename):
    """创建 Excel 文件响应
    
    Args:
        wb: openpyxl Workbook 对象
        filename: 文件名（不含路径）
    
    Returns:
        Flask Response 对象
    """
    # 将 Workbook 保存到内存
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    # 创建响应
    response = Response(
        output.read(),
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={
            'Content-Disposition': f'attachment; filename="{quote(filename)}"'
        }
    )
    
    return response

@bp.route('/api/export/students', methods=['GET'])
def export_students():

    """导出学生列表到Excel（排除营销模块试课占位学生）"""

    TRIAL_PLACEHOLDER_NAME = '【试课学员】'
    students = Student.query.filter(Student.name != TRIAL_PLACEHOLDER_NAME).order_by(Student.created_at.desc()).all()

    

    wb = Workbook()

    ws = wb.active

    ws.title = "学生列表"

    

    # 设置表头

    headers = ['ID', '姓名', '年级', '入学日期', '状态', '联系电话', '家长姓名', '家长电话', '地址', '邮箱', '创建时间']

    ws.append(headers)

    

    # 设置表头样式

    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")

    header_font = Font(bold=True, color="FFFFFF")

    border = Border(

        left=Side(style='thin'),

        right=Side(style='thin'),

        top=Side(style='thin'),

        bottom=Side(style='thin')

    )

    

    for cell in ws[1]:

        cell.fill = header_fill

        cell.font = header_font

        cell.alignment = Alignment(horizontal='center', vertical='center')

        cell.border = border

    

    # 添加数据

    for student in students:

        ws.append([

            student.id,

            student.name,

            student.grade or '',

            student.enrollment_date.strftime('%Y-%m-%d') if student.enrollment_date else '',

            student.status or '',

            student.phone or '',

            student.parent_name or '',

            student.parent_phone or '',

            student.address or '',

            student.email or '',

            student.created_at.strftime('%Y-%m-%d %H:%M:%S') if student.created_at else ''

        ])

    

    # 设置列宽

    column_widths = [8, 15, 10, 12, 10, 15, 15, 15, 30, 25, 20]

    for i, width in enumerate(column_widths, 1):

        ws.column_dimensions[get_column_letter(i)].width = width

    

    # 添加边框

    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):

        for cell in row:

            cell.border = border

            cell.alignment = Alignment(horizontal='left', vertical='center')

    

    filename = f"学生列表_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return create_excel_response(wb, filename)




@bp.route('/api/export/payments', methods=['GET'])
def export_payments():

    """导出缴费记录到Excel"""

    year = request.args.get('year', '')

    month = request.args.get('month', '')

    

    query = Payment.query

    if year:

        query = query.filter(Payment.payment_date >= date(int(year), 1, 1))

        query = query.filter(Payment.payment_date < date(int(year) + 1, 1, 1))

    if month:

        query = query.filter(extract('month', Payment.payment_date) == int(month))

    

    payments = query.order_by(Payment.payment_date.desc(), Payment.created_at.desc()).all()

    

    wb = Workbook()

    ws = wb.active

    ws.title = "缴费记录"

    

    headers = ['ID', '缴费日期', '学生姓名', '课程名称', '原始费用', '优惠率(%)', '缴纳费用', '报课节数', '单价', '类型', '备注', '创建时间']

    ws.append(headers)

    

    # 设置表头样式

    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")

    header_font = Font(bold=True, color="FFFFFF")

    border = Border(

        left=Side(style='thin'),

        right=Side(style='thin'),

        top=Side(style='thin'),

        bottom=Side(style='thin')

    )

    

    for cell in ws[1]:

        cell.fill = header_fill

        cell.font = header_font

        cell.alignment = Alignment(horizontal='center', vertical='center')

        cell.border = border

    

    total_paid = 0

    total_refund = 0

    for payment in payments:

        ws.append([

            payment.id,

            payment.payment_date.strftime('%Y-%m-%d') if payment.payment_date else '',

            payment.student_name or '',

            payment.course_name or '',

            payment.original_amount,

            payment.discount_rate,

            payment.paid_amount,

            payment.class_count,

            payment.unit_price or '',

            payment.type or '缴费',

            payment.remark or '',

            payment.created_at.strftime('%Y-%m-%d %H:%M:%S') if payment.created_at else ''

        ])

        if payment.type == '缴费':

            total_paid += payment.paid_amount

        else:

            total_refund += payment.paid_amount

    

    # 添加合计行

    ws.append([])

    ws.append(['合计', '', '', '', '', '', total_paid, '', '', '缴费总额', '', ''])

    ws.append(['', '', '', '', '', '', total_refund, '', '', '退费总额', '', ''])

    ws.append(['', '', '', '', '', '', total_paid - total_refund, '', '', '净收入', '', ''])

    

    # 设置列宽

    column_widths = [8, 12, 15, 15, 12, 12, 12, 12, 12, 10, 30, 20]

    for i, width in enumerate(column_widths, 1):

        ws.column_dimensions[get_column_letter(i)].width = width

    

    # 添加边框

    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):

        for cell in row:

            cell.border = border

            cell.alignment = Alignment(horizontal='left', vertical='center')

    

    filename = f"缴费记录_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return create_excel_response(wb, filename)




@bp.route('/api/export/stats', methods=['GET'])
def export_stats():

    """导出课时统计到Excel"""

    month = request.args.get('month', get_current_month())

    student_id = request.args.get('student_id', type=int)

    TRIAL_PLACEHOLDER_NAME = '【试课学员】'
    query = ClassHoursStats.query.filter_by(month=month).filter(ClassHoursStats.student_name != TRIAL_PLACEHOLDER_NAME)

    if student_id:

        query = query.filter_by(student_id=student_id)

    

    stats = query.order_by(ClassHoursStats.student_name).all()

    

    wb = Workbook()

    ws = wb.active

    ws.title = "课时统计"

    

    headers = ['学生姓名', '课程名称', '当月原始课时', '当月课时', '上月累计课时', '本月累计课时', '剩余课时', '更新时间']

    ws.append(headers)

    

    # 设置表头样式

    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")

    header_font = Font(bold=True, color="FFFFFF")

    border = Border(

        left=Side(style='thin'),

        right=Side(style='thin'),

        top=Side(style='thin'),

        bottom=Side(style='thin')

    )

    

    for cell in ws[1]:

        cell.fill = header_fill

        cell.font = header_font

        cell.alignment = Alignment(horizontal='center', vertical='center')

        cell.border = border

    

    for stat in stats:

        ws.append([

            stat.student_name or '',

            stat.course_name or '',

            stat.original_hours,

            stat.actual_hours,

            stat.last_month_total,

            stat.current_month_total,

            stat.remaining_hours,

            stat.updated_at.strftime('%Y-%m-%d %H:%M:%S') if stat.updated_at else ''

        ])

    

    # 设置列宽

    column_widths = [15, 15, 15, 15, 15, 15, 15, 20]

    for i, width in enumerate(column_widths, 1):

        ws.column_dimensions[get_column_letter(i)].width = width

    

    # 添加边框

    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):

        for cell in row:

            cell.border = border

            cell.alignment = Alignment(horizontal='left', vertical='center')

    

    filename = f"课时统计_{month}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return create_excel_response(wb, filename)




@bp.route('/api/export/finance', methods=['GET'])
def export_finance():

    """导出财务报表到Excel"""

    year = request.args.get('year', '')

    

    query = FinanceRecord.query

    if year:

        query = query.filter(FinanceRecord.month.like(f'{year}%'))

    

    records = query.order_by(FinanceRecord.month.desc()).all()

    

    wb = Workbook()

    ws = wb.active

    ws.title = "财务报表"

    

    headers = ['月份', '收入模式', '当月收入', '老师成本', '营销成本', '营销', '教务', '房租水电', '房租', '水电', '其它成本', '打印纸', '打印粉', '当月利润', '更新时间']

    ws.append(headers)

    

    # 设置表头样式

    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")

    header_font = Font(bold=True, color="FFFFFF")

    border = Border(

        left=Side(style='thin'),

        right=Side(style='thin'),

        top=Side(style='thin'),

        bottom=Side(style='thin')

    )

    

    for cell in ws[1]:

        cell.fill = header_fill

        cell.font = header_font

        cell.alignment = Alignment(horizontal='center', vertical='center')

        cell.border = border

    

    for record in records:

        ws.append([

            record.month,

            record.revenue_mode or '课耗模式',

            record.monthly_revenue,

            record.teacher_cost,

            record.marketing_cost,

            record.marketing_flyer,

            record.marketing_labor,

            record.rent_utilities,

            record.rent,

            record.utilities,

            record.other_cost,

            record.other_paper,

            record.other_toner,

            record.monthly_profit,

            record.updated_at.strftime('%Y-%m-%d %H:%M:%S') if record.updated_at else ''

        ])

    

    # 设置列宽

    column_widths = [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 20]

    for i, width in enumerate(column_widths, 1):

        ws.column_dimensions[get_column_letter(i)].width = width

    

    # 添加边框

    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):

        for cell in row:

            cell.border = border

            cell.alignment = Alignment(horizontal='left', vertical='center')

    

    filename = f"财务报表_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return create_excel_response(wb, filename)




@bp.route('/api/export/teacher-hours', methods=['GET'])
def export_teacher_hours():

    """导出教师课时统计到Excel"""

    month = request.args.get('month', get_current_month())

    teacher_id = request.args.get('teacher_id', type=int)

    

    query = TeacherHours.query.filter_by(month=month)

    if teacher_id:

        query = query.filter_by(teacher_id=teacher_id)

    

    hours = query.order_by(TeacherHours.teacher_name, TeacherHours.course_name).all()

    

    wb = Workbook()

    ws = wb.active

    ws.title = "教师课时"

    

    headers = ['教师姓名', '课程名称', '月份', '课时总数', '激励金额', '备注', '是否已结算', '结算时间', '更新时间']

    ws.append(headers)

    

    # 设置表头样式

    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")

    header_font = Font(bold=True, color="FFFFFF")

    border = Border(

        left=Side(style='thin'),

        right=Side(style='thin'),

        top=Side(style='thin'),

        bottom=Side(style='thin')

    )

    

    for cell in ws[1]:

        cell.fill = header_fill

        cell.font = header_font

        cell.alignment = Alignment(horizontal='center', vertical='center')

        cell.border = border

    

    for hour in hours:

        ws.append([

            hour.teacher_name or '',

            hour.course_name or '',

            hour.month,

            hour.total_hours,

            hour.incentive or 0,

            hour.remark or '',

            '是' if hour.is_settled else '否',

            hour.settled_at.strftime('%Y-%m-%d %H:%M:%S') if hour.settled_at else '',

            hour.updated_at.strftime('%Y-%m-%d %H:%M:%S') if hour.updated_at else ''

        ])

    

    # 设置列宽

    column_widths = [15, 15, 12, 12, 12, 30, 12, 20, 20]

    for i, width in enumerate(column_widths, 1):

        ws.column_dimensions[get_column_letter(i)].width = width

    

    # 添加边框

    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):

        for cell in row:

            cell.border = border

            cell.alignment = Alignment(horizontal='left', vertical='center')

    

    filename = f"教师课时_{month}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return create_excel_response(wb, filename)






