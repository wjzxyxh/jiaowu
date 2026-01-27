#!/bin/bash
# 启动后端API服务器

echo "启动后端API服务器..."

# 优先使用python3，如果不存在则使用python
if command -v python3 &> /dev/null; then
    PYTHON_CMD=python3
elif command -v python &> /dev/null; then
    PYTHON_CMD=python
else
    echo "错误: 未找到Python解释器，请先安装Python 3"
    exit 1
fi

echo "使用Python: $($PYTHON_CMD --version)"
$PYTHON_CMD app.py
