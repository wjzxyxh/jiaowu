# 教务管理系统功能完善建议

## 📋 检查日期：2025-01-13

基于代码审查，以下是可完善的功能清单。

---

## 🔒 一、安全性增强（高优先级）

### 1. 用户认证和权限管理 ⭐⭐⭐⭐⭐
**状态：❌ 未实现**

**问题：**
- 系统目前没有任何认证机制，任何人都可以访问和修改数据
- 没有用户管理功能
- 没有权限控制

**建议实现：**
- ✅ 添加用户登录/登出功能
- ✅ 实现基于角色的权限控制（管理员、教务、财务、只读等）
- ✅ 密码加密存储（使用 bcrypt）
- ✅ Session 管理（使用 Flask-Login）
- ✅ 登录日志记录
- ✅ 密码修改功能
- ✅ 密码强度验证

**技术方案：**
```python
# 需要添加的模型
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default='user')  # admin, teacher, finance, readonly
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.now)
    last_login = db.Column(db.DateTime)

class LoginLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    ip_address = db.Column(db.String(50))
    login_time = db.Column(db.DateTime, default=datetime.now)
    success = db.Column(db.Boolean)
```

**需要添加的依赖：**
```txt
Flask-Login>=0.6.0
bcrypt>=4.0.0
```

### 2. API 安全加固 ⭐⭐⭐⭐
**状态：⚠️ 部分实现**

**问题：**
- 没有 CSRF 保护
- 没有 API 请求频率限制
- 输入验证不够严格

**建议实现：**
- ✅ 添加 CSRF 保护（Flask-WTF）
- ✅ 实现 API 请求频率限制（Flask-Limiter）
- ✅ 加强输入数据验证和清理
- ✅ 敏感操作需要二次确认（删除、修改财务数据等）
- ✅ 添加请求日志记录

**技术方案：**
```python
from flask_wtf.csrf import CSRFProtect
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

csrf = CSRFProtect(app)
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)
```

### 3. 文件上传安全 ⭐⭐⭐
**状态：⚠️ 基础实现**

**已有功能：**
- ✅ 文件类型检查（扩展名）
- ✅ 文件大小限制（16MB）

**建议增强：**
- ✅ 文件内容验证（不仅仅是扩展名，检查文件头）
- ✅ 文件存储路径隔离（按类型分类存储）
- ✅ 文件名安全处理（防止路径遍历）
- ✅ 上传文件病毒扫描（可选，需要集成第三方服务）

---

## 💾 二、数据管理（高优先级）

### 4. 数据备份和恢复 ⭐⭐⭐⭐⭐
**状态：❌ 未实现**

**问题：**
- 完全没有备份功能，数据丢失风险高
- 没有数据恢复机制

**建议实现：**
- ✅ 自动定时备份（每天/每周）
- ✅ 手动备份功能
- ✅ 备份文件下载
- ✅ 数据恢复功能
- ✅ 备份文件管理（保留最近N个备份，自动清理旧备份）
- ✅ 备份文件压缩（节省空间）
- ✅ 备份到云存储（可选）

**技术方案：**
```python
@app.route('/api/backup', methods=['POST'])
def create_backup():
    """创建数据库备份"""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_filename = f'jiaowu_backup_{timestamp}.db'
    backup_path = os.path.join(basedir, 'backups', backup_filename)
    
    # 使用 SQLite 备份 API
    source = sqlite3.connect(app.config['SQLALCHEMY_DATABASE_URI'].replace('sqlite:///', ''))
    backup = sqlite3.connect(backup_path)
    source.backup(backup)
    backup.close()
    source.close()
    
    return jsonify({'success': True, 'filename': backup_filename})

@app.route('/api/restore', methods=['POST'])
def restore_backup():
    """恢复数据库备份"""
    # 需要二次确认
    # 恢复前先备份当前数据库
    # 执行恢复操作
    pass
```

### 5. 操作日志/审计日志 ⭐⭐⭐⭐
**状态：❌ 未实现**

