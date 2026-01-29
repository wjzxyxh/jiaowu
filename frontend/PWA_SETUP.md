# PWA 配置说明

本项目已成功配置为 Progressive Web App (PWA)，可以通过 Capacitor 转换为原生移动应用。

## 已完成的配置

### 1. PWA 插件配置
- ✅ 安装了 `vite-plugin-pwa`
- ✅ 配置了 Service Worker 自动更新
- ✅ 配置了缓存策略（API 使用 NetworkFirst，图片使用 CacheFirst）

### 2. Manifest 配置
- ✅ 应用名称：教务管理系统
- ✅ 短名称：教务管理
- ✅ 图标：192x192 和 512x512
- ✅ 显示模式：standalone（独立应用模式）
- ✅ 主题色和背景色：白色

### 3. Capacitor 配置
- ✅ 配置了 Android 和 iOS 支持
- ✅ 设置了 HTTPS scheme
- ✅ 配置了启动画面

## 使用方法

### 开发模式
```bash
npm run dev
```
开发模式下 PWA 功能已启用，可以在浏览器中测试。

### 构建 PWA
```bash
npm run build
```
构建完成后，`dist` 目录包含：
- `manifest.webmanifest` - PWA 清单文件
- `sw.js` - Service Worker
- 所有静态资源

### 构建并同步到 Capacitor
```bash
npm run build:pwa
```
这会构建应用并自动同步到 Android/iOS 项目。

### 同步 Capacitor（仅同步，不构建）
```bash
npm run cap:sync
```

### 打开 Android Studio
```bash
npm run cap:open:android
```

### 打开 Xcode（macOS）
```bash
npm run cap:open:ios
```

## PWA 功能特性

1. **离线支持**：Service Worker 会缓存静态资源，支持离线访问
2. **自动更新**：当有新版本时，Service Worker 会自动更新
3. **可安装**：用户可以将应用添加到主屏幕
4. **原生体验**：在移动设备上提供类似原生应用的体验

## 测试 PWA

### 在浏览器中测试
1. 运行 `npm run build`
2. 运行 `npm run preview`
3. 打开浏览器开发者工具
4. 在 Application 标签页中检查：
   - Manifest
   - Service Workers
   - Cache Storage

### 在移动设备上测试
1. 确保应用运行在 HTTPS 或 localhost
2. 在移动浏览器中打开应用
3. 浏览器会提示"添加到主屏幕"
4. 安装后可以像原生应用一样使用

## 注意事项

1. **HTTPS 要求**：PWA 需要 HTTPS（localhost 除外）
2. **Service Worker 作用域**：当前配置为根路径 `/`
3. **缓存策略**：API 请求使用 NetworkFirst，图片使用 CacheFirst
4. **图标文件**：确保 `public` 目录中有 `pwa-192x192.png` 和 `pwa-512x512.png`

## 下一步

1. 根据需要调整 `vite.config.js` 中的 PWA 配置
2. 自定义应用图标和启动画面
3. 配置推送通知（如需要）
4. 测试在不同设备上的表现
