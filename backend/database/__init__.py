"""
数据库相关模块
"""
from .migrations import run_migrations
from .init_data import init_default_data

__all__ = ['run_migrations', 'init_default_data']
