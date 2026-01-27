"""
财务计算服务
"""
import calendar
from datetime import date
from extensions import db
from models import FinanceConfig, Payment, ClassHoursStats, TeacherHours, Teacher, StudentCourse, TeacherCourseCost, TeacherExperienceCost
from sqlalchemy.orm import joinedload
from utils.date_utils import get_current_month


def get_finance_config(key, default_value):
    """获取财务配置值"""
    config = FinanceConfig.query.filter_by(key=key).first()
    return config.value if config else default_value


def calculate_remaining_hours_from_payments(student_id, course_id, month=None):
    """从缴费记录计算剩余课时（只由缴费记录计算，按课程，过滤已删除的学生）"""
    if month is None:
        month = get_current_month()
    
    # 检查学生是否存在
    from models import Student
    student = Student.query.get(student_id)
    if not student:
        return 0  # 如果学生已被删除，返回0
    
    # 获取指定课程的所有缴费记录（按时间顺序，从早到晚）
    all_payments = Payment.query.join(Student, Payment.student_id == Student.id).filter(
        Payment.student_id == student_id,
        Payment.course_id == course_id
    ).order_by(
        Payment.payment_date.asc(),
        Payment.id.asc()
    ).all()
    
    # 计算总课时：缴费增加，退费减少
    total_hours = 0
    for payment in all_payments:
        if payment.type == '缴费':
            total_hours += payment.class_count
        elif payment.type == '退费':
            total_hours -= payment.class_count
    
    return total_hours


