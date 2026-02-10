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
    OperationLog, Notification, MarketingLead
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
@login_required
def export_students():
    """导出学生管理列表到Excel（支持筛选，与学生管理页 /students 一致）"""
    try:
        from sqlalchemy import or_
        from routes.students import get_valid_student_ids_for_management_page

        # 获取筛选参数
        status = request.args.get('status', '')
        grade = request.args.get('grade', '')
        search_keyword = request.args.get('search', '').strip()
        enrollment_date_start = request.args.get('enrollment_date_start', '')
        enrollment_date_end = request.args.get('enrollment_date_end', '')
        trial_success_only = request.args.get('trial_success_only', '').lower() in ('true', '1', 'yes')

        TRIAL_PLACEHOLDER_NAME = '【试课学员】'
        query = Student.query.filter(Student.name != TRIAL_PLACEHOLDER_NAME)

        # 学生管理页的 trial_success_only 过滤逻辑
        if trial_success_only:
            valid_ids = get_valid_student_ids_for_management_page()
            if valid_ids:
                query = query.filter(Student.id.in_(valid_ids))
            else:
                query = query.filter(Student.id == -1)

        # 状态筛选
        if status:
            query = query.filter_by(status=status)

        # 年级筛选
        if grade:
            query = query.filter_by(grade=grade)

        # 登记日期范围筛选
        if enrollment_date_start:
            try:
                start_date = datetime.strptime(enrollment_date_start, '%Y-%m-%d').date()
                query = query.filter(Student.enrollment_date >= start_date)
            except ValueError:
                pass

        if enrollment_date_end:
            try:
                end_date = datetime.strptime(enrollment_date_end, '%Y-%m-%d').date()
                query = query.filter(Student.enrollment_date <= end_date)
            except ValueError:
                pass

        # 搜索关键词
        if search_keyword:
            search_pattern = f'%{search_keyword}%'
            query = query.filter(
                or_(
                    Student.name.like(search_pattern),
                    Student.phone.like(search_pattern),
                    Student.parent_name.like(search_pattern)
                )
            )

        students = query.order_by(Student.created_at.desc()).all()

        wb = Workbook()
        ws = wb.active
        ws.title = "学生管理"

        # 设置表头（与学生管理页表格列一致）
        headers = ['序号', '姓名', '来源', '年级', '登记日期', '状态', '联系电话', '家长姓名', '家长电话', '地址', '备注']
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
        for idx, student in enumerate(students, 1):
            ws.append([
                idx,
                student.name,
                student.source or '',
                student.grade or '',
                student.enrollment_date.strftime('%Y-%m-%d') if student.enrollment_date else '',
                student.status or '',
                student.phone or '',
                student.parent_name or '',
                student.parent_phone or '',
                student.address or '',
                student.notes or '',
            ])

        # 设置列宽
        column_widths = [8, 12, 10, 10, 12, 8, 15, 12, 15, 25, 30]
        for i, width in enumerate(column_widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = width

        # 添加边框
        for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
            for cell in row:
                cell.border = border
                cell.alignment = Alignment(horizontal='left', vertical='center')

        filename = f"学生管理_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return create_excel_response(wb, filename)
    except Exception as e:
        import traceback
        error_msg = f"导出学生管理列表失败: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({'error': f'导出失败: {str(e)}'}), 500




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


@bp.route('/api/export/student-list', methods=['GET'])
@login_required
def export_student_list():
    """导出学生名单到Excel（支持筛选条件，与学生名单页一致）"""
    try:
        from sqlalchemy import or_

        # 获取筛选参数（与学生名单页一致）
        status = request.args.get('status', '')
        grade = request.args.get('grade', '')
        search_keyword = request.args.get('search', '').strip()
        enrollment_date_start = request.args.get('enrollment_date_start', '')
        enrollment_date_end = request.args.get('enrollment_date_end', '')

        TRIAL_PLACEHOLDER_NAME = '【试课学员】'
        query = Student.query.filter(Student.name != TRIAL_PLACEHOLDER_NAME)

        # 状态筛选
        if status:
            query = query.filter_by(status=status)

        # 年级筛选
        if grade:
            query = query.filter_by(grade=grade)

        # 登记日期范围筛选
        if enrollment_date_start:
            try:
                start_date = datetime.strptime(enrollment_date_start, '%Y-%m-%d').date()
                query = query.filter(Student.enrollment_date >= start_date)
            except ValueError:
                pass

        if enrollment_date_end:
            try:
                end_date = datetime.strptime(enrollment_date_end, '%Y-%m-%d').date()
                query = query.filter(Student.enrollment_date <= end_date)
            except ValueError:
                pass

        # 搜索关键词（姓名、电话、家长姓名）
        if search_keyword:
            search_pattern = f'%{search_keyword}%'
            query = query.filter(
                or_(
                    Student.name.like(search_pattern),
                    Student.phone.like(search_pattern),
                    Student.parent_name.like(search_pattern)
                )
            )

        students = query.order_by(Student.created_at.desc()).all()

        # 获取所有试课排课记录（用于获取试课状态）
        trial_courses = StudentCourse.query.filter(
            StudentCourse.trial_status.isnot(None),
            StudentCourse.status != '删除'
        ).all()

        # 获取线索的试课状态映射
        leads_with_trial = MarketingLead.query.filter(
            MarketingLead.trial_status.isnot(None)
        ).all()

        # 构建学生试课状态字典：{(name, grade): trial_status}
        def get_student_trial_status(student):
            name = student.name
            grade_val = student.grade or ''

            # 从排课记录获取试课状态
            statuses = set()
            for tc in trial_courses:
                if tc.student_id == student.id and tc.trial_status:
                    statuses.add(tc.trial_status)

            # 从线索获取试课状态
            for lead in leads_with_trial:
                if lead.name == name and (lead.grade or '') == grade_val and lead.trial_status:
                    statuses.add(lead.trial_status)

            if statuses:
                return '、'.join(sorted(statuses))
            return ''

        wb = Workbook()
        ws = wb.active
        ws.title = "学生名单"

        # 设置表头（与学生名单页表格列一致）
        headers = ['序号', '姓名', '年级', '状态', '试课状态', '登记日期', '联系电话', '家长姓名', '家长电话', '来源', '地址', '备注']
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
        for idx, student in enumerate(students, 1):
            trial_status = get_student_trial_status(student)
            ws.append([
                idx,
                student.name,
                student.grade or '',
                student.status or '',
                trial_status,
                student.enrollment_date.strftime('%Y-%m-%d') if student.enrollment_date else '',
                student.phone or '',
                student.parent_name or '',
                student.parent_phone or '',
                student.source or '',
                student.address or '',
                student.notes or '',
            ])

        # 设置列宽
        column_widths = [8, 12, 10, 8, 12, 12, 15, 12, 15, 10, 25, 30]
        for i, width in enumerate(column_widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = width

        # 添加边框和样式
        for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
            for cell in row:
                cell.border = border
                cell.alignment = Alignment(horizontal='left', vertical='center')

        filename = f"学生名单_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return create_excel_response(wb, filename)
    except Exception as e:
        import traceback
        error_msg = f"导出学生名单失败: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({'error': f'导出失败: {str(e)}'}), 500


