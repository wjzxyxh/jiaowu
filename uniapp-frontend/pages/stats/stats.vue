<template>
    <view class="stats-container">
        <view class="empty">
            <text>学生课时页面</text>
            <text class="tip">功能开发中...</text>
        </view>
    </view>
</template>

<script>
export default {
    data() {
        return {}
    }
}
</script>

<style lang="scss" scoped>
.stats-container {
    min-height: 100vh;
    background: #f5f5f5;
    display: flex;
    align-items: center;
    justify-content: center;
    
    .empty {
        text-align: center;
        color: #999;
        
        .tip {
            display: block;
            margin-top: 20rpx;
            font-size: 24rpx;
        }
    }
}
</style>
