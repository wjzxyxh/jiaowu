"""
数据库模型定义
"""
from datetime import datetime
from sqlalchemy import func
from sqlalchemy import LargeBinary
from flask_login import UserMixin

# 从extensions导入db，确保使用同一个实例
from extensions import db


class Student(db.Model):
    """学生信息表"""
    __tablename__ = 'students'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, comment='学生姓名')
    grade = db.Column(db.String(20), comment='年级')
    status = db.Column(db.String(20), default='在校', comment='在校状态：在校/离校')
    phone = db.Column(db.String(20), comment='联系电话')
    parent_name = db.Column(db.String(50), comment='家长姓名')
    parent_phone = db.Column(db.String(20), comment='家长联系电话')
    address = db.Column(db.String(200), comment='家庭地址')
    email = db.Column(db.String(100), comment='邮箱')
    photo_path = db.Column(db.String(255), comment='照片文件路径')
    photo_filename = db.Column(db.String(255), comment='照片原始文件名')
    notes = db.Column(db.Text, comment='备注/学习记录')
    default_time_slot = db.Column(db.String(20), comment='默认上课时段，如8:10-9:30')
    default_weekday = db.Column(db.String(10), comment='默认上课星期，如周一、周二等')
    enrollment_date = db.Column(db.Date, comment='入学日期')
    source = db.Column(db.String(50), comment='来源：转介绍、传单、家教中介、其它')
    excluded_from_scheduling = db.Column(db.Boolean, default=False, comment='是否排除在排课下拉列表中')
    created_at = db.Column(db.DateTime, default=datetime.now)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'grade': self.grade,
            'status': self.status,
            'phone': self.phone,
            'parent_name': self.parent_name,
            'parent_phone': self.parent_phone,
            'address': self.address,
            'notes': self.notes,
            'default_time_slot': self.default_time_slot,
            'default_weekday': self.default_weekday,
            'enrollment_date': self.enrollment_date.strftime('%Y-%m-%d') if self.enrollment_date else None,
            'source': self.source,
            'excluded_from_scheduling': self.excluded_from_scheduling,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class MarketingLead(db.Model):
    """营销模块线索表（待确认/已提交到学生管理）"""
    __tablename__ = 'marketing_leads'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, comment='姓名')
    grade = db.Column(db.String(20), comment='年级')
    source = db.Column(db.String(50), comment='来源：转介绍、传单、家教中介、其它')
    status = db.Column(db.String(20), default='在校', comment='在校状态')
    phone = db.Column(db.String(20), comment='联系电话')
    parent_name = db.Column(db.String(50), comment='家长姓名')
    parent_phone = db.Column(db.String(20), comment='家长电话')
    address = db.Column(db.String(200), comment='地址')
    notes = db.Column(db.Text, comment='备注/学习记录')
    enrollment_date = db.Column(db.Date, comment='登记日期')
    lead_status = db.Column(db.String(20), default='draft', comment='draft=待确认, trial=试课, submitted=已提交到学生管理')
    trial_status = db.Column(db.String(20), nullable=True, comment='试课状态：成功/失败/再试（无排课时也可直接设置）')
    saved_at = db.Column(db.DateTime, comment='暂存时间')
    submitted_at = db.Column(db.DateTime, comment='提交到学生管理时间')
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'grade': self.grade,
            'source': self.source,
            'status': self.status,
            'phone': self.phone,
            'parent_name': self.parent_name,
            'parent_phone': self.parent_phone,
            'address': self.address,
            'notes': self.notes,
            'enrollment_date': self.enrollment_date.strftime('%Y-%m-%d') if self.enrollment_date else None,
            'lead_status': self.lead_status,
            'trial_status': self.trial_status,
            'saved_at': self.saved_at.strftime('%Y-%m-%d %H:%M:%S') if self.saved_at else None,
            'submitted_at': self.submitted_at.strftime('%Y-%m-%d %H:%M:%S') if self.submitted_at else None,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else None,
        }


