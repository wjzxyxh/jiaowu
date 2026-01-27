"""
数据库迁移和升级
从app.py迁移而来
"""
from sqlalchemy import inspect, text
from extensions import db


def get_database_type():
    """检测数据库类型"""
    try:
        dialect = db.engine.dialect.name
        return dialect
    except:
        return 'sqlite'


def is_sqlite():
    """判断是否为SQLite数据库"""
    return get_database_type() == 'sqlite'


def is_mysql():
    """判断是否为MySQL数据库"""
    return get_database_type() == 'mysql'


def get_table_sql(table_name):
    """获取表的创建SQL（兼容SQLite和MySQL）"""
    if is_sqlite():
        with db.engine.connect() as conn:
            result = conn.execute(text(f"SELECT sql FROM sqlite_master WHERE type='table' AND name='{table_name}'"))
            return result.scalar()
    else:
        # MySQL不支持直接获取CREATE TABLE SQL，返回None
        return None


def table_exists(table_name):
    """检查表是否存在（兼容SQLite和MySQL）"""
    inspector = inspect(db.engine)
    return table_name in inspector.get_table_names()


def column_exists(table_name, column_name):
    """检查列是否存在（兼容SQLite和MySQL）"""
    inspector = inspect(db.engine)
    if table_name not in inspector.get_table_names():
        return False
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def mysql_date_add(month_str, interval):
    """MySQL日期函数：将月份字符串转换为日期并添加间隔"""
    if is_mysql():
        return f"DATE_ADD(STR_TO_DATE(CONCAT({month_str}, '-01'), '%Y-%m-%d'), INTERVAL {interval})"
    else:
        # SQLite
        return f"date({month_str} || '-01', '{interval}')"

def upgrade_student_table_with_default_schedule():
    """升级学生表，添加默认上课时间和星期字段"""
    try:
        inspector = inspect(db.engine)
        
        if 'students' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('students')]
            
            if 'default_time_slot' not in columns:
                if is_sqlite():
                    with db.engine.begin() as conn:
                        conn.execute(text('ALTER TABLE students ADD COLUMN default_time_slot VARCHAR(20)'))
                else:
                    with db.engine.begin() as conn:
                        conn.execute(text('ALTER TABLE students ADD COLUMN default_time_slot VARCHAR(20)'))
                print('已为学生表添加默认上课时段字段')
            else:
                print('学生表的默认上课时段字段已存在')
            
            if 'default_weekday' not in columns:
                if is_sqlite():
                    with db.engine.begin() as conn:
                        conn.execute(text('ALTER TABLE students ADD COLUMN default_weekday VARCHAR(10)'))
                else:
                    with db.engine.begin() as conn:
                        conn.execute(text('ALTER TABLE students ADD COLUMN default_weekday VARCHAR(10)'))
                print('已为学生表添加默认上课星期字段')
            else:
                print('学生表的默认上课星期字段已存在')
    except Exception as e:
        print(f'升级学生表（默认排课设置）时出错: {e}')
        import traceback
        traceback.print_exc()


def upgrade_student_table():
    """升级学生表，添加照片和更多联系信息字段（如果不存在）"""
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        
        if 'students' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('students')]
            
            if 'parent_phone' not in columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE students ADD COLUMN parent_phone VARCHAR(20)'))
                print('已为学生表添加parent_phone字段')
            
            if 'address' not in columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE students ADD COLUMN address VARCHAR(200)'))
                print('已为学生表添加address字段')
            
            if 'email' not in columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE students ADD COLUMN email VARCHAR(100)'))
                print('已为学生表添加email字段')
            
            if 'photo_path' not in columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE students ADD COLUMN photo_path VARCHAR(255)'))
                print('已为学生表添加photo_path字段')
            
            if 'photo_filename' not in columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE students ADD COLUMN photo_filename VARCHAR(255)'))
                print('已为学生表添加photo_filename字段')
            
            if 'notes' not in columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE students ADD COLUMN notes TEXT'))
                print('已为学生表添加notes字段')
            
            if 'enrollment_date' not in columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE students ADD COLUMN enrollment_date DATE'))
                print('已为学生表添加enrollment_date字段')
    except Exception as e:
        print(f'升级学生表时出错: {e}')
        import traceback
        traceback.print_exc()



