"""
Auth路由模块
从app_old.py提取
"""
from flask import Blueprint, request, jsonify, render_template, send_from_directory, Response, session, current_app
from flask_login import login_required, current_user, login_user, logout_user
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

bp = Blueprint('auth', __name__)

@bp.route('/login')
def login_page():

    """登录页面"""

    return render_template('login.html')




@bp.route('/api/login', methods=['POST'])
@csrf.exempt  # 登录端点豁免 CSRF 检查（用户未登录时无法获取 CSRF token）
@limiter.limit("5 per minute")  # 防止暴力破解：每分钟最多5次登录尝试
def login():

    """用户登录"""

    try:

        data = request.json

        if not data:

            return jsonify({'error': '请求数据为空'}), 400

        

        username = data.get('username', '').strip()

        password = data.get('password', '')

        

        if not username or not password:

            return jsonify({'error': '用户名和密码不能为空'}), 400

        

        user = User.query.filter_by(username=username).first()

        

        # 记录登录尝试

        ip_address = get_client_ip()

        user_agent = request.headers.get('User-Agent', '')

        

        if not user:

            log = LoginLog(

                username=username,

                ip_address=ip_address,

                user_agent=user_agent,

                success=False,

                failure_reason='用户不存在'

            )

            db.session.add(log)

            db.session.commit()

            return jsonify({'error': '用户名或密码错误'}), 401

        

        if not user.is_active:

            log = LoginLog(

                user_id=user.id,

                username=username,

                ip_address=ip_address,

                user_agent=user_agent,

                success=False,

                failure_reason='用户已禁用'

            )

            db.session.add(log)

            db.session.commit()

            return jsonify({'error': '用户已被禁用'}), 403

        

        if not user.check_password(password):

            log = LoginLog(

                user_id=user.id,

                username=username,

                ip_address=ip_address,

                user_agent=user_agent,

                success=False,

                failure_reason='密码错误'

            )

            db.session.add(log)

            db.session.commit()

            return jsonify({'error': '用户名或密码错误'}), 401

        

        # 登录成功 - 单点登录：生成新的session_token，使旧会话失效
        import secrets
        new_session_token = secrets.token_urlsafe(32)  # 生成32字节的随机token
        
        # 如果用户已有session_token，说明在其他地方登录了，需要使旧会话失效
        if user.session_token:
            current_app.logger.info(f"用户 {username} 在其他地方登录，旧会话将被失效")
        
        # 更新用户的session_token
        user.session_token = new_session_token
        user.last_login = datetime.now()
        db.session.commit()
        
        # 将session_token存储到Flask session中
        login_user(user, remember=True)  # 使用remember=True确保session持久化
        session.permanent = True
        session['session_token'] = new_session_token  # 存储session_token到session
        
        # 记录登录日志（不打印敏感信息）
        current_app.logger.info(f"用户登录成功: {username}")

        

        log = LoginLog(

            user_id=user.id,

            username=username,

            ip_address=ip_address,

            user_agent=user_agent,

            success=True

        )

        db.session.add(log)

        db.session.commit()

        

        return jsonify({

            'success': True,

            'user': user.to_dict()

        }), 200

    except Exception as e:

        db.session.rollback()

        import traceback
        from flask import current_app
        
        error_trace = traceback.format_exc()
        current_app.logger.error(f"登录错误: {str(e)}")
        current_app.logger.debug(f"错误堆栈: {error_trace}")
        
        return jsonify({'error': f'登录失败: {str(e)}'}), 500




@bp.route('/api/logout', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def logout():

    """用户登出"""
    
    # 清除用户的session_token
    if current_user.is_authenticated:
        current_user.session_token = None
        db.session.commit()
    
    # 清除session中的session_token
    session.pop('session_token', None)
    
    logout_user()

    return jsonify({'success': True}), 200




@bp.route('/api/current-user', methods=['GET'])
def get_current_user():
    """获取当前登录用户"""
    if current_user.is_authenticated:
        user_dict = current_user.to_dict()
        return jsonify({'user': user_dict}), 200
    
    return jsonify({'user': None}), 200




