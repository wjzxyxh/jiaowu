#!/bin/bash
# 快速安装 Node.js（非交互式）

set -e

echo "=========================================="
echo "快速安装 Node.js 20.x"
echo "=========================================="

# 检查是否已安装
if command -v node &> /dev/null && command -v npm &> /dev/null; then
    echo "✓ Node.js 已安装:"
    echo "  Node.js: $(node --version)"
    echo "  npm: $(npm --version)"
    exit 0
fi

echo "正在安装 Node.js..."

# 使用 NodeSource 仓库安装
echo "1. 添加 NodeSource 仓库..."
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - > /dev/null 2>&1

echo "2. 安装 Node.js..."
yum install -y nodejs > /dev/null 2>&1

# 验证安装
if command -v node &> /dev/null && command -v npm &> /dev/null; then
    echo ""
    echo "=========================================="
    echo "✓ 安装成功！"
    echo "=========================================="
    echo "Node.js: $(node --version)"
    echo "npm: $(npm --version)"
    echo ""
    echo "下一步："
    echo "  cd frontend"
    echo "  npm install"
    echo "  npm run dev"
else
    echo ""
    echo "=========================================="
    echo "✗ 安装失败"
    echo "=========================================="
    echo "请手动安装 Node.js，参考: frontend/INSTALL_NODEJS.md"
    exit 1
fi
