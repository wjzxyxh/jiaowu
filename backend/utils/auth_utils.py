"""
认证和权限工具函数
"""
from functools import wraps
from flask import jsonify
from flask_login import login_required, current_user


def require_permission(permission_type='edit'):
    """权限检查装饰器
    permission_type: 'edit' - 需要编辑权限, 'finance' - 需要财务权限, 'admin' - 需要管理员权限
    """
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({'error': '请先登录'}), 401
            
            if permission_type == 'admin' and not current_user.is_admin():
                return jsonify({'error': '需要管理员权限'}), 403
            elif permission_type == 'finance' and not current_user.can_manage_finance():
                return jsonify({'error': '需要财务权限'}), 403
            elif permission_type == 'edit' and not current_user.can_edit():
                return jsonify({'error': '只读用户无法执行此操作'}), 403
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator
