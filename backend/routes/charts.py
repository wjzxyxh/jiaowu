"""
Charts路由模块
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

bp = Blueprint('charts', __name__)

@bp.route('/api/charts/revenue-trend', methods=['GET'])
def get_revenue_trend():

    """获取收入趋势数据"""

    year = request.args.get('year', datetime.now().year)

    records = FinanceRecord.query.filter(FinanceRecord.month.like(f'{year}%')).order_by(FinanceRecord.month).all()

    

    data = {

        'months': [r.month for r in records],

        'revenue': [r.monthly_revenue for r in records],

        'profit': [r.monthly_profit for r in records]

    }

    return jsonify(data)




@bp.route('/api/charts/cost-analysis', methods=['GET'])
def get_cost_analysis():

    """获取成本分析数据"""

    month = request.args.get('month', get_current_month())

    record = FinanceRecord.query.filter_by(month=month).first()

    

    if not record:

        return jsonify({

            'teacher_cost': 0,

            'marketing_cost': 0,

            'rent_utilities': 0,

            'other_cost': 0

        })

    

    data = {

        'teacher_cost': record.teacher_cost,

        'marketing_cost': record.marketing_cost,

        'rent_utilities': record.rent_utilities,

        'other_cost': record.other_cost

    }

    return jsonify(data)




@bp.route('/api/charts/student-hours-distribution', methods=['GET'])
def get_student_hours_distribution():

    """获取学生课时分布数据"""

    month = request.args.get('month', get_current_month())

    stats = ClassHoursStats.query.filter_by(month=month).all()

    

    # 按剩余课时分组统计

    distribution = {}

    for stat in stats:

        hours_range = ''

        if stat.remaining_hours < 0:

            hours_range = '不足'

        elif stat.remaining_hours < 5:

            hours_range = '0-5'

        elif stat.remaining_hours < 10:

            hours_range = '5-10'

        elif stat.remaining_hours < 20:

            hours_range = '10-20'

        else:

            hours_range = '20+'

        

        distribution[hours_range] = distribution.get(hours_range, 0) + 1

    

    return jsonify(distribution)




@bp.route('/api/charts/teacher-hours', methods=['GET'])
def get_teacher_hours_chart():

    """获取教师课时统计图表数据"""

    month = request.args.get('month', get_current_month())

    hours = TeacherHours.query.filter_by(month=month).all()

    

    # 按教师分组统计

    teacher_data = {}

    for hour in hours:

        if hour.teacher_name not in teacher_data:

            teacher_data[hour.teacher_name] = 0

        teacher_data[hour.teacher_name] += hour.total_hours

    

    data = {

        'teachers': list(teacher_data.keys()),

        'hours': list(teacher_data.values())

    }

    return jsonify(data)




@bp.route('/api/charts/payment-trend', methods=['GET'])
def get_payment_trend():

    """获取缴费趋势数据"""

    year = request.args.get('year', datetime.now().year)

    

    # 按月统计缴费

    payments = Payment.query.filter(

        Payment.payment_date >= date(int(year), 1, 1),

        Payment.payment_date < date(int(year) + 1, 1, 1)

    ).all()

    

    monthly_data = {}

    for payment in payments:

        month = payment.payment_date.strftime('%Y-%m')

        if month not in monthly_data:

            monthly_data[month] = {'paid': 0, 'refund': 0}

        

        if payment.type == '缴费':

            monthly_data[month]['paid'] += payment.paid_amount

        else:

            monthly_data[month]['refund'] += payment.paid_amount

    

    months = sorted(monthly_data.keys())

    data = {

        'months': months,

        'paid': [monthly_data[m]['paid'] for m in months],

        'refund': [monthly_data[m]['refund'] for m in months]

    }

    return jsonify(data)






