<template>
    <view class="students-container">
        <!-- 搜索栏 -->
        <view class="search-bar">
            <input 
                class="search-input" 
                type="text" 
                v-model="searchKeyword" 
                placeholder="搜索学生姓名、电话..."
                @input="handleSearch"
            />
            <button class="add-btn" @click="showAddModal">+ 新增</button>
        </view>
        
        <!-- 学生列表 -->
        <scroll-view class="students-list" scroll-y>
            <view 
                class="student-item card" 
                v-for="student in students" 
                :key="student.id"
                @click="editStudent(student)"
            >
                <view class="student-header">
                    <text class="student-name">{{ student.name }}</text>
                    <text class="student-grade">{{ student.grade || '未设置' }}</text>
                </view>
                <view class="student-info">
                    <text class="info-item">电话: {{ student.phone || '未设置' }}</text>
                    <text class="info-item">家长: {{ student.parent_name || '未设置' }}</text>
                </view>
            </view>
            
            <view v-if="students.length === 0" class="empty">
                <text>暂无学生数据</text>
            </view>
        </scroll-view>
        
        <!-- 新增/编辑弹窗 -->
        <view class="modal" v-if="showModal" @click.stop>
            <view class="modal-content">
                <view class="modal-header">
                    <text class="modal-title">{{ editingStudent ? '编辑学生' : '新增学生' }}</text>
                    <text class="close-btn" @click="closeModal">×</text>
                </view>
                <view class="modal-body">
                    <view class="form-item">
                        <text class="label">姓名 *</text>
                        <input class="input" v-model="form.name" placeholder="请输入姓名" />
                    </view>
                    <view class="form-item">
                        <text class="label">年级</text>
                        <input class="input" v-model="form.grade" placeholder="请输入年级" />
                    </view>
                    <view class="form-item">
                        <text class="label">电话</text>
                        <input class="input" v-model="form.phone" placeholder="请输入电话" type="number" />
                    </view>
                    <view class="form-item">
                        <text class="label">家长姓名</text>
                        <input class="input" v-model="form.parent_name" placeholder="请输入家长姓名" />
                    </view>
                    <view class="form-item">
                        <text class="label">家长电话</text>
                        <input class="input" v-model="form.parent_phone" placeholder="请输入家长电话" type="number" />
                    </view>
                </view>
                <view class="modal-footer">
                    <button class="btn btn-cancel" @click="closeModal">取消</button>
                    <button class="btn btn-confirm" @click="saveStudent">保存</button>
                </view>
            </view>
        </view>
        <view class="modal-mask" v-if="showModal" @click="closeModal"></view>
    </view>
</template>

<script>
import api from '@/utils/api'

export default {
    data() {
        return {
            students: [],
            searchKeyword: '',
            showModal: false,
            editingStudent: null,
            form: {
                name: '',
                grade: '',
                phone: '',
                parent_name: '',
                parent_phone: ''
            }
        }
    },
    onLoad() {
        this.loadStudents()
    },
    onPullDownRefresh() {
        this.loadStudents()
        setTimeout(() => {
            uni.stopPullDownRefresh()
        }, 1000)
    },
    methods: {
        async loadStudents() {
            try {
                const params = {}
                if (this.searchKeyword) {
                    params.search = this.searchKeyword
                }
                const res = await api.getStudents(params)
                this.students = res.students || res || []
            } catch (error) {
                console.error('加载学生列表失败:', error)
                uni.showToast({
                    title: '加载失败',
                    icon: 'none'
                })
            }
        },
        
        handleSearch() {
            // 防抖搜索
            clearTimeout(this.searchTimer)
            this.searchTimer = setTimeout(() => {
                this.loadStudents()
            }, 500)
        },
        
        showAddModal() {
            this.editingStudent = null
            this.form = {
                name: '',
                grade: '',
                phone: '',
                parent_name: '',
                parent_phone: ''
            }
            this.showModal = true
        },
        
        editStudent(student) {
            this.editingStudent = student
            this.form = {
                name: student.name || '',
                grade: student.grade || '',
                phone: student.phone || '',
                parent_name: student.parent_name || '',
                parent_phone: student.parent_phone || ''
            }
            this.showModal = true
        },
        
        closeModal() {
            this.showModal = false
            this.editingStudent = null
        },
        
        async saveStudent() {
            if (!this.form.name.trim()) {
                uni.showToast({
                    title: '请输入姓名',
                    icon: 'none'
                })
                return
            }
            
            try {
                if (this.editingStudent) {
                    // 更新
                    await api.updateStudent(this.editingStudent.id, this.form)
                    uni.showToast({
                        title: '更新成功',
                        icon: 'success'
                    })
                } else {
                    // 新增
                    await api.createStudent(this.form)
                    uni.showToast({
                        title: '新增成功',
                        icon: 'success'
                    })
                }
                this.closeModal()
                this.loadStudents()
            } catch (error) {
                console.error('保存失败:', error)
                uni.showToast({
                    title: error.message || '保存失败',
                    icon: 'none'
                })
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.students-container {
    min-height: 100vh;
    background: #f5f5f5;
}

.search-bar {
    display: flex;
    padding: 20rpx;
    gap: 20rpx;
    background: #fff;
    
    .search-input {
        flex: 1;
        height: 70rpx;
        background: #f5f5f5;
        border-radius: 8rpx;
        padding: 0 20rpx;
        font-size: 26rpx;
    }
    
    .add-btn {
        height: 70rpx;
        padding: 0 30rpx;
        background: #667eea;
        color: #fff;
        border-radius: 8rpx;
        font-size: 26rpx;
        border: none;
    }
}

.students-list {
    height: calc(100vh - 120rpx);
    padding: 20rpx;
    
    .student-item {
        margin-bottom: 20rpx;
        
        .student-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20rpx;
            
            .student-name {
                font-size: 32rpx;
                font-weight: bold;
                color: #333;
            }
            
            .student-grade {
                font-size: 24rpx;
                color: #999;
            }
        }
        
        .student-info {
            .info-item {
                display: block;
                font-size: 26rpx;
                color: #666;
                margin-bottom: 10rpx;
            }
        }
    }
    
    .empty {
        padding: 100rpx 0;
        text-align: center;
        color: #999;
    }
}

.modal {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #fff;
    border-radius: 24rpx 24rpx 0 0;
    z-index: 1000;
    max-height: 80vh;
    
    .modal-content {
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 30rpx;
            border-bottom: 1rpx solid #eee;
            
            .modal-title {
                font-size: 32rpx;
                font-weight: bold;
            }
            
            .close-btn {
                font-size: 48rpx;
                color: #999;
            }
        }
        
        .modal-body {
            padding: 30rpx;
            max-height: 60vh;
            overflow-y: auto;
            
            .form-item {
                margin-bottom: 30rpx;
                
                .label {
                    display: block;
                    font-size: 26rpx;
                    color: #333;
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
                }
            }
        }
        
        .modal-footer {
            display: flex;
            padding: 30rpx;
            gap: 20rpx;
            border-top: 1rpx solid #eee;
            
            .btn {
                flex: 1;
                height: 80rpx;
                border-radius: 8rpx;
                font-size: 28rpx;
                border: none;
                
                &.btn-cancel {
                    background: #f5f5f5;
                    color: #333;
                }
                
                &.btn-confirm {
                    background: #667eea;
                    color: #fff;
                }
            }
        }
    }
}

.modal-mask {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
}
</style>
