"""
Courses路由模块
从app_old.py提取
"""
from flask import Blueprint, request, jsonify, render_template, send_from_directory, Response
from flask_login import login_required, current_user
from extensions import db, limiter, csrf
from models import (
    Student, Teacher, Course, StudentCourse, ClassHoursStats, Payment, 
    TeacherHours, FinanceRecord, TimeSlot, Classroom, FinanceConfig,
    TeacherCourseCost, TeacherCourseCostHistory, TeacherExperienceCost,
    TeacherExperienceCostHistory, TeacherResume, User, LoginLog, 
    OperationLog, Notification, MarketingLead
)
from utils import (
    allowed_file, get_original_filename, get_safe_storage_filename,
    get_client_ip, log_operation, require_permission, get_current_month,
    get_weekday, check_course_conflicts
)
from services import (
    create_notification, check_and_create_notifications,
    update_class_hours_stats, update_teacher_hours,
    get_finance_config, calculate_remaining_hours_from_payments,
    calculate_actual_unit_price, update_finance_record
)
from config import Config
import os
from datetime import datetime, date, timedelta
from sqlalchemy import func, extract
from sqlalchemy.orm import joinedload
import calendar
import io
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
import json
from urllib.parse import quote
from werkzeug.utils import secure_filename

bp = Blueprint('courses', __name__)

# 试课排课占位学生名称（用于试课学员，不显示在学生列表中）
TRIAL_PLACEHOLDER_NAME = '【试课学员】'


def _get_or_create_trial_placeholder_student():
    """获取或创建试课排课占位学生"""
    placeholder = Student.query.filter_by(name=TRIAL_PLACEHOLDER_NAME).first()
    if not placeholder:
        placeholder = Student(
            name=TRIAL_PLACEHOLDER_NAME,
            grade='',
            status='离校',
        )
        db.session.add(placeholder)
        db.session.flush()
    return placeholder


def _monday_of_week_containing(d):
    """返回 d 所在周的周一（周为周一到周日）。"""
    return d - timedelta(days=d.weekday())


def _first_monday_of_month(year, month_num):
    """返回当月第一个周一（每月第一周从当月的第一个周一开始算起）。"""
    first_day = date(year, month_num, 1)
    offset = (7 - first_day.weekday()) % 7  # 0=周一->0, 6=周日->1, 1=周二->6, ...
    return first_day + timedelta(days=offset)


