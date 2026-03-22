#!/bin/bash
# 安装 Node.js 和 npm

set -e

echo "=========================================="
echo "Node.js 安装脚本"
echo "=========================================="

# 检查是否已安装
if command -v node &> /dev/null && command -v npm &> /dev/null; then
    echo "Node.js 已安装:"
    node --version
    npm --version
    exit 0
fi

echo "开始安装 Node.js..."

# 检测系统类型
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
else
    echo "无法检测系统类型"
    exit 1
fi

echo "检测到系统: $OS $VER"

# 使用 NodeSource 仓库安装（推荐方式）
install_nodejs_nodesource() {
    echo "使用 NodeSource 仓库安装 Node.js 20.x..."
    
    # 下载并运行 NodeSource 安装脚本
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    
    # 安装 Node.js
    if command -v yum &> /dev/null; then
        yum install -y nodejs
    elif command -v dnf &> /dev/null; then
        dnf install -y nodejs
    else
        echo "未找到 yum 或 dnf 包管理器"
        return 1
    fi
}

# 使用包管理器安装（备用方式）
install_nodejs_package_manager() {
    echo "使用系统包管理器安装 Node.js..."
    
    if command -v yum &> /dev/null; then
        yum install -y nodejs npm
    elif command -v dnf &> /dev/null; then
        dnf install -y nodejs npm
    elif command -v apt-get &> /dev/null; then
        apt-get update
        apt-get install -y nodejs npm
    else
        echo "未找到支持的包管理器"
        return 1
    fi
}

# 使用 NVM 安装（最灵活的方式）
install_nodejs_nvm() {
    echo "使用 NVM 安装 Node.js..."
    
    # 安装 NVM
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    
    # 加载 NVM
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    # 安装 Node.js LTS
    nvm install --lts
    nvm use --lts
    nvm alias default node
}

# 尝试安装
echo ""
echo "选择安装方式:"
echo "1) NodeSource 仓库（推荐，版本新）"
echo "2) 系统包管理器（简单但版本可能较旧）"
echo "3) NVM（最灵活，可管理多个版本）"
echo ""
read -p "请选择 (1/2/3，默认1): " choice
choice=${choice:-1}

case $choice in
    1)
        install_nodejs_nodesource
        ;;
    2)
        install_nodejs_package_manager
        ;;
    3)
        install_nodejs_nvm
        ;;
    *)
        echo "无效选择，使用默认方式（NodeSource）"
        install_nodejs_nodesource
        ;;
esac

# 验证安装
if command -v node &> /dev/null && command -v npm &> /dev/null; then
    echo ""
    echo "=========================================="
    echo "安装成功！"
    echo "=========================================="
    echo "Node.js 版本: $(node --version)"
    echo "npm 版本: $(npm --version)"
    echo ""
    echo "现在可以运行: cd frontend && npm install"
else
    echo ""
    echo "=========================================="
    echo "安装失败，请手动安装 Node.js"
    echo "=========================================="
    echo "参考文档: https://nodejs.org/"
    exit 1
fi