def upgrade_teacher_table():
    """升级教师表，添加status和employment_type字段（如果不存在）"""
    try:
        # 检查status字段是否存在
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        
        # 检查表是否存在
        if 'teachers' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('teachers')]
            
            if 'status' not in columns:
                # 添加status字段
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teachers ADD COLUMN status VARCHAR(20) DEFAULT "启用"'))
                print('已为教师表添加status字段')
                
                # 更新现有记录的status字段
                with db.engine.begin() as conn:
                    conn.execute(text('UPDATE teachers SET status = "启用" WHERE status IS NULL'))
                print('已更新现有教师记录的status字段')
            else:
                print('教师表的status字段已存在')
            
            if 'employment_type' not in columns:
                # 添加employment_type字段
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teachers ADD COLUMN employment_type VARCHAR(20) DEFAULT "兼职"'))
                print('已为教师表添加employment_type字段')
                
                # 更新现有记录的employment_type字段
                with db.engine.begin() as conn:
                    conn.execute(text('UPDATE teachers SET employment_type = "兼职" WHERE employment_type IS NULL'))
                print('已更新现有教师记录的employment_type字段')
            else:
                print('教师表的employment_type字段已存在')
            
            if 'bio' not in columns:
                # 添加bio字段
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teachers ADD COLUMN bio TEXT'))
                print('已为教师表添加bio字段')
            else:
                print('教师表的bio字段已存在')
            
            if 'resume_path' not in columns:
                # 添加resume_path字段
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teachers ADD COLUMN resume_path VARCHAR(255)'))
                print('已为教师表添加resume_path字段')
            else:
                print('教师表的resume_path字段已存在')
            
            if 'resume_filename' not in columns:
                # 添加resume_filename字段
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teachers ADD COLUMN resume_filename VARCHAR(255)'))
                print('已为教师表添加resume_filename字段')
            else:
                print('教师表的resume_filename字段已存在')
    except Exception as e:
        print(f'升级教师表时出错: {e}')
        import traceback
        traceback.print_exc()



def upgrade_student_course_table():
    """升级学生课程表，添加时段字段和教室字段"""
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        
        if 'student_courses' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('student_courses')]
            
            if 'time_slot' not in columns:
                # 添加时段字段
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE student_courses ADD COLUMN time_slot VARCHAR(20)'))
                print('已为学生课程表添加时段字段')
            else:
                print('学生课程表的时段字段已存在')
            
            if 'classroom' not in columns:
                # 添加教室字段
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE student_courses ADD COLUMN classroom VARCHAR(10)'))
                print('已为学生课程表添加教室字段')
            else:
                print('学生课程表的教室字段已存在')
    except Exception as e:
        print(f'升级学生课程表时出错: {e}')
        import traceback
        traceback.print_exc()



def upgrade_class_hours_stats_table():
    """升级课时统计表，修复唯一约束"""
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        
        if 'class_hours_stats' in inspector.get_table_names():
            # 检查表结构，看是否有 UNIQUE (student_id)
            needs_upgrade = False
            if is_sqlite():
                # SQLite: 检查表结构SQL
                with db.engine.connect() as conn:
                    result = conn.execute(text("SELECT sql FROM sqlite_master WHERE type='table' AND name='class_hours_stats'"))
                    table_sql = result.scalar()
                    if table_sql and 'UNIQUE (student_id)' in table_sql and 'UNIQUE(student_id, month)' not in table_sql:
                        needs_upgrade = True
            else:
                # MySQL: 检查唯一约束
                with db.engine.connect() as conn:
                    result = conn.execute(text("""
                        SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
                        WHERE TABLE_SCHEMA = DATABASE() 
                        AND TABLE_NAME = 'class_hours_stats' 
                        AND CONSTRAINT_TYPE = 'UNIQUE'
                        AND CONSTRAINT_NAME LIKE '%student_id%'
                    """))
                    unique_count = result.scalar()
                    # 检查是否有 (student_id, month) 的唯一约束
                    result2 = conn.execute(text("""
                        SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE 
                        WHERE TABLE_SCHEMA = DATABASE() 
                        AND TABLE_NAME = 'class_hours_stats' 
                        AND COLUMN_NAME IN ('student_id', 'month')
                        GROUP BY CONSTRAINT_NAME
                        HAVING COUNT(*) = 2
                    """))
                    composite_unique = result2.scalar() or 0
                    if unique_count > 0 and composite_unique == 0:
                        needs_upgrade = True
            
            if needs_upgrade:
                print('检测到旧的唯一约束，开始修复课时统计表结构...')
                # SQLite不支持直接删除唯一约束，需要重建表
                with db.engine.begin() as conn:
                    # 1. 创建新表（带正确的约束）
                    conn.execute(text('''
                        CREATE TABLE class_hours_stats_new (
                            id INTEGER NOT NULL PRIMARY KEY,
                            student_id INTEGER NOT NULL,
                            student_name VARCHAR(50) NOT NULL,
                            month VARCHAR(7) NOT NULL,
                            original_hours FLOAT DEFAULT 0,
                            actual_hours FLOAT DEFAULT 0,
                            last_month_total FLOAT DEFAULT 0,
                            current_month_total FLOAT DEFAULT 0,
                            remaining_hours FLOAT DEFAULT 0,
                            updated_at DATETIME,
                            FOREIGN KEY(student_id) REFERENCES students (id),
                            UNIQUE(student_id, month)
                        )
                    '''))
                    
                    # 2. 复制所有数据
                    conn.execute(text('''
                        INSERT INTO class_hours_stats_new 
                        SELECT * FROM class_hours_stats
                    '''))
                    
                    # 3. 删除旧表
                    conn.execute(text('DROP TABLE class_hours_stats'))
                    
                    # 4. 重命名新表
                    conn.execute(text('ALTER TABLE class_hours_stats_new RENAME TO class_hours_stats'))
                
                print('课时统计表结构已修复')
            else:
                print('课时统计表结构正常')
    except Exception as e:
        print(f'升级课时统计表时出错: {e}')
        import traceback
        traceback.print_exc()