class Teacher(db.Model):
    """教师信息表"""
    __tablename__ = 'teachers'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, comment='教师姓名')
    subject = db.Column(db.String(50), comment='科目')
    phone = db.Column(db.String(20), comment='联系电话')
    base_salary = db.Column(db.Float, default=0, comment='底薪')
    cost_per_class = db.Column(db.Float, default=0, comment='每节课成本')
    employment_type = db.Column(db.String(20), default='兼职', comment='雇佣类型：兼职/全职')
    status = db.Column(db.String(20), default='启用', comment='状态：启用/停用')
    bio = db.Column(db.Text, comment='简介')
    resume_path = db.Column(db.String(255), comment='简历文件路径')
    resume_filename = db.Column(db.String(255), comment='简历原始文件名')
    created_at = db.Column(db.DateTime, default=datetime.now)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'subject': self.subject,
            'phone': self.phone,
            'base_salary': self.base_salary,
            'cost_per_class': self.cost_per_class,
            'employment_type': self.employment_type if self.employment_type else '兼职',
            'status': self.status,
            'bio': self.bio,
            'resume_path': self.resume_path,
            'resume_filename': self.resume_filename,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class TeacherResume(db.Model):
    """教师简历表"""
    __tablename__ = 'teacher_resumes'
    
    id = db.Column(db.Integer, primary_key=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey('teachers.id'), nullable=False, unique=True, comment='教师ID')
    filename = db.Column(db.String(255), nullable=False, comment='原始文件名')
    file_data = db.Column(LargeBinary, nullable=False, comment='文件二进制数据')
    file_size = db.Column(db.Integer, nullable=False, comment='文件大小（字节）')
    content_type = db.Column(db.String(100), comment='文件MIME类型')
    created_at = db.Column(db.DateTime, default=datetime.now, comment='创建时间')
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now, comment='更新时间')
    
    teacher = db.relationship('Teacher', backref='resume', uselist=False)
    
    def to_dict(self):
        return {
            'id': self.id,
            'teacher_id': self.teacher_id,
            'filename': self.filename,
            'file_size': self.file_size,
            'content_type': self.content_type,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else None
        }


class Course(db.Model):
    """课程表"""
    __tablename__ = 'courses'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, comment='课程名称')
    subject = db.Column(db.String(50), nullable=False, comment='科目')
    unit_price = db.Column(db.Float, nullable=False, comment='课程单价')
    description = db.Column(db.Text, comment='课程描述')
    status = db.Column(db.String(20), default='启用', comment='状态：启用/停用')
    created_at = db.Column(db.DateTime, default=datetime.now)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'subject': self.subject,
            'unit_price': self.unit_price,
            'description': self.description,
            'status': self.status,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class StudentCourse(db.Model):
    """学生课程表"""
    __tablename__ = 'student_courses'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    marketing_lead_id = db.Column(db.Integer, db.ForeignKey('marketing_leads.id'), nullable=True, comment='营销线索ID，试课时使用')
    student_name = db.Column(db.String(50), nullable=False, comment='学生姓名')
    grade = db.Column(db.String(20), comment='年级')
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=True, comment='课程ID')
    subject = db.Column(db.String(50), nullable=False, comment='科目')
    teacher_id = db.Column(db.Integer, db.ForeignKey('teachers.id'), nullable=False)
    teacher_name = db.Column(db.String(50), nullable=False, comment='老师姓名')
    course_date = db.Column(db.Date, nullable=False, comment='日期')
    weekday = db.Column(db.String(10), comment='星期')
    time_slot = db.Column(db.String(20), comment='时段，如8:10-9:30')
    classroom = db.Column(db.String(10), comment='教室，如A1、A2等')
    notes = db.Column(db.String(200), nullable=True, comment='备注')
    status = db.Column(db.String(20), default='正常', comment='状态：正常/请假/跑空')
    trial_status = db.Column(db.String(20), nullable=True, comment='试课状态：成功/失败/再试')
    is_confirmed = db.Column(db.Boolean, default=False, comment='是否已确认上课')
    created_at = db.Column(db.DateTime, default=datetime.now)
    
    student = db.relationship('Student', backref='courses')
    marketing_lead = db.relationship('MarketingLead', backref='trial_courses')
    teacher = db.relationship('Teacher', backref='courses')
    course = db.relationship('Course', backref='student_courses')
    
    def to_dict(self):
        # 获取课程名称
        course_name = None
        if self.course_id and self.course:
            course_name = self.course.name
        elif self.subject:
            course_name = self.subject  # 如果没有关联课程，使用科目作为课程名称
        
        # 如果有营销线索ID，优先使用营销线索的真实姓名（而不是占位学生名称）
        # 兼容历史数据：有些试课记录 student_name 仍为占位名，或 relationship 未预加载
        TRIAL_PLACEHOLDER_NAME = '【试课学员】'
        display_student_name = self.student_name
        display_grade = self.grade
        if self.marketing_lead_id:
            lead = None
            if self.marketing_lead:
                lead = self.marketing_lead
            else:
                try:
                    lead = MarketingLead.query.get(self.marketing_lead_id)
                except Exception:
                    lead = None
            if lead:
                display_student_name = lead.name or display_student_name
                display_grade = lead.grade or display_grade
            else:
                # 线索缺失时：尽量避免继续展示占位名
                if (display_student_name or '').strip() == TRIAL_PLACEHOLDER_NAME:
                    display_student_name = '试课学员'
        
        return {
            'id': self.id,
            'student_id': self.student_id,
            'marketing_lead_id': self.marketing_lead_id,
            'student_name': display_student_name,
            'grade': display_grade,
            'course_id': self.course_id,
            'course_name': course_name,
            'subject': self.subject,
            'teacher_id': self.teacher_id,
            'teacher_name': self.teacher_name,
            'course_date': self.course_date.strftime('%Y-%m-%d') if self.course_date else None,
            'weekday': self.weekday,
            'time_slot': self.time_slot,
            'classroom': self.classroom,
            'notes': self.notes,
            'status': self.status,
            'trial_status': self.trial_status,
            'is_confirmed': self.is_confirmed if self.is_confirmed is not None else False,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class StudentCourseDefaultSchedule(db.Model):
    """学生课程默认排课设置表"""
    __tablename__ = 'student_course_default_schedules'
    
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    default_time_slot = db.Column(db.String(20), comment='默认上课时段，如8:10-9:30')
    default_weekday = db.Column(db.String(10), comment='默认上课星期，如周一、周二等')
    default_teacher_id = db.Column(db.Integer, db.ForeignKey('teachers.id'), nullable=True, comment='默认上课老师ID')
    default_classroom = db.Column(db.String(20), nullable=True, comment='默认教室')
    scheduling_paused = db.Column(db.Boolean, default=False, comment='是否暂停排课（进行中时可切换，暂停后不再参与排课）')
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    
    __table_args__ = (db.UniqueConstraint('student_id', 'course_id', name='uq_student_course_default'),)
    
    student = db.relationship('Student', backref='course_default_schedules')
    course = db.relationship('Course', backref='student_default_schedules')
    default_teacher = db.relationship('Teacher', foreign_keys=[default_teacher_id], backref='student_default_schedules')
    
    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'course_id': self.course_id,
            'default_time_slot': self.default_time_slot or '',
            'default_weekday': self.default_weekday or '',
            'default_teacher_id': self.default_teacher_id,
            'default_classroom': self.default_classroom or '',
            'scheduling_paused': self.scheduling_paused if self.scheduling_paused is not None else False,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else None
        }


