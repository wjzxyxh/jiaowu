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
    OperationLog, Notification, StudentCourseDefaultSchedule, MarketingLead
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
from sqlalchemy import func, extract, or_, and_
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


def get_valid_student_ids_for_management_page():
    """
    获取 /students 页面中有效的学生ID列表（与 get_students 中 trial_success_only=true 的逻辑一致）
    返回：有效学生ID的集合
    
    注意：这个方法直接模拟 get_students() 的查询逻辑，确保返回的学生ID与实际显示在 /students 页面的学生一致
    """
    try:
        from models import MarketingLead
        TRIAL_PLACEHOLDER_NAME = '【试课学员】'
        
        # 构建查询（排除营销模块试课占位学生）
        query = Student.query.filter(Student.name != TRIAL_PLACEHOLDER_NAME)
        
        # 模拟 get_students 中 trial_success_only=true 的逻辑
        # 来源1：至少有一条试课状态为「成功」且未删除的排课记录（已关联到该学生）
        student_ids_from_courses = db.session.query(StudentCourse.student_id).filter(
            StudentCourse.trial_status == '成功',
            StudentCourse.student_id.isnot(None),
            StudentCourse.status != '删除'
        ).distinct()
        ids_from_courses = [r[0] for r in student_ids_from_courses.all()]
        
        # 来源2：与已提交且试课状态为「成功」的营销线索姓名+年级一致的学生
        submitted_leads = MarketingLead.query.filter_by(lead_status='submitted', trial_status='成功').all()
        ids_from_leads = []
        for lead in submitted_leads:
            lead_grade_n = (lead.grade or '').strip() or None
            candidates = Student.query.filter(Student.name == lead.name).all()
            for s in candidates:
                if s.name == TRIAL_PLACEHOLDER_NAME:
                    continue
                s_grade_n = (s.grade or '').strip() or None
                if s_grade_n == lead_grade_n:
                    ids_from_leads.append(s.id)
                    break
        
        # 来源3：有试课状态为「成功」的排课对应的线索，按姓名+年级匹配学生
        lead_ids_with_success = db.session.query(StudentCourse.marketing_lead_id).filter(
            StudentCourse.trial_status == '成功',
            StudentCourse.marketing_lead_id.isnot(None),
            StudentCourse.status != '删除'
        ).distinct().all()
        ids_from_success_leads = []
        for (lead_id,) in lead_ids_with_success:
            if not lead_id:
                continue
            lead = MarketingLead.query.get(lead_id)
            if not lead:
                continue
            lead_grade_n = (lead.grade or '').strip() or None
            candidates = Student.query.filter(Student.name == lead.name).all()
            for s in candidates:
                if s.name == TRIAL_PLACEHOLDER_NAME:
                    continue
                s_grade_n = (s.grade or '').strip() or None
                if s_grade_n == lead_grade_n:
                    ids_from_success_leads.append(s.id)
                    break
        
        # 来源4：线索的 trial_status 为「成功」但无排课的情况，按姓名+年级匹配学生
        leads_with_trial_success = MarketingLead.query.filter_by(trial_status='成功').all()
        ids_from_trial_status_leads = []
        for lead in leads_with_trial_success:
            lead_grade_n = (lead.grade or '').strip() or None
            candidates = Student.query.filter(Student.name == lead.name).all()
            for s in candidates:
                if s.name == TRIAL_PLACEHOLDER_NAME:
                    continue
                s_grade_n = (s.grade or '').strip() or None
                if s_grade_n == lead_grade_n:
                    ids_from_trial_status_leads.append(s.id)
                    break
        
        # 来源5：有正式排课（非试课，marketing_lead_id 为 None）的学生
        formal_student_ids = db.session.query(StudentCourse.student_id).filter(
            StudentCourse.marketing_lead_id.is_(None),
            StudentCourse.student_id.isnot(None),
            StudentCourse.status != '删除'
        ).distinct()
        ids_from_formal_courses = [r[0] for r in formal_student_ids.all()]
        
        # 合并所有符合条件的学生ID（与 get_students 逻辑一致）
        union_ids = list(set(ids_from_courses) | set(ids_from_leads) | set(ids_from_success_leads) | set(ids_from_trial_status_leads) | set(ids_from_formal_courses))
        
        if union_ids:
            query = query.filter(Student.id.in_(union_ids))
        else:
            # 无符合条件的学生时返回空集合
            return set()
        
        # 执行查询，获取实际会在 /students 页面显示的学生ID
        # 注意：这里不应用 status/grade 等筛选，因为这些是前端筛选，不影响哪些学生应该被清理
        students = query.all()
        valid_student_ids = {s.id for s in students}
        
        print(f"[DEBUG] get_valid_student_ids_for_management_page: 来源1={len(ids_from_courses)}, 来源2={len(ids_from_leads)}, 来源3={len(ids_from_success_leads)}, 来源4={len(ids_from_trial_status_leads)}, 来源5={len(ids_from_formal_courses)}, union_ids={len(union_ids)}, 最终有效学生数={len(valid_student_ids)}")
        
        return valid_student_ids
    except Exception as e:
        import traceback
        print(f"[ERROR] get_valid_student_ids_for_management_page 错误: {str(e)}\n{traceback.format_exc()}")
        # 出错时返回空集合，避免误删数据
        return set()

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
        
        # 构建查询（排除营销模块试课占位学生，不显示在学生列表）
        TRIAL_PLACEHOLDER_NAME = '【试课学员】'
        query = Student.query.filter(Student.name != TRIAL_PLACEHOLDER_NAME)
        # 仅当请求方为学生管理页（trial_success_only=true）时：只显示来自学生名单且试课状态为成功的学生；学生名单页不传此参数，显示全部（含新增未试课）
        trial_success_only = request.args.get('trial_success_only', '').lower() in ('true', '1', 'yes')
        if trial_success_only:
            # 来源1：至少有一条试课状态为「成功」且未删除的排课记录（已关联到该学生）
            student_ids_from_courses = db.session.query(StudentCourse.student_id).filter(
                StudentCourse.trial_status == '成功',
                StudentCourse.student_id.isnot(None),
                StudentCourse.status != '删除'
            ).distinct()
            ids_from_courses = [r[0] for r in student_ids_from_courses.all()]
            # 来源2：与已提交且试课状态为「成功」的营销线索姓名+年级一致的学生
            # 说明：如果试课状态后面被改成「失败/再试」，trial_status 不再是「成功」，这里就不会再把该学生算进 /students 页面
            submitted_leads = MarketingLead.query.filter_by(lead_status='submitted', trial_status='成功').all()
            ids_from_leads = []
            for lead in submitted_leads:
                lead_grade_n = (lead.grade or '').strip() or None
                candidates = Student.query.filter(Student.name == lead.name).all()
                for s in candidates:
                    if s.name == TRIAL_PLACEHOLDER_NAME:
                        continue
                    s_grade_n = (s.grade or '').strip() or None
                    if s_grade_n == lead_grade_n:
                        ids_from_leads.append(s.id)
                        break
            # 来源3：有试课状态为「成功」的排课对应的线索，按姓名+年级匹配学生（排课可能仍挂在占位学员下，未关联到真实学生）
            lead_ids_with_success = db.session.query(StudentCourse.marketing_lead_id).filter(
                StudentCourse.trial_status == '成功',
                StudentCourse.marketing_lead_id.isnot(None),
                StudentCourse.status != '删除'
            ).distinct().all()
            ids_from_success_leads = []
            for (lead_id,) in lead_ids_with_success:
                if not lead_id:
                    continue
                lead = MarketingLead.query.get(lead_id)
                if not lead:
                    continue
                lead_grade_n = (lead.grade or '').strip() or None
                candidates = Student.query.filter(Student.name == lead.name).all()
                for s in candidates:
                    if s.name == TRIAL_PLACEHOLDER_NAME:
                        continue
                    s_grade_n = (s.grade or '').strip() or None
                    if s_grade_n == lead_grade_n:
                        ids_from_success_leads.append(s.id)
                        break
            # 来源4：线索的 trial_status 为「成功」但无排课的情况，按姓名+年级匹配学生
            leads_with_trial_success = MarketingLead.query.filter_by(trial_status='成功').all()
            ids_from_trial_status_leads = []
            for lead in leads_with_trial_success:
                lead_grade_n = (lead.grade or '').strip() or None
                candidates = Student.query.filter(Student.name == lead.name).all()
                for s in candidates:
                    if s.name == TRIAL_PLACEHOLDER_NAME:
                        continue
                    s_grade_n = (s.grade or '').strip() or None
                    if s_grade_n == lead_grade_n:
                        ids_from_trial_status_leads.append(s.id)
                        break
            # 来源5：有正式排课（非试课，marketing_lead_id 为 None）的学生，确保正式学生也显示在 /students 页面
            formal_student_ids = db.session.query(StudentCourse.student_id).filter(
                StudentCourse.marketing_lead_id.is_(None),
                StudentCourse.student_id.isnot(None),
                StudentCourse.status != '删除'
            ).distinct()
            ids_from_formal_courses = [r[0] for r in formal_student_ids.all()]
            union_ids = list(set(ids_from_courses) | set(ids_from_leads) | set(ids_from_success_leads) | set(ids_from_trial_status_leads) | set(ids_from_formal_courses))
            if union_ids:
                query = query.filter(Student.id.in_(union_ids))
            else:
                query = query.filter(Student.id == -1)  # 无符合条件的学生时返回空
        
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
        
        # 彻底删除只有已删除线索的试课排课的学生及其所有相关数据
        # 获取所有存在的 marketing_lead_id
        existing_lead_ids = db.session.query(MarketingLead.id).all()
        existing_lead_id_set = set(r[0] for r in existing_lead_ids) if existing_lead_ids else set()
        
        # 查找有已删除线索的试课排课的学生（marketing_lead_id 不在存在的列表中）
        students_to_delete = []
        if existing_lead_id_set:
            deleted_lead_course_student_ids = db.session.query(StudentCourse.student_id).filter(
                StudentCourse.marketing_lead_id.isnot(None),
                ~StudentCourse.marketing_lead_id.in_(existing_lead_id_set),
                StudentCourse.status != '删除'
            ).distinct().all()
            deleted_lead_student_ids = [r[0] for r in deleted_lead_course_student_ids if r[0]]
            
            # 查找这些学生是否还有其他有效排课（正式排课 marketing_lead_id 为 None，或有效的试课排课）
            if deleted_lead_student_ids:
                students_with_valid_courses = db.session.query(StudentCourse.student_id).filter(
                    StudentCourse.student_id.in_(deleted_lead_student_ids),
                    StudentCourse.status != '删除'
                ).filter(
                    db.or_(
                        StudentCourse.marketing_lead_id.is_(None),
                        StudentCourse.marketing_lead_id.in_(existing_lead_id_set)
                    )
                ).distinct().all()
                students_with_valid_course_ids = [r[0] for r in students_with_valid_courses]
                # 找出那些只有已删除线索试课排课的学生（没有其他有效排课）
                students_only_deleted_leads = set(deleted_lead_student_ids) - set(students_with_valid_course_ids)
                if students_only_deleted_leads:
                    # 彻底删除这些学生及其所有相关数据
                    for student_id in students_only_deleted_leads:
                        student = Student.query.get(student_id)
                        if student and student.name != TRIAL_PLACEHOLDER_NAME:
                            # 删除该学生的所有排课记录
                            StudentCourse.query.filter_by(student_id=student_id).delete()
                            # 删除该学生的所有缴费记录
                            Payment.query.filter_by(student_id=student_id).delete()
                            # 删除该学生的课时统计
                            ClassHoursStats.query.filter_by(student_id=student_id).delete()
                            # 删除该学生的默认排课设置
                            StudentCourseDefaultSchedule.query.filter_by(student_id=student_id).delete()
                            # 删除学生本身
                            db.session.delete(student)
                            students_to_delete.append(student_id)
                    if students_to_delete:
                        db.session.commit()
                        print(f"[DEBUG] get_students API: 彻底删除了 {len(students_to_delete)} 个只有已删除线索试课排课的学生")
        else:
            # 如果没有任何存在的线索，删除所有只有试课排课的学生
            students_with_trial_only = db.session.query(StudentCourse.student_id).filter(
                StudentCourse.marketing_lead_id.isnot(None),
                StudentCourse.status != '删除'
            ).distinct().all()
            trial_only_student_ids = [r[0] for r in students_with_trial_only if r[0]]
            if trial_only_student_ids:
                students_with_formal_courses = db.session.query(StudentCourse.student_id).filter(
                    StudentCourse.student_id.in_(trial_only_student_ids),
                    StudentCourse.marketing_lead_id.is_(None),
                    StudentCourse.status != '删除'
                ).distinct().all()
                students_with_formal_course_ids = [r[0] for r in students_with_formal_courses]
                students_only_trial = set(trial_only_student_ids) - set(students_with_formal_course_ids)
                if students_only_trial:
                    for student_id in students_only_trial:
                        student = Student.query.get(student_id)
                        if student and student.name != TRIAL_PLACEHOLDER_NAME:
                            StudentCourse.query.filter_by(student_id=student_id).delete()
                            Payment.query.filter_by(student_id=student_id).delete()
                            ClassHoursStats.query.filter_by(student_id=student_id).delete()
                            StudentCourseDefaultSchedule.query.filter_by(student_id=student_id).delete()
                            db.session.delete(student)
                            students_to_delete.append(student_id)
                    if students_to_delete:
                        db.session.commit()
                        print(f"[DEBUG] get_students API: 彻底删除了 {len(students_to_delete)} 个只有试课排课的学生")
        
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
    
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': '姓名不能为空'}), 400
    
    if len(name) > 50:
        return jsonify({'error': '姓名长度不能超过50个字符'}), 400
    
    # 处理入学日期
    enrollment_date_str = (data.get('enrollment_date') or '').strip()
    enrollment_date = None
    if enrollment_date_str:
        try:
            enrollment_date = datetime.strptime(enrollment_date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': '入学日期格式不正确，应为YYYY-MM-DD格式'}), 400
    
    student = Student(
        name=name,
        grade=(data.get('grade') or '').strip() or None,
        status=(data.get('status') or '在校').strip(),
        phone=(data.get('phone') or '').strip() or None,
        parent_name=(data.get('parent_name') or '').strip() or None,
        parent_phone=(data.get('parent_phone') or '').strip() or None,
        address=(data.get('address') or '').strip() or None,
        notes=(data.get('notes') or '').strip() or None,
        enrollment_date=enrollment_date,
        source=(data.get('source') or '').strip() or None
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
    if 'source' in data:
        student.source = (data.get('source', '') or '').strip() or None

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

    was_off_campus = (old_data.get('status') == '离校')
    is_now_off_campus = (student.status == '离校')

    db.session.commit()

    # 学生状态改为离校时，缴费页面对应学生的「进行中」改为「暂停排课」；已是「结束」的仍显示结束，不额外处理
    if is_now_off_campus and not was_off_campus:
        default_schedules = StudentCourseDefaultSchedule.query.filter_by(student_id=student_id).all()
        for default_schedule in default_schedules:
            if not getattr(default_schedule, 'scheduling_paused', False):
                default_schedule.scheduling_paused = True
                default_schedule.updated_at = datetime.now()
                log_operation('students', 'update', 'StudentCourseDefaultSchedule', default_schedule.id,
                              f'学生离校自动暂停排课 student_id={student_id} course_id={default_schedule.course_id}',
                              {'scheduling_paused': False}, {'scheduling_paused': True})
        if default_schedules:
            db.session.commit()

    # 学生状态改为在校时，缴费页面对应学生的「暂停排课」改为「进行中」；已是「结束」的仍显示结束，不额外处理
    if not is_now_off_campus and was_off_campus:
        default_schedules = StudentCourseDefaultSchedule.query.filter_by(student_id=student_id).all()
        for default_schedule in default_schedules:
            if getattr(default_schedule, 'scheduling_paused', False):
                default_schedule.scheduling_paused = False
                default_schedule.updated_at = datetime.now()
                log_operation('students', 'update', 'StudentCourseDefaultSchedule', default_schedule.id,
                              f'学生在校自动恢复排课 student_id={student_id} course_id={default_schedule.course_id}',
                              {'scheduling_paused': True}, {'scheduling_paused': False})
        if default_schedules:
            db.session.commit()

    log_operation('students', 'update', 'Student', student.id, student.name, old_data, student.to_dict())
    return jsonify(student.to_dict())





# DELETE路由必须在更具体的路由（如 /remaining-hours）之前注册


@bp.route('/api/students/<int:student_id>/set-trial-status', methods=['POST'])
@csrf.exempt
@login_required
@require_permission('edit')
@handle_db_errors
def set_student_trial_status(student_id):
    """设置学生试课状态（有排课则更新排课；无排课时写入营销线索的 trial_status，便于学生名单页直接修改）"""
    student = Student.query.get(student_id)
    if not student:
        return jsonify({'error': f'学生ID {student_id} 不存在'}), 404
    TRIAL_PLACEHOLDER_NAME = '【试课学员】'
    if student.name == TRIAL_PLACEHOLDER_NAME:
        return jsonify({'error': '不能操作试课占位学员'}), 400
    if not request.is_json:
        return jsonify({'error': '请求必须是JSON格式'}), 400
    data = request.json or {}
    raw = data.get('trial_status')
    trial_status = (raw or '').strip() or None
    if trial_status is not None and trial_status not in ('成功', '失败', '再试'):
        return jsonify({'error': 'trial_status 只能为 成功、失败、再试 或空'}), 400
    try:
        student_grade_n = (student.grade or '').strip() or None
        print(f"[调试] set_student_trial_status: 学生ID={student_id}, 姓名={student.name}, 年级={student.grade}, 规范化年级={student_grade_n}, trial_status={trial_status}")
        # 查找所有姓名+年级一致的营销线索（可能有多条，如营销待确认一条、学生名单一条）
        all_leads_by_name = MarketingLead.query.filter(MarketingLead.name == student.name).all()
        print(f"[调试] 找到同名线索数量: {len(all_leads_by_name)}")
        for l in all_leads_by_name:
            lg = (l.grade or '').strip() or None
            print(f"[调试] 线索ID={l.id}, 姓名={l.name}, 年级={l.grade}, 规范化年级={lg}, lead_status={l.lead_status}, trial_status={l.trial_status}, 是否匹配={lg == student_grade_n}")
        matching_leads = []
        # 记录「之前是否已经有成功试课」用于判断是否为首次成功
        had_success_before = False

        for l in all_leads_by_name:
            lg = (l.grade or '').strip() or None
            if lg == student_grade_n:
                matching_leads.append(l)
                if l.trial_status == '成功':
                    had_success_before = True
        print(f"[调试] 匹配的线索数量: {len(matching_leads)}")
        if not matching_leads:
            # 如果试课状态为「成功」，创建时直接设为「已提交」，否则设为「试课」
            initial_status = 'submitted' if trial_status == '成功' else 'trial'
            lead = MarketingLead(
                name=student.name,
                grade=student.grade or None,
                lead_status=initial_status,
                trial_status=trial_status,
                saved_at=datetime.now(),
                submitted_at=datetime.now() if trial_status == '成功' else None,
            )
            db.session.add(lead)
            db.session.flush()
            print(f"[调试] 创建新线索: ID={lead.id}, lead_status={lead.lead_status}, trial_status={lead.trial_status}")
            log_operation('marketing', 'create', 'MarketingLead', lead.id, lead.name, None, {'trial_status': trial_status, 'lead_status': initial_status})
            matching_leads = [lead]
        # 更新所有同名同年级的线索：试课状态 + 若为「成功」则从待确认名单移除（draft/trial -> submitted）
        updated_leads = []
        for lead in matching_leads:
            old_lead_status = lead.lead_status
            old_trial_status = lead.trial_status
            lead.trial_status = trial_status
            print(f"[调试] 更新线索ID={lead.id}: trial_status {old_trial_status} -> {trial_status}, lead_status={old_lead_status}")
            # 如果试课状态设置为「成功」，且线索当前在待确认或试课状态（draft/trial），则改为「已提交」，从待确认名单移除
            if trial_status == '成功':
                if lead.lead_status in ('draft', 'trial'):
                    lead.lead_status = 'submitted'
                    lead.submitted_at = datetime.now()
                    print(f"[调试] 线索ID={lead.id} 从待确认/试课移除: lead_status {old_lead_status} -> submitted")
                    log_operation('marketing', 'update', 'MarketingLead', lead.id, lead.name, {'lead_status': old_lead_status}, {'lead_status': 'submitted', 'trial_status': '成功'})
                    updated_leads.append({'id': lead.id, 'name': lead.name, 'old_status': old_lead_status, 'new_status': 'submitted'})
                elif lead.lead_status == 'submitted':
                    print(f"[调试] 线索ID={lead.id} lead_status已经是submitted，无需更新lead_status")
                else:
                    print(f"[调试] 线索ID={lead.id} lead_status={lead.lead_status} 未知状态，不更新lead_status")
        if updated_leads:
            print(f"[调试] 共更新了 {len(updated_leads)} 条线索的lead_status: {updated_leads}")
        # 更新该学生下所有排课的试课状态
        StudentCourse.query.filter_by(student_id=student_id).update(
            {StudentCourse.trial_status: trial_status}, synchronize_session=False
        )
        # 更新与该学生姓名+年级匹配的线索下所有排课的试课状态
        for l in MarketingLead.query.filter(MarketingLead.name == student.name).all():
            lg = (l.grade or '').strip() or None
            if lg != student_grade_n:
                continue
            StudentCourse.query.filter_by(marketing_lead_id=l.id).update(
                {StudentCourse.trial_status: trial_status}, synchronize_session=False
            )

        # 如果这次将试课状态设置为「成功」，且之前从未成功过，则将该学生的历史财务课时数据清零
        # 规则：视为「首次从学生名单推送到学生管理页」，需要让缴费管理页从 0 课时开始
        if trial_status == '成功' and not had_success_before:
            from models import ClassHoursStats, Payment
            # 删除课时统计
            deleted_stats = ClassHoursStats.query.filter_by(student_id=student_id).delete(synchronize_session=False)
            # 删除缴费记录
            deleted_payments = Payment.query.filter_by(student_id=student_id).delete(synchronize_session=False)
            print(f"[调试] 首次试课成功，清空学生ID={student_id} 的历史数据：ClassHoursStats={deleted_stats} 条, Payments={deleted_payments} 条")
        db.session.commit()
        print(f"[调试] 数据库提交成功")
        # 提交后再次查询，确认更新结果
        for lead in matching_leads:
            db.session.refresh(lead)
            print(f"[调试] 提交后线索ID={lead.id}: lead_status={lead.lead_status}, trial_status={lead.trial_status}")
    except Exception as e:
        db.session.rollback()
        print(f"[调试] 操作失败: {str(e)}")
        import traceback
        print(f"[调试] 错误堆栈: {traceback.format_exc()}")
        return jsonify({'error': f'操作失败: {str(e)}'}), 500

    # 业务规则：如果试课状态被设置为「未选择」（即 trial_status 为空），
    # 则该学生应当从「学生管理」页面移除，仅在「学生名单」中保留。
    if trial_status is None:
        try:
            success, err_msg = _remove_student_from_management_core(student)
            if not success:
                # 保持试课状态更新结果，但提示移除失败
                return jsonify({
                    'error': err_msg or '试课状态已清空，但从学生管理页移除失败',
                    'trial_status': trial_status
                }), 500
            return jsonify({
                'message': '试课状态已更新并已从学生管理页移除',
                'trial_status': trial_status
            })
        except Exception as e:
            import traceback
            print(f"[调试] 清空试课状态后移除学生管理失败: {str(e)}\n{traceback.format_exc()}")
            return jsonify({
                'error': f'试课状态已清空，但从学生管理页移除失败: {str(e)}',
                'trial_status': trial_status
            }), 500

    return jsonify({'message': '试课状态已更新', 'trial_status': trial_status})



@bp.route('/api/students/batch-set-trial-status', methods=['POST'])
@csrf.exempt
@login_required
@require_permission('edit')
@handle_db_errors
def batch_set_trial_status():
    """批量设置学生试课状态（用于学生名单页批量确认试课成功）"""
    if not request.is_json:
        return jsonify({'error': '请求必须是JSON格式'}), 400
    data = request.json or {}
    student_ids = data.get('student_ids', [])
    trial_status = data.get('trial_status', '成功')

    if not student_ids or not isinstance(student_ids, list):
        return jsonify({'error': '请选择至少一个学生'}), 400
    if trial_status not in ('成功', '失败', '再试'):
        return jsonify({'error': 'trial_status 只能为 成功、失败、再试'}), 400

    TRIAL_PLACEHOLDER_NAME = '【试课学员】'
    success_count = 0
    errors = []

    for student_id in student_ids:
        try:
            student = Student.query.get(student_id)
            if not student:
                errors.append(f'学生ID {student_id} 不存在')
                continue
            if student.name == TRIAL_PLACEHOLDER_NAME:
                continue

            student_grade_n = (student.grade or '').strip() or None
            all_leads_by_name = MarketingLead.query.filter(MarketingLead.name == student.name).all()
            matching_leads = []
            had_success_before = False

            for l in all_leads_by_name:
                lg = (l.grade or '').strip() or None
                if lg == student_grade_n:
                    matching_leads.append(l)
                    if l.trial_status == '成功':
                        had_success_before = True

            if not matching_leads:
                initial_status = 'submitted' if trial_status == '成功' else 'trial'
                lead = MarketingLead(
                    name=student.name,
                    grade=student.grade or None,
                    lead_status=initial_status,
                    trial_status=trial_status,
                    saved_at=datetime.now(),
                    submitted_at=datetime.now() if trial_status == '成功' else None,
                )
                db.session.add(lead)
                db.session.flush()
                matching_leads = [lead]

            for lead in matching_leads:
                lead.trial_status = trial_status
                if trial_status == '成功' and lead.lead_status in ('draft', 'trial'):
                    lead.lead_status = 'submitted'
                    lead.submitted_at = datetime.now()

            StudentCourse.query.filter_by(student_id=student_id).update(
                {StudentCourse.trial_status: trial_status}, synchronize_session=False
            )
            for l in MarketingLead.query.filter(MarketingLead.name == student.name).all():
                lg = (l.grade or '').strip() or None
                if lg != student_grade_n:
                    continue
                StudentCourse.query.filter_by(marketing_lead_id=l.id).update(
                    {StudentCourse.trial_status: trial_status}, synchronize_session=False
                )

            if trial_status == '成功' and not had_success_before:
                from models import ClassHoursStats, Payment
                ClassHoursStats.query.filter_by(student_id=student_id).delete(synchronize_session=False)
                Payment.query.filter_by(student_id=student_id).delete(synchronize_session=False)

            success_count += 1
        except Exception as e:
            errors.append(f'学生ID {student_id} 操作失败: {str(e)}')

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'批量操作失败: {str(e)}'}), 500

    result = {'message': f'成功更新 {success_count} 个学生的试课状态为「{trial_status}」', 'success_count': success_count}
    if errors:
        result['errors'] = errors
    return jsonify(result)


