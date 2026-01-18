"""
路由模块
统一导出所有蓝图
"""
from .auth import bp as auth_bp
from .pages import bp as pages_bp
from .students import bp as students_bp
from .teachers import bp as teachers_bp
from .courses import bp as courses_bp
from .courses_manage import bp as courses_manage_bp
from .payments import bp as payments_bp
from .finance import bp as finance_bp
from .stats import bp as stats_bp
from .teacher_hours import bp as teacher_hours_bp
from .calendar import bp as calendar_bp
from .others import bp as others_bp
from .export import bp as export_bp
from .import_data import bp as import_bp
from .charts import bp as charts_bp
from .users import bp as users_bp
from .notifications import bp as notifications_bp
from .dashboard import bp as dashboard_bp
from .debug import bp as debug_bp
from .permissions import bp as permissions_bp

# 所有蓝图列表
blueprints = [
    auth_bp,
    pages_bp,
    students_bp,
    teachers_bp,
    courses_bp,
    courses_manage_bp,
    payments_bp,
    finance_bp,
    stats_bp,
    teacher_hours_bp,
    calendar_bp,
    others_bp,
    export_bp,
    import_bp,
    charts_bp,
    users_bp,
    notifications_bp,
    dashboard_bp,
    debug_bp,
    permissions_bp,
]

__all__ = ['blueprints']
