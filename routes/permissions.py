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

# 定义每个模块的工具栏功能列表（丰富和更新）
MODULE_FUNCTIONS = {
    'students': [
        {'code': 'view', 'name': '查看学生'},
        {'code': 'add', 'name': '新增学生'},
        {'code': 'edit', 'name': '编辑学生'},
        {'code': 'delete', 'name': '删除学生'},
        {'code': 'export', 'name': '导出Excel'},
        {'code': 'import', 'name': '导入Excel'},
        {'code': 'search', 'name': '搜索筛选'},
        {'code': 'view_detail', 'name': '查看详情'},
        {'code': 'batch_operation', 'name': '批量操作'},
    ],
    'marketing': [
        {'code': 'view', 'name': '查看线索'},
        {'code': 'edit', 'name': '编辑线索'},
        {'code': 'delete', 'name': '删除线索'},
        {'code': 'schedule', 'name': '排课'},
        {'code': 'trial_status', 'name': '试课状态'},
        {'code': 'view_timetable', 'name': '查看课表'},
        {'code': 'search', 'name': '搜索筛选'},
        {'code': 'export', 'name': '导出数据'},
    ],
    'student_list': [
        {'code': 'view', 'name': '查看名单'},
        {'code': 'edit', 'name': '编辑信息'},
        {'code': 'trial_status', 'name': '试课状态'},
        {'code': 'search', 'name': '搜索筛选'},
        {'code': 'export', 'name': '导出Excel'},
    ],
    'teachers': [
        {'code': 'view', 'name': '查看教师'},
        {'code': 'add', 'name': '新增教师'},
        {'code': 'edit', 'name': '编辑教师'},
        {'code': 'delete', 'name': '删除教师'},
        {'code': 'view_detail', 'name': '查看详情'},
        {'code': 'view_schedule', 'name': '查看排课'},
        {'code': 'search', 'name': '搜索筛选'},
        {'code': 'export', 'name': '导出Excel'},
    ],
    'courses_manage': [
        {'code': 'view', 'name': '查看课程'},
        {'code': 'add', 'name': '新增课程'},
        {'code': 'edit', 'name': '编辑课程'},
        {'code': 'delete', 'name': '删除课程'},
        {'code': 'view_detail', 'name': '查看详情'},
        {'code': 'search', 'name': '搜索筛选'},
    ],
    'courses': [
        {'code': 'view', 'name': '查看排课'},
        {'code': 'add', 'name': '新增排课'},
        {'code': 'edit', 'name': '编辑排课'},
        {'code': 'delete', 'name': '删除排课'},
        {'code': 'confirm', 'name': '确认上课'},
        {'code': 'copy', 'name': '复制到指定周'},
        {'code': 'copy_next', 'name': '复制到下周'},
        {'code': 'screenshot', 'name': '截图'},
        {'code': 'search', 'name': '搜索筛选'},
        {'code': 'view_detail', 'name': '查看详情'},
    ],
    'all_courses': [
        {'code': 'view', 'name': '查看排课'},
        {'code': 'add', 'name': '新增排课'},
        {'code': 'edit', 'name': '编辑排课'},
        {'code': 'delete', 'name': '删除排课'},
        {'code': 'batch_confirm', 'name': '批量确认'},
        {'code': 'batch_cancel', 'name': '批量取消'},
        {'code': 'batch_delete', 'name': '批量删除'},
        {'code': 'statistics', 'name': '统计'},
        {'code': 'search', 'name': '搜索筛选'},
        {'code': 'export', 'name': '导出Excel'},
    ],
    'student_courses': [
        {'code': 'view', 'name': '查看课程'},
        {'code': 'schedule', 'name': '去排课'},
        {'code': 'copy', 'name': '复制'},
        {'code': 'screenshot', 'name': '截图'},
        {'code': 'edit_default', 'name': '编辑默认排课'},
        {'code': 'batch_select', 'name': '批量勾选'},
        {'code': 'reset', 'name': '重置'},
        {'code': 'search', 'name': '搜索筛选'},
    ],
    'payments': [
        {'code': 'view', 'name': '查看缴费'},
        {'code': 'add', 'name': '新增缴费'},
        {'code': 'edit', 'name': '编辑缴费'},
        {'code': 'delete', 'name': '删除缴费'},
        {'code': 'export', 'name': '导出Excel'},
        {'code': 'search', 'name': '搜索筛选'},
        {'code': 'view_detail', 'name': '查看详情'},
    ],
    'stats': [
        {'code': 'view', 'name': '查看统计'},
        {'code': 'export', 'name': '导出Excel'},
        {'code': 'search', 'name': '搜索筛选'},
        {'code': 'filter', 'name': '筛选条件'},
    ],
    'teacher_hours': [
        {'code': 'view', 'name': '查看课时'},
        {'code': 'export', 'name': '导出Excel'},
        {'code': 'search', 'name': '搜索筛选'},
        {'code': 'filter', 'name': '筛选条件'},
    ],
    'finance': [
        {'code': 'view', 'name': '查看统计'},
        {'code': 'export', 'name': '导出Excel'},
        {'code': 'search', 'name': '搜索筛选'},
        {'code': 'filter', 'name': '筛选条件'},
        {'code': 'view_detail', 'name': '查看详情'},
    ],
    'others_manage': [
        {'code': 'view', 'name': '查看设置'},
        {'code': 'add_time_slot', 'name': '新增时段'},
        {'code': 'edit_time_slot', 'name': '编辑时段'},
        {'code': 'delete_time_slot', 'name': '删除时段'},
        {'code': 'add_classroom', 'name': '新增教室'},
        {'code': 'edit_classroom', 'name': '编辑教室'},
        {'code': 'delete_classroom', 'name': '删除教室'},
        {'code': 'manage_config', 'name': '管理配置'},
    ],
    'calendar': [
        {'code': 'view', 'name': '查看日历'},
        {'code': 'filter', 'name': '筛选条件'},
        {'code': 'view_detail', 'name': '查看详情'},
    ],
}

