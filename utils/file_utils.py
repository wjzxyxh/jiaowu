"""
文件处理工具函数
"""
import os
import uuid
from werkzeug.utils import secure_filename
from config import Config


def allowed_file(filename):
    """检查文件扩展名是否允许"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS


def get_original_filename(file_storage):
    """获取原始文件名，支持中文"""
    if not file_storage or not file_storage.filename:
        return None
    # Flask/Werkzeug 会自动处理 Content-Disposition 头中的文件名编码
    # 如果文件名是 RFC 2231 编码的（如 filename*=UTF-8''...），会自动解码
    return file_storage.filename


def get_safe_storage_filename(original_filename):
    """获取安全的存储文件名，处理中文文件名"""
    if not original_filename:
        return None
    
    # 获取文件扩展名
    ext = ''
    if '.' in original_filename:
        ext = os.path.splitext(original_filename)[1]
    
    # 使用secure_filename处理，如果结果为空（纯中文），使用UUID
    safe_name = secure_filename(original_filename)
    if not safe_name:
        safe_name = f"{uuid.uuid4().hex}{ext}"
    elif not safe_name.endswith(ext):
        # 确保扩展名被保留
        safe_name = safe_name + ext
    
    return safe_name
