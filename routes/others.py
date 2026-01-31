"""
Others路由模块
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
from sqlalchemy import func, extract, or_
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

bp = Blueprint('others', __name__)

@bp.route('/api/all_courses', methods=['GET'])
def get_all_courses():

    """获取所有排课（支持分页和筛选）"""

    try:

        # 获取分页参数

        page = request.args.get('page', 1, type=int)

        per_page = request.args.get('per_page', 20, type=int)

        

        # 获取筛选参数

        filter_search = request.args.get('search', '').strip()  # 搜索框：学生、老师、科目、年级

        filter_student_name = request.args.get('student_name')

        filter_teacher = request.args.get('teacher')

        filter_classroom = request.args.get('classroom')

        filter_subject = request.args.get('subject')

        filter_grade = request.args.get('grade')

        filter_date_start = request.args.get('date_start')

        filter_date_end = request.args.get('date_end')

        filter_status = request.args.get('status')
        
        # 确认状态：'' 全部 | 'true' 已确认 | 'false' 未确认
        filter_is_confirmed = request.args.get('is_confirmed', '')
        
        # 获取排序参数（升序asc或降序desc，默认为desc）
        order_by = request.args.get('order_by', 'desc').lower()
        if order_by not in ['asc', 'desc']:
            order_by = 'desc'  # 默认降序

        

        # 构建基础查询（只查询存在学生的排课记录，过滤已删除的学生）
        from models import Student
        query = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).options(

            joinedload(StudentCourse.course)

        ).filter(

            StudentCourse.status != '删除'

        )

        

        # 应用筛选条件

        if filter_search:
            # 搜索框：匹配学生、老师、科目、年级任一
            search_like = f'%{filter_search}%'
            query = query.filter(
                or_(
                    StudentCourse.student_name.like(search_like),
                    StudentCourse.teacher_name.like(search_like),
                    StudentCourse.subject.like(search_like),
                    (StudentCourse.grade.is_(None) == False) & (StudentCourse.grade.like(search_like)),
                )
            )
        else:
            if filter_student_name:
                query = query.filter(StudentCourse.student_name.like(f'%{filter_student_name}%'))
            if filter_teacher:
                query = query.filter(StudentCourse.teacher_name == filter_teacher)
            if filter_classroom:
                query = query.filter(StudentCourse.classroom == filter_classroom)
            if filter_subject:
                query = query.filter(StudentCourse.subject == filter_subject)
            if filter_grade:
                query = query.filter(StudentCourse.grade == filter_grade)

        # 处理日期筛选
        start_date = None
        end_date = None
        
        if filter_date_start:
            try:
                start_date = datetime.strptime(filter_date_start, '%Y-%m-%d').date()
            except ValueError:
                pass

        if filter_date_end:
            try:
                end_date = datetime.strptime(filter_date_end, '%Y-%m-%d').date()
            except ValueError:
                pass
        
        # 应用日期筛选条件
        if start_date and end_date:
            # 如果开始日期大于结束日期，自动交换（用户可能选反了）
            if start_date > end_date:
                start_date, end_date = end_date, start_date
            query = query.filter(StudentCourse.course_date >= start_date, StudentCourse.course_date <= end_date)
        elif start_date:
            query = query.filter(StudentCourse.course_date >= start_date)
        elif end_date:
            query = query.filter(StudentCourse.course_date <= end_date)

        if filter_status:
            query = query.filter(StudentCourse.status == filter_status)

        if filter_is_confirmed == 'true':
            query = query.filter(StudentCourse.is_confirmed == True)
        elif filter_is_confirmed == 'false':
            query = query.filter(StudentCourse.is_confirmed == False)

        # 按日期和时段排序（支持升序/降序）
        if order_by == 'asc':
            query = query.order_by(StudentCourse.course_date.asc(), StudentCourse.time_slot)
        else:
            query = query.order_by(StudentCourse.course_date.desc(), StudentCourse.time_slot)

        

        # 获取总数
        total = query.count()
        print(f"[DEBUG] all_courses API: 查询总数 = {total}, 页码 = {page}, 每页 = {per_page}")

        # 分页查询
        pagination = query.paginate(page=page, per_page=per_page, error_out=False)
        courses = pagination.items
        print(f"[DEBUG] all_courses API: 返回课程数量 = {len(courses)}")

        # 转换为字典
        courses_dict = [c.to_dict() for c in courses]
        print(f"[DEBUG] all_courses API: 转换后的数据示例（前3条）: {courses_dict[:3] if courses_dict else '无数据'}")

        return jsonify({
            'courses': courses_dict,
            'total': total,
            'page': page,
            'per_page': per_page,
            'pages': pagination.pages
        })

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[ERROR] all_courses API 错误: {str(e)}")
        print(f"[ERROR] 错误堆栈: {error_trace}")
        return jsonify({'error': str(e)}), 500


@bp.route('/api/cleanup/orphaned-courses', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('admin')
def cleanup_orphaned_courses():
    """清理孤立排课记录（学生已被删除但排课记录还在）"""
    try:
        from models import Student, StudentCourse
        
        # 获取所有存在的学生ID
        existing_student_ids = set(s.id for s in Student.query.all())
        
        # 查找孤立排课记录（student_id不在现有学生列表中）
        orphaned_courses = StudentCourse.query.filter(
            ~StudentCourse.student_id.in_(existing_student_ids) if existing_student_ids else False
        ).all()
        
        if not existing_student_ids:
            # 如果没有学生，查找所有排课记录
            orphaned_courses = StudentCourse.query.all()
        
        orphaned_count = len(orphaned_courses)
        
        if orphaned_count > 0:
            # 收集受影响的信息
            affected_teacher_courses = set()
            for sc in orphaned_courses:
                if sc.teacher_id and sc.course_id and sc.course_date:
                    month = sc.course_date.strftime('%Y-%m')
                    affected_teacher_courses.add((sc.teacher_id, sc.course_id, month))
                db.session.delete(sc)
            
            db.session.commit()
            
            # 重新计算受影响老师的课时
            from services import update_teacher_hours
            for teacher_id, course_id, month in affected_teacher_courses:
                try:
                    update_teacher_hours(teacher_id, month=month, course_id=course_id)
                except Exception as e:
                    from flask import current_app
                    current_app.logger.warning(f'更新老师课时失败 (teacher_id={teacher_id}, course_id={course_id}, month={month}): {e}')
            
            return jsonify({
                'message': f'成功清理 {orphaned_count} 条孤立排课记录',
                'cleaned_count': orphaned_count
            }), 200
        else:
            return jsonify({
                'message': '没有发现孤立排课记录',
                'cleaned_count': 0
            }), 200
    
    except Exception as e:
        db.session.rollback()
        import traceback
        error_msg = f'清理孤立记录失败: {str(e)}\n{traceback.format_exc()}'
        print(error_msg)
        return jsonify({'error': f'清理失败: {str(e)}'}), 500



@bp.route('/api/time-slots', methods=['GET'])
# @limiter.limit("200 per minute")  # 限流已禁用
@login_required
def get_time_slots():
    """获取所有时段"""
    try:
        status = request.args.get('status', '')

        query = TimeSlot.query

        if status:
            query = query.filter_by(status=status)

        slots = query.order_by(TimeSlot.sort_order).all()

        # 确保所有时段都能正确序列化
        result = []
        for slot in slots:
            try:
                result.append(slot.to_dict())
            except Exception as slot_error:
                # 如果单个时段序列化失败，记录错误但继续处理其他时段
                print(f"时段 {slot.id} 序列化失败: {str(slot_error)}")
                continue

        return jsonify(result), 200

    except Exception as e:
        print(f"获取时段列表失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': '获取时段列表失败，请稍后重试'}), 500






@bp.route('/api/time-slots', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def create_time_slot():

    """创建时段"""

    data = request.json

    slot = TimeSlot(

        name=data['name'],

        start_time=data['start_time'],

        end_time=data['end_time'],

        status=data.get('status', '启用'),

        sort_order=data.get('sort_order', 0)

    )

    db.session.add(slot)

    db.session.commit()

    return jsonify(slot.to_dict()), 201






@bp.route('/api/time-slots/<int:slot_id>', methods=['PUT'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def update_time_slot(slot_id):

    """更新时段"""

    slot = TimeSlot.query.get_or_404(slot_id)

    data = request.json

    slot.name = data.get('name', slot.name)

    slot.start_time = data.get('start_time', slot.start_time)

    slot.end_time = data.get('end_time', slot.end_time)

    slot.status = data.get('status', slot.status)

    slot.sort_order = data.get('sort_order', slot.sort_order)

    db.session.commit()

    return jsonify(slot.to_dict())






@bp.route('/api/time-slots/<int:slot_id>', methods=['DELETE'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def delete_time_slot(slot_id):

    """删除时段"""

    slot = TimeSlot.query.get_or_404(slot_id)

    db.session.delete(slot)

    db.session.commit()

    return jsonify({'message': '删除成功'})






@bp.route('/api/classrooms', methods=['GET'])
def get_classrooms():

    """获取所有教室"""

    status = request.args.get('status', '')

    query = Classroom.query

    if status:

        query = query.filter_by(status=status)

    rooms = query.order_by(Classroom.sort_order).all()

    return jsonify([r.to_dict() for r in rooms])






@bp.route('/api/classrooms', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def create_classroom():

    """创建教室"""

    data = request.json

    room = Classroom(

        name=data['name'],

        status=data.get('status', '启用'),

        sort_order=data.get('sort_order', 0)

    )

    db.session.add(room)

    db.session.commit()

    return jsonify(room.to_dict()), 201






@bp.route('/api/classrooms/<int:room_id>', methods=['PUT'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def update_classroom(room_id):

    """更新教室"""

    room = Classroom.query.get_or_404(room_id)

    data = request.json

    room.name = data.get('name', room.name)

    room.status = data.get('status', room.status)

    room.sort_order = data.get('sort_order', room.sort_order)

    db.session.commit()

    return jsonify(room.to_dict())






@bp.route('/api/classrooms/<int:room_id>', methods=['DELETE'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def delete_classroom(room_id):

    """删除教室"""

    room = Classroom.query.get_or_404(room_id)

    db.session.delete(room)

    db.session.commit()

    return jsonify({'message': '删除成功'})






@bp.route('/api/teacher-course-costs', methods=['GET'])
def get_teacher_course_costs():

    """获取所有教师课程成本"""

    costs = TeacherCourseCost.query.order_by(

        TeacherCourseCost.teacher_id.asc(),

        TeacherCourseCost.course_id.asc()

    ).all()

    return jsonify([c.to_dict() for c in costs])






@bp.route('/api/teacher-course-costs', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def create_teacher_course_cost():

    """创建教师课程成本"""

    data = request.json

    

    # 检查是否已存在相同的教师-课程组合

    existing = TeacherCourseCost.query.filter_by(

        teacher_id=data['teacher_id'],

        course_id=data['course_id']

    ).first()

    

    if existing:

        return jsonify({'error': '该教师和课程的组合已存在，请先删除或编辑现有记录'}), 400

    

    cost = TeacherCourseCost(

        teacher_id=data['teacher_id'],

        teacher_name=data['teacher_name'],

        course_id=data['course_id'],

        course_name=data['course_name'],

        cost_per_class=float(data['cost_per_class'])

    )

    db.session.add(cost)

    db.session.flush()  # 先flush，让cost获得id

    

    # 记录操作历史

    history = TeacherCourseCostHistory(

        cost_id=cost.id,

        teacher_id=cost.teacher_id,

        teacher_name=cost.teacher_name,

        course_id=cost.course_id,

        course_name=cost.course_name,

        cost_per_class=cost.cost_per_class,

        operation='创建'

    )

    db.session.add(history)

    db.session.commit()

    return jsonify(cost.to_dict()), 201






@bp.route('/api/teacher-course-costs/<int:cost_id>', methods=['PUT'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def update_teacher_course_cost(cost_id):

    """更新教师课程成本"""

    cost = TeacherCourseCost.query.get_or_404(cost_id)

    data = request.json

    

    # 如果修改了教师或课程，检查是否与其他记录冲突

    new_teacher_id = data.get('teacher_id', cost.teacher_id)

    new_course_id = data.get('course_id', cost.course_id)

    

    # 检查是否与其他记录冲突（排除当前记录）

    if new_teacher_id != cost.teacher_id or new_course_id != cost.course_id:

        existing = TeacherCourseCost.query.filter(

            TeacherCourseCost.teacher_id == new_teacher_id,

            TeacherCourseCost.course_id == new_course_id,

            TeacherCourseCost.id != cost_id

        ).first()

        

        if existing:

            return jsonify({'error': '该教师和课程的组合已存在'}), 400

    

    # 保存旧值用于历史记录

    old_cost_per_class = cost.cost_per_class

    

    cost.teacher_id = new_teacher_id

    cost.teacher_name = data.get('teacher_name', cost.teacher_name)

    cost.course_id = new_course_id

    cost.course_name = data.get('course_name', cost.course_name)

    cost.cost_per_class = float(data.get('cost_per_class', cost.cost_per_class))

    cost.updated_at = datetime.now()

    

    # 记录操作历史（包含旧值和新值）

    history = TeacherCourseCostHistory(

        cost_id=cost.id,

        teacher_id=cost.teacher_id,

        teacher_name=cost.teacher_name,

        course_id=cost.course_id,

        course_name=cost.course_name,

        cost_per_class=cost.cost_per_class,

        old_cost_per_class=old_cost_per_class,

        operation='更新'

    )

    db.session.add(history)

    db.session.commit()

    return jsonify(cost.to_dict())






@bp.route('/api/teacher-course-costs/<int:cost_id>', methods=['DELETE'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def delete_teacher_course_cost(cost_id):

    """删除教师课程成本"""

    cost = TeacherCourseCost.query.get_or_404(cost_id)

    

    # 保存要删除的记录信息

    cost_data = {

        'teacher_id': cost.teacher_id,

        'teacher_name': cost.teacher_name,

        'course_id': cost.course_id,

        'course_name': cost.course_name,

        'cost_per_class': cost.cost_per_class,

        'start_date': cost.start_date,

        'end_date': cost.end_date

    }

    

    # 记录操作历史

    # 使用实际的 cost_id，即使删除后记录不存在，历史记录中保留 cost_id 也是可以接受的

    history = TeacherCourseCostHistory(

        cost_id=cost_id,

        teacher_id=cost_data['teacher_id'],

        teacher_name=cost_data['teacher_name'],

        course_id=cost_data['course_id'],

        course_name=cost_data['course_name'],

        cost_per_class=cost_data['cost_per_class'],

        start_date=cost_data['start_date'],

        end_date=cost_data['end_date'],

        operation='删除'

    )

    db.session.add(history)

    db.session.commit()  # 先提交历史记录

    

    # 使用原始 SQL 删除记录，避免 SQLAlchemy 尝试更新关联的历史记录

    from sqlalchemy import text

    try:

        with db.engine.begin() as conn:

            conn.execute(

                text('DELETE FROM teacher_course_costs WHERE id = :cost_id'),

                {'cost_id': cost_id}

            )

    except Exception as e:

        return jsonify({'error': f'删除失败: {str(e)}'}), 500

    

    return jsonify({'message': '删除成功'})






@bp.route('/api/teacher-course-costs/<int:cost_id>/history', methods=['GET'])
def get_teacher_course_cost_history(cost_id):

    """获取教师课程成本的操作历史"""

    histories = TeacherCourseCostHistory.query.filter_by(cost_id=cost_id).order_by(

        TeacherCourseCostHistory.created_at.desc()

    ).all()

    return jsonify([h.to_dict() for h in histories])






@bp.route('/api/teacher-experience-costs', methods=['GET'])
def get_teacher_experience_costs():

    """获取所有教师经验成本"""

    # 支持按教师、课程、学生筛选

    teacher_id = request.args.get('teacher_id', type=int)

    course_id = request.args.get('course_id', type=int)

    student_id = request.args.get('student_id', type=int)

    

    query = TeacherExperienceCost.query

    

    if teacher_id:

        query = query.filter_by(teacher_id=teacher_id)

    if course_id:

        query = query.filter_by(course_id=course_id)

    if student_id:

        query = query.filter_by(student_id=student_id)

    elif student_id is not None and student_id == 0:

        # student_id=0 表示查询所有学生的记录（student_id为None）

        query = query.filter_by(student_id=None)

    

    costs = query.order_by(

        TeacherExperienceCost.teacher_id.asc(),

        TeacherExperienceCost.course_id.asc()

    ).all()

    return jsonify([c.to_dict() for c in costs])






@bp.route('/api/teacher-experience-costs', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def create_teacher_experience_cost():

    """创建教师经验成本"""

    try:

        if not request.json:

            return jsonify({'error': '请求数据格式错误'}), 400

        

        data = request.json

        

        teacher_id = data.get('teacher_id')

        course_id = data.get('course_id')

        student_id = data.get('student_id')  # 可选

        

        if not teacher_id or not course_id:

            return jsonify({'error': '教师ID和课程ID不能为空'}), 400

        

        # 解析时间段（年月格式：YYYY-MM）

        start_date = None

        end_date = None

        if data.get('start_date'):

            try:

                # 解析年月格式（YYYY-MM），转换为该月的第一天

                year_month = datetime.strptime(data['start_date'], '%Y-%m')

                start_date = year_month.date().replace(day=1)

            except ValueError:

                return jsonify({'error': '开始年月格式错误，应为 YYYY-MM 格式'}), 400

        if data.get('end_date'):

            try:

                # 解析年月格式（YYYY-MM），转换为该月的最后一天

                year_month = datetime.strptime(data['end_date'], '%Y-%m')

                # 获取该月的最后一天

                if year_month.month == 12:

                    last_day = year_month.replace(year=year_month.year + 1, month=1, day=1) - timedelta(days=1)

                else:

                    last_day = year_month.replace(month=year_month.month + 1, day=1) - timedelta(days=1)

                end_date = last_day.date()

            except ValueError:

                return jsonify({'error': '结束年月格式错误，应为 YYYY-MM 格式'}), 400

        

        # 验证时间段逻辑

        if start_date and end_date and start_date > end_date:

            return jsonify({'error': '开始年月不能晚于结束年月'}), 400

        

        # 检查时间段是否重合

        # 查找同一教师-课程-学生组合的所有记录

        query = TeacherExperienceCost.query.filter_by(

            teacher_id=teacher_id,

            course_id=course_id

        )

        

        if student_id:

            query = query.filter_by(student_id=student_id)

        else:

            query = query.filter_by(student_id=None)

        

        existing_records = query.all()

        

        # 检查时间段是否重合

        for existing in existing_records:

            existing_start = existing.start_date

            existing_end = existing.end_date

            

            # 判断时间段是否重合

            # 时间段重合的条件：

            # 1. 新记录的开始日期在现有记录的时间段内

            # 2. 新记录的结束日期在现有记录的时间段内

            # 3. 新记录包含现有记录的时间段

            # 4. 现有记录包含新记录的时间段

            

            # 如果现有记录没有时间段（永久有效）

            if not existing_start and not existing_end:

                return jsonify({'error': '已存在永久有效的记录，时间段不能重合'}), 400

            

            # 如果新记录没有时间段（永久有效）

            if not start_date and not end_date:

                return jsonify({'error': '已存在其他记录，不能设置永久有效'}), 400

            

            # 检查时间段是否重合（按年月比较）

            overlap = False

            

            # 提取年月部分进行比较（YYYY-MM格式）

            existing_start_month = existing_start.strftime('%Y-%m') if existing_start else None

            existing_end_month = existing_end.strftime('%Y-%m') if existing_end else None

            start_month = start_date.strftime('%Y-%m') if start_date else None

            end_month = end_date.strftime('%Y-%m') if end_date else None

            

            if existing_start_month and existing_end_month:

                # 现有记录有明确的时间段

                if end_month and start_month:

                    # 新记录也有明确的时间段

                    # 重合条件：新记录的开始年月 <= 现有记录的结束年月 且 新记录的结束年月 >= 现有记录的开始年月

                    if start_month <= existing_end_month and end_month >= existing_start_month:

                        overlap = True

                elif start_month:

                    # 新记录只有开始年月（从某月起永久有效）

                    if start_month <= existing_end_month:

                        overlap = True

                elif end_month:

                    # 新记录只有结束年月（到某月止）

                    if end_month >= existing_start_month:

                        overlap = True

            elif existing_start_month:

                # 现有记录只有开始年月（从某月起永久有效）

                if end_month and start_month:

                    if start_month <= existing_start_month or end_month >= existing_start_month:

                        overlap = True

                elif start_month:

                    if start_month <= existing_start_month:

                        overlap = True

                elif end_month:

                    if end_month >= existing_start_month:

                        overlap = True

            elif existing_end_month:

                # 现有记录只有结束年月（到某月止）

                if end_month and start_month:

                    if start_month <= existing_end_month:

                        overlap = True

                elif start_month:

                    if start_month <= existing_end_month:

                        overlap = True

                elif end_month:

                    if end_month >= existing_end_month:

                        overlap = True

            

            if overlap:

                existing_range = ''

                if existing_start_month and existing_end_month:

                    existing_range = f'{existing_start_month} 至 {existing_end_month}'

                elif existing_start_month:

                    existing_range = f'{existing_start_month} 起'

                elif existing_end_month:

                    existing_range = f'至 {existing_end_month}'

                else:

                    existing_range = '永久有效'

                

                return jsonify({'error': f'时间段与现有记录重合（现有记录时间段：{existing_range}），请调整时间段'}), 400

        

        cost = TeacherExperienceCost(

            teacher_id=teacher_id,

            teacher_name=data.get('teacher_name', ''),

            course_id=course_id,

            course_name=data.get('course_name', ''),

            student_id=student_id,

            student_name=data.get('student_name'),

            experience_cost=float(data.get('experience_cost', 0)),

            start_date=start_date,

            end_date=end_date

        )

        db.session.add(cost)

        db.session.flush()  # 先flush，让cost获得id

        

        # 记录操作历史

        history = TeacherExperienceCostHistory(

            cost_id=cost.id,

            teacher_id=cost.teacher_id,

            teacher_name=cost.teacher_name,

            course_id=cost.course_id,

            course_name=cost.course_name,

            student_id=cost.student_id,

            student_name=cost.student_name,

            experience_cost=cost.experience_cost,

            start_date=cost.start_date,

            end_date=cost.end_date,

            operation='创建'

        )

        db.session.add(history)

        db.session.commit()

        return jsonify(cost.to_dict()), 201

    except Exception as e:

        import traceback

        traceback.print_exc()

        db.session.rollback()

        return jsonify({'error': f'创建失败: {str(e)}'}), 500






@bp.route('/api/teacher-experience-costs/<int:cost_id>', methods=['PUT'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def update_teacher_experience_cost(cost_id):

    """更新教师经验成本"""

    try:

        if not request.json:

            return jsonify({'error': '请求数据格式错误'}), 400

        

        cost = TeacherExperienceCost.query.get_or_404(cost_id)

        data = request.json

        

        # 如果修改了教师、课程或学生，检查是否与其他记录冲突

        new_teacher_id = data.get('teacher_id', cost.teacher_id)

        new_course_id = data.get('course_id', cost.course_id)

        new_student_id = data.get('student_id', cost.student_id)

        

        # 解析时间段（年月格式：YYYY-MM）

        new_start_date = None

        new_end_date = None

        if data.get('start_date'):

            try:

                # 解析年月格式（YYYY-MM），转换为该月的第一天

                year_month = datetime.strptime(data['start_date'], '%Y-%m')

                new_start_date = year_month.date().replace(day=1)

            except ValueError:

                return jsonify({'error': '开始年月格式错误，应为 YYYY-MM 格式'}), 400

        elif 'start_date' in data and (data['start_date'] is None or data['start_date'] == ''):

            new_start_date = None

        else:

            new_start_date = cost.start_date

        

        if data.get('end_date'):

            try:

                # 解析年月格式（YYYY-MM），转换为该月的最后一天

                year_month = datetime.strptime(data['end_date'], '%Y-%m')

                # 获取该月的最后一天

                if year_month.month == 12:

                    last_day = year_month.replace(year=year_month.year + 1, month=1, day=1) - timedelta(days=1)

                else:

                    last_day = year_month.replace(month=year_month.month + 1, day=1) - timedelta(days=1)

                new_end_date = last_day.date()

            except ValueError:

                return jsonify({'error': '结束年月格式错误，应为 YYYY-MM 格式'}), 400

        elif 'end_date' in data and (data['end_date'] is None or data['end_date'] == ''):

            new_end_date = None

        else:

            new_end_date = cost.end_date

        

        # 验证时间段逻辑

        if new_start_date and new_end_date and new_start_date > new_end_date:

            return jsonify({'error': '开始年月不能晚于结束年月'}), 400

        

        # 检查时间段是否重合（排除当前记录）

        # 如果修改了教师、课程或学生，或者时间段发生了变化，需要检查重合

        if (new_teacher_id != cost.teacher_id or 

            new_course_id != cost.course_id or 

            new_student_id != cost.student_id or

            new_start_date != cost.start_date or

            new_end_date != cost.end_date):

            

            query = TeacherExperienceCost.query.filter(

                TeacherExperienceCost.teacher_id == new_teacher_id,

                TeacherExperienceCost.course_id == new_course_id,

                TeacherExperienceCost.id != cost_id

            )

            

            if new_student_id:

                query = query.filter_by(student_id=new_student_id)

            else:

                query = query.filter_by(student_id=None)

            

            existing_records = query.all()

            

            # 检查时间段是否重合

            for existing in existing_records:

                existing_start = existing.start_date

                existing_end = existing.end_date

                

                # 如果现有记录没有时间段（永久有效）

                if not existing_start and not existing_end:

                    return jsonify({'error': '已存在永久有效的记录，时间段不能重合'}), 400

                

                # 如果新记录没有时间段（永久有效）

                if not new_start_date and not new_end_date:

                    return jsonify({'error': '已存在其他记录，不能设置永久有效'}), 400

                

                # 检查时间段是否重合（按年月比较）

                overlap = False

                

                # 提取年月部分进行比较（YYYY-MM格式）

                existing_start_month = existing_start.strftime('%Y-%m') if existing_start else None

                existing_end_month = existing_end.strftime('%Y-%m') if existing_end else None

                new_start_month = new_start_date.strftime('%Y-%m') if new_start_date else None

                new_end_month = new_end_date.strftime('%Y-%m') if new_end_date else None

                

                if existing_start_month and existing_end_month:

                    if new_end_month and new_start_month:

                        if new_start_month <= existing_end_month and new_end_month >= existing_start_month:

                            overlap = True

                    elif new_start_month:

                        if new_start_month <= existing_end_month:

                            overlap = True

                    elif new_end_month:

                        if new_end_month >= existing_start_month:

                            overlap = True

                elif existing_start_month:

                    if new_end_month and new_start_month:

                        if new_start_month <= existing_start_month or new_end_month >= existing_start_month:

                            overlap = True

                    elif new_start_month:

                        if new_start_month <= existing_start_month:

                            overlap = True

                    elif new_end_month:

                        if new_end_month >= existing_start_month:

                            overlap = True

                elif existing_end_month:

                    if new_end_month and new_start_month:

                        if new_start_month <= existing_end_month:

                            overlap = True

                    elif new_start_month:

                        if new_start_month <= existing_end_month:

                            overlap = True

                    elif new_end_month:

                        if new_end_month >= existing_end_month:

                            overlap = True

                

                if overlap:

                    existing_range = ''

                    if existing_start_month and existing_end_month:

                        existing_range = f'{existing_start_month} 至 {existing_end_month}'

                    elif existing_start_month:

                        existing_range = f'{existing_start_month} 起'

                    elif existing_end_month:

                        existing_range = f'至 {existing_end_month}'

                    else:

                        existing_range = '永久有效'

                    

                    return jsonify({'error': f'时间段与现有记录重合（现有记录时间段：{existing_range}），请调整时间段'}), 400

        

        # 保存旧值用于历史记录

        old_experience_cost = cost.experience_cost

        old_start_date = cost.start_date

        old_end_date = cost.end_date

        

        cost.teacher_id = new_teacher_id

        cost.teacher_name = data.get('teacher_name', cost.teacher_name)

        cost.course_id = new_course_id

        cost.course_name = data.get('course_name', cost.course_name)

        cost.student_id = new_student_id

        cost.student_name = data.get('student_name', cost.student_name)

        cost.experience_cost = float(data.get('experience_cost', cost.experience_cost))

        cost.start_date = new_start_date

        cost.end_date = new_end_date

        cost.updated_at = datetime.now()

        

        # 记录操作历史（包含旧值和新值）

        history = TeacherExperienceCostHistory(

            cost_id=cost.id,

            teacher_id=cost.teacher_id,

            teacher_name=cost.teacher_name,

            course_id=cost.course_id,

            course_name=cost.course_name,

            student_id=cost.student_id,

            student_name=cost.student_name,

            experience_cost=cost.experience_cost,

            start_date=cost.start_date,

            end_date=cost.end_date,

            old_experience_cost=old_experience_cost,

            old_start_date=old_start_date,

            old_end_date=old_end_date,

            operation='更新'

        )

        db.session.add(history)

        db.session.commit()

        return jsonify(cost.to_dict())

    except Exception as e:

        import traceback

        traceback.print_exc()

        db.session.rollback()

        return jsonify({'error': f'更新失败: {str(e)}'}), 500






@bp.route('/api/teacher-experience-costs/<int:cost_id>', methods=['DELETE'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def delete_teacher_experience_cost(cost_id):

    """删除教师经验成本"""

    cost = TeacherExperienceCost.query.get_or_404(cost_id)

    

    # 记录操作历史

    history = TeacherExperienceCostHistory(

        cost_id=cost.id,

        teacher_id=cost.teacher_id,

        teacher_name=cost.teacher_name,

        course_id=cost.course_id,

        course_name=cost.course_name,

        student_id=cost.student_id,

        student_name=cost.student_name,

        experience_cost=cost.experience_cost,

        start_date=cost.start_date,

        end_date=cost.end_date,

        operation='删除'

    )

    db.session.add(history)

    db.session.delete(cost)

    db.session.commit()

    return jsonify({'message': '删除成功'})






@bp.route('/api/teacher-experience-costs/<int:cost_id>/history', methods=['GET'])
def get_teacher_experience_cost_history(cost_id):

    """获取教师经验成本的操作历史"""

    histories = TeacherExperienceCostHistory.query.filter_by(cost_id=cost_id).order_by(

        TeacherExperienceCostHistory.created_at.desc()

    ).all()

    return jsonify([h.to_dict() for h in histories])






