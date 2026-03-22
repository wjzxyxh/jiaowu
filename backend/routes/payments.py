"""
Payments路由模块
从app_old.py提取
"""
from flask import Blueprint, request, jsonify, render_template, send_from_directory, Response
from flask_login import login_required, current_user
from backend.extensions import db, limiter, csrf
from backend.models import (
    Student, Teacher, Course, StudentCourse, ClassHoursStats, Payment, 
    TeacherHours, FinanceRecord, TimeSlot, Classroom, FinanceConfig,
    TeacherCourseCost, TeacherCourseCostHistory, TeacherExperienceCost,
    TeacherExperienceCostHistory, TeacherResume, User, LoginLog, 
    OperationLog, Notification, StudentCourseDefaultSchedule, MarketingLead
)
from backend.utils import (
    allowed_file, get_original_filename, get_safe_storage_filename,
    get_client_ip, log_operation, require_permission, get_current_month,
    get_weekday, check_course_conflicts, handle_db_errors, validate_json
)
from backend.services import (
    create_notification, check_and_create_notifications,
    update_class_hours_stats, update_teacher_hours,
    get_finance_config, calculate_remaining_hours_from_payments,
    calculate_actual_unit_price, update_finance_record
)
from backend.config import Config
import os
from datetime import datetime, date, timedelta
from sqlalchemy import func, extract, or_, and_
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

bp = Blueprint('payments', __name__)

