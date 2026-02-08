"""
Teachers路由模块
从app_old.py提取
"""
from flask import Blueprint, request, jsonify, send_file
from flask_login import login_required, current_user
from extensions import db, limiter, csrf
from models import Teacher, TeacherResume
from utils import (
    log_operation, require_permission, handle_db_errors
)
import os
from werkzeug.utils import secure_filename

bp = Blueprint('teachers', __name__)


@bp.route('/api/teachers', methods=['GET'])
@login_required
@handle_db_errors
def get_teachers():
    """获取教师列表"""
    status = request.args.get('status', '').strip()
    
    query = Teacher.query
    
    # 状态筛选
    if status:
        query = query.filter_by(status=status)
    
    teachers = query.order_by(Teacher.id.desc()).all()
    
    return jsonify([teacher.to_dict() for teacher in teachers])


@bp.route('/api/teachers/<int:teacher_id>', methods=['GET'])
@login_required
@handle_db_errors
def get_teacher(teacher_id):
    """获取单个教师"""
    teacher = Teacher.query.get_or_404(teacher_id)
    return jsonify(teacher.to_dict())


@bp.route('/api/teachers', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('edit')
@handle_db_errors
def create_teacher():
    """创建教师"""
    data = {}
    
    # 处理表单数据
    if request.is_json:
        data = request.get_json()
    else:
        # 处理 multipart/form-data
        data = {
            'name': request.form.get('name', '').strip(),
            'subject': request.form.get('subject', '').strip() or None,
            'phone': request.form.get('phone', '').strip() or None,
            'base_salary': request.form.get('base_salary'),
            'cost_per_class': request.form.get('cost_per_class'),
            'employment_type': request.form.get('employment_type', '兼职').strip(),
            'status': request.form.get('status', '启用').strip(),
            'bio': request.form.get('bio', '').strip() or None,
        }
        
        # 处理数字字段
        try:
            if data['base_salary']:
                data['base_salary'] = float(data['base_salary'])
            else:
                data['base_salary'] = 0
        except (ValueError, TypeError):
            data['base_salary'] = 0
        
        try:
            if data['cost_per_class']:
                data['cost_per_class'] = float(data['cost_per_class'])
            else:
                data['cost_per_class'] = 0
        except (ValueError, TypeError):
            data['cost_per_class'] = 0
    
    # 验证必填字段
    if not data.get('name'):
        return jsonify({'error': '教师姓名不能为空'}), 400
    
    # 检查是否已存在同名教师
    existing = Teacher.query.filter_by(name=data['name']).first()
    if existing:
        return jsonify({'error': f'教师"{data["name"]}"已存在'}), 400
    
    # 创建教师
    teacher = Teacher(
        name=data['name'],
        subject=data.get('subject'),
        phone=data.get('phone'),
        base_salary=data.get('base_salary', 0),
        cost_per_class=data.get('cost_per_class', 0),
        employment_type=data.get('employment_type', '兼职'),
        status=data.get('status', '启用'),
        bio=data.get('bio')
    )
    
    db.session.add(teacher)
    db.session.commit()
    
    # 处理简历文件上传
    if 'resume' in request.files:
        resume_file = request.files['resume']
        if resume_file.filename:
            try:
                from config import Config
                filename = secure_filename(resume_file.filename)
                resume_path = os.path.join(Config.UPLOAD_FOLDER, 'resumes', filename)
                os.makedirs(os.path.dirname(resume_path), exist_ok=True)
                resume_file.save(resume_path)
                
                teacher.resume_path = resume_path
                teacher.resume_filename = filename
                db.session.commit()
            except Exception as e:
                # 简历上传失败不影响教师创建
                print(f"简历上传失败: {e}")
    
    # 记录操作日志
    log_operation('teachers', 'create', 'Teacher', teacher.id, teacher.name)
    
    return jsonify(teacher.to_dict()), 201


@bp.route('/api/teachers/<int:teacher_id>', methods=['PUT'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('edit')
@handle_db_errors
def update_teacher(teacher_id):
    """更新教师"""
    teacher = Teacher.query.get_or_404(teacher_id)
    
    data = {}
    
    # 处理表单数据
    if request.is_json:
        data = request.get_json()
    else:
        # 处理 multipart/form-data
        data = {
            'name': request.form.get('name', '').strip(),
            'subject': request.form.get('subject', '').strip() or None,
            'phone': request.form.get('phone', '').strip() or None,
            'base_salary': request.form.get('base_salary'),
            'cost_per_class': request.form.get('cost_per_class'),
            'employment_type': request.form.get('employment_type', '兼职').strip(),
            'status': request.form.get('status', '启用').strip(),
            'bio': request.form.get('bio', '').strip() or None,
        }
        
        # 处理数字字段
        try:
            if data['base_salary']:
                data['base_salary'] = float(data['base_salary'])
        except (ValueError, TypeError):
            pass
        
        try:
            if data['cost_per_class']:
                data['cost_per_class'] = float(data['cost_per_class'])
        except (ValueError, TypeError):
            pass
    
    # 验证必填字段
    if data.get('name') and not data['name']:
        return jsonify({'error': '教师姓名不能为空'}), 400
    
    # 检查是否已存在同名教师（排除自己）
    if data.get('name') and data['name'] != teacher.name:
        existing = Teacher.query.filter_by(name=data['name']).first()
        if existing and existing.id != teacher_id:
            return jsonify({'error': f'教师"{data["name"]}"已存在'}), 400
    
    # 更新字段
    if 'name' in data:
        teacher.name = data['name']
    if 'subject' in data:
        teacher.subject = data['subject']
    if 'phone' in data:
        teacher.phone = data['phone']
    if 'base_salary' in data:
        teacher.base_salary = data['base_salary']
    if 'cost_per_class' in data:
        teacher.cost_per_class = data['cost_per_class']
    if 'employment_type' in data:
        teacher.employment_type = data['employment_type']
    if 'status' in data:
        teacher.status = data['status']
    if 'bio' in data:
        teacher.bio = data['bio']
    
    # 处理简历文件上传
    if 'resume' in request.files:
        resume_file = request.files['resume']
        if resume_file.filename:
            try:
                from config import Config
                # 删除旧简历
                if teacher.resume_path and os.path.exists(teacher.resume_path):
                    os.remove(teacher.resume_path)
                
                filename = secure_filename(resume_file.filename)
                resume_path = os.path.join(Config.UPLOAD_FOLDER, 'resumes', filename)
                os.makedirs(os.path.dirname(resume_path), exist_ok=True)
                resume_file.save(resume_path)
                
                teacher.resume_path = resume_path
                teacher.resume_filename = filename
            except Exception as e:
                print(f"简历上传失败: {e}")
    
    db.session.commit()
    
    # 记录操作日志
    log_operation('teachers', 'update', 'Teacher', teacher.id, teacher.name)
    
    return jsonify(teacher.to_dict())


@bp.route('/api/teachers/<int:teacher_id>', methods=['DELETE'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
@require_permission('edit')
@handle_db_errors
def delete_teacher(teacher_id):
    """删除教师"""
    teacher = Teacher.query.get_or_404(teacher_id)
    teacher_name = teacher.name
    
    # 删除简历文件
    if teacher.resume_path and os.path.exists(teacher.resume_path):
        try:
            os.remove(teacher.resume_path)
        except Exception as e:
            print(f"删除简历文件失败: {e}")
    
    # 删除教师
    db.session.delete(teacher)
    db.session.commit()
    
    # 记录操作日志
    log_operation('teachers', 'delete', 'Teacher', teacher_id, teacher_name)
    
    return jsonify({'message': '删除成功'})


@bp.route('/api/teachers/<int:teacher_id>/resume', methods=['GET'])
@login_required
@handle_db_errors
def get_teacher_resume(teacher_id):
    """获取教师简历文件"""
    teacher = Teacher.query.get_or_404(teacher_id)
    
    if not teacher.resume_path or not os.path.exists(teacher.resume_path):
        return jsonify({'error': '简历文件不存在'}), 404
    
    return send_file(
        teacher.resume_path,
        as_attachment=True,
        download_name=teacher.resume_filename or 'resume.pdf'
    )