# 定义所有功能模块列表（与主页 MODULE_CONFIG 保持一致）
MODULE_LIST = [
    {'code': 'students', 'name': '学生管理', 'icon': '👥', 'path': '/students', 'functions': MODULE_FUNCTIONS.get('students', [])},
    {'code': 'marketing', 'name': '试课系统', 'icon': '📢', 'path': '/marketing', 'functions': MODULE_FUNCTIONS.get('marketing', [])},
    {'code': 'student_list', 'name': '学生名单', 'icon': '📝', 'path': '/student-list', 'functions': MODULE_FUNCTIONS.get('student_list', [])},
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


# 权限模板定义（预设角色权限）
PERMISSION_TEMPLATES = {
    'teacher_full': {
        'name': '教务（完整权限）',
        'description': '拥有所有教务相关模块的完整权限',
        'modules': ['students', 'marketing', 'student_list', 'teachers', 'courses_manage', 'courses', 'all_courses', 'student_courses', 'calendar'],
        'all_functions': True,  # 所有功能权限都授权
    },
    'teacher_readonly': {
        'name': '教务（只读）',
        'description': '只能查看教务相关模块，不能修改',
        'modules': ['students', 'marketing', 'student_list', 'teachers', 'courses_manage', 'courses', 'all_courses', 'student_courses', 'calendar'],
        'all_functions': False,
        'function_permissions': {
            'students': {'view': True, 'view_detail': True, 'search': True, 'export': True},
            'marketing': {'view': True, 'view_timetable': True, 'search': True},
            'teachers': {'view': True, 'view_detail': True, 'search': True},
            'courses': {'view': True, 'view_detail': True, 'search': True},
            'all_courses': {'view': True, 'search': True, 'export': True},
            'student_courses': {'view': True, 'search': True},
            'calendar': {'view': True, 'filter': True, 'view_detail': True},
        }
    },
    'finance_full': {
        'name': '财务（完整权限）',
        'description': '拥有所有财务相关模块的完整权限',
        'modules': ['payments', 'stats', 'finance', 'students'],
        'all_functions': True,
    },
    'finance_readonly': {
        'name': '财务（只读）',
        'description': '只能查看财务相关模块，不能修改',
        'modules': ['payments', 'stats', 'finance', 'students'],
        'all_functions': False,
        'function_permissions': {
            'payments': {'view': True, 'view_detail': True, 'search': True, 'export': True},
            'stats': {'view': True, 'search': True, 'filter': True, 'export': True},
            'finance': {'view': True, 'view_detail': True, 'search': True, 'filter': True, 'export': True},
            'students': {'view': True, 'view_detail': True, 'search': True},
        }
    },
    'minimal': {
        'name': '最小权限',
        'description': '仅查看基本模块',
        'modules': ['calendar'],
        'all_functions': False,
        'function_permissions': {
            'calendar': {'view': True},
        }
    },
}


@bp.route('/api/permissions/modules', methods=['GET'])
@login_required
def get_modules():
    """获取所有模块列表（包含功能列表）"""
    return jsonify(MODULE_LIST), 200


@bp.route('/api/permissions/templates', methods=['GET'])
@login_required
@require_permission('admin')
def get_permission_templates():
    """获取权限模板列表"""
    return jsonify(PERMISSION_TEMPLATES), 200


@bp.route('/api/permissions/templates', methods=['PUT'])
@csrf.exempt
@login_required
@require_permission('admin')
def save_permission_templates():
    """保存权限模板配置（支持新增、更新、删除）"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': '请求数据为空'}), 400
        
        updated_count = 0
        created_count = 0
        deleted_keys = []
        
        # 获取所有现有的模板key
        existing_keys = set(PERMISSION_TEMPLATES.keys())
        submitted_keys = set(data.keys())
        
        # 找出需要删除的模板（存在于现有配置但不在提交数据中）
        deleted_keys = list(existing_keys - submitted_keys)
        
        # 验证和更新模板数据
        for template_key, template_data in data.items():
            # 验证必需字段
            if 'name' not in template_data or 'modules' not in template_data:
                return jsonify({'error': f'模板 {template_key} 缺少必需字段'}), 400
            
            # 验证模块是否存在
            for module_code in template_data.get('modules', []):
                module_info = next((m for m in MODULE_LIST if m['code'] == module_code), None)
                if not module_info:
                    return jsonify({'error': f'模块 {module_code} 不存在'}), 400
            
            # 新增或更新模板
            if template_key in PERMISSION_TEMPLATES:
                # 更新现有模板
                PERMISSION_TEMPLATES[template_key].update({
                    'name': template_data.get('name', ''),
                    'description': template_data.get('description', ''),
                    'modules': template_data.get('modules', []),
                    'all_functions': template_data.get('all_functions', False),
                    'function_permissions': template_data.get('function_permissions', {}),
                })
                updated_count += 1
            else:
                # 新增模板
                PERMISSION_TEMPLATES[template_key] = {
                    'name': template_data.get('name', ''),
                    'description': template_data.get('description', ''),
                    'modules': template_data.get('modules', []),
                    'all_functions': template_data.get('all_functions', False),
                    'function_permissions': template_data.get('function_permissions', {}),
                }
                created_count += 1
        
        # 删除模板
        for template_key in deleted_keys:
            del PERMISSION_TEMPLATES[template_key]
        
        # 记录操作日志
        log_messages = []
        if created_count > 0:
            log_messages.append(f'新增 {created_count} 个模板')
        if updated_count > 0:
            log_messages.append(f'更新 {updated_count} 个模板')
        if deleted_keys:
            log_messages.append(f'删除 {len(deleted_keys)} 个模板')
        
        log_operation('permissions', 'update_templates', 'PermissionTemplate', None, 
                     '; '.join(log_messages) if log_messages else '无变更')
        
        result_message = []
        if created_count > 0:
            result_message.append(f'新增 {created_count} 个模板')
        if updated_count > 0:
            result_message.append(f'更新 {updated_count} 个模板')
        if deleted_keys:
            result_message.append(f'删除 {len(deleted_keys)} 个模板')
        
        return jsonify({
            'message': '; '.join(result_message) if result_message else '无变更',
            'created': created_count,
            'updated': updated_count,
            'deleted': len(deleted_keys),
        }), 200
        
    except Exception as e:
        import traceback
        return jsonify({'error': f'保存模板配置失败: {str(e)}', 'details': traceback.format_exc()}), 500


@bp.route('/api/permissions/users/<int:user_id>/apply-template/<template_name>', methods=['POST'])
@csrf.exempt
@login_required
@require_permission('admin')
def apply_permission_template(user_id, template_name):
    """应用权限模板到用户"""
    try:
        if template_name not in PERMISSION_TEMPLATES:
            return jsonify({'error': f'权限模板 {template_name} 不存在'}), 400
        
        template = PERMISSION_TEMPLATES[template_name]
        user = User.query.get_or_404(user_id)
        
        # 构建权限列表
        permissions = []
        for module_code in template['modules']:
            module_info = next((m for m in MODULE_LIST if m['code'] == module_code), None)
            if not module_info:
                continue
            
            function_permissions = {}
            if template.get('all_functions', False):
                # 所有功能都授权
                if module_info.get('functions'):
                    function_permissions = {func['code']: True for func in module_info['functions']}
            else:
                # 使用模板中定义的功能权限
                template_func_perms = template.get('function_permissions', {}).get(module_code, {})
                if module_info.get('functions'):
                    for func in module_info['functions']:
                        func_code = func['code']
                        function_permissions[func_code] = template_func_perms.get(func_code, False)
            
            permissions.append({
                'module': module_code,
                'is_granted': True,
                'function_permissions': function_permissions,
            })
        
        # 批量更新权限
        updated_count = 0
        for perm_data in permissions:
            module = perm_data.get('module')
            is_granted = perm_data.get('is_granted', False)
            function_permissions = perm_data.get('function_permissions', {})
            
            module_info = next((m for m in MODULE_LIST if m['code'] == module), None)
            if not module_info:
                continue
            
            permission = UserPermission.query.filter_by(
                user_id=user_id,
                module=module
            ).first()
            
            if permission:
                permission.is_granted = is_granted
                permission.function_permissions = function_permissions
                permission.granted_by = current_user.id
                permission.granted_at = datetime.now()
                permission.updated_at = datetime.now()
            else:
                permission = UserPermission(
                    user_id=user_id,
                    module=module,
                    module_name=module_info['name'],
                    is_granted=is_granted,
                    function_permissions=function_permissions,
                    granted_by=current_user.id,
                    granted_at=datetime.now()
                )
                db.session.add(permission)
            
            updated_count += 1
        
        db.session.commit()
        
        # 记录操作日志
        log_operation('permissions', 'apply_template', 'UserPermission', user_id, 
                     f"用户: {user.username}, 应用模板: {template['name']}")
        
        return jsonify({'message': f'成功应用权限模板 "{template["name"]}"，更新了 {updated_count} 个模块权限'}), 200
        
    except Exception as e:
        db.session.rollback()
        import traceback
        return jsonify({'error': f'应用权限模板失败: {str(e)}', 'details': traceback.format_exc()}), 500


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


@bp.route('/api/permissions/users/<int:user_id>/history', methods=['GET'])
@login_required
@require_permission('admin')
def get_user_permission_history(user_id):
    """获取用户权限变更历史"""
    try:
        user = User.query.get_or_404(user_id)
        
        # 查询权限变更日志（从操作日志中筛选）
        logs = OperationLog.query.filter(
            OperationLog.module == 'permissions',
            OperationLog.record_id == user_id
        ).order_by(OperationLog.created_at.desc()).limit(100).all()
        
        history = []
        for log in logs:
            history.append({
                'id': log.id,
                'operation': log.operation,
                'description': log.description,
                'operator': log.username,
                'created_at': log.created_at.strftime('%Y-%m-%d %H:%M:%S') if log.created_at else None,
            })
        
        return jsonify(history), 200
        
    except Exception as e:
        import traceback
        return jsonify({'error': f'获取权限变更历史失败: {str(e)}', 'details': traceback.format_exc()}), 500