def calculate_actual_unit_price(student_id, consumed_hours, month, course_id=None):
    """
    计算学生的实际单价（按缴费顺序消耗课时，按课程）
    
    参数:
        student_id: 学生ID
        consumed_hours: 当月消耗的课时数
        month: 月份字符串，格式：YYYY-MM
        course_id: 课程ID（可选，如果提供则只计算该课程的缴费记录）
    
    返回:
        (实际单价, 明细列表) 元组
    """
    if consumed_hours <= 0:
        return (0.0, [])
    
    # 获取当月开始和结束日期
    year, month_num = map(int, month.split('-'))
    month_start = date(year, month_num, 1)
    month_end = date(year, month_num, calendar.monthrange(year, month_num)[1])
    
    # 获取当月开始时的剩余课时（不包括当月新缴费，按课程）
    if month_num == 1:
        last_month = f"{year-1}-12"
    else:
        last_month = f"{year}-{month_num-1:02d}"
    
    if course_id:
        last_stats = ClassHoursStats.query.filter_by(
            student_id=student_id,
            course_id=course_id,
            month=last_month
        ).first()
    else:
        last_stats = ClassHoursStats.query.filter_by(
            student_id=student_id,
            month=last_month
        ).first()
    remaining_hours_at_start = last_stats.current_month_total if last_stats else 0
    
    # 检查学生是否存在
    from models import Student
    student = Student.query.get(student_id)
    if not student:
        return (0.0, [])  # 如果学生已被删除，返回0
    
    # 获取学生的所有缴费和退费记录（按时间顺序，从早到晚，按课程，过滤已删除的学生）
    payment_query = Payment.query.join(Student, Payment.student_id == Student.id).filter(
        Payment.student_id == student_id,
        Payment.payment_date <= month_end
    )
    if course_id:
        payment_query = payment_query.filter(Payment.course_id == course_id)
    
    all_payments = payment_query.order_by(
        Payment.payment_date.asc(),
        Payment.id.asc()
    ).all()
    
    # 分离当月开始之前和当月的缴费记录
    payments_before_month = [p for p in all_payments if p.payment_date < month_start]
    payments_in_month = [p for p in all_payments if p.payment_date >= month_start and p.payment_date <= month_end]
    
    payments_before_month.sort(key=lambda p: (p.payment_date, p.id))
    payments_in_month.sort(key=lambda p: (p.payment_date, p.id))
    
    # 构建缴费记录栈（FIFO：先进先出）
    payment_stacks = []
    for payment in payments_before_month:
        if payment.type == '缴费' and payment.class_count > 0:
            payment_stacks.append({
                'payment': payment,
                'hours': payment.class_count,
                'unit_price': payment.unit_price if payment.unit_price else 0.0
            })
        elif payment.type == '退费' and payment.class_count > 0:
            refund_hours = payment.class_count
            for stack in payment_stacks:
                if stack['hours'] > 0 and refund_hours > 0:
                    deduct = min(stack['hours'], refund_hours)
                    stack['hours'] -= deduct
                    refund_hours -= deduct
                    if refund_hours <= 0:
                        break
    
    # 计算当月开始时每个缴费记录的剩余课时
    total_available_hours = sum(stack['hours'] for stack in payment_stacks)
    total_consumed_before_month = total_available_hours - remaining_hours_at_start
    
    cumulative_consumed = 0
    for stack in payment_stacks:
        if cumulative_consumed >= total_consumed_before_month:
            stack['remaining_hours'] = stack['hours']
        else:
            available_from_this = stack['hours']
            consumed_from_this = min(available_from_this, total_consumed_before_month - cumulative_consumed)
            stack['remaining_hours'] = available_from_this - consumed_from_this
            cumulative_consumed += consumed_from_this
    
    # 添加当月的新缴费记录到栈中
    for payment in payments_in_month:
        if payment.type == '缴费' and payment.class_count > 0:
            payment_stacks.append({
                'payment': payment,
                'hours': payment.class_count,
                'unit_price': payment.unit_price if payment.unit_price else 0.0,
                'remaining_hours': payment.class_count
            })
        elif payment.type == '退费' and payment.class_count > 0:
            refund_hours = payment.class_count
            for stack in payment_stacks:
                remaining = stack.get('remaining_hours', 0)
                if remaining > 0 and refund_hours > 0:
                    deduct = min(remaining, refund_hours)
                    stack['remaining_hours'] = remaining - deduct
                    refund_hours -= deduct
                    if refund_hours <= 0:
                        break
    
    # 按时间顺序消耗当月课时，计算实际单价
    detail_list = []
    remaining_consumed = consumed_hours
    total_revenue = 0.0
    
    for stack in payment_stacks:
        if remaining_consumed <= 0:
            break
        
        remaining_hours = stack.get('remaining_hours', 0)
        
        if remaining_hours > 0 and stack['unit_price'] > 0:
            hours_from_this_payment = min(remaining_hours, remaining_consumed)
            revenue_from_this = hours_from_this_payment * stack['unit_price']
            
            detail_list.append({
                'payment_date': stack['payment'].payment_date.strftime('%Y-%m-%d') if stack['payment'].payment_date else '',
                'hours': round(hours_from_this_payment, 2),
                'unit_price': round(stack['unit_price'], 2),
                'revenue': round(revenue_from_this, 2)
            })
            
            total_revenue += revenue_from_this
            remaining_consumed -= hours_from_this_payment
            stack['remaining_hours'] = remaining_hours - hours_from_this_payment
    
    # 如果还有未消耗完的课时，使用最近一次缴费的单价（过滤已删除的学生）
    if remaining_consumed > 0:
        from models import Student
        latest_payment_query = Payment.query.join(Student, Payment.student_id == Student.id).filter(
            Payment.student_id == student_id,
            Payment.type == '缴费'
        )
        if course_id:
            latest_payment_query = latest_payment_query.filter(Payment.course_id == course_id)
        latest_payment = latest_payment_query.order_by(
            Payment.payment_date.desc()
        ).first()
        if latest_payment and latest_payment.unit_price:
            unit_price = latest_payment.unit_price
            revenue_from_latest = remaining_consumed * unit_price
            detail_list.append({
                'payment_date': latest_payment.payment_date.strftime('%Y-%m-%d') if latest_payment.payment_date else '',
                'hours': round(remaining_consumed, 2),
                'unit_price': round(unit_price, 2),
                'revenue': round(revenue_from_latest, 2)
            })
            total_revenue += revenue_from_latest
    
    # 计算加权平均单价
    actual_unit_price = total_revenue / consumed_hours if consumed_hours > 0 else 0.0
    
    return (round(actual_unit_price, 2), detail_list)