**问题：**
- 没有操作历史记录，无法追溯问题
- 虽然有 TeacherCourseCostHistory 和 TeacherExperienceCostHistory，但这是针对特定功能的

**建议实现：**
- ✅ 记录所有关键操作（增删改）
- ✅ 记录操作人、时间、IP地址、操作类型
- ✅ 操作日志查询和导出
- ✅ 支持按用户、时间、操作类型、模块筛选
- ✅ 敏感操作高亮显示

**技术方案：**
```python
class OperationLog(db.Model):
    """操作日志表"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    username = db.Column(db.String(50), nullable=False)
    module = db.Column(db.String(50), nullable=False)  # students, teachers, courses, payments, finance
    operation = db.Column(db.String(20), nullable=False)  # create, update, delete
    entity_type = db.Column(db.String(50), nullable=False)  # Student, Teacher, Course
    entity_id = db.Column(db.Integer, nullable=True)
    entity_name = db.Column(db.String(200), nullable=True)  # 实体名称，如学生姓名
    old_data = db.Column(db.Text, nullable=True)  # JSON格式的旧数据
    new_data = db.Column(db.Text, nullable=True)  # JSON格式的新数据
    ip_address = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.now)
```

**使用装饰器记录操作：**
```python
def log_operation(module, operation):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # 记录操作前数据
            # 执行操作
            # 记录操作后数据
            # 保存日志
            return result
        return wrapper
    return decorator
```

### 6. 数据导入验证和错误处理 ⭐⭐⭐
**状态：⚠️ 基础实现**

**已有功能：**
- ✅ Excel 导入功能（学生、教师、课程、缴费）

**建议增强：**
- ✅ 导入前数据验证（格式、必填字段、数据有效性）
- ✅ 详细的错误报告（哪些行失败，原因）
- ✅ 支持部分导入（跳过错误行，继续导入）
- ✅ 导入预览功能（显示将要导入的数据）
- ✅ 导入模板下载（带示例数据）
- ✅ 导入历史记录

---

## 🎨 三、用户体验优化（中高优先级）

### 7. 通知提醒功能 ⭐⭐⭐⭐
**状态：❌ 未实现**

**问题：**
- 有 `min_hours_for_reminder` 配置，但没有实际提醒功能
- 没有系统通知中心

**建议实现：**
- ✅ 剩余课时不足提醒（在首页/统计页面显示）
- ✅ 即将到期的课程提醒
- ✅ 未确认课程提醒
- ✅ 缴费提醒（长期未缴费学生）
- ✅ 系统通知中心（显示所有未读通知）
- ✅ 通知标记已读/未读
- ✅ 通知分类（课时、缴费、课程、系统）

**技术方案：**
```python
class Notification(db.Model):
    """通知表"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)  # None表示所有用户
    type = db.Column(db.String(20), nullable=False)  # hours, payment, course, system
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    link = db.Column(db.String(500))  # 点击跳转的链接
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.now)
```

### 8. 首页数据概览 ⭐⭐⭐⭐
**状态：❌ 未实现**

**问题：**
- 首页只是功能入口，没有数据展示

**建议实现：**
- ✅ 关键指标展示（学生数、教师数、本月收入、本月利润等）
- ✅ 数据趋势图表（收入趋势、学生增长趋势）
- ✅ 待办事项提醒（未确认课程、课时不足学生等）
- ✅ 快速操作入口
- ✅ 最近操作记录

**技术方案：**
```python
@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    """获取首页统计数据"""
    today = date.today()
    current_month = today.strftime('%Y-%m')
    
    stats = {
        'total_students': Student.query.filter_by(status='在校').count(),
        'total_teachers': Teacher.query.filter_by(status='启用').count(),
        'monthly_revenue': FinanceRecord.query.filter_by(month=current_month).first().monthly_revenue if FinanceRecord.query.filter_by(month=current_month).first() else 0,
        'monthly_profit': FinanceRecord.query.filter_by(month=current_month).first().monthly_profit if FinanceRecord.query.filter_by(month=current_month).first() else 0,
        'unconfirmed_courses': StudentCourse.query.filter_by(is_confirmed=False, status='正常').count(),
        'low_hours_students': get_low_hours_students_count(),
    }
    return jsonify(stats)
```

