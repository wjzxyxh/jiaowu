# 教务管理系统前端

基于 React + Vite 的前端应用

## 安装依赖

```bash
npm install
# 或
yarn install
# 或
pnpm install
```

## 开发

```bash
npm run dev
```

前端将在 http://localhost:3000 启动

## 构建

```bash
npm run build
```

## 配置

后端API地址可以通过环境变量 `VITE_API_BASE_URL` 配置，默认为 `/api`（使用代理）

## 项目结构

```
frontend/
├── src/
│   ├── components/     # 通用组件
│   ├── pages/          # 页面组件
│   ├── services/       # API服务
│   ├── contexts/       # React Context
│   ├── utils/          # 工具函数
│   ├── App.jsx         # 主应用组件
│   └── main.jsx        # 入口文件
├── public/             # 静态资源
└── package.json
```
