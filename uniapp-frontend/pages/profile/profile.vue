<template>
    <view class="profile-container">
        <view class="profile-header">
            <text class="username">{{ userInfo.real_name || userInfo.username || '用户' }}</text>
            <text class="role">{{ roleName }}</text>
        </view>
        
        <view class="profile-content">
            <view class="section">
                <view class="section-title">个人信息</view>
                
                <view class="form-item">
                    <text class="label">用户名</text>
                    <input class="input" v-model="form.username" disabled />
                </view>
                
                <view class="form-item">
                    <text class="label">真实姓名</text>
                    <input class="input" v-model="form.real_name" placeholder="请输入真实姓名" />
                </view>
            </view>
            
            <view class="section">
                <view class="section-title">修改密码</view>
                
                <view class="form-item">
                    <text class="label">新密码</text>
                    <input class="input" type="password" v-model="form.password" placeholder="留空则不修改密码" />
                </view>
                
                <view class="form-item">
                    <text class="label">确认新密码</text>
                    <input class="input" type="password" v-model="form.password_confirm" placeholder="再次输入新密码" />
                </view>
            </view>
            
            <button class="save-btn" @click="saveProfile">保存</button>
            
            <button class="logout-btn" @click="handleLogout">退出登录</button>
        </view>
    </view>
</template>

<script>
import api from '@/utils/api'
import storage from '@/utils/storage'
import { getRoleName } from '@/utils/common'

export default {
    data() {
        return {
            userInfo: {},
            form: {
                username: '',
                real_name: '',
                password: '',
                password_confirm: ''
            }
        }
    },
    computed: {
        roleName() {
            return getRoleName(this.userInfo.role)
        }
    },
    onLoad() {
        this.loadUserInfo()
    },
    methods: {
        async loadUserInfo() {
            try {
                const res = await api.getCurrentUser()
                if (res.user) {
                    this.userInfo = res.user
                    this.form.username = res.user.username || ''
                    this.form.real_name = res.user.real_name || ''
                }
            } catch (error) {
                console.error('获取用户信息失败:', error)
            }
        },
        
        async saveProfile() {
            // 验证密码
            if (this.form.password) {
                if (this.form.password !== this.form.password_confirm) {
                    uni.showToast({
                        title: '两次输入的密码不一致',
                        icon: 'none'
                    })
                    return
                }
                
                // 验证密码长度
                const passwordBytes = new TextEncoder().encode(this.form.password).length
                if (passwordBytes > 72) {
                    uni.showToast({
                        title: '密码长度不能超过72个字符',
                        icon: 'none'
                    })
                    return
                }
            } else {
                // 如果密码为空，删除该字段
                delete this.form.password
            }
            
            // 删除确认密码字段
            const data = {
                real_name: this.form.real_name,
                ...(this.form.password && { password: this.form.password })
            }
            
            try {
                await api.updateProfile(data)
                uni.showToast({
                    title: '保存成功',
                    icon: 'success'
                })
                
                // 重新加载用户信息
                this.loadUserInfo()
                
                // 清空密码字段
                this.form.password = ''
                this.form.password_confirm = ''
            } catch (error) {
                console.error('保存失败:', error)
                uni.showToast({
                    title: error.message || '保存失败',
                    icon: 'none'
                })
            }
        },
        
        handleLogout() {
            uni.showModal({
                title: '提示',
                content: '确定要退出登录吗？',
                success: async (res) => {
                    if (res.confirm) {
                        try {
                            await api.logout()
                        } catch (error) {
                            console.error('退出登录失败:', error)
                        } finally {
                            // 清除本地数据
                            storage.clearAll()
                            // 跳转到登录页
                            uni.reLaunch({
                                url: '/pages/login/login'
                            })
                        }
                    }
                }
            })
        }
    }
}
</script>

<style lang="scss" scoped>
.profile-container {
    min-height: 100vh;
    background: #f5f5f5;
}

.profile-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 60rpx 30rpx 40rpx;
    text-align: center;
    
    .username {
        display: block;
        font-size: 40rpx;
        font-weight: bold;
        color: #fff;
        margin-bottom: 10rpx;
    }
    
    .role {
        display: block;
        font-size: 24rpx;
        color: rgba(255, 255, 255, 0.8);
    }
}

.profile-content {
    padding: 30rpx;
    
    .section {
        background: #fff;
        border-radius: 16rpx;
        padding: 30rpx;
        margin-bottom: 30rpx;
        
        .section-title {
            font-size: 30rpx;
            font-weight: bold;
            color: #333;
            margin-bottom: 30rpx;
        }
        
        .form-item {
            margin-bottom: 30rpx;
            
            &:last-child {
                margin-bottom: 0;
            }
            
            .label {
                display: block;
                font-size: 26rpx;
                color: #666;
                margin-bottom: 10rpx;
            }
            
            .input {
                width: 100%;
                height: 70rpx;
                background: #f5f5f5;
                border-radius: 8rpx;
                padding: 0 20rpx;
                font-size: 28rpx;
                box-sizing: border-box;
                
                &[disabled] {
                    color: #999;
                }
            }
        }
    }
    
    .save-btn {
        width: 100%;
        height: 88rpx;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #fff;
        border-radius: 16rpx;
        font-size: 32rpx;
        font-weight: bold;
        margin-bottom: 30rpx;
        border: none;
    }
    
    .logout-btn {
        width: 100%;
        height: 88rpx;
        background: #fff;
        color: #dc3545;
        border-radius: 16rpx;
        font-size: 32rpx;
        border: 1rpx solid #dc3545;
    }
}
</style>
