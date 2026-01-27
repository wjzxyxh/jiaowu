"""
Stats路由模块
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

bp = Blueprint('stats', __name__)

@bp.route('/api/stats', methods=['GET'])
def get_stats():

    """获取课时统计（按课程）"""

    month = request.args.get('month', get_current_month())

    student_id = request.args.get('student_id')

    course_id = request.args.get('course_id')  # 可选：按课程筛选

    

    # 构建查询（只查询存在学生的课时统计，过滤已删除的学生）
    query = ClassHoursStats.query.join(Student, ClassHoursStats.student_id == Student.id).filter(ClassHoursStats.month == month)

    if student_id:

        query = query.filter(ClassHoursStats.student_id == student_id)

    if course_id:

        query = query.filter(ClassHoursStats.course_id == course_id)

    

    stats_list = query.all()

    

    # 获取每个学生-课程组合的当月上课日期和时段

    year, month_num = map(int, month.split('-'))

    start_date = date(year, month_num, 1)

    end_date = date(year, month_num, calendar.monthrange(year, month_num)[1])

    

    result = []

    for stat in stats_list:

        stat_dict = stat.to_dict()

        

        # 查询该学生该课程当月的排课记录，并加载课程关联

        # 只查询已确认的课程，未确认的课程不显示在上课日期和时段中
        # 过滤已删除的学生（虽然stat已经过滤了，但这里再次确保）
        courses = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).options(

            db.joinedload(StudentCourse.course)

        ).filter(

            StudentCourse.student_id == stat.student_id,

            StudentCourse.course_id == stat.course_id,

            StudentCourse.course_date >= start_date,

            StudentCourse.course_date <= end_date,

            StudentCourse.status != '删除',

            StudentCourse.is_confirmed == True  # 只显示已确认的课程

        ).order_by(StudentCourse.course_date, StudentCourse.time_slot).all()

        

        # 构建上课日期和时段的列表，按老师分组

        # 格式：老师姓名:日期(星期) 时段;日期(星期) 时段;

        from collections import defaultdict

        teacher_groups = defaultdict(list)

        

        for course in courses:

            if course.status == '正常':  # 只显示正常状态的课程

                date_str = course.course_date.strftime('%Y-%m-%d')

                weekday_str = course.weekday or ''

                time_slot_str = course.time_slot or ''

                

                # 创建分组键：老师姓名

                group_key = course.teacher_name

                

                # 构建日期时段字符串

                detail = f"{date_str}({weekday_str})"

                if time_slot_str:

                    detail += f" {time_slot_str}"

                detail += ";"  # 添加分号分隔符

                

                teacher_groups[group_key].append(detail)

        

        # 将分组后的数据格式化为字符串列表

        course_details = []

        for group_key, details in teacher_groups.items():

            # 格式：老师姓名:日期(星期) 时段;日期(星期) 时段;

            formatted_detail = f"{group_key}:{''.join(details)}"

            course_details.append(formatted_detail)

        

        stat_dict['course_details'] = course_details

        result.append(stat_dict)

    

    return jsonify(result)