class ClassHoursStats(db.Model):
    """课时统计表（系统表）"""
    __tablename__ = 'class_hours_stats'
    
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    student_name = db.Column(db.String(50), nullable=False, comment='姓名')
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False, comment='课程ID')
    course_name = db.Column(db.String(50), nullable=False, comment='课程名称')
    month = db.Column(db.String(7), nullable=False, comment='月份，格式：YYYY-MM')
    __table_args__ = (db.UniqueConstraint('student_id', 'course_id', 'month', name='uq_student_course_month'),)
    original_hours = db.Column(db.Float, default=0, comment='当月原始课时')
    actual_hours = db.Column(db.Float, default=0, comment='当月课时')
    last_month_total = db.Column(db.Float, default=0, comment='上月累计课时')
    current_month_total = db.Column(db.Float, default=0, comment='本月累计课时')
    remaining_hours = db.Column(db.Float, default=0, comment='剩余课时')
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    
    student = db.relationship('Student', backref='hours_stats')
    course = db.relationship('Course', backref='hours_stats')
    
    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'student_name': self.student_name,
            'course_id': self.course_id,
            'course_name': self.course_name,
            'month': self.month,
            'original_hours': self.original_hours,
            'actual_hours': self.actual_hours,
            'last_month_total': self.last_month_total,
            'current_month_total': self.current_month_total,
            'remaining_hours': self.remaining_hours,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else None
        }


