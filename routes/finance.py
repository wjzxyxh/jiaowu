"""
Finance路由模块
从app_old.py提取
"""
from flask import Blueprint, request, jsonify, render_template, send_from_directory, Response
from flask_login import login_required, current_user
from extensions import db, limiter, csrf
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

bp = Blueprint('finance', __name__)


def _compute_finance_result(month):
    """计算单月财务结果，返回结果字典或 None。供 get_finance 与 get_finance_by_year 复用。"""
    finance = FinanceRecord.query.filter_by(month=month).first()
    if not finance:
        update_finance_record(month)
        finance = FinanceRecord.query.filter_by(month=month).first()
    if not finance:
        return None

    # 计算总课耗（所有学生的当月课时总和，过滤已删除的学生）
    from models import Student
    stats_list = ClassHoursStats.query.join(Student, ClassHoursStats.student_id == Student.id).filter(ClassHoursStats.month == month).all()
    total_class_hours = sum(stats.actual_hours for stats in stats_list)

    

    # 计算老师工资（从 TeacherHours 表获取）

    # 分别计算兼职老师和全职老师当月的工资总和

    teacher_hours_list = TeacherHours.query.filter_by(month=month).all()

    

    # 按teacher_id分组，合并同一个老师的多个课程记录

    teacher_cost_map = {}  # teacher_id -> 老师成本明细

    

    year, month_num = map(int, month.split('-'))

    start_date = date(year, month_num, 1)

    end_date = date(year, month_num, calendar.monthrange(year, month_num)[1])

    

    # 先收集所有需要处理的teacher_id，并累加激励

    teacher_ids = set()

    for th in teacher_hours_list:

        teacher = db.session.get(Teacher, th.teacher_id)

        if teacher:

            employment_type = teacher.employment_type if teacher.employment_type else '兼职'

            if employment_type in ['兼职', '全职']:

                teacher_ids.add(th.teacher_id)

    

    # 对每个老师，统计所有已确认的课程（只查询一次）

    for teacher_id in teacher_ids:

        teacher = db.session.get(Teacher, teacher_id)

        if not teacher:

            continue

        

        # 只计算雇佣类型为"兼职"或"全职"的老师

        employment_type = teacher.employment_type if teacher.employment_type else '兼职'

        if employment_type not in ['兼职', '全职']:

            continue

        

        # 获取该老师的所有TeacherHours记录，用于获取底薪和激励

        teacher_hours_records = [th for th in teacher_hours_list if th.teacher_id == teacher_id]

        

        # 计算该老师的底薪（优先使用TeacherHours表中的底薪，否则从Teacher表读取）

        base_salary = 0.0

        if employment_type == '全职':

            # 从第一个记录中获取底薪，或者从Teacher表读取

            if teacher_hours_records:

                base_salary = getattr(teacher_hours_records[0], 'base_salary', None) or (teacher.base_salary if teacher else 0.0)

            else:

                base_salary = teacher.base_salary if teacher else 0.0

        

        # 累加所有课程记录的激励

        incentive = sum(getattr(th, 'incentive', None) or 0.0 for th in teacher_hours_records)

        

        # 初始化该老师的成本明细

        teacher_cost_map[teacher_id] = {

            'teacher_name': teacher.name,

            'base_salary': base_salary,

            'course_cost': 0.0,

            'experience_cost': 0.0,

            'incentive': incentive,

            'employment_type': employment_type

        }

        

        # 获取该老师当月的所有课程（只统计已确认的课程，不限制course_id）
        # 过滤已删除的学生
        from models import Student
        courses = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).options(

            joinedload(StudentCourse.course)

        ).filter(

            StudentCourse.teacher_id == teacher_id,

            StudentCourse.course_date >= start_date,

            StudentCourse.course_date <= end_date,

            StudentCourse.status != '删除',

            StudentCourse.is_confirmed == True  # 只统计已确认的课程

        ).all()

        

        # 获取教师课程成本配置

        teacher_costs = TeacherCourseCost.query.filter_by(teacher_id=teacher_id).all()

        cost_map = {cost.course_id: cost.cost_per_class for cost in teacher_costs}

        

        # 获取教师的所有经验成本配置

        teacher_experience_costs = TeacherExperienceCost.query.filter_by(teacher_id=teacher_id).all()

        # 第一层：按"教师-课程-学生"映射（包含时间段信息）

        experience_cost_map_by_student = {}

        # 第二层：按"教师-课程"映射（student_id为None的记录，包含时间段信息）

        experience_cost_map_by_course = {}

        

        for cost in teacher_experience_costs:

            if cost.student_id:

                key = (cost.course_id, cost.student_id)

                if key not in experience_cost_map_by_student:

                    experience_cost_map_by_student[key] = []

                experience_cost_map_by_student[key].append(cost)

            else:

                if cost.course_id not in experience_cost_map_by_course:

                    experience_cost_map_by_course[cost.course_id] = []

                experience_cost_map_by_course[cost.course_id].append(cost)

        

        course_cost = 0.0

        experience_cost = 0.0

        for course in courses:

            course_id = course.course_id if course.course_id and course.course else None

            course_date = course.course_date

            course_year_month = course_date.strftime('%Y-%m')  # 课程的年月（YYYY-MM）

            

            if course.status == '正常':

                if course_id and course_id in cost_map:

                    course_cost += cost_map[course_id]

                

                # 计算经验费用

                if course_id:

                    student_key = (course_id, course.student_id)

                    matched_experience_cost = None

                    

                    # 优先匹配"教师-课程-学生"

                    if student_key in experience_cost_map_by_student:

                        for cost_record in experience_cost_map_by_student[student_key]:

                            if cost_record.start_date:

                                start_year_month = cost_record.start_date.strftime('%Y-%m')

                                if course_year_month < start_year_month:

                                    continue

                            if cost_record.end_date:

                                end_year_month = cost_record.end_date.strftime('%Y-%m')

                                if course_year_month > end_year_month:

                                    continue

                            matched_experience_cost = cost_record

                            break

                        

                        if not matched_experience_cost:

                            for cost_record in experience_cost_map_by_student[student_key]:

                                if not cost_record.start_date and not cost_record.end_date:

                                    matched_experience_cost = cost_record

                                    break

                    

                    # 如果没有匹配到"教师-课程-学生"，则使用"教师-课程"

                    if not matched_experience_cost and course_id in experience_cost_map_by_course:

                        for cost_record in experience_cost_map_by_course[course_id]:

                            if cost_record.start_date:

                                start_year_month = cost_record.start_date.strftime('%Y-%m')

                                if course_year_month < start_year_month:

                                    continue

                            if cost_record.end_date:

                                end_year_month = cost_record.end_date.strftime('%Y-%m')

                                if course_year_month > end_year_month:

                                    continue

                            matched_experience_cost = cost_record

                            break

                        

                        if not matched_experience_cost:

                            for cost_record in experience_cost_map_by_course[course_id]:

                                if not cost_record.start_date and not cost_record.end_date:

                                    matched_experience_cost = cost_record

                                    break

                    

                    if matched_experience_cost:

                        experience_cost += matched_experience_cost.experience_cost

                        

            elif course.status == '跑空':

                if course_id and course_id in cost_map:

                    course_cost += cost_map[course_id] * 0.5

                

                    # 计算经验（跑空也算0.5）

                if course_id:

                    student_key = (course_id, course.student_id)

                    matched_experience_cost = None

                    

                    # 优先匹配"教师-课程-学生"

                    if student_key in experience_cost_map_by_student:

                        for cost_record in experience_cost_map_by_student[student_key]:

                            if cost_record.start_date:

                                start_year_month = cost_record.start_date.strftime('%Y-%m')

                                if course_year_month < start_year_month:

                                    continue

                            if cost_record.end_date:

                                end_year_month = cost_record.end_date.strftime('%Y-%m')

                                if course_year_month > end_year_month:

                                    continue

                            matched_experience_cost = cost_record

                            break

                        

                        if not matched_experience_cost:

                            for cost_record in experience_cost_map_by_student[student_key]:

                                if not cost_record.start_date and not cost_record.end_date:

                                    matched_experience_cost = cost_record

                                    break

                    

                    # 如果没有匹配到"教师-课程-学生"，则使用"教师-课程"

                    if not matched_experience_cost and course_id in experience_cost_map_by_course:

                        for cost_record in experience_cost_map_by_course[course_id]:

                            if cost_record.start_date:

                                start_year_month = cost_record.start_date.strftime('%Y-%m')

                                if course_year_month < start_year_month:

                                    continue

                            if cost_record.end_date:

                                end_year_month = cost_record.end_date.strftime('%Y-%m')

                                if course_year_month > end_year_month:

                                    continue

                            matched_experience_cost = cost_record

                            break

                        

                        if not matched_experience_cost:

                            for cost_record in experience_cost_map_by_course[course_id]:

                                if not cost_record.start_date and not cost_record.end_date:

                                    matched_experience_cost = cost_record

                                    break

                        

                        if matched_experience_cost:

                            experience_cost += matched_experience_cost.experience_cost * 0.5

        

        # 设置该老师的总成本

        teacher_cost_map[teacher_id]['course_cost'] = course_cost

        teacher_cost_map[teacher_id]['experience_cost'] = experience_cost

    

    # 转换为列表并计算总计

    teacher_cost_detail = []

    total_teacher_cost = 0.0

    part_time_salary = 0.0  # 兼职老师工资总和

    full_time_salary = 0.0  # 全职老师工资总和

    

    for teacher_id, detail in teacher_cost_map.items():

        teacher_total = detail['base_salary'] + detail['course_cost'] + detail['experience_cost'] + detail['incentive']

        total_teacher_cost += teacher_total

        

        # 根据雇佣类型分别累加

        if detail['employment_type'] == '兼职':

            part_time_salary += teacher_total

        elif detail['employment_type'] == '全职':

            full_time_salary += teacher_total

        

        teacher_cost_detail.append({

            'teacher_name': detail['teacher_name'],

            'base_salary': round(detail['base_salary'], 2),

            'course_cost': round(detail['course_cost'], 2),

            'experience_cost': round(detail['experience_cost'], 2),

            'incentive': round(detail['incentive'], 2),

            'total': round(teacher_total, 2),

            'employment_type': detail['employment_type']

        })

    

    # 获取缴费情况（当月缴费和退费）

    year, month_num = map(int, month.split('-'))

    start_date = date(year, month_num, 1)

    end_date = date(year, month_num, calendar.monthrange(year, month_num)[1])

    

    # 只查询存在学生的缴费记录（过滤已删除的学生）
    from models import Student
    payments = Payment.query.join(Student, Payment.student_id == Student.id).filter(

        Payment.payment_date >= start_date,

        Payment.payment_date <= end_date

    ).all()

    

    payment_detail = {

        'total_paid': sum(p.paid_amount for p in payments if p.type == '缴费'),

        'total_refund': sum(p.paid_amount for p in payments if p.type == '退费'),

        'count_paid': len([p for p in payments if p.type == '缴费']),

        'count_refund': len([p for p in payments if p.type == '退费'])

    }

    

    # 计算收入明细

    revenue_mode = finance.revenue_mode if finance.revenue_mode else '课耗模式'

    revenue_detail = []

    

    if revenue_mode == '缴费模式':

        # 缴费模式：显示缴费和退费明细

        paid_list = []

        refund_list = []

        

        for payment in payments:

            if payment.type == '缴费':

                paid_list.append({

                    'date': payment.payment_date.strftime('%Y-%m-%d') if payment.payment_date else '',

                    'student_name': payment.student_name,

                    'amount': round(payment.paid_amount, 2),

                    'remark': payment.remark if payment.remark else ''

                })

            elif payment.type == '退费':

                refund_list.append({

                    'date': payment.payment_date.strftime('%Y-%m-%d') if payment.payment_date else '',

                    'student_name': payment.student_name,

                    'amount': round(payment.paid_amount, 2),

                    'remark': payment.remark if payment.remark else ''

                })

        

        revenue_detail = {

            'mode': '缴费模式',

            'paid_list': paid_list,

            'refund_list': refund_list,

            'total_paid': round(payment_detail['total_paid'], 2),

            'total_refund': round(payment_detail['total_refund'], 2),

            'total_revenue': round(payment_detail['total_paid'] - payment_detail['total_refund'], 2)

        }

    else:

        # 课耗模式：显示每个学生的课耗和实际单价明细

        student_revenue_list = []

        

        for stats in stats_list:

            if stats.actual_hours > 0:

                # 计算实际单价和明细

                actual_unit_price, price_detail_list = calculate_actual_unit_price(

                    stats.student_id,

                    stats.actual_hours,

                    month

                )

                

                student_revenue = stats.actual_hours * actual_unit_price

                

                student_revenue_list.append({

                    'student_name': stats.student_name,

                    'actual_hours': round(stats.actual_hours, 2),

                    'unit_price': round(actual_unit_price, 2),

                    'revenue': round(student_revenue, 2),

                    'price_detail': price_detail_list  # 添加单价明细

                })

            else:

                student_revenue_list.append({

                    'student_name': stats.student_name,

                    'actual_hours': 0.0,

                    'unit_price': 0.0,

                    'revenue': 0.0,

                    'price_detail': []

                })

        

        revenue_detail = {

            'mode': '课耗模式',

            'student_list': student_revenue_list,

            'total_revenue': round(finance.monthly_revenue, 2)

        }

    

    result = finance.to_dict()

    result['total_class_hours'] = round(total_class_hours, 2)

    result['teacher_cost_detail'] = teacher_cost_detail

    result['part_time_salary'] = round(part_time_salary, 2)  # 兼职老师工资总和

    result['full_time_salary'] = round(full_time_salary, 2)  # 全职老师工资总和

    result['payment_detail'] = payment_detail

    result['revenue_detail'] = revenue_detail

    return result


