<template>
    <view class="index-container">
        <!-- 用户信息栏 -->
        <view class="user-header">
            <view class="user-info" @click="goToProfile">
                <text class="username">{{ userInfo.real_name || userInfo.username || '用户' }}</text>
                <text class="role">{{ roleName }}</text>
            </view>
            <view class="notification-btn" @click="showNotifications">
                <text class="icon">🔔</text>
                <view class="badge" v-if="unreadCount > 0">{{ unreadCount > 99 ? '99+' : unreadCount }}</view>
            </view>
        </view>
        
        <!-- 功能模块网格 -->
        <view class="modules-grid">
            <view 
                class="module-item" 
                v-for="module in modules" 
                :key="module.code"
                @click="goToModule(module.path)"
            >
                <view class="module-icon">{{ module.icon }}</view>
                <text class="module-name">{{ module.name }}</text>
            </view>
        </view>
        
        <!-- 通知弹窗 -->
        <view class="notification-popup" v-if="showNotificationPopup" @click.stop>
            <view class="popup-header">
                <text class="popup-title">通知中心</text>
                <text class="close-btn" @click="closeNotifications">×</text>
            </view>
            <scroll-view class="popup-content" scroll-y>
                <view v-if="notifications.length === 0" class="empty-notice">
                    <text>暂无通知</text>
                </view>
                <view 
                    v-for="item in notifications" 
                    :key="item.id"
                    class="notification-item"
                    :class="{ 'unread': !item.is_read }"
                    @click="handleNotificationClick(item)"
                >
                    <view class="notification-content">
                        <text class="notification-title">{{ item.title }}</text>
                        <text class="notification-text">{{ item.content }}</text>
                        <text class="notification-time">{{ item.created_at }}</text>
                    </view>
                </view>
            </scroll-view>
        </view>
        <view class="popup-mask" v-if="showNotificationPopup" @click="closeNotifications"></view>
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
            unreadCount: 0,
            notifications: [],
            showNotificationPopup: false,
            modules: []
        }
    },
    computed: {
        roleName() {
            return getRoleName(this.userInfo.role)
        }
    },
    onLoad() {
        this.loadUserInfo()
        this.loadModules()
        this.loadUnreadCount()
    },
    onShow() {
        // 每次显示页面时刷新未读数量
        this.loadUnreadCount()
    },
    onPullDownRefresh() {
        this.loadUnreadCount()
        this.loadUserInfo()
        setTimeout(() => {
            uni.stopPullDownRefresh()
        }, 1000)
    },
    methods: {
        async loadUserInfo() {
            try {
                const res = await api.getCurrentUser()
                if (res.user) {
                    this.userInfo = res.user
                    storage.setUserInfo(res.user)
                }
            } catch (error) {
                console.error('获取用户信息失败:', error)
            }
        },
        
        async loadModules() {
            try {
                // 获取权限
                const res = await api.getPermissions()
                const grantedModules = res.modules || []
                
                // 所有模块配置
                const allModules = [
                    { code: 'students', name: '学生管理', icon: '👥', path: '/pages/students/students' },
                    { code: 'teachers', name: '教师管理', icon: '👨‍🏫', path: '/pages/teachers/teachers' },
                    { code: 'courses_manage', name: '课程管理', icon: '📚', path: '/pages/courses-manage/courses-manage' },
                    { code: 'courses', name: '排课管理', icon: '📅', path: '/pages/courses/courses' },
                    { code: 'payments', name: '缴费管理', icon: '💰', path: '/pages/payments/payments' },
                    { code: 'stats', name: '学生课时', icon: '📊', path: '/pages/stats/stats' },
                    { code: 'teacher_hours', name: '老师课时', icon: '👨‍🏫', path: '/pages/teacher-hours/teacher-hours' },
                    { code: 'finance', name: '财务统计', icon: '💵', path: '/pages/finance/finance' },
                    { code: 'others_manage', name: '其它管理', icon: '⚙️', path: '/pages/others/others' },
                    { code: 'calendar', name: '课程表日历', icon: '📆', path: '/pages/calendar/calendar' }
                ]
                
                // 如果是管理员或没有权限限制，显示所有模块
                if (grantedModules.length === 0 || grantedModules.length === allModules.length) {
                    this.modules = allModules
                } else {
                    // 根据权限过滤
                    this.modules = allModules.filter(m => grantedModules.includes(m.code))
                }
                
                // 如果是管理员，添加系统管理员入口
                if (this.userInfo.role === 'admin') {
                    this.modules.push({
                        code: 'permissions',
                        name: '系统管理员',
                        icon: '🔐',
                        path: '/pages/permissions/permissions'
                    })
                }
            } catch (error) {
                console.error('加载模块失败:', error)
                // 失败时显示所有模块
                this.modules = [
                    { code: 'students', name: '学生管理', icon: '👥', path: '/pages/students/students' },
                    { code: 'teachers', name: '教师管理', icon: '👨‍🏫', path: '/pages/teachers/teachers' },
                    { code: 'courses', name: '排课管理', icon: '📅', path: '/pages/courses/courses' },
                    { code: 'payments', name: '缴费管理', icon: '💰', path: '/pages/payments/payments' },
                    { code: 'finance', name: '财务统计', icon: '💵', path: '/pages/finance/finance' }
                ]
            }
        },
        
        async loadUnreadCount() {
            try {
                const res = await api.getUnreadCount()
                this.unreadCount = res.count || 0
            } catch (error) {
                console.error('加载未读数量失败:', error)
            }
        },
        
        async showNotifications() {
            this.showNotificationPopup = true
            try {
                const res = await api.getNotifications()
                this.notifications = res || []
            } catch (error) {
                console.error('加载通知失败:', error)
            }
        },
        
        closeNotifications() {
            this.showNotificationPopup = false
        },
        
        async handleNotificationClick(item) {
            if (!item.is_read) {
                try {
                    await api.markNotificationRead(item.id)
                    item.is_read = true
                    this.loadUnreadCount()
                } catch (error) {
                    console.error('标记通知失败:', error)
                }
            }
            
            if (item.link) {
                // 如果有链接，跳转
                uni.navigateTo({
                    url: item.link
                })
            }
            
            this.closeNotifications()
        },
        
        goToModule(path) {
            uni.navigateTo({
                url: path
            })
        },
        
        goToProfile() {
            uni.navigateTo({
                url: '/pages/profile/profile'
            })
        }
    }
}
</script>

