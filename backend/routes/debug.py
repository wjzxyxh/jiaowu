"""
Debug路由模块
从app_old.py提取
"""
from flask import Blueprint, request, jsonify, render_template, send_from_directory, Response
from flask_login import login_required, current_user
from backend.extensions import db, limiter
from backend.models import (
    Student, Teacher, Course, StudentCourse, ClassHoursStats, Payment, 
    TeacherHours, FinanceRecord, TimeSlot, Classroom, FinanceConfig,
    TeacherCourseCost, TeacherCourseCostHistory, TeacherExperienceCost,
    TeacherExperienceCostHistory, TeacherResume, User, LoginLog, 
    OperationLog, Notification
)
from backend.utils import (
    allowed_file, get_original_filename, get_safe_storage_filename,
    get_client_ip, log_operation, require_permission, get_current_month,
    get_weekday, check_course_conflicts
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

bp = Blueprint('debug', __name__)

@bp.route('/api/debug/student-price/<student_name>', methods=['GET'])
def debug_student_price(student_name):

    """调试接口：查看学生的缴费记录和单价计算"""

    month = request.args.get('month', get_current_month())

    

    # 查找学生

    student = Student.query.filter_by(name=student_name).first()

    if not student:

        return jsonify({'error': f'找不到学生：{student_name}'}), 404

    

    # 获取当月课时统计

    stats = ClassHoursStats.query.filter_by(student_id=student.id, month=month).first()

    consumed_hours = stats.actual_hours if stats else 0

    

    # 获取所有缴费记录（不限制日期，查看所有记录）

    year, month_num = map(int, month.split('-'))

    month_start = date(year, month_num, 1)

    month_end = date(year, month_num, calendar.monthrange(year, month_num)[1])

    

    # 先查询所有缴费记录（不限制日期）

    all_payments_unfiltered = Payment.query.filter(

        Payment.student_id == student.id

    ).order_by(

        Payment.payment_date.asc(),

        Payment.id.asc()

    ).all()

    

    # 然后筛选出当月及之前的记录

    all_payments = [p for p in all_payments_unfiltered if p.payment_date <= month_end]

    

    # 获取上个月剩余课时

    if month_num == 1:

        last_month = f"{year-1}-12"

    else:

        last_month = f"{year}-{month_num-1:02d}"

    last_stats = ClassHoursStats.query.filter_by(student_id=student.id, month=last_month).first()

    remaining_hours_at_start = last_stats.current_month_total if last_stats else 0

    

    # 计算实际单价

    actual_unit_price, detail_list = calculate_actual_unit_price(

        student.id,

        consumed_hours,

        month

    )

    

    return jsonify({

        'student_name': student_name,

        'student_id': student.id,

        'month': month,

        'month_start': month_start.strftime('%Y-%m-%d'),

        'month_end': month_end.strftime('%Y-%m-%d'),

        'consumed_hours': consumed_hours,

        'remaining_hours_at_start': remaining_hours_at_start,

        'actual_unit_price': actual_unit_price,

        'total_revenue': round(consumed_hours * actual_unit_price, 2),

        'all_payments_count': len(all_payments_unfiltered),

        'all_payments_filtered_count': len(all_payments),

        'all_payments_unfiltered': [{

            'id': p.id,

            'payment_date': p.payment_date.strftime('%Y-%m-%d') if p.payment_date else '',

            'type': p.type,

            'class_count': p.class_count,

            'unit_price': p.unit_price,

            'paid_amount': p.paid_amount,

            'is_before_month': p.payment_date < month_start if p.payment_date else False,

            'is_in_month': p.payment_date >= month_start and p.payment_date <= month_end if p.payment_date else False,

            'is_after_month': p.payment_date > month_end if p.payment_date else False

        } for p in all_payments_unfiltered],

        'all_payments': [{

            'id': p.id,

            'payment_date': p.payment_date.strftime('%Y-%m-%d') if p.payment_date else '',

            'type': p.type,

            'class_count': p.class_count,

            'unit_price': p.unit_price,

            'paid_amount': p.paid_amount,

            'is_before_month': p.payment_date < month_start if p.payment_date else False,

            'is_in_month': p.payment_date >= month_start and p.payment_date <= month_end if p.payment_date else False

        } for p in all_payments],

        'price_detail': detail_list

    })






