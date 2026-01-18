"""
模型测试
"""
import pytest
from datetime import datetime, date
from models import Student, Teacher, Course, User
from extensions import db


def test_student_model(app):
    """测试学生模型"""
    with app.app_context():
        student = Student(
            name='测试学生',
            grade='一年级',
            status='在校',
            phone='13800138000'
        )
        db.session.add(student)
        db.session.commit()
        
        assert student.id is not None
        assert student.name == '测试学生'
        assert student.created_at is not None
        
        # 测试 to_dict 方法
        student_dict = student.to_dict()
        assert student_dict['name'] == '测试学生'
        assert 'id' in student_dict


def test_teacher_model(app):
    """测试教师模型"""
    with app.app_context():
        teacher = Teacher(
            name='测试教师',
            subject='数学',
            phone='13800138001',
            base_salary=5000.0,
            cost_per_class=100.0
        )
        db.session.add(teacher)
        db.session.commit()
        
        assert teacher.id is not None
        assert teacher.name == '测试教师'
        assert teacher.base_salary == 5000.0


def test_user_password(app):
    """测试用户密码功能"""
    with app.app_context():
        user = User(
            username='testuser',
            role='user'
        )
        user.set_password('testpass123')
        db.session.add(user)
        db.session.commit()
        
        assert user.check_password('testpass123')
        assert not user.check_password('wrongpass')
        
        # 测试权限方法
        assert user.can_edit()
        assert not user.is_admin()
        
        # 测试只读用户
        readonly_user = User(
            username='readonly',
            role='readonly'
        )
        readonly_user.set_password('pass')
        assert not readonly_user.can_edit()
