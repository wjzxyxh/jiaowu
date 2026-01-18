"""
文件验证工具
提供文件内容验证（MIME类型检查）
"""
import os
from config import Config

# 允许的MIME类型映射
ALLOWED_MIME_TYPES = {
    # 图片
    'image/jpeg': {'jpg', 'jpeg'},
    'image/png': {'png'},
    'image/gif': {'gif'},
    # 文档
    'application/pdf': {'pdf'},
    'application/msword': {'doc'},  # .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {'docx'},  # .docx
    'text/plain': {'txt'},
}

# 扩展名到MIME类型的映射（备用）
EXTENSION_MIME_MAP = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain',
}


def validate_file_mime_type(file_storage, allowed_extensions=None):
    """
    验证文件的MIME类型
    
    参数:
        file_storage: Werkzeug FileStorage 对象
        allowed_extensions: 允许的扩展名集合，如果不提供则使用Config.ALLOWED_EXTENSIONS
    
    返回:
        (is_valid, error_message): (是否有效, 错误消息)
    """
    if not file_storage or not file_storage.filename:
        return True, None  # 没有文件，视为有效（可选字段）
    
    if allowed_extensions is None:
        allowed_extensions = Config.ALLOWED_EXTENSIONS
    
    # 检查扩展名
    filename = file_storage.filename
    if '.' not in filename:
        return False, '文件必须包含扩展名'
    
    ext = filename.rsplit('.', 1)[1].lower()
    if ext not in allowed_extensions:
        return False, f'不支持的文件类型：{ext}'
    
    # 尝试使用python-magic检查真实的MIME类型（如果可用）
    try:
        import magic
        # 读取文件内容
        file_content = file_storage.read()
        file_storage.seek(0)  # 重置文件指针
        
        # 检查文件大小
        file_size = len(file_content)
        if file_size > Config.MAX_CONTENT_LENGTH:
            return False, f'文件大小超过限制（最大{Config.MAX_CONTENT_LENGTH // (1024*1024)}MB）'
        
        # 获取真实的MIME类型
        mime_type = magic.from_buffer(file_content, mime=True)
        
        # 验证MIME类型是否允许
        if mime_type not in ALLOWED_MIME_TYPES:
            return False, f'不支持的文件类型（MIME: {mime_type}）'
        
        # 验证扩展名和MIME类型是否匹配
        allowed_exts_for_mime = ALLOWED_MIME_TYPES.get(mime_type, set())
        if ext not in allowed_exts_for_mime:
            # MIME类型和扩展名不匹配，可能被篡改
            expected_ext = list(allowed_exts_for_mime)[0] if allowed_exts_for_mime else 'unknown'
            return False, f'文件类型不匹配：扩展名为{ext}，但文件内容为{mime_type}（应为{expected_ext}）'
        
        return True, None
    
    except ImportError:
        # python-magic未安装，使用备用方法
        # 仅检查Content-Type头（不够安全，但比没有好）
        content_type = file_storage.content_type
        if content_type:
            # 验证Content-Type是否在允许的列表中
            if content_type in ALLOWED_MIME_TYPES:
                allowed_exts_for_mime = ALLOWED_MIME_TYPES[content_type]
                if ext not in allowed_exts_for_mime:
                    return False, f'文件类型不匹配：扩展名为{ext}，但Content-Type为{content_type}'
                return True, None
            else:
                # Content-Type不在允许列表中，但可能是误报（某些浏览器可能发送错误的Content-Type）
                # 这种情况下，我们只检查扩展名
                pass
        
        # 如果没有python-magic，只检查扩展名（不够安全）
        # 建议安装python-magic: pip install python-magic
        # 或者使用替代方案: pip install python-magic-bin (Windows)
        return True, None


def validate_file_size(file_storage):
    """验证文件大小"""
    if not file_storage:
        return True, None
    
    # 注意：Werkzeug的FileStorage在读取前不知道大小
    # 实际大小检查由Flask的MAX_CONTENT_LENGTH处理
    # 这里只做基本检查
    return True, None
