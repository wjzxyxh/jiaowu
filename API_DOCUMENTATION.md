# 后端 API 文档

## 基础信息

- **Base URL**: `http://118.31.105.86:5000` (生产环境) 或 `http://localhost:5000` (开发环境)
- **API 前缀**: `/api`
- **认证方式**: Cookie-based (Flask-Login)
- **数据格式**: JSON

## 认证相关 API

### 登录
- **POST** `/api/login`
- **描述**: 用户登录
- **请求体**:
  ```json
  {
    "username": "string",
    "password": "string"
  }
  ```
- **响应**: 返回用户信息和登录状态

### 登出
- **POST** `/api/logout`
- **描述**: 用户登出
- **需要登录**: 是

### 获取当前用户
- **GET** `/api/current-user`
- **描述**: 获取当前登录用户信息
- **需要登录**: 是

---

## 学生管理 API

### 获取学生列表
- **GET** `/api/students`
- **描述**: 获取所有学生（支持筛选和分页）
- **查询参数**:
  - `status`: 状态筛选（可选，如：在校、毕业等）
  - `page`: 页码（可选，默认1）
  - `per_page`: 每页数量（可选，默认10）
- **需要登录**: 是

### 创建学生
- **POST** `/api/students`
- **描述**: 创建新学生
- **需要登录**: 是
- **需要权限**: `edit`
- **请求体**: 学生信息（JSON）

### 更新学生
- **PUT** `/api/students/<student_id>`
- **描述**: 更新学生信息
- **需要登录**: 是
- **需要权限**: `edit`

### 删除学生
- **DELETE** `/api/students/<student_id>`
- **描述**: 删除学生
- **需要登录**: 是
- **需要权限**: `edit`

### 获取学生剩余课时
- **GET** `/api/students/<student_id>/remaining-hours`
- **描述**: 获取学生的剩余课时
- **需要登录**: 是

### 获取学生照片
- **GET** `/api/students/<student_id>/photo`
- **描述**: 获取学生照片
- **需要登录**: 是

### 获取学生已缴费课程
- **GET** `/api/students/<student_id>/paid-courses`
- **描述**: 获取学生已缴费的课程列表
- **需要登录**: 是

### 获取需要排课的已缴费课程
- **GET** `/api/students/paid-courses-need-scheduling`
- **描述**: 获取所有已缴费但需要排课的学生课程列表
- **需要登录**: 是

### 学生课程默认排课设置
- **GET/PUT** `/api/students/<student_id>/courses/<course_id>/default-schedule`
- **描述**: 获取或更新学生课程的默认排课设置（时段、星期）
- **需要登录**: 是

---

## 教师管理 API

### 获取教师列表
- **GET** `/api/teachers`
- **描述**: 获取所有教师
- **查询参数**:
  - `status`: 状态筛选（可选，如：启用、停用）
- **需要登录**: 是

### 创建教师
- **POST** `/api/teachers`
- **描述**: 创建新教师
- **需要登录**: 是
- **需要权限**: `edit`
- **请求体**: 教师信息（JSON，支持文件上传）

### 更新教师
- **PUT** `/api/teachers/<teacher_id>`
- **描述**: 更新教师信息
- **需要登录**: 是
- **需要权限**: `edit`

### 删除教师
- **DELETE** `/api/teachers/<teacher_id>`
- **描述**: 删除教师
- **需要登录**: 是
- **需要权限**: `edit`

### 获取教师简历
- **GET** `/api/teachers/<teacher_id>/resume`
- **描述**: 获取教师简历文件
- **需要登录**: 是

---

## 排课管理 API

### 获取排课列表
- **GET** `/api/courses`
- **描述**: 获取排课列表
- **查询参数**:
  - `month`: 月份（格式：YYYY-MM）
  - `week`: 周数（1-5）
  - `teacher`: 教师筛选
  - `classroom`: 教室筛选
  - `subject`: 科目筛选
  - `grade`: 年级筛选
- **限流**: 200次/分钟

### 创建排课
- **POST** `/api/courses`
- **描述**: 创建新排课
- **需要登录**: 是
- **请求体**: 排课信息（JSON）

### 更新排课
- **PUT** `/api/courses/<course_id>`
- **描述**: 更新排课信息
- **需要登录**: 是

### 删除排课
- **DELETE** `/api/courses/<course_id>`
- **描述**: 删除排课
- **需要登录**: 是

### 确认排课
- **POST** `/api/courses/<course_id>/confirm`
- **描述**: 确认排课已上（扣除剩余课时）
- **需要登录**: 是

