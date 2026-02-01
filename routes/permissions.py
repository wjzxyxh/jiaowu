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

# 定义每个模块的工具栏功能列表
MODULE_FUNCTIONS = {
    'students': [
        {'code': 'add', 'name': '新增学生'},
        {'code': 'edit', 'name': '编辑学生'},
        {'code': 'delete', 'name': '删除学生'},
        {'code': 'export', 'name': '导出Excel'},
        {'code': 'import', 'name': '导入Excel'},
    ],
    'marketing': [
        {'code': 'add', 'name': '新增学生'},
        {'code': 'edit', 'name': '编辑线索'},
        {'code': 'delete', 'name': '删除线索'},
        {'code': 'schedule', 'name': '排课'},
        {'code': 'trial_status', 'name': '试课状态'},
    ],
    'teachers': [
        {'code': 'add', 'name': '新增教师'},
        {'code': 'edit', 'name': '编辑教师'},
        {'code': 'delete', 'name': '删除教师'},
    ],
    'courses_manage': [
        {'code': 'add', 'name': '新增课程'},
        {'code': 'edit', 'name': '编辑课程'},
        {'code': 'delete', 'name': '删除课程'},
    ],
    'courses': [
        {'code': 'add', 'name': '新增排课'},
        {'code': 'edit', 'name': '编辑排课'},
        {'code': 'delete', 'name': '删除排课'},
        {'code': 'confirm', 'name': '确认上课'},
        {'code': 'copy', 'name': '复制到指定周'},
        {'code': 'copy_next', 'name': '复制到下周'},
        {'code': 'screenshot', 'name': '截图'},
    ],
    'all_courses': [
        {'code': 'add', 'name': '新增排课'},
        {'code': 'edit', 'name': '编辑排课'},
        {'code': 'delete', 'name': '删除排课'},
        {'code': 'batch_confirm', 'name': '批量确认'},
        {'code': 'batch_cancel', 'name': '批量取消'},
        {'code': 'batch_delete', 'name': '批量删除'},
        {'code': 'statistics', 'name': '统计'},
    ],
    'student_courses': [
        {'code': 'schedule', 'name': '去排课'},
        {'code': 'copy', 'name': '复制'},
        {'code': 'screenshot', 'name': '截图'},
        {'code': 'edit_default', 'name': '编辑默认排课'},
        {'code': 'batch_select', 'name': '批量勾选'},
        {'code': 'reset', 'name': '重置'},
    ],
    'payments': [
        {'code': 'add', 'name': '新增缴费'},
        {'code': 'edit', 'name': '编辑缴费'},
        {'code': 'delete', 'name': '删除缴费'},
        {'code': 'export', 'name': '导出Excel'},
    ],
    'stats': [
        {'code': 'export', 'name': '导出Excel'},
    ],
    'teacher_hours': [
        {'code': 'export', 'name': '导出Excel'},
    ],
    'finance': [
        {'code': 'export', 'name': '导出Excel'},
    ],
    'others_manage': [
        {'code': 'add_time_slot', 'name': '新增时段'},
        {'code': 'edit_time_slot', 'name': '编辑时段'},
        {'code': 'delete_time_slot', 'name': '删除时段'},
        {'code': 'add_classroom', 'name': '新增教室'},
        {'code': 'edit_classroom', 'name': '编辑教室'},
        {'code': 'delete_classroom', 'name': '删除教室'},
        {'code': 'manage_config', 'name': '管理配置'},
    ],
    'calendar': [
        {'code': 'view', 'name': '查看'},
    ],
}

