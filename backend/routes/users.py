"""
Users路由模块
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
    OperationLog, Notification, UserPermission
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

bp = Blueprint('users', __name__)

@bp.route('/api/users', methods=['GET'])
@login_required
@require_permission('admin')
def get_users():
    """获取用户列表（仅管理员）"""
    users = User.query.all()
    return jsonify([user.to_dict() for user in users]), 200




@bp.route('/api/users', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('admin')
def create_user():

    """创建用户"""

    try:

        data = request.json

        if not data:

            return jsonify({'error': '请求数据为空'}), 400

        

        username = data.get('username', '').strip()

        password = data.get('password', '')

        role = data.get('role', 'user')

        real_name = data.get('real_name', '').strip()

        

        if not username or not password:

            return jsonify({'error': '用户名和密码不能为空'}), 400

        # 验证密码长度（bcrypt限制72字节）
        if len(password.encode('utf-8')) > 72:
            return jsonify({'error': '密码长度不能超过72个字符（UTF-8编码）'}), 400
        
        # 禁止创建管理员角色
        if role == 'admin':
            return jsonify({'error': '不能创建管理员角色，管理员只能通过数据库直接创建'}), 400

        if User.query.filter_by(username=username).first():

            return jsonify({'error': '用户名已存在'}), 400

        

        user = User(

            username=username,

            role=role,

            real_name=real_name,

            is_active=True

        )

        user.set_password(password)

        db.session.add(user)

        db.session.commit()

        

        log_operation('users', 'create', 'User', user.id, username)

        return jsonify(user.to_dict()), 201

    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        error_msg = str(e)
        # 如果是密码长度错误，提供更友好的提示
        if '72 bytes' in error_msg.lower() or 'password cannot be longer' in error_msg.lower():
            return jsonify({'error': '密码长度不能超过72个字符（UTF-8编码）。密码已自动截断，请使用较短的密码。'}), 400
        return jsonify({'error': f'创建用户失败: {error_msg}'}), 500




@bp.route('/api/users/<int:user_id>', methods=['PUT'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('admin')
def update_user(user_id):

    """更新用户"""

    try:

        user = User.query.get_or_404(user_id)

        old_data = user.to_dict()

        

        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            data = {}

        if 'password' in data and data['password']:
            # 验证密码长度（bcrypt限制72字节）
            password = data['password']
            if len(password.encode('utf-8')) > 72:
                return jsonify({'error': '密码长度不能超过72个字符（UTF-8编码）'}), 400
            user.set_password(password)

        if 'role' in data:
            # 禁止将用户角色修改为管理员
            if data['role'] == 'admin':
                return jsonify({'error': '不能将用户角色修改为管理员'}), 400
            user.role = data['role']

        if 'real_name' in data:

            user.real_name = data.get('real_name', '').strip()

        if 'is_active' in data:
            raw_active = data['is_active']
            if isinstance(raw_active, bool):
                new_active = raw_active
            elif isinstance(raw_active, str):
                new_active = raw_active.strip().lower() in ('1', 'true', 'yes', '启用')
            else:
                new_active = bool(raw_active)
            if user.role == 'admin' and not new_active:
                return jsonify({'error': '不能停用系统管理员账号'}), 400
            user.is_active = new_active

        

        db.session.commit()

        

        new_data = user.to_dict()

        log_operation('users', 'update', 'User', user.id, user.username, old_data, new_data)

        return jsonify(user.to_dict()), 200

    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        error_msg = str(e)
        # 如果是密码长度错误，提供更友好的提示
        if '72 bytes' in error_msg.lower() or 'password cannot be longer' in error_msg.lower():
            return jsonify({'error': '密码长度不能超过72个字符（UTF-8编码）。密码已自动截断，请使用较短的密码。'}), 400
        return jsonify({'error': f'更新用户失败: {error_msg}'}), 500




@bp.route('/api/users/profile', methods=['PUT'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def update_profile():
    """更新当前用户个人信息（密码、真实姓名）"""
    try:
        user = current_user
        
        old_data = user.to_dict()
        data = request.json
        
        # 只能修改密码和真实姓名，不能修改角色、状态等
        if 'password' in data and data['password']:
            # 验证密码长度（bcrypt限制72字节）
            password = data['password']
            if len(password.encode('utf-8')) > 72:
                return jsonify({'error': '密码长度不能超过72个字符（UTF-8编码）'}), 400
            user.set_password(password)
        
        if 'real_name' in data:
            user.real_name = data.get('real_name', '').strip()
        
        db.session.commit()
        
        new_data = user.to_dict()
        log_operation('users', 'update', 'User', user.id, user.username, old_data, new_data)
        
        return jsonify(user.to_dict()), 200
    
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        error_msg = str(e)
        # 如果是密码长度错误，提供更友好的提示
        if '72 bytes' in error_msg.lower() or 'password cannot be longer' in error_msg.lower():
            return jsonify({'error': '密码长度不能超过72个字符（UTF-8编码）。密码已自动截断，请使用较短的密码。'}), 400
        return jsonify({'error': f'更新个人信息失败: {error_msg}'}), 500


@bp.route('/api/users/<int:user_id>', methods=['DELETE'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('admin')
def delete_user(user_id):

    """删除用户"""

    try:

        user = User.query.get_or_404(user_id)

        # 不能删除管理员
        if user.role == 'admin':
            return jsonify({'error': '不能删除管理员用户'}), 400

        if user.id == current_user.id:

            return jsonify({'error': '不能删除当前登录用户'}), 400

        

        username = user.username

        # 删除用户相关的权限记录（必须在删除用户之前）
        UserPermission.query.filter_by(user_id=user_id).delete()

        db.session.delete(user)

        db.session.commit()

        

        log_operation('users', 'delete', 'User', user_id, username)

        return jsonify({'success': True}), 200

    except Exception as e:

        db.session.rollback()

        return jsonify({'error': f'删除用户失败: {str(e)}'}), 500






@bp.route('/api/operation-logs', methods=['GET'])
def get_operation_logs():

    """获取操作日志"""

    try:

        page = request.args.get('page', 1, type=int)

        per_page = request.args.get('per_page', 50, type=int)

        module = request.args.get('module')

        operation = request.args.get('operation')

        username = request.args.get('username')

        start_date = request.args.get('start_date')

        end_date = request.args.get('end_date')

        

        query = OperationLog.query

        

        if module:

            query = query.filter_by(module=module)

        if operation:

            query = query.filter_by(operation=operation)

        if username:

            query = query.filter_by(username=username)

        if start_date:

            query = query.filter(OperationLog.created_at >= datetime.strptime(start_date, '%Y-%m-%d'))

        if end_date:

            query = query.filter(OperationLog.created_at <= datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1))

        

        logs = query.order_by(OperationLog.created_at.desc()).paginate(

            page=page, per_page=per_page, error_out=False

        )

        

        return jsonify({

            'logs': [log.to_dict() for log in logs.items],

            'total': logs.total,

            'pages': logs.pages,

            'current_page': page

        }), 200

    except Exception as e:

        return jsonify({'error': f'获取操作日志失败: {str(e)}'}), 500






