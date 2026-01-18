"""
权限管理路由模块
"""
from flask import Blueprint, request, jsonify, render_template
from flask_login import login_required, current_user
from extensions import db, csrf
from models import User, UserPermission, OperationLog
from utils import require_permission, log_operation
from datetime import datetime

bp = Blueprint('permissions', __name__)

# 定义所有功能模块列表（与主页 MODULE_CONFIG 保持一致）
MODULE_LIST = [
    {'code': 'students', 'name': '学生管理', 'icon': '👥', 'path': '/students'},
    {'code': 'teachers', 'name': '教师管理', 'icon': '👨‍🏫', 'path': '/teachers'},
    {'code': 'courses_manage', 'name': '课程管理', 'icon': '📚', 'path': '/courses_manage'},
    {'code': 'courses', 'name': '排课管理', 'icon': '📅', 'path': '/courses'},
    {'code': 'all_courses', 'name': '全部排课', 'icon': '📋', 'path': '/all_courses'},
    {'code': 'student_courses', 'name': '学生课程', 'icon': '📚', 'path': '/student_courses'},
    {'code': 'payments', 'name': '缴费管理', 'icon': '💰', 'path': '/payments'},
    {'code': 'stats', 'name': '学生课时', 'icon': '📊', 'path': '/stats'},
    {'code': 'teacher_hours', 'name': '老师课时', 'icon': '👨‍🏫', 'path': '/teacher_hours'},
    {'code': 'finance', 'name': '财务统计', 'icon': '💵', 'path': '/finance'},
    {'code': 'others_manage', 'name': '其它管理', 'icon': '⚙️', 'path': '/others_manage'},
    {'code': 'calendar', 'name': '课程表日历', 'icon': '📆', 'path': '/calendar'},
]


@bp.route('/permissions')
@login_required
@require_permission('admin')
def permissions_page():
    """权限管理页面"""
    return render_template('permissions.html')


@bp.route('/api/permissions/modules', methods=['GET'])
@login_required
def get_modules():
    """获取所有模块列表"""
    return jsonify(MODULE_LIST), 200


@bp.route('/api/permissions/users/<int:user_id>', methods=['GET'])
@login_required
@require_permission('admin')
def get_user_permissions(user_id):
    """获取指定用户的权限列表"""
    user = User.query.get_or_404(user_id)
    
    # 获取用户的所有权限
    permissions = UserPermission.query.filter_by(user_id=user_id).all()
    permission_dict = {p.module: p.to_dict() for p in permissions}
    
    # 构建完整的权限列表（包括未设置的模块）
    result = []
    for module in MODULE_LIST:
        if module['code'] in permission_dict:
            result.append(permission_dict[module['code']])
        else:
            # 默认未授权
            result.append({
                'id': None,
                'user_id': user_id,
                'module': module['code'],
                'module_name': module['name'],
                'is_granted': False,
                'granted_by': None,
                'granted_at': None,
                'created_at': None,
                'updated_at': None
            })
    
    return jsonify(result), 200


@bp.route('/api/permissions/users/<int:user_id>/modules/<module>', methods=['PUT'])
@csrf.exempt
@login_required
@require_permission('admin')
def update_user_permission(user_id, module):
    """更新用户权限"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': '请求数据为空'}), 400
        
        is_granted = data.get('is_granted', False)
        
        # 验证模块是否存在
        module_info = next((m for m in MODULE_LIST if m['code'] == module), None)
        if not module_info:
            return jsonify({'error': f'模块 {module} 不存在'}), 400
        
        # 查找或创建权限记录
        permission = UserPermission.query.filter_by(
            user_id=user_id,
            module=module
        ).first()
        
        if permission:
            # 更新现有权限
            old_data = permission.to_dict()
            permission.is_granted = is_granted
            permission.granted_by = current_user.id
            permission.granted_at = datetime.now()
            permission.updated_at = datetime.now()
        else:
            # 创建新权限
            permission = UserPermission(
                user_id=user_id,
                module=module,
                module_name=module_info['name'],
                is_granted=is_granted,
                granted_by=current_user.id,
                granted_at=datetime.now()
            )
            db.session.add(permission)
        
        db.session.commit()
        
        # 记录操作日志
        user = User.query.get(user_id)
        log_operation('permissions', 'update' if permission.id else 'create', 
                     'UserPermission', permission.id, 
                     f"用户: {user.username}, 模块: {module_info['name']}, 授权: {is_granted}")
        
        return jsonify(permission.to_dict()), 200
        
    except Exception as e:
        db.session.rollback()
        import traceback
        return jsonify({'error': f'更新权限失败: {str(e)}', 'details': traceback.format_exc()}), 500


@bp.route('/api/permissions/users/<int:user_id>/modules', methods=['PUT'])
@csrf.exempt
@login_required
@require_permission('admin')
def batch_update_user_permissions(user_id):
    """批量更新用户权限"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': '请求数据为空'}), 400
        
        permissions = data.get('permissions', [])
        
        user = User.query.get_or_404(user_id)
        
        updated_count = 0
        for perm_data in permissions:
            module = perm_data.get('module')
            is_granted = perm_data.get('is_granted', False)
            
            # 验证模块是否存在
            module_info = next((m for m in MODULE_LIST if m['code'] == module), None)
            if not module_info:
                continue
            
            # 查找或创建权限记录
            permission = UserPermission.query.filter_by(
                user_id=user_id,
                module=module
            ).first()
            
            if permission:
                permission.is_granted = is_granted
                permission.granted_by = current_user.id
                permission.granted_at = datetime.now()
                permission.updated_at = datetime.now()
            else:
                permission = UserPermission(
                    user_id=user_id,
                    module=module,
                    module_name=module_info['name'],
                    is_granted=is_granted,
                    granted_by=current_user.id,
                    granted_at=datetime.now()
                )
                db.session.add(permission)
            
            updated_count += 1
        
        db.session.commit()
        
        # 记录操作日志
        log_operation('permissions', 'batch_update', 'UserPermission', user_id, 
                     f"用户: {user.username}, 更新了 {updated_count} 个模块权限")
        
        return jsonify({'message': f'成功更新 {updated_count} 个模块权限'}), 200
        
    except Exception as e:
        db.session.rollback()
        import traceback
        return jsonify({'error': f'批量更新权限失败: {str(e)}', 'details': traceback.format_exc()}), 500


@bp.route('/api/permissions/current-user', methods=['GET'])
@login_required
def get_current_user_permissions():
    """获取当前用户的权限列表"""
    if not current_user.is_authenticated:
        return jsonify({'error': '未登录'}), 401
    
    # 管理员默认拥有所有权限
    if current_user.is_admin():
        modules = [m['code'] for m in MODULE_LIST]
    else:
        modules = current_user.get_granted_modules()
    
    return jsonify({'modules': modules}), 200