def _remove_student_from_management_core(student):
    """
    实际执行「从学生管理页移除学生」的核心逻辑。
    - 学生仍保留在学生名单页（/student-list），用于保留基本信息和试课记录
    - 但与该学生相关的排课、缴费、课时统计、默认排课等教学/财务数据将被彻底删除

    返回: (success: bool, error_message: Optional[str])
    """
    if not student:
        return False, '学生不存在'

    TRIAL_PLACEHOLDER_NAME = '【试课学员】'
    if student.name == TRIAL_PLACEHOLDER_NAME:
        return False, '不能操作试课占位学员'

    from models import ClassHoursStats, Payment, StudentCourseDefaultSchedule, TeacherExperienceCost, TeacherExperienceCostHistory

    student_id = student.id
    student_grade_n = (student.grade or '').strip() or None

    try:
        # 1）将该学生下所有试课状态为「成功」的排课改为未选择（trial_status=None）
        StudentCourse.query.filter_by(
            student_id=student_id,
            trial_status='成功'
        ).update({StudentCourse.trial_status: None}, synchronize_session=False)

        # 2）与姓名+年级匹配的营销线索下，所有试课状态为「成功」的排课改为未选择（含仍挂在占位学员下的），同时清空线索的 trial_status
        for lead in MarketingLead.query.filter(MarketingLead.name == student.name).all():
            lead_grade_n = (lead.grade or '').strip() or None
            if lead_grade_n != student_grade_n:
                continue
            # 线索不删除，仅清空 trial_status，避免再次被视为“试课成功”学生
            lead.trial_status = None
            StudentCourse.query.filter_by(
                marketing_lead_id=lead.id,
                trial_status='成功'
            ).update({StudentCourse.trial_status: None}, synchronize_session=False)

        # 3）删除与该学生相关的教学/财务数据（但保留学生本身和营销线索）
        # 3.1 默认排课设置
        StudentCourseDefaultSchedule.query.filter_by(student_id=student_id).delete(synchronize_session=False)
        # 3.2 排课记录
        StudentCourse.query.filter_by(student_id=student_id).delete(synchronize_session=False)
        # 3.3 课时统计
        ClassHoursStats.query.filter_by(student_id=student_id).delete(synchronize_session=False)
        # 3.4 缴费记录
        Payment.query.filter_by(student_id=student_id).delete(synchronize_session=False)
        # 3.5 经验成本及历史
        TeacherExperienceCost.query.filter_by(student_id=student_id).delete(synchronize_session=False)
        TeacherExperienceCostHistory.query.filter_by(student_id=student_id).delete(synchronize_session=False)

        db.session.commit()

        log_operation(
            'students',
            'update',
            'Student',
            student_id,
            student.name,
            f'从学生管理页移除：保留学生名单信息，但已删除该学生的排课、缴费、课时统计和默认排课等数据'
        )
        return True, None
    except Exception as e:
        db.session.rollback()
        return False, f'操作失败: {str(e)}'


