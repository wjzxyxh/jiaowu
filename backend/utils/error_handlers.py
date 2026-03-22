"""
统一错误处理工具
"""
from functools import wraps
from flask import jsonify, request
from backend.extensions import db
import traceback
import logging

logger = logging.getLogger(__name__)


def handle_db_errors(f):
    """数据库错误处理装饰器
    自动处理数据库操作异常，确保失败时回滚事务
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            db.session.rollback()
            error_msg = str(e)
            error_trace = traceback.format_exc()
            
            # 记录错误日志
            logger.error(f"数据库操作错误 [{request.method} {request.path}]: {error_msg}")
            logger.debug(f"错误堆栈: {error_trace}")
            
            # 生产环境不返回详细错误信息
            if request.environ.get('FLASK_ENV') == 'production':
                return jsonify({'error': '操作失败，请稍后重试'}), 500
            else:
                return jsonify({'error': f'操作失败: {error_msg}'}), 500
    return decorated_function


def validate_json(f):
    """验证请求是否为有效的 JSON"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not request.is_json:
            return jsonify({'error': '请求必须是 JSON 格式'}), 400
        return f(*args, **kwargs)
    return decorated_function


def validate_required_fields(*required_fields):
    """验证必需字段装饰器
    
    用法:
        @validate_required_fields('name', 'email')
        def create_user():
            data = request.json
            # data['name'] 和 data['email'] 已确保存在
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if request.is_json:
                data = request.json
            elif request.form:
                data = request.form
            else:
                return jsonify({'error': '请求数据格式错误'}), 400
            
            missing_fields = [field for field in required_fields if not data.get(field)]
            if missing_fields:
                return jsonify({
                    'error': f'缺少必需字段: {", ".join(missing_fields)}'
                }), 400
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def handle_api_errors(app):
    """注册全局 API 错误处理器"""
    
    @app.errorhandler(400)
    def bad_request(error):
        # 如果错误对象有描述信息，使用它；否则使用通用消息
        error_msg = getattr(error, 'description', None) or str(error) or '请求参数错误'
        # 如果已经有 JSON 格式的错误消息，直接返回
        if isinstance(error_msg, dict) and 'error' in error_msg:
            return jsonify(error_msg), 400
        return jsonify({'error': error_msg}), 400
    
    @app.errorhandler(401)
    def unauthorized(error):
        return jsonify({'error': '未授权，请先登录'}), 401
    
    @app.errorhandler(403)
    def forbidden(error):
        return jsonify({'error': '权限不足'}), 403
    
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'error': '资源不存在'}), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        logger.error(f"内部服务器错误: {str(error)}")
        if app.config.get('DEBUG'):
            return jsonify({'error': f'内部服务器错误: {str(error)}'}), 500
        return jsonify({'error': '内部服务器错误，请稍后重试'}), 500
    
    @app.errorhandler(429)
    def ratelimit_handler(e):
        return jsonify({'error': '请求过于频繁，请稍后再试'}), 429