### 批量确认排课
- **POST** `/api/courses/batch-confirm`
- **描述**: 批量确认排课
- **需要登录**: 是
- **请求体**: `{ "course_ids": [1, 2, 3] }`

### 批量取消确认
- **POST** `/api/courses/batch-cancel-confirm`
- **描述**: 批量取消确认排课
- **需要登录**: 是
- **请求体**: `{ "course_ids": [1, 2, 3] }`

### 检查排课冲突
- **POST** `/api/courses/check-conflicts`
- **描述**: 检查排课是否存在冲突（教师、教室、学生时间冲突）
- **需要登录**: 是
- **请求体**: 排课信息（JSON）

### 获取学生上次排课时段
- **GET** `/api/courses/last-time-slot/<student_id>`
- **描述**: 获取学生上次排课的时段

---

## 课程管理 API

### 获取课程列表
- **GET** `/api/courses_manage`
- **描述**: 获取所有课程
- **查询参数**:
  - `status`: 状态筛选（可选）

### 获取课程名称列表
- **GET** `/api/courses_manage/names`
- **描述**: 获取所有课程名称列表

### 获取科目列表
- **GET** `/api/courses_manage/subjects`
- **描述**: 获取所有科目列表（去重）

### 创建课程
- **POST** `/api/courses_manage`
- **描述**: 创建新课程
- **需要登录**: 是

### 更新课程
- **PUT** `/api/courses_manage/<course_id>`
- **描述**: 更新课程信息
- **需要登录**: 是

### 删除课程
- **DELETE** `/api/courses_manage/<course_id>`
- **描述**: 删除课程
- **需要登录**: 是

### 重置课程
- **POST** `/api/courses_manage/reset`
- **描述**: 重置课程数据
- **需要登录**: 是

---

## 缴费管理 API

### 获取缴费记录
- **GET** `/api/payments`
- **描述**: 获取所有缴费记录
- **查询参数**:
  - `year`: 年份筛选
  - `month`: 月份筛选
  - `student_id`: 学生ID筛选
  - `type`: 类型筛选（缴费、退费）
  - `status`: 状态筛选
- **需要登录**: 是

### 创建缴费记录
- **POST** `/api/payments`
- **描述**: 创建新缴费记录
- **需要登录**: 是
- **需要权限**: `edit`
- **请求体**: 缴费信息（JSON）

### 删除缴费记录
- **DELETE** `/api/payments/<payment_id>`
- **描述**: 删除缴费记录
- **需要登录**: 是
- **需要权限**: `edit`

---

## 财务统计 API

### 获取财务记录
- **GET** `/api/finance`
- **描述**: 获取财务记录
- **查询参数**: 支持多种筛选条件

### 更新财务记录
- **PUT** `/api/finance`
- **描述**: 更新财务记录
- **需要登录**: 是

### 获取财务配置
- **GET** `/api/finance-config`
- **描述**: 获取所有财务配置

### 创建财务配置
- **POST** `/api/finance-config`
- **描述**: 创建财务配置
- **需要登录**: 是

### 更新财务配置
- **PUT** `/api/finance-config/<config_id>`
- **描述**: 更新财务配置
- **需要登录**: 是

---

## 课时统计 API

### 获取课时统计
- **GET** `/api/stats`
- **描述**: 获取课时统计（按课程）
- **查询参数**: 支持多种筛选条件

---

## 教师课时 API

### 获取教师课时
- **GET** `/api/teacher-hours`
- **描述**: 获取老师课时统计
- **查询参数**: 支持多种筛选条件

### 更新教师课时记录
- **PUT** `/api/teacher-hours/<hours_id>`
- **描述**: 更新教师课时记录
- **需要登录**: 是

### 结算教师课时
- **POST** `/api/teacher-hours/settle`
- **描述**: 结算教师课时
- **需要登录**: 是

### 重新计算教师课时
- **POST** `/api/teacher-hours/recalculate`
- **描述**: 重新计算教师课时
- **需要登录**: 是

---

## 其他管理 API

### 获取所有排课
- **GET** `/api/all_courses`
- **描述**: 获取所有排课（支持分页和筛选）
- **查询参数**: 支持多种筛选和分页参数

### 清理孤立排课
- **POST** `/api/cleanup/orphaned-courses`
- **描述**: 清理孤立的排课记录
- **需要登录**: 是
- **需要权限**: `admin`

### 时段管理