@bp.route('/api/payments', methods=['GET'])
@login_required
def get_payments():
    """获取所有缴费记录"""

    student_id = request.args.get('student_id')

    year = request.args.get('year')

    month = request.args.get('month')  # 保留兼容性

    payment_type = request.args.get('type')

    payment_status = request.args.get('status')  # 状态筛选：进行中/结束

    

    # 只查询存在学生的缴费记录（过滤已删除的学生）
    # 只返回 /students 页面中存在的学生（即试课状态为成功的学生）的缴费记录
    from backend.models import Student
    TRIAL_PLACEHOLDER_NAME = '【试课学员】'
    
    # 获取符合 /students 页面条件的学生ID列表（与 get_students 中 trial_success_only=true 的逻辑一致）
    # 来源1：至少有一条试课状态为「成功」且未删除的排课记录（已关联到该学生）
    student_ids_from_courses = db.session.query(StudentCourse.student_id).filter(
        StudentCourse.trial_status == '成功',
        StudentCourse.student_id.isnot(None),
        StudentCourse.status != '删除'
    ).distinct()
    ids_from_courses = [r[0] for r in student_ids_from_courses.all()]
    
    # 来源2：与已提交且试课状态为「成功」的营销线索姓名+年级一致的学生
    # 注意：这要与 /api/students 中 trial_success_only=true 的逻辑保持一致，
    # 这样当试课状态被改为「失败/再试」时，这里就不会再把该学生算进缴费管理页。
    submitted_leads = MarketingLead.query.filter_by(lead_status='submitted', trial_status='成功').all()
    ids_from_leads = []
    for lead in submitted_leads:
        lead_grade_n = (lead.grade or '').strip() or None
        candidates = Student.query.filter(Student.name == lead.name).all()
        for s in candidates:
            if s.name == TRIAL_PLACEHOLDER_NAME:
                continue
            s_grade_n = (s.grade or '').strip() or None
            if s_grade_n == lead_grade_n:
                ids_from_leads.append(s.id)
                break
    
    # 来源3：有试课状态为「成功」的排课对应的线索，按姓名+年级匹配学生
    lead_ids_with_success = db.session.query(StudentCourse.marketing_lead_id).filter(
        StudentCourse.trial_status == '成功',
        StudentCourse.marketing_lead_id.isnot(None),
        StudentCourse.status != '删除'
    ).distinct().all()
    ids_from_success_leads = []
    for (lead_id,) in lead_ids_with_success:
        if not lead_id:
            continue
        lead = MarketingLead.query.get(lead_id)
        if not lead:
            continue
        lead_grade_n = (lead.grade or '').strip() or None
        candidates = Student.query.filter(Student.name == lead.name).all()
        for s in candidates:
            if s.name == TRIAL_PLACEHOLDER_NAME:
                continue
            s_grade_n = (s.grade or '').strip() or None
            if s_grade_n == lead_grade_n:
                ids_from_success_leads.append(s.id)
                break
    
    # 来源4：线索的 trial_status 为「成功」但无排课的情况，按姓名+年级匹配学生
    leads_with_trial_success = MarketingLead.query.filter_by(trial_status='成功').all()
    ids_from_trial_status_leads = []
    for lead in leads_with_trial_success:
        lead_grade_n = (lead.grade or '').strip() or None
        candidates = Student.query.filter(Student.name == lead.name).all()
        for s in candidates:
            if s.name == TRIAL_PLACEHOLDER_NAME:
                continue
            s_grade_n = (s.grade or '').strip() or None
            if s_grade_n == lead_grade_n:
                ids_from_trial_status_leads.append(s.id)
                break
    
    # 合并所有符合条件的学生ID（与 /students 页面一致：只包含试课状态为「成功」的正式学生）
    valid_student_ids = list(set(ids_from_courses) | set(ids_from_leads) | set(ids_from_success_leads) | set(ids_from_trial_status_leads))

    # 先执行一次清理：删除不再属于正式学生的缴费记录（例如试课状态改为失败/再试的学生）
    try:
        cleanup_q = Payment.query.join(Student, Payment.student_id == Student.id).filter(
            Student.name != TRIAL_PLACEHOLDER_NAME
        )
        if valid_student_ids:
            cleanup_q = cleanup_q.filter(~Student.id.in_(valid_student_ids))
        # 无 valid_student_ids 时，表示当前没有任何正式学生，则会清理所有非占位学生的缴费记录
        deleted_count = 0
        for pay in cleanup_q.all():
            db.session.delete(pay)
            deleted_count += 1
        if deleted_count:
            db.session.commit()
            print(f"[DEBUG] /api/payments 清理了 {deleted_count} 条不再属于正式学生的缴费记录")
    except Exception as e:
        db.session.rollback()
        print(f"[WARN] /api/payments 清理历史缴费记录失败: {e}")
    
    # 只查询当前正式学生（排除占位学生）的缴费记录
    query = Payment.query.join(Student, Payment.student_id == Student.id).filter(
        Student.name != TRIAL_PLACEHOLDER_NAME
    )
    if valid_student_ids:
        query = query.filter(Student.id.in_(valid_student_ids))
    else:
        # 当前无正式学生，直接返回空结果
        query = query.filter(Student.id == -1)

    if student_id:

        query = query.filter(Payment.student_id == student_id)

    if payment_type:

        query = query.filter(Payment.type == payment_type)

    

    # 日期筛选逻辑（月份筛选优先级高于年份筛选）：

    # 1. 如果 month 参数存在且不为空，使用月份筛选

    # 2. 如果 month 不存在，但 year 参数存在且不为空字符串，使用年度筛选

    # 3. 如果 year 参数为空字符串（用户选择了"全部年份"），不添加年度筛选，显示所有年份

    # 4. 未传年份/月份时不按日期筛选，显示全部（便于缴费提醒看到所有有余额的缴费）

    if month and month.strip():

        # 月份筛选（优先级最高）

        year_val, month_num = map(int, month.split('-'))

        start_date = date(year_val, month_num, 1)

        end_date = date(year_val, month_num, calendar.monthrange(year_val, month_num)[1])

        query = query.filter(Payment.payment_date >= start_date, Payment.payment_date <= end_date)

    elif year is not None and year and str(year).strip():

        # 仅当 year 参数存在且非空时使用年度筛选

        year_int = int(year)

        start_date = date(year_int, 1, 1)

        end_date = date(year_int, 12, 31)

        query = query.filter(Payment.payment_date >= start_date, Payment.payment_date <= end_date)

    

    payments = query.order_by(Payment.payment_date.desc()).all()

    

    # 为每条缴费记录计算剩余课时和剩余费用

    # 需要按照FIFO原则，计算每个缴费记录还剩余多少课时

    # 重要：按学生和课程分组处理，确保同一学生不同课程的课时独立计算

    result = []

    

    # 按学生和课程分组处理（与预排课/财务一致：有 course_id 按 course_id，无则按 course_name 解析课程）

    student_course_payments = {}

    for payment in payments:

        student_id = payment.student_id

        course_id = payment.course_id

        # 分组键：有 course_id 用 (student_id, course_id)；无则按 course_name 解析为课程 id，或 (student_id, 'name:'+course_name)
        if course_id:
            key = (student_id, course_id)
        elif payment.course_name:
            course = Course.query.filter_by(name=payment.course_name, status='启用').first()
            key = (student_id, course.id) if course else (student_id, 'name:' + (payment.course_name or ''))
        else:
            key = (student_id, None)

        if key not in student_course_payments:
            student_course_payments[key] = []
        student_course_payments[key].append(payment)

    for key, payment_list in student_course_payments.items():
        student_id = key[0]
        k = key[1]
        # 解析 course_id、course_name（与预排课逻辑一致）
        if isinstance(k, int):
            course_id = k
            course_obj = Course.query.get(k)
            course_name = (course_obj.name if course_obj else '') or ''
        elif isinstance(k, str) and k.startswith('name:'):
            course_name = k[5:]
            course_obj = Course.query.filter_by(name=course_name, status='启用').first()
            course_id = course_obj.id if course_obj else None
        else:
            course_id = None
            course_name = ''

        # 检查学生是否存在（过滤已删除的学生）
        student_exists = Student.query.filter_by(id=student_id).first()
        if not student_exists:
            continue

        # 该学生该课程的所有缴费记录（含 course_id 匹配或 course_id 为空且 course_name 匹配，与财务/预排课一致）
        if course_id:
            all_payments = Payment.query.join(Student, Payment.student_id == Student.id).filter(
                Payment.student_id == student_id,
                or_(
                    Payment.course_id == course_id,
                    and_(Payment.course_id.is_(None), Payment.course_name == course_name)
                )
            ).order_by(Payment.payment_date.asc(), Payment.id.asc()).all()
        elif course_name:
            all_payments = Payment.query.join(Student, Payment.student_id == Student.id).filter(
                Payment.student_id == student_id,
                Payment.course_id.is_(None),
                Payment.course_name == course_name
            ).order_by(Payment.payment_date.asc(), Payment.id.asc()).all()
        else:
            all_payments = Payment.query.join(Student, Payment.student_id == Student.id).filter(
                Payment.student_id == student_id,
                Payment.course_id.is_(None)
            ).order_by(Payment.payment_date.asc(), Payment.id.asc()).all()

        # 剩余课时：总缴费课时 − 总已消耗课时（所有已确认排课），不依赖当前月统计，确认任意月份后缴费页都会更新
        total_paid_hours = calculate_remaining_hours_from_payments(student_id, course_id, course_name=course_name if course_name else None)
        if course_id:
            consumed_courses = StudentCourse.query.filter(
                StudentCourse.student_id == student_id,
                StudentCourse.course_id == course_id,
                StudentCourse.status != '删除',
                StudentCourse.is_confirmed == True,
                StudentCourse.marketing_lead_id.is_(None),
            ).all()
            consumed_hours = 0
            for cr in consumed_courses:
                st = (cr.status or '').strip()
                if st == '正常' or st == '':
                    consumed_hours += 1
                elif st == '跑空':
                    consumed_hours += 0.5
                elif st == '请假':
                    pass
                else:
                    consumed_hours += 1
            total_remaining_hours = total_paid_hours - consumed_hours
        else:
            total_remaining_hours = total_paid_hours

        

        # 构建缴费记录栈（FIFO：先进先出）

        payment_stacks = []

        for p in all_payments:

            if p.type == '缴费' and p.class_count > 0:

                payment_stacks.append({

                    'payment': p,

                    'hours': p.class_count,

                    'unit_price': p.unit_price if p.unit_price else 0.0

                })

            elif p.type == '退费' and p.class_count > 0:

                # 退费：从最早的缴费记录中扣除课时

                refund_hours = p.class_count

                for stack in payment_stacks:

                    if stack['hours'] > 0 and refund_hours > 0:

                        deduct = min(stack['hours'], refund_hours)

                        stack['hours'] -= deduct

                        refund_hours -= deduct

                        if refund_hours <= 0:

                            break

        

        # 计算每个缴费记录的剩余课时

        # 从最早的缴费开始，累计消耗到当前剩余课时

        total_available_hours = sum(stack['hours'] for stack in payment_stacks)

        total_consumed = total_available_hours - total_remaining_hours

        

        cumulative_consumed = 0

        payment_remaining_map = {}

        payment_status_map = {}  # 记录每个缴费记录的状态

        

        # 第一遍：计算每个缴费记录的剩余课时（可能为负数）

        for stack in payment_stacks:

            if cumulative_consumed >= total_consumed:

                # 历史消耗已经完成，这个缴费的课时全部剩余

                payment_remaining_map[stack['payment'].id] = stack['hours']

                payment_status_map[stack['payment'].id] = '进行中' if stack['hours'] > 0 else '结束'

            else:

                # 计算从这个缴费中消耗了多少课时

                available_from_this = stack['hours']

                consumed_from_this = min(available_from_this, total_consumed - cumulative_consumed)

                remaining_from_this = available_from_this - consumed_from_this

                payment_remaining_map[stack['payment'].id] = remaining_from_this

                payment_status_map[stack['payment'].id] = '进行中' if remaining_from_this > 0 else '结束'

                cumulative_consumed += consumed_from_this

        

        # 允许剩余课时为负数：不再用后续缴费补足，负数时状态为「欠费」、出现在缴费提醒中需补足

        # 为每条缴费记录设置剩余课时和剩余费用

        for payment in payment_list:

            payment_dict = payment.to_dict()

            

            if payment.type == '缴费':

                # 缴费记录：计算该缴费记录的剩余课时（基于FIFO，可为负数）

                payment_remaining_hours = payment_remaining_map.get(payment.id, 0)

                status = payment_status_map.get(payment.id, '进行中')

                if payment_remaining_hours < 0:

                    status = '欠费'

                elif payment_remaining_hours == 0:

                    status = '结束'

                

                # 计算剩余费用（可为负数，表示欠费金额）

                unit_price = payment.unit_price if payment.unit_price else 0.0

                if unit_price == 0:

                    # 如果没有单价，尝试获取最近一次该学生该课程（含 course_name 匹配）的缴费单价

                    if course_id:

                        q = Payment.query.join(Student, Payment.student_id == Student.id).filter(
                            Payment.student_id == payment.student_id,
                            Payment.type == '缴费'
                        )
                        if course_name:
                            q = q.filter(
                                or_(
                                    Payment.course_id == course_id,
                                    and_(Payment.course_id.is_(None), Payment.course_name == course_name)
                                )
                            )
                        else:
                            q = q.filter(Payment.course_id == course_id)
                        latest_payment = q.order_by(Payment.payment_date.desc()).first()
                    else:

                        q = Payment.query.join(Student, Payment.student_id == Student.id).filter(
                            Payment.student_id == payment.student_id,
                            Payment.type == '缴费',
                            Payment.course_id.is_(None)
                        )
                        if course_name:
                            q = q.filter(Payment.course_name == course_name)
                        latest_payment = q.order_by(Payment.payment_date.desc()).first()

                    if latest_payment and latest_payment.unit_price:

                        unit_price = latest_payment.unit_price

                

                remaining_cost = payment_remaining_hours * unit_price

                

                payment_dict['status'] = status

                # 使用该缴费记录的剩余课时（已消耗完的显示为0）

                payment_dict['remaining_hours'] = round(payment_remaining_hours, 2)

                payment_dict['remaining_cost'] = round(remaining_cost, 2)

                # 该学生-课程是否暂停排课（使用分组解析出的 course_id，与预排课一致）
                if course_id:
                    default_schedule = StudentCourseDefaultSchedule.query.filter_by(
                        student_id=payment.student_id,
                        course_id=course_id
                    ).first()
                    payment_dict['scheduling_paused'] = default_schedule.scheduling_paused if default_schedule and getattr(default_schedule, 'scheduling_paused', None) else False
                else:
                    payment_dict['scheduling_paused'] = False

            else:

                # 退费记录：剩余课时和剩余费用为0，状态为结束

                payment_dict['status'] = '结束'

                payment_dict['remaining_hours'] = 0

                payment_dict['remaining_cost'] = 0

                payment_dict['scheduling_paused'] = False

            

            # 应用状态筛选（如果指定了状态）

            if payment_status:

                if payment_dict.get('status') != payment_status:

                    continue  # 跳过不符合状态筛选的记录

            

            result.append(payment_dict)

    

    return jsonify(result)






