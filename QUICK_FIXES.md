# 快速修复指南

本文档提供了一些常见问题的快速修复方法。

## 1. 为路由添加权限控制

### 问题
很多 API 端点缺少 `@login_required` 装饰器。

### 修复方法

在路由函数上添加装饰器：

```python
from flask_login import login_required
from utils import require_permission

# GET 请求 - 只需要登录
@bp.route('/api/students', methods=['GET'])
@login_required
def get_students():
    ...

# POST/PUT/DELETE - 需要编辑权限
@bp.route('/api/students', methods=['POST'])
@login_required
@require_permission('edit')
def create_student():
    ...

# 财务操作 - 需要财务权限
@bp.route('/api/finance', methods=['PUT'])
@login_required
@require_permission('finance')
def update_finance():
    ...
```

## 2. 添加错误处理和事务回滚

### 问题
数据库操作缺少异常处理和回滚。

### 修复方法

使用 `@handle_db_errors` 装饰器：

```python
from utils import handle_db_errors

@bp.route('/api/students', methods=['POST'])
@login_required
@require_permission('edit')
@handle_db_errors  # 添加这个装饰器
def create_student():
    data = request.json
    student = Student(name=data['name'], ...)
    db.session.add(student)
    db.session.commit()  # 如果失败会自动回滚
    return jsonify(student.to_dict()), 201
```

或者手动添加 try-except：

```python
@bp.route('/api/students', methods=['POST'])
@login_required
@require_permission('edit')
def create_student():
    try:
        data = request.json
        student = Student(name=data['name'], ...)
        db.session.add(student)
        db.session.commit()
        return jsonify(student.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'创建失败: {str(e)}'}), 500
```

## 3. 添加输入验证

### 问题
直接使用 `request.json` 可能导致 KeyError。

### 修复方法

使用 `@validate_required_fields` 装饰器：

```python
from utils import validate_json, validate_required_fields

@bp.route('/api/students', methods=['POST'])
@login_required
@require_permission('edit')
@handle_db_errors
@validate_json
@validate_required_fields('name')  # 确保 'name' 字段存在
def create_student():
    data = request.json
    # 现在可以安全地使用 data['name']
    student = Student(name=data['name'], ...)
    ...
```

或者手动验证：

```python
@bp.route('/api/students', methods=['POST'])
@login_required
@require_permission('edit')
def create_student():
    data = request.json
    if not data:
        return jsonify({'error': '请求数据为空'}), 400
    
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': '姓名不能为空'}), 400
    
    if len(name) > 50:
        return jsonify({'error': '姓名长度不能超过50个字符'}), 400
    
    student = Student(name=name, ...)
    ...
```

## 4. 修复空异常处理

### 问题
使用 `except: pass` 会隐藏错误。

### 修复方法

```python
# 修复前
try:
    os.remove(student.photo_path)
except:
    pass

# 修复后 - 方法1：记录日志
try:
    if student.photo_path and os.path.exists(student.photo_path):
        os.remove(student.photo_path)
except OSError as e:
    from flask import current_app
    current_app.logger.warning(f'删除照片文件失败: {e}')

# 修复后 - 方法2：忽略特定错误
try:
    if student.photo_path and os.path.exists(student.photo_path):
        os.remove(student.photo_path)
except FileNotFoundError:
    # 文件不存在，可以忽略
    pass
except OSError as e:
    # 其他错误需要记录
    from flask import current_app
    current_app.logger.error(f'删除照片文件失败: {e}')
```

## 5. 添加分页功能

### 问题
使用 `.query.all()` 加载所有数据，性能差。

### 修复方法

```python
# 修复前
@bp.route('/api/students', methods=['GET'])
@login_required
def get_students():
    students = Student.query.all()
    return jsonify([s.to_dict() for s in students])

# 修复后
@bp.route('/api/students', methods=['GET'])
@login_required
def get_students():
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)  # 限制最大100
    status = request.args.get('status', '')
    
    query = Student.query
    if status:
        query = query.filter_by(status=status)
    
    pagination = query.paginate(
        page=page,
        per_page=per_page,
        error_out=False
    )
    
    return jsonify({
        'students': [s.to_dict() for s in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'per_page': per_page
    })
```

## 6. 优化数据库查询

### 问题
在 Python 中过滤数据而不是在数据库层面。

### 修复方法

```python
# 修复前
students = Student.query.all()
if status:
    students = [s for s in students if s.status == status]

# 修复后
query = Student.query
if status:
    query = query.filter_by(status=status)
students = query.all()
```

