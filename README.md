# 教务管理系统

一个功能完整的教务管理系统，用于管理学生、教师、排课、缴费和财务统计。

## 功能特性

### 1. 学生信息管理
- 添加、编辑、删除学生信息
- 记录学生姓名、年级、在校状态、联系电话、家长姓名
- 支持按状态筛选（在校/离校）
- 支持搜索功能

### 2. 教师信息管理
- 添加、编辑、删除教师信息
- 记录教师姓名、科目、联系电话
- 设置教师底薪和每节课成本（用于财务计算）

### 3. 排课管理
- 为学生排课，记录课程信息（学生、科目、老师、日期、星期）
- 每排一次课，自动增加当月原始课时
- 每删除一次排课，自动减少当月原始课时
- 支持修改课程状态（正常/请假/跑空）
- 支持按月查看排课记录

### 4. 课时统计
- **当月原始课时**：来自学生课程表的排课次数
- **当月课时**：
  - 如果未修改，等于当月原始课时
  - 如果修改：正常课程=1，请假（已排课）=-1，请假（未排课）=0，跑空=0.5
- **累计课时**：上月累计课时 + 当月课时
- **剩余课时**：
  - 每排1次课，减少1次剩余课时
  - 只能由家长缴费系统增加

### 5. 缴费管理
- 记录学生缴费信息
  - 缴费日期、学生姓名、原始费用、优惠力度、缴纳费用
  - 报课节数（自动补充到剩余课时）
  - 自动计算学生单价（当次缴费/报课次数）
- 支持查看历次缴费记录
- 支持按月、按学生筛选缴费记录

### 6. 老师课时统计
- 自动统计每位老师每月的课时总数
- 用于计算老师成本

### 7. 财务统计
- **收入表**：
  - 当月收入 = 当月课耗 × 学生单价
  - 当月课耗来自课时统计表
  - 学生单价来自家长缴费表（当次缴费/报课次数）

- **成本表**：
  - 老师成本 = 老师成本 × 当月课耗 + 老师底薪（自动计算）
  - 营销成本 = 传单 + 人工（手动输入）
  - 房租水电 = 房租 + 水电（手动输入）
  - 其它成本 = 打印纸 + 打印粉（手动输入）

- **利润表**：
  - 当月利润 = 当月收入 - 老师成本 - 营销成本 - 房租水电 - 其它成本

## 技术栈

- **后端**：Flask (Python)
- **数据库**：SQLite
- **前端**：HTML + CSS + JavaScript (原生，无框架)
- **ORM**：SQLAlchemy

## 安装和运行

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 运行应用

```bash
python app.py
```

### 3. 访问系统

打开浏览器访问：http://localhost 或 http://localhost:80

## 数据库设计

### 1. 学生信息表 (students)
- id: 主键
- name: 学生姓名
- grade: 年级
- status: 在校状态（在校/离校）
- phone: 联系电话
- parent_name: 家长姓名
- created_at: 创建时间

### 2. 教师信息表 (teachers)
- id: 主键
- name: 教师姓名
- subject: 科目
- phone: 联系电话
- base_salary: 底薪
- cost_per_class: 每节课成本
- created_at: 创建时间

### 3. 学生课程表 (student_courses)
- id: 主键
- student_id: 学生ID（外键）
- student_name: 学生姓名
- grade: 年级
- subject: 科目
- teacher_id: 教师ID（外键）
- teacher_name: 老师姓名
- course_date: 日期
- weekday: 星期
- status: 状态（正常/请假/跑空/删除）
- created_at: 创建时间

### 4. 课时统计表 (class_hours_stats)
- id: 主键
- student_id: 学生ID（外键，唯一）
- student_name: 姓名
- month: 月份（YYYY-MM格式）
- original_hours: 当月原始课时
- actual_hours: 当月课时
- last_month_total: 上月累计课时
- current_month_total: 本月累计课时
- remaining_hours: 剩余课时
- updated_at: 更新时间

### 5. 家长缴费表 (payments)
- id: 主键
- payment_date: 缴费日期
- student_id: 学生ID（外键）
- student_name: 学生姓名
- original_amount: 原始费用
- discount_rate: 优惠力度（百分比）
- paid_amount: 缴纳费用
- class_count: 报课节数
- unit_price: 学生单价（当次缴费/报课次数）
- remark: 备注
- created_at: 创建时间

### 6. 老师课时表 (teacher_hours)
- id: 主键
- teacher_id: 教师ID（外键）
- teacher_name: 老师姓名
- month: 月份（YYYY-MM格式）
- total_hours: 当月课时总数
- updated_at: 更新时间

### 7. 收支表 (finance_records)
- id: 主键
- month: 月份（YYYY-MM格式）
- monthly_revenue: 当月收入
- teacher_cost: 老师成本
- marketing_cost: 营销成本
- marketing_flyer: 传单
- marketing_labor: 人工
- rent_utilities: 房租水电
- rent: 房租
- utilities: 水电
- other_cost: 其它成本
- other_paper: 打印纸
- other_toner: 打印粉
- monthly_profit: 当月利润
- updated_at: 更新时间

## 使用说明

### 基本流程

1. **添加学生和教师**
   - 在"学生管理"页面添加学生信息
   - 在"教师管理"页面添加教师信息

2. **设置教师成本**
   - 编辑教师信息，设置底薪和每节课成本

3. **排课**
   - 在"排课管理"页面为学生排课
   - 系统自动更新课时统计和剩余课时

4. **缴费**
   - 在"缴费管理"页面记录学生缴费
   - 系统自动增加剩余课时并计算学生单价

5. **查看统计**
   - 在"课时统计"页面查看学生课时情况
   - 在"财务统计"页面查看收支和利润

### 注意事项

- 排课时会自动减少剩余课时，如果剩余课时不足，请先缴费
- 删除排课会恢复1次剩余课时
- 修改课程状态（请假/跑空）会影响当月课时计算
- 财务统计中的成本数据需要手动输入（传单、人工、房租、水电等）
- 系统会自动计算老师成本和利润

## 开发说明

### 项目结构

```
jiaowu/
├── app.py              # Flask应用主文件
├── models.py           # 数据库模型定义
├── requirements.txt    # Python依赖
├── templates/          # HTML模板
│   └── index.html
├── static/             # 静态资源
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
└── README.md           # 项目说明文档
```

### API接口

所有API接口返回JSON格式数据：

- `GET /api/students` - 获取学生列表
- `POST /api/students` - 创建学生
- `PUT /api/students/<id>` - 更新学生
- `DELETE /api/students/<id>` - 删除学生

- `GET /api/teachers` - 获取教师列表
- `POST /api/teachers` - 创建教师
- `PUT /api/teachers/<id>` - 更新教师
- `DELETE /api/teachers/<id>` - 删除教师

- `GET /api/courses` - 获取课程列表
- `POST /api/courses` - 创建排课
- `PUT /api/courses/<id>` - 更新课程状态
- `DELETE /api/courses/<id>` - 删除排课

- `GET /api/payments` - 获取缴费记录
- `POST /api/payments` - 创建缴费记录
- `DELETE /api/payments/<id>` - 删除缴费记录

- `GET /api/stats` - 获取课时统计
- `GET /api/teacher-hours` - 获取老师课时
- `GET /api/finance` - 获取财务记录
- `PUT /api/finance` - 更新财务记录

## 许可证

MIT License

## 作者

教务管理系统开发团队