@bp.route('/api/courses', methods=['GET'])
# @limiter.limit("200 per minute")  # 限流已禁用
def get_courses():

    """获取所有课程"""

    week = request.args.get('week')

    month = request.args.get('month')

    

    # 获取筛选参数

    filter_teacher = request.args.get('teacher')

    filter_classroom = request.args.get('classroom')

    filter_subject = request.args.get('subject')

    filter_grade = request.args.get('grade')

    filter_student_id = request.args.get('student_id')  # 支持按学生ID筛选

    filter_trial_lead_id = request.args.get('trial_lead_id')  # 支持按试课线索ID筛选

    filter_trial_lead_ids = request.args.get('trial_lead_ids')  # 营销模块：多个线索ID，逗号分隔

    scope_month = request.args.get('scope') == 'month'  # 试课模式：查询整月（用于计算老师课时费）

    scope_leads = request.args.get('scope') == 'leads'  # 营销模块：按多个线索ID查询排课

    

    # 营销模块：按多个线索ID查询排课（不限月份）
    if filter_trial_lead_ids and scope_leads:
        try:
            lead_ids = [int(x.strip()) for x in filter_trial_lead_ids.split(',') if x.strip()]
        except (ValueError, AttributeError):
            lead_ids = []
        if lead_ids:
            from models import Student
            query = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).options(
                joinedload(StudentCourse.course)
            ).filter(
                StudentCourse.marketing_lead_id.in_(lead_ids),
                StudentCourse.status != '删除'
            ).order_by(StudentCourse.course_date.desc(), StudentCourse.time_slot)
            courses = query.all()
            return jsonify([c.to_dict() for c in courses])
        return jsonify([])

    

    # 构建基础查询过滤器

    def apply_filters(query):

        if filter_teacher:

            query = query.filter(StudentCourse.teacher_name == filter_teacher)

        if filter_classroom:

            query = query.filter(StudentCourse.classroom == filter_classroom)

        if filter_subject:

            query = query.filter(StudentCourse.subject == filter_subject)

        if filter_grade:

            query = query.filter(StudentCourse.grade == filter_grade)

        if filter_student_id:

            query = query.filter(StudentCourse.student_id == filter_student_id)

        if filter_trial_lead_id:

            query = query.filter(StudentCourse.marketing_lead_id == filter_trial_lead_id)

        # 营销模块排课为独立排课，不显示在其它地方；非营销查询时排除 marketing_lead_id
        else:

            query = query.filter(StudentCourse.marketing_lead_id.is_(None))

        return query

    

    if month and week:

        # 按年月和周查询（每月从第1周开始）

        # 第1周：从1号开始，到第一个周日结束

        # 第2周及以后：从第一个周一开始，每7天一周

        try:

            year, month_num = map(int, month.split('-'))

            week_num = int(week)

            

            first_day = date(year, month_num, 1)

            first_day_weekday = first_day.weekday()  # 0=Monday, 6=Sunday

            month_start = date(year, month_num, 1)

            month_end = date(year, month_num, calendar.monthrange(year, month_num)[1])

            

            # 如果指定了student_id，查询整个月的记录（不限制周）

            if filter_student_id:

                # 查询整个月的记录（过滤已删除的学生）
                from models import Student
                query = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).options(

                    joinedload(StudentCourse.course)

                ).filter(

                    StudentCourse.course_date >= month_start,

                    StudentCourse.course_date <= month_end,

                    StudentCourse.status != '删除'

                )

                # 应用筛选条件（包括student_id）

                query = apply_filters(query)

                courses = query.all()

                

                # 调试信息

                print(f"API查询（按学生ID，整个月）: month={month}, student_id={filter_student_id}")

                print(f"日期范围: {month_start} 到 {month_end}")

                print(f"查询结果数量: {len(courses)}")

                if len(courses) > 0:

                    print(f"第一条记录日期: {courses[0].course_date}")

                

                return jsonify([c.to_dict() for c in courses])

            

            # 如果指定了trial_lead_id且scope=month，查询整个月的试课记录（用于试课排课页计算老师课时费）
            if filter_trial_lead_id and scope_month:
                from models import Student
                query = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).options(
                    joinedload(StudentCourse.course)
                ).filter(
                    StudentCourse.course_date >= month_start,
                    StudentCourse.course_date <= month_end,
                    StudentCourse.status != '删除',
                    StudentCourse.marketing_lead_id == filter_trial_lead_id
                )
                courses = query.all()
                return jsonify([c.to_dict() for c in courses])

            

            # 否则按周查询：第一周 = 当月第一个周一，周一到周日
            first_monday = _first_monday_of_month(year, month_num)
            start_date = first_monday + timedelta(weeks=week_num - 1)
            end_date = start_date + timedelta(days=6)

            # 按周范围查询（不限制在当月内，以便包含跨周的日期如2月1日）
            from models import Student
            query = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).options(

                joinedload(StudentCourse.course)

            ).filter(

                StudentCourse.course_date >= start_date,

                StudentCourse.course_date <= end_date,

                StudentCourse.status != '删除'

            )

            # 应用筛选条件

            query = apply_filters(query)

            courses = query.all()

            

            # 调试信息

            print(f"API查询: month={month}, week={week_num}")

            print(f"日期范围: {start_date} 到 {end_date}")

            print(f"查询结果数量: {len(courses)}")

            if len(courses) > 0:

                print(f"第一条记录日期: {courses[0].course_date}")

            

            return jsonify([c.to_dict() for c in courses])

        except (ValueError, IndexError) as e:

            # 如果格式错误，回退到当前周（周一到周日）
            today = date.today()
            start_date = _monday_of_week_containing(today)
            end_date = start_date + timedelta(days=6)

            from models import Student
            query = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).options(
                joinedload(StudentCourse.course)
            ).filter(
                StudentCourse.course_date >= start_date,
                StudentCourse.course_date <= end_date,
                StudentCourse.status != '删除'
            )
            query = apply_filters(query)
            courses = query.all()
            return jsonify([c.to_dict() for c in courses])

    elif month:

        # 按月查询（保留兼容性）

        year, month_num = map(int, month.split('-'))

        start_date = date(year, month_num, 1)

        end_date = date(year, month_num, calendar.monthrange(year, month_num)[1])

        

        # 过滤已删除的学生
        from models import Student
        query = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).options(

            joinedload(StudentCourse.course)

        ).filter(

            StudentCourse.course_date >= start_date,

            StudentCourse.course_date <= end_date,

            StudentCourse.status != '删除'

        )

        # 应用筛选条件

        query = apply_filters(query)

        courses = query.all()

        return jsonify([c.to_dict() for c in courses])

    else:

        # 默认返回当前周的数据（周一到周日）
        today = date.today()
        start_date = _monday_of_week_containing(today)
        end_date = start_date + timedelta(days=6)

        from models import Student
        query = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).options(
            joinedload(StudentCourse.course)
        ).filter(
            StudentCourse.course_date >= start_date,
            StudentCourse.course_date <= end_date,
            StudentCourse.status != '删除'
        )
        query = apply_filters(query)
        courses = query.all()
        return jsonify([c.to_dict() for c in courses])