def upgrade_payment_table():
    """升级缴费表，添加type字段（如果不存在）"""
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        
        # 检查表是否存在
        if 'payments' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('payments')]
            
            if 'type' not in columns:
                # 添加type字段
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE payments ADD COLUMN type VARCHAR(20) DEFAULT "缴费"'))
                print('已为缴费表添加type字段')
                
                # 更新现有记录的type字段
                with db.engine.begin() as conn:
                    conn.execute(text('UPDATE payments SET type = "缴费" WHERE type IS NULL'))
                print('已更新现有缴费记录的type字段')
            else:
                print('缴费表的type字段已存在')
    except Exception as e:
        print(f'升级缴费表时出错: {e}')
        import traceback
        traceback.print_exc()



def upgrade_teacher_hours_table():
    """升级老师课时表，添加incentive、remark和base_salary字段（如果不存在）"""
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        
        # 检查表是否存在
        if 'teacher_hours' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('teacher_hours')]
            
            if 'incentive' not in columns:
                # 添加incentive字段
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_hours ADD COLUMN incentive FLOAT DEFAULT 0'))
                print('已为老师课时表添加incentive字段')
            else:
                print('老师课时表的incentive字段已存在')
            
            if 'remark' not in columns:
                # 添加remark字段
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_hours ADD COLUMN remark TEXT'))
                print('已为老师课时表添加remark字段')
            else:
                print('老师课时表的remark字段已存在')
            
            if 'base_salary' not in columns:
                # 添加base_salary字段
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_hours ADD COLUMN base_salary FLOAT DEFAULT 0'))
                print('已为老师课时表添加base_salary字段')
                
                # 更新现有记录的base_salary（从Teacher表同步）
                with db.engine.begin() as conn:
                    conn.execute(text('''
                        UPDATE teacher_hours 
                        SET base_salary = (
                            SELECT base_salary 
                            FROM teachers 
                            WHERE teachers.id = teacher_hours.teacher_id 
                            AND teachers.employment_type = '全职'
                        )
                        WHERE EXISTS (
                            SELECT 1 
                            FROM teachers 
                            WHERE teachers.id = teacher_hours.teacher_id 
                            AND teachers.employment_type = '全职'
                        )
                    '''))
                print('已同步现有记录的base_salary字段')
            else:
                print('老师课时表的base_salary字段已存在')
            
            if 'is_settled' not in columns:
                # 添加is_settled字段
                # MySQL使用BOOLEAN/TINYINT，SQLite使用INTEGER
                boolean_type = 'BOOLEAN' if is_mysql() else 'INTEGER'
                with db.engine.begin() as conn:
                    conn.execute(text(f'ALTER TABLE teacher_hours ADD COLUMN is_settled {boolean_type} DEFAULT 0'))
                print('已为老师课时表添加is_settled字段')
            else:
                print('老师课时表的is_settled字段已存在')
            
            if 'settled_at' not in columns:
                # 添加settled_at字段
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_hours ADD COLUMN settled_at DATETIME'))
                print('已为老师课时表添加settled_at字段')
            else:
                print('老师课时表的settled_at字段已存在')
    except Exception as e:
        print(f'升级老师课时表时出错: {e}')
        import traceback
        traceback.print_exc()



def upgrade_finance_record_table():
    """升级财务记录表，添加revenue_mode字段（如果不存在）"""
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        
        # 检查表是否存在
        if 'finance_records' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('finance_records')]
            
            if 'revenue_mode' not in columns:
                # 添加revenue_mode字段
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE finance_records ADD COLUMN revenue_mode VARCHAR(20) DEFAULT "课耗模式"'))
                print('已为财务记录表添加revenue_mode字段')
                
                # 更新现有记录的revenue_mode字段
                with db.engine.begin() as conn:
                    conn.execute(text('UPDATE finance_records SET revenue_mode = "课耗模式" WHERE revenue_mode IS NULL'))
                print('已更新现有财务记录的revenue_mode字段')
            else:
                print('财务记录表的revenue_mode字段已存在')
    except Exception as e:
        print(f'升级财务记录表时出错: {e}')
        import traceback
        traceback.print_exc()



