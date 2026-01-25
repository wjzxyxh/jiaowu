import App from './App'
import { createSSRApp } from 'vue'

// 引入全局样式
import './uni.scss'

// 引入API工具
import api from './utils/api'

export function createApp() {
    const app = createSSRApp(App)
    
    // 全局挂载API工具
    app.config.globalProperties.$api = api
    
    return {
        app
    }
}
