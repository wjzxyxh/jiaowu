/**
 * 本地存储工具
 */

const storage = {
    // 设置token
    setToken(token) {
        uni.setStorageSync('token', token)
    },
    
    // 获取token
    getToken() {
        return uni.getStorageSync('token')
    },
    
    // 清除token
    removeToken() {
        uni.removeStorageSync('token')
    },
    
    // 设置用户信息
    setUserInfo(userInfo) {
        uni.setStorageSync('userInfo', userInfo)
    },
    
    // 获取用户信息
    getUserInfo() {
        return uni.getStorageSync('userInfo')
    },
    
    // 清除用户信息
    removeUserInfo() {
        uni.removeStorageSync('userInfo')
    },
    
    // 清除所有数据
    clearAll() {
        uni.clearStorageSync()
    }
}

export default storage
