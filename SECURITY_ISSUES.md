# 安全漏洞检查报告

## 🔴 严重安全问题

### 1. 文件上传路径遍历漏洞 ⚠️ 严重

**位置**: `app.py:48-50`

**问题**:
```python
@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
```

**漏洞描述**: 
- `send_from_directory` 虽然会阻止路径遍历，但最好显式验证
- 没有验证文件是否真的存在于上传目录中
- 没有检查文件类型是否允许访问

**影响**: 攻击者可能通过路径遍历访问系统其他文件

**修复建议**:
```python
@app.route('/uploads/<path:filename>')
@login_required
def uploaded_file(filename):
    # 验证文件名，防止路径遍历
    if '..' in filename or filename.startswith('/'):
        return jsonify({'error': '非法文件名'}), 400
    
    # 确保文件在上传目录中
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(file_path):
        return jsonify({'error': '文件不存在'}), 404
    
    # 确保路径在上传目录内（防止路径遍历）
    real_path = os.path.realpath(file_path)
    upload_dir = os.path.realpath(app.config['UPLOAD_FOLDER'])
    if not real_path.startswith(upload_dir):
        return jsonify({'error': '非法文件路径'}), 403
    
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
```

### 2. CSRF保护未启用 ⚠️ 严重

**位置**: `config.py:50`

**问题**:
```python
WTF_CSRF_CHECK_DEFAULT = False  # 默认不检查CSRF
```

**漏洞描述**: 
- CSRF保护已启用但默认不检查
- 没有看到在路由中显式启用CSRF检查
- API端点可能受到CSRF攻击

**影响**: 攻击者可以伪造请求，执行未授权操作

**修复建议**:
1. 对于API端点，使用CSRF token或检查Origin/Referer头
2. 对于表单提交，确保CSRF token被验证
3. 或者为API端点添加CSRF豁免（如果使用token认证）

### 3. 文件上传验证不足 ⚠️ 严重

**位置**: `routes/students.py`, `routes/teachers.py`

**问题**:
- 只检查文件扩展名，没有检查文件内容（MIME类型）
- 没有限制文件大小（虽然有MAX_CONTENT_LENGTH，但需要验证）
- 没有扫描恶意文件

**漏洞描述**: 
- 攻击者可以上传恶意文件（如PHP文件，但修改扩展名为.jpg）
- 可能导致服务器被攻击

**修复建议**:
```python
import magic  # python-magic库

def validate_file_content(file_storage):
    """验证文件内容，不仅仅是扩展名"""
    file_content = file_storage.read()
    file_storage.seek(0)  # 重置文件指针
    
    # 检查MIME类型
    mime_type = magic.from_buffer(file_content, mime=True)
    allowed_mimes = {
        'image/jpeg', 'image/png', 'image/gif',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
    
    if mime_type not in allowed_mimes:
        return False
    
    # 检查文件大小
    if len(file_content) > 16 * 1024 * 1024:  # 16MB
        return False
    
    return True
```

### 4. 敏感信息泄露 ⚠️ 中等

**位置**: 
- `routes/auth.py:175-176` - 打印用户ID和Session ID
- `utils/error_handlers.py:34` - 开发环境返回详细错误信息

**问题**:
- 调试信息可能泄露到日志或控制台
- 错误消息可能包含敏感信息

**影响**: 可能泄露系统内部信息

**修复建议**:
- 移除或注释掉调试print语句
- 确保生产环境不返回详细错误信息（已部分实现）

## 🟡 中等安全问题

### 5. Session安全问题 ⚠️ 中等

**位置**: `config.py:17`

**问题**:
```python
SESSION_COOKIE_SECURE = False  # 开发环境设为False
```

**漏洞描述**: 
- 生产环境如果使用HTTP，session cookie可能被窃取
- 需要HTTPS才能安全使用

**修复建议**:
- 生产环境必须设置 `SESSION_COOKIE_SECURE = True`
- 确保使用HTTPS

### 6. 缺少速率限制 ⚠️ 中等

**位置**: 多个路由文件

**问题**:
- 虽然配置了Flask-Limiter，但没有看到在路由中使用
- 登录端点没有速率限制，可能被暴力破解

**影响**: 可能被暴力破解攻击

**修复建议**:
```python
from extensions import limiter

@bp.route('/api/login', methods=['POST'])
@limiter.limit("5 per minute")  # 每分钟最多5次
def login():
    ...
```

