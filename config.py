"""
应用配置文件
"""
import os
from pathlib import Path

# 获取应用根目录
basedir = Path(__file__).parent.absolute()


class Config:
    """基础配置"""
    # Flask配置
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    
    # Session配置
    SESSION_COOKIE_SECURE = False  # 开发环境设为False，生产环境应设为True（需要HTTPS）
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = 86400  # 24小时（86400秒）- 无操作自动退出
    
    # 数据库配置
    # 支持通过环境变量配置数据库类型和连接信息
    # MySQL示例: DATABASE_URL="mysql+pymysql://user:password@localhost:3306/jiaowu?charset=utf8mb4"
    # SQLite示例: DATABASE_URL="sqlite:///jiaowu.db" (默认)
    database_url = os.environ.get('DATABASE_URL')
    if database_url:
        SQLALCHEMY_DATABASE_URI = database_url
    else:
        # 默认使用SQLite（向后兼容）
        SQLALCHEMY_DATABASE_URI = f'sqlite:///{basedir / "jiaowu.db"}'
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # MySQL连接池配置
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,  # 连接前检查连接是否有效
        'pool_recycle': 3600,   # 1小时后回收连接
        'pool_size': 10,        # 连接池大小
        'max_overflow': 20      # 最大溢出连接数
    }
    
    # 文件上传配置
    UPLOAD_FOLDER = str(basedir / 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB
    ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'gif'}
    
    # CSRF配置
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = None
    WTF_CSRF_CHECK_DEFAULT = True  # 启用CSRF保护（默认检查）
    # 注意：对于纯JSON API端点（Content-Type: application/json），
    # Flask-WTF会自动豁免CSRF检查
    # 对于文件上传（multipart/form-data），需要CSRF token
    
    # Flask-Login配置
    LOGIN_VIEW = 'auth.login_page'
    LOGIN_MESSAGE = '请先登录'
    LOGIN_MESSAGE_CATEGORY = 'info'
    
    # Flask-Limiter配置
    # 开发环境使用内存存储（单服务器部署可接受）
    # 生产环境建议使用Redis: 设置环境变量 RATELIMIT_STORAGE_URL="redis://localhost:6379"
    # 需要先安装Redis: pip install redis
    # 支持新旧两种配置键名以确保兼容性
    storage_url = os.environ.get('RATELIMIT_STORAGE_URL', 'memory://')
    RATELIMIT_STORAGE_URL = storage_url  # 旧版本配置键
    LIMITER_STORAGE_URI = storage_url    # 新版本配置键
    # Flask-Limiter的default_limits可以是字符串列表或单个字符串（用分号分隔）
    # 格式: ["200 per day", "50 per hour"] 或 "200 per day; 50 per hour"
    # 限流已禁用
    # RATELIMIT_DEFAULT = "200 per day; 50 per hour"
    RATELIMIT_DEFAULT = None


class DevelopmentConfig(Config):
    """开发环境配置"""
    DEBUG = True


class ProductionConfig(Config):
    """生产环境配置"""
    DEBUG = False
    # 生产环境应该从环境变量读取
    # 注意：SECRET_KEY会在create_app中验证，这里不强制要求
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'change-me-in-production'


# 根据环境变量选择配置
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

# 为开发环境设置更宽松的速率限制 - 限流已禁用
# if os.environ.get('FLASK_ENV') == 'development' or os.environ.get('DEBUG', '').lower() == 'true':
#     Config.RATELIMIT_DEFAULT = "1000 per hour; 200 per minute"
