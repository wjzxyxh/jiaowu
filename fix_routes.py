#!/usr/bin/env python3
"""
修复路由模块 - 从app_old.py正确提取路由
"""
import re
import os

def extract_route_function(lines, route_line_idx):
    """从指定行开始提取路由函数"""
    route_decorator = lines[route_line_idx]
    
    # 查找函数定义
    func_start = None
    func_name = None
    
    # 查找函数定义（可能在下一行或几行后）
    for j in range(route_line_idx + 1, min(route_line_idx + 10, len(lines))):
        func_match = re.match(r'^def (\w+)\(', lines[j])
        if func_match:
            func_name = func_match.group(1)
            func_start = j
            break
    
    if not func_name:
        return None
    
    # 提取函数体
    func_lines = [route_decorator]
    func_lines.append(lines[func_start])
    indent_level = len(lines[func_start]) - len(lines[func_start].lstrip())
    
    j = func_start + 1
    while j < len(lines):
        current_line = lines[j]
        
        # 检查是否是下一个顶级定义
        if current_line.strip():
            current_indent = len(current_line) - len(current_line.lstrip())
            if current_indent == 0:
                # 检查是否是新的路由或函数定义
                if (re.match(r'^@app\.route', current_line) or 
                    re.match(r'^def ', current_line) or
                    re.match(r'^with ', current_line) or
                    re.match(r'^if __name__', current_line) or
                    (re.match(r'^# =+', current_line) and j > func_start + 5)):
                    break
        
        func_lines.append(current_line)
        j += 1
    
    return {
        'name': func_name,
        'lines': func_lines
    }

def group_routes(routes):
    """将路由按功能分组"""
    groups = {
        'auth': [],
        'pages': [],
        'students': [],
        'teachers': [],
        'courses': [],
        'courses_manage': [],
        'payments': [],
        'finance': [],
        'stats': [],
        'teacher_hours': [],
        'calendar': [],
        'others': [],
        'export': [],
        'import': [],
        'charts': [],
        'users': [],
        'notifications': [],
        'dashboard': [],
        'debug': [],
    }
    
    for route in routes:
        path = route['path']
        
        if path in ['/login']:
            groups['auth'].append(route)
        elif path in ['/', '/students', '/teachers', '/courses', '/all_courses', 
                      '/payments', '/stats', '/finance', '/courses_manage', 
                      '/teacher_hours', '/others_manage', '/calendar']:
            groups['pages'].append(route)
        elif path.startswith('/api/login') or path.startswith('/api/logout') or path.startswith('/api/current-user'):
            groups['auth'].append(route)
        elif path.startswith('/api/students') or path == '/students':
            groups['students'].append(route)
        elif path.startswith('/api/teachers') or path == '/teachers':
            groups['teachers'].append(route)
        elif path.startswith('/api/courses') and not path.startswith('/api/courses_manage'):
            groups['courses'].append(route)
        elif path.startswith('/api/courses_manage') or path == '/courses_manage':
            groups['courses_manage'].append(route)
        elif path.startswith('/api/payments') or path == '/payments':
            groups['payments'].append(route)
        elif path.startswith('/api/finance') or path == '/finance':
            groups['finance'].append(route)
        elif path.startswith('/api/stats') or path == '/stats':
            groups['stats'].append(route)
        elif path.startswith('/api/teacher-hours') or path == '/teacher_hours':
            groups['teacher_hours'].append(route)
        elif path.startswith('/api/calendar') or path == '/calendar':
            groups['calendar'].append(route)
        elif path.startswith('/api/export'):
            groups['export'].append(route)
        elif path.startswith('/api/import'):
            groups['import'].append(route)
        elif path.startswith('/api/charts'):
            groups['charts'].append(route)
        elif path.startswith('/api/users') or path.startswith('/api/operation-logs'):
            groups['users'].append(route)
        elif path.startswith('/api/notifications'):
            groups['notifications'].append(route)
        elif path.startswith('/api/dashboard'):
            groups['dashboard'].append(route)
        elif path.startswith('/api/debug'):
            groups['debug'].append(route)
        elif path.startswith('/api/time-slots') or path.startswith('/api/classrooms') or \
             path.startswith('/api/teacher-course-costs') or path.startswith('/api/teacher-experience-costs') or \
             path == '/others_manage':
            groups['others'].append(route)
        else:
            groups['others'].append(route)
    
    return groups

def create_route_module(group_name, routes):
    """创建路由模块文件"""
    if not routes:
        return
    
    # 基础导入
    module_content = f'''"""
{group_name.replace('_', ' ').title()}路由模块
从app_old.py提取
"""
from flask import Blueprint, request, jsonify, render_template, send_from_directory, Response
from flask_login import login_required, current_user
from extensions import db, limiter
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

bp = Blueprint('{group_name}', __name__)

'''
    
    # 添加所有路由函数
    for route in routes:
        # 转换路由装饰器
        route_decorator = route['lines'][0] if route['lines'] else ''
        route_decorator = route_decorator.replace('@app.route', '@bp.route')
        
        # 添加函数体
        func_body = '\n'.join(route['lines'][1:])  # 跳过装饰器，已经在上面添加了
        
        # 替换app.config为Config
        func_body = func_body.replace('app.config[', 'Config.')
        func_body = func_body.replace("app.config['UPLOAD_FOLDER']", 'Config.UPLOAD_FOLDER')
        func_body = func_body.replace("app.config['MAX_CONTENT_LENGTH']", 'Config.MAX_CONTENT_LENGTH')
        
        module_content += route_decorator + '\n'
        module_content += func_body + '\n\n'
    
    # 写入文件
    filename = f'routes/{group_name}.py'
    os.makedirs('routes', exist_ok=True)
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(module_content)
    
    print(f"已创建 {filename}，包含 {len(routes)} 个路由")

if __name__ == '__main__':
    print("从app_old.py提取路由...")
    
    # 读取app_old.py
    with open('app_old.py', 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # 找到所有路由
    all_routes = []
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # 查找路由装饰器
        if '@app.route' in line:
            route_func = extract_route_function(lines, i)
            if route_func:
                route_path_match = re.search(r"@app\.route\(['\"]([^'\"]+)['\"]", line)
                if route_path_match:
                    route_path = route_path_match.group(1)
                    route_func['path'] = route_path
                    all_routes.append(route_func)
                    # 跳到函数结束
                    i = i + len(route_func['lines']) - 1
                else:
                    i += 1
            else:
                i += 1
        else:
            i += 1
    
    print(f"找到 {len(all_routes)} 个路由")
    
    # 分组
    groups = group_routes(all_routes)
    
    # 创建路由模块
    print("\n创建路由模块...")
    for group_name, group_routes in groups.items():
        if group_routes:
            create_route_module(group_name, group_routes)
            print(f"  - {group_name}: {len(group_routes)} 个路由")
    
    print("\n完成！")
