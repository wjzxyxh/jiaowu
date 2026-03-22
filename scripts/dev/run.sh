#!/bin/bash

# 检查是否安装了依赖
if ! python3 -c "import flask" 2>/dev/null; then
    echo "正在安装依赖..."
    pip3 install -r requirements.txt
fi

# 运行应用
echo "启动教务管理系统..."
python3 app.py

