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
@limiter.limit("500 per minute")  # 增加限制，允许更频繁的请求，因为页面刷新时会调用
@login_required
def get_current_user():
    """获取当前登录用户信息"""
    try:
        if not current_user.is_authenticated:
            return jsonify({'error': '未登录'}), 401

        # 确保current_user是有效的User对象
        if not hasattr(current_user, 'id') or not hasattr(current_user, 'username'):
            return jsonify({'error': '用户会话无效，请重新登录'}), 401

        # 尝试调用to_dict()方法，如果失败，提供备用方案
        try:
            user_data = current_user.to_dict()
        except Exception as to_dict_error:
            # 如果to_dict()失败，手动构建用户数据
            user_data = {
                'id': current_user.id,
                'username': current_user.username,
                'role': getattr(current_user, 'role', 'user'),
                'real_name': getattr(current_user, 'real_name', ''),
                'is_active': getattr(current_user, 'is_active', True),
                'created_at': None,
                'last_login': None
            }

        return jsonify({
            'user': user_data
        }), 200

    except Exception as e:
        # 记录详细错误信息用于调试
        import traceback
        print(f"获取当前用户信息失败: {str(e)}")
        print(f"错误详情: {traceback.format_exc()}")

        # 在开发环境下返回详细错误信息
        from flask import current_app
        if current_app.config.get('DEBUG', False):
            return jsonify({'error': f'获取用户信息失败: {str(e)}'}), 500
        else:
            # 生产环境下返回通用错误信息
            return jsonify({'error': '获取用户信息失败，请刷新页面重试'}), 500


@bp.route('/api/health', methods=['GET'])
def health_check():
    """健康检查端点"""
    try:
        from extensions import db
        from models import User

        # 测试数据库连接
        user_count = User.query.count()

        return jsonify({
            'status': 'healthy',
            'database': 'connected',
            'user_count': user_count,
            'timestamp': '2026-01-29'
        }), 200

    except Exception as e:
        import traceback
        print(f"健康检查失败: {str(e)}")
        print(f"错误详情: {traceback.format_exc()}")

        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': '2026-01-29'
        }), 500
