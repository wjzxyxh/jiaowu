"""
Calendar路由模块
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

bp = Blueprint('calendar', __name__)

@bp.route('/api/calendar/courses', methods=['GET'])
def get_calendar_courses():
    """获取日历视图的课程数据"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        teacher_id = request.args.get('teacher_id', type=int)
        student_id = request.args.get('student_id', type=int)
        classroom = request.args.get('classroom')

        # 只查询存在学生的排课记录（过滤已删除的学生）
        from backend.models import Student
        query = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id)

        if start_date:
            query = query.filter(StudentCourse.course_date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            query = query.filter(StudentCourse.course_date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        if teacher_id:
            query = query.filter(StudentCourse.teacher_id == teacher_id)
        if student_id:
            query = query.filter(StudentCourse.student_id == student_id)
        if classroom:
            query = query.filter(StudentCourse.classroom == classroom)

        # 过滤掉已删除的排课记录；营销模块排课为独立排课，不显示在其它地方
        query = query.filter(StudentCourse.status != '删除', StudentCourse.marketing_lead_id.is_(None))

        courses = query.order_by(StudentCourse.course_date, StudentCourse.time_slot).all()

        # 清理不在 /students 页面中的学生的排课记录
        try:
            from backend.routes.students import get_valid_student_ids_for_management_page
            valid_student_ids = get_valid_student_ids_for_management_page()
            
            invalid_courses = []
            for c in courses:
                # 如果学生不在 /students 页面中，则标记为删除
                # 注意：删除所有不在 /students 页面中的学生的排课记录，无论是否确认（is_confirmed）
                if c.student_id and c.student_id not in valid_student_ids:
                    invalid_courses.append(c)
            
            # 彻底删除这些无效的排课记录
            if invalid_courses:
                for c in invalid_courses:
                    db.session.delete(c)
                db.session.commit()
                print(f"[DEBUG] /api/calendar/courses API: 删除了 {len(invalid_courses)} 条不在 /students 页面中的学生的排课记录")
                # 从结果中移除已删除的记录
                courses = [c for c in courses if c not in invalid_courses]
        except Exception as cleanup_error:
            import traceback
            print(f"[WARN] /api/calendar/courses API 清理逻辑出错（不影响查询）: {str(cleanup_error)}\n{traceback.format_exc()}")
            db.session.rollback()

        events = []
        for course in courses:
            events.append({
                'id': course.id,
                'title': f'{course.student_name} - {course.subject}',
                'start': course.course_date.strftime('%Y-%m-%d'),
                'time_slot': course.time_slot,
                'classroom': course.classroom,
                'teacher_name': course.teacher_name,
                'student_name': course.student_name,
                'status': course.status,
                'is_confirmed': course.is_confirmed if course.is_confirmed is not None else False
            })

        return jsonify(events)
    except Exception as e:
        import traceback
        error_msg = f"获取日历数据失败: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({'error': error_msg}), 500
