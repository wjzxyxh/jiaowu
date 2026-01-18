# MySQL 数据库配置指南

## 概述

本系统现在支持 MySQL 数据库。默认情况下使用 SQLite，但可以通过环境变量切换到 MySQL。

## 安装 MySQL 驱动

首先安装 MySQL Python 驱动：

```bash
pip install PyMySQL
```

或者使用 requirements.txt：

```bash
pip install -r requirements.txt
```

## 配置 MySQL 数据库

### 1. 创建数据库

在 MySQL 中创建数据库：

```sql
CREATE DATABASE jiaowu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. 配置数据库连接

#### 方法1：使用环境变量（推荐）

设置 `DATABASE_URL` 环境变量：

```bash
# Linux/macOS
export DATABASE_URL="mysql+pymysql://用户名:密码@localhost:3306/jiaowu?charset=utf8mb4"

# Windows
set DATABASE_URL=mysql+pymysql://用户名:密码@localhost:3306/jiaowu?charset=utf8mb4
```

#### 方法2：修改 config.py

在 `config.py` 中直接设置：

```python
SQLALCHEMY_DATABASE_URI = "mysql+pymysql://用户名:密码@localhost:3306/jiaowu?charset=utf8mb4"
```

### 3. 连接字符串格式

MySQL 连接字符串格式：

```
mysql+pymysql://用户名:密码@主机:端口/数据库名?charset=utf8mb4
```

示例：

```
mysql+pymysql://root:password@localhost:3306/jiaowu?charset=utf8mb4
mysql+pymysql://user:pass@192.168.1.100:3306/jiaowu?charset=utf8mb4
```

### 4. 运行应用

配置完成后，正常运行应用：

```bash
python app.py
```

应用启动时会自动：
- 检测数据库类型
- 运行数据库迁移
- 创建所有必要的表结构

## 数据库迁移

系统会自动检测数据库类型并运行相应的迁移脚本。迁移代码已经兼容 SQLite 和 MySQL。

## 注意事项

1. **字符集**：建议使用 `utf8mb4` 字符集以支持完整的 Unicode 字符（包括 emoji）

2. **连接池**：系统已配置连接池，默认大小为 10，最大溢出 20

3. **时区**：确保 MySQL 服务器的时区设置正确

4. **权限**：确保数据库用户有创建表、修改表结构的权限

5. **备份**：在生产环境切换数据库前，请先备份现有数据

## 从 SQLite 迁移到 MySQL

如果需要将现有 SQLite 数据迁移到 MySQL：

1. 导出 SQLite 数据
2. 转换数据格式（注意日期时间格式）
3. 导入到 MySQL
4. 配置应用使用 MySQL

或者使用数据库迁移工具如 `sqlalchemy-migrate` 或 `alembic`。

## 回退到 SQLite

如果需要回退到 SQLite，只需：

1. 删除或注释掉 `DATABASE_URL` 环境变量
2. 重启应用

应用会自动使用 SQLite 数据库（`jiaowu.db` 文件）。
