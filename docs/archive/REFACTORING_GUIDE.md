# 代码重构指南

## 重构概述

本次重构将原本7000+行的`app.py`文件拆分为多个模块，提高代码的可维护性和可扩展性。

## 新的项目结构

```
jiaowu/
├── app.py                 # 主应用文件（应用工厂模式）
├── config.py              # 配置文件
├── extensions.py          # Flask扩展初始化
├── models.py              # 数据库模型（保持不变）
├── utils/                 # 工具函数
│   ├── __init__.py
│   ├── file_utils.py      # 文件处理工具
│   ├── log_utils.py       # 日志工具
│   ├── auth_utils.py      # 认证和权限工具
│   └── date_utils.py      # 日期工具
├── services/              # 业务逻辑服务层
│   ├── __init__.py
│   ├── notification_service.py  # 通知服务
│   ├── hours_service.py         # 课时统计服务
│   └── finance_service.py       # 财务计算服务
├── routes/                # 路由模块（待创建）
│   ├── __init__.py
│   ├── auth.py            # 认证相关路由
│   ├── students.py        # 学生管理路由
│   ├── teachers.py        # 教师管理路由
│   ├── courses.py         # 课程管理路由
│   ├── payments.py        # 缴费管理路由
│   ├── finance.py         # 财务管理路由
│   └── stats.py           # 统计相关路由
└── database/              # 数据库相关
    ├── __init__.py
    ├── migrations.py      # 数据库迁移
    └── init_data.py       # 初始化数据
```

## 已完成的重构

### 1. 配置文件 (`config.py`)
- 提取了所有配置项
- 支持开发和生产环境配置

### 2. 扩展初始化 (`extensions.py`)
- 统一管理Flask扩展的初始化
- 包括SQLAlchemy、LoginManager、CSRFProtect、Limiter

### 3. 工具函数 (`utils/`)
- `file_utils.py`: 文件处理相关函数
- `log_utils.py`: 日志记录相关函数
- `auth_utils.py`: 权限检查装饰器
- `date_utils.py`: 日期处理相关函数

### 4. 业务逻辑服务层 (`services/`)
- `notification_service.py`: 通知创建和检查
- `hours_service.py`: 课时统计相关业务逻辑
- `finance_service.py`: 财务计算相关业务逻辑

### 5. 数据库初始化 (`database/`)
- `init_data.py`: 初始化默认数据
- `migrations.py`: 数据库迁移框架（待完善）

## 待完成的重构

### 1. 路由模块拆分 (`routes/`)

需要将`app.py`中的路由按功能拆分到以下文件：

- `routes/auth.py`: 登录、登出、用户信息
- `routes/students.py`: 学生管理相关API
- `routes/teachers.py`: 教师管理相关API
- `routes/courses.py`: 课程管理相关API
- `routes/payments.py`: 缴费管理相关API
- `routes/finance.py`: 财务管理相关API
- `routes/stats.py`: 统计相关API
- `routes/calendar.py`: 日历相关API

### 2. 数据库迁移 (`database/migrations.py`)

需要将`app.py`中的所有`upgrade_*`函数迁移到`database/migrations.py`中。

### 3. 重构主应用文件 (`app.py`)

将`app.py`重构为应用工厂模式：

```python
from flask import Flask
from config import config
from extensions import init_extensions
from database import run_migrations, init_default_data

def create_app(config_name='default'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    
    # 初始化扩展
    init_extensions(app)
    
    # 注册蓝图
    from routes import auth, students, teachers, courses, payments, finance, stats, calendar
    app.register_blueprint(auth.bp)
    app.register_blueprint(students.bp)
    app.register_blueprint(teachers.bp)
    app.register_blueprint(courses.bp)
    app.register_blueprint(payments.bp)
    app.register_blueprint(finance.bp)
    app.register_blueprint(stats.bp)
    app.register_blueprint(calendar.bp)
    
    # 初始化数据库
    with app.app_context():
        run_migrations()
        db.create_all()
        init_default_data()
    
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)
```

## 使用新的模块

### 导入工具函数

```python
from utils import allowed_file, log_operation, require_permission, get_current_month
```

### 导入服务层

```python
from services import (
    create_notification,
    update_class_hours_stats,
    update_finance_record
)
```

### 使用权限装饰器

```python
from utils import require_permission

@require_permission('admin')
def admin_only_function():
    pass
```

## 迁移步骤

1. **逐步迁移路由**: 将`app.py`中的路由函数逐个迁移到对应的路由模块
2. **迁移数据库升级函数**: 将`upgrade_*`函数迁移到`database/migrations.py`
3. **更新导入**: 更新所有文件中的导入语句
4. **测试**: 确保所有功能正常工作
5. **清理**: 删除`app.py`中的旧代码

## 注意事项

1. 保持向后兼容：确保重构后的代码功能完全一致
2. 逐步迁移：不要一次性迁移所有代码，分模块进行
3. 充分测试：每个模块迁移后都要进行测试
4. 保持代码风格一致：遵循PEP 8规范

## 下一步

1. 创建路由模块并迁移路由函数
2. 完善数据库迁移函数
3. 重构主应用文件为应用工厂模式
4. 更新所有导入语句
5. 进行全面测试
