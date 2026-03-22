"""
Notifications路由模块
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

bp = Blueprint('notifications', __name__)

@bp.route('/api/notifications', methods=['GET'])
def get_notifications():

    """获取通知列表"""

    try:

        is_read = request.args.get('is_read')

        notification_type = request.args.get('type')

        

        query = Notification.query.filter(

            (Notification.user_id == None) | (Notification.user_id == current_user.id)

        )

        

        if is_read is not None:

            query = query.filter_by(is_read=is_read == 'true')

        if notification_type:

            query = query.filter_by(type=notification_type)

        

        notifications = query.order_by(Notification.created_at.desc()).limit(50).all()

        

        return jsonify([n.to_dict() for n in notifications]), 200

    except Exception as e:

        return jsonify({'error': f'获取通知失败: {str(e)}'}), 500




@bp.route('/api/notifications/unread-count', methods=['GET'])
def get_unread_notification_count():

    """获取未读通知数量"""

    try:

        count = Notification.query.filter(

            ((Notification.user_id == None) | (Notification.user_id == current_user.id)),

            Notification.is_read == False

        ).count()

        return jsonify({'count': count}), 200

    except Exception as e:

        return jsonify({'error': f'获取未读通知数量失败: {str(e)}'}), 500




@bp.route('/api/notifications/<int:notification_id>/read', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def mark_notification_read(notification_id):

    """标记通知为已读"""

    try:

        notification = Notification.query.get_or_404(notification_id)

        if notification.user_id and notification.user_id != current_user.id:

            return jsonify({'error': '无权操作'}), 403

        

        notification.is_read = True

        db.session.commit()

        return jsonify({'success': True}), 200

    except Exception as e:

        db.session.rollback()

        return jsonify({'error': f'标记通知失败: {str(e)}'}), 500




@bp.route('/api/notifications/mark-all-read', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def mark_all_notifications_read():

    """标记所有通知为已读"""

    try:

        Notification.query.filter(

            ((Notification.user_id == None) | (Notification.user_id == current_user.id)),

            Notification.is_read == False

        ).update({'is_read': True})

        db.session.commit()

        return jsonify({'success': True}), 200

    except Exception as e:

        db.session.rollback()

        return jsonify({'error': f'标记所有通知失败: {str(e)}'}), 500