def update_finance_record(month=None):
    """更新收支表"""
    if month is None:
        month = get_current_month()
    
    year, month_num = map(int, month.split('-'))
    start_date = date(year, month_num, 1)
    end_date = date(year, month_num, calendar.monthrange(year, month_num)[1])
    
    from models import FinanceRecord
    # 获取或创建财务记录
    finance = FinanceRecord.query.filter_by(month=month).first()
    if not finance:
        finance = FinanceRecord(month=month)
        db.session.add(finance)
    
    # 确保revenue_mode有默认值
    if not finance.revenue_mode:
        finance.revenue_mode = '课耗模式'
    
    # 根据计算模式计算当月收入
    monthly_revenue = 0
    
    if finance.revenue_mode == '缴费模式':
        # 缴费模式：收入 = 当月缴费总额 - 当月退费总额（过滤已删除的学生）
        from models import Student
        payments = Payment.query.join(Student, Payment.student_id == Student.id).filter(
            Payment.payment_date >= start_date,
            Payment.payment_date <= end_date
        ).all()
        
        for payment in payments:
            if payment.type == '缴费':
                monthly_revenue += payment.paid_amount
            elif payment.type == '退费':
                monthly_revenue -= payment.paid_amount
    else:
        # 课耗模式：收入 = 当月课耗 * 实际单价（按缴费顺序消耗课时，按课程，过滤已删除的学生）
        from models import Student
        stats_list = ClassHoursStats.query.join(Student, ClassHoursStats.student_id == Student.id).filter(ClassHoursStats.month == month).all()
        
        for stats in stats_list:
            if stats.actual_hours > 0:
                # 计算实际单价（按课程）
                actual_unit_price, _ = calculate_actual_unit_price(
                    stats.student_id, 
                    stats.actual_hours, 
                    month,
                    stats.course_id
                )
                monthly_revenue += stats.actual_hours * actual_unit_price
    
    finance.monthly_revenue = monthly_revenue
    
    # 计算老师工资
    teacher_cost = 0
    teacher_hours_list = TeacherHours.query.filter_by(month=month).all()
    
    for th in teacher_hours_list:
        teacher = db.session.get(Teacher, th.teacher_id)
        if teacher:
            employment_type = teacher.employment_type if teacher.employment_type else '兼职'
            if employment_type not in ['兼职', '全职']:
                continue
            
            # 获取底薪（仅全职教师）
            if employment_type == '全职':
                base_salary = getattr(th, 'base_salary', None) or (teacher.base_salary if teacher else 0.0)
            else:
                base_salary = 0.0
            
            incentive = getattr(th, 'incentive', None) or 0.0
            
            # 获取该老师当月的课程（只统计已确认的课程）
            courses = StudentCourse.query.options(
                joinedload(StudentCourse.course)
            ).filter(
                StudentCourse.teacher_id == th.teacher_id,
                StudentCourse.course_date >= start_date,
                StudentCourse.course_date <= end_date,
                StudentCourse.status != '删除',
                StudentCourse.is_confirmed == True
            ).all()
            
            # 获取教师的所有课程成本配置
            teacher_costs = TeacherCourseCost.query.filter_by(teacher_id=th.teacher_id).all()
            cost_map = {cost.course_id: cost.cost_per_class for cost in teacher_costs}
            
            # 获取教师的所有经验成本配置
            teacher_experience_costs = TeacherExperienceCost.query.filter_by(teacher_id=th.teacher_id).all()
            experience_cost_map_by_student = {}
            experience_cost_map_by_course = {}
            
            for cost in teacher_experience_costs:
                if cost.student_id:
                    key = (cost.course_id, cost.student_id)
                    if key not in experience_cost_map_by_student:
                        experience_cost_map_by_student[key] = []
                    experience_cost_map_by_student[key].append(cost)
                else:
                    if cost.course_id not in experience_cost_map_by_course:
                        experience_cost_map_by_course[cost.course_id] = []
                    experience_cost_map_by_course[cost.course_id].append(cost)
            
            # 计算该老师的课时成本和经验
            course_cost = 0.0
            experience_cost = 0.0
            for course in courses:
                course_id = course.course_id if course.course_id and course.course else None
                course_date = course.course_date
                course_year_month = course_date.strftime('%Y-%m')
                
                if course.status == '正常':
                    if course_id and course_id in cost_map:
                        course_cost += cost_map[course_id]
                    
                    # 计算经验
                    if course_id:
                        student_key = (course_id, course.student_id)
                        matched_experience_cost = None
                        
                        # 优先匹配"教师-课程-学生"
                        if student_key in experience_cost_map_by_student:
                            for cost_record in experience_cost_map_by_student[student_key]:
                                if cost_record.start_date:
                                    start_year_month = cost_record.start_date.strftime('%Y-%m')
                                    if course_year_month < start_year_month:
                                        continue
                                if cost_record.end_date:
                                    end_year_month = cost_record.end_date.strftime('%Y-%m')
                                    if course_year_month > end_year_month:
                                        continue
                                matched_experience_cost = cost_record
                                break
                            
                            if not matched_experience_cost:
                                for cost_record in experience_cost_map_by_student[student_key]:
                                    if not cost_record.start_date and not cost_record.end_date:
                                        matched_experience_cost = cost_record
                                        break
                        
                        # 如果没有匹配到"教师-课程-学生"，则使用"教师-课程"
                        if not matched_experience_cost and course_id in experience_cost_map_by_course:
                            for cost_record in experience_cost_map_by_course[course_id]:
                                if cost_record.start_date:
                                    start_year_month = cost_record.start_date.strftime('%Y-%m')
                                    if course_year_month < start_year_month:
                                        continue
                                if cost_record.end_date:
                                    end_year_month = cost_record.end_date.strftime('%Y-%m')
                                    if course_year_month > end_year_month:
                                        continue
                                matched_experience_cost = cost_record
                                break
                            
                            if not matched_experience_cost:
                                for cost_record in experience_cost_map_by_course[course_id]:
                                    if not cost_record.start_date and not cost_record.end_date:
                                        matched_experience_cost = cost_record
                                        break
                        
                        if matched_experience_cost:
                            experience_cost += matched_experience_cost.experience_cost
                            
                elif course.status == '跑空':
                    if course_id and course_id in cost_map:
                        course_cost += cost_map[course_id] * 0.5
                    
                    # 计算经验（跑空也算0.5）
                    if course_id:
                        student_key = (course_id, course.student_id)
                        matched_experience_cost = None
                        
                        if student_key in experience_cost_map_by_student:
                            for cost_record in experience_cost_map_by_student[student_key]:
                                if cost_record.start_date:
                                    start_year_month = cost_record.start_date.strftime('%Y-%m')
                                    if course_year_month < start_year_month:
                                        continue
                                if cost_record.end_date:
                                    end_year_month = cost_record.end_date.strftime('%Y-%m')
                                    if course_year_month > end_year_month:
                                        continue
                                matched_experience_cost = cost_record
                                break
                            
                            if not matched_experience_cost:
                                for cost_record in experience_cost_map_by_student[student_key]:
                                    if not cost_record.start_date and not cost_record.end_date:
                                        matched_experience_cost = cost_record
                                        break
                        
                        if not matched_experience_cost and course_id in experience_cost_map_by_course:
                            for cost_record in experience_cost_map_by_course[course_id]:
                                if cost_record.start_date:
                                    start_year_month = cost_record.start_date.strftime('%Y-%m')
                                    if course_year_month < start_year_month:
                                        continue
                                if cost_record.end_date:
                                    end_year_month = cost_record.end_date.strftime('%Y-%m')
                                    if course_year_month > end_year_month:
                                        continue
                                matched_experience_cost = cost_record
                                break
                            
                            if not matched_experience_cost:
                                for cost_record in experience_cost_map_by_course[course_id]:
                                    if not cost_record.start_date and not cost_record.end_date:
                                        matched_experience_cost = cost_record
                                        break
                        
                        if matched_experience_cost:
                            experience_cost += matched_experience_cost.experience_cost * 0.5
            
            # 总工资 = 课时成本 + 底薪 + 经验 + 激励
            teacher_total = course_cost + base_salary + experience_cost + incentive
            teacher_cost += teacher_total
    
    finance.teacher_cost = teacher_cost
    
    # 营销成本 = 营销 + 教务
    finance.marketing_cost = finance.marketing_flyer + finance.marketing_labor
    
    # 房租水电 = 房租 + 水电
    finance.rent_utilities = finance.rent + finance.utilities
    
    # 其它成本 = 打印纸 + 打印粉
    finance.other_cost = finance.other_paper + finance.other_toner
    
    # 当月利润 = 当月收入 - 老师成本 - 营销成本 - 房租水电 - 其它成本
    finance.monthly_profit = (finance.monthly_revenue - finance.teacher_cost - 
                             finance.marketing_cost - finance.rent_utilities - finance.other_cost)
    
    db.session.commit()