#### 获取时段列表
- **GET** `/api/time-slots`
- **描述**: 获取所有时段
- **查询参数**:
  - `status`: 状态筛选（可选）

#### 创建时段
- **POST** `/api/time-slots`
- **描述**: 创建新时段
- **需要登录**: 是

#### 更新时段
- **PUT** `/api/time-slots/<slot_id>`
- **描述**: 更新时段信息
- **需要登录**: 是

#### 删除时段
- **DELETE** `/api/time-slots/<slot_id>`
- **描述**: 删除时段
- **需要登录**: 是

### 教室管理

#### 获取教室列表
- **GET** `/api/classrooms`
- **描述**: 获取所有教室
- **查询参数**:
  - `status`: 状态筛选（可选）

#### 创建教室
- **POST** `/api/classrooms`
- **描述**: 创建新教室
- **需要登录**: 是

#### 更新教室
- **PUT** `/api/classrooms/<room_id>`
- **描述**: 更新教室信息
- **需要登录**: 是

#### 删除教室
- **DELETE** `/api/classrooms/<room_id>`
- **描述**: 删除教室
- **需要登录**: 是

### 课程成本管理

#### 获取课程成本列表
- **GET** `/api/teacher-course-costs`
- **描述**: 获取所有教师课程成本
- **查询参数**: 支持教师ID、课程ID等筛选

#### 创建课程成本
- **POST** `/api/teacher-course-costs`
- **描述**: 创建新课程成本记录
- **需要登录**: 是

#### 更新课程成本
- **PUT** `/api/teacher-course-costs/<cost_id>`
- **描述**: 更新课程成本
- **需要登录**: 是

#### 删除课程成本
- **DELETE** `/api/teacher-course-costs/<cost_id>`
- **描述**: 删除课程成本
- **需要登录**: 是

#### 获取课程成本历史
- **GET** `/api/teacher-course-costs/<cost_id>/history`
- **描述**: 获取教师课程成本的操作历史

### 经验成本管理

#### 获取经验成本列表
- **GET** `/api/teacher-experience-costs`
- **描述**: 获取所有教师经验成本
- **查询参数**: 支持教师ID、课程ID、学生ID等筛选

#### 创建经验成本
- **POST** `/api/teacher-experience-costs`
- **描述**: 创建新经验成本记录
- **需要登录**: 是

#### 更新经验成本
- **PUT** `/api/teacher-experience-costs/<cost_id>`
- **描述**: 更新经验成本
- **需要登录**: 是

#### 删除经验成本
- **DELETE** `/api/teacher-experience-costs/<cost_id>`
- **描述**: 删除经验成本
- **需要登录**: 是

#### 获取经验成本历史
- **GET** `/api/teacher-experience-costs/<cost_id>/history`
- **描述**: 获取教师经验成本的操作历史

---

## 日历 API

### 获取日历课程数据
- **GET** `/api/calendar/courses`
- **描述**: 获取日历视图的课程数据
- **查询参数**:
  - `start_date`: 开始日期（格式：YYYY-MM-DD）
  - `end_date`: 结束日期（格式：YYYY-MM-DD）
  - `teacher_id`: 教师ID筛选（可选）
  - `student_id`: 学生ID筛选（可选）
  - `classroom`: 教室筛选（可选）

---

## 数据导出 API

### 导出学生列表
- **GET** `/api/export/students`
- **描述**: 导出学生列表到Excel
- **查询参数**: 支持筛选条件

### 导出缴费记录
- **GET** `/api/export/payments`
- **描述**: 导出缴费记录到Excel
- **查询参数**: 支持筛选条件

### 导出课时统计
- **GET** `/api/export/stats`
- **描述**: 导出课时统计到Excel
- **查询参数**: 支持筛选条件

### 导出财务报表
- **GET** `/api/export/finance`
- **描述**: 导出财务报表到Excel
- **查询参数**: 支持筛选条件

### 导出教师课时统计
- **GET** `/api/export/teacher-hours`
- **描述**: 导出教师课时统计到Excel
- **查询参数**: 支持筛选条件

---

## 数据导入 API

### 导入学生
- **POST** `/api/import/students`
- **描述**: 从Excel导入学生数据
- **需要登录**: 是
- **请求体**: multipart/form-data（Excel文件）

### 导入教师
- **POST** `/api/import/teachers`
- **描述**: 从Excel导入教师数据
- **需要登录**: 是
- **请求体**: multipart/form-data（Excel文件）

