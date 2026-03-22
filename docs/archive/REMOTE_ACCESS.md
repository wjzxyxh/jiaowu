# 远程访问配置指南

## ✅ 已完成的配置

1. **前端服务器**: 已配置监听 `0.0.0.0:3000`，可以从外部访问
2. **后端服务器**: 已配置监听 `0.0.0.0:5000`，可以从外部访问
3. **CORS**: 已配置允许所有来源（开发环境）

## 🌐 获取服务器IP地址

运行以下命令获取服务器IP：

```bash
# 方式1：获取内网IP
hostname -I

# 方式2：查看网络接口
ip addr show | grep 'inet ' | grep -v '127.0.0.1'

# 方式3：查看公网IP（如果服务器有公网IP）
curl ifconfig.me
```

## 📍 访问地址

假设服务器IP为 `192.168.1.100`（请替换为实际IP）：

- **前端**: http://192.168.1.100:3000
- **后端API**: http://192.168.1.100:5000/api

## ⚠️ 重要说明

### 开发环境（当前配置）

在开发环境中，前端通过 Vite 代理访问后端：
- 前端访问 `/api/*` 会被代理到 `http://localhost:5000/api/*`
- **这意味着从其他机器访问前端时，API请求会失败**（因为其他机器无法访问 localhost:5000）

### 解决方案

#### 方案1：修改前端API配置（推荐用于开发测试）

创建 `frontend/.env` 文件：

```bash
# 替换为实际的服务器IP
VITE_API_BASE_URL=http://192.168.1.100:5000/api
```

然后重启前端服务器。

#### 方案2：使用Nginx反向代理（生产环境推荐）

配置Nginx同时代理前后端：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 后端API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### 方案3：修改Vite代理配置（临时方案）

修改 `frontend/vite.config.js` 中的代理目标：

```javascript
proxy: {
  '/api': {
    target: 'http://YOUR_SERVER_IP:5000',  // 替换为实际IP
    changeOrigin: true,
    secure: false,
  }
}
```

## 🔥 防火墙配置

确保防火墙开放端口：

```bash
# CentOS/RHEL/Alibaba Cloud Linux
firewall-cmd --permanent --add-port=3000/tcp
firewall-cmd --permanent --add-port=5000/tcp
firewall-cmd --reload

# 或者使用iptables
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
iptables -A INPUT -p tcp --dport 5000 -j ACCEPT
```

## 🧪 测试远程访问

1. **测试后端API**:
   ```bash
   curl http://YOUR_SERVER_IP:5000/api/current-user
   ```
   应该返回 401（未登录），说明API可访问

2. **测试前端**:
   在浏览器访问 `http://YOUR_SERVER_IP:3000`
   应该能看到登录页面

3. **测试完整流程**:
   - 访问前端页面
   - 尝试登录
   - 检查浏览器控制台是否有API请求错误

## 🐛 常见问题

### 问题1：前端可以访问，但登录失败

**原因**: 前端API请求指向了 localhost，其他机器无法访问

**解决**: 使用方案1，创建 `.env` 文件配置API地址

### 问题2：连接被拒绝

**原因**: 防火墙未开放端口

**解决**: 配置防火墙规则（见上方）

### 问题3：CORS错误

**原因**: 后端CORS配置问题

**解决**: 检查 `extensions.py` 中的CORS配置，确保允许前端域名

## 📝 生产环境建议

1. **使用Nginx反向代理**: 统一入口，更安全
2. **配置HTTPS**: 使用SSL证书
3. **限制CORS来源**: 只允许特定域名
4. **使用环境变量**: 区分开发和生产环境配置