### 9. 搜索功能增强 ⭐⭐⭐
**状态：⚠️ 基础实现**

**已有功能：**
- ✅ 各模块内的搜索功能

**建议增强：**
- ✅ 全局搜索（跨模块搜索学生、教师、课程）
- ✅ 高级搜索（多条件组合）
- ✅ 搜索历史
- ✅ 搜索建议/自动完成
- ✅ 搜索结果高亮

### 10. 批量操作扩展 ⭐⭐⭐
**状态：⚠️ 部分实现**

**已有功能：**
- ✅ 批量确认课程
- ✅ 批量取消确认

**建议增强：**
- ✅ 批量删除排课
- ✅ 批量修改课程状态
- ✅ 批量导出数据
- ✅ 批量导入学生/教师
- ✅ 批量修改学生信息（如批量修改年级）

### 11. 移动端适配 ⭐⭐⭐
**状态：⚠️ 基础实现**

**已有功能：**
- ✅ 响应式设计（部分）

**建议增强：**
- ✅ 响应式设计优化（更好的移动端体验）
- ✅ 触摸操作优化
- ✅ 移动端快捷操作
- ✅ 移动端专用界面（可选）

---

## 🚀 四、功能扩展（中优先级）

### 12. 课程冲突检测 ⭐⭐⭐⭐
**状态：✅ 已实现**

**已有功能：**
- ✅ 教师时间冲突检测
- ✅ 教室时间冲突检测
- ✅ 学生时间冲突检测
- ✅ `/api/courses/check-conflicts` 接口

**建议增强：**
- ✅ 冲突解决建议（推荐其他时段/教室）
- ✅ 冲突预警（提前提醒）

### 13. 短信/邮件通知 ⭐⭐⭐
**状态：❌ 未实现**

**建议实现：**
- ✅ 课程提醒短信/邮件
- ✅ 缴费提醒
- ✅ 课时不足提醒
- ✅ 系统通知

**技术方案：**
- 集成短信服务（阿里云、腾讯云等）
- 集成邮件服务（SMTP）
- 配置通知模板

### 14. 学生考勤管理 ⭐⭐⭐
**状态：❌ 未实现**

**建议实现：**
- ✅ 记录学生出勤情况（上课、请假、缺勤）
- ✅ 出勤率统计
- ✅ 缺勤提醒
- ✅ 考勤报表
- ✅ 考勤数据导出

**技术方案：**
```python
class Attendance(db.Model):
    """考勤表"""
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('student_courses.id'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    course_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), nullable=False)  # present, absent, leave
    remark = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.now)
```

### 15. 课程评价系统 ⭐⭐
**状态：❌ 未实现**

**建议实现：**
- ✅ 学生对课程/教师评价
- ✅ 评价统计和分析
- ✅ 评价历史记录
- ✅ 评价数据导出

### 16. 财务报表扩展 ⭐⭐⭐
**状态：⚠️ 基础实现**

**已有功能：**
- ✅ 财务统计页面
- ✅ 收入、成本、利润计算

**建议增强：**
- ✅ 更多财务报表类型（日报、周报、年报）
- ✅ 财务报表导出（PDF格式）
- ✅ 财务报表打印
- ✅ 财务数据对比分析（同比、环比）
- ✅ 财务数据图表可视化

### 17. 数据导出格式扩展 ⭐⭐
**状态：⚠️ 部分实现**

**已有功能：**
- ✅ Excel 导出

**建议增强：**
- ✅ PDF 导出
- ✅ CSV 导出
- ✅ Word 导出（可选）

---

## ⚡ 五、性能优化（中优先级）

### 18. 数据库查询优化 ⭐⭐⭐
**状态：⚠️ 需要优化**

