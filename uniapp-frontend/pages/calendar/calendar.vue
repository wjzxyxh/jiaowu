<template>
    <view class="calendar-container">
        <view class="calendar-header">
            <text class="month-text">{{ currentMonth }}</text>
        </view>
        
        <view class="calendar-content">
            <view v-if="courses.length === 0" class="empty">
                <text>暂无课程安排</text>
            </view>
            
            <view class="course-list">
                <view 
                    class="course-item card" 
                    v-for="course in courses" 
                    :key="course.id"
                >
                    <view class="course-header">
                        <text class="course-date">{{ formatDate(course.date) }}</text>
                        <text class="course-time">{{ course.time_slot }}</text>
                    </view>
                    <view class="course-info">
                        <text class="info-text">学生: {{ course.student_name }}</text>
                        <text class="info-text">课程: {{ course.course_name }}</text>
                        <text class="info-text">教室: {{ course.classroom || '未设置' }}</text>
                    </view>
                </view>
            </view>
        </view>
    </view>
</template>

<script>
import api from '@/utils/api'
import { formatDate } from '@/utils/common'

export default {
    data() {
        return {
            courses: [],
            currentMonth: ''
        }
    },
    onLoad() {
        const now = new Date()
        this.currentMonth = `${now.getFullYear()}年${now.getMonth() + 1}月`
        this.loadCourses()
    },
    onPullDownRefresh() {
        this.loadCourses()
        setTimeout(() => {
            uni.stopPullDownRefresh()
        }, 1000)
    },
    methods: {
        async loadCourses() {
            try {
                const res = await api.getCalendar({
                    month: new Date().getMonth() + 1,
                    year: new Date().getFullYear()
                })
                this.courses = res.courses || res || []
            } catch (error) {
                console.error('加载课程失败:', error)
                uni.showToast({
                    title: '加载失败',
                    icon: 'none'
                })
            }
        },
        
        formatDate(date) {
            return formatDate(date, 'YYYY-MM-DD')
        }
    }
}
</script>

<style lang="scss" scoped>
.calendar-container {
    min-height: 100vh;
    background: #f5f5f5;
}

.calendar-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 40rpx 30rpx;
    
    .month-text {
        font-size: 36rpx;
        font-weight: bold;
        color: #fff;
    }
}

.calendar-content {
    padding: 30rpx;
    
    .empty {
        padding: 100rpx 0;
        text-align: center;
        color: #999;
    }
    
    .course-list {
        .course-item {
            margin-bottom: 20rpx;
            
            .course-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20rpx;
                
                .course-date {
                    font-size: 32rpx;
                    font-weight: bold;
                    color: #333;
                }
                
                .course-time {
                    font-size: 26rpx;
                    color: #667eea;
                }
            }
            
            .course-info {
                .info-text {
                    display: block;
                    font-size: 26rpx;
                    color: #666;
                    margin-bottom: 10rpx;
                }
            }
        }
    }
}
</style>
