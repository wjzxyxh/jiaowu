"""
认证测试
"""
import pytest
from models import User
from extensions import db


def test_login_page(client):
    """测试登录页面"""
    response = client.get('/login')
    assert response.status_code == 200


def test_login_success(client, app):
    """测试成功登录"""
    with app.app_context():
        user = User(
            username='testuser',
            role='user'
        )
        user.set_password('testpass')
        db.session.add(user)
        db.session.commit()
    
    response = client.post('/api/login', 
                          json={'username': 'testuser', 'password': 'testpass'})
    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True
    assert 'user' in data


def test_login_failure(client, app):
    """测试登录失败"""
    with app.app_context():
        user = User(
            username='testuser',
            role='user'
        )
        user.set_password('testpass')
        db.session.add(user)
        db.session.commit()
    
    # 错误的密码
    response = client.post('/api/login',
                          json={'username': 'testuser', 'password': 'wrongpass'})
    assert response.status_code == 401
    
    # 不存在的用户
    response = client.post('/api/login',
                          json={'username': 'nonexist', 'password': 'pass'})
    assert response.status_code == 401


def test_logout(client):
    """测试登出"""
    response = client.post('/api/logout')
    assert response.status_code == 200
