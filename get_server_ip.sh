#!/bin/bash
# 获取服务器IP地址

echo "=========================================="
echo "服务器IP地址信息"
echo "=========================================="
echo ""

echo "内网IP地址:"
hostname -I 2>/dev/null || ip addr show | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | cut -d'/' -f1 | head -1

echo ""
echo "公网IP地址（如果有）:"
curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "无法获取"

echo ""
echo "=========================================="
echo "访问地址"
echo "=========================================="
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ip addr show | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | cut -d'/' -f1 | head -1)

if [ -n "$SERVER_IP" ]; then
    echo "前端: http://$SERVER_IP:3000"
    echo "后端API: http://$SERVER_IP:5000/api"
    echo ""
    echo "配置前端API地址（创建 frontend/.env）:"
    echo "VITE_API_BASE_URL=http://$SERVER_IP:5000/api"
else
    echo "无法自动获取IP，请手动查看网络配置"
fi
