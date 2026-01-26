"""
教务管理系统 Flask 应用（重构后）
应用工厂模式
"""
from flask import Flask, send_from_directory
from flask_login import login_required
import os
from config import config
from extensions import init_extensions, db
from database import run_migrations, init_default_data
from utils.logging_config import setup_logging
from utils.error_handlers import handle_api_errors

# 尝试导入 CORS（可选依赖）
try:
    from flask_cors import CORS
    CORS_AVAILABLE = True
except ImportError:
    CORS_AVAILABLE = False
    print("警告: flask-cors 未安装，跨域请求可能失败。运行 'pip install flask-cors' 安装。")


def create_app(config_name='default'):
    """
    应用工厂函数
    创建并配置Flask应用实例
    """
    app = Flask(__name__)
    
    # 加载配置
    config_class = config[config_name]
    app.config.from_object(config_class)
    
    # 设置日志
    setup_logging(app)
    
    # 生产环境检查SECRET_KEY
    if config_name == 'production':
        if not app.config.get('SECRET_KEY') or app.config['SECRET_KEY'] == 'change-me-in-production':
            raise ValueError("生产环境必须设置SECRET_KEY环境变量")
    
    # 确保上传目录存在
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # 初始化扩展
    init_extensions(app)
    
    # 启用 CORS 支持（开发环境，用于 UniApp 前端）
    if CORS_AVAILABLE:
        if config_name == 'default' or app.config.get('DEBUG'):
            CORS(app, resources={
                r"/api/*": {
                    "origins": "*",  # 开发环境允许所有来源
                    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                    "allow_headers": ["Content-Type", "Authorization"],
                    "supports_credentials": True
                }
            })
            app.logger.info('CORS 已启用（开发环境）')
    else:
        app.logger.warning('CORS 未启用，UniApp 前端可能无法访问 API')
    
    # 注册全局错误处理器
    handle_api_errors(app)
    
    # 注册蓝图
    from routes import blueprints
    for bp in blueprints:
        app.register_blueprint(bp)
    
    # 注册静态文件路由（安全版本，防止路径遍历）
    @app.route('/uploads/<path:filename>')
    @login_required
    def uploaded_file(filename):
        """安全地提供上传文件下载"""
        from flask import jsonify
        
        # 验证文件名，防止路径遍历
        if '..' in filename or filename.startswith('/'):
            return jsonify({'error': '非法文件名'}), 400
        
        # 确保文件在上传目录中
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(file_path):
            return jsonify({'error': '文件不存在'}), 404
        
        # 确保路径在上传目录内（防止路径遍历）
        real_path = os.path.realpath(file_path)
        upload_dir = os.path.realpath(app.config['UPLOAD_FOLDER'])
        if not real_path.startswith(upload_dir):
            return jsonify({'error': '非法文件路径'}), 403
        
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    
    # 初始化数据库
    with app.app_context():
        # 运行数据库迁移
        run_migrations()
        
        # 创建所有表
        db.create_all()
        
        # 初始化默认数据
        init_default_data()
    
    app.logger.info(f'应用初始化完成，配置: {config_name}')
    return app


def find_free_port(start_port=5000):
    """查找可用端口"""
    import socket
    port = start_port
    while True:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('', port))
                return port
        except OSError:
            port += 1
            if port > start_port + 100:
                raise Exception("无法找到可用端口")


if __name__ == '__main__':
    # 从环境变量获取配置名称，默认为default
    config_name = os.environ.get('FLASK_CONFIG', 'default')
    app = create_app(config_name)
    
    # 确保debug模式启用
    app.config['DEBUG'] = True
    
    # 优先使用环境变量指定的端口，否则使用默认端口80
    if 'PORT' in os.environ:
        port = int(os.environ.get('PORT'))
    else:
        port = 80
        print(f'使用端口: {port}')
    
    print(f'教务管理系统启动成功！')
    print(f'Debug模式: 已启用')
    print(f'访问地址: http://localhost:{port}')
    app.run(debug=True, host='0.0.0.0', port=port, use_reloader=True)
