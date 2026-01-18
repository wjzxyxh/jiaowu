# 测试指南

## 安装测试依赖

```bash
pip install pytest pytest-flask pytest-cov
```

或者安装所有依赖（包括测试依赖）：

```bash
pip install -r requirements.txt
```

## 运行测试

### 运行所有测试

```bash
pytest
```

### 运行特定测试文件

```bash
pytest tests/test_models.py
pytest tests/test_auth.py
```

### 运行特定测试函数

```bash
pytest tests/test_models.py::test_student_model
```

### 显示详细输出

```bash
pytest -v
```

### 显示打印输出

```bash
pytest -s
```

## 测试覆盖率

### 生成覆盖率报告

```bash
pytest --cov=. --cov-report=html
```

这会在 `htmlcov/` 目录下生成 HTML 格式的覆盖率报告。

### 查看覆盖率摘要

```bash
pytest --cov=. --cov-report=term-missing
```

## 测试结构

```
tests/
├── __init__.py          # 测试模块初始化
├── conftest.py          # pytest 配置和 fixtures
├── test_models.py       # 模型测试
├── test_auth.py         # 认证测试
└── ...                  # 其他测试文件
```

## 编写测试

### 基本测试示例

```python
def test_example(client):
    """测试示例"""
    response = client.get('/api/students')
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, list)
```

### 使用 fixtures

```python
def test_with_app(app):
    """使用 app fixture"""
    with app.app_context():
        # 测试代码
        pass
```

### 测试需要登录的端点

```python
def test_protected_endpoint(client, app):
    """测试需要登录的端点"""
    # 先登录
    with app.app_context():
        user = User(username='test', role='user')
        user.set_password('pass')
        db.session.add(user)
        db.session.commit()
    
    client.post('/api/login', json={'username': 'test', 'password': 'pass'})
    
    # 然后测试受保护的端点
    response = client.get('/api/students')
    assert response.status_code == 200
```

## 持续集成

可以在 CI/CD 配置中添加测试步骤：

```yaml
# .github/workflows/test.yml 示例
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Set up Python
        uses: actions/setup-python@v2
        with:
          python-version: 3.9
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
      - name: Run tests
        run: |
          pytest --cov=. --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

## 注意事项

1. 测试使用内存数据库（SQLite），不会影响开发数据库
2. 每个测试都是独立的，会自动清理数据
3. 测试数据在测试结束后会自动删除
4. 确保测试不会依赖外部服务（如 Redis、MySQL）

## 扩展测试

建议添加以下测试：

1. **API 端点测试** - 测试所有 API 端点的正常和异常情况
2. **权限测试** - 测试不同角色的权限控制
3. **业务逻辑测试** - 测试核心业务逻辑（如课时统计、财务计算）
4. **集成测试** - 测试多个模块的协作
5. **性能测试** - 测试大量数据下的性能
