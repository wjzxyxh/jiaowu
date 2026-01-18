#!/bin/bash
# 停止现有应用
pkill -f "python.*app.py" 2>/dev/null
sleep 2

# 启动应用（debug模式）
cd /tmp/pycharm_project_231
python3 app.py > nohup.out 2>&1 &

echo "应用正在启动..."
sleep 3

# 检查状态
if ps aux | grep -q "[p]ython.*app.py"; then
    echo "✓ 应用已启动"
    echo "✓ Debug模式已启用"
    echo "✓ 监听端口: 80"
    echo "访问地址: http://localhost"
    tail -10 nohup.out
else
    echo "✗ 应用启动失败，请查看 nohup.out 日志"
fi