def _aggregate_finance_by_year(year):
    """按年聚合 12 个月财务数据，返回与单月相同结构的字典（数值为年度合计）。"""
    year = int(year)
    aggregated = {
        'month': f'{year}-全年',
        'monthly_revenue': 0,
        'total_class_hours': 0,
        'part_time_salary': 0,
        'full_time_salary': 0,
        'rent': 0,
        'utilities': 0,
        'marketing_flyer': 0,
        'marketing_labor': 0,
        'other_paper': 0,
        'other_toner': 0,
        'teacher_cost': 0,
        'marketing_cost': 0,
        'rent_utilities': 0,
        'other_cost': 0,
        'monthly_profit': 0,
        'payment_detail': {'total_paid': 0, 'total_refund': 0, 'count_paid': 0, 'count_refund': 0},
        'teacher_cost_detail': [],
        'revenue_detail': None,
        'revenue_mode': '课耗模式',
    }
    teacher_totals = {}
    for month_num in range(1, 13):
        month = f'{year}-{month_num:02d}'
        r = _compute_finance_result(month)
        if not r:
            continue
        aggregated['monthly_revenue'] += float(r.get('monthly_revenue') or 0)
        aggregated['total_class_hours'] += float(r.get('total_class_hours') or 0)
        aggregated['part_time_salary'] += float(r.get('part_time_salary') or 0)
        aggregated['full_time_salary'] += float(r.get('full_time_salary') or 0)
        aggregated['rent'] += float(r.get('rent') or 0)
        aggregated['utilities'] += float(r.get('utilities') or 0)
        aggregated['marketing_flyer'] += float(r.get('marketing_flyer') or 0)
        aggregated['marketing_labor'] += float(r.get('marketing_labor') or 0)
        aggregated['other_paper'] += float(r.get('other_paper') or 0)
        aggregated['other_toner'] += float(r.get('other_toner') or 0)
        aggregated['teacher_cost'] += float(r.get('teacher_cost') or 0)
        aggregated['marketing_cost'] += float(r.get('marketing_cost') or 0)
        aggregated['rent_utilities'] += float(r.get('rent_utilities') or 0)
        aggregated['other_cost'] += float(r.get('other_cost') or 0)
        aggregated['monthly_profit'] += float(r.get('monthly_profit') or 0)
        pd = r.get('payment_detail') or {}
        aggregated['payment_detail']['total_paid'] += float(pd.get('total_paid') or 0)
        aggregated['payment_detail']['total_refund'] += float(pd.get('total_refund') or 0)
        aggregated['payment_detail']['count_paid'] += int(pd.get('count_paid') or 0)
        aggregated['payment_detail']['count_refund'] += int(pd.get('count_refund') or 0)
        for t in (r.get('teacher_cost_detail') or []):
            name = t.get('teacher_name') or ''
            if name not in teacher_totals:
                teacher_totals[name] = {
                    'teacher_name': name,
                    'base_salary': 0, 'course_cost': 0, 'experience_cost': 0,
                    'incentive': 0, 'total': 0, 'employment_type': t.get('employment_type', '兼职'),
                }
            teacher_totals[name]['base_salary'] += float(t.get('base_salary') or 0)
            teacher_totals[name]['course_cost'] += float(t.get('course_cost') or 0)
            teacher_totals[name]['experience_cost'] += float(t.get('experience_cost') or 0)
            teacher_totals[name]['incentive'] += float(t.get('incentive') or 0)
            teacher_totals[name]['total'] += float(t.get('total') or 0)
    aggregated['teacher_cost_detail'] = [
        {**v, 'base_salary': round(v['base_salary'], 2), 'course_cost': round(v['course_cost'], 2),
         'experience_cost': round(v['experience_cost'], 2), 'incentive': round(v['incentive'], 2),
         'total': round(v['total'], 2)}
        for v in teacher_totals.values()
    ]
    for k in ['monthly_revenue', 'total_class_hours', 'part_time_salary', 'full_time_salary',
              'rent', 'utilities', 'marketing_flyer', 'marketing_labor', 'other_paper', 'other_toner',
              'teacher_cost', 'marketing_cost', 'rent_utilities', 'other_cost', 'monthly_profit']:
        if k in aggregated and isinstance(aggregated[k], (int, float)):
            aggregated[k] = round(aggregated[k], 2)
    pd = aggregated['payment_detail']
    pd['total_paid'] = round(pd['total_paid'], 2)
    pd['total_refund'] = round(pd['total_refund'], 2)
    return aggregated


