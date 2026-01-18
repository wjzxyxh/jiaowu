"""
数据库初始化数据
"""
from extensions import db


def init_default_courses(force_reset=False):
    """初始化默认课程"""
    from models import Course
    
    if force_reset:
        Course.query.delete()
        db.session.commit()
        print('已清空所有课程')
    
    if Course.query.count() > 0:
        return
    
    subjects = ['数学', '语文', '英语', '物理', '化学']
    default_courses = []
    
    for subject in subjects:
        default_courses.append(
            Course(name=f'{subject}1v1', subject=subject, unit_price=400.0, description='', status='启用')
        )
        default_courses.append(
            Course(name=f'{subject}1v2', subject=subject, unit_price=380.0, description='', status='启用')
        )
    
    for course in default_courses:
        db.session.add(course)
    
    db.session.commit()
    print('默认课程初始化完成')


def init_default_time_slots():
    """初始化默认时段"""
    from models import TimeSlot
    
    if TimeSlot.query.count() > 0:
        return
    
    default_slots = [
        {'name': '8:10-9:30', 'start_time': '8:10', 'end_time': '9:30', 'sort_order': 1},
        {'name': '9:40-11:00', 'start_time': '9:40', 'end_time': '11:00', 'sort_order': 2},
        {'name': '11:10-12:30', 'start_time': '11:10', 'end_time': '12:30', 'sort_order': 3},
        {'name': '12:40-14:00', 'start_time': '12:40', 'end_time': '14:00', 'sort_order': 4},
        {'name': '14:10-15:30', 'start_time': '14:10', 'end_time': '15:30', 'sort_order': 5},
        {'name': '15:40-17:00', 'start_time': '15:40', 'end_time': '17:00', 'sort_order': 6},
        {'name': '17:10-18:30', 'start_time': '17:10', 'end_time': '18:30', 'sort_order': 7},
        {'name': '18:40-20:00', 'start_time': '18:40', 'end_time': '20:00', 'sort_order': 8},
        {'name': '20:10-21:30', 'start_time': '20:10', 'end_time': '21:30', 'sort_order': 9},
    ]
    
    for slot_data in default_slots:
        slot = TimeSlot(**slot_data, status='启用')
        db.session.add(slot)
    
    db.session.commit()
    print('默认时段初始化完成')


def init_default_classrooms():
    """初始化默认教室"""
    from models import Classroom
    
    if Classroom.query.count() > 0:
        return
    
    default_classrooms = [
        {'name': 'A1', 'sort_order': 1},
        {'name': 'A2', 'sort_order': 2},
        {'name': 'A3', 'sort_order': 3},
        {'name': 'A4', 'sort_order': 4},
        {'name': 'A5', 'sort_order': 5},
        {'name': 'A6', 'sort_order': 6},
        {'name': 'A7', 'sort_order': 7},
    ]
    
    for room_data in default_classrooms:
        room = Classroom(**room_data, status='启用')
        db.session.add(room)
    
    db.session.commit()
    print('默认教室初始化完成')


def init_default_user():
    """初始化默认管理员用户"""
    from models import User
    
    if User.query.count() == 0:
        admin = User(
            username='admin',
            role='admin',
            real_name='系统管理员',
            is_active=True
        )
        admin.set_password('admin123')
        db.session.add(admin)
        db.session.commit()
        print('已创建默认管理员用户: admin / admin123')


def init_finance_config():
    """初始化财务配置"""
    from models import FinanceConfig
    
    # 检查是否已有配置
    if FinanceConfig.query.count() > 0:
        return
    
    # 创建默认配置
    default_configs = [
        FinanceConfig(
            key='min_hours_for_scheduling',
            value=-1,  # 默认值：-1（整数）
            description='剩余课时低于此值不能排课'
        ),
        FinanceConfig(
            key='min_hours_for_reminder',
            value=3,  # 默认值：3（整数）
            description='剩余课时低于此值需要进行提醒'
        )
    ]
    
    for config in default_configs:
        db.session.add(config)
    
    db.session.commit()
    print('财务配置初始化完成')


def init_default_data():
    """初始化所有默认数据"""
    init_default_courses()
    init_default_time_slots()
    init_default_classrooms()
    init_default_user()
    init_finance_config()
