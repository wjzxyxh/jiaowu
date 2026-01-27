"""
认证路由模块
处理用户登录、登出等功能
"""
from flask import Blueprint, request, jsonify, render_template, session
from flask_login import login_user, logout_user, current_user, login_required
from extensions import db, limiter, csrf
from models import User, LoginLog
from utils import get_client_ip
from datetime import datetime
import secrets

bp = Blueprint('auth', __name__)


@bp.route('/login')
def login_page():
    """登录页面"""
    return render_template('login.html')


@bp.route('/api/login', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@limiter.limit("5 per minute")  # 防止暴力破解
def login():
    """用户登录"""
    try:
        if not request.is_json:
            return jsonify({'error': '请求必须是JSON格式'}), 400
        
        data = request.json
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        if not username or not password:
            return jsonify({'error': '用户名和密码不能为空'}), 400
        
        # 查找用户
        user = User.query.filter_by(username=username).first()
        
        # 记录登录尝试
        ip_address = get_client_ip()
        login_success = False
        
        if user and user.is_active:
            # 检查密码
            if user.check_password(password):
                login_success = True
                
                # 生成session_token用于单点登录
                session_token = secrets.token_urlsafe(32)
                user.session_token = session_token
                user.last_login = datetime.now()
                
                db.session.commit()
                
                # 保存session_token到session
                session['session_token'] = session_token
                
                # 登录用户
                login_user(user, remember=True)
                
                # 记录登录日志
                login_log = LoginLog(
                    user_id=user.id,
                    username=user.username,
                    ip_address=ip_address,
                    user_agent=request.headers.get('User-Agent'),
                    login_time=datetime.now(),
                    success=True
                )
                db.session.add(login_log)
                db.session.commit()
                
                return jsonify({
                    'success': True,
                    'user': user.to_dict()
                }), 200
            else:
                # 密码错误
                login_log = LoginLog(
                    user_id=user.id if user else None,
                    username=username,
                    ip_address=ip_address,
                    user_agent=request.headers.get('User-Agent'),
                    login_time=datetime.now(),
                    success=False,
                    failure_reason='密码错误'
                )
                db.session.add(login_log)
                db.session.commit()
                
                return jsonify({'error': '用户名或密码错误'}), 401
        else:
            # 用户不存在或未激活
            login_log = LoginLog(
                user_id=None,
                username=username,
                ip_address=ip_address,
                user_agent=request.headers.get('User-Agent'),
                login_time=datetime.now(),
                success=False,
                failure_reason='用户不存在或未激活'
            )
            db.session.add(login_log)
            db.session.commit()
            
            return jsonify({'error': '用户名或密码错误'}), 401
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'登录失败: {str(e)}'}), 500


@bp.route('/api/logout', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def logout():
    """用户登出"""
    try:
        # 清除session_token
        if current_user.is_authenticated:
            current_user.session_token = None
            db.session.commit()
        
        # 清除session
        session.pop('session_token', None)
        
        # 登出用户
        logout_user()
        
        return jsonify({'success': True, 'message': '登出成功'}), 200
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'登出失败: {str(e)}'}), 500


@bp.route('/api/current-user', methods=['GET'])
@login_required
def get_current_user():
    """获取当前登录用户信息"""
    try:
        if not current_user.is_authenticated:
            return jsonify({'error': '未登录'}), 401
        
        return jsonify({
            'user': current_user.to_dict()
        }), 200
    
    except Exception as e:
        return jsonify({'error': f'获取用户信息失败: {str(e)}'}), 500