### 7. 密码策略不足 ⚠️ 中等

**位置**: `models.py:User.set_password()`

**问题**:
- 没有密码强度要求
- 没有密码长度限制
- 没有密码历史检查

**修复建议**:
```python
def validate_password_strength(password):
    """验证密码强度"""
    if len(password) < 8:
        return False, '密码长度至少8位'
    if not any(c.isdigit() for c in password):
        return False, '密码必须包含数字'
    if not any(c.isalpha() for c in password):
        return False, '密码必须包含字母'
    return True, None
```

### 8. 缺少输入长度限制 ⚠️ 中等

**位置**: 多个路由文件

**问题**:
- 虽然数据库字段有长度限制，但API层面没有验证
- 可能导致数据库错误或DoS

**修复建议**:
- 在API层面添加字段长度验证
- 返回友好的错误消息

## 🟢 轻微安全问题

### 9. 错误消息信息泄露 ⚠️ 轻微

**位置**: `utils/error_handlers.py`

**问题**:
- 开发环境返回详细错误信息可能泄露系统信息

**修复建议**:
- 确保生产环境不返回详细错误（已部分实现）
- 统一错误消息格式

### 10. 日志可能包含敏感信息 ⚠️ 轻微

**位置**: `utils/logging_config.py`

**问题**:
- 日志可能记录敏感信息（如密码、token等）

**修复建议**:
- 在记录日志前过滤敏感信息
- 使用日志脱敏工具

## 📋 修复优先级

### P0 - 立即修复（严重）
1. ✅ 修复文件上传路径遍历漏洞
2. ✅ 启用CSRF保护或添加替代方案
3. ✅ 增强文件上传验证

### P1 - 短期修复（中等）
4. ✅ 添加速率限制（特别是登录端点）
5. ✅ 修复Session安全问题（生产环境）
6. ✅ 添加密码策略

### P2 - 中期改进（轻微）
7. ✅ 移除调试信息
8. ✅ 改进错误处理
9. ✅ 日志脱敏

## 🔧 快速修复示例

### 修复文件上传路径遍历

```python
# app.py
import os
from flask import jsonify
from flask_login import login_required

@app.route('/uploads/<path:filename>')
@login_required
def uploaded_file(filename):
    # 验证文件名，防止路径遍历
    if '..' in filename or filename.startswith('/'):
        return jsonify({'error': '非法文件名'}), 400
    
    # 确保文件在上传目录中
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(file_path):
        return jsonify({'error': '文件不存在'}), 404
    
    # 确保路径在上传目录内（防止路径遍历）
    real_path = os.path.realpath(file_path)
    upload_dir = os.path.realpath(app.config['UPLOAD_FOLDER'])
    if not real_path.startswith(upload_dir):
        return jsonify({'error': '非法文件路径'}), 403
    
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
```

### 添加登录速率限制

```python
# routes/auth.py
from extensions import limiter

@bp.route('/api/login', methods=['POST'])
@limiter.limit("5 per minute")
def login():
    ...
```

### 启用CSRF保护（API使用token的情况）

```python
# config.py
# 对于API端点，如果使用token认证，可以豁免CSRF
# 但需要确保token安全

# 或者为API端点添加CSRF token验证
from flask_wtf.csrf import CSRFProtect

# 在需要CSRF保护的路由上
@bp.route('/api/students', methods=['POST'])
@csrf.exempt  # 如果使用token认证
# 或
# 确保前端发送CSRF token
```

## 📝 安全检查清单

- [ ] 修复文件上传路径遍历
- [ ] 启用CSRF保护或添加替代方案
- [ ] 增强文件上传验证（MIME类型检查）
- [ ] 添加登录速率限制
- [ ] 移除调试print语句
- [ ] 生产环境设置SESSION_COOKIE_SECURE = True
- [ ] 添加密码策略
- [ ] 添加输入长度验证
- [ ] 日志脱敏
- [ ] 安全审计

## 🔍 其他建议

1. **定期安全审计**: 定期进行安全审计和渗透测试
2. **依赖更新**: 定期更新依赖包，修复已知漏洞
3. **安全头**: 添加安全HTTP头（X-Frame-Options, X-Content-Type-Options等）
4. **HTTPS**: 生产环境必须使用HTTPS
5. **备份**: 定期备份数据库和重要文件
6. **监控**: 添加安全监控和告警