# 定义所有功能模块列表（与主页 MODULE_CONFIG 保持一致）
MODULE_LIST = [
    {'code': 'students', 'name': '学生管理', 'icon': '👥', 'path': '/students', 'functions': MODULE_FUNCTIONS.get('students', [])},
    {'code': 'marketing', 'name': '营销模块', 'icon': '📢', 'path': '/marketing', 'functions': MODULE_FUNCTIONS.get('marketing', [])},
    {'code': 'teachers', 'name': '教师管理', 'icon': '👨‍🏫', 'path': '/teachers', 'functions': MODULE_FUNCTIONS.get('teachers', [])},
    {'code': 'courses_manage', 'name': '课程管理', 'icon': '📚', 'path': '/courses_manage', 'functions': MODULE_FUNCTIONS.get('courses_manage', [])},
    {'code': 'courses', 'name': '排课管理', 'icon': '📅', 'path': '/courses', 'functions': MODULE_FUNCTIONS.get('courses', [])},
    {'code': 'all_courses', 'name': '全部排课', 'icon': '📋', 'path': '/all_courses', 'functions': MODULE_FUNCTIONS.get('all_courses', [])},
    {'code': 'student_courses', 'name': '学生课程', 'icon': '📚', 'path': '/student_courses', 'functions': MODULE_FUNCTIONS.get('student_courses', [])},
    {'code': 'payments', 'name': '缴费管理', 'icon': '💰', 'path': '/payments', 'functions': MODULE_FUNCTIONS.get('payments', [])},
    {'code': 'stats', 'name': '学生课时', 'icon': '📊', 'path': '/stats', 'functions': MODULE_FUNCTIONS.get('stats', [])},
    {'code': 'teacher_hours', 'name': '老师课时', 'icon': '👨‍🏫', 'path': '/teacher_hours', 'functions': MODULE_FUNCTIONS.get('teacher_hours', [])},
    {'code': 'finance', 'name': '财务统计', 'icon': '💵', 'path': '/finance', 'functions': MODULE_FUNCTIONS.get('finance', [])},
    {'code': 'others_manage', 'name': '其它管理', 'icon': '⚙️', 'path': '/others_manage', 'functions': MODULE_FUNCTIONS.get('others_manage', [])},
    {'code': 'calendar', 'name': '课程表日历', 'icon': '📆', 'path': '/calendar', 'functions': MODULE_FUNCTIONS.get('calendar', [])},
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
    """获取所有模块列表（包含功能列表）"""
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
                'function_permissions': {},  # 默认功能权限为空字典
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
    """批量更新用户权限（包括功能权限）"""
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
            function_permissions = perm_data.get('function_permissions', {})  # 获取功能权限
            
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
                permission.function_permissions = function_permissions  # 更新功能权限
                permission.granted_by = current_user.id
                permission.granted_at = datetime.now()
                permission.updated_at = datetime.now()
            else:
                permission = UserPermission(
                    user_id=user_id,
                    module=module,
                    module_name=module_info['name'],
                    is_granted=is_granted,
                    function_permissions=function_permissions,  # 设置功能权限
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
    """获取当前用户的权限列表（包括功能权限）"""
    if not current_user.is_authenticated:
        return jsonify({'error': '未登录'}), 401
    
    # 管理员默认拥有所有权限和所有功能权限
    if current_user.is_admin():
        modules = [m['code'] for m in MODULE_LIST]
        # 构建管理员的功能权限（所有功能都授权）
        function_permissions = {}
        for module in MODULE_LIST:
            if module.get('functions'):
                function_permissions[module['code']] = {
                    func['code']: True for func in module['functions']
                }
        return jsonify({
            'modules': modules,
            'function_permissions': function_permissions
        }), 200
    else:
        # 获取用户的模块权限和功能权限
        permissions = UserPermission.query.filter_by(user_id=current_user.id, is_granted=True).all()
        modules = [p.module for p in permissions]
        
        # 构建功能权限字典
        function_permissions = {}
        for perm in permissions:
            if perm.function_permissions:
                function_permissions[perm.module] = perm.function_permissions
            else:
                # 如果没有设置功能权限，默认所有功能都授权（向后兼容）
                module_info = next((m for m in MODULE_LIST if m['code'] == perm.module), None)
                if module_info and module_info.get('functions'):
                    function_permissions[perm.module] = {
                        func['code']: True for func in module_info['functions']
                    }
        
        return jsonify({
            'modules': modules,
            'function_permissions': function_permissions
        }), 200
