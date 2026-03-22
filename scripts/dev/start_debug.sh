#!/bin/bash
cd /tmp/pycharm_project_231
mkdir -p logs/runtime

# 停止现有应用
echo "正在停止现有应用..."
pkill -9 -f "python.*app.py" 2>/dev/null
sleep 2

# 启动应用（debug模式）
echo "正在启动应用（Debug模式）..."
python3 app.py > logs/runtime/nohup.out 2>&1 &

# 等待应用启动
sleep 4

# 检查启动状态
if tail -20 logs/runtime/nohup.out | grep -q "Debug mode: on\|Debugger is active"; then
    echo ""
    echo "✓ 应用已成功启动！"
    echo "✓ Debug模式: 已启用"
    echo "✓ 端口: 80"
    echo "✓ 访问地址: http://localhost"
    echo ""
    echo "最新日志："
    tail -10 logs/runtime/nohup.out
else
    echo "应用可能启动失败，请查看 logs/runtime/nohup.out 日志"
    tail -20 logs/runtime/nohup.out
fi
