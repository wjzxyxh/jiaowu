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
    OperationLog, Notification
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

@bp.route('/api/courses', methods=['GET'])
@limiter.limit("200 per minute")  # 数据查询接口，允许更频繁的请求
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

            

            # 否则按周查询

            if week_num == 1:

                # 第1周：从1号开始，到第一个周日结束

                # 如果1号是周日，第1周只有1号

                # 如果1号是周一，第1周是1-7号

                # 如果1号是周四，第1周是1-4号

                if first_day_weekday == 6:  # 周日

                    # 1号是周日，第1周只有1号

                    start_date = first_day

                    end_date = first_day

                else:

                    # 找到第一个周日

                    days_to_sunday = 6 - first_day_weekday  # 0=周一->6天到周日, 1=周二->5天, ..., 5=周六->1天

                    first_sunday = first_day + timedelta(days=days_to_sunday)

                    start_date = first_day

                    end_date = min(first_sunday, month_end)

            else:

                # 第2周及以后：从第一个周一开始

                # 找到第一个周一

                if first_day_weekday == 0:  # 周一

                    days_to_monday = 0

                else:

                    days_to_monday = 7 - first_day_weekday  # 1=周二->6天, 2=周三->5天, ..., 6=周日->1天

                

                first_monday = first_day + timedelta(days=days_to_monday)

                

                # 第2周从第一个周一开始，第3周从第二个周一开始，以此类推

                # 一周的结束是周日，所以结束日期是开始日期（周一）+6天

                start_date = first_monday + timedelta(weeks=week_num - 2)

                end_date = start_date + timedelta(days=6)  # 周日

                

                # 确保日期在月份内

                if start_date > month_end:

                    return jsonify([])

                end_date = min(end_date, month_end)

            

            # 只查询该月内的数据，并加载课程关联（过滤已删除的学生）
            from models import Student
            query = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).options(

                joinedload(StudentCourse.course)

            ).filter(

                StudentCourse.course_date >= month_start,

                StudentCourse.course_date <= month_end,

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

            # 如果格式错误，回退到当前周

            today = date.today()

            year = today.year

            month_num = today.month

            first_day = date(year, month_num, 1)

            first_day_weekday = first_day.weekday()

            day_of_month = today.day

            month_end = date(year, month_num, calendar.monthrange(year, month_num)[1])

            

            # 计算当前日期是第几周（使用与上面相同的逻辑）

            if first_day_weekday == 6:  # 1号是周日

                if day_of_month == 1:

                    week_num = 1

                    start_date = first_day

                    end_date = first_day

                else:

                    first_monday = first_day + timedelta(days=1)

                    days_from_first_monday = day_of_month - first_monday.day

                    week_num = days_from_first_monday // 7 + 2

                    start_date = first_monday + timedelta(weeks=week_num - 2)

                    end_date = min(start_date + timedelta(days=6), month_end)

            else:

                days_to_sunday = 6 - first_day_weekday

                first_sunday = first_day + timedelta(days=days_to_sunday)

                

                if day_of_month <= first_sunday.day:

                    week_num = 1

                    start_date = first_day

                    end_date = min(first_sunday, month_end)

                else:

                    if first_day_weekday == 0:

                        days_to_monday = 0

                    else:

                        days_to_monday = 7 - first_day_weekday

                    first_monday = first_day + timedelta(days=days_to_monday)

                    days_from_first_monday = day_of_month - first_monday.day

                    week_num = days_from_first_monday // 7 + 2

                    start_date = first_monday + timedelta(weeks=week_num - 2)

                    end_date = min(start_date + timedelta(days=6), month_end)

            

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

        # 默认返回当前周的数据（使用当前日期所在的年月和周）

        today = date.today()

        year = today.year

        month_num = today.month

        first_day = date(year, month_num, 1)

        first_day_weekday = first_day.weekday()  # 0=Monday, 6=Sunday

        day_of_month = today.day

        month_end = date(year, month_num, calendar.monthrange(year, month_num)[1])

        

        # 计算当前日期是第几周

        if first_day_weekday == 6:  # 1号是周日

            # 第1周只有1号

            if day_of_month == 1:

                week_num = 1

                start_date = first_day

                end_date = first_day

            else:

                # 从第2周开始

                first_monday = first_day + timedelta(days=1)

                days_from_first_monday = day_of_month - first_monday.day

                week_num = days_from_first_monday // 7 + 2

                start_date = first_monday + timedelta(weeks=week_num - 2)

                end_date = min(start_date + timedelta(days=6), month_end)

        else:

            # 找到第一个周日

            days_to_sunday = 6 - first_day_weekday

            first_sunday = first_day + timedelta(days=days_to_sunday)

            

            if day_of_month <= first_sunday.day:

                # 在第1周内（1号到第一个周日）

                week_num = 1

                start_date = first_day

                end_date = min(first_sunday, month_end)

            else:

                # 在第2周及以后

                # 找到第一个周一

                if first_day_weekday == 0:  # 周一

                    days_to_monday = 0

                else:

                    days_to_monday = 7 - first_day_weekday

                first_monday = first_day + timedelta(days=days_to_monday)

                days_from_first_monday = day_of_month - first_monday.day

                week_num = days_from_first_monday // 7 + 2

                start_date = first_monday + timedelta(weeks=week_num - 2)

                end_date = min(start_date + timedelta(days=6), month_end)

        

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






@bp.route('/api/courses', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def create_course():

    """创建排课"""

    try:

        data = request.json

        if not data:

            return jsonify({'error': '请求数据为空'}), 400

        

        # 验证必需字段

        if 'student_id' not in data:

            return jsonify({'error': '缺少学生ID'}), 400

        if 'teacher_id' not in data:

            return jsonify({'error': '缺少教师ID'}), 400

        if 'course_date' not in data:

            return jsonify({'error': '缺少课程日期'}), 400

        if 'subject' not in data or not data.get('subject'):

            return jsonify({'error': '缺少科目信息'}), 400

        

        # 获取学生和教师

        student = db.session.get(Student, data['student_id'])

        if not student:

            return jsonify({'error': f'学生ID {data["student_id"]} 不存在'}), 404

        

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

        

        # 计算当前日期所在的周范围（用于检查重复）

        year = course_date.year

        month_num = course_date.month

        day_of_month = course_date.day

        

        first_day = date(year, month_num, 1)

        first_day_weekday = first_day.weekday()  # 0=Monday, 6=Sunday

        month_end = date(year, month_num, calendar.monthrange(year, month_num)[1])

        

        # 计算当前日期所在的周

        if first_day_weekday == 6:  # 1号是周日

            if day_of_month == 1:

                week_start = first_day

                week_end = first_day

            else:

                first_monday = first_day + timedelta(days=1)

                days_from_first_monday = day_of_month - first_monday.day

                week_num = days_from_first_monday // 7 + 2

                week_start = first_monday + timedelta(weeks=week_num - 2)

                week_end = min(week_start + timedelta(days=6), month_end)

        else:

            days_to_sunday = 6 - first_day_weekday

            first_sunday = first_day + timedelta(days=days_to_sunday)

            

            if day_of_month <= first_sunday.day:

                week_start = first_day

                week_end = min(first_sunday, month_end)

            else:

                if first_day_weekday == 0:  # 周一

                    days_to_monday = 0

                else:

                    days_to_monday = 7 - first_day_weekday

                first_monday = first_day + timedelta(days=days_to_monday)

                days_from_first_monday = day_of_month - first_monday.day

                week_num = days_from_first_monday // 7 + 2

                week_start = first_monday + timedelta(weeks=week_num - 2)

                week_end = min(week_start + timedelta(days=6), month_end)

        

        # 检查同一周内是否已存在相同的记录（学生姓名、星期、课程、时段相同）

        time_slot = data.get('time_slot', '')

        existing_course = StudentCourse.query.filter(

            StudentCourse.student_name == student.name,

            StudentCourse.weekday == weekday,

            StudentCourse.course_id == course_id,

            StudentCourse.time_slot == time_slot,

            StudentCourse.course_date >= week_start,

            StudentCourse.course_date <= week_end,

            StudentCourse.status != '删除'

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

        

        # 在创建排课记录之前，先检查剩余课时（按课程）

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

            student_name=student.name,

            grade=student.grade,

            course_id=course_id,

            subject=subject,

            teacher_id=teacher.id,

            teacher_name=teacher.name,

            course_date=course_date,

            weekday=weekday,

            time_slot=time_slot,

            classroom=classroom,

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
    
    # 状态字段总是可以修改
    course.status = data.get('status', course.status)
    
    # 如果提供了is_confirmed字段，更新确认状态（但通常通过确认按钮修改）
    if 'is_confirmed' in data:
        course.is_confirmed = bool(data['is_confirmed'])

    

    db.session.commit()

    

    # 只有在确认状态发生变化时才更新课时统计

    # 课时统计只在确认上课时进行增减

    if 'is_confirmed' in data and old_is_confirmed != course.is_confirmed:

        month = course.course_date.strftime('%Y-%m')

        if course.course_id:

            update_class_hours_stats(course.student_id, month, course.course_id)

            update_teacher_hours(course.teacher_id, month, course.course_id)

    

    return jsonify(course.to_dict())




@bp.route('/api/courses/<int:course_id>/confirm', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def confirm_course(course_id):

    """确认/取消确认上课（切换状态）"""

    try:
        course = StudentCourse.query.get(course_id)
        
        if not course:
            return jsonify({'error': f'排课记录 ID {course_id} 不存在或已被删除'}), 404

        # 切换确认状态

        course.is_confirmed = not course.is_confirmed

        db.session.commit()

        

        # 更新课时统计（按课程）

        month = course.course_date.strftime('%Y-%m')

        if course.course_id:

            update_class_hours_stats(course.student_id, month, course.course_id)

            update_teacher_hours(course.teacher_id, month, course.course_id)

            # 更新财务记录（成本、工资、利润）

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

            # 记录需要更新的学生-课程-月份组合
            if course.course_id:
                month = course.course_date.strftime('%Y-%m')
                updated_students_courses.add((course.student_id, course.course_id, month))

        db.session.commit()

        # 批量更新课时统计
        for student_id, course_id, month in updated_students_courses:
            update_class_hours_stats(student_id, month, course_id)

        # 批量更新老师课时统计
        updated_teachers_courses = set()
        for course in courses:
            if course.course_id:
                month = course.course_date.strftime('%Y-%m')
                updated_teachers_courses.add((course.teacher_id, course.course_id, month))

        for teacher_id, course_id, month in updated_teachers_courses:
            update_teacher_hours(teacher_id, month, course_id)

        # 更新财务记录（成本、工资、利润）- 只更新涉及的月份
        updated_months = set()
        for course in courses:
            if course.course_id:
                month = course.course_date.strftime('%Y-%m')
                updated_months.add(month)

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

            # 记录需要更新的学生-课程-月份组合
            if course.course_id:
                month = course.course_date.strftime('%Y-%m')
                updated_students_courses.add((course.student_id, course.course_id, month))

        db.session.commit()

        # 批量更新课时统计
        for student_id, course_id, month in updated_students_courses:
            update_class_hours_stats(student_id, month, course_id)

        # 批量更新老师课时统计
        updated_teachers_courses = set()
        for course in courses:
            if course.course_id:
                month = course.course_date.strftime('%Y-%m')
                updated_teachers_courses.add((course.teacher_id, course.course_id, month))

        for teacher_id, course_id, month in updated_teachers_courses:
            update_teacher_hours(teacher_id, month, course_id)

        # 更新财务记录（成本、工资、利润）- 只更新涉及的月份
        updated_months = set()
        for course in courses:
            if course.course_id:
                month = course.course_date.strftime('%Y-%m')
                updated_months.add(month)

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

        # 彻底删除记录
        db.session.delete(course)
        db.session.commit()

        # 只有删除已确认的课程时才更新课时统计
        # 因为只有已确认的课程才会影响课时统计
        if was_confirmed:
            month = course_date.strftime('%Y-%m')

            if course_id_for_stats:
                update_class_hours_stats(student_id, month, course_id_for_stats)

                # 更新老师课时（按课程）
                update_teacher_hours(teacher_id, month, course_id_for_stats)

                # 更新财务记录（成本、工资、利润）
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






