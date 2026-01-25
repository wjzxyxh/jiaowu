# 项目结构说明

## 目录结构

```
uniapp-frontend/
├── pages/                      # 页面目录
│   ├── login/                  # 登录页面
│   │   └── login.vue
│   ├── index/                  # 首页
│   │   └── index.vue
│   ├── students/               # 学生管理
│   │   └── students.vue
│   ├── teachers/               # 教师管理（待开发）
│   │   └── teachers.vue
│   ├── courses/                # 排课管理（待开发）
│   │   └── courses.vue
│   ├── courses-manage/         # 课程管理（待开发）
│   │   └── courses-manage.vue
│   ├── payments/               # 缴费管理（待开发）
│   │   └── payments.vue
│   ├── finance/                # 财务统计（待开发）
│   │   └── finance.vue
│   ├── stats/                  # 学生课时（待开发）
│   │   └── stats.vue
│   ├── teacher-hours/          # 老师课时（待开发）
│   │   └── teacher-hours.vue
│   ├── calendar/               # 课程表日历
│   │   └── calendar.vue
│   ├── others/                 # 其它管理（待开发）
│   │   └── others.vue
│   └── profile/                # 个人设置
│       └── profile.vue
│
├── utils/                      # 工具函数目录
│   ├── api.js                  # API请求封装
│   ├── storage.js              # 本地存储工具
│   └── common.js               # 通用工具函数
│
├── static/                     # 静态资源目录
│   └── tabbar/                 # TabBar图标
│       └── README.md           # 图标说明
│
├── App.vue                     # 应用根组件
├── main.js                     # 入口文件
├── pages.json                  # 页面路由配置
├── manifest.json               # 应用配置文件
├── uni.scss                    # 全局样式变量
├── .gitignore                  # Git忽略文件
├── README.md                   # 项目说明文档
└── PROJECT_STRUCTURE.md        # 项目结构说明（本文件）
```

## 文件说明

### 核心配置文件

- **manifest.json**: UniApp 应用配置，包括应用名称、版本、权限等
- **pages.json**: 页面路由配置，定义所有页面路径和样式
- **main.js**: 应用入口文件，初始化 Vue 应用
- **App.vue**: 应用根组件，全局样式和生命周期

### 工具函数

- **utils/api.js**: 
  - 封装所有 API 请求
  - 统一处理请求拦截、响应拦截
  - 统一错误处理和会话管理
  
- **utils/storage.js**: 
  - 封装本地存储操作
  - Token 管理
  - 用户信息管理
  
- **utils/common.js**: 
  - 日期格式化函数
  - 角色名称映射
  - 防抖节流函数

### 页面说明

#### 已实现功能

1. **登录页面** (`pages/login/login.vue`)
   - 用户登录
   - 自动跳转已登录用户

2. **首页** (`pages/index/index.vue`)
   - 用户信息展示
   - 功能模块网格
   - 通知中心
   - 权限控制

3. **学生管理** (`pages/students/students.vue`)
   - 学生列表展示
   - 搜索功能
   - 新增/编辑学生
   - 删除学生（待实现）

4. **个人设置** (`pages/profile/profile.vue`)
   - 修改个人信息
   - 修改密码
   - 退出登录

5. **课程表日历** (`pages/calendar/calendar.vue`)
   - 课程列表展示
   - 日期筛选

#### 待开发页面

- 教师管理
- 排课管理
- 课程管理
- 缴费管理
- 财务统计
- 学生课时统计
- 老师课时统计
- 其它管理

## 开发指南

### 添加新页面

1. 在 `pages/` 目录下创建页面文件夹
2. 创建 `.vue` 文件
3. 在 `pages.json` 中添加页面配置
4. 在 `utils/api.js` 中添加对应的 API 方法（如需要）

### 添加新 API

在 `utils/api.js` 中添加新的 API 方法：

```javascript
newApiMethod: (params) => request({
    url: '/api/new-endpoint',
    method: 'GET',
    data: params
})
```

### 样式规范

- 使用 `uni.scss` 中定义的全局变量
- 使用 rpx 单位（响应式像素）
- 遵循设计规范（主题色：#667eea）

## 注意事项

1. **API 地址配置**: 修改 `utils/api.js` 中的 `BASE_URL`
2. **跨域问题**: 确保后端配置了 CORS
3. **Token 管理**: 根据后端认证方式调整 token 存储和传递方式
4. **TabBar 图标**: 需要添加实际的图标文件到 `static/tabbar/` 目录

## 下一步开发计划

1. 完善各个功能页面的实现
2. 添加更多公共组件
3. 优化用户体验和交互
4. 添加错误处理和加载状态
5. 添加数据缓存机制
6. 优化性能和打包体积
