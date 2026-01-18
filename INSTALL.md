# 安装说明

## 问题解决

如果遇到 `ModuleNotFoundError: No module named 'flask_sqlalchemy'` 错误，请按照以下步骤安装依赖：

### 方法1：使用默认PyPI源（推荐）

```bash
# 使用默认PyPI源安装
/Library/Frameworks/Python.framework/Versions/3.8/bin/python3.8 -m pip install Flask Flask-SQLAlchemy
```

### 方法2：如果方法1失败，尝试使用用户安装

```bash
/Library/Frameworks/Python.framework/Versions/3.8/bin/python3.8 -m pip install --user Flask Flask-SQLAlchemy
```

### 方法3：如果遇到SSL证书问题，使用信任主机选项

```bash
/Library/Frameworks/Python.framework/Versions/3.8/bin/python3.8 -m pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org Flask Flask-SQLAlchemy
```

### 方法4：使用sudo（如果以上方法都失败）

```bash
sudo /Library/Frameworks/Python.framework/Versions/3.8/bin/python3.8 -m pip install Flask Flask-SQLAlchemy
```

或者使用sudo的-H标志：

```bash
sudo -H /Library/Frameworks/Python.framework/Versions/3.8/bin/python3.8 -m pip install Flask Flask-SQLAlchemy
```

## 验证安装

安装完成后，可以验证是否安装成功：

```bash
/Library/Frameworks/Python.framework/Versions/3.8/bin/python3.8 -c "import flask; import flask_sqlalchemy; print('安装成功！')"
```

## 运行应用

安装完依赖后，运行：

```bash
/Library/Frameworks/Python.framework/Versions/3.8/bin/python3.8 app.py
```

或者：

```bash
python3 app.py
```

## 常见问题

### 1. SSL证书错误
如果遇到SSL证书错误，可以临时禁用SSL验证（不推荐，但可以临时使用）：
```bash
/Library/Frameworks/Python.framework/Versions/3.8/bin/python3.8 -m pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org Flask Flask-SQLAlchemy
```

### 2. 权限错误
如果遇到权限错误，使用 `--user` 标志进行用户级安装，或使用 `sudo`。

### 3. 使用虚拟环境（推荐）
为了避免系统Python环境冲突，建议使用虚拟环境：

```bash
# 创建虚拟环境
/Library/Frameworks/Python.framework/Versions/3.8/bin/python3.8 -m venv venv

# 激活虚拟环境（macOS/Linux）
source venv/bin/activate

# 安装依赖
pip install Flask Flask-SQLAlchemy

# 运行应用
python app.py
```

