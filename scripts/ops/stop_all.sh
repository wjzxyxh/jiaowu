#!/bin/bash
# 停止前端和后端服务

echo "正在停止前端和后端服务..."

# 停止后端
pkill -f "python.*app.py" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✓ 后端服务已停止"
else
    echo "  后端服务未运行"
fi

# 停止前端
pkill -f "vite" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✓ 前端服务已停止"
else
    echo "  前端服务未运行"
fi

echo "完成！"
