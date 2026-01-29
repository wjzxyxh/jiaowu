"""
课时统计服务
"""
import calendar
from datetime import date
from extensions import db
from models import Student, Course, StudentCourse, ClassHoursStats, Payment, TeacherHours, Teacher
from utils.date_utils import get_current_month
from .finance_service import calculate_remaining_hours_from_payments


def update_class_hours_stats(student_id, month=None, course_id=None):
    """更新课时统计表（按课程）"""
    if month is None:
        month = get_current_month()
    
    student = db.session.get(Student, student_id)
    if not student:
        return
    
    year, month_num = map(int, month.split('-'))
    start_date = date(year, month_num, 1)
    end_date = date(year, month_num, calendar.monthrange(year, month_num)[1])
    
    # 如果指定了course_id，只更新该课程的统计；否则更新所有课程的统计
    if course_id:
        course_ids = [course_id]
    else:
        # 获取学生当月所有有排课的课程ID
        courses = StudentCourse.query.filter(
            StudentCourse.student_id == student_id,
            StudentCourse.course_date >= start_date,
            StudentCourse.course_date <= end_date,
            StudentCourse.status != '删除',
            StudentCourse.course_id.isnot(None)
        ).distinct(StudentCourse.course_id).all()
        course_ids = [c.course_id for c in courses if c.course_id]
        
        # 同时获取学生有缴费记录的课程
        payments = Payment.query.filter_by(student_id=student_id).distinct(Payment.course_id).all()
        payment_course_ids = [p.course_id for p in payments if p.course_id]
        course_ids = list(set(course_ids + payment_course_ids))
    
    # 为每个课程分别统计
    for cid in course_ids:
        course = db.session.get(Course, cid)
        if not course:
            continue
        
        # 获取或创建课时统计记录
        stats = ClassHoursStats.query.filter_by(
            student_id=student_id,
            course_id=cid,
            month=month
        ).first()
        
        if not stats:
            # 获取上个月的累计课时
            if month_num == 1:
                last_month = f"{year-1}-12"
            else:
                last_month = f"{year}-{month_num-1:02d}"
            last_stats = ClassHoursStats.query.filter_by(
                student_id=student_id,
                course_id=cid,
                month=last_month
            ).first()
            last_month_total = last_stats.current_month_total if last_stats else 0
            
            stats = ClassHoursStats(
                student_id=student_id,
                student_name=student.name,
                course_id=cid,
                course_name=course.name,
                month=month,
                last_month_total=last_month_total
            )
            db.session.add(stats)
            try:
                db.session.flush()
            except Exception:
                db.session.rollback()
                stats = ClassHoursStats.query.filter_by(
                    student_id=student_id,
                    course_id=cid,
                    month=month
                ).first()
                if not stats:
                    raise
        
        # 计算当月原始课时（来自学生课程表，只统计该课程的，且只统计已确认的）
        original_count = StudentCourse.query.filter(
            StudentCourse.student_id == student_id,
            StudentCourse.course_id == cid,
            StudentCourse.course_date >= start_date,
            StudentCourse.course_date <= end_date,
            StudentCourse.status != '删除',
            StudentCourse.is_confirmed == True
        ).count()
        
        stats.original_hours = original_count
        
        # 计算当月实际课时（只统计该课程的，且只统计已确认的）
        # 课时计算规则：
        # - 正常上课：+1课时
        # - 跑空：+0.5课时
        # - 请假：+0课时（不计入实际课时）
        course_records = StudentCourse.query.filter(
            StudentCourse.student_id == student_id,
            StudentCourse.course_id == cid,
            StudentCourse.course_date >= start_date,
            StudentCourse.course_date <= end_date,
            StudentCourse.status != '删除',
            StudentCourse.is_confirmed == True
        ).all()

        actual_hours = 0
        for course_record in course_records:
            if course_record.status == '正常':
                actual_hours += 1
            elif course_record.status == '请假':
                actual_hours += 0  # 请假不计入实际课时
            elif course_record.status == '跑空':
                actual_hours += 0.5
            else:
                # 记录未知状态的课程（调试用）
                print(f"警告: 未知课程状态 '{course_record.status}' 在学生 {student_id} 的课程 {cid} 中，日期 {course_record.course_date}")
        
        if stats.actual_hours == 0 and actual_hours == 0:
            stats.actual_hours = stats.original_hours
        else:
            stats.actual_hours = actual_hours
        
        # 计算本月累计课时
        stats.current_month_total = stats.last_month_total + stats.actual_hours
        
        # 从缴费记录计算总缴费课时，然后减去已消耗课时得到剩余课时（按课程）
        total_paid_hours = calculate_remaining_hours_from_payments(student_id, cid, month)
        stats.remaining_hours = total_paid_hours - stats.actual_hours
    
    db.session.commit()


def update_teacher_hours(teacher_id, month=None, course_id=None):
    """更新老师课时表（按课程）"""
    if month is None:
        month = get_current_month()
    
    teacher = db.session.get(Teacher, teacher_id)
    if not teacher:
        return
    
    year, month_num = map(int, month.split('-'))
    start_date = date(year, month_num, 1)
    end_date = date(year, month_num, calendar.monthrange(year, month_num)[1])
    
    # 如果指定了course_id，只更新该课程的统计；否则更新所有课程的统计
    if course_id:
        course_ids = [course_id]
    else:
        # 获取老师当月所有有排课的课程ID（只统计已确认的课程）
        courses = StudentCourse.query.filter(
            StudentCourse.teacher_id == teacher_id,
            StudentCourse.course_date >= start_date,
            StudentCourse.course_date <= end_date,
            StudentCourse.status != '删除',
            StudentCourse.course_id.isnot(None),
            StudentCourse.is_confirmed == True
        ).distinct(StudentCourse.course_id).all()
        course_ids = [c.course_id for c in courses if c.course_id]
    
    # 为每个课程分别统计
    for cid in course_ids:
        course = db.session.get(Course, cid)
        if not course:
            continue
        
        # 统计老师当月该课程的课时（只统计已确认的）
        normal_count = StudentCourse.query.filter(
            StudentCourse.teacher_id == teacher_id,
            StudentCourse.course_id == cid,
            StudentCourse.course_date >= start_date,
            StudentCourse.course_date <= end_date,
            StudentCourse.status != '删除',
            StudentCourse.status != '请假',
            StudentCourse.is_confirmed == True
        ).count()
        
        # 跑空算0.5课时（只统计已确认的）
        empty_count = StudentCourse.query.filter(
            StudentCourse.teacher_id == teacher_id,
            StudentCourse.course_id == cid,
            StudentCourse.course_date >= start_date,
            StudentCourse.course_date <= end_date,
            StudentCourse.status == '跑空',
            StudentCourse.is_confirmed == True
        ).count()
        
        total_hours = normal_count + empty_count * 0.5
        
        teacher_hours = TeacherHours.query.filter_by(
            teacher_id=teacher_id,
            course_id=cid,
            month=month
        ).first()
        
        if not teacher_hours:
            teacher_hours = TeacherHours(
                teacher_id=teacher_id,
                teacher_name=teacher.name,
                course_id=cid,
                course_name=course.name,
                month=month,
                total_hours=total_hours
            )
            db.session.add(teacher_hours)
        else:
            teacher_hours.total_hours = total_hours
    
    db.session.commit()