### 导入排课
- **POST** `/api/import/courses`
- **描述**: 从Excel导入排课数据
- **需要登录**: 是
- **请求体**: multipart/form-data（Excel文件）

### 导入缴费记录
- **POST** `/api/import/payments`
- **描述**: 从Excel导入缴费记录
- **需要登录**: 是
- **请求体**: multipart/form-data（Excel文件）

---

## 用户管理 API

### 获取用户列表
- **GET** `/api/users`
- **描述**: 获取用户列表（仅管理员）
- **需要登录**: 是
- **需要权限**: `admin`

### 创建用户
- **POST** `/api/users`
- **描述**: 创建新用户
- **需要登录**: 是
- **需要权限**: `admin`

### 更新用户
- **PUT** `/api/users/<user_id>`
- **描述**: 更新用户信息
- **需要登录**: 是
- **需要权限**: `admin`

### 删除用户
- **DELETE** `/api/users/<user_id>`
- **描述**: 删除用户
- **需要登录**: 是
- **需要权限**: `admin`

### 更新个人资料
- **PUT** `/api/users/profile`
- **描述**: 更新当前用户的个人资料
- **需要登录**: 是

### 获取操作日志
- **GET** `/api/operation-logs`
- **描述**: 获取操作日志
- **查询参数**: 支持分页和筛选

---

## 权限管理 API

### 获取模块列表
- **GET** `/api/permissions/modules`
- **描述**: 获取所有模块列表
- **需要登录**: 是

### 获取用户权限
- **GET** `/api/permissions/users/<user_id>`
- **描述**: 获取指定用户的权限
- **需要登录**: 是
- **需要权限**: `admin`

### 更新用户模块权限
- **PUT** `/api/permissions/users/<user_id>/modules/<module>`
- **描述**: 更新用户对特定模块的权限
- **需要登录**: 是
- **需要权限**: `admin`

### 批量更新用户权限
- **PUT** `/api/permissions/users/<user_id>/modules`
- **描述**: 批量更新用户权限
- **需要登录**: 是
- **需要权限**: `admin`
- **请求体**: `{ "modules": { "module_name": "permission_level" } }`

### 获取当前用户权限
- **GET** `/api/permissions/current-user`
- **描述**: 获取当前用户的权限列表
- **需要登录**: 是

---

## 通知 API

### 获取通知列表
- **GET** `/api/notifications`
- **描述**: 获取通知列表
- **查询参数**: 支持分页和筛选

### 获取未读通知数量
- **GET** `/api/notifications/unread-count`
- **描述**: 获取未读通知数量

### 标记通知为已读
- **POST** `/api/notifications/<notification_id>/read`
- **描述**: 标记通知为已读
- **需要登录**: 是

---

## 仪表盘 API

### 获取仪表盘统计
- **GET** `/api/dashboard/stats`
- **描述**: 获取首页统计数据

---

## 页面路由（非API）

以下路由返回HTML页面：

- `GET /` - 首页
- `GET /students` - 学生管理页面
- `GET /teachers` - 教师管理页面
- `GET /courses` - 排课管理页面
- `GET /all_courses` - 全部排课页面
- `GET /payments` - 缴费管理页面
- `GET /stats` - 课时统计页面
- `GET /finance` - 财务统计页面
- `GET /courses_manage` - 课程管理页面
- `GET /teacher_hours` - 老师课时页面
- `GET /others_manage` - 其它管理页面
- `GET /calendar` - 日历视图页面
- `GET /student_courses` - 学生课程页面
- `GET /permissions` - 权限管理页面
- `GET /login` - 登录页面

---

## 错误响应格式

所有API错误响应遵循以下格式：

```json
{
  "error": "错误消息"
}
```

常见HTTP状态码：
- `200`: 成功
- `400`: 请求错误
- `401`: 未授权（需要登录）
- `403`: 权限不足
- `404`: 资源不存在
- `429`: 请求过于频繁（限流）
- `500`: 服务器错误

---

## 注意事项

1. **CSRF保护**: 大部分POST/PUT/DELETE请求需要CSRF token，但API端点已豁免CSRF检查（使用`@csrf.exempt`）
2. **限流**: 部分接口有限流保护，如登录接口限制5次/分钟，查询接口限制200次/分钟
3. **文件上传**: 教师创建/更新接口支持文件上传（简历），使用`multipart/form-data`格式
4. **分页**: 支持分页的接口使用`page`和`per_page`参数
5. **日期格式**: 日期参数使用`YYYY-MM-DD`格式，月份参数使用`YYYY-MM`格式