@bp.route('/api/students/<int:student_id>/remove-from-management', methods=['POST'])
@csrf.exempt
@login_required
@require_permission('edit')
@handle_db_errors
def remove_student_from_management(student_id):
    """
    从学生管理页移除学生：
    - 学生仍保留在学生名单页（/student-list），用于保留基本信息和试课记录
    - 但与该学生相关的排课、缴费、课时统计、默认排课等教学/财务数据将被彻底删除
    """
    student = Student.query.get(student_id)
    if not student:
        return jsonify({'error': f'学生ID {student_id} 不存在'}), 404

    success, err_msg = _remove_student_from_management_core(student)
    if not success:
        return jsonify({'error': err_msg or '操作失败'}), 500

    return jsonify({
        'message': '已从学生管理页移除：该学生仍保留在学生名单页，但其排课、缴费、课时统计等数据已被删除。'
    })


@bp.route('/api/students/<int:student_id>', methods=['DELETE'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('edit')
@handle_db_errors
def delete_student(student_id):
    """删除学生（彻底删除，不是隐藏，级联删除相关数据）— 仅学生名单页应调用此接口。"""
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

    """获取学生的剩余课时（按课程）。指定 course_id 时按「总缴费－已确认消耗」实时计算，与缴费页一致。"""

    month = request.args.get('month', get_current_month())

    course_id = request.args.get('course_id', type=lambda x: int(x) if x is not None and str(x).isdigit() else None)

    if course_id is not None:

        # 指定课程：按总缴费－已确认消耗实时计算，与缴费页/新增排课弹窗一致
        student = Student.query.get(student_id)
        course = Course.query.get(course_id)
        if not student:
            return jsonify({'student_id': student_id, 'course_id': course_id, 'remaining_hours': 0}), 200
        course_name = course.name if course else ''
        total_paid_hours = calculate_remaining_hours_from_payments(student_id, course_id, course_name=course_name or None)
        consumed_courses = StudentCourse.query.filter(
            StudentCourse.student_id == student_id,
            StudentCourse.course_id == course_id,
            StudentCourse.status != '删除',
            StudentCourse.is_confirmed == True
        ).all()
        consumed_hours = 0
        for cr in consumed_courses:
            if cr.status == '正常':
                consumed_hours += 1
            elif cr.status == '请假':
                consumed_hours -= 1
            elif cr.status == '跑空':
                consumed_hours += 0.5
        remaining_hours = total_paid_hours - consumed_hours
        return jsonify({
            'student_id': student_id,
            'student_name': student.name,
            'course_id': course_id,
            'course_name': course_name,
            'month': month,
            'remaining_hours': remaining_hours
        })

    # 未指定课程：按当月 ClassHoursStats 返回（兼容旧调用）
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
# @limiter.limit("200 per minute")  # 限流已禁用
def get_paid_courses_need_scheduling():
    """获取所有已缴费但需要排课的学生课程列表。按 (student_id, course_id) 返回，同一学生多门课程会对应多条记录。"""
    try:
        from datetime import date
        from services.finance_service import calculate_remaining_hours_from_payments
        
        # 获取所有有缴费记录的学生和课程组合（过滤已删除的学生）
        from models import Student
        payments = Payment.query.join(Student, Payment.student_id == Student.id).filter(Payment.type == '缴费').all()
        
        # 收集学生-课程组合及其缴费信息
        student_course_map = {}  # {(student_id, course_id): {student_name, course_name, subject, total_paid_hours}}
        
        for payment in payments:
            course = None
            if payment.course_id:
                course = Course.query.get(payment.course_id)
            elif payment.course_name:
                # 兼容：缴费只有课程名称没有 course_id 时，按名称匹配启用中的课程
                course = Course.query.filter_by(name=payment.course_name, status='启用').first()
            if not course or course.status != '启用':
                continue
            
            student = Student.query.get(payment.student_id)
            if not student:
                continue
            
            key = (payment.student_id, course.id)
            if key not in student_course_map:
                student_course_map[key] = {
                    'student_id': payment.student_id,
                    'student_name': student.name,
                    'grade': student.grade or '',
                    'course_id': course.id,
                    'course_name': course.name,
                    'subject': course.subject,
                    'total_paid_hours': 0
                }
            
            # 累计缴费课时
            student_course_map[key]['total_paid_hours'] += payment.class_count
        
        # 同时收集通过"设置课程"创建的 StudentCourseDefaultSchedule 记录（即使没有缴费记录也要显示）
        all_default_schedules = StudentCourseDefaultSchedule.query.all()
        for ds in all_default_schedules:
            key = (ds.student_id, ds.course_id)
            if key in student_course_map:
                continue  # 已有缴费记录，跳过
            # 检查学生和课程是否存在且有效
            student = Student.query.get(ds.student_id)
            course = Course.query.get(ds.course_id)
            if not student or not course or course.status != '启用':
                continue
            student_course_map[key] = {
                'student_id': ds.student_id,
                'student_name': student.name,
                'grade': student.grade or '',
                'course_id': course.id,
                'course_name': course.name,
                'subject': course.subject,
                'total_paid_hours': 0,
                '_from_default_schedule': True  # 标记来自设置课程，无缴费记录
            }
        
        # 如果没有任何记录，直接返回空列表
        if not student_course_map:
            return jsonify({
                'courses': [],
                'total': 0
            })
        
        # 计算每个学生-课程组合的剩余课时和已消耗课时
        result_list = []
        for key, info in student_course_map.items():
            student_id, course_id = key
            
            # 来自"设置课程"的记录无需检查缴费记录
            if not info.get('_from_default_schedule'):
                # 再次验证：检查该学生-课程组合是否还有有效的缴费记录（含 course_id 匹配或 course_name 匹配）
                remaining_payments = Payment.query.join(Student, Payment.student_id == Student.id).filter(
                    Payment.student_id == student_id,
                    or_(
                        Payment.course_id == course_id,
                        and_(Payment.course_id.is_(None), Payment.course_name == info['course_name'])
                    )
                ).all()
                
                # 如果没有缴费记录，跳过该学生-课程组合
                if not remaining_payments:
                    continue
                
                # 计算总缴费课时（包括退费）；传入 course_name 以计入仅填了课程名称的缴费
                total_paid_hours = calculate_remaining_hours_from_payments(student_id, course_id, course_name=info['course_name'])
            else:
                total_paid_hours = 0
            
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
            
            # 只要设置了课程字段，都进入预排课列表（不管是否有剩余课时）
            # 获取学生信息（包括标记状态）
            student = Student.query.get(student_id)
            
            # 获取学生-课程的默认排课设置
            default_schedule = StudentCourseDefaultSchedule.query.filter_by(
                student_id=student_id,
                course_id=course_id
            ).first()
            # 暂停排课的学生-课程不参与排课列表
            if default_schedule and getattr(default_schedule, 'scheduling_paused', False):
                continue

            default_teacher_id = default_schedule.default_teacher_id if default_schedule else None
            default_teacher_name = ''
            if default_teacher_id:
                t = Teacher.query.get(default_teacher_id)
                if t:
                    default_teacher_name = t.name or ''
            default_classroom = getattr(default_schedule, 'default_classroom', None) or '' if default_schedule else ''
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
                'default_teacher_id': default_teacher_id,
                'default_teacher_name': default_teacher_name,
                'default_classroom': default_classroom,
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
        
        default_teacher_id = default_schedule.default_teacher_id if default_schedule else None
        default_teacher_name = ''
        if default_teacher_id:
            t = Teacher.query.get(default_teacher_id)
            if t:
                default_teacher_name = t.name or ''
        default_classroom = getattr(default_schedule, 'default_classroom', None) or '' if default_schedule else ''
        return jsonify({
            'student_id': student.id,
            'student_name': student.name,
            'course_id': course.id,
            'course_name': course.name,
            'default_time_slot': default_schedule.default_time_slot if default_schedule else '',
            'default_weekday': default_schedule.default_weekday if default_schedule else '',
            'default_teacher_id': default_teacher_id,
            'default_teacher_name': default_teacher_name,
            'default_classroom': default_classroom
        })
    
    elif request.method == 'PUT':
        data = request.get_json()
        default_time_slot = data.get('default_time_slot', '')
        default_weekday = data.get('default_weekday', '')
        default_teacher_id = data.get('default_teacher_id')
        default_classroom = data.get('default_classroom', '') or ''
        if default_teacher_id is not None:
            default_teacher_id = int(default_teacher_id) if default_teacher_id else None
        
        # 查找或创建默认设置记录
        default_schedule = StudentCourseDefaultSchedule.query.filter_by(
            student_id=student_id,
            course_id=course_id
        ).first()
        
        if default_schedule:
            # 更新现有记录
            default_schedule.default_time_slot = default_time_slot
            default_schedule.default_weekday = default_weekday
            default_schedule.default_teacher_id = default_teacher_id
            default_schedule.default_classroom = default_classroom if default_classroom else None
            default_schedule.updated_at = datetime.now()
        else:
            # 创建新记录
            default_schedule = StudentCourseDefaultSchedule(
                student_id=student_id,
                course_id=course_id,
                default_time_slot=default_time_slot,
                default_weekday=default_weekday,
                default_teacher_id=default_teacher_id,
                default_classroom=default_classroom if default_classroom else None
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
                'default_weekday': default_weekday,
                'default_teacher_id': default_schedule.default_teacher_id,
                'default_classroom': default_schedule.default_classroom or ''
            })
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': f'更新失败: {str(e)}'}), 500


@bp.route('/api/students/default-course-map', methods=['GET'])
@login_required
def get_student_default_course_map():
    """获取所有学生的默认课程映射（用于缴费页面"设置课程"的回显）。返回 {student_id: course_id} 格式。"""
    try:
        schedules = StudentCourseDefaultSchedule.query.all()
        result = {}
        for s in schedules:
            # 每个学生只保留一个默认课程（取最新的）
            if s.student_id not in result or (s.updated_at and result.get(s.student_id, {}).get('_updated_at', '') < str(s.updated_at)):
                result[s.student_id] = s.course_id
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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


@bp.route('/api/students/<int:student_id>/courses/<int:course_id>/scheduling-paused', methods=['PUT'])
@login_required
@csrf.exempt
def update_student_course_scheduling_paused(student_id, course_id):
    """更新学生-课程是否暂停排课（进行中时可切换，暂停后不再参与排课）"""
    try:
        student = Student.query.get_or_404(student_id)
        course = Course.query.get_or_404(course_id)
        data = request.get_json() or {}
        paused = data.get('paused', False)

        default_schedule = StudentCourseDefaultSchedule.query.filter_by(
            student_id=student_id,
            course_id=course_id
        ).first()

        if default_schedule:
            default_schedule.scheduling_paused = bool(paused)
            default_schedule.updated_at = datetime.now()
        else:
            default_schedule = StudentCourseDefaultSchedule(
                student_id=student_id,
                course_id=course_id,
                default_time_slot='',
                default_weekday='',
                default_teacher_id=None,
                scheduling_paused=bool(paused)
            )
            db.session.add(default_schedule)

        db.session.commit()
        log_operation('students', 'update', 'StudentCourseDefaultSchedule', default_schedule.id,
                     f'{student.name}-{course.name}', {'scheduling_paused': not paused}, {'scheduling_paused': paused})
        return jsonify({
            'message': '更新成功',
            'student_id': student_id,
            'course_id': course_id,
            'scheduling_paused': default_schedule.scheduling_paused
        })
    except Exception as e:
        db.session.rollback()
        import traceback
        error_msg = f"更新学生课程暂停排课状态失败: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({'error': error_msg}), 500


@bp.route('/api/students/<int:student_id>/scheduling-paused', methods=['PUT'])
@login_required
@csrf.exempt
def update_student_scheduling_paused(student_id):
    """更新学生级别的暂停排课状态（用于未缴费学生的暂停排课切换）"""
    try:
        student = Student.query.get_or_404(student_id)
        data = request.get_json() or {}
        paused = data.get('paused', False)

        old_paused = getattr(student, 'scheduling_paused', False) or False
        student.scheduling_paused = bool(paused)
        db.session.commit()

        log_operation('students', 'update', 'Student', student.id,
                     f'{student.name} 暂停排课切换',
                     {'scheduling_paused': old_paused},
                     {'scheduling_paused': bool(paused)})
        return jsonify({
            'message': '更新成功',
            'student_id': student_id,
            'scheduling_paused': student.scheduling_paused
        })
    except Exception as e:
        db.session.rollback()
        import traceback
        error_msg = f"更新学生暂停排课状态失败: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({'error': error_msg}), 500