class Payment(db.Model):
    """家长缴费表"""
    __tablename__ = 'payments'
    
    id = db.Column(db.Integer, primary_key=True)
    payment_date = db.Column(db.Date, nullable=False, comment='缴费日期')
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    student_name = db.Column(db.String(50), nullable=False, comment='学生姓名')
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=True, comment='课程ID')
    course_name = db.Column(db.String(50), comment='课程名称')
    original_amount = db.Column(db.Float, nullable=False, comment='原始费用')
    discount_rate = db.Column(db.Float, default=0, comment='优惠力度（金额，可为负数，负数表示加价）')
    paid_amount = db.Column(db.Float, nullable=False, comment='缴纳费用')
    class_count = db.Column(db.Integer, nullable=False, comment='报课节数（补充到剩余课时）')
    unit_price = db.Column(db.Float, comment='学生单价（当次缴费/报课次数）')
    type = db.Column(db.String(20), default='缴费', comment='类型：缴费/退费')
    remark = db.Column(db.Text, comment='备注')
    created_at = db.Column(db.DateTime, default=datetime.now)
    
    student = db.relationship('Student', backref='payments')
    course = db.relationship('Course', backref='payments')
    
    def to_dict(self):
        return {
            'id': self.id,
            'payment_date': self.payment_date.strftime('%Y-%m-%d') if self.payment_date else None,
            'student_id': self.student_id,
            'student_name': self.student_name,
            'course_id': self.course_id,
            'course_name': self.course_name,
            'original_amount': self.original_amount,
            'discount_rate': self.discount_rate,
            'paid_amount': self.paid_amount,
            'class_count': self.class_count,
            'unit_price': self.unit_price,
            'remark': self.remark,
            'type': self.type or '缴费',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class TeacherHours(db.Model):
    """老师课时表"""
    __tablename__ = 'teacher_hours'
    
    id = db.Column(db.Integer, primary_key=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey('teachers.id'), nullable=False)
    teacher_name = db.Column(db.String(50), nullable=False, comment='老师姓名')
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False, comment='课程ID')
    course_name = db.Column(db.String(50), nullable=False, comment='课程名称')
    month = db.Column(db.String(7), nullable=False, comment='月份，格式：YYYY-MM')
    __table_args__ = (db.UniqueConstraint('teacher_id', 'course_id', 'month', name='uq_teacher_course_month'),)
    total_hours = db.Column(db.Float, default=0, comment='当月课时总数')
    incentive = db.Column(db.Float, default=0, comment='激励金额')
    remark = db.Column(db.Text, comment='备注')
    is_settled = db.Column(db.Boolean, default=False, comment='是否已结算确认')
    settled_at = db.Column(db.DateTime, comment='结算确认时间')
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    
    teacher = db.relationship('Teacher', backref='hours_records')
    course = db.relationship('Course', backref='teacher_hours_records')
    
    def to_dict(self):
        return {
            'id': self.id if self.id is not None else None,
            'teacher_id': self.teacher_id,
            'teacher_name': self.teacher_name,
            'course_id': self.course_id,
            'course_name': self.course_name,
            'month': self.month,
            'total_hours': self.total_hours if self.total_hours is not None else 0,
            'incentive': self.incentive if self.incentive else 0,
            'remark': self.remark if self.remark else '',
            'is_settled': self.is_settled if self.is_settled is not None else False,
            'settled_at': self.settled_at.strftime('%Y-%m-%d %H:%M:%S') if self.settled_at else None,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else None
        }


class FinanceRecord(db.Model):
    """收支表"""
    __tablename__ = 'finance_records'
    
    id = db.Column(db.Integer, primary_key=True)
    month = db.Column(db.String(7), nullable=False, comment='月份，格式：YYYY-MM')
    
    # 收入
    monthly_revenue = db.Column(db.Float, default=0, comment='当月收入')
    revenue_mode = db.Column(db.String(20), default='课耗模式', comment='收入计算模式：缴费模式/课耗模式')
    
    # 成本
    teacher_cost = db.Column(db.Float, default=0, comment='老师成本')
    marketing_cost = db.Column(db.Float, default=0, comment='营销成本')
    marketing_flyer = db.Column(db.Float, default=0, comment='营销')
    marketing_labor = db.Column(db.Float, default=0, comment='教务')
    rent_utilities = db.Column(db.Float, default=0, comment='房租水电')
    rent = db.Column(db.Float, default=0, comment='房租')
    utilities = db.Column(db.Float, default=0, comment='水电')
    other_cost = db.Column(db.Float, default=0, comment='其它成本')
    other_paper = db.Column(db.Float, default=0, comment='打印纸')
    other_toner = db.Column(db.Float, default=0, comment='打印粉')
    
    # 利润
    monthly_profit = db.Column(db.Float, default=0, comment='当月利润')
    
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    
    def to_dict(self):
        return {
            'id': self.id,
            'month': self.month,
            'monthly_revenue': self.monthly_revenue,
            'revenue_mode': self.revenue_mode if self.revenue_mode else '课耗模式',
            'teacher_cost': self.teacher_cost,
            'marketing_cost': self.marketing_cost,
            'marketing_flyer': self.marketing_flyer,
            'marketing_labor': self.marketing_labor,
            'rent_utilities': self.rent_utilities,
            'rent': self.rent,
            'utilities': self.utilities,
            'other_cost': self.other_cost,
            'other_paper': self.other_paper,
            'other_toner': self.other_toner,
            'monthly_profit': self.monthly_profit,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else None
        }


