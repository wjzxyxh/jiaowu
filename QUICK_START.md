# 快速开始

## 一键安装 Node.js

如果遇到 `npm: command not found` 错误，运行：

```bash
./quick_install_nodejs.sh
```

这个脚本会自动安装 Node.js 20.x 和 npm。

## 完整启动流程

### 1. 安装 Node.js（如果还没有）

```bash
./quick_install_nodejs.sh
```

### 2. 安装后端依赖

```bash
pip3 install -r requirements.txt
```

### 3. 安装前端依赖

```bash
cd frontend
npm install

# 如果下载慢，使用国内镜像
npm config set registry https://registry.npmmirror.com
npm install
```

### 4. 启动项目

**终端1 - 启动后端：**
```bash
./start_backend.sh
# 或
python3 app.py
```

**终端2 - 启动前端：**
```bash
./start_frontend.sh
# 或
cd frontend
npm run dev
```

### 5. 访问应用

- 前端：http://localhost:3000
- 后端API：http://localhost:5000/api

## 常见问题

### npm 命令未找到

运行：
```bash
./quick_install_nodejs.sh
```

### npm 安装慢

使用国内镜像：
```bash
npm config set registry https://registry.npmmirror.com
```

### Python 命令问题

使用 `python3` 而不是 `python`：
```bash
python3 app.py
```
