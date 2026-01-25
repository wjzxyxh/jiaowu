# 教务管理系统 - UniApp 移动端

这是教务管理系统的 UniApp 移动端版本，与后端 Flask API 完全独立，可以单独开发和部署。

## 项目结构

```
uniapp-frontend/
├── pages/              # 页面目录
│   ├── login/         # 登录页
│   ├── index/         # 首页
│   ├── students/      # 学生管理
│   ├── teachers/      # 教师管理
│   ├── courses/       # 排课管理
│   ├── courses-manage/# 课程管理
│   ├── payments/      # 缴费管理
│   ├── finance/       # 财务统计
│   ├── stats/         # 学生课时
│   ├── teacher-hours/ # 老师课时
│   ├── calendar/      # 课程表日历
│   ├── others/        # 其它管理
│   └── profile/       # 个人设置
├── utils/             # 工具函数
│   ├── api.js        # API请求封装
│   ├── storage.js    # 本地存储工具
│   └── common.js     # 通用工具函数
├── static/            # 静态资源
├── App.vue           # 应用根组件
├── main.js           # 入口文件
├── pages.json        # 页面配置
├── manifest.json     # 应用配置
└── uni.scss          # 全局样式变量
```

## 功能特性

### 已实现功能

- ✅ 用户登录/登出
- ✅ 首页功能模块展示
- ✅ 学生管理（列表、新增、编辑）
- ✅ 个人设置（修改信息、修改密码）
- ✅ 课程表日历查看
- ✅ 通知中心
- ✅ 权限管理（根据用户权限显示功能模块）

### 待开发功能

- ⏳ 教师管理
- ⏳ 排课管理
- ⏳ 课程管理
- ⏳ 缴费管理
- ⏳ 财务统计
- ⏳ 学生课时统计
- ⏳ 老师课时统计
- ⏳ 其它管理（时段、教室等）

## 开发环境配置

### 1. 安装 HBuilderX

下载并安装 [HBuilderX](https://www.dcloud.io/hbuilderx.html)

### 2. 导入项目

1. 打开 HBuilderX
2. 文件 -> 导入 -> 从本地目录导入
3. 选择 `uniapp-frontend` 文件夹

### 3. 配置 API 地址

编辑 `utils/api.js` 文件，修改 `BASE_URL`：

```javascript
const BASE_URL = 'http://localhost:80'  // 开发环境
// const BASE_URL = 'https://your-domain.com'  // 生产环境
```

### 4. 运行项目

- **H5**: 运行 -> 运行到浏览器 -> Chrome
- **微信小程序**: 运行 -> 运行到小程序模拟器 -> 微信开发者工具
- **App**: 运行 -> 运行到手机或模拟器

## API 接口说明

所有 API 接口封装在 `utils/api.js` 中，包括：

- 认证相关：登录、登出、获取当前用户
- 学生管理：获取、创建、更新、删除学生
- 教师管理：获取、创建、更新、删除教师
- 课程管理：获取、创建、更新、删除课程
- 缴费管理：获取、创建、删除缴费记录
- 财务统计：获取财务数据、更新财务记录
- 通知管理：获取通知、标记已读等

## 注意事项

### 1. 跨域问题

如果后端 API 和前端运行在不同端口，需要配置后端允许跨域：

```python
# Flask 后端需要添加 CORS 支持
from flask_cors import CORS
CORS(app)
```

### 2. Token 认证

当前实现使用 localStorage 存储 token，实际使用时可能需要根据后端认证方式调整：

- 如果使用 Cookie 认证，需要配置 `withCredentials: true`
- 如果使用 JWT，需要在请求头中添加 `Authorization: Bearer {token}`

### 3. 微信小程序配置

如果发布微信小程序，需要：

1. 在微信公众平台配置服务器域名
2. 修改 `manifest.json` 中的 `appid`
3. 配置合法域名白名单

### 4. App 打包

打包 App 时需要：

1. 配置 `manifest.json` 中的应用信息
2. 配置应用图标和启动页
3. 配置应用权限

## 开发规范

### 代码风格

- 使用 Vue 3 Composition API（可选）
- 使用 scss 编写样式
- 遵循 uni-app 开发规范

### 命名规范

- 页面文件：小写字母，使用连字符（如 `courses-manage.vue`）
- 组件文件：PascalCase（如 `UserCard.vue`）
- 工具函数：camelCase（如 `formatDate`）

### 目录结构

- `pages/`: 页面文件
- `components/`: 公共组件（如有）
- `utils/`: 工具函数
- `static/`: 静态资源

## 部署说明

### H5 部署

1. 运行 -> 发行 -> H5
2. 将生成的 `dist/build/h5` 目录部署到 Web 服务器

### 微信小程序部署

1. 运行 -> 发行 -> 小程序-微信
2. 使用微信开发者工具上传代码

### App 打包

1. 运行 -> 发行 -> 原生 App-云打包
2. 或使用本地打包工具

## 更新日志

### v1.0.0 (2026-01-25)

- 初始版本
- 实现登录、首页、学生管理、个人设置等基础功能
- 完成 API 封装和工具函数

## 联系方式

如有问题，请联系开发团队。