def upgrade_teacher_course_cost_table():
    """升级教师课程成本表，添加时间段字段和历史记录表"""
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        
        if 'teacher_course_costs' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('teacher_course_costs')]
            
            if 'start_date' not in columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_course_costs ADD COLUMN start_date DATE'))
                print('已为教师课程成本表添加start_date字段')
            
            if 'end_date' not in columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_course_costs ADD COLUMN end_date DATE'))
                print('已为教师课程成本表添加end_date字段')
            
            # 删除旧的唯一约束（如果存在）
            # 注意：MySQL不支持直接删除唯一约束，需要删除索引
            # 这里只处理SQLite的情况，MySQL的约束管理更复杂，建议手动处理
            try:
                if is_sqlite():
                    table_sql = get_table_sql('teacher_course_costs')
                    if table_sql and 'UNIQUE(teacher_id, course_id)' in table_sql:
                        print('检测到旧的唯一约束，开始重建教师课程成本表...')
                        with db.engine.begin() as conn:
                            conn.execute(text('''
                                CREATE TABLE teacher_course_costs_new (
                                    id INTEGER NOT NULL PRIMARY KEY,
                                    teacher_id INTEGER NOT NULL,
                                    teacher_name VARCHAR(50) NOT NULL,
                                    course_id INTEGER NOT NULL,
                                    course_name VARCHAR(50) NOT NULL,
                                    cost_per_class FLOAT NOT NULL,
                                    start_date DATE,
                                    end_date DATE,
                                    created_at DATETIME,
                                    updated_at DATETIME,
                                    FOREIGN KEY(teacher_id) REFERENCES teachers (id),
                                    FOREIGN KEY(course_id) REFERENCES courses (id)
                                )
                            '''))
                            conn.execute(text('''
                                INSERT INTO teacher_course_costs_new 
                                (id, teacher_id, teacher_name, course_id, course_name, cost_per_class, start_date, end_date, created_at, updated_at)
                                SELECT id, teacher_id, teacher_name, course_id, course_name, cost_per_class, NULL, NULL, created_at, updated_at
                                FROM teacher_course_costs
                            '''))
                            conn.execute(text('DROP TABLE teacher_course_costs'))
                            conn.execute(text('ALTER TABLE teacher_course_costs_new RENAME TO teacher_course_costs'))
                        print('教师课程成本表结构已更新')
            except Exception as e:
                print(f'处理唯一约束时出错（可能不存在）: {e}')
        
        # 升级历史记录表
        if 'teacher_course_cost_history' in inspector.get_table_names():
            history_columns = [col['name'] for col in inspector.get_columns('teacher_course_cost_history')]
            
            if 'old_cost_per_class' not in history_columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_course_cost_history ADD COLUMN old_cost_per_class FLOAT'))
                print('已为教师课程成本历史表添加old_cost_per_class字段')
            
            if 'old_start_date' not in history_columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_course_cost_history ADD COLUMN old_start_date DATE'))
                print('已为教师课程成本历史表添加old_start_date字段')
            
            if 'old_end_date' not in history_columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_course_cost_history ADD COLUMN old_end_date DATE'))
                print('已为教师课程成本历史表添加old_end_date字段')
            
            # 检查并修复 cost_id 字段的 NULL 约束
            # SQLite 不支持直接修改列约束，但我们可以通过重建表来修复
            # MySQL 支持 ALTER TABLE MODIFY COLUMN，但为了兼容性，这里只处理 SQLite
            try:
                if is_sqlite():
                    table_sql = get_table_sql('teacher_course_cost_history')
                    # 检查 cost_id 字段是否允许 NULL
                    if table_sql and 'cost_id' in table_sql:
                        # 检查是否包含 NOT NULL 约束
                        if 'cost_id INTEGER NOT NULL' in table_sql or 'cost_id INTEGER NOT NULL,' in table_sql:
                            print('检测到 cost_id 字段不允许 NULL，开始修复表结构...')
                            # 由于 SQLite 的限制，我们需要重建表
                            # 但为了安全，我们先检查是否有数据
                            count_result = conn.execute(text('SELECT COUNT(*) FROM teacher_course_cost_history'))
                            has_data = count_result.scalar() > 0
                            
                            if has_data:
                                # 如果有数据，先备份数据
                                print('历史记录表有数据，开始重建表结构...')
                                with db.engine.begin() as conn:
                                    # 检查新表是否已存在（可能是之前迁移失败留下的）
                                    if table_exists('teacher_course_cost_history_new'):
                                        print('检测到残留的新表，先删除...')
                                        conn.execute(text('DROP TABLE teacher_course_cost_history_new'))
                                    
                                    # 创建新表（cost_id 允许 NULL）
                                    conn.execute(text('''
                                        CREATE TABLE teacher_course_cost_history_new (
                                            id INTEGER NOT NULL PRIMARY KEY,
                                            cost_id INTEGER,
                                            teacher_id INTEGER NOT NULL,
                                            teacher_name VARCHAR(50) NOT NULL,
                                            course_id INTEGER NOT NULL,
                                            course_name VARCHAR(50) NOT NULL,
                                            cost_per_class FLOAT NOT NULL,
                                            start_date DATE,
                                            end_date DATE,
                                            old_cost_per_class FLOAT,
                                            old_start_date DATE,
                                            old_end_date DATE,
                                            operation VARCHAR(20) NOT NULL,
                                            created_at DATETIME,
                                            FOREIGN KEY(cost_id) REFERENCES teacher_course_costs (id)
                                        )
                                    '''))
                                    # 检查旧表的列结构
                                    old_columns_result = conn.execute(text("PRAGMA table_info(teacher_course_cost_history)"))
                                    old_columns_info = old_columns_result.fetchall()
                                    old_columns = [row[1] for row in old_columns_info]
                                    
                                    # 检查 operation 字段是否存在
                                    has_operation = 'operation' in old_columns
                                    
                                    # 根据是否有 operation 字段构建不同的 SELECT 语句
                                    if has_operation:
                                        # 如果旧表有 operation 字段，使用 COALESCE 处理 NULL 值
                                        conn.execute(text('''
                                            INSERT INTO teacher_course_cost_history_new 
                                            (id, cost_id, teacher_id, teacher_name, course_id, course_name, 
                                             cost_per_class, start_date, end_date, old_cost_per_class, 
                                             old_start_date, old_end_date, operation, created_at)
                                            SELECT 
                                                id, 
                                                cost_id, 
                                                teacher_id, 
                                                teacher_name, 
                                                course_id, 
                                                course_name, 
                                                cost_per_class, 
                                                start_date, 
                                                end_date, 
                                                old_cost_per_class, 
                                                old_start_date, 
                                                old_end_date, 
                                                COALESCE(operation, 'UPDATE') as operation,
                                                created_at
                                            FROM teacher_course_cost_history
                                        '''))
                                    else:
                                        # 如果旧表没有 operation 字段，提供默认值 'UPDATE'
                                        conn.execute(text('''
                                            INSERT INTO teacher_course_cost_history_new 
                                            (id, cost_id, teacher_id, teacher_name, course_id, course_name, 
                                             cost_per_class, start_date, end_date, old_cost_per_class, 
                                             old_start_date, old_end_date, operation, created_at)
                                            SELECT 
                                                id, 
                                                cost_id, 
                                                teacher_id, 
                                                teacher_name, 
                                                course_id, 
                                                course_name, 
                                                cost_per_class, 
                                                start_date, 
                                                end_date, 
                                                old_cost_per_class, 
                                                old_start_date, 
                                                old_end_date, 
                                                'UPDATE' as operation,
                                                created_at
                                            FROM teacher_course_cost_history
                                        '''))
                                    # 删除旧表
                                    conn.execute(text('DROP TABLE teacher_course_cost_history'))
                                    # 重命名新表
                                    conn.execute(text('ALTER TABLE teacher_course_cost_history_new RENAME TO teacher_course_cost_history'))
                                print('教师课程成本历史表结构已修复，cost_id 现在允许 NULL')
            except Exception as e:
                print(f'检查/修复 cost_id 约束时出错: {e}')
                import traceback
                traceback.print_exc()
    except Exception as e:
        print(f'升级教师课程成本表时出错: {e}')
        import traceback
        traceback.print_exc()



