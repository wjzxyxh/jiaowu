# 前后端分离改造说明

## 概述

本项目已完成前后端分离改造：
- **后端**: Flask RESTful API（端口5000）
- **前端**: React + Vite（端口3000）

## 后端改动

### 1. 添加CORS支持

- 安装 `Flask-CORS` 依赖
- 在 `extensions.py` 中初始化CORS
- 配置允许跨域请求（开发环境允许所有来源）

### 2. API端点保持不变

所有现有的 `/api/*` 端点保持不变，前端可以直接调用。

## 前端项目

### 技术栈

- React 18
- React Router 6（路由）
- Axios（HTTP客户端）
- React Query（数据获取和缓存）
- Vite（构建工具）

### 项目结构

```
frontend/
├── src/
│   ├── components/      # 通用组件（Layout等）
│   ├── pages/          # 页面组件
│   │   ├── Login.jsx   # 登录页
│   │   ├── Dashboard.jsx # 首页/仪表盘
│   │   ├── Students.jsx # 学生管理
│   │   └── ...         # 其他页面
│   ├── services/       # API服务层
│   │   ├── api.js      # Axios配置
│   │   ├── authService.js
│   │   └── studentService.js
│   ├── contexts/       # React Context
│   │   └── AuthContext.jsx # 认证上下文
│   ├── App.jsx         # 主应用组件
│   └── main.jsx        # 入口文件
```

## 启动项目

### 后端

```bash
# 安装依赖（如果还没有）
pip install -r requirements.txt

# 启动Flask后端
python app.py
# 或
FLASK_CONFIG=development python app.py
```

后端将在 http://localhost:5000 启动

### 前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端将在 http://localhost:3000 启动

## 开发配置

### 前端代理配置

前端通过 Vite 代理访问后端API：
- 开发环境：`/api/*` 请求会被代理到 `http://localhost:5000/api/*`
- 生产环境：需要配置 `VITE_API_BASE_URL` 环境变量

### CORS配置

后端已配置CORS，允许：
- 所有来源（开发环境）
- 支持携带Cookie（`withCredentials: true`）
- 支持常用HTTP方法（GET, POST, PUT, DELETE, OPTIONS）

## 已完成的功能

1. ✅ 认证系统（登录、登出、用户信息）
2. ✅ 首页仪表盘（统计数据展示）
3. ✅ 学生管理（列表、删除）
4. ✅ 基础布局和导航

## 待完成的功能

以下模块需要继续迁移到React：

- [ ] 学生管理（新增、编辑、上传照片）
- [ ] 教师管理
- [ ] 课程管理
- [ ] 排课管理
- [ ] 缴费管理
- [ ] 学生课时统计
- [ ] 财务统计
- [ ] 老师课时统计
- [ ] 课程表日历
- [ ] 通知中心
- [ ] 权限管理

## 迁移指南

### 1. 创建API服务

在 `frontend/src/services/` 下创建对应的服务文件，例如：

```javascript
// teacherService.js
import api from './api'

export const teacherService = {
  getTeachers: async (params) => {
    return api.get('/teachers', { params })
  },
  // ... 其他方法
}
```

### 2. 创建页面组件

在 `frontend/src/pages/` 下创建页面组件，使用React Query获取数据：

```javascript
import { useQuery } from '@tanstack/react-query'
import { teacherService } from '../services/teacherService'

const Teachers = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['teachers'],
    queryFn: () => teacherService.getTeachers(),
  })
  
  // ... 渲染逻辑
}
```

### 3. 添加路由

在 `App.jsx` 中添加新路由：

```javascript
<Route path="teachers" element={<Teachers />} />
```

## 注意事项

1. **认证**: 所有API请求会自动携带Cookie，后端通过Flask-Login验证
2. **错误处理**: API响应拦截器会自动处理401错误（会话失效）
3. **数据获取**: 使用React Query管理服务器状态，自动缓存和重新获取
4. **文件上传**: 使用FormData上传文件，注意设置正确的Content-Type

## 生产部署

### 前端构建

```bash
cd frontend
npm run build
```

构建产物在 `frontend/dist/` 目录

### 部署选项

1. **分离部署**: 
   - 前端：Nginx/静态服务器（端口80）
   - 后端：Flask应用（端口5000）

2. **统一部署**:
   - 前端构建后，将dist目录内容放到Flask的static目录
   - Flask提供静态文件服务
   - 配置路由，所有非API请求返回index.html

## 环境变量

### 前端

创建 `frontend/.env`:

```
VITE_API_BASE_URL=http://localhost:5000/api
```

### 后端

后端配置保持不变，参考 `config.py`
