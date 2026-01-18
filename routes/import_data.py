"""
Import路由模块
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

bp = Blueprint('import', __name__)

@bp.route('/api/import/students', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def import_students():

    """从Excel导入学生"""

    if 'file' not in request.files:

        return jsonify({'error': '没有上传文件'}), 400

    

    file = request.files['file']

    if file.filename == '':

        return jsonify({'error': '文件名为空'}), 400

    

    try:

        # 读取Excel文件

        df = pd.read_excel(file)

        

        # 检查必需的列

        required_columns = ['姓名']

        missing_columns = [col for col in required_columns if col not in df.columns]

        if missing_columns:

            return jsonify({'error': f'缺少必需的列: {", ".join(missing_columns)}'}), 400

        

        success_count = 0

        error_count = 0

        errors = []

        

        for index, row in df.iterrows():

            try:

                # 检查学生是否已存在

                existing = Student.query.filter_by(name=str(row['姓名']).strip()).first()

                if existing:

                    errors.append(f'第{index+2}行: 学生"{row["姓名"]}"已存在，跳过')

                    error_count += 1

                    continue

                

                student = Student(

                    name=str(row['姓名']).strip(),

                    grade=str(row['年级']).strip() if '年级' in row and pd.notna(row['年级']) else None,

                    status=str(row['状态']).strip() if '状态' in row and pd.notna(row['状态']) else '在校',

                    phone=str(row['联系电话']).strip() if '联系电话' in row and pd.notna(row['联系电话']) else None,

                    parent_name=str(row['家长姓名']).strip() if '家长姓名' in row and pd.notna(row['家长姓名']) else None,

                    parent_phone=str(row['家长电话']).strip() if '家长电话' in row and pd.notna(row['家长电话']) else None,

                    address=str(row['地址']).strip() if '地址' in row and pd.notna(row['地址']) else None,

                    email=str(row['邮箱']).strip() if '邮箱' in row and pd.notna(row['邮箱']) else None,

                    notes=str(row['备注']).strip() if '备注' in row and pd.notna(row['备注']) else None

                )

                db.session.add(student)

                success_count += 1

            except Exception as e:

                errors.append(f'第{index+2}行: {str(e)}')

                error_count += 1

        

        db.session.commit()

        

        return jsonify({

            'message': f'导入完成: 成功{success_count}条，失败{error_count}条',

            'success_count': success_count,

            'error_count': error_count,

            'errors': errors[:10]  # 只返回前10个错误

        })

    except Exception as e:

        db.session.rollback()

        import traceback

        traceback.print_exc()

        return jsonify({'error': f'导入失败: {str(e)}'}), 500




@bp.route('/api/import/teachers', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def import_teachers():

    """从Excel导入教师"""

    if 'file' not in request.files:

        return jsonify({'error': '没有上传文件'}), 400

    

    file = request.files['file']

    if file.filename == '':

        return jsonify({'error': '文件名为空'}), 400

    

    try:

        df = pd.read_excel(file)

        

        required_columns = ['姓名']

        missing_columns = [col for col in required_columns if col not in df.columns]

        if missing_columns:

            return jsonify({'error': f'缺少必需的列: {", ".join(missing_columns)}'}), 400

        

        success_count = 0

        error_count = 0

        errors = []

        

        for index, row in df.iterrows():

            try:

                existing = Teacher.query.filter_by(name=str(row['姓名']).strip()).first()

                if existing:

                    errors.append(f'第{index+2}行: 教师"{row["姓名"]}"已存在，跳过')

                    error_count += 1

                    continue

                

                teacher = Teacher(

                    name=str(row['姓名']).strip(),

                    subject=str(row['科目']).strip() if '科目' in row and pd.notna(row['科目']) else None,

                    phone=str(row['联系电话']).strip() if '联系电话' in row and pd.notna(row['联系电话']) else None,

                    base_salary=float(row['底薪']) if '底薪' in row and pd.notna(row['底薪']) else 0,

                    cost_per_class=float(row['每节课成本']) if '每节课成本' in row and pd.notna(row['每节课成本']) else 0,

                    employment_type=str(row['兼职/全职']).strip() if '兼职/全职' in row and pd.notna(row['兼职/全职']) else '兼职',

                    status=str(row['状态']).strip() if '状态' in row and pd.notna(row['状态']) else '启用',

                    bio=str(row['简介']).strip() if '简介' in row and pd.notna(row['简介']) else None

                )

                db.session.add(teacher)

                success_count += 1

            except Exception as e:

                errors.append(f'第{index+2}行: {str(e)}')

                error_count += 1

        

        db.session.commit()

        

        return jsonify({

            'message': f'导入完成: 成功{success_count}条，失败{error_count}条',

            'success_count': success_count,

            'error_count': error_count,

            'errors': errors[:10]

        })

    except Exception as e:

        db.session.rollback()

        import traceback

        traceback.print_exc()

        return jsonify({'error': f'导入失败: {str(e)}'}), 500




@bp.route('/api/import/courses', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def import_courses():

    """从Excel导入排课"""

    if 'file' not in request.files:

        return jsonify({'error': '没有上传文件'}), 400

    

    file = request.files['file']

    if file.filename == '':

        return jsonify({'error': '文件名为空'}), 400

    

    try:

        df = pd.read_excel(file)

        

        required_columns = ['学生姓名', '科目', '老师姓名', '日期']

        missing_columns = [col for col in required_columns if col not in df.columns]

        if missing_columns:

            return jsonify({'error': f'缺少必需的列: {", ".join(missing_columns)}'}), 400

        

        success_count = 0

        error_count = 0

        errors = []

        

        for index, row in df.iterrows():

            try:

                # 查找学生

                student = Student.query.filter_by(name=str(row['学生姓名']).strip()).first()

                if not student:

                    errors.append(f'第{index+2}行: 学生"{row["学生姓名"]}"不存在')

                    error_count += 1

                    continue

                

                # 查找教师

                teacher = Teacher.query.filter_by(name=str(row['老师姓名']).strip()).first()

                if not teacher:

                    errors.append(f'第{index+2}行: 教师"{row["老师姓名"]}"不存在')

                    error_count += 1

                    continue

                

                # 解析日期

                if isinstance(row['日期'], str):

                    course_date = datetime.strptime(row['日期'], '%Y-%m-%d').date()

                else:

                    course_date = pd.to_datetime(row['日期']).date()

                

                # 查找课程（可选）

                course_id = None

                if '课程名称' in row and pd.notna(row['课程名称']):

                    course = Course.query.filter_by(name=str(row['课程名称']).strip()).first()

                    if course:

                        course_id = course.id

                

                # 获取星期

                weekday = get_weekday(course_date.strftime('%Y-%m-%d'))

                

                course = StudentCourse(

                    student_id=student.id,

                    student_name=student.name,

                    grade=student.grade,

                    course_id=course_id,

                    subject=str(row['科目']).strip(),

                    teacher_id=teacher.id,

                    teacher_name=teacher.name,

                    course_date=course_date,

                    weekday=weekday,

                    time_slot=str(row['时段']).strip() if '时段' in row and pd.notna(row['时段']) else None,

                    classroom=str(row['教室']).strip() if '教室' in row and pd.notna(row['教室']) else None,

                    status=str(row['状态']).strip() if '状态' in row and pd.notna(row['状态']) else '正常'

                )

                db.session.add(course)

                success_count += 1

            except Exception as e:

                errors.append(f'第{index+2}行: {str(e)}')

                error_count += 1

        

        db.session.commit()

        

        # 更新课时统计

        if success_count > 0:

            for stat in ClassHoursStats.query.all():

                update_class_hours_stats(stat.student_id, stat.month, stat.course_id)

        

        return jsonify({

            'message': f'导入完成: 成功{success_count}条，失败{error_count}条',

            'success_count': success_count,

            'error_count': error_count,

            'errors': errors[:10]

        })

    except Exception as e:

        db.session.rollback()

        import traceback

        traceback.print_exc()

        return jsonify({'error': f'导入失败: {str(e)}'}), 500




@bp.route('/api/import/payments', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def import_payments():

    """从Excel导入缴费记录"""

    if 'file' not in request.files:

        return jsonify({'error': '没有上传文件'}), 400

    

    file = request.files['file']

    if file.filename == '':

        return jsonify({'error': '文件名为空'}), 400

    

    try:

        df = pd.read_excel(file)

        

        required_columns = ['缴费日期', '学生姓名', '缴纳费用', '报课节数']

        missing_columns = [col for col in required_columns if col not in df.columns]

        if missing_columns:

            return jsonify({'error': f'缺少必需的列: {", ".join(missing_columns)}'}), 400

        

        success_count = 0

        error_count = 0

        errors = []

        

        for index, row in df.iterrows():

            try:

                # 查找学生

                student = Student.query.filter_by(name=str(row['学生姓名']).strip()).first()

                if not student:

                    errors.append(f'第{index+2}行: 学生"{row["学生姓名"]}"不存在')

                    error_count += 1

                    continue

                

                # 解析日期

                if isinstance(row['缴费日期'], str):

                    payment_date = datetime.strptime(row['缴费日期'], '%Y-%m-%d').date()

                else:

                    payment_date = pd.to_datetime(row['缴费日期']).date()

                

                # 查找课程（可选）

                course_id = None

                if '课程名称' in row and pd.notna(row['课程名称']):

                    course = Course.query.filter_by(name=str(row['课程名称']).strip()).first()

                    if course:

                        course_id = course.id

                

                original_amount = float(row['原始费用']) if '原始费用' in row and pd.notna(row['原始费用']) else float(row['缴纳费用'])

                discount_rate = float(row['优惠率(%)']) if '优惠率(%)' in row and pd.notna(row['优惠率(%)']) else 0

                paid_amount = float(row['缴纳费用'])

                class_count = int(row['报课节数'])

                unit_price = paid_amount / class_count if class_count > 0 else 0

                payment_type = str(row['类型']).strip() if '类型' in row and pd.notna(row['类型']) else '缴费'

                

                payment = Payment(

                    payment_date=payment_date,

                    student_id=student.id,

                    student_name=student.name,

                    course_id=course_id,

                    course_name=str(row['课程名称']).strip() if '课程名称' in row and pd.notna(row['课程名称']) else None,

                    original_amount=original_amount,

                    discount_rate=discount_rate,

                    paid_amount=paid_amount,

                    class_count=class_count,

                    unit_price=unit_price,

                    type=payment_type,

                    remark=str(row['备注']).strip() if '备注' in row and pd.notna(row['备注']) else None

                )

                db.session.add(payment)

                success_count += 1

            except Exception as e:

                errors.append(f'第{index+2}行: {str(e)}')

                error_count += 1

        

        db.session.commit()

        

        # 更新课时统计

        if success_count > 0:

            for stat in ClassHoursStats.query.all():

                update_class_hours_stats(stat.student_id, stat.month, stat.course_id)

        

        return jsonify({

            'message': f'导入完成: 成功{success_count}条，失败{error_count}条',

            'success_count': success_count,

            'error_count': error_count,

            'errors': errors[:10]

        })

    except Exception as e:

        db.session.rollback()

        import traceback

        traceback.print_exc()

        return jsonify({'error': f'导入失败: {str(e)}'}), 500






