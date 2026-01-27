#!/bin/bash
# 启动前端开发服务器

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "错误: 未找到 Node.js"
    echo ""
    echo "请先安装 Node.js:"
    echo "1. 运行安装脚本: ./install_nodejs.sh"
    echo "2. 或参考: frontend/INSTALL_NODEJS.md"
    exit 1
fi

echo "Node.js 版本: $(node --version)"
echo "npm 版本: $(npm --version)"
echo ""

cd frontend

# 检查node_modules是否存在
if [ ! -d "node_modules" ]; then
    echo "正在安装前端依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "依赖安装失败，请检查网络连接或使用国内镜像"
        echo "设置镜像: npm config set registry https://registry.npmmirror.com"
        exit 1
    fi
fi

echo "启动前端开发服务器..."
npm run dev