@bp.route('/api/courses', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def create_course():

    """创建排课"""

    try:

        data = request.json

        if not data:

            return jsonify({'error': '请求数据为空'}), 400

        

        # 验证必需字段（试课可传 marketing_lead_id 代替 student_id）

        is_trial = 'marketing_lead_id' in data and data.get('marketing_lead_id')

        if not is_trial and 'student_id' not in data:

            return jsonify({'error': '缺少学生ID'}), 400

        if 'teacher_id' not in data:

            return jsonify({'error': '缺少教师ID'}), 400

        if 'course_date' not in data:

            return jsonify({'error': '缺少课程日期'}), 400

        if 'subject' not in data or not data.get('subject'):

            return jsonify({'error': '缺少科目信息'}), 400

        

        # 获取学生/试课线索和教师

        if is_trial:

            lead = db.session.get(MarketingLead, data['marketing_lead_id'])

            if not lead:

                return jsonify({'error': f'营销线索ID {data["marketing_lead_id"]} 不存在'}), 404

            placeholder = _get_or_create_trial_placeholder_student()

            student = placeholder

            student_name = lead.name

            student_grade = lead.grade or ''

            marketing_lead_id = lead.id

        else:

            student = db.session.get(Student, data['student_id'])

            if not student:

                return jsonify({'error': f'学生ID {data["student_id"]} 不存在'}), 404

            student_name = student.name

            student_grade = student.grade or ''

            marketing_lead_id = None

        

        teacher = db.session.get(Teacher, data['teacher_id'])

        if not teacher:

            return jsonify({'error': f'教师ID {data["teacher_id"]} 不存在'}), 404

        

        # 解析日期

        try:

            course_date = datetime.strptime(data['course_date'], '%Y-%m-%d').date()

            weekday = get_weekday(data['course_date'])

        except ValueError as e:

            return jsonify({'error': f'日期格式错误: {data.get("course_date")}, 错误: {str(e)}'}), 400

        

        # 获取科目（必填）
        subject = data.get('subject', '').strip()
        if not subject:
            return jsonify({'error': '必须指定科目'}), 400

        # 获取课程ID（可选，如果没有提供则根据科目查找默认课程）
        course_id = data.get('course_id')
        if not course_id or course_id == '':
            # 如果没有提供课程ID，尝试根据科目查找一个默认课程
            # 优先查找该科目下状态为"启用"的第一个课程
            course_obj = Course.query.filter_by(
                subject=subject,
                status='启用'
            ).first()
            
            if not course_obj:
                # 如果找不到启用的课程，查找任意状态的课程
                course_obj = Course.query.filter_by(subject=subject).first()
            
            if not course_obj:
                return jsonify({
                    'error': f'科目"{subject}"下没有可用的课程，请先在"课程管理"中添加该科目的课程'
                }), 400
            
            course_id = course_obj.id
        else:
            try:
                course_id = int(course_id)
                course_obj = db.session.get(Course, course_id)
                if not course_obj:
                    return jsonify({'error': '课程不存在'}), 400
                # 验证课程科目是否匹配
                if course_obj.subject != subject:
                    return jsonify({
                        'error': f'选择的课程科目"{course_obj.subject}"与指定的科目"{subject}"不匹配'
                    }), 400
            except (ValueError, TypeError):
                return jsonify({'error': '课程ID格式错误'}), 400

        

        # 计算当前日期所在的周范围（周一到周日，用于检查重复）
        week_start = _monday_of_week_containing(course_date)
        week_end = week_start + timedelta(days=6)

        # 检查同一周内是否已存在相同的记录（学生姓名/线索、星期、课程、时段相同）

        time_slot = data.get('time_slot', '')

        base_dup = StudentCourse.query.filter(

            StudentCourse.weekday == weekday,

            StudentCourse.course_id == course_id,

            StudentCourse.time_slot == time_slot,

            StudentCourse.course_date >= week_start,

            StudentCourse.course_date <= week_end,

            StudentCourse.status != '删除'

        )

        if is_trial:

            existing_course = base_dup.filter(

                StudentCourse.marketing_lead_id == marketing_lead_id

            ).first()

        else:

            existing_course = base_dup.filter(

                StudentCourse.student_name == student_name

            ).first()

        

        if existing_course:

            return jsonify({

                'error': f'该周内已存在相同的排课记录：{existing_course.course_date.strftime("%Y-%m-%d")} ({weekday}) {course_obj.name} {time_slot or ""}'

            }), 400

        

        # 检查课程冲突

        time_slot = data.get('time_slot', '')

        classroom = data.get('classroom', '')

        conflict_check = check_course_conflicts(

            course_date=course_date,

            time_slot=time_slot,

            teacher_id=teacher.id,

            classroom=classroom,

            student_id=student.id

        )

        

        if conflict_check['has_conflict']:

            conflict_messages = [c['message'] for c in conflict_check['conflicts']]

            return jsonify({

                'error': '检测到课程冲突',

                'conflicts': conflict_check['conflicts'],

                'message': '；'.join(conflict_messages)

            }), 400

        

        # 在创建排课记录之前，试课以外的需检查剩余课时（按课程）

        if not is_trial:

            month = course_date.strftime('%Y-%m')

            stats = ClassHoursStats.query.filter_by(

                student_id=student.id,

                course_id=course_id,

                month=month

            ).first()

            

            # 获取配置的最小排课课时阈值

            min_hours_for_scheduling = get_finance_config('min_hours_for_scheduling', -1)

            

            # 检查剩余课时，如果低于配置值则不允许排课

            if stats:

                if stats.remaining_hours < min_hours_for_scheduling:

                    return jsonify({

                        'error': f'学生 {student.name} 的课程 {course_obj.name} 剩余课时为 {stats.remaining_hours}，低于 {min_hours_for_scheduling}，无法排课。请先缴费！'

                    }), 400

        

        # 创建排课记录

        # 注意：新创建的排课记录默认 is_confirmed=False，不会更新课时统计

        # 只有点击确认上课后，is_confirmed 变为 True，才会更新课时统计

        course = StudentCourse(

            student_id=student.id,

            marketing_lead_id=marketing_lead_id,

            student_name=student_name,

            grade=student_grade,

            course_id=course_id,

            subject=subject,

            teacher_id=teacher.id,

            teacher_name=teacher.name,

            course_date=course_date,

            weekday=weekday,

            time_slot=time_slot,

            classroom=classroom,

            notes=(data.get('notes') or '').strip() or None,

            status='正常',

            is_confirmed=False  # 明确设置为未确认状态，只有确认上课后才更新课时统计

        )

        db.session.add(course)

        

        # 注意：课时统计只在确认上课时更新，创建排课记录时不更新课时统计

        # 剩余课时只由缴费记录修改，排课不直接修改剩余课时

        # 剩余课时会在缴费/退费时自动更新

        

        db.session.commit()

        

        # 注意：老师课时统计也只在确认上课时更新

        # 创建排课时不会调用 update_class_hours_stats 或 update_teacher_hours

        

        return jsonify(course.to_dict()), 201

    except Exception as e:

        db.session.rollback()

        import traceback

        error_trace = traceback.format_exc()

        print(f"创建排课错误: {str(e)}")

        print(f"错误堆栈: {error_trace}")

        return jsonify({'error': f'创建排课失败: {str(e)}', 'details': error_trace}), 500






@bp.route('/api/courses/last-time-slot/<int:student_id>', methods=['GET'])
def get_last_time_slot(student_id):

    """获取学生上次排课的时段"""

    last_course = StudentCourse.query.filter_by(

        student_id=student_id,

        status='正常'

    ).order_by(StudentCourse.course_date.desc(), StudentCourse.created_at.desc()).first()

    

    if last_course and last_course.time_slot:

        return jsonify({'time_slot': last_course.time_slot})

    return jsonify({'time_slot': ''})






@bp.route('/api/courses/check-conflicts', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def check_course_conflicts_api():

    """检查课程冲突（供前端实时检测）"""

    try:

        data = request.json

        if not data:

            return jsonify({'error': '请求数据为空'}), 400

        

        # 验证必需字段

        if 'course_date' not in data:

            return jsonify({'error': '缺少课程日期'}), 400

        if 'time_slot' not in data:

            return jsonify({'error': '缺少时段'}), 400

        if 'teacher_id' not in data:

            return jsonify({'error': '缺少教师ID'}), 400

        if 'student_id' not in data:

            return jsonify({'error': '缺少学生ID'}), 400

        

        # 解析日期

        try:

            course_date = datetime.strptime(data['course_date'], '%Y-%m-%d').date()

        except ValueError:

            return jsonify({'error': '日期格式错误'}), 400

        

        time_slot = data.get('time_slot', '')

        classroom = data.get('classroom', '')

        teacher_id = int(data['teacher_id'])

        student_id = int(data['student_id'])

        exclude_course_id = data.get('exclude_course_id')  # 更新时排除自己

        

        # 检查冲突

        conflict_check = check_course_conflicts(

            course_date=course_date,

            time_slot=time_slot,

            teacher_id=teacher_id,

            classroom=classroom,

            student_id=student_id,

            exclude_course_id=exclude_course_id

        )

        

        return jsonify(conflict_check), 200

    except Exception as e:

        import traceback

        error_trace = traceback.format_exc()

        print(f"检查冲突错误: {str(e)}")

        print(f"错误堆栈: {error_trace}")

        return jsonify({'error': f'检查冲突失败: {str(e)}'}), 500






@bp.route('/api/courses/<int:course_id>', methods=['PUT'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def update_course(course_id):

    """更新课程（修改状态）"""

    course = StudentCourse.query.get_or_404(course_id)

    data = request.json

    # 权限检查：已确认上课的排课只有管理员可以编辑
    if course.is_confirmed and not current_user.is_admin():
        return jsonify({'error': '无权限编辑已确认上课的排课，只有管理员可以编辑'}), 403

    # 如果课程已确认上课，不允许修改关键字段（只有管理员可以编辑，但即使是管理员也不允许修改关键字段）
    # 关键字段包括：course_date, time_slot, weekday, classroom, teacher_id, course_id, student_id, subject
    if course.is_confirmed:
        restricted_fields = ['course_date', 'time_slot', 'weekday', 'classroom', 'teacher_id', 'course_id', 'student_id', 'subject']
        for field in restricted_fields:
            if field in data:
                return jsonify({
                    'error': f'课程已确认上课，不允许修改{field}字段。如需修改，请先取消确认。'
                }), 400

    

    old_status = course.status
    old_is_confirmed = course.is_confirmed
    
    # 如果课程未确认，允许修改所有字段（除了is_confirmed需要通过确认按钮修改）
    if not course.is_confirmed:
        # 允许修改所有字段
        if 'student_id' in data:
            student = Student.query.get(data['student_id'])
            if student:
                course.student_id = data['student_id']
                course.student_name = student.name
        if 'course_id' in data:
            course.course_id = data['course_id']
            if data['course_id']:
                course_obj = Course.query.get(data['course_id'])
                if course_obj:
                    course.course_name = course_obj.name
                    course.subject = course_obj.subject or data.get('subject', course.subject)
        if 'subject' in data:
            course.subject = data['subject']
        if 'teacher_id' in data:
            teacher = Teacher.query.get(data['teacher_id'])
            if teacher:
                course.teacher_id = data['teacher_id']
                course.teacher_name = teacher.name
        if 'course_date' in data:
            try:
                course.course_date = datetime.strptime(data['course_date'], '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'error': '日期格式错误'}), 400
        if 'time_slot' in data:
            course.time_slot = data['time_slot']
        if 'weekday' in data:
            course.weekday = data['weekday']
        if 'classroom' in data:
            course.classroom = data['classroom']
        if 'notes' in data:
            course.notes = (data.get('notes') or '').strip() or None
    
    # 状态字段总是可以修改
    course.status = data.get('status', course.status)
    
    # 试课状态字段处理
    old_trial_status = course.trial_status
    if 'trial_status' in data:
        trial_status = (data.get('trial_status') or '').strip() or None
        course.trial_status = trial_status
        
        # 如果状态设置为"再试"，将营销线索状态改回draft（待确认），以便可以再次排课
        if trial_status == '再试' and course.marketing_lead_id:
            lead = MarketingLead.query.get(course.marketing_lead_id)
            if lead:
                # 将线索状态改回draft，使其出现在待确认名单中
                if lead.lead_status != 'draft':
                    lead.lead_status = 'draft'
                    lead.submitted_at = None
                    lead.saved_at = datetime.now()
                    log_operation('marketing', 'update', 'MarketingLead', lead.id, lead.name, 
                                 f'试课状态设为再试，已恢复至待确认名单')
        
        # 如果状态设置为"成功"，且是试课课程（有marketing_lead_id），则创建正式学生并关联所有相关课程
        if trial_status == '成功' and course.marketing_lead_id:
            lead = MarketingLead.query.get(course.marketing_lead_id)
            if lead:
                # 检查是否已经存在同名同年级的学生
                existing_student = Student.query.filter_by(
                    name=lead.name,
                    grade=lead.grade or None
                ).first()
                
                if existing_student:
                    # 如果学生已存在，直接关联到该学生
                    student = existing_student
                    student_created = False
                else:
                    # 创建新学生（确保状态为"在校"，这样会显示在学生列表中）
                    student = Student(
                        name=lead.name,
                        grade=lead.grade or None,
                        status='在校',  # 确保状态为"在校"，显示在学生管理页面
                        phone=lead.phone or None,
                        parent_name=lead.parent_name or None,
                        parent_phone=lead.parent_phone or None,
                        address=lead.address or None,
                        notes=lead.notes or None,
                        enrollment_date=lead.enrollment_date or None,
                        source=lead.source or None
                    )
                    db.session.add(student)
                    db.session.flush()  # 获取student.id
                    student_created = True
                    # 记录操作日志
                    log_operation('students', 'create', 'Student', student.id, student.name, 
                                 f'从营销线索自动创建：{lead.name}')
                
                # 将该营销线索下的所有课程都关联到正式学生
                all_trial_courses = StudentCourse.query.filter_by(
                    marketing_lead_id=course.marketing_lead_id
                ).filter(
                    StudentCourse.status != '删除'
                ).all()
                
                courses_updated = 0
                for trial_course in all_trial_courses:
                    # 只更新那些还是占位学生的课程
                    if not trial_course.student_id or (trial_course.student_id and trial_course.student_name == TRIAL_PLACEHOLDER_NAME):
                        trial_course.student_id = student.id
                        trial_course.student_name = student.name
                        courses_updated += 1
                
                # 更新营销线索状态为已提交
                if lead.lead_status != 'submitted':
                    lead.lead_status = 'submitted'
                    lead.submitted_at = datetime.now()
                    log_operation('marketing', 'update', 'MarketingLead', lead.id, lead.name, 
                                 f'试课成功，已转为正式学生')
    
    # 如果提供了is_confirmed字段，更新确认状态（但通常通过确认按钮修改）
    if 'is_confirmed' in data:
        course.is_confirmed = bool(data['is_confirmed'])

    

    db.session.commit()

    

    # 只有在确认状态发生变化时才更新课时统计

    # 课时统计只在确认上课时进行增减

    if 'is_confirmed' in data and old_is_confirmed != course.is_confirmed:

        month = course.course_date.strftime('%Y-%m')

        if course.course_id:

            if not course.marketing_lead_id:

                update_class_hours_stats(course.student_id, month, course.course_id)

                update_teacher_hours(course.teacher_id, month, course.course_id)

    

    return jsonify(course.to_dict())




@bp.route('/api/courses/<int:course_id>/confirm', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def confirm_course(course_id):

    """确认/取消确认上课（切换状态）。确认只能从前往后：要确认某日课程，必须先确认该学生该课程下更早日期的课程。"""

    try:
        course = StudentCourse.query.get(course_id)
        
        if not course:
            return jsonify({'error': f'排课记录 ID {course_id} 不存在或已被删除'}), 404

        # 若是「确认上课」（从未确认变为已确认），必须先保证更早日期的同学生同课程已确认
        if not course.is_confirmed:
            course_id_match = (StudentCourse.course_id == course.course_id) if course.course_id is not None else StudentCourse.course_id.is_(None)
            earlier_list = StudentCourse.query.filter(
                StudentCourse.student_id == course.student_id,
                course_id_match,
                StudentCourse.course_date < course.course_date,
                StudentCourse.is_confirmed == False,
                StudentCourse.status != '删除'
            ).order_by(StudentCourse.course_date.asc()).all()
            if earlier_list:
                required = [{'course_date': c.course_date.strftime('%Y-%m-%d'), 'time_slot': c.time_slot or ''} for c in earlier_list]
                parts = [f"{c.course_date.month}月{c.course_date.day}日 {c.time_slot or ''}".strip() for c in earlier_list]
                return jsonify({
                    'error': '请先确认更早日期的课程',
                    'required_courses': required,
                    'required_courses_label': '、'.join(parts)
                }), 400

        # 切换确认状态

        course.is_confirmed = not course.is_confirmed

        db.session.commit()

        

        # 更新课时统计（按课程，试课不更新学生课时）

        month = course.course_date.strftime('%Y-%m')

        if course.course_id:

            if not course.marketing_lead_id:

                update_class_hours_stats(course.student_id, month, course.course_id)

                update_teacher_hours(course.teacher_id, month, course.course_id)

                update_finance_record(month)

        

        return jsonify(course.to_dict())
    
    except Exception as e:
        db.session.rollback()
        import traceback
        error_trace = traceback.format_exc()
        print(f"[ERROR] 确认课程失败: {str(e)}")
        print(f"[ERROR] 错误堆栈: {error_trace}")
        return jsonify({'error': f'确认课程失败: {str(e)}'}), 500




@bp.route('/api/courses/batch-confirm', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def batch_confirm_courses():

    """批量确认上课"""

    try:
        # 更可靠的方法检查 JSON 请求
        content_type = request.headers.get('Content-Type', '')
        if 'application/json' not in content_type:
            return jsonify({'error': '请求必须是 JSON 格式，Content-Type 应为 application/json'}), 400
        
        # 尝试获取 JSON 数据
        try:
            data = request.get_json(force=True)  # force=True 即使 Content-Type 不对也尝试解析
        except Exception as e:
            return jsonify({'error': f'JSON 解析失败: {str(e)}'}), 400
        
        if not data:
            return jsonify({'error': '请求数据为空'}), 400

        course_ids = data.get('course_ids')
        
        # 调试信息
        print(f"收到批量确认请求: course_ids={course_ids}, type={type(course_ids)}")

        # 验证 course_ids 是否存在
        if course_ids is None:
            return jsonify({'error': '缺少 course_ids 参数'}), 400

        # 验证 course_ids 是否为列表
        if not isinstance(course_ids, list):
            return jsonify({'error': f'course_ids 必须是数组，当前类型: {type(course_ids).__name__}'}), 400

        if not course_ids:
            return jsonify({'error': '请选择要确认的课程'}), 400

        # 验证并转换 course_ids 为整数列表
        try:
            course_ids = [int(cid) for cid in course_ids if cid is not None]
            if not course_ids:
                return jsonify({'error': 'course_ids 必须包含有效的整数ID'}), 400
        except (ValueError, TypeError) as e:
            return jsonify({'error': f'course_ids 必须包含有效的整数ID: {str(e)}'}), 400

        # 获取所有课程（过滤已删除的学生）
        from models import Student
        courses = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).filter(StudentCourse.id.in_(course_ids)).all()

        if not courses:
            return jsonify({'error': '未找到要确认的课程'}), 404

        # 确认只能从前往后：对每条要确认的记录，检查同学生同课程下是否有更早未确认的
        for course in courses:
            if course.is_confirmed:
                continue
            course_id_match = (StudentCourse.course_id == course.course_id) if course.course_id is not None else StudentCourse.course_id.is_(None)
            earlier_list = StudentCourse.query.filter(
                StudentCourse.student_id == course.student_id,
                course_id_match,
                StudentCourse.course_date < course.course_date,
                StudentCourse.is_confirmed == False,
                StudentCourse.status != '删除'
            ).order_by(StudentCourse.course_date.asc()).all()
            if earlier_list:
                required = [{'course_date': c.course_date.strftime('%Y-%m-%d'), 'time_slot': c.time_slot or ''} for c in earlier_list]
                parts = [f"{c.course_date.month}月{c.course_date.day}日 {c.time_slot or ''}".strip() for c in earlier_list]
                return jsonify({
                    'error': '请先确认更早日期的课程',
                    'required_courses': required,
                    'required_courses_label': '、'.join(parts)
                }), 400

        # 统计需要更新的学生和课程组合
        updated_students_courses = set()
        confirmed_count = 0
        already_confirmed_count = 0

        for course in courses:
            if course.is_confirmed:
                already_confirmed_count += 1
                continue

            course.is_confirmed = True
            confirmed_count += 1

            # 记录需要更新的学生-课程-月份组合（试课不更新学生课时）
            if course.course_id and not course.marketing_lead_id:
                month = course.course_date.strftime('%Y-%m')
                updated_students_courses.add((course.student_id, course.course_id, month))

        db.session.commit()

        # 批量更新课时统计
        for student_id, course_id, month in updated_students_courses:
            update_class_hours_stats(student_id, month, course_id)

        # 批量更新老师课时统计（试课不统计老师课时）
        updated_teachers_courses = set()
        updated_months = set()
        for course in courses:
            if course.course_id and not course.marketing_lead_id:
                month = course.course_date.strftime('%Y-%m')
                updated_teachers_courses.add((course.teacher_id, course.course_id, month))
                updated_months.add(month)

        for teacher_id, course_id, month in updated_teachers_courses:
            update_teacher_hours(teacher_id, month, course_id)

        for month in updated_months:
            update_finance_record(month)

        return jsonify({
            'message': f'成功确认 {confirmed_count} 个课程',
            'confirmed_count': confirmed_count,
            'already_confirmed_count': already_confirmed_count
        })
    except Exception as e:
        db.session.rollback()
        import traceback
        error_trace = traceback.format_exc()
        print(f"批量确认课程错误: {str(e)}")
        print(f"错误堆栈: {error_trace}")
        return jsonify({'error': f'批量确认失败: {str(e)}'}), 500




@bp.route('/api/courses/batch-cancel-confirm', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def batch_cancel_confirm_courses():

    """批量取消确认上课"""

    try:
        # 更可靠的方法检查 JSON 请求
        content_type = request.headers.get('Content-Type', '')
        if 'application/json' not in content_type:
            return jsonify({'error': '请求必须是 JSON 格式，Content-Type 应为 application/json'}), 400
        
        # 尝试获取 JSON 数据
        data = None
        try:
            # 先尝试正常解析
            data = request.get_json()
            # 如果返回 None，尝试强制解析
            if data is None:
                data = request.get_json(force=True, silent=True)
        except Exception as e:
            import traceback
            print(f"JSON 解析异常: {str(e)}")
            print(traceback.format_exc())
            return jsonify({'error': f'JSON 解析失败: {str(e)}'}), 400
        
        if data is None:
            # 尝试从原始数据获取
            try:
                import json
                raw_data = request.get_data(as_text=True)
                if raw_data:
                    data = json.loads(raw_data)
                else:
                    return jsonify({'error': '请求数据为空'}), 400
            except Exception as e:
                return jsonify({'error': f'无法解析请求数据: {str(e)}'}), 400
        
        if not data:
            return jsonify({'error': '请求数据为空'}), 400

        course_ids = data.get('course_ids')
        
        # 调试信息
        print(f"收到批量取消确认请求: course_ids={course_ids}, type={type(course_ids)}")

        # 验证 course_ids 是否存在
        if course_ids is None:
            return jsonify({'error': '缺少 course_ids 参数'}), 400

        # 验证 course_ids 是否为列表
        if not isinstance(course_ids, list):
            return jsonify({'error': f'course_ids 必须是数组，当前类型: {type(course_ids).__name__}'}), 400

        if not course_ids:
            return jsonify({'error': '请选择要取消确认的课程'}), 400

        # 验证并转换 course_ids 为整数列表
        try:
            course_ids = [int(cid) for cid in course_ids if cid is not None]
            if not course_ids:
                return jsonify({'error': 'course_ids 必须包含有效的整数ID'}), 400
        except (ValueError, TypeError) as e:
            return jsonify({'error': f'course_ids 必须包含有效的整数ID: {str(e)}'}), 400

        # 获取所有课程（过滤已删除的学生）
        from models import Student
        courses = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).filter(StudentCourse.id.in_(course_ids)).all()

        if not courses:
            return jsonify({'error': '未找到要取消确认的课程'}), 404

        # 统计需要更新的学生和课程组合
        updated_students_courses = set()
        cancelled_count = 0
        already_cancelled_count = 0

        for course in courses:
            if not course.is_confirmed:
                already_cancelled_count += 1
                continue

            course.is_confirmed = False
            cancelled_count += 1

            # 记录需要更新的学生-课程-月份组合（试课不更新学生课时）
            if course.course_id and not course.marketing_lead_id:
                month = course.course_date.strftime('%Y-%m')
                updated_students_courses.add((course.student_id, course.course_id, month))

        db.session.commit()

        # 批量更新课时统计
        for student_id, course_id, month in updated_students_courses:
            update_class_hours_stats(student_id, month, course_id)

        # 批量更新老师课时统计（试课不统计老师课时）
        updated_teachers_courses = set()
        updated_months = set()
        for course in courses:
            if course.course_id and not course.marketing_lead_id:
                month = course.course_date.strftime('%Y-%m')
                updated_teachers_courses.add((course.teacher_id, course.course_id, month))
                updated_months.add(month)

        for teacher_id, course_id, month in updated_teachers_courses:
            update_teacher_hours(teacher_id, month, course_id)

        for month in updated_months:
            update_finance_record(month)

        return jsonify({
            'message': f'成功取消确认 {cancelled_count} 个课程',
            'cancelled_count': cancelled_count,
            'already_cancelled_count': already_cancelled_count
        })
    except Exception as e:
        db.session.rollback()
        import traceback
        error_trace = traceback.format_exc()
        print(f"批量取消确认课程错误: {str(e)}")
        print(f"错误堆栈: {error_trace}")
        return jsonify({'error': f'批量取消确认失败: {str(e)}'}), 500






@bp.route('/api/courses/<int:course_id>', methods=['DELETE'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def delete_course(course_id):

    """删除排课（彻底删除）"""

    try:
        course = StudentCourse.query.get(course_id)
        
        if not course:
            return jsonify({'error': f'排课记录 ID {course_id} 不存在或已被删除'}), 404

        # 权限检查：除管理员外，子管理员无权限删除已经确认上课的排课
        if course.is_confirmed and not current_user.is_admin():
            return jsonify({'error': '无权限删除已确认上课的排课，只有管理员可以删除'}), 403

        # 先保存必要信息用于更新统计（删除前获取）
        was_confirmed = course.is_confirmed
        course_date = course.course_date
        student_id = course.student_id
        teacher_id = course.teacher_id
        course_id_for_stats = course.course_id
        is_trial = bool(course.marketing_lead_id)

        # 彻底删除记录
        db.session.delete(course)
        db.session.commit()

        # 只有删除已确认的课程时才更新课时统计（试课不更新学生和老师课时）
        if was_confirmed and not is_trial and course_id_for_stats:
            month = course_date.strftime('%Y-%m')
            update_class_hours_stats(student_id, month, course_id_for_stats)
            update_teacher_hours(teacher_id, month, course_id_for_stats)
            update_finance_record(month)

        # 注意：剩余课时只由缴费记录修改，删除排课不直接修改剩余课时
        # 剩余课时会在缴费/退费时自动更新

        return jsonify({'message': '删除成功'})
    except Exception as e:
        db.session.rollback()
        import traceback
        error_trace = traceback.format_exc()
        print(f"删除排课错误: {str(e)}")
        print(f"错误堆栈: {error_trace}")
        return jsonify({'error': f'删除失败: {str(e)}'}), 500






