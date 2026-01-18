"""
通知服务
"""
from datetime import date, timedelta
from extensions import db
from models import Notification, FinanceConfig, ClassHoursStats, StudentCourse


def create_notification(user_id, notification_type, title, content, link=None):
    """创建通知"""
    try:
        notification = Notification(
            user_id=user_id,
            type=notification_type,
            title=title,
            content=content,
            link=link
        )
        db.session.add(notification)
        db.session.commit()
        return notification
    except Exception as e:
        print(f'创建通知失败: {e}')
        db.session.rollback()
        return None


def check_and_create_notifications():
    """检查并创建通知（课时不足、未确认课程等）"""
    try:
        # 检查课时不足的学生
        min_hours = FinanceConfig.query.filter_by(key='min_hours_for_reminder').first()
        if min_hours and min_hours.value > 0:
            low_hours_stats = ClassHoursStats.query.filter(
                ClassHoursStats.remaining_hours < min_hours.value,
                ClassHoursStats.remaining_hours >= 0
            ).all()
            
            for stat in low_hours_stats:
                # 检查是否已有未读通知
                existing = Notification.query.filter_by(
                    user_id=None,  # 所有用户
                    type='hours',
                    is_read=False,
                    content=f"学生 {stat.student_name} 的课程 {stat.course_name} 剩余课时不足（{stat.remaining_hours}）"
                ).first()
                
                if not existing:
                    create_notification(
                        user_id=None,
                        notification_type='hours',
                        title='课时不足提醒',
                        content=f"学生 {stat.student_name} 的课程 {stat.course_name} 剩余课时不足（{stat.remaining_hours}），请及时缴费！",
                        link=f'/stats?student_id={stat.student_id}'
                    )
        
        # 检查未确认的课程（今天和明天的）
        today = date.today()
        tomorrow = today + timedelta(days=1)
        unconfirmed_courses = StudentCourse.query.filter(
            StudentCourse.is_confirmed == False,
            StudentCourse.status == '正常',
            StudentCourse.course_date >= today,
            StudentCourse.course_date <= tomorrow
        ).all()
        
        for course in unconfirmed_courses:
            existing = Notification.query.filter_by(
                user_id=None,
                type='course',
                is_read=False,
                content=f"课程 {course.course_date.strftime('%Y-%m-%d')} {course.student_name} - {course.course_name or course.subject} 未确认"
            ).first()
            
            if not existing:
                create_notification(
                    user_id=None,
                    notification_type='course',
                    title='未确认课程提醒',
                    content=f"课程 {course.course_date.strftime('%Y-%m-%d')} {course.student_name} - {course.course_name or course.subject} 未确认上课",
                    link=f'/courses?date={course.course_date}'
                )
    except Exception as e:
        print(f'检查通知失败: {e}')
