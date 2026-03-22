# 安全功能实现说明

## ✅ 已实现的功能

### 1. 用户认证和权限管理

#### 功能说明
- ✅ 用户登录/登出功能
- ✅ 基于角色的权限控制（admin、teacher、finance、readonly）
- ✅ 密码加密存储（使用 bcrypt）
- ✅ Session 管理（使用 Flask-Login）
- ✅ 登录日志记录

#### 默认管理员账号
- **用户名：** admin
- **密码：** admin123
- **角色：** admin（管理员）

⚠️ **重要：首次登录后请立即修改密码！**

#### 用户角色说明
- **admin（管理员）**：拥有所有权限，可以管理用户、查看操作日志
- **teacher（教务）**：可以管理学生、教师、排课等
- **finance（财务）**：可以管理财务数据、缴费等
- **readonly（只读）**：只能查看数据，不能修改

#### API接口
- `POST /api/login` - 用户登录
- `POST /api/logout` - 用户登出
- `GET /api/current-user` - 获取当前登录用户
- `GET /api/users` - 获取用户列表（需要管理员权限）
- `POST /api/users` - 创建用户（需要管理员权限）
- `PUT /api/users/<id>` - 更新用户（需要管理员权限）
- `DELETE /api/users/<id>` - 删除用户（需要管理员权限）

---

### 2. 操作日志/审计日志

#### 功能说明
- ✅ 记录所有关键操作（增删改）
- ✅ 记录操作人、时间、IP地址、操作类型
- ✅ 操作日志查询和导出
- ✅ 支持按用户、时间、操作类型、模块筛选

#### 记录的模块
- students（学生管理）
- teachers（教师管理）
- courses（排课管理）
- payments（缴费管理）
- finance（财务管理）
- users（用户管理）

#### API接口
- `GET /api/operation-logs` - 获取操作日志（需要管理员权限）
  - 参数：page, per_page, module, operation, username, start_date, end_date

---

### 3. 通知提醒功能

#### 功能说明
- ✅ 剩余课时不足提醒
- ✅ 未确认课程提醒
- ✅ 系统通知中心
- ✅ 通知标记已读/未读
- ✅ 通知分类（hours、payment、course、system）

#### 自动检查
系统会自动检查以下情况并创建通知：
- 学生剩余课时低于配置阈值
- 今天和明天的未确认课程

#### API接口
- `GET /api/notifications` - 获取通知列表
- `GET /api/notifications/unread-count` - 获取未读通知数量
- `POST /api/notifications/<id>/read` - 标记通知为已读
- `POST /api/notifications/mark-all-read` - 标记所有通知为已读

---

### 4. 首页数据概览

#### 功能说明
- ✅ 关键指标展示
  - 在校学生数
  - 启用教师数
  - 本月收入
  - 本月利润
  - 未确认课程数
  - 课时不足学生数
- ✅ 通知中心展示
- ✅ 自动刷新（每30秒）

#### API接口
- `GET /api/dashboard/stats` - 获取首页统计数据

---

### 5. API 安全加固

#### 功能说明
- ✅ CSRF 保护（使用 Flask-WTF）
- ✅ 请求频率限制（使用 Flask-Limiter）
  - 默认限制：200次/天，50次/小时
  - 登录接口：5次/分钟
- ✅ 权限检查装饰器
- ✅ 输入验证和错误处理

#### 权限装饰器
```python
@require_permission('edit')    # 需要编辑权限
@require_permission('finance') # 需要财务权限
@require_permission('admin')   # 需要管理员权限
```

---

## 📦 新增依赖

已更新 `requirements.txt`，新增以下依赖：
- Flask-Login>=0.6.0
- Flask-WTF>=1.0.0
- Flask-Limiter>=2.6.0
- bcrypt>=4.0.0

安装方法：
```bash
pip install -r requirements.txt
```

---

## 🚀 使用说明

### 1. 首次启动

1. 安装依赖：
   ```bash
   pip install -r requirements.txt
   ```

2. 启动应用：
   ```bash
   python app.py
   ```

3. 访问系统：
   - 打开浏览器访问：http://localhost 或 http://localhost:80
   - 会自动跳转到登录页面

4. 使用默认管理员账号登录：
   - 用户名：admin
   - 密码：admin123

5. **重要：登录后立即修改密码！**

### 2. 创建新用户

1. 使用管理员账号登录
2. 访问用户管理页面（需要添加前端页面）或使用API：
   ```bash
   curl -X POST http://localhost/api/users \
     -H "Content-Type: application/json" \
     -d '{
       "username": "teacher1",
       "password": "password123",
       "role": "teacher",
       "real_name": "张老师"
     }'
   ```

### 3. 查看操作日志

使用管理员账号访问：
```
GET /api/operation-logs?page=1&per_page=50
```

### 4. 查看通知

通知会自动显示在首页，也可以使用API：
```
GET /api/notifications
```

---

## 🔒 安全建议

1. **修改默认密码**：首次登录后立即修改管理员密码
2. **设置强密码**：密码应包含大小写字母、数字和特殊字符
3. **定期审查日志**：定期查看操作日志，发现异常操作
4. **权限最小化**：只给用户分配必要的权限
5. **生产环境配置**：
   - 修改 `SECRET_KEY`（在环境变量中设置）
   - 使用HTTPS
   - 配置防火墙规则
   - 定期备份数据库

---

## 📝 注意事项

1. **CSRF保护**：目前CSRF保护默认关闭，如需启用，需要在表单中添加CSRF token
2. **Session管理**：Session默认存储在服务器内存中，重启服务器会丢失。生产环境建议使用Redis等持久化存储
3. **密码加密**：使用bcrypt加密，旧密码格式不兼容
4. **权限检查**：所有需要权限的操作都已添加权限检查，只读用户无法执行修改操作

---

## 🐛 已知问题

1. 前端页面需要更新以支持登录状态检查
2. 部分API接口需要添加权限检查（待完善）
3. CSRF token在前端表单中需要手动添加（可选）

---

## 📅 更新日期

2025-01-13
