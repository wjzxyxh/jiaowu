"""
课程相关工具函数
"""
from datetime import date
from models import StudentCourse
from sqlalchemy.orm import joinedload


def check_course_conflicts(course_date, time_slot, teacher_id, classroom, student_id, exclude_course_id=None):
    """
    检查课程冲突
    
    参数:
        course_date: 课程日期 (date对象)
        time_slot: 时段字符串 (如 "8:10-9:30")
        teacher_id: 教师ID
        classroom: 教室名称 (如 "A1")
        student_id: 学生ID
        exclude_course_id: 排除的课程ID（用于更新时排除自己）
    
    返回:
        dict: {
            'has_conflict': bool,
            'conflicts': [
                {
                    'type': 'teacher'|'classroom'|'student',
                    'message': str,
                    'conflicting_course': dict
                }
            ]
        }
    """
    conflicts = []
    
    # 查询条件：同一日期、相同时段、状态不是"删除"
    # 使用joinedload加载关联的course对象，避免N+1查询问题
    base_query = StudentCourse.query.options(
        joinedload(StudentCourse.course)
    ).filter(
        StudentCourse.course_date == course_date,
        StudentCourse.time_slot == time_slot,
        StudentCourse.status != '删除'
    )
    
    # 如果提供了时段，才检查冲突（时段为空时不检查）
    if time_slot:
        # 1. 检查教师时间冲突
        teacher_conflicts = base_query.filter(
            StudentCourse.teacher_id == teacher_id
        )
        if exclude_course_id:
            teacher_conflicts = teacher_conflicts.filter(StudentCourse.id != exclude_course_id)
        
        teacher_conflict = teacher_conflicts.first()
        if teacher_conflict:
            # 获取课程名称（通过关联的course对象或使用subject）
            course_name = None
            if teacher_conflict.course_id and teacher_conflict.course:
                course_name = teacher_conflict.course.name
            elif teacher_conflict.subject:
                course_name = teacher_conflict.subject
            
            conflicts.append({
                'type': 'teacher',
                'message': f'教师 {teacher_conflict.teacher_name} 在 {course_date.strftime("%Y-%m-%d")} {time_slot} 已有其他课程：{teacher_conflict.student_name} - {course_name or teacher_conflict.subject}',
                'conflicting_course': teacher_conflict.to_dict()
            })
        
        # 2. 检查教室时间冲突（如果提供了教室）
        if classroom:
            classroom_conflicts = base_query.filter(
                StudentCourse.classroom == classroom
            )
            if exclude_course_id:
                classroom_conflicts = classroom_conflicts.filter(StudentCourse.id != exclude_course_id)
            
            classroom_conflict = classroom_conflicts.first()
            if classroom_conflict:
                # 获取课程名称（通过关联的course对象或使用subject）
                course_name = None
                if classroom_conflict.course_id and classroom_conflict.course:
                    course_name = classroom_conflict.course.name
                elif classroom_conflict.subject:
                    course_name = classroom_conflict.subject
                
                conflicts.append({
                    'type': 'classroom',
                    'message': f'教室 {classroom} 在 {course_date.strftime("%Y-%m-%d")} {time_slot} 已被占用：{classroom_conflict.student_name} - {course_name or classroom_conflict.subject}（教师：{classroom_conflict.teacher_name}）',
                    'conflicting_course': classroom_conflict.to_dict()
                })
        
        # 3. 检查学生时间冲突
        student_conflicts = base_query.filter(
            StudentCourse.student_id == student_id
        )
        if exclude_course_id:
            student_conflicts = student_conflicts.filter(StudentCourse.id != exclude_course_id)
        
        student_conflict = student_conflicts.first()
        if student_conflict:
            # 获取课程名称（通过关联的course对象或使用subject）
            course_name = None
            if student_conflict.course_id and student_conflict.course:
                course_name = student_conflict.course.name
            elif student_conflict.subject:
                course_name = student_conflict.subject
            
            conflicts.append({
                'type': 'student',
                'message': f'学生 {student_conflict.student_name} 在 {course_date.strftime("%Y-%m-%d")} {time_slot} 已有其他课程：{course_name or student_conflict.subject}（教师：{student_conflict.teacher_name}）',
                'conflicting_course': student_conflict.to_dict()
            })
    
    return {
        'has_conflict': len(conflicts) > 0,
        'conflicts': conflicts
    }