class TimeSlot(db.Model):
    """时段表"""
    __tablename__ = 'time_slots'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, comment='时段名称，如8:10-9:30')
    start_time = db.Column(db.String(10), nullable=False, comment='开始时间，如8:10')
    end_time = db.Column(db.String(10), nullable=False, comment='结束时间，如9:30')
    status = db.Column(db.String(20), default='启用', comment='状态：启用/停用')
    sort_order = db.Column(db.Integer, default=0, comment='排序顺序')
    created_at = db.Column(db.DateTime, default=datetime.now)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'status': self.status,
            'sort_order': self.sort_order,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class Classroom(db.Model):
    """教室表"""
    __tablename__ = 'classrooms'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(20), nullable=False, unique=True, comment='教室名称，如A1、A2等')
    status = db.Column(db.String(20), default='启用', comment='状态：启用/停用')
    sort_order = db.Column(db.Integer, default=0, comment='排序顺序')
    created_at = db.Column(db.DateTime, default=datetime.now)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'status': self.status,
            'sort_order': self.sort_order,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class FinanceConfig(db.Model):
    """财务配置表"""
    __tablename__ = 'finance_config'
    
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(50), nullable=False, unique=True, comment='配置键')
    value = db.Column(db.Float, nullable=False, comment='配置值')
    description = db.Column(db.String(200), comment='配置说明')
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    
    def to_dict(self):
        return {
            'id': self.id,
            'key': self.key,
            'value': self.value,
            'description': self.description,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else None
        }


class TeacherCourseCost(db.Model):
    """教师课程成本表"""
    __tablename__ = 'teacher_course_costs'
    
    id = db.Column(db.Integer, primary_key=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey('teachers.id'), nullable=False, comment='教师ID')
    teacher_name = db.Column(db.String(50), nullable=False, comment='教师姓名')
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False, comment='课程ID')
    course_name = db.Column(db.String(50), nullable=False, comment='课程名称')
    cost_per_class = db.Column(db.Float, nullable=False, comment='每次课成本')
    start_date = db.Column(db.Date, nullable=True, comment='生效开始日期')
    end_date = db.Column(db.Date, nullable=True, comment='生效结束日期')
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    
    teacher = db.relationship('Teacher', backref='course_costs')
    course = db.relationship('Course', backref='teacher_costs')
    
    def to_dict(self):
        return {
            'id': self.id,
            'teacher_id': self.teacher_id,
            'teacher_name': self.teacher_name,
            'course_id': self.course_id,
            'course_name': self.course_name,
            'cost_per_class': self.cost_per_class,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else None
        }


class TeacherCourseCostHistory(db.Model):
    """教师课程成本操作历史表"""
    __tablename__ = 'teacher_course_cost_history'
    
    id = db.Column(db.Integer, primary_key=True)
    cost_id = db.Column(db.Integer, db.ForeignKey('teacher_course_costs.id', ondelete='SET NULL'), nullable=True, comment='成本记录ID')
    teacher_id = db.Column(db.Integer, nullable=False, comment='教师ID')
    teacher_name = db.Column(db.String(50), nullable=False, comment='教师姓名')
    course_id = db.Column(db.Integer, nullable=False, comment='课程ID')
    course_name = db.Column(db.String(50), nullable=False, comment='课程名称')
    cost_per_class = db.Column(db.Float, nullable=False, comment='每次课成本')
    start_date = db.Column(db.Date, nullable=True, comment='生效开始日期')
    end_date = db.Column(db.Date, nullable=True, comment='生效结束日期')
    old_cost_per_class = db.Column(db.Float, nullable=True, comment='修改前的每次课成本')
    old_start_date = db.Column(db.Date, nullable=True, comment='修改前的生效开始日期')
    old_end_date = db.Column(db.Date, nullable=True, comment='修改前的生效结束日期')
    operation = db.Column(db.String(20), nullable=False, comment='操作类型：创建/更新/删除')
    created_at = db.Column(db.DateTime, default=datetime.now, comment='操作时间')
    
    cost = db.relationship('TeacherCourseCost', backref=db.backref('history_records', passive_deletes=True))
    
    def to_dict(self):
        return {
            'id': self.id,
            'cost_id': self.cost_id,
            'teacher_id': self.teacher_id,
            'teacher_name': self.teacher_name,
            'course_id': self.course_id,
            'course_name': self.course_name,
            'cost_per_class': self.cost_per_class,
            'old_cost_per_class': self.old_cost_per_class,
            'operation': self.operation,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class TeacherExperienceCost(db.Model):
    """教师经验成本表"""
    __tablename__ = 'teacher_experience_costs'
    
    id = db.Column(db.Integer, primary_key=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey('teachers.id'), nullable=False, comment='教师ID')
    teacher_name = db.Column(db.String(50), nullable=False, comment='教师姓名')
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False, comment='课程ID')
    course_name = db.Column(db.String(50), nullable=False, comment='课程名称')
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=True, comment='学生ID（可选，为空表示对所有学生）')
    student_name = db.Column(db.String(50), nullable=True, comment='学生姓名（可选，为空表示对所有学生）')
    experience_cost = db.Column(db.Float, default=0, nullable=False, comment='经验（每次课）')
    start_date = db.Column(db.Date, nullable=True, comment='生效开始日期')
    end_date = db.Column(db.Date, nullable=True, comment='生效结束日期')
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    
    teacher = db.relationship('Teacher', backref='experience_costs')
    course = db.relationship('Course', backref='teacher_experience_costs')
    student = db.relationship('Student', backref='experience_costs')
    
    def to_dict(self):
        return {
            'id': self.id,
            'teacher_id': self.teacher_id,
            'teacher_name': self.teacher_name,
            'course_id': self.course_id,
            'course_name': self.course_name,
            'student_id': self.student_id,
            'student_name': self.student_name,
            'experience_cost': self.experience_cost,
            'start_date': self.start_date.strftime('%Y-%m-%d') if self.start_date else None,
            'end_date': self.end_date.strftime('%Y-%m-%d') if self.end_date else None,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else None
        }


