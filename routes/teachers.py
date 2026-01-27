"""
Teachers路由模块
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
    validate_file_mime_type, get_client_ip, log_operation, require_permission,
    get_current_month, get_weekday, check_course_conflicts, handle_db_errors,
    validate_json
)
from services import (
    create_notification, check_and_create_notifications,
    update_class_hours_stats, update_teacher_hours,
    get_finance_config, calculate_remaining_hours_from_payments,
    calculate_actual_unit_price, update_finance_record
)
from config import Config, basedir
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

bp = Blueprint('teachers', __name__)

@bp.route('/api/teachers', methods=['GET'])
@login_required
def get_teachers():
    """获取所有教师"""
    status = request.args.get('status', '')
    
    # 优化：在数据库层面过滤而不是在内存中
    query = Teacher.query
    if status:
        query = query.filter_by(status=status)
    
    teachers = query.all()
    return jsonify([t.to_dict() for t in teachers])






@bp.route('/api/teachers', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('edit')
@handle_db_errors
def create_teacher():
    """创建教师"""
    # 检查是否是multipart/form-data（文件上传）
    if request.content_type and 'multipart/form-data' in request.content_type:
        data = request.form.to_dict()
        resume_file = request.files.get('resume')
        
        # 处理简历文件上传
        resume_data = None
        resume_filename = None
        
        if resume_file and resume_file.filename:
            # 检查扩展名
            if not allowed_file(resume_file.filename):
                return jsonify({'error': '不支持的文件类型，仅支持pdf、doc、docx、txt格式'}), 400
            
            # 验证文件MIME类型（检查文件内容）
            is_valid, error_msg = validate_file_mime_type(resume_file, {'pdf', 'doc', 'docx', 'txt'})
            if not is_valid:
                return jsonify({'error': error_msg or '文件类型验证失败'}), 400
            
            # 获取原始文件名（支持中文）
            original_filename = get_original_filename(resume_file)
            # 读取文件内容
            file_data = resume_file.read()
            file_size = len(file_data)
            # 获取文件MIME类型
            content_type = resume_file.content_type or 'application/octet-stream'
            
            # 保存到临时文件（作为缓存）
            temp_filename = get_safe_storage_filename(resume_file.filename)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            name_part = secure_filename(data.get('name', 'teacher')) or 'teacher'
            temp_filepath = os.path.join(Config.UPLOAD_FOLDER, f"{name_part}_{timestamp}_{temp_filename}")
            os.makedirs(os.path.dirname(temp_filepath), exist_ok=True)
            with open(temp_filepath, 'wb') as f:
                f.write(file_data)
            
            # 准备保存到数据库的数据
            resume_data = {
                'filename': original_filename,
                'file_data': file_data,
                'file_size': file_size,
                'content_type': content_type,
                'temp_filepath': temp_filepath  # 保存后删除
            }
            resume_filename = original_filename
    else:
        # JSON请求
        if not request.is_json:
            return jsonify({'error': '请求必须是JSON格式'}), 400
        
        data = request.json
        if not data:
            return jsonify({'error': '请求数据为空'}), 400
        
        # 初始化变量（JSON请求不包含文件）
        resume_data = None
        resume_filename = None
    
    name = data.get('name', '').strip()
    
    if not name:
        return jsonify({'error': '教师姓名不能为空'}), 400
    
    if len(name) > 50:
        return jsonify({'error': '教师姓名长度不能超过50个字符'}), 400
    
    # 检查姓名是否已存在
    existing_teacher = Teacher.query.filter_by(name=name).first()
    if existing_teacher:
        return jsonify({'error': '该教师姓名已存在，不能重复添加'}), 400
    
    # 验证数值字段
    try:
        base_salary = float(data.get('base_salary', 0))
        if base_salary < 0:
            return jsonify({'error': '底薪不能为负数'}), 400
    except (ValueError, TypeError):
        return jsonify({'error': '底薪格式不正确'}), 400
    
    teacher = Teacher(
        name=name,
        subject=data.get('subject', '').strip(),
        phone=data.get('phone', '').strip(),
        base_salary=base_salary,
        employment_type=data.get('employment_type', '兼职'),
        status=data.get('status', '启用'),
        bio=data.get('bio', '').strip(),
        resume_path=None,  # 不再使用文件系统路径
        resume_filename=resume_filename
    )
    
    db.session.add(teacher)
    db.session.flush()  # 获取teacher.id
    
    # 如果有简历文件，保存到数据库
    if resume_data:
        teacher_resume = TeacherResume(
            teacher_id=teacher.id,
            filename=resume_data['filename'],
            file_data=resume_data['file_data'],
            file_size=resume_data['file_size'],
            content_type=resume_data['content_type']
        )
        db.session.add(teacher_resume)
        
        # 删除临时缓存文件
        if 'temp_filepath' in resume_data and os.path.exists(resume_data['temp_filepath']):
            try:
                os.remove(resume_data['temp_filepath'])
            except OSError as e:
                from flask import current_app
                current_app.logger.warning(f'删除临时文件失败: {e}')
    
    db.session.commit()
    log_operation('teachers', 'create', 'Teacher', teacher.id, teacher.name)
    return jsonify(teacher.to_dict()), 201






@bp.route('/api/teachers/<int:teacher_id>', methods=['PUT'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('edit')
@handle_db_errors
def update_teacher(teacher_id):
    """更新教师信息"""
    teacher = Teacher.query.get_or_404(teacher_id)
    old_data = teacher.to_dict()

    

    # 检查是否是multipart/form-data（文件上传）

    if request.content_type and 'multipart/form-data' in request.content_type:

        data = request.form.to_dict()

        resume_file = request.files.get('resume')

        

        # 处理简历文件上传

        if resume_file and resume_file.filename:
            # 检查扩展名
            if not allowed_file(resume_file.filename):
                return jsonify({'error': '不支持的文件类型，仅支持pdf、doc、docx、txt格式'}), 400
            
            # 验证文件MIME类型（检查文件内容）
            is_valid, error_msg = validate_file_mime_type(resume_file, {'pdf', 'doc', 'docx', 'txt'})
            if not is_valid:
                return jsonify({'error': error_msg or '文件类型验证失败'}), 400
            
            # 删除旧简历记录（如果存在）
            old_resume = TeacherResume.query.filter_by(teacher_id=teacher_id).first()
            if old_resume:
                db.session.delete(old_resume)
                # 立即 flush 确保删除操作先执行，避免唯一约束冲突
                db.session.flush()
            
            # 删除旧的临时文件（如果存在）
            if teacher.resume_path:
                old_filepath = os.path.join(basedir, teacher.resume_path)
                if os.path.exists(old_filepath):
                    try:
                        os.remove(old_filepath)
                    except OSError as e:
                        from flask import current_app
                        current_app.logger.warning(f'删除旧简历文件失败: {e}')
            
            # 获取原始文件名（支持中文）
            original_filename = get_original_filename(resume_file)
            # 读取文件内容
            file_data = resume_file.read()
            file_size = len(file_data)
            # 获取文件MIME类型
            content_type = resume_file.content_type or 'application/octet-stream'
            
            # 保存到临时文件（作为缓存）
            temp_filename = get_safe_storage_filename(resume_file.filename)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            name_part = secure_filename(data.get('name', teacher.name)) or secure_filename(teacher.name) or 'teacher'
            temp_filepath = os.path.join(Config.UPLOAD_FOLDER, f"{name_part}_{timestamp}_{temp_filename}")
            os.makedirs(os.path.dirname(temp_filepath), exist_ok=True)
            with open(temp_filepath, 'wb') as f:
                f.write(file_data)
            
            # 保存到数据库
            teacher_resume = TeacherResume(
                teacher_id=teacher_id,
                filename=original_filename,
                file_data=file_data,
                file_size=file_size,
                content_type=content_type
            )
            db.session.add(teacher_resume)
            teacher.resume_filename = original_filename
            teacher.resume_path = None  # 不再使用文件系统路径
            
            # 删除临时缓存文件
            try:
                os.remove(temp_filepath)
            except OSError as e:
                from flask import current_app
                current_app.logger.warning(f'删除临时文件失败: {e}')

        elif 'resume' in data and data['resume'] == '':

            # 如果传入了空的resume字段，表示删除简历

            old_resume = TeacherResume.query.filter_by(teacher_id=teacher_id).first()

            if old_resume:

                db.session.delete(old_resume)

            

            # 删除旧的临时文件（如果存在）
            if teacher.resume_path:
                old_filepath = os.path.join(basedir, teacher.resume_path)
                if os.path.exists(old_filepath):
                    try:
                        os.remove(old_filepath)
                    except OSError as e:
                        from flask import current_app
                        current_app.logger.warning(f'删除简历文件失败: {e}')

            

            teacher.resume_path = None

            teacher.resume_filename = None

    else:
        # JSON请求
        if not request.is_json:
            return jsonify({'error': '请求必须是JSON格式'}), 400
        
        data = request.json
        if not data:
            return jsonify({'error': '请求数据为空'}), 400
    
    # 检查姓名是否已存在（排除当前教师）
    new_name = data.get('name', '').strip()
    if new_name:
        if len(new_name) > 50:
            return jsonify({'error': '教师姓名长度不能超过50个字符'}), 400
        if new_name != teacher.name:
            existing_teacher = Teacher.query.filter_by(name=new_name).first()
            if existing_teacher and existing_teacher.id != teacher_id:
                return jsonify({'error': '该教师姓名已存在，不能重复使用'}), 400

    

    # 记录原始值，用于判断是否需要更新相关表

    old_name = teacher.name

    old_subject = teacher.subject

    

    # 更新教师基本信息
    teacher.name = new_name if new_name else teacher.name
    teacher.subject = data.get('subject', teacher.subject).strip() if data.get('subject') else teacher.subject
    teacher.phone = data.get('phone', teacher.phone).strip() if data.get('phone') else teacher.phone
    
    # 验证底薪
    if 'base_salary' in data:
        try:
            base_salary = float(data.get('base_salary', teacher.base_salary))
            if base_salary < 0:
                return jsonify({'error': '底薪不能为负数'}), 400
            teacher.base_salary = base_salary
        except (ValueError, TypeError):
            return jsonify({'error': '底薪格式不正确'}), 400
    
    old_base_salary = teacher.base_salary

    teacher.employment_type = data.get('employment_type', teacher.employment_type or '兼职')

    teacher.status = data.get('status', teacher.status)

    teacher.bio = data.get('bio', teacher.bio)

    

    # 如果教师姓名发生变化，同步更新所有相关表中的 teacher_name

    if teacher.name != old_name:

        # 更新 StudentCourse 表中的 teacher_name

        student_courses = StudentCourse.query.filter_by(teacher_id=teacher_id).all()

        for course in student_courses:

            course.teacher_name = teacher.name

        

        # 更新 TeacherHours 表中的 teacher_name

        teacher_hours_list = TeacherHours.query.filter_by(teacher_id=teacher_id).all()

        for teacher_hours in teacher_hours_list:

            teacher_hours.teacher_name = teacher.name

        

        # 更新 TeacherCourseCost 表中的 teacher_name

        teacher_course_costs = TeacherCourseCost.query.filter_by(teacher_id=teacher_id).all()

        for cost in teacher_course_costs:

            cost.teacher_name = teacher.name

    

    # 如果科目发生变化，同步更新 StudentCourse 表中的 subject

    if teacher.subject != old_subject:

        student_courses = StudentCourse.query.filter_by(teacher_id=teacher_id).all()

        for course in student_courses:

            course.subject = teacher.subject

    

    # 如果是全职教师且底薪发生变化，同步更新所有月份的 TeacherHours 记录

    if teacher.employment_type == '全职' and teacher.base_salary != old_base_salary:

        teacher_hours_list = TeacherHours.query.filter_by(teacher_id=teacher_id).all()

        for teacher_hours in teacher_hours_list:

            teacher_hours.base_salary = teacher.base_salary

    

    try:
        db.session.commit()
        log_operation('teachers', 'update', 'Teacher', teacher.id, teacher.name, old_data, teacher.to_dict())
        return jsonify(teacher.to_dict())
    except Exception as e:
        db.session.rollback()
        import traceback
        error_trace = traceback.format_exc()
        print(f"更新教师错误: {str(e)}")
        print(f"错误堆栈: {error_trace}")
        return jsonify({'error': f'更新失败: {str(e)}'}), 500






@bp.route('/api/teachers/<int:teacher_id>/resume', methods=['GET'])
@login_required
def get_teacher_resume(teacher_id):

    """下载教师简历文件"""

    teacher = Teacher.query.get_or_404(teacher_id)

    

    # 优先从数据库读取

    teacher_resume = TeacherResume.query.filter_by(teacher_id=teacher_id).first()

    

    if teacher_resume:

        # 从数据库读取

        file_content = teacher_resume.file_data

        download_filename = teacher_resume.filename

        content_type = teacher_resume.content_type or 'application/octet-stream'

    elif teacher.resume_path:

        # 兼容旧数据：从文件系统读取

        filepath = os.path.join(basedir, teacher.resume_path)

        if not os.path.exists(filepath):

            return jsonify({'error': '简历文件不存在'}), 404

        

        with open(filepath, 'rb') as f:

            file_content = f.read()

        download_filename = teacher.resume_filename if teacher.resume_filename else os.path.basename(filepath)

        content_type = 'application/octet-stream'

    else:

        return jsonify({'error': '该教师没有上传简历'}), 404

    

    # 处理中文文件名编码

    # 对于ASCII文件名，直接使用

    try:

        # 尝试编码为latin-1（HTTP头标准编码）

        download_filename.encode('latin-1')

        # 如果成功，说明是ASCII字符，直接使用

        content_disposition = f'attachment; filename="{download_filename}"'

    except UnicodeEncodeError:

        # 如果包含非ASCII字符（如中文），使用RFC 5987格式

        # 先创建一个ASCII安全的fallback文件名

        safe_filename = secure_filename(download_filename) or 'resume'

        if '.' in download_filename:

            ext = os.path.splitext(download_filename)[1]

            safe_filename = safe_filename + ext if not safe_filename.endswith(ext) else safe_filename

        

        # 编码UTF-8文件名

        encoded_filename = quote(download_filename.encode('utf-8'))

        # 使用RFC 5987格式：filename用于ASCII fallback，filename*用于UTF-8编码

        content_disposition = f'attachment; filename="{safe_filename}"; filename*=UTF-8\'\'{encoded_filename}'

    

    # 创建响应，设置Content-Disposition头以指定下载文件名

    response = Response(

        file_content,

        mimetype=content_type,

        headers={

            'Content-Disposition': content_disposition

        }

    )

    return response






@bp.route('/api/teachers/<int:teacher_id>', methods=['DELETE'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('edit')
@handle_db_errors
def delete_teacher(teacher_id):
    """删除教师（彻底删除，不是隐藏，级联删除相关数据）"""
    teacher = Teacher.query.get(teacher_id)
    
    if not teacher:
        return jsonify({'error': f'教师ID {teacher_id} 不存在或已被删除'}), 404
    
    teacher_name = teacher.name
    
    from models import StudentCourse, TeacherHours, TeacherCourseCost, TeacherCourseCostHistory, TeacherExperienceCost, TeacherExperienceCostHistory, ClassHoursStats
    
    # 收集需要重新计算学生课时统计的信息（student_id, course_id, month）
    affected_student_courses = set()
    
    # 1. 删除该教师的所有排课记录
    teacher_courses = StudentCourse.query.filter_by(teacher_id=teacher_id).all()
    for sc in teacher_courses:
        # 记录受影响的学生和课程，用于后续重新计算学生课时统计
        if sc.student_id and sc.course_id and sc.course_date:
            month = sc.course_date.strftime('%Y-%m')
            affected_student_courses.add((sc.student_id, sc.course_id, month))
        db.session.delete(sc)
    
    # 2. 删除该教师的课时统计记录
    teacher_hours_records = TeacherHours.query.filter_by(teacher_id=teacher_id).all()
    for th in teacher_hours_records:
        db.session.delete(th)

        

        # 3. 删除该教师的课程成本记录（先删除历史记录，再删除成本记录）
    teacher_course_costs = TeacherCourseCost.query.filter_by(teacher_id=teacher_id).all()
    cost_ids = [tcc.id for tcc in teacher_course_costs]
    
    # 删除成本历史记录
    if cost_ids:
        TeacherCourseCostHistory.query.filter(TeacherCourseCostHistory.cost_id.in_(cost_ids)).delete()
        # 也删除直接关联教师的历史记录（以防万一）
        TeacherCourseCostHistory.query.filter_by(teacher_id=teacher_id).delete()
    
    # 删除成本记录
    for tcc in teacher_course_costs:
        db.session.delete(tcc)
    
    # 4. 删除该教师的经验成本记录（先删除历史记录，再删除成本记录）
    teacher_exp_costs = TeacherExperienceCost.query.filter_by(teacher_id=teacher_id).all()
    exp_cost_ids = [tec.id for tec in teacher_exp_costs]
    
    # 删除经验成本历史记录
    if exp_cost_ids:
        TeacherExperienceCostHistory.query.filter(TeacherExperienceCostHistory.cost_id.in_(exp_cost_ids)).delete()
        # 也删除直接关联教师的历史记录（以防万一）
        TeacherExperienceCostHistory.query.filter_by(teacher_id=teacher_id).delete()
    
    # 删除经验成本记录
    for tec in teacher_exp_costs:
        db.session.delete(tec)
    
    # 5. 删除该教师的简历记录
    teacher_resume = TeacherResume.query.filter_by(teacher_id=teacher_id).first()
    if teacher_resume:
        db.session.delete(teacher_resume)
    
    # 6. 删除教师本身
    db.session.delete(teacher)
    
    # 提交所有删除操作
    db.session.commit()
    
    # 7. 重新计算受影响学生的课时统计（删除排课记录后，需要更新学生课时统计）
    for student_id, course_id, month in affected_student_courses:
        try:
            update_class_hours_stats(student_id, month=month, course_id=course_id)
        except Exception as e:
            # 如果更新学生课时统计失败，记录错误但不影响教师删除
            from flask import current_app
            current_app.logger.warning(f'更新学生课时统计失败 (student_id={student_id}, course_id={course_id}, month={month}): {e}')
    
    log_operation('teachers', 'delete', 'Teacher', teacher_id, teacher_name)
    return jsonify({
        'message': f'删除成功！已删除教师及其所有相关数据（排课记录、课时统计、成本记录等）'
    })