@bp.route('/api/finance', methods=['GET'])
@login_required
def get_finance():
    """获取财务记录。查询参数: month=YYYY-MM 或 year=YYYY，默认当前月。"""
    month = request.args.get('month')
    year = request.args.get('year')
    if year:
        try:
            data = _aggregate_finance_by_year(year)
            return jsonify(data)
        except (ValueError, TypeError):
            return jsonify({'error': 'invalid year'}), 400
    if month:
        data = _compute_finance_result(month)
        if data is None:
            return jsonify({'error': 'not found', 'month': month}), 404
        return jsonify(data)
    month = get_current_month()
    data = _compute_finance_result(month)
    if data is None:
        return jsonify({})
    return jsonify(data)




@bp.route('/api/finance', methods=['PUT'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def update_finance():

    """更新财务记录"""

    data = request.json

    month = data.get('month', get_current_month())

    

    finance = FinanceRecord.query.filter_by(month=month).first()

    if not finance:

        finance = FinanceRecord(month=month)

        db.session.add(finance)

    

    # 更新成本数据

    finance.marketing_flyer = float(data.get('marketing_flyer', 0))

    finance.marketing_labor = float(data.get('marketing_labor', 0))

    finance.rent = float(data.get('rent', 0))

    finance.utilities = float(data.get('utilities', 0))

    finance.other_paper = float(data.get('other_paper', 0))

    finance.other_toner = float(data.get('other_toner', 0))

    

    # 更新收入计算模式

    if 'revenue_mode' in data:

        revenue_mode = data.get('revenue_mode')

        if revenue_mode in ['缴费模式', '课耗模式']:

            finance.revenue_mode = revenue_mode

    

    db.session.commit()

    

    # 重新计算财务数据

    update_finance_record(month)

    finance = FinanceRecord.query.filter_by(month=month).first()

    

    return jsonify(finance.to_dict())






@bp.route('/api/finance-config', methods=['GET'])
def get_finance_configs():

    """获取所有财务配置"""

    configs = FinanceConfig.query.all()

    # 如果没有配置，返回默认值

    if not configs:

        return jsonify([

            {'id': 0, 'key': 'min_hours_for_scheduling', 'value': -1, 'description': '剩余课时低于此值不能排课'},

            {'id': 0, 'key': 'min_hours_for_reminder', 'value': 3, 'description': '剩余课时低于此值需要进行提醒'}

        ])

    return jsonify([c.to_dict() for c in configs])






@bp.route('/api/finance-config', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def create_finance_config():

    """创建财务配置"""

    data = request.json

    config = FinanceConfig(

        key=data['key'],

        value=int(data['value']),  # 财务配置值只接受整数

        description=data.get('description', '')

    )

    db.session.add(config)

    db.session.commit()

    return jsonify(config.to_dict()), 201






@bp.route('/api/finance-config/<int:config_id>', methods=['PUT'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def update_finance_config(config_id):

    """更新财务配置"""

    config = FinanceConfig.query.get_or_404(config_id)

    data = request.json

    

    if 'value' in data:

        config.value = int(data['value'])  # 财务配置值只接受整数

    if 'description' in data:

        config.description = data['description']

    

    config.updated_at = datetime.now()

    db.session.commit()

    return jsonify(config.to_dict())






