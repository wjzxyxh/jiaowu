"""
日志工具函数
"""
import json
from flask import request
from flask_login import current_user
from extensions import db
from models import OperationLog


def get_client_ip():
    """获取客户端IP地址"""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0]
    return request.remote_addr or 'unknown'


def log_operation(module, operation, entity_type, entity_id=None, entity_name=None, old_data=None, new_data=None):
    """记录操作日志"""
    try:
        from flask_login import current_user
        user_id = current_user.id if current_user.is_authenticated else None
        username = current_user.username if current_user.is_authenticated else 'system'
        
        log = OperationLog(
            user_id=user_id,
            username=username,
            module=module,
            operation=operation,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            old_data=json.dumps(old_data, ensure_ascii=False) if old_data else None,
            new_data=json.dumps(new_data, ensure_ascii=False) if new_data else None,
            ip_address=get_client_ip()
        )
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        print(f'记录操作日志失败: {e}')
        db.session.rollback()