## 7. 添加数据验证

### 问题
没有验证数据格式和范围。

### 修复方法

创建验证函数：

```python
# utils/validators.py
import re
from flask import jsonify

def validate_email(email):
    """验证邮箱格式"""
    if not email:
        return True  # 可选字段
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_phone(phone):
    """验证电话号码格式"""
    if not phone:
        return True  # 可选字段
    # 简单的验证：只包含数字、空格、-、()
    pattern = r'^[\d\s\-()]+$'
    return re.match(pattern, phone) is not None

# 在路由中使用
@bp.route('/api/students', methods=['POST'])
@login_required
@require_permission('edit')
@handle_db_errors
@validate_json
@validate_required_fields('name')
def create_student():
    data = request.json
    
    # 验证姓名长度
    name = data['name'].strip()
    if len(name) > 50:
        return jsonify({'error': '姓名长度不能超过50个字符'}), 400
    
    # 验证邮箱
    email = data.get('email', '').strip()
    if email and not validate_email(email):
        return jsonify({'error': '邮箱格式不正确'}), 400
    
    # 验证电话
    phone = data.get('phone', '').strip()
    if phone and not validate_phone(phone):
        return jsonify({'error': '电话号码格式不正确'}), 400
    
    student = Student(
        name=name,
        email=email,
        phone=phone,
        ...
    )
    ...
```

## 8. 完整的修复示例

以下是一个完整的修复示例，包含所有最佳实践：

```python
from flask import Blueprint, request, jsonify
from flask_login import login_required
from extensions import db
from models import Student
from utils import (
    handle_db_errors, validate_json, validate_required_fields,
    require_permission, log_operation
)

bp = Blueprint('students', __name__)

@bp.route('/api/students', methods=['GET'])
@login_required
def get_students():
    """获取学生列表（带分页）"""
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    status = request.args.get('status', '')
    
    query = Student.query
    if status:
        query = query.filter_by(status=status)
    
    pagination = query.paginate(
        page=page,
        per_page=per_page,
        error_out=False
    )
    
    return jsonify({
        'students': [s.to_dict() for s in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'per_page': per_page
    })

@bp.route('/api/students', methods=['POST'])
@login_required
@require_permission('edit')
@handle_db_errors
@validate_json
@validate_required_fields('name')
def create_student():
    """创建学生"""
    data = request.json
    
    # 数据验证
    name = data['name'].strip()
    if not name:
        return jsonify({'error': '姓名不能为空'}), 400
    if len(name) > 50:
        return jsonify({'error': '姓名长度不能超过50个字符'}), 400
    
    # 创建学生
    student = Student(
        name=name,
        grade=data.get('grade', '').strip(),
        status=data.get('status', '在校'),
        phone=data.get('phone', '').strip(),
        parent_name=data.get('parent_name', '').strip(),
        parent_phone=data.get('parent_phone', '').strip(),
        address=data.get('address', '').strip(),
        email=data.get('email', '').strip(),
        notes=data.get('notes', '').strip()
    )
    
    db.session.add(student)
    db.session.commit()
    
    # 记录操作日志
    log_operation('students', 'create', 'Student', student.id, student.name)
    
    return jsonify(student.to_dict()), 201

@bp.route('/api/students/<int:student_id>', methods=['DELETE'])
@login_required
@require_permission('edit')
@handle_db_errors
def delete_student(student_id):
    """删除学生"""
    student = Student.query.get_or_404(student_id)
    student_name = student.name
    
    # 删除关联的照片文件
    if student.photo_path:
        try:
            import os
            if os.path.exists(student.photo_path):
                os.remove(student.photo_path)
        except OSError as e:
            from flask import current_app
            current_app.logger.warning(f'删除照片文件失败: {e}')
    
    db.session.delete(student)
    db.session.commit()
    
    # 记录操作日志
    log_operation('students', 'delete', 'Student', student_id, student_name)
    
    return jsonify({'success': True}), 200
```

## 实施建议

1. **逐步修复**：不要一次性修复所有问题，按优先级逐步修复
2. **测试**：每次修复后运行测试确保功能正常
3. **代码审查**：修复后进行代码审查
4. **文档更新**：更新相关文档

## 检查清单

修复后检查：
- [ ] 所有 API 端点都有 `@login_required`
- [ ] 修改操作都有 `@require_permission`
- [ ] 所有数据库操作都有错误处理
- [ ] 所有输入都经过验证
- [ ] 列表查询都有分页
- [ ] 异常都被正确处理和记录
