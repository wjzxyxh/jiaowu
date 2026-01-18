"""
日志配置模块
"""
import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path


def setup_logging(app):
    """配置应用日志
    
    配置不同级别的日志输出：
    - 控制台输出：INFO 及以上级别
    - 文件输出：DEBUG 及以上级别（开发环境）或 INFO 及以上级别（生产环境）
    """
    # 确定日志目录：使用项目根目录下的 logs 目录
    # __file__ 是 utils/logging_config.py，parent.parent 就是项目根目录
    try:
        log_dir = Path(__file__).parent.parent / 'logs'
    except Exception:
        # 如果出错，尝试使用当前工作目录
        log_dir = Path.cwd() / 'logs'
    
    # 创建日志目录（如果不存在）
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
    except (OSError, PermissionError) as e:
        # 如果无法创建日志目录，只使用控制台输出
        app.logger.warning(f'无法创建日志目录 {log_dir}: {e}，将只使用控制台输出')
        log_dir = None
    
    # 获取日志级别
    log_level = os.environ.get('LOG_LEVEL', 'INFO' if not app.debug else 'DEBUG')
    log_level = getattr(logging, log_level.upper(), logging.INFO)
    
    # 配置根日志记录器
    app.logger.setLevel(log_level)
    
    # 如果已经有处理器，先清除（避免重复）
    if app.logger.handlers:
        app.logger.handlers.clear()
    
    # 控制台处理器
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_handler.setFormatter(console_formatter)
    app.logger.addHandler(console_handler)
    
    # 文件处理器（轮转日志）- 仅在日志目录可用时添加
    if log_dir:
        try:
            file_handler = RotatingFileHandler(
                str(log_dir / 'app.log'),
                maxBytes=10 * 1024 * 1024,  # 10MB
                backupCount=10
            )
            file_handler.setLevel(log_level)
            file_formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(pathname)s:%(lineno)d - %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            file_handler.setFormatter(file_formatter)
            app.logger.addHandler(file_handler)
            
            # 错误日志文件（只记录 ERROR 及以上）
            error_handler = RotatingFileHandler(
                str(log_dir / 'error.log'),
                maxBytes=10 * 1024 * 1024,  # 10MB
                backupCount=10
            )
            error_handler.setLevel(logging.ERROR)
            error_handler.setFormatter(file_formatter)
            app.logger.addHandler(error_handler)
        except (OSError, PermissionError) as e:
            app.logger.warning(f'无法创建日志文件: {e}，将只使用控制台输出')
    
    # 设置第三方库的日志级别
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
    
    app.logger.info('日志系统初始化完成')
