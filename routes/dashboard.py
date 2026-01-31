"""
Dashboard路由模块
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

bp = Blueprint('dashboard', __name__)

@bp.route('/api/dashboard/stats', methods=['GET'])
# @limiter.limit("500 per minute")  # 限流已禁用
def get_dashboard_stats():

    """获取首页统计数据"""

    try:

        today = date.today()

        current_month = today.strftime('%Y-%m')

        

        # 检查并创建通知

        check_and_create_notifications()

        

        # 获取财务记录

        finance_record = FinanceRecord.query.filter_by(month=current_month).first()

        

        stats = {

            'total_students': Student.query.filter_by(status='在校').count(),

            'total_teachers': Teacher.query.filter_by(status='启用').count(),

            'monthly_revenue': finance_record.monthly_revenue if finance_record else 0,

            'monthly_profit': finance_record.monthly_profit if finance_record else 0,

            'unconfirmed_courses': StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).filter(

                StudentCourse.is_confirmed == False,

                StudentCourse.status == '正常',

                StudentCourse.course_date >= today,

                StudentCourse.marketing_lead_id.is_(None)

            ).count(),

            'low_hours_students': ClassHoursStats.query.join(Student, ClassHoursStats.student_id == Student.id).filter(

                ClassHoursStats.remaining_hours < FinanceConfig.query.filter_by(key='min_hours_for_reminder').first().value if FinanceConfig.query.filter_by(key='min_hours_for_reminder').first() else 0,

                ClassHoursStats.remaining_hours >= 0,

                Student.status == '在校'

            ).count() if FinanceConfig.query.filter_by(key='min_hours_for_reminder').first() else 0,

            'today_courses': StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).filter(

                StudentCourse.course_date == today,

                StudentCourse.status == '正常',

                StudentCourse.marketing_lead_id.is_(None)

            ).count(),

            'tomorrow_courses': StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).filter(

                StudentCourse.course_date == today + timedelta(days=1),

                StudentCourse.status == '正常',

                StudentCourse.marketing_lead_id.is_(None)

            ).count(),

        }

        

        return jsonify(stats), 200

    except Exception as e:

        import traceback

        error_trace = traceback.format_exc()

        print(f"获取首页统计错误: {str(e)}")

        print(f"错误堆栈: {error_trace}")

        return jsonify({'error': f'获取统计数据失败: {str(e)}'}), 500






