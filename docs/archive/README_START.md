# 快速启动指南

## 前置要求

### 1. Python 3.9+
```bash
python3 --version
```

如果未安装，请先安装 Python 3。

### 2. Node.js 16+ 和 npm
```bash
node --version
npm --version
```

如果未安装，运行：
```bash
./install_nodejs.sh
```

或参考 `frontend/INSTALL_NODEJS.md`

## 问题解决

### Python 问题
如果遇到 `python3.9: command not found` 错误，请使用 `python3` 命令。

## 启动步骤

### 1. 安装依赖

**后端依赖：**
```bash
pip3 install -r requirements.txt
```

如果遇到权限问题，可以使用：
```bash
pip3 install --user -r requirements.txt
```

**前端依赖：**
```bash
# 首先确保已安装 Node.js（见前置要求）
cd frontend
npm install

# 如果下载慢，可以使用国内镜像
npm config set registry https://registry.npmmirror.com
npm install
```

### 2. 启动后端

**方式1：使用启动脚本**
```bash
./start_backend.sh
```

**方式2：直接使用python3**
```bash
python3 app.py
```

后端将在 http://localhost:5000 启动

### 3. 启动前端

**方式1：使用启动脚本**
```bash
./start_frontend.sh
```

**方式2：手动启动**
```bash
cd frontend
npm run dev
```

前端将在 http://localhost:3000 启动

## 常见问题

### Python命令问题

如果系统中有多个Python版本：
- 使用 `python3` 而不是 `python`
- 或者创建别名：`alias python=python3`

### 端口占用

如果5000端口被占用，可以设置环境变量：
```bash
PORT=5001 python3 app.py
```

然后更新前端的 `vite.config.js` 中的代理端口。

### 依赖安装问题

**Python依赖：**
如果pip安装失败，可以尝试：
```bash
pip3 install --trusted-host mirrors.cloud.aliyuncs.com -r requirements.txt
```

**Node.js依赖：**
如果npm安装失败：
1. 检查网络连接
2. 使用国内镜像：
   ```bash
   npm config set registry https://registry.npmmirror.com
   npm install
   ```
3. 清除缓存：
   ```bash
   npm cache clean --force
   npm install
   ```

## 验证安装

启动后端后，访问 http://localhost:5000/api/current-user 应该返回401（未登录），这说明API正常工作。

启动前端后，访问 http://localhost:3000 应该看到登录页面。
