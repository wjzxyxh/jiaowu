"""
数据库索引优化脚本
为常用查询字段添加索引以提升查询性能
"""
from extensions import db
from sqlalchemy import Index


def add_indexes():
    """添加数据库索引"""
    # 注意：SQLAlchemy 的 Index 需要在模型定义时添加
    # 这个脚本用于在已有数据库上添加索引（如果数据库支持）
    
    try:
        # 学生表索引
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_students_name 
            ON students(name);
        """)
        
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_students_status 
            ON students(status);
        """)
        
        # 学生课程表索引
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_student_courses_student_id 
            ON student_courses(student_id);
        """)
        
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_student_courses_course_date 
            ON student_courses(course_date);
        """)
        
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_student_courses_teacher_id 
            ON student_courses(teacher_id);
        """)
        
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_student_courses_student_date 
            ON student_courses(student_id, course_date);
        """)
        
        # 缴费表索引
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_payments_student_id 
            ON payments(student_id);
        """)
        
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_payments_payment_date 
            ON payments(payment_date);
        """)
        
        # 课时统计表索引
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_class_hours_stats_student_month 
            ON class_hours_stats(student_id, month);
        """)
        
        # 教师课时表索引
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_teacher_hours_teacher_month 
            ON teacher_hours(teacher_id, month);
        """)
        
        # 财务记录表索引
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_finance_records_month 
            ON finance_records(month);
        """)
        
        # 用户表索引
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_users_username 
            ON users(username);
        """)
        
        # 登录日志表索引
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_login_logs_user_id 
            ON login_logs(user_id);
        """)
        
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_login_logs_login_time 
            ON login_logs(login_time);
        """)
        
        # 操作日志表索引
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id 
            ON operation_logs(user_id);
        """)
        
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_operation_logs_module 
            ON operation_logs(module);
        """)
        
        db.engine.execute("""
            CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at 
            ON operation_logs(created_at);
        """)
        
        print("索引添加完成")
        
    except Exception as e:
        print(f"添加索引时出错: {e}")
        # SQLite 可能不支持某些索引语法，使用兼容语法
        if 'sqlite' in str(db.engine.url).lower():
            print("注意：SQLite 数据库可能不支持某些索引语法")


if __name__ == '__main__':
    from app import create_app
    app = create_app()
    with app.app_context():
        add_indexes()
