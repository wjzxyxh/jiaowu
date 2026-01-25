<template>
    <view id="app">
        <!-- 应用根组件 -->
    </view>
</template>

<script>
export default {
    onLaunch: function() {
        console.log('App Launch')
        // 检查登录状态
        this.checkLoginStatus()
    },
    onShow: function() {
        console.log('App Show')
    },
    onHide: function() {
        console.log('App Hide')
    },
    methods: {
        async checkLoginStatus() {
            try {
                const token = uni.getStorageSync('token')
                if (!token) {
                    // 未登录，跳转到登录页
                    const pages = getCurrentPages()
                    if (pages.length === 0 || pages[pages.length - 1].route !== 'pages/login/login') {
                        uni.reLaunch({
                            url: '/pages/login/login'
                        })
                    }
                }
            } catch (e) {
                console.error('检查登录状态失败:', e)
            }
        }
    }
}
</script>

<style lang="scss">
/* 引入uni-app基础样式 */
@import './uni.scss';

/* 全局样式 */
page {
    background-color: #f5f5f5;
    font-size: 28rpx;
    color: #333;
}

.container {
    padding: 20rpx;
}

.card {
    background: #fff;
    border-radius: 16rpx;
    padding: 30rpx;
    margin-bottom: 20rpx;
    box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.08);
}

.btn-primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #fff;
    border: none;
    border-radius: 8rpx;
    padding: 24rpx 48rpx;
    font-size: 28rpx;
}

.btn-secondary {
    background: #f5f5f5;
    color: #333;
    border: 1rpx solid #ddd;
    border-radius: 8rpx;
    padding: 24rpx 48rpx;
    font-size: 28rpx;
}
</style>
