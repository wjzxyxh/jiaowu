# 数据库迁移说明

## 迁移函数列表

所有数据库升级函数已从`app.py`迁移到`database/migrations.py`。由于代码量很大（约900行），建议采用以下方式完成迁移：

### 方法1：直接复制（推荐）

1. 从`app.py`中复制所有`upgrade_*`函数（第307-1204行）
2. 粘贴到`database/migrations.py`中
3. 在文件开头添加必要的导入：
   ```python
   from sqlalchemy import inspect, text
   from extensions import db
   ```

### 方法2：逐步迁移

可以逐个函数迁移，确保每个函数都能正常工作。

## 需要迁移的函数

以下函数需要从`app.py`迁移到`database/migrations.py`：

1. `upgrade_student_table()` - 升级学生表
2. `upgrade_teacher_table()` - 升级教师表
3. `upgrade_student_course_table()` - 升级学生课程表
4. `upgrade_class_hours_stats_table()` - 升级课时统计表
5. `upgrade_payment_table()` - 升级缴费表
6. `upgrade_teacher_hours_table()` - 升级老师课时表
7. `upgrade_finance_record_table()` - 升级财务记录表
8. `upgrade_teacher_course_cost_table()` - 升级教师课程成本表
9. `upgrade_teacher_experience_cost_table()` - 升级教师经验成本表
10. `upgrade_class_hours_stats_table_with_course()` - 升级课时统计表（添加课程）
11. `upgrade_teacher_hours_table_with_course()` - 升级老师课时表（添加课程）
12. `upgrade_student_course_table_with_confirmed()` - 升级学生课程表（添加确认字段）
13. `upgrade_teacher_resume_table()` - 创建教师简历表

## run_migrations函数

`database/migrations.py`中的`run_migrations()`函数应该调用所有这些升级函数：

```python
def run_migrations():
    """运行所有数据库迁移"""
    upgrade_student_table()
    upgrade_teacher_table()
    upgrade_student_course_table()
    upgrade_class_hours_stats_table()
    upgrade_payment_table()
    upgrade_teacher_hours_table()
    upgrade_finance_record_table()
    upgrade_teacher_course_cost_table()
    upgrade_teacher_experience_cost_table()
    upgrade_class_hours_stats_table_with_course()
    upgrade_teacher_hours_table_with_course()
    upgrade_student_course_table_with_confirmed()
    upgrade_teacher_resume_table()
```

## 注意事项

1. 确保所有函数都使用`from extensions import db`而不是`from models import db`
2. 保持函数的执行顺序，因为某些迁移可能依赖之前的迁移
3. 测试每个迁移函数，确保它们能正常工作
4. 在生产环境运行迁移前，务必备份数据库
