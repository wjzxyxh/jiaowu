#!/bin/bash
# 同时启动前端和后端服务

cd /tmp/pycharm_project_231

echo "=========================================="
echo "启动前端和后端服务"
echo "=========================================="

# 检查Python
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到Python3"
    exit 1
fi

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未找到Node.js"
    exit 1
fi

# 停止现有进程
echo "正在停止现有进程..."
pkill -9 -f "python.*app.py" 2>/dev/null
pkill -9 -f "vite" 2>/dev/null
sleep 2

# 检查前端依赖
if [ ! -d "frontend/node_modules" ]; then
    echo "正在安装前端依赖..."
    cd frontend
    npm install
    cd ..
fi

# 启动后端
echo "正在启动后端服务（端口5000）..."
nohup python3 app.py > backend.log 2>&1 &
BACKEND_PID=$!
echo "后端进程ID: $BACKEND_PID"

# 等待后端启动
sleep 3

# 启动前端
echo "正在启动前端服务（端口3000）..."
cd frontend
nohup npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
echo "前端进程ID: $FRONTEND_PID"

# 等待前端启动
sleep 3

echo ""
echo "=========================================="
echo "服务启动完成！"
echo "=========================================="
echo "后端进程ID: $BACKEND_PID"
echo "前端进程ID: $FRONTEND_PID"
echo ""
echo "访问地址："
echo "  前端: http://localhost:3000"
echo "  后端API: http://localhost:5000/api"
echo ""
echo "查看日志："
echo "  后端日志: tail -f backend.log"
echo "  前端日志: tail -f frontend.log"
echo ""
echo "停止服务："
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo "  或运行: pkill -f 'python.*app.py' && pkill -f 'vite'"
echo "=========================================="