def upgrade_teacher_experience_cost_table():
    """升级教师经验成本表，添加学生字段和时间段字段"""
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        
        if 'teacher_experience_costs' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('teacher_experience_costs')]
            
            if 'student_id' not in columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_experience_costs ADD COLUMN student_id INTEGER'))
                print('已为教师经验成本表添加student_id字段')
            
            if 'student_name' not in columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_experience_costs ADD COLUMN student_name VARCHAR(50)'))
                print('已为教师经验成本表添加student_name字段')
            
            if 'start_date' not in columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_experience_costs ADD COLUMN start_date DATE'))
                print('已为教师经验成本表添加start_date字段')
            
            if 'end_date' not in columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_experience_costs ADD COLUMN end_date DATE'))
                print('已为教师经验成本表添加end_date字段')
        
        # 升级历史记录表
        if 'teacher_experience_cost_history' in inspector.get_table_names():
            history_columns = [col['name'] for col in inspector.get_columns('teacher_experience_cost_history')]
            
            if 'student_id' not in history_columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_experience_cost_history ADD COLUMN student_id INTEGER'))
                print('已为教师经验成本历史表添加student_id字段')
            
            if 'student_name' not in history_columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_experience_cost_history ADD COLUMN student_name VARCHAR(50)'))
                print('已为教师经验成本历史表添加student_name字段')
            
            if 'start_date' not in history_columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_experience_cost_history ADD COLUMN start_date DATE'))
                print('已为教师经验成本历史表添加start_date字段')
            
            if 'end_date' not in history_columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_experience_cost_history ADD COLUMN end_date DATE'))
                print('已为教师经验成本历史表添加end_date字段')
            
            if 'old_start_date' not in history_columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_experience_cost_history ADD COLUMN old_start_date DATE'))
                print('已为教师经验成本历史表添加old_start_date字段')
            
            if 'old_end_date' not in history_columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE teacher_experience_cost_history ADD COLUMN old_end_date DATE'))
                print('已为教师经验成本历史表添加old_end_date字段')
    except Exception as e:
        print(f'升级教师经验成本表时出错: {e}')
        import traceback
        traceback.print_exc()



