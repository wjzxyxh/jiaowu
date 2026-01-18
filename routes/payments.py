"""
Payments路由模块
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
    get_weekday, check_course_conflicts, handle_db_errors, validate_json
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

    

    query = Payment.query

    if student_id:

        query = query.filter_by(student_id=student_id)

    if payment_type:

        query = query.filter_by(type=payment_type)

    

    # 日期筛选逻辑（月份筛选优先级高于年份筛选）：

    # 1. 如果 month 参数存在且不为空，使用月份筛选

    # 2. 如果 month 不存在，但 year 参数存在且不为空字符串，使用年度筛选

    # 3. 如果 year 参数为空字符串（用户选择了"全部年份"），不添加年度筛选，显示所有年份

    # 4. 如果既没有年度也没有月份，且没有学生筛选，默认使用当前年份

    if month and month.strip():

        # 月份筛选（优先级最高）

        year_val, month_num = map(int, month.split('-'))

        start_date = date(year_val, month_num, 1)

        end_date = date(year_val, month_num, calendar.monthrange(year_val, month_num)[1])

        query = query.filter(Payment.payment_date >= start_date, Payment.payment_date <= end_date)

    elif year is not None:

        # year 参数存在（可能是空字符串或有效值）

        if year and year.strip():  # 不是空字符串，使用年度筛选

            year_int = int(year)

            start_date = date(year_int, 1, 1)

            end_date = date(year_int, 12, 31)

            query = query.filter(Payment.payment_date >= start_date, Payment.payment_date <= end_date)

        # 如果 year 是空字符串，不添加筛选，显示所有年份

    elif not student_id:

        # 如果既没有年度也没有月份，且没有学生筛选，默认使用当前年份

        # 注意：这种情况是 year 参数不存在（初始状态），不是用户选择了"全部年份"

        current_year = datetime.now().year

        start_date = date(current_year, 1, 1)

        end_date = date(current_year, 12, 31)

        query = query.filter(Payment.payment_date >= start_date, Payment.payment_date <= end_date)

    

    payments = query.order_by(Payment.payment_date.desc()).all()

    

    # 为每条缴费记录计算剩余课时和剩余费用

    # 需要按照FIFO原则，计算每个缴费记录还剩余多少课时

    # 重要：按学生和课程分组处理，确保同一学生不同课程的课时独立计算

    result = []

    

    # 按学生和课程分组处理

    student_course_payments = {}

    for payment in payments:

        student_id = payment.student_id

        course_id = payment.course_id  # 可能为None，需要处理

        # 使用 (student_id, course_id) 作为分组键

        key = (student_id, course_id)

        if key not in student_course_payments:

            student_course_payments[key] = []

        student_course_payments[key].append(payment)

    

    for (student_id, course_id), payment_list in student_course_payments.items():

        # 获取该学生该课程的所有缴费记录（按时间顺序，从早到晚）

        if course_id:

            all_payments = Payment.query.filter_by(

                student_id=student_id,

                course_id=course_id

            ).order_by(

                Payment.payment_date.asc(),

                Payment.id.asc()

            ).all()

        else:

            # 如果course_id为None，只按student_id查询（兼容旧数据）

            all_payments = Payment.query.filter_by(

                student_id=student_id

            ).filter(Payment.course_id.is_(None)).order_by(

                Payment.payment_date.asc(),

                Payment.id.asc()

            ).all()

        

        # 获取当前月份的剩余课时（按课程）

        current_month = get_current_month()

        if course_id:

            current_stats = ClassHoursStats.query.filter_by(

                student_id=student_id,

                course_id=course_id,

                month=current_month

            ).first()

        else:

            # 如果course_id为None，尝试查找（可能找不到）

            current_stats = None

        total_remaining_hours = current_stats.remaining_hours if current_stats else 0

        

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

        

        # 第二遍：处理负数情况，用后续缴费补足

        # 如果某个缴费记录的剩余课时为负数，需要用后续缴费补足

        negative_deficit = 0  # 累计负数缺口

        for stack in payment_stacks:

            payment_id = stack['payment'].id

            remaining_hours = payment_remaining_map.get(payment_id, 0)

            

            if remaining_hours < 0:

                # 这个缴费记录的课时已经被消耗完，还有负数缺口

                negative_deficit += abs(remaining_hours)

                payment_remaining_map[payment_id] = 0  # 补足后设为0

                payment_status_map[payment_id] = '结束'

            elif negative_deficit > 0 and remaining_hours > 0:

                # 有负数缺口，用这个缴费记录的课时补足

                if remaining_hours >= negative_deficit:

                    # 这个缴费记录可以完全补足缺口

                    payment_remaining_map[payment_id] = remaining_hours - negative_deficit

                    negative_deficit = 0

                    # 如果补足后剩余课时为0，标记为结束

                    if payment_remaining_map[payment_id] == 0:

                        payment_status_map[payment_id] = '结束'

                else:

                    # 这个缴费记录只能部分补足缺口

                    negative_deficit -= remaining_hours

                    payment_remaining_map[payment_id] = 0

                    payment_status_map[payment_id] = '结束'

        

        # 为每条缴费记录设置剩余课时和剩余费用

        # 注意：剩余课时显示的是每个缴费记录的剩余课时，已消耗完的显示为0

        for payment in payment_list:

            payment_dict = payment.to_dict()

            

            if payment.type == '缴费':

                # 缴费记录：计算该缴费记录的剩余课时（基于FIFO）

                payment_remaining_hours = payment_remaining_map.get(payment.id, 0)

                status = payment_status_map.get(payment.id, '进行中')

                

                # 确保剩余课时不为负数（已经用后续缴费补足）

                payment_remaining_hours = max(0, payment_remaining_hours)

                

                # 如果剩余课时为0，标记为结束

                if payment_remaining_hours == 0:

                    status = '结束'

                

                # 计算剩余费用（基于该缴费记录的剩余课时）

                unit_price = payment.unit_price if payment.unit_price else 0.0

                if unit_price == 0:

                    # 如果没有单价，尝试获取最近一次该课程的缴费的单价

                    if course_id:

                        latest_payment = Payment.query.filter_by(

                            student_id=payment.student_id,

                            course_id=course_id,

                            type='缴费'

                        ).order_by(Payment.payment_date.desc()).first()

                    else:

                        latest_payment = Payment.query.filter_by(

                            student_id=payment.student_id,

                            type='缴费'

                        ).filter(Payment.course_id.is_(None)).order_by(Payment.payment_date.desc()).first()

                    if latest_payment and latest_payment.unit_price:

                        unit_price = latest_payment.unit_price

                

                remaining_cost = payment_remaining_hours * unit_price

                

                payment_dict['status'] = status

                # 使用该缴费记录的剩余课时（已消耗完的显示为0）

                payment_dict['remaining_hours'] = round(payment_remaining_hours, 2)

                payment_dict['remaining_cost'] = round(remaining_cost, 2)

            else:

                # 退费记录：剩余课时和剩余费用为0，状态为结束

                payment_dict['status'] = '结束'

                payment_dict['remaining_hours'] = 0

                payment_dict['remaining_cost'] = 0

            

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

        # 使用课程单价计算原始费用

        original_amount = course_obj.unit_price * class_count

    except (ValueError, TypeError):

        return jsonify({'error': '课程ID格式错误'}), 400

    

    try:
        discount_rate = float(data.get('discount_rate', 0))
        if discount_rate < 0:
            return jsonify({'error': '优惠力度不能为负数'}), 400
    except (ValueError, TypeError):
        return jsonify({'error': '优惠力度格式错误'}), 400
    
    paid_amount = original_amount - discount_rate
    if paid_amount < 0:
        return jsonify({'error': '缴纳费用不能为负数'}), 400
    
    unit_price = paid_amount / class_count if class_count > 0 else 0
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






@bp.route('/api/payments/<int:payment_id>', methods=['DELETE'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('edit')
@handle_db_errors
def delete_payment(payment_id):
    """删除缴费记录"""
    payment = Payment.query.get_or_404(payment_id)
    
    student_id = payment.student_id
    course_id = payment.course_id
    payment_info = f"{payment.student_name}-{payment.course_name or '未知课程'}"
    
    db.session.delete(payment)
    db.session.commit()
    
    log_operation('payments', 'delete', 'Payment', payment_id, payment_info)
    
    # 更新课时统计（包括剩余课时，从缴费记录重新计算，按课程）
    if course_id:
        payment_month = payment.payment_date.strftime('%Y-%m') if payment.payment_date else get_current_month()
        # 更新缴费当月的统计
        update_class_hours_stats(student_id, payment_month, course_id)
        
        # 同时更新当前月份的统计（因为排课页面显示的是当前月份的剩余课时）
        current_month = get_current_month()
        if payment_month != current_month:
            update_class_hours_stats(student_id, current_month, course_id)
    
    return jsonify({'message': '删除成功'})






