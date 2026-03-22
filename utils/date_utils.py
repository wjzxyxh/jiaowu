"""
日期工具函数
"""
from datetime import date, datetime, timedelta


def month_calendar_week_end_date(month_yyyy_mm: str, week_num: int) -> date:
    """
    与 /api/courses 按周筛选一致：某自然月第 week 周（从该月第一个周一起）的结束日（周日）。
    month_yyyy_mm: 'YYYY-MM'，week_num: 1-based。
    """
    year, month_num = map(int, month_yyyy_mm.split('-'))
    w = int(week_num)
    first_day = date(year, month_num, 1)
    offset = (7 - first_day.weekday()) % 7
    first_monday = first_day + timedelta(days=offset)
    start_date = first_monday + timedelta(weeks=w - 1)
    return start_date + timedelta(days=6)


def get_current_month():
    """获取当前月份字符串"""
    return datetime.now().strftime('%Y-%m')


def get_weekday(date_str):
    """根据日期获取星期"""
    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
    weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    return weekdays[date_obj.weekday()]
