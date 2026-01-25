<template>
    <view class="login-container">
        <view class="login-header">
            <text class="title">教务管理系统</text>
            <text class="subtitle">Education Management System</text>
        </view>
        
        <view class="login-form">
            <view class="form-item">
                <input 
                    class="input" 
                    type="text" 
                    v-model="form.username" 
                    placeholder="请输入用户名"
                    :disabled="loading"
                />
            </view>
            
            <view class="form-item">
                <input 
                    class="input" 
                    type="password" 
                    v-model="form.password" 
                    placeholder="请输入密码"
                    :disabled="loading"
                />
            </view>
            
            <button 
                class="login-btn" 
                :class="{ 'disabled': loading }"
                @click="handleLogin"
                :disabled="loading"
            >
                {{ loading ? '登录中...' : '登录' }}
            </button>
        </view>
        
        <view class="login-footer">
            <text class="tip">默认账号: admin / admin123</text>
        </view>
    </view>
</template>

<script>
import api from '@/utils/api'
import storage from '@/utils/storage'

export default {
    data() {
        return {
            form: {
                username: '',
                password: ''
            },
            loading: false
        }
    },
    onLoad() {
        // 检查是否已登录
        const token = storage.getToken()
        if (token) {
            // 已登录，跳转到首页
            uni.switchTab({
                url: '/pages/index/index'
            })
        }
    },
    methods: {
        async handleLogin() {
            // 验证输入
            if (!this.form.username.trim()) {
                uni.showToast({
                    title: '请输入用户名',
                    icon: 'none'
                })
                return
            }
            
            if (!this.form.password.trim()) {
                uni.showToast({
                    title: '请输入密码',
                    icon: 'none'
                })
                return
            }
            
            this.loading = true
            
            try {
                // 调用登录接口
                const res = await api.login({
                    username: this.form.username.trim(),
                    password: this.form.password
                })
                
                if (res.user) {
                    // 保存token和用户信息
                    // 注意：根据实际后端返回的token字段调整
                    if (res.token) {
                        storage.setToken(res.token)
                    }
                    storage.setUserInfo(res.user)
                    
                    uni.showToast({
                        title: '登录成功',
                        icon: 'success'
                    })
                    
                    // 跳转到首页
                    setTimeout(() => {
                        uni.switchTab({
                            url: '/pages/index/index'
                        })
                    }, 1000)
                } else {
                    throw new Error('登录失败')
                }
            } catch (error) {
                console.error('登录失败:', error)
                uni.showToast({
                    title: error.message || '登录失败',
                    icon: 'none'
                })
            } finally {
                this.loading = false
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.login-container {
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60rpx 40rpx;
}

.login-header {
    text-align: center;
    margin-bottom: 100rpx;
    
    .title {
        display: block;
        font-size: 56rpx;
        font-weight: bold;
        color: #fff;
        margin-bottom: 20rpx;
    }
    
    .subtitle {
        display: block;
        font-size: 28rpx;
        color: rgba(255, 255, 255, 0.8);
    }
}

.login-form {
    width: 100%;
    max-width: 600rpx;
    
    .form-item {
        margin-bottom: 40rpx;
        
        .input {
            width: 100%;
            height: 88rpx;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 16rpx;
            padding: 0 30rpx;
            font-size: 28rpx;
            box-sizing: border-box;
        }
    }
    
    .login-btn {
        width: 100%;
        height: 88rpx;
        background: #fff;
        color: #667eea;
        border-radius: 16rpx;
        font-size: 32rpx;
        font-weight: bold;
        margin-top: 40rpx;
        border: none;
        
        &.disabled {
            opacity: 0.6;
        }
    }
}

.login-footer {
    margin-top: 60rpx;
    
    .tip {
        font-size: 24rpx;
        color: rgba(255, 255, 255, 0.7);
    }
}
</style>