**建议实现：**
- ✅ 添加数据库索引（常用查询字段）
- ✅ 查询结果缓存（Redis，可选）
- ✅ 分页优化
- ✅ 懒加载优化
- ✅ 批量查询优化

**需要添加索引的字段：**
```python
# 在 models.py 中添加索引
class StudentCourse(db.Model):
    # ...
    __table_args__ = (
        db.Index('idx_course_date', 'course_date'),
        db.Index('idx_teacher_date', 'teacher_id', 'course_date'),
        db.Index('idx_student_date', 'student_id', 'course_date'),
    )
```

### 19. 前端性能优化 ⭐⭐
**状态：⚠️ 需要优化**

**建议实现：**
- ✅ 代码压缩和合并
- ✅ 图片懒加载
- ✅ 虚拟滚动（长列表）
- ✅ 减少不必要的 API 调用
- ✅ 前端缓存策略

---

## 🛠️ 六、系统维护（中优先级）

### 20. API 文档 ⭐⭐⭐
**状态：❌ 未实现**

**建议实现：**
- ✅ 使用 Swagger/OpenAPI 生成 API 文档
- ✅ 接口使用示例
- ✅ 参数说明

**技术方案：**
```python
from flask_restx import Api, Resource, fields

api = Api(app, doc='/api/docs/')
```

### 21. 系统配置管理 ⭐⭐⭐
**状态：⚠️ 部分实现**

**已有功能：**
- ✅ FinanceConfig 表（财务配置）

**建议增强：**
- ✅ 系统设置页面
- ✅ 可配置项：提醒阈值、备份频率、默认值等
- ✅ 配置导入/导出
- ✅ 配置历史记录

### 22. 帮助文档 ⭐⭐
**状态：⚠️ 基础实现**

**已有功能：**
- ✅ README.md

**建议增强：**
- ✅ 用户手册（详细操作指南）
- ✅ 常见问题（FAQ）
- ✅ 操作视频/截图
- ✅ 在线帮助（页面内帮助）

### 23. 多语言支持 ⭐
**状态：❌ 未实现**

**建议实现：**
- ✅ 中英文切换
- ✅ 使用 Flask-Babel 实现国际化

---

## 📊 优先级总结

### 🔴 高优先级（建议优先实现）
1. ✅ **用户认证和权限管理** - 安全基础
2. ✅ **数据备份和恢复** - 数据安全
3. ✅ **操作日志/审计日志** - 可追溯性
4. ✅ **通知提醒功能** - 用户体验
5. ✅ **首页数据概览** - 信息展示
6. ✅ **API 安全加固** - 安全防护

### 🟡 中优先级（逐步完善）
7. 数据导入验证增强
8. 搜索功能增强
9. 批量操作扩展
10. 短信/邮件通知
11. 学生考勤管理
12. 财务报表扩展
13. 数据库查询优化
14. API 文档
15. 系统配置管理

### 🟢 低优先级（可选功能）
16. 数据可视化增强
17. 课程评价系统
18. 数据导出格式扩展
19. 前端性能优化
20. 帮助文档
21. 多语言支持

---

## 🎯 实施建议

### 第一阶段（核心安全）- 1-2周
1. 用户认证和权限管理
2. 数据备份和恢复
3. 操作日志

### 第二阶段（用户体验）- 1-2周
1. 通知提醒功能
2. 首页数据概览
3. API 安全加固

### 第三阶段（功能扩展）- 2-3周
1. 搜索功能增强
2. 批量操作扩展
3. 短信/邮件通知
4. 学生考勤管理

### 第四阶段（优化完善）- 持续
1. 性能优化
2. API 文档
3. 系统配置管理
4. 其他功能

---

## 📝 注意事项

- 在实现新功能时，注意保持向后兼容
- 数据库结构变更需要提供迁移脚本
- 重要功能上线前需要充分测试
- 建议使用版本控制（Git）管理代码
- 定期备份数据库
- 遵循 RESTful API 设计规范
- 代码注释要清晰
- 错误处理要完善

---

**最后更新：** 2025-01-13
**检查人：** AI Assistant