def upgrade_class_hours_stats_table_with_course():
    """升级课时统计表，添加course_id字段并修改唯一约束"""
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        
        if 'class_hours_stats' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('class_hours_stats')]
            
            if 'course_id' not in columns:
                print('开始升级课时统计表，添加course_id字段...')
                # SQLite不支持直接修改唯一约束，需要重建表
                with db.engine.begin() as conn:
                    # 检查是否有数据
                    result = conn.execute(text('SELECT COUNT(*) FROM class_hours_stats'))
                    has_data = result.scalar() > 0
                    
                    if has_data:
                        # 如果有数据，需要为每条记录分配一个默认课程ID
                        # 首先获取所有学生和他们的课程
                        # 由于旧数据没有课程信息，我们需要为每个学生-月份组合创建一个默认记录
                        # 但更好的方式是：为每个学生找到他们缴费最多的课程，或者如果没有缴费，则使用第一个课程
                        pass
                    
                    # 1. 创建新表（带course_id字段）
                    conn.execute(text('''
                        CREATE TABLE class_hours_stats_new (
                            id INTEGER NOT NULL PRIMARY KEY,
                            student_id INTEGER NOT NULL,
                            student_name VARCHAR(50) NOT NULL,
                            course_id INTEGER NOT NULL,
                            course_name VARCHAR(50) NOT NULL,
                            month VARCHAR(7) NOT NULL,
                            original_hours FLOAT DEFAULT 0,
                            actual_hours FLOAT DEFAULT 0,
                            last_month_total FLOAT DEFAULT 0,
                            current_month_total FLOAT DEFAULT 0,
                            remaining_hours FLOAT DEFAULT 0,
                            updated_at DATETIME,
                            FOREIGN KEY(student_id) REFERENCES students (id),
                            FOREIGN KEY(course_id) REFERENCES courses (id),
                            UNIQUE(student_id, course_id, month)
                        )
                    '''))
                    
                    # 2. 如果有数据，迁移数据
                    if has_data:
                        # 获取第一个课程作为默认课程（如果存在）
                        default_course = conn.execute(text('SELECT id, name FROM courses LIMIT 1')).fetchone()
                        if default_course:
                            default_course_id, default_course_name = default_course
                            # 为每个学生-月份组合，根据他们的缴费记录分配课程
                            # 如果没有缴费记录，使用默认课程
                            conn.execute(text('''
                                INSERT INTO class_hours_stats_new 
                                SELECT 
                                    chs.id,
                                    chs.student_id,
                                    chs.student_name,
                                    COALESCE(
                                        (SELECT course_id FROM payments 
                                         WHERE student_id = chs.student_id 
                                         AND course_id IS NOT NULL 
                                         ORDER BY payment_date DESC LIMIT 1),
                                        :default_course_id
                                    ) as course_id,
                                    COALESCE(
                                        (SELECT course_name FROM payments 
                                         WHERE student_id = chs.student_id 
                                         AND course_id IS NOT NULL 
                                         ORDER BY payment_date DESC LIMIT 1),
                                        :default_course_name
                                    ) as course_name,
                                    chs.month,
                                    chs.original_hours,
                                    chs.actual_hours,
                                    chs.last_month_total,
                                    chs.current_month_total,
                                    chs.remaining_hours,
                                    chs.updated_at
                                FROM class_hours_stats chs
                            '''), {'default_course_id': default_course_id, 'default_course_name': default_course_name})
                        else:
                            # 如果没有课程，创建默认课程
                            conn.execute(text('''
                                INSERT INTO courses (name, subject, unit_price, status) 
                                VALUES ('默认课程', '默认', 0, '启用')
                            '''))
                            default_course_id = conn.execute(text('SELECT id FROM courses WHERE name = "默认课程"')).scalar()
                            default_course_name = '默认课程'
                            conn.execute(text('''
                                INSERT INTO class_hours_stats_new 
                                SELECT 
                                    chs.id,
                                    chs.student_id,
                                    chs.student_name,
                                    :default_course_id as course_id,
                                    :default_course_name as course_name,
                                    chs.month,
                                    chs.original_hours,
                                    chs.actual_hours,
                                    chs.last_month_total,
                                    chs.current_month_total,
                                    chs.remaining_hours,
                                    chs.updated_at
                                FROM class_hours_stats chs
                            '''), {'default_course_id': default_course_id, 'default_course_name': default_course_name})
                    
                    # 3. 删除旧表
                    conn.execute(text('DROP TABLE class_hours_stats'))
                    
                    # 4. 重命名新表
                    conn.execute(text('ALTER TABLE class_hours_stats_new RENAME TO class_hours_stats'))
                
                print('课时统计表已升级，添加了course_id字段')
            else:
                print('课时统计表的course_id字段已存在')
    except Exception as e:
        print(f'升级课时统计表时出错: {e}')
        import traceback
        traceback.print_exc()



