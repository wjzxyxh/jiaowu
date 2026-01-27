"""
Flask扩展初始化
"""
import warnings
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_cors import CORS

# 初始化扩展
db = SQLAlchemy()
login_manager = LoginManager()
csrf = CSRFProtect()
limiter = Limiter(key_func=get_remote_address)
cors = CORS()


def init_extensions(app):
    """初始化所有扩展"""
    db.init_app(app)
    csrf.init_app(app)
    login_manager.init_app(app)
    
    # 配置CORS - 支持前后端分离
    cors.init_app(app, resources={
        r"/api/*": {
            "origins": "*",  # 开发环境允许所有来源，生产环境应限制为前端域名
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True  # 允许携带cookie
        }
    })
    
    # 配置LoginManager
    from config import Config
    login_manager.login_view = Config.LOGIN_VIEW
    login_manager.login_message = Config.LOGIN_MESSAGE
    login_manager.login_message_category = Config.LOGIN_MESSAGE_CATEGORY
    
    # 配置Limiter存储URI
    # Flask-Limiter会从app.config读取存储配置
    storage_uri = app.config.get('LIMITER_STORAGE_URI') or app.config.get('RATELIMIT_STORAGE_URL', 'memory://')
    app.config['RATELIMIT_STORAGE_URL'] = storage_uri
    app.config['LIMITER_STORAGE_URI'] = storage_uri
    
    # 如果是开发环境且使用内存存储，抑制Flask-Limiter的内存存储警告
    # 开发环境使用内存存储是可接受的，生产环境建议使用Redis
    # 生产环境配置: 设置环境变量 RATELIMIT_STORAGE_URL="redis://localhost:6379"
    if storage_uri == 'memory://' and app.config.get('DEBUG', False):
        # 抑制Flask-Limiter的内存存储警告
        warnings.filterwarnings('ignore', 
                                message='.*in-memory storage.*', 
                                category=UserWarning,
                                module='flask_limiter')
    
    # 初始化Limiter
    limiter.init_app(app)
    
    # 设置默认限制（如果配置中有）
    # Flask-Limiter的default_limits可以是：
    # 1. 字符串列表: ["200 per day", "50 per hour"]
    # 2. 单个字符串（用分号分隔）: "200 per day; 50 per hour"
    if 'RATELIMIT_DEFAULT' in app.config:
        default_limits = app.config['RATELIMIT_DEFAULT']
        if isinstance(default_limits, str):
            # 如果是字符串，直接使用（Flask-Limiter支持用分号分隔的字符串）
            limiter.default_limits = default_limits
        elif isinstance(default_limits, list):
            # 如果是列表，确保每个元素都是字符串
            limiter.default_limits = [str(limit) for limit in default_limits]
        else:
            # 其他情况，转换为字符串
            limiter.default_limits = str(default_limits) if default_limits else None
    
    # 设置用户加载函数
    @login_manager.user_loader
    def load_user(user_id):
        """加载用户"""
        from models import User
        from flask import session
        user = User.query.get(int(user_id))
        
        # 单点登录检查：验证session_token是否匹配
        if user:
            session_token = session.get('session_token')
            # 如果session中有token，但用户没有token或token不匹配，说明在其他地方登录了
            if session_token and (not user.session_token or user.session_token != session_token):
                # 会话已失效，清除session
                session.pop('session_token', None)
                return None
        
        return user
    
    # 添加请求前钩子，检查session_token
    @app.before_request
    def check_session_token():
        """检查session_token是否有效"""
        from flask import session, request
        from flask_login import current_user
        
        # 跳过登录页面和API登录端点
        if request.endpoint in ('auth.login_page', 'auth.login', 'static'):
            return
        
        # 如果用户已登录，检查session_token
        if current_user.is_authenticated:
            session_token = session.get('session_token')
            # 如果session中有token，但用户没有token或token不匹配，登出用户
            if session_token and (not current_user.session_token or current_user.session_token != session_token):
                from flask_login import logout_user
                logout_user()
                session.clear()
                # 如果是API请求，返回401
                if request.path.startswith('/api/'):
                    from flask import jsonify
                    return jsonify({'error': '您的账号在其他地方登录，当前会话已失效', 'session_expired': True}), 401
                # 否则重定向到登录页
                from flask import redirect, url_for
                return redirect(url_for('auth.login_page'))
