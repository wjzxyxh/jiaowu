#!/usr/bin/env python3
"""
自动提取app.py中的路由并创建路由模块
"""
import re
import os

def extract_routes_from_app():
    """从app.py中提取所有路由函数"""
    with open('app.py', 'r', encoding='utf-8') as f:
        content = f.read()
        lines = content.split('\n')
    
    routes = []
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # 查找路由装饰器
        route_match = re.match(r'^@app\.route\([\'"]([^\'"]+)[\'"],?\s*methods=\[([^\]]+)\]\)', line)
        if not route_match:
            route_match = re.match(r'^@app\.route\([\'"]([^\'"]+)[\'"]\)', line)
        
        if route_match:
            route_path = route_match.group(1)
            methods = route_match.group(2) if len(route_match.groups()) > 1 else "['GET']"
            
            # 查找对应的函数定义
            func_start = i
            func_name = None
            func_lines = []
            
            # 查找函数定义（可能在下一行或几行后）
            j = i + 1
            while j < len(lines) and j < i + 10:
                func_match = re.match(r'^def (\w+)\(', lines[j])
                if func_match:
                    func_name = func_match.group(1)
                    func_start = j
                    break
                j += 1
            
            if func_name:
                # 提取函数体
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
                                re.match(r'^if __name__', current_line)):
                                break
                    
                    func_lines.append(current_line)
                    j += 1
                
                routes.append({
                    'path': route_path,
                    'methods': methods,
                    'name': func_name,
                    'lines': func_lines,
                    'start_line': func_start
                })
            
            i = j
        else:
            i += 1
    
    return routes, lines

def group_routes(routes):
    """将路由按功能分组"""
    groups = {
        'pages': [],  # 页面路由
        'students': [],
        'teachers': [],
        'courses': [],
        'courses_manage': [],
        'payments': [],
        'finance': [],
        'stats': [],
        'teacher_hours': [],
        'calendar': [],
        'others': [],  # 时段、教室、成本等
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
        
        if path in ['/', '/login']:
            groups['pages'].append(route)
        elif path.startswith('/students') or path == '/students':
            groups['students'].append(route)
        elif path.startswith('/teachers') or path == '/teachers':
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
        elif path in ['/all_courses']:
            groups['courses'].append(route)
        elif path.startswith('/api/time-slots') or path.startswith('/api/classrooms') or \
             path.startswith('/api/teacher-course-costs') or path.startswith('/api/teacher-experience-costs') or \
             path == '/others_manage':
            groups['others'].append(route)
        else:
            # 其他页面路由
            if not path.startswith('/api/'):
                groups['pages'].append(route)
            else:
                groups['others'].append(route)
    
    return groups

def create_route_module(group_name, routes, all_lines):
    """创建路由模块文件"""
    if not routes:
        return
    
    module_content = f'''"""
{group_name.replace('_', ' ').title()}路由模块
从app.py自动提取
"""
from flask import Blueprint, request, jsonify, render_template, send_from_directory, Response
from flask_login import login_required, current_user
from extensions import db, limiter
from models import *
from utils import *
from services import *
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
        func_body = '\n'.join(route['lines'])
        # 替换app.config为Config
        func_body = func_body.replace('app.config[', 'Config.')
        func_body = func_body.replace("app.config['UPLOAD_FOLDER']", 'Config.UPLOAD_FOLDER')
        
        module_content += route_decorator + '\n'
        module_content += func_body + '\n\n'
    
    # 写入文件
    filename = f'routes/{group_name}.py'
    os.makedirs('routes', exist_ok=True)
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(module_content)
    
    print(f"已创建 {filename}，包含 {len(routes)} 个路由")

if __name__ == '__main__':
    print("开始提取路由...")
    routes, all_lines = extract_routes_from_app()
    print(f"找到 {len(routes)} 个路由")
    
    print("\n按功能分组...")
    groups = group_routes(routes)
    
    print("\n创建路由模块...")
    for group_name, group_routes in groups.items():
        if group_routes:
            create_route_module(group_name, group_routes, all_lines)
            print(f"  - {group_name}: {len(group_routes)} 个路由")
    
    print("\n完成！")