def upgrade_teacher_hours_table_with_course():
    """升级老师课时表，添加course_id字段并修改唯一约束"""
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        
        if 'teacher_hours' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('teacher_hours')]
            
            if 'course_id' not in columns:
                print('开始升级老师课时表，添加course_id字段...')
                # SQLite不支持直接修改唯一约束，需要重建表
                with db.engine.begin() as conn:
                    # 检查是否有数据
                    result = conn.execute(text('SELECT COUNT(*) FROM teacher_hours'))
                    has_data = result.scalar() > 0
                    
                    # 1. 创建新表（带course_id字段）
                    conn.execute(text('''
                        CREATE TABLE teacher_hours_new (
                            id INTEGER NOT NULL PRIMARY KEY,
                            teacher_id INTEGER NOT NULL,
                            teacher_name VARCHAR(50) NOT NULL,
                            course_id INTEGER NOT NULL,
                            course_name VARCHAR(50) NOT NULL,
                            month VARCHAR(7) NOT NULL,
                            total_hours FLOAT DEFAULT 0,
                            incentive FLOAT DEFAULT 0,
                            remark TEXT,
                            updated_at DATETIME,
                            FOREIGN KEY(teacher_id) REFERENCES teachers (id),
                            FOREIGN KEY(course_id) REFERENCES courses (id),
                            UNIQUE(teacher_id, course_id, month)
                        )
                    '''))
                    
                    # 2. 如果有数据，迁移数据
                    if has_data:
                        # 获取第一个课程作为默认课程（如果存在）
                        default_course = conn.execute(text('SELECT id, name FROM courses LIMIT 1')).fetchone()
                        if default_course:
                            default_course_id, default_course_name = default_course
                            # 为每个老师-月份组合，根据他们的排课记录分配课程
                            # 如果没有排课记录，使用默认课程
                            if is_mysql():
                                # MySQL 日期处理
                                date_condition = """
                                    course_date >= DATE_FORMAT(CONCAT(th.month, '-01'), '%Y-%m-%d')
                                    AND course_date < DATE_ADD(DATE_FORMAT(CONCAT(th.month, '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH)
                                """
                            else:
                                # SQLite 日期处理
                                date_condition = """
                                    course_date >= date(th.month || '-01')
                                    AND course_date < date(th.month || '-01', '+1 month')
                                """
                            
                            conn.execute(text(f'''
                                INSERT INTO teacher_hours_new 
                                SELECT 
                                    th.id,
                                    th.teacher_id,
                                    th.teacher_name,
                                    COALESCE(
                                        (SELECT course_id FROM student_courses 
                                         WHERE teacher_id = th.teacher_id 
                                         AND course_id IS NOT NULL 
                                         AND {date_condition}
                                         LIMIT 1),
                                        :default_course_id
                                    ) as course_id,
                                    COALESCE(
                                        (SELECT c.name FROM student_courses sc
                                         JOIN courses c ON sc.course_id = c.id
                                         WHERE sc.teacher_id = th.teacher_id 
                                         AND sc.course_id IS NOT NULL 
                                         AND {date_condition}
                                         LIMIT 1),
                                        :default_course_name
                                    ) as course_name,
                                    th.month,
                                    th.total_hours,
                                    th.incentive,
                                    th.remark,
                                    th.updated_at
                                FROM teacher_hours th
                            '''), {'default_course_id': default_course_id, 'default_course_name': default_course_name})
                        else:
                            # 如果没有课程，创建默认课程
                            conn.execute(text('''
                                INSERT INTO courses (name, subject, unit_price, status) 
                                VALUES ('默认课程', '默认', 0, '启用')
                            '''))
                            default_course_id = conn.execute(text('SELECT id FROM courses WHERE name = "默认课程"')).scalar()
                            default_course_name = '默认课程'
                            conn.execute(text('''
                                INSERT INTO teacher_hours_new 
                                SELECT 
                                    th.id,
                                    th.teacher_id,
                                    th.teacher_name,
                                    :default_course_id as course_id,
                                    :default_course_name as course_name,
                                    th.month,
                                    th.total_hours,
                                    th.incentive,
                                    th.remark,
                                    th.updated_at
                                FROM teacher_hours th
                            '''), {'default_course_id': default_course_id, 'default_course_name': default_course_name})
                    
                    # 3. 删除旧表
                    conn.execute(text('DROP TABLE teacher_hours'))
                    
                    # 4. 重命名新表
                    conn.execute(text('ALTER TABLE teacher_hours_new RENAME TO teacher_hours'))
                
                print('老师课时表已升级，添加了course_id字段')
            else:
                print('老师课时表的course_id字段已存在')
    except Exception as e:
        print(f'升级老师课时表时出错: {e}')
        import traceback
        traceback.print_exc()



def upgrade_student_course_table_with_confirmed():
    """升级学生课程表，添加is_confirmed字段，并将现有课程标记为已确认"""
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        
        if 'student_courses' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('student_courses')]
            
            if 'is_confirmed' not in columns:
                # MySQL使用BOOLEAN/TINYINT，SQLite使用INTEGER
                boolean_type = 'BOOLEAN' if is_mysql() else 'INTEGER'
                with db.engine.begin() as conn:
                    conn.execute(text(f'ALTER TABLE student_courses ADD COLUMN is_confirmed {boolean_type} DEFAULT 0'))
                print('已为学生课程表添加is_confirmed字段')
                
                # 将现有的所有非删除状态的课程标记为已确认（因为它们是历史已排课的记录）
                with db.engine.begin() as conn:
                    result = conn.execute(text('''
                        UPDATE student_courses 
                        SET is_confirmed = 1 
                        WHERE status != '删除'
                    '''))
                    updated_count = result.rowcount
                    print(f'已将 {updated_count} 条现有课程记录标记为已确认')
            else:
                print('学生课程表的is_confirmed字段已存在')
                # 注意：不再自动将所有未确认的课程标记为已确认
                # 只有用户点击"确认上课"按钮后，课程才会被标记为已确认
    except Exception as e:
        print(f'升级学生课程表时出错: {e}')
        import traceback
        traceback.print_exc()



