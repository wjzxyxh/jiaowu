"""
Courses Manage路由模块
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

bp = Blueprint('courses_manage', __name__)

@bp.route('/api/courses_manage', methods=['GET'])
def get_courses_manage():

    """获取所有课程"""

    status = request.args.get('status', '')

    courses = Course.query.all()

    if status:

        courses = [c for c in courses if c.status == status]

    return jsonify([c.to_dict() for c in courses])






@bp.route('/api/courses_manage/names', methods=['GET'])
def get_course_names():

    """获取所有课程名称列表"""

    courses = Course.query.filter_by(status='启用').all()

    course_names = [c.name for c in courses if c.name]

    return jsonify(course_names)






@bp.route('/api/courses_manage/subjects', methods=['GET'])
def get_course_subjects():

    """获取所有科目列表（去重）"""

    courses = Course.query.filter_by(status='启用').all()

    # 获取所有科目并去重

    subjects = list(set([c.subject for c in courses if c.subject]))

    subjects.sort()  # 排序以便显示

    return jsonify(subjects)






@bp.route('/api/courses_manage', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def create_course_manage():

    """创建课程"""

    data = request.json

    course = Course(

        name=data['name'],

        subject=data['subject'],

        unit_price=float(data['unit_price']),

        description=data.get('description', ''),

        status=data.get('status', '启用')

    )

    db.session.add(course)

    db.session.commit()

    return jsonify(course.to_dict()), 201






@bp.route('/api/courses_manage/<int:course_id>', methods=['PUT'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def update_course_manage(course_id):

    """更新课程"""

    try:
        course = Course.query.get_or_404(course_id)

        data = request.json
        if not data:
            return jsonify({'error': '请求数据为空'}), 400

        course.name = data.get('name', course.name)
        course.subject = data.get('subject', course.subject)
        course.unit_price = float(data.get('unit_price', course.unit_price))
        course.description = data.get('description', course.description)
        course.status = data.get('status', course.status)

        db.session.commit()

        return jsonify(course.to_dict())
    except Exception as e:
        db.session.rollback()
        import traceback
        error_trace = traceback.format_exc()
        print(f"更新课程错误: {str(e)}")
        print(f"错误堆栈: {error_trace}")
        return jsonify({'error': f'更新课程失败: {str(e)}'}), 500






@bp.route('/api/courses_manage/<int:course_id>', methods=['DELETE'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def delete_course_manage(course_id):

    """删除课程"""

    try:
        course = Course.query.get_or_404(course_id)

        # 检查是否有关联的课程成本记录
        cost_count = TeacherCourseCost.query.filter_by(course_id=course_id).count()
        if cost_count > 0:
            return jsonify({'error': f'该课程下有 {cost_count} 条课程成本记录，请先删除相关成本记录'}), 400

        # 检查是否有关联的排课记录
        schedule_count = StudentCourse.query.filter_by(course_id=course_id).count()
        if schedule_count > 0:
            return jsonify({'error': f'该课程下有 {schedule_count} 条排课记录，无法删除'}), 400

        # 检查是否有关联的经验成本记录
        exp_count = TeacherExperienceCost.query.filter_by(course_id=course_id).count()
        if exp_count > 0:
            return jsonify({'error': f'该课程下有 {exp_count} 条经验成本记录，请先删除相关记录'}), 400

        db.session.delete(course)
        db.session.commit()

        return jsonify({'message': '删除成功'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'删除失败: {str(e)}'}), 500






@bp.route('/api/courses_manage/reset', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def reset_courses_manage():

    """重置课程为默认数据"""

    try:

        init_default_courses(force_reset=True)

        return jsonify({'message': '课程数据已重置为默认数据'})

    except Exception as e:

        return jsonify({'error': str(e)}), 500






