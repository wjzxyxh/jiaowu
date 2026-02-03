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
# @limiter.limit("5 per minute")  # 限流已禁用
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
        print(f"[登录调试] 开始登录，用户名: {username}")
        try:
            user = User.query.filter_by(username=username).first()
            print(f"[登录调试] 查询用户结果: {'找到用户' if user else '用户不存在'}")
            if user:
                print(f"[登录调试] 用户ID: {user.id}, 用户名: {user.username}, 是否激活: {user.is_active}")
        except Exception as query_error:
            import traceback
            print(f"[登录调试] 查询用户失败: {str(query_error)}")
            print(f"[登录调试] 错误详情: {traceback.format_exc()}")
            db.session.rollback()
            # 查询失败，返回通用错误信息
            from flask import current_app
            try:
                debug_mode = current_app.config.get('DEBUG', False)
            except:
                debug_mode = True
            if debug_mode:
                return jsonify({
                    'error': f'数据库查询失败: {str(query_error)}',
                    'message': f'数据库查询失败: {str(query_error)}'
                }), 500
            else:
                return jsonify({
                    'error': '登录失败，请稍后重试',
                    'message': '登录失败，请稍后重试'
                }), 500
        
        # 记录登录尝试
        ip_address = get_client_ip()
        login_success = False
        
        if user and user.is_active:
            # 检查密码
            print(f"[登录调试] 开始验证密码")
            try:
                password_valid = user.check_password(password)
                print(f"[登录调试] 密码验证结果: {password_valid}")
            except Exception as password_check_error:
                import traceback
                print(f"[登录调试] 密码验证异常: {str(password_check_error)}")
                print(f"[登录调试] 错误详情: {traceback.format_exc()}")
                password_valid = False
            
            if password_valid:
                print(f"[登录调试] 密码验证成功，开始登录流程")
                login_success = True
                
                # 生成session_token用于单点登录
                try:
                    session_token = secrets.token_urlsafe(32)
                    user.session_token = session_token
                    user.last_login = datetime.now()
                    
                    db.session.commit()
                except Exception as commit_error:
                    db.session.rollback()
                    import traceback
                    print(f"保存用户信息失败: {str(commit_error)}")
                    print(f"错误详情: {traceback.format_exc()}")
                    from flask import current_app
                    try:
                        debug_mode = current_app.config.get('DEBUG', False)
                    except:
                        debug_mode = False
                    if debug_mode:
                        return jsonify({'error': f'保存用户信息失败: {str(commit_error)}'}), 500
                    else:
                        return jsonify({'error': '登录失败，请稍后重试'}), 500
                
                # 保存session_token到session
                session['session_token'] = session_token
                
                # 使用 session cookie（不设 permanent），关闭浏览器后 cookie 失效，实现“关闭浏览器即登出”；
                # 地址栏回车刷新不会登出（前端 beforeunload 不调用 /api/logout）。24 小时无操作登出由前端活动检测处理。
                session.permanent = False
                
                # 登录用户（remember=False 使 cookie 为 session cookie，关闭浏览器后失效）
                login_user(user, remember=False)
                
                # 记录登录日志
                try:
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
                except Exception as log_error:
                    # 登录日志记录失败不影响登录流程
                    db.session.rollback()
                    import traceback
                    print(f"记录登录日志失败: {str(log_error)}")
                    print(f"错误详情: {traceback.format_exc()}")
                
                # 尝试获取用户信息，如果失败则使用备用方案
                try:
                    user_data = user.to_dict()
                except Exception as to_dict_error:
                    # 如果to_dict()失败，手动构建用户数据
                    import traceback
                    print(f"user.to_dict() 失败: {str(to_dict_error)}")
                    print(f"错误详情: {traceback.format_exc()}")
                    user_data = {
                        'id': user.id,
                        'username': user.username,
                        'role': getattr(user, 'role', 'user'),
                        'real_name': getattr(user, 'real_name', ''),
                        'is_active': getattr(user, 'is_active', True),
                        'created_at': None,
                        'last_login': None
                    }
                
                return jsonify({
                    'success': True,
                    'user': user_data
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
        import traceback
        error_trace = traceback.format_exc()
        error_msg = str(e)
        error_type = type(e).__name__
        
        # 详细日志输出
        print("=" * 50)
        print(f"登录失败异常!")
        print(f"错误类型: {error_type}")
        print(f"错误消息: {error_msg}")
        print(f"错误详情:")
        print(error_trace)
        print("=" * 50)
        
        # 在开发环境下返回详细错误信息
        from flask import current_app
        try:
            debug_mode = current_app.config.get('DEBUG', False)
        except:
            debug_mode = True  # 默认开启调试模式，方便排查问题
            
        if debug_mode:
            return jsonify({
                'error': f'登录失败: {error_msg}',
                'message': f'登录失败: {error_msg}',
                'error_type': error_type,
                'details': error_trace
            }), 500
        else:
            return jsonify({
                'error': '登录失败，请稍后重试',
                'message': '登录失败，请稍后重试'
            }), 500


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
# @limiter.limit("500 per minute")  # 限流已禁用
def get_current_user():
    """获取当前登录用户信息"""
    # 最外层异常处理，确保任何错误都不会导致500（除非是真正的服务器错误）
    try:
        # 安全地检查用户是否已登录
        is_authenticated = False
        user_id = None
        
        try:
            # 尝试访问 current_user，如果失败则视为未登录
            # Flask-Login 的 current_user 可能是 AnonymousUser 或 User 对象
            if current_user:
                # 检查是否是匿名用户（Flask-Login 的 AnonymousUserMixin）
                if hasattr(current_user, 'is_anonymous') and current_user.is_anonymous:
                    is_authenticated = False
                elif hasattr(current_user, 'is_authenticated'):
                    is_authenticated = bool(current_user.is_authenticated)
                    # 如果已认证，尝试获取用户ID
                    if is_authenticated and hasattr(current_user, 'id'):
                        try:
                            user_id = current_user.id
                        except:
                            user_id = None
        except Exception as auth_check_error:
            # 如果检查认证状态时出错，视为未登录
            import traceback
            print(f"检查认证状态失败: {str(auth_check_error)}")
            print(f"错误详情: {traceback.format_exc()}")
            is_authenticated = False
        
        # 如果未登录，直接返回401
        if not is_authenticated or not user_id:
            return jsonify({'error': '未登录'}), 401

        # 确保current_user是有效的User对象
        try:
            if not hasattr(current_user, 'id') or not hasattr(current_user, 'username'):
                return jsonify({'error': '用户会话无效，请重新登录'}), 401
            
            user_id = current_user.id
            if not user_id:
                return jsonify({'error': '用户ID无效，请重新登录'}), 401
        except Exception as attr_error:
            import traceback
            print(f"访问用户属性失败: {str(attr_error)}")
            print(f"错误详情: {traceback.format_exc()}")
            return jsonify({'error': '用户会话无效，请重新登录'}), 401

        # 尝试从数据库重新加载用户，确保数据是最新的
        try:
            user = User.query.get(user_id)
            if not user:
                return jsonify({'error': '用户不存在，请重新登录'}), 401
            if not user.is_active:
                return jsonify({'error': '用户已被禁用，请联系管理员'}), 403
        except Exception as db_error:
            import traceback
            print(f"查询用户失败: {str(db_error)}")
            print(f"错误详情: {traceback.format_exc()}")
            # 如果数据库查询失败，尝试使用 current_user
            try:
                user = current_user
            except:
                return jsonify({'error': '无法获取用户信息，请重新登录'}), 401

        # 尝试调用to_dict()方法，如果失败，提供备用方案
        try:
            user_data = user.to_dict()
        except Exception as to_dict_error:
            # 如果to_dict()失败，手动构建用户数据
            import traceback
            print(f"to_dict() 失败: {str(to_dict_error)}")
            print(f"错误详情: {traceback.format_exc()}")
            try:
                user_data = {
                    'id': user.id,
                    'username': user.username,
                    'role': getattr(user, 'role', 'user'),
                    'real_name': getattr(user, 'real_name', ''),
                    'is_active': getattr(user, 'is_active', True),
                    'created_at': user.created_at.strftime('%Y-%m-%d %H:%M:%S') if hasattr(user, 'created_at') and user.created_at else None,
                    'last_login': user.last_login.strftime('%Y-%m-%d %H:%M:%S') if hasattr(user, 'last_login') and user.last_login else None
                }
            except Exception as attr_error:
                # 如果属性访问也失败，使用最基础的字段
                import traceback
                print(f"属性访问失败: {str(attr_error)}")
                print(f"错误详情: {traceback.format_exc()}")
                user_data = {
                    'id': getattr(user, 'id', None),
                    'username': getattr(user, 'username', ''),
                    'role': 'user',
                    'real_name': '',
                    'is_active': True,
                    'created_at': None,
                    'last_login': None
                }

        return jsonify({
            'user': user_data
        }), 200

    except Exception as e:
        # 记录详细错误信息用于调试
        import traceback
        error_trace = traceback.format_exc()
        error_msg = str(e)
        print(f"获取当前用户信息失败: {error_msg}")
        print(f"错误详情: {error_trace}")
        
        # 确保数据库回滚
        try:
            db.session.rollback()
        except:
            pass

        # 如果错误与认证相关，返回401而不是500
        error_lower = error_msg.lower()
        if any(keyword in error_lower for keyword in ['未登录', 'session', 'authenticated', 'anonymous', 'login', 'unauthorized']):
            return jsonify({'error': '未登录'}), 401
        
        # 如果是属性访问错误或对象不存在错误，可能是用户会话问题，返回401
        if any(keyword in error_lower for keyword in ['attribute', 'object', 'none', 'has no attribute', 'not found']):
            return jsonify({'error': '用户会话无效，请重新登录'}), 401

        # 在开发环境下返回详细错误信息
        from flask import current_app
        if current_app.config.get('DEBUG', False):
            return jsonify({'error': f'获取用户信息失败: {error_msg}', 'details': error_trace}), 500
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