def upgrade_teacher_resume_table():
    """创建教师简历表"""
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        
        if 'teacher_resumes' not in inspector.get_table_names():
            with db.engine.begin() as conn:
                conn.execute(text('''
                    CREATE TABLE teacher_resumes (
                        id INTEGER NOT NULL PRIMARY KEY,
                        teacher_id INTEGER NOT NULL UNIQUE,
                        filename VARCHAR(255) NOT NULL,
                        file_data BLOB NOT NULL,
                        file_size INTEGER NOT NULL,
                        content_type VARCHAR(100),
                        created_at DATETIME,
                        updated_at DATETIME,
                        FOREIGN KEY(teacher_id) REFERENCES teachers (id)
                    )
                '''))
            print('已创建教师简历表')
        else:
            print('教师简历表已存在')
    except Exception as e:
        print(f'创建教师简历表时出错: {e}')
        import traceback
        traceback.print_exc()




def create_student_course_default_schedule_table():
    """创建学生课程默认排课设置表"""
    try:
        inspector = inspect(db.engine)
        
        if 'student_course_default_schedules' not in inspector.get_table_names():
            if is_sqlite():
                with db.engine.begin() as conn:
                    conn.execute(text('''
                        CREATE TABLE student_course_default_schedules (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            student_id INTEGER NOT NULL,
                            course_id INTEGER NOT NULL,
                            default_time_slot VARCHAR(20),
                            default_weekday VARCHAR(10),
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            UNIQUE(student_id, course_id)
                        )
                    '''))
            else:
                with db.engine.begin() as conn:
                    conn.execute(text('''
                        CREATE TABLE student_course_default_schedules (
                            id INT AUTO_INCREMENT PRIMARY KEY,
                            student_id INT NOT NULL,
                            course_id INT NOT NULL,
                            default_time_slot VARCHAR(20),
                            default_weekday VARCHAR(10),
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                            UNIQUE KEY uq_student_course_default (student_id, course_id),
                            FOREIGN KEY (student_id) REFERENCES students(id),
                            FOREIGN KEY (course_id) REFERENCES courses(id)
                        )
                    '''))
            print('已创建学生课程默认排课设置表')
        else:
            print('学生课程默认排课设置表已存在')
    except Exception as e:
        print(f'创建学生课程默认排课设置表时出错: {e}')
        import traceback
        traceback.print_exc()


def create_user_permissions_table():
    """创建用户权限表"""
    try:
        if not table_exists('user_permissions'):
            with db.engine.begin() as conn:
                if is_sqlite():
                    conn.execute(text('''
                        CREATE TABLE user_permissions (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL,
                            module VARCHAR(50) NOT NULL,
                            module_name VARCHAR(100) NOT NULL,
                            is_granted BOOLEAN DEFAULT 1,
                            granted_by INTEGER,
                            granted_at DATETIME,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (user_id) REFERENCES users(id),
                            FOREIGN KEY (granted_by) REFERENCES users(id),
                            UNIQUE(user_id, module)
                        )
                    '''))
                else:
                    conn.execute(text('''
                        CREATE TABLE user_permissions (
                            id INT AUTO_INCREMENT PRIMARY KEY,
                            user_id INT NOT NULL,
                            module VARCHAR(50) NOT NULL,
                            module_name VARCHAR(100) NOT NULL,
                            is_granted TINYINT(1) DEFAULT 1,
                            granted_by INT,
                            granted_at DATETIME,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                            FOREIGN KEY (user_id) REFERENCES users(id),
                            FOREIGN KEY (granted_by) REFERENCES users(id),
                            UNIQUE KEY uq_user_module (user_id, module)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    '''))
            print('用户权限表创建成功')
        else:
            print('用户权限表已存在')
    except Exception as e:
        print(f'创建用户权限表时出错: {e}')
        import traceback
        traceback.print_exc()


def upgrade_user_table_with_session_token():
    """升级用户表，添加session_token字段用于单点登录"""
    try:
        inspector = inspect(db.engine)
        
        if 'users' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('users')]
            
            if 'session_token' not in columns:
                with db.engine.begin() as conn:
                    conn.execute(text('ALTER TABLE users ADD COLUMN session_token VARCHAR(64)'))
                print('已为用户表添加session_token字段')
            else:
                print('用户表的session_token字段已存在')
    except Exception as e:
        print(f'升级用户表（session_token）时出错: {e}')
        import traceback
        traceback.print_exc()


def run_migrations():
    """运行所有数据库迁移"""
    upgrade_student_table()
    upgrade_student_table_with_default_schedule()
    create_student_course_default_schedule_table()
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
    create_user_permissions_table()
    create_student_course_default_schedule_table()
    upgrade_user_table_with_session_token()