#!/bin/bash
cd /tmp/pycharm_project_231

echo "正在停止现有应用..."
pkill -9 -f "python.*app.py" 2>/dev/null
sleep 2

echo "正在启动应用（Debug模式）..."
python3 app.py > nohup.out 2>&1 &

sleep 4

echo ""
echo "检查启动状态..."
if tail -30 nohup.out | grep -q "Debugger is active\|Debug mode: on"; then
    echo ""
    echo "✓ 应用已成功启动！"
    echo "✓ Debug模式: 已启用"
    echo "✓ 端口: 80"
    echo "✓ 访问地址: http://localhost"
    echo ""
    echo "最新日志："
    tail -15 nohup.out | grep -E "启动成功|Debug|端口|访问地址|Debugger"
else
    echo "检查启动日志..."
    tail -20 nohup.out
fi