<style lang="scss" scoped>
.index-container {
    min-height: 100vh;
    background: #f5f5f5;
    padding-bottom: 120rpx;
}

.user-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 40rpx 30rpx 60rpx;
    display: flex;
    justify-content: space-between;
    align-items: center;
    
    .user-info {
        flex: 1;
        
        .username {
            display: block;
            font-size: 36rpx;
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
    
    .notification-btn {
        position: relative;
        width: 80rpx;
        height: 80rpx;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        
        .icon {
            font-size: 40rpx;
        }
        
        .badge {
            position: absolute;
            top: -10rpx;
            right: -10rpx;
            min-width: 36rpx;
            height: 36rpx;
            background: #dc3545;
            color: #fff;
            border-radius: 18rpx;
            font-size: 20rpx;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 8rpx;
        }
    }
}

.modules-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20rpx;
    padding: 30rpx;
    
    .module-item {
        background: #fff;
        border-radius: 16rpx;
        padding: 40rpx 20rpx;
        text-align: center;
        box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.08);
        
        .module-icon {
            font-size: 64rpx;
            margin-bottom: 20rpx;
        }
        
        .module-name {
            font-size: 26rpx;
            color: #333;
        }
    }
}

.notification-popup {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #fff;
    border-radius: 24rpx 24rpx 0 0;
    max-height: 70vh;
    z-index: 1000;
    
    .popup-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 30rpx;
        border-bottom: 1rpx solid #eee;
        
        .popup-title {
            font-size: 32rpx;
            font-weight: bold;
        }
        
        .close-btn {
            font-size: 48rpx;
            color: #999;
        }
    }
    
    .popup-content {
        max-height: 60vh;
        
        .empty-notice {
            padding: 100rpx 0;
            text-align: center;
            color: #999;
        }
        
        .notification-item {
            padding: 30rpx;
            border-bottom: 1rpx solid #eee;
            
            &.unread {
                background: #f0f7ff;
            }
            
            .notification-content {
                .notification-title {
                    display: block;
                    font-size: 28rpx;
                    font-weight: bold;
                    margin-bottom: 10rpx;
                }
                
                .notification-text {
                    display: block;
                    font-size: 26rpx;
                    color: #666;
                    margin-bottom: 10rpx;
                }
                
                .notification-time {
                    display: block;
                    font-size: 22rpx;
                    color: #999;
                }
            }
        }
    }
}

.popup-mask {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
}
</style>
