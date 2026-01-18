"""
日期工具函数
"""
from datetime import datetime


def get_current_month():
    """获取当前月份字符串"""
    return datetime.now().strftime('%Y-%m')


def get_weekday(date_str):
    """根据日期获取星期"""
    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
    weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    return weekdays[date_obj.weekday()]
