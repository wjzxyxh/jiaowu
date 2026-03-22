"""
Teacher Hours路由模块
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

bp = Blueprint('teacher_hours', __name__)

@bp.route('/api/teacher-hours', methods=['GET'])
def get_teacher_hours():

    """获取老师课时"""

    try:

        month = request.args.get('month', get_current_month())

        employment_type = request.args.get('employment_type', '')  # 可选：兼职/全职

        

        hours_list = TeacherHours.query.filter_by(month=month).all()

        

        # 如果指定了 employment_type，进行筛选

        if employment_type:

            # 获取所有符合条件的教师ID

            teachers = Teacher.query.filter_by(employment_type=employment_type).all()

            teacher_ids = [t.id for t in teachers]

            hours_list = [h for h in hours_list if h.teacher_id in teacher_ids]

            

            # 全职老师：即使没有排课，也有底薪需要结算。
            # TeacherHours 表按 (teacher_id, course_id, month) 存储，course_id 不能为空，
            # 因此使用“底薪(占位)”课程承载 0 课时记录，确保前端可确认结算/可编辑激励与备注。
            if employment_type == '全职':
                placeholder_course = Course.query.filter_by(name='底薪(占位)', subject='系统').first()
                if not placeholder_course:
                    placeholder_course = Course(
                        name='底薪(占位)',
                        subject='系统',
                        unit_price=0.0,
                        description='系统占位课程：用于全职教师无排课月份的底薪结算',
                        status='停用',
                    )
                    db.session.add(placeholder_course)
                    db.session.flush()

                existing_teacher_ids = {h.teacher_id for h in hours_list}
                for teacher in teachers:
                    if teacher.id in existing_teacher_ids:
                        continue
                    if (teacher.base_salary or 0.0) <= 0:
                        continue
                    teacher_hours = TeacherHours.query.filter_by(
                        teacher_id=teacher.id,
                        course_id=placeholder_course.id,
                        month=month,
                    ).first()
                    if not teacher_hours:
                        teacher_hours = TeacherHours(
                            teacher_id=teacher.id,
                            teacher_name=teacher.name,
                            course_id=placeholder_course.id,
                            course_name=placeholder_course.name,
                            month=month,
                            total_hours=0.0,
                            incentive=0.0,
                            remark='',
                        )
                        db.session.add(teacher_hours)
                        db.session.flush()
                    hours_list.append(teacher_hours)

                db.session.commit()

        

        # 获取每个老师的当月上课详情，按学生和课程分组

        year, month_num = map(int, month.split('-'))

        start_date = date(year, month_num, 1)

        end_date = date(year, month_num, calendar.monthrange(year, month_num)[1])

        

        result = []

        for hours in hours_list:

            hours_dict = hours.to_dict()

            

            # 查询该老师当月的课程，加载课程关联

            # 只查询已确认的课程，未确认的课程不显示在上课时间、课时费和总工资中

            # 过滤已删除的学生
            from models import Student
            courses = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).options(

                joinedload(StudentCourse.course)

            ).filter(

                StudentCourse.teacher_id == hours.teacher_id,

                StudentCourse.course_date >= start_date,

                StudentCourse.course_date <= end_date,

                StudentCourse.status != '删除',

                StudentCourse.is_confirmed == True,  # 只统计已确认的课程

                StudentCourse.marketing_lead_id.is_(None)

            ).order_by(StudentCourse.student_name, StudentCourse.course_id, StudentCourse.course_date, StudentCourse.time_slot).all()

            

            # 获取教师的所有课程成本配置

            teacher_costs = TeacherCourseCost.query.filter(
                TeacherCourseCost.teacher_id == hours.teacher_id,
                or_(TeacherCourseCost.status == '启用', TeacherCourseCost.status.is_(None)),
            ).all()

            cost_map = {cost.course_id: cost.cost_per_class for cost in teacher_costs}

            

            # 获取教师的所有经验成本配置

            # 构建两层映射：先按"教师-课程-学生"匹配，再按"教师-课程"匹配

            teacher_experience_costs = TeacherExperienceCost.query.filter_by(teacher_id=hours.teacher_id).all()

            # 第一层：按"教师-课程-学生"映射（包含时间段信息）

            experience_cost_map_by_student = {}

            # 第二层：按"教师-课程"映射（student_id为None的记录，包含时间段信息）

            experience_cost_map_by_course = {}

            

            for cost in teacher_experience_costs:

                if cost.student_id:

                    # 按"教师-课程-学生"映射，存储完整记录以便后续匹配时间段

                    key = (cost.course_id, cost.student_id)

                    if key not in experience_cost_map_by_student:

                        experience_cost_map_by_student[key] = []

                    experience_cost_map_by_student[key].append(cost)

                else:

                    # 按"教师-课程"映射，存储完整记录以便后续匹配时间段

                    if cost.course_id not in experience_cost_map_by_course:

                        experience_cost_map_by_course[cost.course_id] = []

                    experience_cost_map_by_course[cost.course_id].append(cost)

            

            # 按学生和课程分组，并计算工资

            # 注意：由于查询时已经过滤了未确认的课程（is_confirmed == True），

            # 所以只有已确认的课程才会被分组和计算

            # 如果某个课程的所有排课都未确认，那么这个课程的分组不会显示

            grouped_courses = {}

            total_salary = 0.0  # 总工资

            total_experience_cost = 0.0  # 总经验

            teacher = db.session.get(Teacher, hours.teacher_id)

            # 只有全职教师才有底薪，优先使用 TeacherHours 表中的底薪，否则从 Teacher 表读取

            employment_type = teacher.employment_type if teacher else '兼职'

            if employment_type == '全职':

                # 优先使用 TeacherHours 表中的底薪，如果没有则从 Teacher 表读取

                base_salary = getattr(hours, 'base_salary', None)

                if base_salary is None or base_salary == 0:

                    base_salary = getattr(teacher, 'base_salary', 0.0) if teacher else 0.0

            else:

                base_salary = 0.0

            

            # 计算明细列表

            calculation_details = []

            

            for course in courses:

                if course.status == '正常':  # 只计算正常状态的课程

                    # 获取课程名称和ID

                    course_name = course.subject  # 默认使用科目

                    course_id = None

                    if course.course_id and course.course:

                        course_name = course.course.name

                        course_id = course.course.id

                    

                    # 计算本次课的成本

                    course_cost = 0.0

                    if course_id and course_id in cost_map:

                        # 使用配置的课程成本

                        course_cost = cost_map[course_id]

                    

                    # 计算本次课的经验

                    # 优先匹配"教师-课程-学生"，如果没有则使用"教师-课程"

                    # 需要根据课程日期匹配对应时间段的经验成本

                    experience_cost = 0.0

                    if course_id:

                        course_date = course.course_date

                        student_key = (course_id, course.student_id)

                        

                        # 优先匹配"教师-课程-学生"

                        if student_key in experience_cost_map_by_student:

                            # 查找匹配时间段的经验成本（按年月匹配）

                            matched_cost = None

                            course_year_month = course_date.strftime('%Y-%m')  # 课程的年月（YYYY-MM）

                            

                            for cost_record in experience_cost_map_by_student[student_key]:

                                # 检查时间段是否匹配（按年月比较）

                                if cost_record.start_date:

                                    start_year_month = cost_record.start_date.strftime('%Y-%m')

                                    if course_year_month < start_year_month:

                                        continue

                                if cost_record.end_date:

                                    end_year_month = cost_record.end_date.strftime('%Y-%m')

                                    if course_year_month > end_year_month:

                                        continue

                                # 如果时间段匹配，使用该记录

                                matched_cost = cost_record

                                break

                            

                            # 如果没有匹配时间段的记录，查找没有时间段的记录（永久有效）

                            if not matched_cost:

                                for cost_record in experience_cost_map_by_student[student_key]:

                                    if not cost_record.start_date and not cost_record.end_date:

                                        matched_cost = cost_record

                                        break

                            

                            if matched_cost:

                                experience_cost = matched_cost.experience_cost

                        

                        # 如果没有匹配到"教师-课程-学生"，则使用"教师-课程"

                        if experience_cost == 0.0 and course_id in experience_cost_map_by_course:

                            # 查找匹配时间段的经验成本（按年月匹配）

                            matched_cost = None

                            course_year_month = course_date.strftime('%Y-%m')  # 课程的年月（YYYY-MM）

                            

                            for cost_record in experience_cost_map_by_course[course_id]:

                                # 检查时间段是否匹配（按年月比较）

                                if cost_record.start_date:

                                    start_year_month = cost_record.start_date.strftime('%Y-%m')

                                    if course_year_month < start_year_month:

                                        continue

                                if cost_record.end_date:

                                    end_year_month = cost_record.end_date.strftime('%Y-%m')

                                    if course_year_month > end_year_month:

                                        continue

                                # 如果时间段匹配，使用该记录

                                matched_cost = cost_record

                                break

                            

                            # 如果没有匹配时间段的记录，查找没有时间段的记录（永久有效）

                            if not matched_cost:

                                for cost_record in experience_cost_map_by_course[course_id]:

                                    if not cost_record.start_date and not cost_record.end_date:

                                        matched_cost = cost_record

                                        break

                            

                            if matched_cost:

                                experience_cost = matched_cost.experience_cost

                    

                    total_salary += course_cost

                    total_experience_cost += experience_cost

                    

                    # 构建分组key：学生姓名-课程名称

                    key = f"{course.student_name}-{course_name}"

                    

                    if key not in grouped_courses:

                        grouped_courses[key] = {

                            'student_name': course.student_name,

                            'course_name': course_name,

                            'times': [],

                            'count': 0,

                            'cost': course_cost,

                            'experience_cost': experience_cost,

                            'subtotal': 0.0,

                            'experience_subtotal': 0.0

                        }

                    

                    grouped_courses[key]['count'] += 1

                    grouped_courses[key]['subtotal'] += course_cost

                    grouped_courses[key]['experience_subtotal'] += experience_cost

                    

                    # 构建时间字符串：日期(星期) 时段

                    date_str = course.course_date.strftime('%Y-%m-%d')

                    weekday_str = course.weekday or ''

                    time_slot_str = course.time_slot or ''

                    

                    time_str = f"{date_str}({weekday_str})"

                    if time_slot_str:

                        time_str += f" {time_slot_str}"

                    

                    grouped_courses[key]['times'].append(time_str)

                elif course.status == '跑空':

                    # 跑空算0.5课时，也需要计算成本

                    course_name = course.subject

                    course_id = None

                    if course.course_id and course.course:

                        course_name = course.course.name

                        course_id = course.course.id

                    

                    course_cost = 0.0

                    if course_id and course_id in cost_map:

                        # 使用配置的课程成本

                        course_cost = cost_map[course_id] * 0.5

                    

                    # 计算本次课的经验（跑空也算0.5）

                    # 优先匹配"教师-课程-学生"，如果没有则使用"教师-课程"

                    # 需要根据课程日期匹配对应时间段的经验成本（按年月匹配）

                    experience_cost = 0.0

                    if course_id:

                        course_date = course.course_date

                        course_year_month = course_date.strftime('%Y-%m')  # 课程的年月（YYYY-MM）

                        student_key = (course_id, course.student_id)

                        

                        # 优先匹配"教师-课程-学生"

                        if student_key in experience_cost_map_by_student:

                            # 查找匹配时间段的经验成本（按年月匹配）

                            matched_cost = None

                            for cost_record in experience_cost_map_by_student[student_key]:

                                # 检查时间段是否匹配（按年月比较）

                                if cost_record.start_date:

                                    start_year_month = cost_record.start_date.strftime('%Y-%m')

                                    if course_year_month < start_year_month:

                                        continue

                                if cost_record.end_date:

                                    end_year_month = cost_record.end_date.strftime('%Y-%m')

                                    if course_year_month > end_year_month:

                                        continue

                                # 如果时间段匹配，使用该记录

                                matched_cost = cost_record

                                break

                            

                            # 如果没有匹配时间段的记录，查找没有时间段的记录（永久有效）

                            if not matched_cost:

                                for cost_record in experience_cost_map_by_student[student_key]:

                                    if not cost_record.start_date and not cost_record.end_date:

                                        matched_cost = cost_record

                                        break

                            

                            if matched_cost:

                                experience_cost = matched_cost.experience_cost * 0.5

                        

                        # 如果没有匹配到"教师-课程-学生"，则使用"教师-课程"

                        if experience_cost == 0.0 and course_id in experience_cost_map_by_course:

                            # 查找匹配时间段的经验成本（按年月匹配）

                            matched_cost = None

                            for cost_record in experience_cost_map_by_course[course_id]:

                                # 检查时间段是否匹配（按年月比较）

                                if cost_record.start_date:

                                    start_year_month = cost_record.start_date.strftime('%Y-%m')

                                    if course_year_month < start_year_month:

                                        continue

                                if cost_record.end_date:

                                    end_year_month = cost_record.end_date.strftime('%Y-%m')

                                    if course_year_month > end_year_month:

                                        continue

                                # 如果时间段匹配，使用该记录

                                matched_cost = cost_record

                                break

                            

                            # 如果没有匹配时间段的记录，查找没有时间段的记录（永久有效）

                            if not matched_cost:

                                for cost_record in experience_cost_map_by_course[course_id]:

                                    if not cost_record.start_date and not cost_record.end_date:

                                        matched_cost = cost_record

                                        break

                            

                            if matched_cost:

                                experience_cost = matched_cost.experience_cost * 0.5

                    

                    total_salary += course_cost

                    total_experience_cost += experience_cost

                    

                    # 构建分组key：学生姓名-课程名称

                    key = f"{course.student_name}-{course_name}"

                    

                    if key not in grouped_courses:

                        # 获取该分组的经验（用于显示，使用第一个课程的时间段匹配）

                        group_experience_cost = 0.0

                        if course_id:

                            course_date = course.course_date

                            course_year_month = course_date.strftime('%Y-%m')  # 课程的年月（YYYY-MM）

                            student_key = (course_id, course.student_id)

                            

                            # 优先匹配"教师-课程-学生"

                            if student_key in experience_cost_map_by_student:

                                matched_cost = None

                                for cost_record in experience_cost_map_by_student[student_key]:

                                    # 检查时间段是否匹配（按年月比较）

                                    if cost_record.start_date:

                                        start_year_month = cost_record.start_date.strftime('%Y-%m')

                                        if course_year_month < start_year_month:

                                            continue

                                    if cost_record.end_date:

                                        end_year_month = cost_record.end_date.strftime('%Y-%m')

                                        if course_year_month > end_year_month:

                                            continue

                                    matched_cost = cost_record

                                    break

                                if not matched_cost:

                                    for cost_record in experience_cost_map_by_student[student_key]:

                                        if not cost_record.start_date and not cost_record.end_date:

                                            matched_cost = cost_record

                                            break

                                if matched_cost:

                                    group_experience_cost = matched_cost.experience_cost

                            

                            # 如果没有匹配到，使用"教师-课程"

                            if group_experience_cost == 0.0 and course_id in experience_cost_map_by_course:

                                matched_cost = None

                                for cost_record in experience_cost_map_by_course[course_id]:

                                    # 检查时间段是否匹配（按年月比较）

                                    if cost_record.start_date:

                                        start_year_month = cost_record.start_date.strftime('%Y-%m')

                                        if course_year_month < start_year_month:

                                            continue

                                    if cost_record.end_date:

                                        end_year_month = cost_record.end_date.strftime('%Y-%m')

                                        if course_year_month > end_year_month:

                                            continue

                                    matched_cost = cost_record

                                    break

                                if not matched_cost:

                                    for cost_record in experience_cost_map_by_course[course_id]:

                                        if not cost_record.start_date and not cost_record.end_date:

                                            matched_cost = cost_record

                                            break

                                if matched_cost:

                                    group_experience_cost = matched_cost.experience_cost

                        

                        grouped_courses[key] = {

                            'student_name': course.student_name,

                            'course_name': course_name,

                            'times': [],

                            'count': 0,

                            'cost': cost_map.get(course_id, 0.0) if course_id else 0.0,

                            'experience_cost': group_experience_cost,

                            'subtotal': 0.0,

                            'experience_subtotal': 0.0

                        }

                    

                    grouped_courses[key]['count'] += 0.5

                    grouped_courses[key]['subtotal'] += course_cost

                    grouped_courses[key]['experience_subtotal'] += experience_cost

                    

                    # 构建时间字符串：日期(星期) 时段

                    date_str = course.course_date.strftime('%Y-%m-%d')

                    weekday_str = course.weekday or ''

                    time_slot_str = course.time_slot or ''

                    

                    time_str = f"{date_str}({weekday_str})"

                    if time_slot_str:

                        time_str += f" {time_slot_str}"

                    

                    grouped_courses[key]['times'].append(time_str + ' (跑空)')

            

            # 构建计算明细

            for key, group in grouped_courses.items():

                calculation_details.append({

                    'student_name': group['student_name'],

                    'course_name': group['course_name'],

                    'hours': group['count'],

                    'cost_per_class': group['cost'],

                    'experience_cost': group.get('experience_cost', 0.0),

                    'subtotal': round(group['subtotal'], 2),

                    'experience_subtotal': round(group.get('experience_subtotal', 0.0), 2)

                })

            

            # 加上底薪

            total_salary += base_salary

            

            # 加上经验（经验是总工资的一部分）

            total_salary += total_experience_cost

            

            # 加上激励（从数据库读取）

            incentive = hours.incentive if hours.incentive else 0.0

            total_salary += incentive

            

            # 转换为列表格式：学生姓名-课程名称: 时间1; 时间2; ...

            # 注意：只返回有已确认课程的记录，如果没有已确认的课程，则不返回该记录

            course_details = []

            for key, group in grouped_courses.items():

                times_str = '; '.join(group['times'])

                detail = f"{group['student_name']}-{group['course_name']}: {times_str}"

                course_details.append(detail)

            

            # 如果没有已确认的课程（course_details为空），则不返回该记录

            # 这样可以避免显示"0课时"和"暂无上课记录"的空分组

            if not course_details:
                # 但全职老师即使 0 课时，也需要结算底薪
                if employment_type == '全职' and base_salary > 0:
                    course_details = []
                else:
                    continue  # 跳过没有已确认课程的记录

            

            hours_dict['course_details'] = course_details

            hours_dict['total_salary'] = round(total_salary, 2)  # 总工资

            hours_dict['base_salary'] = base_salary  # 底薪（只有全职教师才有）

            hours_dict['employment_type'] = employment_type  # 雇佣类型

            hours_dict['experience_cost'] = round(total_experience_cost, 2)  # 经验

            hours_dict['course_salary'] = round(total_salary - base_salary - total_experience_cost - incentive, 2)  # 课时工资（不含底薪、经验和激励）

            hours_dict['incentive'] = incentive  # 激励

            hours_dict['remark'] = hours.remark if hours.remark else ''  # 备注

            hours_dict['is_settled'] = hours.is_settled if hours.is_settled is not None else False  # 结算状态

            hours_dict['settled_at'] = hours.settled_at.strftime('%Y-%m-%d %H:%M:%S') if hours.settled_at else None  # 结算时间

            hours_dict['calculation_details'] = calculation_details  # 计算明细

            result.append(hours_dict)

    

    except Exception as e:

        import traceback

        print(f'获取老师课时失败: {e}')

        traceback.print_exc()

        return jsonify({'error': str(e)}), 500

    

    return jsonify(result)






@bp.route('/api/teacher-hours/<int:hours_id>', methods=['PUT'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def update_teacher_hours_record(hours_id):

    """更新老师课时记录（激励和备注）"""

    hours = TeacherHours.query.get_or_404(hours_id)

    data = request.json

    

    if 'incentive' in data:

        hours.incentive = float(data.get('incentive', 0))

    if 'remark' in data:

        hours.remark = data.get('remark', '')

    

    db.session.commit()

    return jsonify(hours.to_dict())




@bp.route('/api/teacher-hours/settle', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def settle_teacher_hours():

    """结算确认老师课时（批量）"""

    try:

        data = request.json or {}

        hours_ids = data.get('hours_ids', [])

        is_settled = data.get('is_settled', True)  # 默认为确认结算

        

        if not hours_ids:

            return jsonify({'error': '请提供要结算的课时记录ID列表'}), 400

        

        # 批量更新结算状态

        updated_count = 0

        for hours_id in hours_ids:

            hours = TeacherHours.query.get(hours_id)

            if hours:

                hours.is_settled = is_settled

                if is_settled:

                    hours.settled_at = datetime.now()

                else:

                    hours.settled_at = None

                updated_count += 1

        

        db.session.commit()

        

        return jsonify({

            'message': f'成功{"确认结算" if is_settled else "取消结算"} {updated_count} 条记录',

            'updated_count': updated_count

        })

    except Exception as e:

        db.session.rollback()

        import traceback

        traceback.print_exc()

        return jsonify({'error': str(e)}), 500




@bp.route('/api/teacher-hours/recalculate', methods=['POST'])
@csrf.exempt  # JSON API 端点豁免 CSRF 检查
@login_required
def recalculate_teacher_hours():

    """重新计算指定月份的教师课时（只统计已确认的课程）"""

    try:

        data = request.json or {}

        month = data.get('month')

        

        if not month:

            return jsonify({'error': '请提供月份参数（格式：YYYY-MM）'}), 400

        

        # 获取该月份所有有排课的教师和课程组合

        year, month_num = map(int, month.split('-'))

        start_date = date(year, month_num, 1)

        end_date = date(year, month_num, calendar.monthrange(year, month_num)[1])

        

        # 获取所有在该月份有排课的教师-课程组合（只统计已确认的课程，过滤已删除的学生）
        from models import Student
        courses = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).filter(

            StudentCourse.course_date >= start_date,

            StudentCourse.course_date <= end_date,

            StudentCourse.status != '删除',

            StudentCourse.course_id.isnot(None),

            StudentCourse.is_confirmed == True,  # 只统计已确认的课程

            StudentCourse.marketing_lead_id.is_(None)

        ).distinct(StudentCourse.teacher_id, StudentCourse.course_id).all()

        

        # 收集需要更新的教师-课程组合

        teacher_course_pairs = set()

        for course in courses:

            teacher_course_pairs.add((course.teacher_id, course.course_id))

        

        # 重新计算每个教师-课程组合的课时

        updated_count = 0

        for teacher_id, course_id in teacher_course_pairs:

            update_teacher_hours(teacher_id, month, course_id)

            updated_count += 1

        

        # 对于没有已确认课程的教师-课程组合，将课时设为0

        # 获取该月份所有有排课记录的教师-课程组合（包括未确认的，过滤已删除的学生）
        all_courses = StudentCourse.query.join(Student, StudentCourse.student_id == Student.id).filter(

            StudentCourse.course_date >= start_date,

            StudentCourse.course_date <= end_date,

            StudentCourse.status != '删除',

            StudentCourse.course_id.isnot(None),

            StudentCourse.marketing_lead_id.is_(None)

        ).distinct(StudentCourse.teacher_id, StudentCourse.course_id).all()

        

        all_teacher_course_pairs = set()

        for course in all_courses:

            all_teacher_course_pairs.add((course.teacher_id, course.course_id))

        

        # 找出没有已确认课程的组合，将课时设为0

        zero_hours_pairs = all_teacher_course_pairs - teacher_course_pairs

        zeroed_count = 0

        for teacher_id, course_id in zero_hours_pairs:

            teacher_hours = TeacherHours.query.filter_by(

                teacher_id=teacher_id,

                course_id=course_id,

                month=month

            ).first()

            if teacher_hours and teacher_hours.total_hours > 0:

                teacher_hours.total_hours = 0.0

                zeroed_count += 1

        

        db.session.commit()

        

        return jsonify({

            'message': f'成功重新计算 {updated_count} 个教师-课程组合的课时，将 {zeroed_count} 个未确认课程的课时设为0',

            'updated_count': updated_count,

            'zeroed_count': zeroed_count,

            'month': month

        })

    except Exception as e:

        db.session.rollback()

        import traceback

        error_trace = traceback.format_exc()

        print(f"重新计算教师课时错误: {str(e)}")

        print(f"错误堆栈: {error_trace}")

        return jsonify({'error': f'重新计算失败: {str(e)}', 'details': error_trace}), 500