class TeacherExperienceCostHistory(db.Model):
    """教师经验成本操作历史表"""
    __tablename__ = 'teacher_experience_cost_history'
    
    id = db.Column(db.Integer, primary_key=True)
    cost_id = db.Column(db.Integer, db.ForeignKey('teacher_experience_costs.id', ondelete='SET NULL'), nullable=True, comment='经验成本记录ID')
    teacher_id = db.Column(db.Integer, nullable=False, comment='教师ID')
    teacher_name = db.Column(db.String(50), nullable=False, comment='教师姓名')
    course_id = db.Column(db.Integer, nullable=False, comment='课程ID')
    course_name = db.Column(db.String(50), nullable=False, comment='课程名称')
    student_id = db.Column(db.Integer, nullable=True, comment='学生ID（可选）')
    student_name = db.Column(db.String(50), nullable=True, comment='学生姓名（可选）')
    experience_cost = db.Column(db.Float, nullable=False, comment='经验（每次课）')
    start_date = db.Column(db.Date, nullable=True, comment='生效开始日期')
    end_date = db.Column(db.Date, nullable=True, comment='生效结束日期')
    old_experience_cost = db.Column(db.Float, nullable=True, comment='修改前的经验')
    old_start_date = db.Column(db.Date, nullable=True, comment='修改前的生效开始日期')
    old_end_date = db.Column(db.Date, nullable=True, comment='修改前的生效结束日期')
    operation = db.Column(db.String(20), nullable=False, comment='操作类型：创建/更新/删除')
    created_at = db.Column(db.DateTime, default=datetime.now, comment='操作时间')
    
    cost = db.relationship('TeacherExperienceCost', backref='history_records')
    
    def to_dict(self):
        return {
            'id': self.id,
            'cost_id': self.cost_id,
            'teacher_id': self.teacher_id,
            'teacher_name': self.teacher_name,
            'course_id': self.course_id,
            'course_name': self.course_name,
            'student_id': self.student_id,
            'student_name': self.student_name,
            'experience_cost': self.experience_cost,
            'start_date': self.start_date.strftime('%Y-%m-%d') if self.start_date else None,
            'end_date': self.end_date.strftime('%Y-%m-%d') if self.end_date else None,
            'old_experience_cost': self.old_experience_cost,
            'old_start_date': self.old_start_date.strftime('%Y-%m-%d') if self.old_start_date else None,
            'old_end_date': self.old_end_date.strftime('%Y-%m-%d') if self.old_end_date else None,
            'operation': self.operation,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class User(db.Model, UserMixin):
    """用户表"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, comment='用户名')
    password_hash = db.Column(db.String(255), nullable=False, comment='密码哈希')
    role = db.Column(db.String(20), default='user', nullable=False, comment='角色：admin(管理员), teacher(教务), finance(财务), readonly(只读)')
    real_name = db.Column(db.String(50), comment='真实姓名')
    is_active = db.Column(db.Boolean, default=True, comment='是否启用')
    created_at = db.Column(db.DateTime, default=datetime.now, comment='创建时间')
    last_login = db.Column(db.DateTime, comment='最后登录时间')
    session_token = db.Column(db.String(64), nullable=True, comment='会话令牌，用于单点登录')
    
    # Flask-Login 的 get_id 方法（UserMixin已提供is_authenticated和is_anonymous）
    def get_id(self):
        return str(self.id)
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'role': self.role,
            'real_name': self.real_name,
            'is_active': self.is_active,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None,
            'last_login': self.last_login.strftime('%Y-%m-%d %H:%M:%S') if self.last_login else None
        }
    
    def check_password(self, password):
        """检查密码"""
        if not self.password_hash:
            return False
        
        # 检查密码哈希格式：bcrypt 哈希以 $2a$、$2b$ 或 $2y$ 开头
        if self.password_hash.startswith(('$2a$', '$2b$', '$2y$')):
            # 使用 bcrypt 验证
            try:
                from passlib.context import CryptContext
                pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
                return pwd_context.verify(password, self.password_hash)
            except ImportError:
                # 如果 passlib 未安装，无法验证 bcrypt 密码
                return False
            except Exception:
                # bcrypt 验证失败
                return False
        else:
            # 使用 SHA256 验证（兼容旧密码格式）
            import hashlib
            return hashlib.sha256(password.encode('utf-8')).hexdigest() == self.password_hash
    
    def set_password(self, password):
        """设置密码"""
        if not password:
            raise ValueError("密码不能为空")
        
        # bcrypt限制密码长度不能超过72字节，需要截断
        # 先转换为字节，检查长度
        password_bytes = password.encode('utf-8')
        original_length = len(password_bytes)
        
        if original_length > 72:
            # 截断到72字节
            password_bytes = password_bytes[:72]
            # 如果截断后最后一个字节是UTF-8的续字节（0x80-0xBF），需要继续截断
            # 直到遇到UTF-8字符的起始字节
            while len(password_bytes) > 0:
                last_byte = password_bytes[-1]
                # 检查是否是UTF-8续字节（10xxxxxx）
                if (last_byte & 0xC0) == 0x80:
                    password_bytes = password_bytes[:-1]
                else:
                    break
            # 重新解码为字符串
            password = password_bytes.decode('utf-8', errors='ignore')
        
        try:
            from passlib.context import CryptContext
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            # 再次确保密码字节长度不超过72
            final_password_bytes = password.encode('utf-8')
            if len(final_password_bytes) > 72:
                # 如果仍然超过，直接截断字符串（安全方式）
                # 从字符串末尾逐个字符删除，直到字节长度<=72
                while len(final_password_bytes) > 72 and len(password) > 0:
                    password = password[:-1]
                    final_password_bytes = password.encode('utf-8')
            self.password_hash = pwd_context.hash(password)
        except ImportError:
            # 如果 passlib 未安装，使用简单的哈希（仅用于开发环境）
            import hashlib
            self.password_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
            print("警告：passlib 未安装，使用简单哈希（不安全，仅用于开发环境）")
        except Exception as e:
            # 如果bcrypt仍然报错（可能是其他原因），尝试更激进的截断
            error_str = str(e).lower()
            if '72 bytes' in error_str or 'password cannot be longer' in error_str:
                # 更安全的方式：从字符串末尾逐个字符删除
                while len(password.encode('utf-8')) > 72 and len(password) > 0:
                    password = password[:-1]
                # 再次尝试
                try:
                    from passlib.context import CryptContext
                    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
                    self.password_hash = pwd_context.hash(password)
                except:
                    # 如果还是失败，使用SHA256作为后备
                    import hashlib
                    self.password_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
                    print(f"警告：密码过长，已截断并使用SHA256哈希（原始长度：{original_length}字节）")
            else:
                raise
    
    def is_admin(self):
        """是否为管理员"""
        return self.role == 'admin'
    
    def can_edit(self):
        """是否可以编辑（非只读用户）"""
        return self.role != 'readonly'
    
    def can_manage_finance(self):
        """是否可以管理财务"""
        return self.role in ['admin', 'finance']
    
    def has_module_permission(self, module):
        """检查用户是否有指定模块的权限
        Args:
            module: 模块代码（如 'students', 'teachers' 等）
        Returns:
            bool: 如果有权限返回True，否则返回False
        """
        # 管理员默认拥有所有权限
        if self.is_admin():
            return True
        
        # 查询用户权限
        permission = UserPermission.query.filter_by(
            user_id=self.id,
            module=module,
            is_granted=True
        ).first()
        
        return permission is not None
    
    def get_granted_modules(self):
        """获取用户已授权的所有模块列表
        Returns:
            list: 模块代码列表
        """
        # 管理员返回所有模块
        if self.is_admin():
            # 延迟导入避免循环依赖
            try:
                from routes.permissions import MODULE_LIST
                return [m['code'] for m in MODULE_LIST]
            except ImportError:
                # 如果无法导入，返回空列表（在初始化时可能发生）
                return []
        
        # 查询用户权限
        permissions = UserPermission.query.filter_by(
            user_id=self.id,
            is_granted=True
        ).all()
        
        return [p.module for p in permissions]


class UserPermission(db.Model):
    """用户权限表 - 细粒度权限控制"""
    __tablename__ = 'user_permissions'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, comment='用户ID')
    module = db.Column(db.String(50), nullable=False, comment='功能模块代码')
    module_name = db.Column(db.String(100), nullable=False, comment='功能模块名称')
    is_granted = db.Column(db.Boolean, default=True, comment='是否授权')
    function_permissions = db.Column(db.JSON, nullable=True, comment='功能权限：{"function_code": true/false}')  # 新增字段
    granted_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, comment='授权人ID')
    granted_at = db.Column(db.DateTime, default=datetime.now, comment='授权时间')
    created_at = db.Column(db.DateTime, default=datetime.now, comment='创建时间')
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now, comment='更新时间')
    
    # 关系
    user = db.relationship('User', foreign_keys=[user_id], backref='permissions')
    granter = db.relationship('User', foreign_keys=[granted_by])
    
    # 唯一约束：每个用户每个模块只能有一条记录
    __table_args__ = (db.UniqueConstraint('user_id', 'module', name='uq_user_module'),)
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'module': self.module,
            'module_name': self.module_name,
            'is_granted': self.is_granted,
            'function_permissions': self.function_permissions or {},  # 返回功能权限字典
            'granted_by': self.granted_by,
            'granted_at': self.granted_at.strftime('%Y-%m-%d %H:%M:%S') if self.granted_at else None,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else None
        }


class LoginLog(db.Model):
    """登录日志表"""
    __tablename__ = 'login_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, comment='用户ID')
    username = db.Column(db.String(80), nullable=False, comment='用户名')
    ip_address = db.Column(db.String(50), comment='IP地址')
    user_agent = db.Column(db.String(500), comment='用户代理')
    login_time = db.Column(db.DateTime, default=datetime.now, comment='登录时间')
    success = db.Column(db.Boolean, default=False, comment='是否成功')
    failure_reason = db.Column(db.String(200), comment='失败原因')
    
    user = db.relationship('User', backref='login_logs')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'username': self.username,
            'ip_address': self.ip_address,
            'user_agent': self.user_agent,
            'login_time': self.login_time.strftime('%Y-%m-%d %H:%M:%S') if self.login_time else None,
            'success': self.success,
            'failure_reason': self.failure_reason
        }


class OperationLog(db.Model):
    """操作日志表"""
    __tablename__ = 'operation_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, comment='用户ID')
    username = db.Column(db.String(80), nullable=False, comment='用户名')
    module = db.Column(db.String(50), nullable=False, comment='模块：students, teachers, courses, payments, finance等')
    operation = db.Column(db.String(20), nullable=False, comment='操作类型：create, update, delete')
    entity_type = db.Column(db.String(50), nullable=False, comment='实体类型：Student, Teacher, Course等')
    entity_id = db.Column(db.Integer, nullable=True, comment='实体ID')
    entity_name = db.Column(db.String(200), nullable=True, comment='实体名称，如学生姓名')
    old_data = db.Column(db.Text, nullable=True, comment='旧数据（JSON格式）')
    new_data = db.Column(db.Text, nullable=True, comment='新数据（JSON格式）')
    ip_address = db.Column(db.String(50), comment='IP地址')
    created_at = db.Column(db.DateTime, default=datetime.now, comment='操作时间')
    
    user = db.relationship('User', backref='operation_logs')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'username': self.username,
            'module': self.module,
            'operation': self.operation,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'entity_name': self.entity_name,
            'old_data': self.old_data,
            'new_data': self.new_data,
            'ip_address': self.ip_address,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class Notification(db.Model):
    """通知表"""
    __tablename__ = 'notifications'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, comment='用户ID（None表示所有用户）')
    type = db.Column(db.String(20), nullable=False, comment='通知类型：hours(课时), payment(缴费), course(课程), system(系统)')
    title = db.Column(db.String(200), nullable=False, comment='标题')
    content = db.Column(db.Text, nullable=False, comment='内容')
    link = db.Column(db.String(500), comment='跳转链接')
    is_read = db.Column(db.Boolean, default=False, comment='是否已读')
    created_at = db.Column(db.DateTime, default=datetime.now, comment='创建时间')
    
    user = db.relationship('User', backref='notifications')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'type': self.type,
            'title': self.title,
            'content': self.content,
            'link': self.link,
            'is_read': self.is_read,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }

