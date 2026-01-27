# Node.js 安装指南

## 快速安装（推荐）

运行项目根目录的安装脚本：

```bash
cd /tmp/pycharm_project_231
chmod +x install_nodejs.sh
./install_nodejs.sh
```

## 手动安装方式

### 方式1：使用 NodeSource 仓库（推荐）

```bash
# 添加 NodeSource 仓库
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -

# 安装 Node.js
yum install -y nodejs
```

### 方式2：使用系统包管理器

```bash
# Alibaba Cloud Linux / CentOS / RHEL
yum install -y nodejs npm

# 或者使用 dnf
dnf install -y nodejs npm
```

### 方式3：使用 NVM（推荐用于开发环境）

```bash
# 安装 NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重新加载 shell 配置
source ~/.bashrc

# 安装 Node.js LTS 版本
nvm install --lts
nvm use --lts
nvm alias default node
```

## 验证安装

```bash
node --version
npm --version
```

应该显示版本号，例如：
- Node.js: v20.x.x
- npm: 10.x.x

## 安装前端依赖

安装 Node.js 后，运行：

```bash
cd frontend
npm install
```

## 常见问题

### 1. 权限问题

如果遇到权限错误，可以使用：
```bash
npm install --unsafe-perm=true --allow-root
```

### 2. 网络问题（中国）

如果下载慢，可以使用淘宝镜像：
```bash
npm config set registry https://registry.npmmirror.com
```

### 3. 版本要求

- Node.js: >= 16.0.0
- npm: >= 8.0.0

推荐使用 Node.js 20 LTS 版本。