@bp.route('/api/payments', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('edit')
@handle_db_errors
@validate_json
def create_payment():
    """创建缴费记录（必须指定课程）"""
    if not request.is_json:
        return jsonify({'error': '请求必须是JSON格式'}), 400
    
    data = request.json
    if not data:
        return jsonify({'error': '请求数据为空'}), 400
    
    if 'student_id' not in data:
        return jsonify({'error': '缺少必需字段: student_id'}), 400
    
    student = Student.query.get_or_404(data['student_id'])

    

    # 验证必需字段
    if 'payment_date' not in data:
        return jsonify({'error': '缺少必需字段: payment_date'}), 400
    if 'class_count' not in data:
        return jsonify({'error': '缺少必需字段: class_count'}), 400
    
    try:
        payment_date = datetime.strptime(data['payment_date'], '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return jsonify({'error': '缴费日期格式错误，应为YYYY-MM-DD格式'}), 400
    
    try:
        class_count = int(data['class_count'])
        if class_count <= 0:
            return jsonify({'error': '报课节数必须大于0'}), 400
    except (ValueError, TypeError):
        return jsonify({'error': '报课节数格式错误'}), 400

    

    # 必须提供课程ID

    course_id = data.get('course_id')

    if not course_id or course_id == '':

        return jsonify({'error': '必须指定课程'}), 400

    

    try:

        course_id = int(course_id)

        course_obj = db.session.get(Course, course_id)

        if not course_obj:

            return jsonify({'error': '课程不存在'}), 400

        course_name = course_obj.name

        # 原始费用：优先使用前端传入的 original_amount（与用户输入一致，避免浮点误差），否则用课程单价×节数
        if data.get('original_amount') is not None and data.get('original_amount') != '':
            original_amount = round(float(data['original_amount']), 2)
        else:
            original_amount = round(float(course_obj.unit_price * class_count), 2)

    except (ValueError, TypeError):

        return jsonify({'error': '课程ID格式错误'}), 400

    

    try:
        discount_rate = round(float(data.get('discount_rate', 0)), 2)
        # 允许优惠为负数，表示报更高的价格（加价）
    except (ValueError, TypeError):
        return jsonify({'error': '优惠力度格式错误'}), 400
    
    # 计算缴费金额：原始费用 - 优惠（优惠为负数时，实际是加价）
    paid_amount = round(original_amount - discount_rate, 2)
    if paid_amount < 0:
        return jsonify({'error': '缴纳费用不能为负数'}), 400
    
    unit_price = round(paid_amount / class_count, 2) if class_count > 0 else 0
    payment_type = data.get('type', '缴费')

    

    payment = Payment(

        payment_date=payment_date,

        student_id=student.id,

        student_name=student.name,

        course_id=course_id,

        course_name=course_name,

        original_amount=original_amount,

        discount_rate=discount_rate,

        paid_amount=paid_amount,

        class_count=class_count,

        unit_price=unit_price,

        remark=data.get('remark', ''),

        type=payment_type

    )

    db.session.add(payment)
    db.session.commit()
    
    log_operation('payments', 'create', 'Payment', payment.id, f"{student.name}-{course_name}")
    
    # 更新课时统计（包括剩余课时，从缴费记录重新计算，按课程）
    # 更新缴费当月的统计
    payment_month = payment_date.strftime('%Y-%m')
    update_class_hours_stats(student.id, payment_month, course_id)

    

    # 同时更新当前月份的统计（因为排课页面显示的是当前月份的剩余课时）

    current_month = get_current_month()

    if payment_month != current_month:

        update_class_hours_stats(student.id, current_month, course_id)

    

    return jsonify(payment.to_dict()), 201


@bp.route('/api/payments/<int:payment_id>', methods=['PUT'])
@csrf.exempt
@login_required
@require_permission('edit')
@handle_db_errors
@validate_json
def update_payment(payment_id):
    """更新缴费记录（仅允许修改日期、节数、原始费用、优惠、备注）"""
    payment = Payment.query.get_or_404(payment_id)
    data = request.json or {}

    try:
        if 'payment_date' in data and data['payment_date']:
            payment.payment_date = datetime.strptime(data['payment_date'], '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return jsonify({'error': '缴费日期格式错误，应为YYYY-MM-DD格式'}), 400

    try:
        if 'class_count' in data:
            class_count = int(data['class_count'])
            if class_count <= 0:
                return jsonify({'error': '报课节数必须大于0'}), 400
            payment.class_count = class_count
    except (ValueError, TypeError):
        return jsonify({'error': '报课节数格式错误'}), 400

    if 'original_amount' in data and data.get('original_amount') != '':
        try:
            payment.original_amount = round(float(data['original_amount']), 2)
        except (ValueError, TypeError):
            return jsonify({'error': '原始费用格式错误'}), 400

    try:
        discount_rate = round(float(data.get('discount_rate', payment.discount_rate or 0)), 2)
        payment.discount_rate = discount_rate
    except (ValueError, TypeError):
        return jsonify({'error': '优惠力度格式错误'}), 400

    paid_amount = round(payment.original_amount - payment.discount_rate, 2)
    if paid_amount < 0:
        return jsonify({'error': '缴纳费用不能为负数'}), 400
    payment.paid_amount = paid_amount
    payment.unit_price = round(paid_amount / payment.class_count, 2) if payment.class_count > 0 else 0

    if 'remark' in data:
        payment.remark = data['remark'] or ''

    db.session.commit()
    log_operation('payments', 'update', 'Payment', payment.id, f"{payment.student_name}-{payment.course_name or ''}")

    student_id = payment.student_id
    course_id = payment.course_id
    payment_month = payment.payment_date.strftime('%Y-%m')
    update_class_hours_stats(student_id, payment_month, course_id)
    current_month = get_current_month()
    if payment_month != current_month:
        update_class_hours_stats(student_id, current_month, course_id)

    return jsonify(payment.to_dict())


@bp.route('/api/payments/<int:payment_id>', methods=['DELETE'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('edit')
@handle_db_errors
def delete_payment(payment_id):
    """删除缴费记录（彻底删除，不是隐藏），并删除相关的排课记录（如果剩余课时 <= 0）"""
    payment = Payment.query.get_or_404(payment_id)
    
    student_id = payment.student_id
    course_id = payment.course_id
    payment_info = f"{payment.student_name}-{payment.course_name or '未知课程'}"
    
    # 保存缴费信息用于后续处理
    payment_type = payment.type
    payment_date = payment.payment_date
    
    try:
        # 彻底删除缴费记录（从数据库中删除，不是隐藏）
        print(f'开始删除缴费记录：ID={payment_id}，学生={payment_info}')
        db.session.delete(payment)
        db.session.commit()
        print(f'已彻底删除缴费记录：ID={payment_id}，学生={payment_info}')
        
        log_operation('payments', 'delete', 'Payment', payment_id, payment_info)
        
        # 如果删除的是缴费记录且有课程ID，需要删除相关排课记录
        if course_id and payment_type == '缴费':
            # 重新计算剩余课时（删除缴费记录后）
            remaining_hours = calculate_remaining_hours_from_payments(student_id, course_id)
            print(f'删除缴费记录后，学生ID: {student_id}，课程ID: {course_id}，剩余课时: {remaining_hours}')
            
            # 如果剩余课时 <= 0，删除该学生-课程组合的所有排课记录和相关历史数据（彻底删除，不是隐藏）
            if remaining_hours <= 0:
                try:
                    # 1. 查询该学生-课程的所有排课记录（包括所有状态）
                    student_courses = StudentCourse.query.filter_by(
                        student_id=student_id,
                        course_id=course_id
                    ).all()
                    
                    # 收集需要重新计算老师课时的信息
                    affected_teacher_courses = set()
                    affected_months = set()
                    
                    course_count = len(student_courses)
                    deleted_course_ids = []
                    
                    for sc in student_courses:
                        # 记录受影响的老师和课程，用于后续重新计算老师课时
                        if sc.teacher_id and sc.course_id and sc.course_date:
                            month = sc.course_date.strftime('%Y-%m')
                            affected_teacher_courses.add((sc.teacher_id, sc.course_id, month))
                            affected_months.add(month)
                        deleted_course_ids.append(sc.id)
                        # 彻底删除排课记录（不是设置状态为删除，而是从数据库中删除）
                        db.session.delete(sc)
                    
                    # 2. 删除该学生-课程的所有课时统计记录（彻底删除历史数据）
                    from backend.models import ClassHoursStats
                    stats_records = ClassHoursStats.query.filter_by(
                        student_id=student_id,
                        course_id=course_id
                    ).all()
                    
                    stats_count = len(stats_records)
                    deleted_stats_ids = []
                    for stat in stats_records:
                        deleted_stats_ids.append(stat.id)
                        # 彻底删除课时统计记录
                        db.session.delete(stat)
                    
                    # 3. 删除该学生-课程的默认排课设置记录
                    from backend.models import StudentCourseDefaultSchedule
                    default_schedules = StudentCourseDefaultSchedule.query.filter_by(
                        student_id=student_id,
                        course_id=course_id
                    ).all()
                    
                    schedule_count = len(default_schedules)
                    deleted_schedule_ids = []
                    for schedule in default_schedules:
                        deleted_schedule_ids.append(schedule.id)
                        # 彻底删除默认排课设置记录
                        db.session.delete(schedule)
                    
                    # 提交所有删除操作
                    if course_count > 0 or stats_count > 0 or schedule_count > 0:
                        db.session.commit()
                        print(f'删除缴费记录后，已彻底删除相关数据：')
                        print(f'  - {course_count} 条排课记录（排课ID: {deleted_course_ids[:10]}）')
                        print(f'  - {stats_count} 条课时统计记录（统计ID: {deleted_stats_ids[:10]}）')
                        print(f'  - {schedule_count} 条默认排课设置记录（设置ID: {deleted_schedule_ids[:10]}）')
                        print(f'  学生ID: {student_id}，课程ID: {course_id}')
                        
                        # 重新计算受影响老师的课时
                        for teacher_id, course_id_for_teacher, month in affected_teacher_courses:
                            try:
                                update_teacher_hours(teacher_id, month=month, course_id=course_id_for_teacher)
                            except Exception as e:
                                from flask import current_app
                                current_app.logger.warning(f'更新老师课时失败 (teacher_id={teacher_id}, course_id={course_id_for_teacher}, month={month}): {e}')
                        
                        # 重新计算受影响月份的财务记录
                        current_month = get_current_month()
                        if current_month:
                            affected_months.add(current_month)
                        
                        for month in affected_months:
                            try:
                                update_finance_record(month)
                                print(f'已重新计算财务记录（月份: {month}）')
                            except Exception as e:
                                from flask import current_app
                                current_app.logger.warning(f'更新财务记录失败 (month={month}): {e}')
                except Exception as e:
                    # 如果删除相关数据失败，记录错误但不影响缴费记录的删除
                    import traceback
                    error_msg = f'删除相关数据失败: {str(e)}\n{traceback.format_exc()}'
                    print(error_msg)
                    from flask import current_app
                    current_app.logger.warning(f'删除相关数据失败 (student_id={student_id}, course_id={course_id}): {e}')
        
        # 更新课时统计（包括剩余课时，从缴费记录重新计算，按课程）
        if course_id:
            payment_month = payment_date.strftime('%Y-%m') if payment_date else get_current_month()
            # 更新缴费当月的统计
            update_class_hours_stats(student_id, payment_month, course_id)
            
            # 同时更新当前月份的统计（因为排课页面显示的是当前月份的剩余课时）
            current_month = get_current_month()
            if payment_month != current_month:
                update_class_hours_stats(student_id, current_month, course_id)
        
        return jsonify({'message': '删除成功'})
    
    except Exception as e:
        db.session.rollback()
        import traceback
        error_msg = f'删除缴费记录失败: {str(e)}\n{traceback.format_exc()}'
        print(error_msg)
        return jsonify({'error': f'删除缴费记录失败: {str(e)}'}), 500






