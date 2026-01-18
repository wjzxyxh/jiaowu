"""
Pages路由模块
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

bp = Blueprint('pages', __name__)

@bp.route('/')
def index():

    """首页"""

    return render_template('index.html')






@bp.route('/students')
def students_page():

    """学生管理页面"""

    return render_template('students.html')






@bp.route('/teachers')
def teachers_page():

    """教师管理页面"""

    return render_template('teachers.html')






@bp.route('/courses')
def courses_page():

    """排课管理页面"""

    return render_template('courses.html')






@bp.route('/all_courses')
def all_courses_page():

    """全部排课页面"""

    return render_template('all_courses.html')






@bp.route('/payments')
def payments_page():

    """缴费管理页面"""

    return render_template('payments.html')






@bp.route('/stats')
def stats_page():

    """课时统计页面"""

    return render_template('stats.html')






@bp.route('/finance')
def finance_page():

    """财务统计页面"""

    return render_template('finance.html')






@bp.route('/courses_manage')
def courses_manage_page():

    """课程管理页面"""

    return render_template('courses_manage.html')






@bp.route('/teacher_hours')
def teacher_hours_page():

    """老师课时页面"""

    return render_template('teacher_hours.html')






@bp.route('/others_manage')
def others_manage_page():

    """其它管理页面"""

    return render_template('others_manage.html')






@bp.route('/calendar')
def calendar_page():

    """日历视图页面"""

    return render_template('calendar.html')


@bp.route('/student_courses')
def student_courses_page():

    """学生课程页面"""

    return render_template('student_courses.html')





# ==================== 课程管理 API ====================




