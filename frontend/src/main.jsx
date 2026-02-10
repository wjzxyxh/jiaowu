import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true, // 切换回页面时自动刷新过期数据
      refetchOnMount: true, // 组件挂载时，若数据过期则自动重新获取（解决跨页面数据滞后的核心）
      refetchOnReconnect: true, // 网络重连时自动刷新
      retry: (failureCount, error) => {
        // 对于429错误，使用指数退避重试，最多重试2次
        if (error?.status === 429 || error?.isRateLimitError) {
          return failureCount < 2
        }
        // 其他错误不重试
        return false
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // 指数退避，最长30秒
      staleTime: 2 * 60 * 1000, // 数据2分钟内视为新鲜（缩短以便更及时获取更新）
      cacheTime: 30 * 60 * 1000, // 缓存30分钟
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
