"""
Students路由模块
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
    OperationLog, Notification, StudentCourseDefaultSchedule
)
from utils import (
    allowed_file, get_original_filename, get_safe_storage_filename,
    validate_file_mime_type, get_client_ip, log_operation, require_permission,
    get_current_month, get_weekday, check_course_conflicts, handle_db_errors,
    validate_json, validate_required_fields
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

bp = Blueprint('students', __name__)

@bp.route('/api/students', methods=['GET'])
@login_required
def get_students():
    """获取所有学生（支持筛选和分页）"""
    try:
        # 获取筛选参数
        status = request.args.get('status', '')
        grade = request.args.get('grade', '')
        enrollment_date_start = request.args.get('enrollment_date_start', '')
        enrollment_date_end = request.args.get('enrollment_date_end', '')
        search_keyword = request.args.get('search', '').strip()
        
        # 获取分页参数
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        # 确保分页参数有效
        if page < 1:
            page = 1
        if per_page < 1:
            per_page = 20
        if per_page > 100:  # 限制每页最大数量
            per_page = 100
        
        # 构建查询
        query = Student.query
        
        # 状态筛选
        if status:
            query = query.filter_by(status=status)
        
        # 年级筛选
        if grade:
            query = query.filter_by(grade=grade)
        
        # 入学日期范围筛选
        if enrollment_date_start:
            try:
                start_date = datetime.strptime(enrollment_date_start, '%Y-%m-%d').date()
                query = query.filter(Student.enrollment_date >= start_date)
            except ValueError:
                pass  # 忽略无效的日期格式
        
        if enrollment_date_end:
            try:
                end_date = datetime.strptime(enrollment_date_end, '%Y-%m-%d').date()
                query = query.filter(Student.enrollment_date <= end_date)
            except ValueError:
                pass  # 忽略无效的日期格式
        
        # 搜索关键词（姓名、电话、家长姓名）
        if search_keyword:
            search_pattern = f'%{search_keyword}%'
            query = query.filter(
                db.or_(
                    Student.name.like(search_pattern),
                    Student.phone.like(search_pattern),
                    Student.parent_name.like(search_pattern)
                )
            )
        
        # 按创建时间倒序排列
        query = query.order_by(Student.created_at.desc())
        
        # 获取总数
        total = query.count()
        
        # 分页查询
        pagination = query.paginate(page=page, per_page=per_page, error_out=False)
        students = pagination.items
        
        # 计算分页信息
        total_pages = pagination.pages
        has_prev = pagination.has_prev
        has_next = pagination.has_next
        
        return jsonify({
            'students': [s.to_dict() for s in students],
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'total_pages': total_pages,
                'has_prev': has_prev,
                'has_next': has_next
            }
        })
    except Exception as e:
        import traceback
        error_msg = f"获取学生列表失败: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({'error': f'获取学生列表失败: {str(e)}'}), 500






@bp.route('/api/students', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('edit')
@handle_db_errors
def create_student():
    """创建学生"""
    
    # JSON请求
    if not request.is_json:
        return jsonify({'error': '请求必须是JSON格式'}), 400
    
    data = request.json
    if not data:
        return jsonify({'error': '请求数据为空'}), 400
    
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': '姓名不能为空'}), 400
    
    if len(name) > 50:
        return jsonify({'error': '姓名长度不能超过50个字符'}), 400
    
    # 处理入学日期
    enrollment_date_str = data.get('enrollment_date', '').strip()
    enrollment_date = None
    if enrollment_date_str:
        try:
            enrollment_date = datetime.strptime(enrollment_date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': '入学日期格式不正确，应为YYYY-MM-DD格式'}), 400
    
    student = Student(
        name=name,
        grade=data.get('grade', '').strip(),
        status=data.get('status', '在校'),
        phone=data.get('phone', '').strip(),
        parent_name=data.get('parent_name', '').strip(),
        parent_phone=data.get('parent_phone', '').strip(),
        address=data.get('address', '').strip(),
        notes=data.get('notes', '').strip(),
        enrollment_date=enrollment_date
    )
    
    db.session.add(student)
    db.session.commit()
    log_operation('students', 'create', 'Student', student.id, student.name)
    return jsonify(student.to_dict()), 201






@bp.route('/api/students/<int:student_id>', methods=['PUT'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('edit')
@handle_db_errors
def update_student(student_id):
    """更新学生信息"""
    student = Student.query.get_or_404(student_id)
    
    old_data = student.to_dict()
    
    # JSON请求
    if not request.is_json:
        return jsonify({'error': '请求必须是JSON格式'}), 400
    
    data = request.json
    if not data:
        return jsonify({'error': '请求数据为空'}), 400
    
    name = data.get('name', '').strip()
    if name:
        if len(name) > 50:
            return jsonify({'error': '姓名长度不能超过50个字符'}), 400
        student.name = name
    
    student.grade = data.get('grade', student.grade).strip() if data.get('grade') else student.grade
    student.status = data.get('status', student.status)
    student.phone = data.get('phone', student.phone).strip() if data.get('phone') else student.phone
    student.parent_name = data.get('parent_name', student.parent_name).strip() if data.get('parent_name') else student.parent_name
    student.parent_phone = data.get('parent_phone', student.parent_phone).strip() if data.get('parent_phone') else student.parent_phone
    student.address = data.get('address', student.address).strip() if data.get('address') else student.address
    student.notes = data.get('notes', student.notes).strip() if data.get('notes') else student.notes
    
    # 处理入学日期
    enrollment_date_str = data.get('enrollment_date', '').strip()
    if enrollment_date_str:
        try:
            student.enrollment_date = datetime.strptime(enrollment_date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': '入学日期格式不正确，应为YYYY-MM-DD格式'}), 400
    elif 'enrollment_date' in data and data.get('enrollment_date') == '':
        # 如果传入空字符串，表示要清空入学日期
        student.enrollment_date = None
    
    db.session.commit()
    log_operation('students', 'update', 'Student', student.id, student.name, old_data, student.to_dict())
    return jsonify(student.to_dict())





# DELETE路由必须在更具体的路由（如 /remaining-hours）之前注册


@bp.route('/api/students/<int:student_id>', methods=['DELETE'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('edit')
@handle_db_errors
def delete_student(student_id):
    """删除学生（彻底删除，不是隐藏，级联删除相关数据）"""
    student = Student.query.get(student_id)
    
    if not student:
        return jsonify({'error': f'学生ID {student_id} 不存在或已被删除'}), 404
    
    student_name = student.name
    
    from models import StudentCourse, ClassHoursStats, Payment, TeacherExperienceCost, StudentCourseDefaultSchedule, TeacherExperienceCostHistory
    
    # 收集需要重新计算老师课时的信息（teacher_id, course_id, month）
    affected_teacher_courses = set()
    # 收集所有受影响的月份（用于重新计算财务记录）
    affected_months = set()
    
    try:
        # 1. 删除该学生的所有默认排课设置记录
        default_schedules = StudentCourseDefaultSchedule.query.filter_by(student_id=student_id).all()
        schedule_count = len(default_schedules)
        for schedule in default_schedules:
            db.session.delete(schedule)
        if schedule_count > 0:
            print(f'已删除 {schedule_count} 条默认排课设置记录（学生ID: {student_id}）')
        
        # 2. 删除该学生的所有排课记录（彻底删除，不是隐藏）
        student_courses = StudentCourse.query.filter_by(student_id=student_id).all()
        course_count = len(student_courses)
        deleted_course_ids = []
        for sc in student_courses:
            # 记录受影响的老师和课程，用于后续重新计算老师课时
            if sc.teacher_id and sc.course_id and sc.course_date:
                month = sc.course_date.strftime('%Y-%m')
                affected_teacher_courses.add((sc.teacher_id, sc.course_id, month))
                affected_months.add(month)
            deleted_course_ids.append(sc.id)
            db.session.delete(sc)
        if course_count > 0:
            print(f'已删除 {course_count} 条排课记录（学生ID: {student_id}，排课ID: {deleted_course_ids[:10]}）')
        
        # 3. 删除该学生的课时统计记录（收集月份信息）
        stats_records = ClassHoursStats.query.filter_by(student_id=student_id).all()
        stats_count = len(stats_records)
        for stat in stats_records:
            if stat.month:
                affected_months.add(stat.month)
            db.session.delete(stat)
        if stats_count > 0:
            print(f'已删除 {stats_count} 条课时统计记录（学生ID: {student_id}）')
        
        # 4. 删除该学生的缴费记录（收集月份信息）
        payment_records = Payment.query.filter_by(student_id=student_id).all()
        payment_count = len(payment_records)
        for payment in payment_records:
            if payment.payment_date:
                month = payment.payment_date.strftime('%Y-%m')
                affected_months.add(month)
            db.session.delete(payment)
        if payment_count > 0:
            print(f'已删除 {payment_count} 条缴费记录（学生ID: {student_id}）')
        
        # 5. 删除该学生的经验成本记录
        exp_cost_records = TeacherExperienceCost.query.filter_by(student_id=student_id).all()
        exp_cost_count = len(exp_cost_records)
        for exp_cost in exp_cost_records:
            db.session.delete(exp_cost)
        if exp_cost_count > 0:
            print(f'已删除 {exp_cost_count} 条经验成本记录（学生ID: {student_id}）')
        
        # 5.1. 删除该学生的经验成本历史记录
        exp_cost_history_records = TeacherExperienceCostHistory.query.filter_by(student_id=student_id).all()
        exp_cost_history_count = len(exp_cost_history_records)
        for exp_cost_history in exp_cost_history_records:
            db.session.delete(exp_cost_history)
        if exp_cost_history_count > 0:
            print(f'已删除 {exp_cost_history_count} 条经验成本历史记录（学生ID: {student_id}）')
        
        # 6. 删除学生本身
        db.session.delete(student)
        
        # 提交所有删除操作
        db.session.commit()
        print(f'成功删除学生 {student_name} (ID: {student_id}) 及其所有相关数据')
    
    except Exception as e:
        db.session.rollback()
        import traceback
        error_msg = f'删除学生失败: {str(e)}\n{traceback.format_exc()}'
        print(error_msg)
        return jsonify({'error': f'删除学生失败: {str(e)}'}), 500
    
    # 7. 重新计算受影响老师的课时（删除排课记录后，需要更新老师课时统计）
    for teacher_id, course_id, month in affected_teacher_courses:
        try:
            update_teacher_hours(teacher_id, month=month, course_id=course_id)
        except Exception as e:
            # 如果更新老师课时失败，记录错误但不影响学生删除
            from flask import current_app
            current_app.logger.warning(f'更新老师课时失败 (teacher_id={teacher_id}, course_id={course_id}, month={month}): {e}')
    
    # 8. 重新计算受影响月份的财务记录（删除学生后，需要更新财务统计）
    # 确保所有受影响的月份都被重新计算（包括排课记录、缴费记录、课时统计的月份）
    from services.finance_service import update_finance_record
    from utils import get_current_month
    current_month = get_current_month()
    
    # 添加当前月份（如果还没有包含），确保当前月份也被重新计算
    if current_month:
        affected_months.add(current_month)
    
    # 重新计算所有受影响的月份
    for month in affected_months:
        try:
            update_finance_record(month)
            print(f'已重新计算财务记录（月份: {month}）')
        except Exception as e:
            from flask import current_app
            current_app.logger.warning(f'更新财务记录失败 (month={month}): {e}')
            print(f'重新计算财务记录失败（月份: {month}）: {e}')
    
    log_operation('students', 'delete', 'Student', student_id, student_name)
    return jsonify({
        'message': f'删除成功！已删除学生及其所有相关数据（排课记录、课时统计、缴费记录等），并已重新计算财务记录'
    })






@bp.route('/api/students/<int:student_id>/remaining-hours', methods=['GET'])
@login_required
def get_student_remaining_hours(student_id):

    """获取学生的剩余课时（按课程）"""

    month = request.args.get('month', get_current_month())

    course_id = request.args.get('course_id')  # 可选：指定课程

    

    if course_id:

        # 返回指定课程的剩余课时

        stats = ClassHoursStats.query.filter_by(

            student_id=student_id,

            course_id=course_id,

            month=month

        ).first()

        

        if stats:

            return jsonify({

                'student_id': student_id,

                'student_name': stats.student_name,

                'course_id': course_id,

                'course_name': stats.course_name,

                'month': month,

                'remaining_hours': stats.remaining_hours

            })

        else:

            student = Student.query.get(student_id)

            course = Course.query.get(course_id)

            return jsonify({

                'student_id': student_id,

                'student_name': student.name if student else '',

                'course_id': course_id,

                'course_name': course.name if course else '',

                'month': month,

                'remaining_hours': 0

            })

    else:

        # 返回所有课程的剩余课时

        stats_list = ClassHoursStats.query.filter_by(

            student_id=student_id,

            month=month

        ).all()

        

        result = []

        for stats in stats_list:

            result.append({

                'student_id': student_id,

                'student_name': stats.student_name,

                'course_id': stats.course_id,

                'course_name': stats.course_name,

                'month': month,

                'remaining_hours': stats.remaining_hours

            })

        

        return jsonify(result)






@bp.route('/api/students/<int:student_id>/photo', methods=['GET'])
@login_required
def get_student_photo(student_id):

    """获取学生照片"""

    student = Student.query.get_or_404(student_id)

    if student.photo_path and os.path.exists(student.photo_path):

        return send_from_directory(

            os.path.dirname(student.photo_path),

            os.path.basename(student.photo_path)

        )

    return jsonify({'error': '照片不存在'}), 404




@bp.route('/api/students/<int:student_id>/paid-courses', methods=['GET'])
@login_required
def get_student_paid_courses(student_id):

    """获取学生的已缴费课程和科目"""

    student = Student.query.get_or_404(student_id)

    

    # 获取已缴费记录（type='缴费'）

    payments = Payment.query.filter_by(

        student_id=student_id,

        type='缴费'

    ).all()

    

    # 收集已缴费的课程ID和科目

    paid_courses = {}  # {course_id: course_info}

    paid_subjects = set()  # 科目集合

    

    for payment in payments:

        if payment.course_id:

            course = Course.query.get(payment.course_id)

            if course and course.status == '启用':

                paid_courses[payment.course_id] = {

                    'id': course.id,

                    'name': course.name,

                    'subject': course.subject

                }

                paid_subjects.add(course.subject)

        # 如果缴费记录中有课程名称，尝试匹配课程

        if payment.course_name:

            course = Course.query.filter_by(name=payment.course_name, status='启用').first()

            if course:

                paid_courses[course.id] = {

                    'id': course.id,

                    'name': course.name,

                    'subject': course.subject

                }

                paid_subjects.add(course.subject)

    

    # 转换为列表并排序

    courses_list = list(paid_courses.values())

    courses_list.sort(key=lambda x: (x['subject'], x['name']))

    

    subjects_list = sorted(list(paid_subjects))

    

    return jsonify({

        'student_id': student_id,

        'student_name': student.name,

        'courses': courses_list,

        'subjects': subjects_list

    })


@bp.route('/api/students/paid-courses-need-scheduling', methods=['GET'])
@login_required
@limiter.limit("200 per minute")  # 允许更频繁的请求，因为页面会自动刷新
def get_paid_courses_need_scheduling():
    """获取所有已缴费但需要排课的学生课程列表"""
    try:
        from datetime import date
        from services.finance_service import calculate_remaining_hours_from_payments
        
        # 获取所有有缴费记录的学生和课程组合（过滤已删除的学生）
        from models import Student
        payments = Payment.query.join(Student, Payment.student_id == Student.id).filter(Payment.type == '缴费').all()
        
        # 收集学生-课程组合及其缴费信息
        student_course_map = {}  # {(student_id, course_id): {student_name, course_name, subject, total_paid_hours}}
        
        for payment in payments:
            if not payment.course_id:
                continue
            
            course = Course.query.get(payment.course_id)
            if not course or course.status != '启用':
                continue
            
            student = Student.query.get(payment.student_id)
            if not student:
                continue
            
            key = (payment.student_id, payment.course_id)
            if key not in student_course_map:
                student_course_map[key] = {
                    'student_id': payment.student_id,
                    'student_name': student.name,
                    'grade': student.grade or '',
                    'course_id': payment.course_id,
                    'course_name': course.name,
                    'subject': course.subject,
                    'total_paid_hours': 0
                }
            
            # 累计缴费课时
            student_course_map[key]['total_paid_hours'] += payment.class_count
        
        # 如果没有任何缴费记录，直接返回空列表
        if not student_course_map:
            return jsonify({
                'courses': [],
                'total': 0
            })
        
        # 计算每个学生-课程组合的剩余课时和已消耗课时
        result_list = []
        for key, info in student_course_map.items():
            student_id, course_id = key
            
            # 再次验证：检查该学生-课程组合是否还有有效的缴费记录
            # 如果所有缴费记录都被删除了，不应该显示在列表中
            remaining_payments = Payment.query.join(Student, Payment.student_id == Student.id).filter(
                Payment.student_id == student_id,
                Payment.course_id == course_id
            ).all()
            
            # 如果没有缴费记录，跳过该学生-课程组合
            if not remaining_payments:
                continue
            
            # 计算总缴费课时（包括退费）
            total_paid_hours = calculate_remaining_hours_from_payments(student_id, course_id)
            
            # 如果总缴费课时 <= 0，跳过该学生-课程组合
            if total_paid_hours <= 0:
                continue
            
            # 计算已消耗课时（已确认的排课）
            consumed_courses = StudentCourse.query.filter(
                StudentCourse.student_id == student_id,
                StudentCourse.course_id == course_id,
                StudentCourse.status != '删除',
                StudentCourse.is_confirmed == True
            ).all()
            
            consumed_hours = 0
            for course_record in consumed_courses:
                if course_record.status == '正常':
                    consumed_hours += 1
                elif course_record.status == '请假':
                    consumed_hours -= 1  # 请假不消耗课时
                elif course_record.status == '跑空':
                    consumed_hours += 0.5
            
            # 计算剩余课时
            remaining_hours = total_paid_hours - consumed_hours
            
            # 只返回剩余课时大于0的（需要排课的）
            if remaining_hours > 0:
                # 获取学生信息（包括标记状态）
                student = Student.query.get(student_id)
                
                # 获取学生-课程的默认排课设置
                default_schedule = StudentCourseDefaultSchedule.query.filter_by(
                    student_id=student_id,
                    course_id=course_id
                ).first()
                
                result_list.append({
                    'student_id': info['student_id'],
                    'student_name': info['student_name'],
                    'grade': info['grade'],
                    'course_id': info['course_id'],
                    'course_name': info['course_name'],
                    'subject': info['subject'],
                    'total_paid_hours': total_paid_hours,
                    'consumed_hours': consumed_hours,
                    'remaining_hours': remaining_hours,
                    'default_time_slot': default_schedule.default_time_slot if default_schedule else '',
                    'default_weekday': default_schedule.default_weekday if default_schedule else '',
                    'excluded_from_scheduling': student.excluded_from_scheduling if student else False
                })
        
        # 按学生姓名和科目排序
        result_list.sort(key=lambda x: (x['student_name'], x['subject'], x['course_name']))
        
        return jsonify({
            'courses': result_list,
            'total': len(result_list)
        })
    except Exception as e:
        import traceback
        error_msg = f"获取需要排课的学生课程列表失败: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({'error': error_msg}), 500


@bp.route('/api/students/<int:student_id>/courses/<int:course_id>/default-schedule', methods=['GET', 'PUT'])
@login_required
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
def student_course_default_schedule(student_id, course_id):
    """获取或更新学生-课程的默认上课时间和星期"""
    student = Student.query.get_or_404(student_id)
    course = Course.query.get_or_404(course_id)
    
    if request.method == 'GET':
        # 查找或创建默认设置记录
        default_schedule = StudentCourseDefaultSchedule.query.filter_by(
            student_id=student_id,
            course_id=course_id
        ).first()
        
        return jsonify({
            'student_id': student.id,
            'student_name': student.name,
            'course_id': course.id,
            'course_name': course.name,
            'default_time_slot': default_schedule.default_time_slot if default_schedule else '',
            'default_weekday': default_schedule.default_weekday if default_schedule else ''
        })
    
    elif request.method == 'PUT':
        data = request.get_json()
        default_time_slot = data.get('default_time_slot', '')
        default_weekday = data.get('default_weekday', '')
        
        # 查找或创建默认设置记录
        default_schedule = StudentCourseDefaultSchedule.query.filter_by(
            student_id=student_id,
            course_id=course_id
        ).first()
        
        if default_schedule:
            # 更新现有记录
            default_schedule.default_time_slot = default_time_slot
            default_schedule.default_weekday = default_weekday
            default_schedule.updated_at = datetime.now()
        else:
            # 创建新记录
            default_schedule = StudentCourseDefaultSchedule(
                student_id=student_id,
                course_id=course_id,
                default_time_slot=default_time_slot,
                default_weekday=default_weekday
            )
            db.session.add(default_schedule)
        
        try:
            db.session.commit()
            log_operation('students', 'update', 'StudentCourseDefaultSchedule', default_schedule.id, f'{student.name}-{course.name}')
            return jsonify({
                'message': '更新成功',
                'student_id': student.id,
                'course_id': course.id,
                'default_time_slot': default_time_slot,
                'default_weekday': default_weekday
            })
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': f'更新失败: {str(e)}'}), 500


@bp.route('/api/students/<int:student_id>/exclude-from-scheduling', methods=['PUT'])
@login_required
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
def update_student_exclude_from_scheduling(student_id):
    """更新学生是否排除在排课下拉列表中的标记"""
    try:
        student = Student.query.get_or_404(student_id)
        data = request.get_json()
        excluded = data.get('excluded_from_scheduling', False)
        
        student.excluded_from_scheduling = bool(excluded)
        db.session.commit()
        
        log_operation('students', 'update', 'Student', student.id, student.name, 
                     {'excluded_from_scheduling': not excluded}, 
                     {'excluded_from_scheduling': excluded})
        
        return jsonify({
            'message': '更新成功',
            'student_id': student.id,
            'student_name': student.name,
            'excluded_from_scheduling': student.excluded_from_scheduling
        })
    except Exception as e:
        db.session.rollback()
        import traceback
        error_msg = f"更新学生标记状态失败: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({'error': error_msg}), 500






