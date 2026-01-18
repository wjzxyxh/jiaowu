# CSRF和文件上传安全修复说明

## 修复内容

### 1. ✅ CSRF保护已启用

**修复位置**: `config.py:50`

**修改内容**:
```python
# 修复前
WTF_CSRF_CHECK_DEFAULT = False  # 默认不检查CSRF

# 修复后
WTF_CSRF_CHECK_DEFAULT = True  # 启用CSRF保护（默认检查）
```

**说明**:
- Flask-WTF会自动为JSON API请求（Content-Type: application/json）豁免CSRF检查
- 对于文件上传（multipart/form-data），需要CSRF token
- 所有JSON API端点不受影响，因为会自动豁免

**注意**: 
- 如果文件上传功能出现CSRF错误，需要在前端表单中添加CSRF token
- 可以通过 `<meta name="csrf-token" content="{{ csrf_token() }}">` 在HTML中提供token
- 或者在JavaScript中从cookie获取CSRF token（Flask-WTF会自动设置cookie）

### 2. ✅ 文件上传验证增强

**修复位置**: 
- `utils/file_validator.py` - 新建文件验证工具
- `routes/students.py` - 学生照片上传验证
- `routes/teachers.py` - 教师简历上传验证

**修改内容**:
1. 创建了 `validate_file_mime_type()` 函数，用于验证文件的真实MIME类型
2. 支持使用 `python-magic` 库检查文件内容（如果可用）
3. 如果没有 `python-magic`，回退到检查Content-Type头

**使用方法**:
```python
from utils import validate_file_mime_type

# 验证文件
is_valid, error_msg = validate_file_mime_type(photo_file, {'jpg', 'jpeg', 'png', 'gif'})
if not is_valid:
    return jsonify({'error': error_msg or '文件类型验证失败'}), 400
```

**安装python-magic（可选，但推荐）**:
```bash
# Linux
sudo apt-get install libmagic1
pip install python-magic

# macOS
brew install libmagic
pip install python-magic

# Windows
pip install python-magic-bin
```

**注意**: 
- 如果未安装 `python-magic`，系统会使用Content-Type头进行验证（不够安全，但比没有好）
- 建议安装 `python-magic` 以获得最佳安全性

## 修复的文件

1. `config.py` - 启用CSRF保护
2. `utils/file_validator.py` - 新建文件验证工具
3. `utils/__init__.py` - 导出新的验证函数
4. `routes/students.py` - 增强照片上传验证（2处）
5. `routes/teachers.py` - 增强简历上传验证（2处）
6. `requirements.txt` - 添加python-magic注释

## 测试建议

1. **CSRF保护测试**:
   - 测试JSON API端点是否正常工作（应该自动豁免）
   - 测试文件上传是否正常工作（如果出错，需要添加CSRF token支持）

2. **文件上传验证测试**:
   - 测试正常文件上传
   - 测试恶意文件上传（如PHP文件改扩展名为.jpg）
   - 如果安装了python-magic，测试是否能够正确识别文件类型

## 如果文件上传出现CSRF错误

如果启用CSRF后，文件上传出现CSRF token错误，需要在前端添加CSRF token支持：

### 方法1：在HTML中添加meta标签

在模板中添加：
```html
<meta name="csrf-token" content="{{ csrf_token() }}">
```

在JavaScript中获取：
```javascript
const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
```

### 方法2：从cookie获取（Flask-WTF自动设置）

```javascript
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

const csrfToken = getCookie('csrf_token');
```

### 方法3：使用FormData（如果使用原生表单提交）

如果使用原生HTML表单（`<form>`），Flask-WTF会自动从表单中读取CSRF token。

对于使用JavaScript的FormData，需要添加CSRF字段：
```javascript
const formData = new FormData(form);
formData.append('csrf_token', csrfToken);
```

## 回退方案（如果CSRF导致问题）

如果启用CSRF后导致问题，可以暂时回退：

```python
# config.py
WTF_CSRF_CHECK_DEFAULT = False  # 临时禁用
```

但这不是推荐的长期解决方案。应该修复前端以支持CSRF token。
