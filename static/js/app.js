// 全局变量
let currentMonth = new Date().toISOString().slice(0, 7);

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    // 设置默认月份（排课页面使用周选择器，在页面中单独初始化）
    const paymentYearEl = document.getElementById('payment-year');
    const statsMonthEl = document.getElementById('stats-month');
    const financeMonthEl = document.getElementById('finance-month');
    const teacherHoursMonthEl = document.getElementById('teacher-hours-month');
    
    // 不再需要设置月份，改为年度筛选
    if (statsMonthEl) statsMonthEl.value = currentMonth;
    if (financeMonthEl) financeMonthEl.value = currentMonth;
    if (teacherHoursMonthEl) teacherHoursMonthEl.value = currentMonth;
    
    // 默认显示首页
    switchPage('home');
});

// 页面切换
function switchPage(page) {
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    // 显示目标页面
    const targetPage = document.getElementById(page + '-page');
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // 根据页面加载数据（只在首次进入时加载）
    if (page === 'students') {
        loadStudents();
    } else if (page === 'teachers') {
        loadTeachers();
    } else if (page === 'courses') {
        loadCourses();
    } else if (page === 'payments') {
        loadPayments();
    } else if (page === 'stats') {
        loadStats();
    } else if (page === 'finance') {
        loadFinance();
    }
}

// ==================== 学生管理 ====================

function loadStudents() {
    const status = document.getElementById('student-status-filter').value;
    const url = status ? `/api/students?status=${status}` : '/api/students';
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            const tbody = document.getElementById('students-table-body');
            tbody.innerHTML = data.map(s => {
                return `
                <tr>
                    <td>${s.name}</td>
                    <td>${s.grade || '-'}</td>
                    <td><span class="status-badge status-${s.status === '在校' ? 'normal' : 'deleted'}">${s.status}</span></td>
                    <td>${s.phone || '-'}</td>
                    <td>${s.parent_name || '-'}</td>
                    <td>
                        <button class="btn btn-warning" onclick="showEditStudentModal(${s.id})">编辑</button>
                        <button class="btn btn-danger" onclick="deleteStudent(${s.id})" data-student-id="${s.id}">删除</button>
                    </td>
                </tr>
            `;
            }).join('');
        });
}

// 确保函数在全局作用域
window.showAddStudentModal = function() {
    const modalBody = `
        <h2>新增学生</h2>
        <form id="student-form" onsubmit="saveStudent(event)">
            <div class="form-group">
                <label>姓名 *</label>
                <input type="text" name="name" required>
            </div>
            <div class="form-group">
                <label>年级</label>
                <input type="text" name="grade">
            </div>
            <div class="form-group">
                <label>状态</label>
                <select name="status">
                    <option value="在校">在校</option>
                    <option value="离校">离校</option>
                </select>
            </div>
            <div class="form-group">
                <label>联系电话</label>
                <input type="text" name="phone">
            </div>
            <div class="form-group">
                <label>家长姓名</label>
                <input type="text" name="parent_name">
            </div>
            <div class="form-group">
                <label>家长电话</label>
                <input type="text" name="parent_phone">
            </div>
            <div class="form-group">
                <label>地址</label>
                <input type="text" name="address">
            </div>
            <div class="form-group">
                <label>备注/学习记录</label>
                <textarea name="notes" rows="4" placeholder="请输入备注或学习记录"></textarea>
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">取消</button>
                <button type="submit" class="btn btn-primary">保存</button>
            </div>
        </form>
    `;
    showModal(modalBody);
}

window.showEditStudentModal = function(id) {
    fetch(`/api/students`)
        .then(res => res.json())
        .then(students => {
            const student = students.find(s => s.id === id);
            if (!student) return;
            
            const modalBody = `
                <h2>编辑学生</h2>
                <form id="student-form" onsubmit="saveStudent(event, ${id})">
                    <div class="form-group">
                        <label>姓名 *</label>
                        <input type="text" name="name" value="${student.name || ''}" required>
                    </div>
                    <div class="form-group">
                        <label>年级</label>
                        <input type="text" name="grade" value="${student.grade || ''}">
                    </div>
                    <div class="form-group">
                        <label>状态</label>
                        <select name="status">
                            <option value="在校" ${student.status === '在校' ? 'selected' : ''}>在校</option>
                            <option value="离校" ${student.status === '离校' ? 'selected' : ''}>离校</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>联系电话</label>
                        <input type="text" name="phone" value="${student.phone || ''}">
                    </div>
                    <div class="form-group">
                        <label>家长姓名</label>
                        <input type="text" name="parent_name" value="${student.parent_name || ''}">
                    </div>
                    <div class="form-group">
                        <label>家长电话</label>
                        <input type="text" name="parent_phone" value="${student.parent_phone || ''}">
                    </div>
                    <div class="form-group">
                        <label>地址</label>
                        <input type="text" name="address" value="${student.address || ''}">
                    </div>
                    <div class="form-group">
                        <label>备注/学习记录</label>
                        <textarea name="notes" rows="4" placeholder="请输入备注或学习记录">${student.notes || ''}</textarea>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn" onclick="closeModal()">取消</button>
                        <button type="submit" class="btn btn-primary">保存</button>
                    </div>
                </form>
            `;
            showModal(modalBody);
        });
}

// 确保函数在全局作用域
window.saveStudent = function(e, id) {
    console.log('saveStudent called, id:', id);
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    const url = id ? `/api/students/${id}` : '/api/students';
    const method = id ? 'PUT' : 'POST';
    
    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => {
        console.log('Save response status:', res.status);
        if (!res.ok) {
            return res.json().then(err => {
                console.error('Save error:', err);
                throw new Error(err.error || '保存失败');
            });
        }
        return res.json();
    })
    .then(data => {
        console.log('Save success:', data);
        alert('保存成功！');
        closeModal();
        loadStudents();
    })
    .catch(error => {
        console.error('保存学生失败:', error);
        alert('保存失败：' + (error.message || '未知错误'));
    });
};

// 全局API错误处理：检测会话失效
let sessionExpiredHandled = false; // 防止重复弹窗

(function() {
    // 保存原始的fetch函数
    const originalFetch = window.fetch;
    
    // 重写fetch函数，添加全局错误处理
    window.fetch = function(...args) {
        return originalFetch.apply(this, args)
            .then(async response => {
                // 检查是否是401错误且包含session_expired
                if (response.status === 401 && !sessionExpiredHandled) {
                    try {
                        const data = await response.json();
                        if (data.session_expired) {
                            sessionExpiredHandled = true;
                            
                            // 显示确认弹窗
                            const confirmed = confirm('您的账号在其他地方登录，当前会话已失效。\n\n点击"确定"将跳转到登录页面重新登录。\n点击"取消"可以继续浏览（但操作可能失败）。');
                            
                            if (confirmed) {
                                // 用户确认，清除本地数据并跳转到登录页
                                console.warn('用户确认会话失效，跳转到登录页');
                                localStorage.clear();
                                sessionStorage.clear();
                                window.location.href = '/login';
                            } else {
                                // 用户取消，重置标志，允许继续操作（但可能会失败）
                                console.warn('用户取消跳转，继续当前会话（操作可能失败）');
                                sessionExpiredHandled = false;
                            }
                            
                            // 返回一个rejected promise，阻止后续处理
                            return Promise.reject(new Error('Session expired'));
                        }
                    } catch (e) {
                        // 如果解析JSON失败，继续处理
                    }
                }
                return Promise.resolve(response);
            });
    };
})();

// 确保函数在全局作用域
// 防止重复删除的标记
let isDeleting = false;

window.deleteStudent = function(id) {
    console.log('deleteStudent called with id:', id, 'type:', typeof id);
    
    // 防止重复点击
    if (isDeleting) {
        console.log('删除操作正在进行中，请勿重复点击');
        return;
    }
    
    // 确保ID是数字类型
    const studentId = parseInt(id);
    if (!studentId || isNaN(studentId)) {
        console.error('deleteStudent: invalid id', id);
        alert('删除失败：学生ID无效');
        return;
    }
    
    // 提示用户删除操作会级联删除所有相关数据
    if (!confirm('确定要删除这个学生吗？\n\n注意：删除学生将同时删除以下所有相关数据：\n- 所有排课记录\n- 学生课时统计\n- 缴费记录\n- 老师课时将自动重新计算\n\n此操作不可恢复！')) {
        console.log('User cancelled deletion');
        return;
    }
    
    // 设置删除标记
    isDeleting = true;
    
    const deleteUrl = `/api/students/${studentId}`;
    console.log('Proceeding with deletion, URL:', deleteUrl);
    
    fetch(deleteUrl, { 
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    })
        .then(res => {
            console.log('Delete response status:', res.status, res.statusText);
            if (!res.ok) {
                // 尝试解析错误响应
                return res.json().then(err => {
                    console.error('Delete error response:', err);
                    // 如果是404且提示学生不存在，可能是已经被删除，显示友好提示
                    if (res.status === 404 && err.error && err.error.includes('不存在')) {
                        throw new Error('该学生不存在或已被删除');
                    }
                    throw new Error(err.error || `删除失败 (${res.status})`);
                }).catch((parseError) => {
                    // 如果JSON解析失败，返回状态码错误
                    if (res.status === 404) {
                        throw new Error('该学生不存在或已被删除');
                    }
                    throw new Error(`删除失败：服务器返回错误 (${res.status})`);
                });
            }
            return res.json();
        })
        .then(data => {
            console.log('Delete success:', data);
            alert(data.message || '删除成功！已删除学生及其所有相关数据。');
            loadStudents();
        })
        .catch(error => {
            console.error('删除学生失败:', error);
            alert('删除失败：' + (error.message || '未知错误'));
        })
        .finally(() => {
            // 重置删除标记
            isDeleting = false;
        });
};

function searchStudents() {
    const keyword = document.getElementById('student-search').value.toLowerCase();
    const rows = document.querySelectorAll('#students-table-body tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(keyword) ? '' : 'none';
    });
}

// ==================== 教师管理 ====================

function loadTeachers() {
    fetch('/api/teachers')
        .then(res => res.json())
        .then(data => {
            const tbody = document.getElementById('teachers-table-body');
            tbody.innerHTML = data.map((t, index) => {
                // 处理简介显示（只显示前三个字）
                const bio = t.bio || '';
                let bioDisplay = '-';
                let bioMoreLink = '';
                const bioId = `bio-${t.id}`;
                const escapedBio = bio.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                
                if (bio && bio.length > 0) {
                    if (bio.length > 3) {
                        // 只显示前三个字，然后显示"更多"链接
                        bioDisplay = escapedBio.substring(0, 3);
                        // 使用全局变量存储数据，通过ID访问
                        if (!window.teacherBios) window.teacherBios = {};
                        window.teacherBios[t.id] = { name: t.name || '', bio: bio };
                        bioMoreLink = `<span class="bio-more-link" onclick="showBioModal(${t.id})">更多</span>`;
                    } else {
                        bioDisplay = escapedBio;
                    }
                }
                
                return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${t.name}</td>
                    <td>${t.subject || '-'}</td>
                    <td>${t.phone || '-'}</td>
                    <td id="${bioId}" style="max-width: 300px; word-wrap: break-word;">
                        <span class="bio-short">${bioDisplay}</span>${bioMoreLink}
                    </td>
                    <td>${t.base_salary || 0}</td>
                    <td><span class="status-badge status-${(t.employment_type || '兼职') === '全职' ? 'normal' : 'deleted'}">${t.employment_type || '兼职'}</span></td>
                    <td><span class="status-badge status-${(t.status || '启用') === '启用' ? 'normal' : 'deleted'}">${t.status || '启用'}</span></td>
                    <td>
                        <button class="btn btn-warning" onclick="showEditTeacherModal(${t.id})">编辑</button>
                        <button class="btn btn-danger" onclick="deleteTeacher(${t.id})">删除</button>
                    </td>
                </tr>
            `;
            }).join('');
        });
}

// 显示简介模态框
window.showBioModal = function(teacherId) {
    try {
        if (!window.teacherBios || !window.teacherBios[teacherId]) {
            console.error('未找到教师简介数据');
            alert('未找到简介数据');
            return;
        }
        
        const teacherData = window.teacherBios[teacherId];
        const bio = teacherData.bio || '';
        const teacherName = teacherData.name || '教师';
        
        // 转义HTML
        const escapedBio = bio.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const escapedName = teacherName.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        
        const modalBody = `
            <h2>${escapedName} - 简介</h2>
            <div style="padding: 20px; line-height: 1.8; white-space: pre-wrap; word-wrap: break-word; max-height: 60vh; overflow-y: auto;">
                ${escapedBio}
            </div>
            <div class="form-actions" style="margin-top: 20px;">
                <button type="button" class="btn btn-primary" onclick="closeModal()">关闭</button>
            </div>
        `;
        showModal(modalBody);
    } catch (e) {
        console.error('显示简介失败:', e);
        alert('显示简介失败：' + e.message);
    }
};

function showAddTeacherModal() {
    fetch('/api/courses_manage/subjects')
        .then(res => res.json())
        .then(subjects => {
            const subjectOptions = '<option value="">-- 请选择科目 --</option>' + 
                subjects.map(subject => `<option value="${subject}">${subject}</option>`).join('');
            
            const modalBody = `
                <h2>新增教师</h2>
                <form id="teacher-form" data-teacher-id="" enctype="multipart/form-data">
                    <div class="form-group">
                        <label>姓名 *</label>
                        <input type="text" name="name" required>
                    </div>
                    <div class="form-group">
                        <label>科目</label>
                        <select name="subject">${subjectOptions}</select>
                    </div>
                    <div class="form-group">
                        <label>联系电话</label>
                        <input type="text" name="phone">
                    </div>
                    <div class="form-group">
                        <label>简介</label>
                        <textarea name="bio" rows="4" placeholder="请输入教师简介"></textarea>
                    </div>
                    <div class="form-group">
                        <label>底薪</label>
                        <input type="number" name="base_salary" step="0.01" value="0">
                    </div>
                    <div class="form-group">
                        <label>兼职/全职</label>
                        <select name="employment_type">
                            <option value="兼职" selected>兼职</option>
                            <option value="全职">全职</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>状态</label>
                        <select name="status">
                            <option value="启用" selected>启用</option>
                            <option value="停用">停用</option>
                        </select>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn" onclick="closeModal()">取消</button>
                        <button type="submit" class="btn btn-primary">保存</button>
                    </div>
                </form>
            `;
            showModal(modalBody);
        })
        .catch(err => {
            console.error('获取科目列表失败:', err);
            // 如果获取失败，使用文本输入框作为后备
                const modalBody = `
                    <h2>新增教师</h2>
                    <form id="teacher-form" data-teacher-id="" enctype="multipart/form-data">
                        <div class="form-group">
                            <label>姓名 *</label>
                            <input type="text" name="name" required>
                        </div>
                        <div class="form-group">
                            <label>科目</label>
                            <input type="text" name="subject">
                        </div>
                        <div class="form-group">
                            <label>联系电话</label>
                            <input type="text" name="phone">
                        </div>
                        <div class="form-group">
                            <label>简介</label>
                            <textarea name="bio" rows="4" placeholder="请输入教师简介"></textarea>
                        </div>
                        <div class="form-group">
                            <label>底薪</label>
                            <input type="number" name="base_salary" step="0.01" value="0">
                        </div>
                        <div class="form-group">
                            <label>兼职/全职</label>
                            <select name="employment_type">
                                <option value="兼职" selected>兼职</option>
                                <option value="全职">全职</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>状态</label>
                            <select name="status">
                                <option value="启用" selected>启用</option>
                                <option value="停用">停用</option>
                            </select>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn" onclick="closeModal()">取消</button>
                            <button type="submit" class="btn btn-primary">保存</button>
                        </div>
                    </form>
                `;
            showModal(modalBody);
        });
}

function showEditTeacherModal(id) {
    Promise.all([
        fetch('/api/teachers').then(r => r.json()),
        fetch('/api/courses_manage/subjects').then(r => r.json())
    ]).then(([teachers, subjects]) => {
        const teacher = teachers.find(t => t.id === id);
        if (!teacher) return;
        
        const subjectOptions = '<option value="">-- 请选择科目 --</option>' + 
            subjects.map(subject => `<option value="${subject}" ${subject === teacher.subject ? 'selected' : ''}>${subject}</option>`).join('');
        
        const modalBody = `
            <h2>编辑教师</h2>
            <form id="teacher-form" data-teacher-id="${id}" enctype="multipart/form-data">
                <div class="form-group">
                    <label>姓名 *</label>
                    <input type="text" name="name" value="${teacher.name}" required>
                </div>
                <div class="form-group">
                    <label>科目</label>
                    <select name="subject">${subjectOptions}</select>
                </div>
                <div class="form-group">
                    <label>联系电话</label>
                    <input type="text" name="phone" value="${teacher.phone || ''}">
                </div>
                <div class="form-group">
                    <label>简介</label>
                    <textarea name="bio" rows="4" placeholder="请输入教师简介">${teacher.bio || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>底薪</label>
                    <input type="number" name="base_salary" step="0.01" value="${teacher.base_salary || 0}">
                </div>
                <div class="form-group">
                    <label>兼职/全职</label>
                    <select name="employment_type">
                        <option value="兼职" ${(teacher.employment_type || '兼职') === '兼职' ? 'selected' : ''}>兼职</option>
                        <option value="全职" ${(teacher.employment_type || '兼职') === '全职' ? 'selected' : ''}>全职</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>状态</label>
                    <select name="status">
                        <option value="启用" ${(teacher.status || '启用') === '启用' ? 'selected' : ''}>启用</option>
                        <option value="停用" ${(teacher.status || '启用') === '停用' ? 'selected' : ''}>停用</option>
                    </select>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn" onclick="closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        `;
        showModal(modalBody);
    })
    .catch(err => {
        console.error('获取数据失败:', err);
        // 如果获取失败，使用文本输入框作为后备
        fetch('/api/teachers')
            .then(res => res.json())
            .then(teachers => {
                const teacher = teachers.find(t => t.id === id);
                if (!teacher) return;
                
                const modalBody = `
                    <h2>编辑教师</h2>
                    <form id="teacher-form" data-teacher-id="${id}" enctype="multipart/form-data">
                        <div class="form-group">
                            <label>姓名 *</label>
                            <input type="text" name="name" value="${teacher.name}" required>
                        </div>
                        <div class="form-group">
                            <label>科目</label>
                            <input type="text" name="subject" value="${teacher.subject || ''}">
                        </div>
                        <div class="form-group">
                            <label>联系电话</label>
                            <input type="text" name="phone" value="${teacher.phone || ''}">
                        </div>
                        <div class="form-group">
                            <label>简介</label>
                            <textarea name="bio" rows="4" placeholder="请输入教师简介">${teacher.bio || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>底薪</label>
                            <input type="number" name="base_salary" step="0.01" value="${teacher.base_salary || 0}">
                        </div>
                        <div class="form-group">
                            <label>兼职/全职</label>
                            <select name="employment_type">
                                <option value="兼职" ${(teacher.employment_type || '兼职') === '兼职' ? 'selected' : ''}>兼职</option>
                                <option value="全职" ${(teacher.employment_type || '兼职') === '全职' ? 'selected' : ''}>全职</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>状态</label>
                            <select name="status">
                                <option value="启用" ${(teacher.status || '启用') === '启用' ? 'selected' : ''}>启用</option>
                                <option value="停用" ${(teacher.status || '启用') === '停用' ? 'selected' : ''}>停用</option>
                            </select>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn" onclick="closeModal()">取消</button>
                            <button type="submit" class="btn btn-primary">保存</button>
                        </div>
                    </form>
                `;
                showModal(modalBody);
            });
    });
}

function saveTeacher(e, id) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    // 处理数字字段
    const baseSalary = formData.get('base_salary');
    if (baseSalary) {
        formData.set('base_salary', parseFloat(baseSalary) || 0);
    }
    
    // 确保状态字段有默认值
    if (!formData.get('status')) {
        formData.set('status', '启用');
    }
    
    const url = id ? `/api/teachers/${id}` : '/api/teachers';
    const method = id ? 'PUT' : 'POST';
    
    console.log('保存教师数据:', Object.fromEntries(formData));
    console.log('请求URL:', url);
    console.log('请求方法:', method);
    
    fetch(url, {
        method: method,
        body: formData  // 使用FormData，不要设置Content-Type，让浏览器自动设置
    })
    .then(async res => {
        console.log('响应状态:', res.status);
        console.log('响应头:', res.headers.get('content-type'));
        
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await res.text();
            console.error('服务器返回非JSON响应:', text.substring(0, 500));
            throw new Error(`服务器返回了HTML页面 (状态码: ${res.status})，可能是路由错误`);
        }
        
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status} 错误` }));
            throw errorData;
        }
        return res.json();
    })
    .then((result) => {
        console.log('保存成功:', result);
        alert('保存成功！');

        closeModal();
        loadTeachers();
    })
    .catch(err => {
        console.error('保存教师失败:', err);
        const errorMsg = err.message || err.error || JSON.stringify(err) || '未知错误';
        alert('保存失败：' + errorMsg);
    });
}

// 确保函数在全局作用域
// 防止重复删除的标记
let isDeletingTeacher = false;

window.deleteResume = function(teacherId) {
    if (!confirm('确定要删除该教师的简历吗？')) {
        return;
    }
    
    // 创建一个 FormData 并设置 resume 字段为空字符串，表示删除简历
    const formData = new FormData();
    formData.set('resume', '');  // 设置空值表示删除
    
    fetch(`/api/teachers/${teacherId}`, {
        method: 'PUT',
        body: formData
    })
    .then(async res => {
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await res.text();
            console.error('服务器返回非JSON响应:', text.substring(0, 500));
            throw new Error(`服务器返回了HTML页面 (状态码: ${res.status})，可能是路由错误`);
        }
        
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status} 错误` }));
            throw errorData;
        }
        return res.json();
    })
    .then((result) => {
        console.log('删除简历成功:', result);
        alert('简历已删除！');
        // 刷新教师列表
        if (typeof loadTeachers === 'function') {
            loadTeachers();
        } else {
            window.location.reload();
        }
        // 如果编辑表单是打开的，重新加载编辑表单
        const form = document.getElementById('teacher-form');
        if (form) {
            showEditTeacherModal(teacherId);
        }
    })
    .catch(err => {
        console.error('删除简历失败:', err);
        console.error('错误对象:', err);
        const errorMsg = err.message || (err.error && (err.error.error || err.error.message)) || JSON.stringify(err) || '未知错误';
        alert('删除失败：' + errorMsg);
    });
};


window.deleteTeacher = function(id) {
    console.log('deleteTeacher called with id:', id, 'type:', typeof id);
    
    // 防止重复点击
    if (isDeletingTeacher) {
        console.log('删除操作正在进行中，请勿重复点击');
        return;
    }
    
    // 确保ID是数字类型
    const teacherId = parseInt(id);
    if (!teacherId || isNaN(teacherId)) {
        console.error('deleteTeacher: invalid id', id);
        alert('删除失败：教师ID无效');
        return;
    }
    
    // 提示用户删除操作
    if (!confirm('确定要删除这个教师吗？\n\n注意：删除教师将同时删除以下所有相关数据：\n- 所有排课记录\n- 教师课时统计\n- 教师成本记录\n\n此操作不可恢复！')) {
        console.log('User cancelled deletion');
        return;
    }
    
    // 设置删除标记
    isDeletingTeacher = true;
    
    const deleteUrl = `/api/teachers/${teacherId}`;
    console.log('Proceeding with deletion, URL:', deleteUrl);
    
    fetch(deleteUrl, { 
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    })
        .then(res => {
            console.log('Delete response status:', res.status, res.statusText);
            if (!res.ok) {
                // 尝试解析错误响应
                return res.json().then(err => {
                    console.error('Delete error response:', err);
                    // 如果是404且提示教师不存在，可能是已经被删除，显示友好提示
                    if (res.status === 404 && err.error && err.error.includes('不存在')) {
                        throw new Error('该教师不存在或已被删除');
                    }
                    throw new Error(err.error || `删除失败 (${res.status})`);
                }).catch((parseError) => {
                    // 如果JSON解析失败，返回状态码错误
                    if (res.status === 404) {
                        throw new Error('该教师不存在或已被删除');
                    }
                    throw new Error(`删除失败：服务器返回错误 (${res.status})`);
                });
            }
            return res.json();
        })
        .then(data => {
            console.log('Delete success:', data);
            alert(data.message || '删除成功！已删除教师及其所有相关数据。');
            loadTeachers();
        })
        .catch(error => {
            console.error('删除教师失败:', error);
            alert('删除失败：' + (error.message || '未知错误'));
        })
        .finally(() => {
            // 重置删除标记
            isDeletingTeacher = false;
        });
};

// ==================== 排课管理 ====================

// 切换视图模式的函数（设置模式，不切换）
function switchViewMode(mode) {
    const listView = document.getElementById('courses-list-view');
    const weekView = document.getElementById('courses-week-view');
    const modeBtn = document.getElementById('view-mode-btn');
    
    if (!listView || !weekView) return;
    
    if (mode === 'week') {
        window.currentViewMode = 'week';
        if (typeof currentViewMode !== 'undefined') {
            currentViewMode = 'week';
        }
        listView.style.display = 'none';
        weekView.style.display = 'block';
        if (modeBtn) modeBtn.textContent = '切换到列表模式';
    } else {
        window.currentViewMode = 'list';
        if (typeof currentViewMode !== 'undefined') {
            currentViewMode = 'list';
        }
        listView.style.display = 'block';
        weekView.style.display = 'none';
        if (modeBtn) modeBtn.textContent = '切换到星期模式';
    }
}

// 保存并恢复页面状态的函数
function refreshPageWithCurrentSelection() {
    // 保存当前状态
    const monthInput = document.getElementById('course-month');
    const weekSelect = document.getElementById('course-week-select');
    const viewMode = window.currentViewMode || 'list';
    const filterTeacher = document.getElementById('filter-teacher');
    const filterClassroom = document.getElementById('filter-classroom');
    const filterSubject = document.getElementById('filter-subject');
    const filterGrade = document.getElementById('filter-grade');
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    
    const savedState = {
        month: monthInput ? monthInput.value : '',
        week: weekSelect ? weekSelect.value : '',
        viewMode: viewMode,
        filterTeacher: filterTeacher ? filterTeacher.value : '',
        filterClassroom: filterClassroom ? filterClassroom.value : '',
        filterSubject: filterSubject ? filterSubject.value : '',
        filterGrade: filterGrade ? filterGrade.value : '',
        scrollPosition: scrollPosition,
        currentPage: coursesCurrentPage || 1
    };
    
    // 设置保留分页标志
    if (savedState.viewMode === 'list' && savedState.currentPage) {
        coursesCurrentPage = savedState.currentPage;
        window.preserveCoursesPage = true;
    }
    
    // 刷新数据
    loadCourses().then(() => {
        // 恢复状态
        if (monthInput && savedState.month) {
            monthInput.value = savedState.month;
        }
        if (weekSelect && savedState.week) {
            weekSelect.value = savedState.week;
        }
        if (filterTeacher && savedState.filterTeacher) {
            filterTeacher.value = savedState.filterTeacher;
        }
        if (filterClassroom && savedState.filterClassroom) {
            filterClassroom.value = savedState.filterClassroom;
        }
        if (filterSubject && savedState.filterSubject) {
            filterSubject.value = savedState.filterSubject;
        }
        if (filterGrade && savedState.filterGrade) {
            filterGrade.value = savedState.filterGrade;
        }
        
        // 恢复视图模式
        switchViewMode(savedState.viewMode);
        
        // 恢复分页（列表模式下，如果数据已加载）
        if (savedState.viewMode === 'list' && savedState.currentPage) {
            coursesCurrentPage = savedState.currentPage;
            renderCoursesPage();
        }
        
        // 恢复滚动位置（延迟执行，确保DOM已更新）
        setTimeout(() => {
            window.scrollTo(0, savedState.scrollPosition);
        }, 100);
    }).catch(err => {
        console.error('刷新页面失败:', err);
    });
}

function loadCourses() {
    const monthInput = document.getElementById('course-month');
    const weekSelect = document.getElementById('course-week-select');
    
    console.log('loadCourses 被调用');
    console.log('月份:', monthInput ? monthInput.value : 'null');
    console.log('周数:', weekSelect ? weekSelect.value : 'null');
    
    let url = '/api/courses';
    const params = [];
    
    if (monthInput && monthInput.value && weekSelect && weekSelect.value) {
        const month = monthInput.value;
        const week = weekSelect.value;
        params.push(`month=${encodeURIComponent(month)}`);
        params.push(`week=${encodeURIComponent(week)}`);
        console.log('使用选择的月份和周:', month, week);
    } else {
        // 如果没有选择，使用当前年月和周
        const today = new Date();
        const currentMonth = today.toISOString().slice(0, 7);
        const weekNum = getWeekInMonth(today);
        params.push(`month=${encodeURIComponent(currentMonth)}`);
        params.push(`week=${encodeURIComponent(weekNum)}`);
        console.log('使用当前日期:', currentMonth, weekNum);
    }
    
    // 添加筛选参数
    const filterTeacher = document.getElementById('filter-teacher');
    const filterClassroom = document.getElementById('filter-classroom');
    const filterSubject = document.getElementById('filter-subject');
    const filterGrade = document.getElementById('filter-grade');
    
    // 检查URL参数中是否有student_id（用于从学生删除页面跳转过来）
    const urlParams = new URLSearchParams(window.location.search);
    const studentIdFromURL = urlParams.get('student_id');
    
    if (filterTeacher && filterTeacher.value) {
        params.push(`teacher=${encodeURIComponent(filterTeacher.value)}`);
    }
    if (filterClassroom && filterClassroom.value) {
        params.push(`classroom=${encodeURIComponent(filterClassroom.value)}`);
    }
    if (filterSubject && filterSubject.value) {
        params.push(`subject=${encodeURIComponent(filterSubject.value)}`);
    }
    if (filterGrade && filterGrade.value) {
        params.push(`grade=${encodeURIComponent(filterGrade.value)}`);
    }
    if (studentIdFromURL) {
        params.push(`student_id=${encodeURIComponent(studentIdFromURL)}`);
    }
    
    if (params.length > 0) {
        url += '?' + params.join('&');
    }
    
    console.log('请求URL:', url);
    
    // 如果财务配置未加载，先加载配置
    const loadConfigPromise = window.minHoursForReminder === undefined 
        ? fetch('/api/finance-config')
            .then(res => {
                if (!res.ok) {
                    // 429错误时，使用默认值
                    if (res.status === 429) {
                        console.warn('财务配置API返回429错误，使用默认值');
                        window.minHoursForReminder = 3;
                        return Promise.resolve();
                    }
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.json();
            })
            .then(configs => {
                // 确保configs是数组
                const configsArray = Array.isArray(configs) ? configs : [];
                const reminderConfig = configsArray.find(c => c.key === 'min_hours_for_reminder');
                const reminderThreshold = reminderConfig ? reminderConfig.value : 3;
                window.minHoursForReminder = reminderThreshold;
                console.log('已加载提醒课时阈值配置:', reminderThreshold);
            })
            .catch(err => {
                console.warn('加载财务配置失败，使用默认值:', err);
                window.minHoursForReminder = 3;
            })
        : Promise.resolve();
    
    // 预加载时段列表（如果还没有加载）
    const loadTimeSlotsPromise = (!window.allTimeSlots || !Array.isArray(window.allTimeSlots) || window.allTimeSlots.length === 0)
        ? fetch('/api/time-slots?status=启用')
            .then(res => {
                if (!res.ok) {
                    // 429错误时，尝试使用缓存
                    if (res.status === 429) {
                        const cachedTimeSlots = localStorage.getItem('cached_time_slots');
                        if (cachedTimeSlots) {
                            try {
                                const cachedSlots = JSON.parse(cachedTimeSlots);
                                if (Array.isArray(cachedSlots) && cachedSlots.length > 0) {
                                    window.allTimeSlots = cachedSlots;
                                    console.log('预加载时段列表：使用缓存（429错误）');
                                    return Promise.resolve([]); // 返回空数组，避免继续处理
                                }
                            } catch (e) {
                                console.warn('预加载时段列表：解析缓存失败', e);
                            }
                        }
                        // 如果没有缓存，尝试使用全局变量（可能在其他地方已加载）
                        if (window.allTimeSlots && Array.isArray(window.allTimeSlots) && window.allTimeSlots.length > 0) {
                            console.log('预加载时段列表：使用全局变量（429错误）');
                            return Promise.resolve([]); // 返回空数组，避免继续处理
                        }
                        // 429错误但没有缓存，不抛出错误，静默失败
                        console.warn('预加载时段列表：429错误且无缓存，跳过预加载');
                        return Promise.resolve([]);
                    }
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.json();
            })
            .then(slots => {
                // 如果slots是空数组，说明使用了缓存，不需要处理
                if (slots.length === 0) {
                    return;
                }
                
                if (Array.isArray(slots) && slots.length > 0) {
                    slots.sort((a, b) => {
                        const orderA = a.sort_order !== null && a.sort_order !== undefined ? a.sort_order : 999;
                        const orderB = b.sort_order !== null && b.sort_order !== undefined ? b.sort_order : 999;
                        if (orderA !== orderB) {
                            return orderA - orderB;
                        }
                        return (a.name || '').localeCompare(b.name || '');
                    });
                    window.allTimeSlots = slots;
                    // 同时更新缓存
                    localStorage.setItem('cached_time_slots', JSON.stringify(slots));
                    localStorage.setItem('cached_time_slots_timestamp', Date.now().toString());
                    console.log('预加载时段列表成功:', slots.map(s => s.name));
                }
            })
            .catch(err => {
                console.warn('预加载时段列表失败（不影响主流程）:', err);
                // 尝试使用缓存
                const cachedTimeSlots = localStorage.getItem('cached_time_slots');
                if (cachedTimeSlots) {
                    try {
                        const cachedSlots = JSON.parse(cachedTimeSlots);
                        if (Array.isArray(cachedSlots) && cachedSlots.length > 0) {
                            window.allTimeSlots = cachedSlots;
                            console.log('预加载时段列表：使用缓存（API失败）');
                        }
                    } catch (e) {
                        // 忽略
                    }
                }
                // 即使失败也不抛出错误，静默处理
            })
        : Promise.resolve();
    
    return Promise.all([loadConfigPromise, loadTimeSlotsPromise]).then(() => {
        return fetch(url)
            .then(res => {
                console.log('API响应状态:', res.status);
                if (!res.ok) {
                    // 处理429错误（请求过于频繁）
                    if (res.status === 429) {
                        return res.json().then(data => {
                            throw new Error(data.error || '请求过于频繁，请稍后再试');
                        });
                    }
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.json();
            })
            .then(data => {
            console.log('API返回数据数量:', data ? data.length : 0);
            console.log('API返回数据:', data);
            
            // 检查URL参数中是否有student_id，更新提示信息
            const urlParams = new URLSearchParams(window.location.search);
            const studentIdFromURL = urlParams.get('student_id');
            const studentNoticeElement = document.getElementById('student-filter-notice');
            if (studentIdFromURL && studentNoticeElement) {
                // 过滤掉已删除的记录
                const validData = data ? data.filter(c => c.status !== '删除') : [];
                if (validData.length > 0) {
                    studentNoticeElement.style.cssText = 'background: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin: 10px 0; border-radius: 4px; color: #856404;';
                    studentNoticeElement.innerHTML = `已筛选学生ID为 ${studentIdFromURL} 的排课记录（当前月共 ${validData.length} 条），请删除相关记录后再删除学生。<br><small>提示：如果删除检查提示有更多记录，可能在其他月份，请切换月份查看。</small>`;
                } else {
                    // 如果没有找到记录，可能是记录在其他月份，提示用户切换月份
                    studentNoticeElement.style.cssText = 'background: #f8d7da; border: 1px solid #dc3545; padding: 10px; margin: 10px 0; border-radius: 4px; color: #721c24;';
                    studentNoticeElement.innerHTML = `当前月份未找到学生ID为 ${studentIdFromURL} 的未删除排课记录。<br><small>如果删除检查提示有排课记录，可能在其他月份。请尝试切换不同的月份查看，或者如果确认所有记录都已删除，可以直接返回删除该学生。</small>`;
                }
            }
            
            // 检查当前视图模式
            const viewMode = window.currentViewMode || 'list';
            
            if (viewMode === 'week') {
                // 星期模式下隐藏分页控件
                const pagination = document.getElementById('courses-pagination');
                if (pagination) pagination.style.display = 'none';
                loadCoursesWeekView(data);
            } else {
                // 列表模式下显示分页控件
                // 检查是否应该保留当前页（通过全局标志）
                const preservePage = window.preserveCoursesPage || false;
                loadCoursesListView(data, preservePage);
                window.preserveCoursesPage = false; // 重置标志
            }
            
                return Promise.resolve();
            })
            .catch(error => {
                console.error('加载课程数据失败:', error);
                const errorMessage = error.message || '未知错误';
                // 如果是429错误，显示更友好的提示
                if (errorMessage.includes('请求过于频繁') || errorMessage.includes('429')) {
                    alert('请求过于频繁，请稍等片刻后再试。\n\n提示：如果频繁切换筛选条件或刷新页面，可能会触发速率限制。');
                } else {
                    alert('加载课程数据失败: ' + errorMessage);
                }
                return Promise.reject(error);
            });
    });
}

// 分页相关变量
let coursesAllData = [];
let coursesCurrentPage = 1;
const coursesPageSize = 10; // 每页最多10条记录

// 当前用户角色（用于权限控制）
let currentUserRole = null;

function loadCoursesListView(data, preservePage) {
    const tbody = document.getElementById('courses-table-body');
    if (!tbody) return;
    
    // 保存所有数据
    coursesAllData = data;
    // 存储课程数据到全局变量（用于confirmCourse函数）
    window.coursesData = data || [];
    
    // 按日期和时段排序
    coursesAllData.sort((a, b) => {
        if (a.course_date !== b.course_date) {
            return a.course_date.localeCompare(b.course_date);
        }
        return (a.time_slot || '').localeCompare(b.time_slot || '');
    });
    
    // 如果不保留当前页，重置到第一页
    if (!preservePage) {
        coursesCurrentPage = 1;
    }
    
    // 渲染当前页
    renderCoursesPage();
}

function renderCoursesPage() {
    const tbody = document.getElementById('courses-table-body');
    if (!tbody) return;
    
    if (coursesAllData.length === 0) {
        // 获取当前周的日期范围信息
        const monthInput = document.getElementById('course-month');
        const weekSelect = document.getElementById('course-week-select');
        let emptyMessage = '暂无排课数据';
        
        if (monthInput && weekSelect && monthInput.value && weekSelect.value) {
            const weekInfoLabel = document.getElementById('week-info-label');
            if (weekInfoLabel && weekInfoLabel.textContent) {
                // 使用周信息标签中的日期范围
                emptyMessage = `暂无排课数据（${weekInfoLabel.textContent}）`;
            } else {
                // 如果没有周信息标签，尝试计算日期范围
                try {
                    const [year, month] = monthInput.value.split('-').map(Number);
                    const weekNum = parseInt(weekSelect.value);
                    const firstDay = new Date(year, month - 1, 1);
                    const firstDayWeekday = firstDay.getDay();
                    const lastDay = new Date(year, month, 0);
                    const monthEnd = lastDay.getDate();
                    
                    let startDate, endDate;
                    if (weekNum === 1) {
                        if (firstDayWeekday === 0) {
                            startDate = new Date(year, month - 1, 1);
                            endDate = new Date(year, month - 1, 1);
                        } else {
                            // 计算到周日需要多少天：7 - firstDayWeekday
                            // 例如：周三(3)需要4天到周日，周四(4)需要3天到周日
                            const daysToSunday = 7 - firstDayWeekday;
                            const firstSundayDate = Math.min(1 + daysToSunday, monthEnd);
                            startDate = new Date(year, month - 1, 1);
                            endDate = new Date(year, month - 1, firstSundayDate);
                        }
                    } else {
                        let daysToMonday;
                        if (firstDayWeekday === 0) {
                            daysToMonday = 1;
                        } else if (firstDayWeekday === 1) {
                            daysToMonday = 0;
                        } else {
                            daysToMonday = 8 - firstDayWeekday;
                        }
                        const firstMondayDate = 1 + daysToMonday;
                        const startDateNum = firstMondayDate + (weekNum - 2) * 7;
                        if (startDateNum <= monthEnd) {
                            startDate = new Date(year, month - 1, startDateNum);
                            const endDateNum = Math.min(startDateNum + 6, monthEnd);
                            endDate = new Date(year, month - 1, endDateNum);
                        }
                    }
                    
                    if (startDate && endDate) {
                        const formatDate = (date) => {
                            const m = String(date.getMonth() + 1).padStart(2, '0');
                            const d = String(date.getDate()).padStart(2, '0');
                            return `${m}-${d}`;
                        };
                        emptyMessage = `暂无排课数据（${formatDate(startDate)} 至 ${formatDate(endDate)}）`;
                    }
                } catch (e) {
                    console.error('计算日期范围失败:', e);
                }
            }
        }
        
        tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; padding: 20px; color: #666;">
            <div style="font-size: 14px;">${emptyMessage}</div>
            <div style="font-size: 12px; margin-top: 8px; color: #999;">提示：请检查筛选条件，或尝试切换到其他周查看</div>
        </td></tr>`;
        // 批量删除按钮始终显示，只隐藏分页控件
        const pagination = document.getElementById('courses-pagination');
        if (pagination) pagination.style.display = 'none';
        // 更新批量删除按钮文本（没有选中时显示"批量删除"）
        updateBatchDeleteButton();
        return;
    }
    
    // 显示分页控件
    const pagination = document.getElementById('courses-pagination');
    if (pagination) pagination.style.display = 'flex';
    
    // 计算总页数
    const totalPages = Math.ceil(coursesAllData.length / coursesPageSize);
    
    // 确保当前页在有效范围内
    if (coursesCurrentPage > totalPages) {
        coursesCurrentPage = totalPages || 1;
    }
    
    // 计算当前页的数据范围
    const startIndex = (coursesCurrentPage - 1) * coursesPageSize;
    const endIndex = Math.min(startIndex + coursesPageSize, coursesAllData.length);
    const currentPageData = coursesAllData.slice(startIndex, endIndex);
    
    // 获取当前用户角色（异步获取，但这里先使用同步方式，在渲染前获取）
    // 注意：这里需要异步获取用户信息，但为了简化，我们在渲染时检查
    // 实际权限检查在后端进行，前端只是UI层面的控制
    
    // 渲染当前页数据
    tbody.innerHTML = currentPageData.map((c, index) => {
        // 序号延续，基于全局索引：第一页01-10，第二页11-20，第三页21-30...
        const globalIndex = startIndex + index;
        const serialNumber = String(globalIndex + 1).padStart(2, '0');
        
        // 检查权限：已确认的排课只有管理员可以编辑和删除
        // 这里先渲染按钮，实际权限检查在后端
        // 前端通过检查全局变量 currentUserRole 来控制显示
        const isAdmin = typeof currentUserRole !== 'undefined' && currentUserRole === 'admin';
        const canEdit = !c.is_confirmed || isAdmin;
        const canDelete = !c.is_confirmed || isAdmin;
        
        const editButton = canEdit ? 
            `<button class="btn btn-warning" onclick="showEditCourseModal(${c.id})">编辑</button>` :
            `<button class="btn btn-warning" disabled title="无权限编辑已确认上课的排课，只有管理员可以编辑" style="opacity: 0.5; cursor: not-allowed;">编辑</button>`;
        
        const deleteButton = canDelete ? 
            `<button class="btn btn-danger" onclick="deleteCourse(${c.id})">删除</button>` :
            `<button class="btn btn-danger" disabled title="无权限删除已确认上课的排课，只有管理员可以删除" style="opacity: 0.5; cursor: not-allowed;">删除</button>`;
        
        // 如果已确认上课，整行显示为灰色
        const rowStyle = c.is_confirmed ? 'style="background-color: #f5f5f5; color: #666; opacity: 0.8;"' : '';
        
        return `
        <tr ${rowStyle}>
            <td><input type="checkbox" class="course-checkbox" value="${c.id}" ${!canDelete ? 'disabled title="已确认的排课只有管理员可以删除"' : ''} onchange="updateBatchDeleteButton()"></td>
            <td>${serialNumber}</td>
            <td>${c.student_name}</td>
            <td>${c.grade || '-'}</td>
            <td>${c.subject}</td>
            <td>${c.course_name || '-'}</td>
            <td>${c.teacher_name}</td>
            <td>${c.course_date}</td>
            <td>${c.weekday}</td>
            <td>${c.time_slot || '-'}</td>
            <td>${c.classroom || '-'}</td>
            <td><span class="status-badge status-${c.status === '正常' ? 'normal' : c.status === '请假' ? 'leave' : c.status === '跑空' ? 'empty' : 'deleted'}">${c.status}</span></td>
            <td>
                ${c.is_confirmed ? 
                    '<button class="btn btn-secondary" onclick="confirmCourse(' + c.id + ')" style="background: #6c757d; color: white;">取消确认</button>' : 
                    '<button class="btn btn-success" onclick="confirmCourse(' + c.id + ')" style="background: #28a745; color: white;">确认上课</button>'
                }
            </td>
            <td>
                ${editButton}
                ${deleteButton}
            </td>
        </tr>
    `;
    }).join('');
    
    // 更新分页信息
    updateCoursesPagination(totalPages);
    
    // 更新批量删除按钮显示状态
    updateBatchDeleteButton();
}

function updateCoursesPagination(totalPages) {
    const pageInfo = document.getElementById('courses-page-info');
    const prevBtn = document.getElementById('courses-prev-btn');
    const nextBtn = document.getElementById('courses-next-btn');
    
    if (pageInfo) {
        pageInfo.textContent = `第 ${coursesCurrentPage} 页，共 ${totalPages} 页`;
    }
    
    if (prevBtn) {
        prevBtn.disabled = coursesCurrentPage <= 1;
    }
    
    if (nextBtn) {
        nextBtn.disabled = coursesCurrentPage >= totalPages;
    }
}

function coursesPreviousPage() {
    if (coursesCurrentPage > 1) {
        coursesCurrentPage--;
        renderCoursesPage();
    }
}

function coursesNextPage() {
    const totalPages = Math.ceil(coursesAllData.length / coursesPageSize);
    if (coursesCurrentPage < totalPages) {
        coursesCurrentPage++;
        renderCoursesPage();
    }
}

function loadCoursesWeekView(data) {
    const thead = document.getElementById('week-view-thead');
    const tbody = document.getElementById('week-view-tbody');
    if (!thead || !tbody) return;
    
    // 过滤掉已删除的课程
    const validCourses = data.filter(c => c.status !== '删除');
    // 存储课程数据到全局变量（用于confirmCourse函数）
    window.coursesData = validCourses || [];
    
    // 调试：检查课程438
    const course438 = validCourses.find(c => c.id === 438);
    if (course438) {
        console.log('课程438数据:', course438);
        console.log('课程438时段:', course438.time_slot, '类型:', typeof course438.time_slot);
        console.log('课程438星期:', course438.weekday, '类型:', typeof course438.weekday);
    } else {
        console.log('课程438不在有效课程列表中');
    }
    
    // 从API获取所有启用的时段（确保显示所有时段，即使没有课程）
    // 首先尝试从localStorage获取缓存的时段列表
    const cachedTimeSlots = localStorage.getItem('cached_time_slots');
    const cachedTimeSlotsTimestamp = localStorage.getItem('cached_time_slots_timestamp');
    const cacheValidDuration = 24 * 60 * 60 * 1000; // 24小时缓存有效期（延长以应对429错误）
    
    // 辅助函数：使用缓存的时段数据
    function useCachedSlots(cachedData, isExpired = false) {
        try {
            const cachedSlots = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
            if (Array.isArray(cachedSlots) && cachedSlots.length > 0) {
                const timeSlotNames = cachedSlots.map(slot => slot.name || slot);
                console.log(isExpired ? '使用过期缓存的时段列表' : '使用缓存的时段列表', timeSlotNames);
                renderWeekViewTable(validCourses, timeSlotNames);
                return true;
            }
        } catch (e) {
            console.warn('解析缓存数据失败:', e);
        }
        return false;
    }
    
    // 检查是否有有效缓存
    let useCachedData = false;
    if (cachedTimeSlots && cachedTimeSlotsTimestamp) {
        const cacheAge = Date.now() - parseInt(cachedTimeSlotsTimestamp);
        if (cacheAge < cacheValidDuration) {
            if (useCachedSlots(cachedTimeSlots)) {
                useCachedData = true;
            }
        } else {
            console.log('缓存已过期，但仍可用于429错误降级');
        }
    } else {
        console.log('没有找到缓存数据');
    }
    
    // 如果使用了有效缓存数据，仍然在后台更新缓存
    if (useCachedData) {
        fetch('/api/time-slots?status=启用')
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.json();
            })
            .then(slots => {
                if (Array.isArray(slots) && slots.length > 0) {
                    localStorage.setItem('cached_time_slots', JSON.stringify(slots));
                    localStorage.setItem('cached_time_slots_timestamp', Date.now().toString());
                    console.log('后台更新时段缓存成功');
                }
            })
            .catch(err => {
                console.warn('后台更新时段缓存失败:', err);
            });
        return;
    }
    
    // 如果没有有效缓存，从API获取
    fetch('/api/time-slots?status=启用')
        .then(res => {
            if (!res.ok) {
                // 如果是429错误，优先使用缓存（即使过期）
                if (res.status === 429) {
                    console.warn('API返回429错误，尝试使用缓存');
                    if (cachedTimeSlots) {
                        if (useCachedSlots(cachedTimeSlots, true)) {
                            return null; // 返回null表示已使用缓存处理
                        }
                    }
                    // 如果没有缓存，尝试从全局变量获取（如果之前加载过）
                    if (window.allTimeSlots && Array.isArray(window.allTimeSlots) && window.allTimeSlots.length > 0) {
                        console.log('使用全局变量中的时段列表');
                        const timeSlotNames = window.allTimeSlots.map(slot => slot.name || slot);
                        renderWeekViewTable(validCourses, timeSlotNames);
                        return null;
                    }
                }
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        })
        .then(slots => {
            if (slots === null) return; // 已使用缓存处理
            
            // 确保slots是数组
            if (!Array.isArray(slots)) {
                console.warn('API返回的数据不是数组:', slots);
                slots = [];
            }
            
            // 按时段的sort_order排序
            slots.sort((a, b) => {
                const orderA = a.sort_order !== null && a.sort_order !== undefined ? a.sort_order : 999;
                const orderB = b.sort_order !== null && b.sort_order !== undefined ? b.sort_order : 999;
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                // 如果sort_order相同，按名称排序
                return (a.name || '').localeCompare(b.name || '');
            });
            
            // 保存到全局变量和缓存
            window.allTimeSlots = slots; // 保存到全局变量作为备用
            if (slots.length > 0) {
                localStorage.setItem('cached_time_slots', JSON.stringify(slots));
                localStorage.setItem('cached_time_slots_timestamp', Date.now().toString());
            }
            
            let timeSlotNames = slots.map(slot => slot.name);
            
            console.log('API返回的时段列表:', timeSlotNames);
            
            // 如果API返回的时段为空，尝试从课程数据中提取作为补充
            if (timeSlotNames.length === 0) {
                const timeSlotsFromCourses = new Set();
                validCourses.forEach(c => {
                    if (c.time_slot) {
                        timeSlotsFromCourses.add(c.time_slot.trim());
                    }
                });
                const sortedSlots = Array.from(timeSlotsFromCourses).sort();
                console.log('从课程数据提取的时段:', sortedSlots);
                timeSlotNames = sortedSlots;
            }
            
            // 无论是否有课程，都显示所有时段
            renderWeekViewTable(validCourses, timeSlotNames);
        })
        .catch(err => {
            console.error('获取时段列表失败:', err);
            
            // 如果API失败，优先尝试使用过期缓存
            if (cachedTimeSlots) {
                if (useCachedSlots(cachedTimeSlots, true)) {
                    return;
                }
            }
            
            // 尝试使用全局变量
            if (window.allTimeSlots && Array.isArray(window.allTimeSlots) && window.allTimeSlots.length > 0) {
                console.log('使用全局变量中的时段列表（API失败）');
                const timeSlotNames = window.allTimeSlots.map(slot => slot.name || slot);
                renderWeekViewTable(validCourses, timeSlotNames);
                return;
            }
            
            // 如果缓存和全局变量都不可用，从课程数据中提取（这是最后的选择）
            const timeSlots = new Set();
            validCourses.forEach(c => {
                if (c.time_slot) {
                    timeSlots.add(c.time_slot.trim());
                }
            });
            const sortedSlots = Array.from(timeSlots).sort();
            console.warn('从课程数据提取的时段（API和缓存都失败，可能不完整）:', sortedSlots);
            // 即使API失败，也要显示时段（从课程数据提取的）
            renderWeekViewTable(validCourses, sortedSlots);
        });
}

function renderWeekViewTable(courses, timeSlots) {
    const thead = document.getElementById('week-view-thead');
    const tbody = document.getElementById('week-view-tbody');
    
    // 星期顺序
    const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    
    // 获取当前周的日期信息
    const monthInput = document.getElementById('course-month');
    const weekSelect = document.getElementById('course-week-select');
    let dateMap = {}; // weekday -> date string
    
    if (monthInput && weekSelect && monthInput.value && weekSelect.value) {
        // 计算当前周的日期范围
        const [year, month] = monthInput.value.split('-').map(Number);
        const weekNum = parseInt(weekSelect.value);
        const firstDay = new Date(year, month - 1, 1);
        const firstDayWeekday = firstDay.getDay(); // 0=周日, 1=周一, ..., 6=周六
        const lastDay = new Date(year, month, 0);
        const monthEnd = lastDay.getDate();
        
        let weekStart, weekEnd;
        
        if (weekNum === 1) {
            if (firstDayWeekday === 0) {
                weekStart = new Date(year, month - 1, 1);
                weekEnd = new Date(year, month - 1, 1);
            } else {
                // 计算到周日需要多少天：7 - firstDayWeekday
                const daysToSunday = 7 - firstDayWeekday;
                const firstSundayDate = Math.min(1 + daysToSunday, monthEnd);
                weekStart = new Date(year, month - 1, 1);
                weekEnd = new Date(year, month - 1, firstSundayDate);
            }
        } else {
            let daysToMonday;
            if (firstDayWeekday === 0) {
                daysToMonday = 1;
            } else if (firstDayWeekday === 1) {
                daysToMonday = 0;
            } else {
                daysToMonday = 8 - firstDayWeekday;
            }
            
            const firstMondayDate = 1 + daysToMonday;
            const startDateNum = firstMondayDate + (weekNum - 2) * 7;
            
            if (startDateNum <= monthEnd) {
                weekStart = new Date(year, month - 1, startDateNum);
                const calculatedEndDateNum = startDateNum + 6;
                const endDateNum = Math.min(calculatedEndDateNum, monthEnd);
                weekEnd = new Date(year, month - 1, endDateNum);
            }
        }
        
        // 构建星期到日期的映射
        if (weekStart && weekEnd) {
            let currentDate = new Date(weekStart);
            const endTime = weekEnd.getTime();
            const weekdayMap = {0: '周日', 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六'};
            
            while (currentDate.getTime() <= endTime) {
                const weekday = weekdayMap[currentDate.getDay()];
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
                dateMap[weekday] = dateStr;
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }
    }
    
    // 构建表头
    let headerHtml = '<tr><th style="min-width: 120px;">时段</th>';
    weekdays.forEach(weekday => {
        const dateStr = dateMap[weekday] || '';
        const dateDisplay = dateStr ? `<br><span style="font-size: 11px; font-weight: normal; color: #666;">${dateStr.split('-')[1]}-${dateStr.split('-')[2]}</span>` : '';
        headerHtml += `<th style="min-width: 150px;">${weekday}${dateDisplay}</th>`;
    });
    headerHtml += '</tr>';
    thead.innerHTML = headerHtml;
    
    // 构建表格数据：按时段分组
    let tbodyHtml = '';
    
    if (timeSlots.length === 0 && courses.length === 0) {
        // 获取当前周的日期范围信息
        const monthInput = document.getElementById('course-month');
        const weekSelect = document.getElementById('course-week-select');
        let emptyMessage = '暂无排课数据';
        
        if (monthInput && weekSelect && monthInput.value && weekSelect.value) {
            const weekInfoLabel = document.getElementById('week-info-label');
            if (weekInfoLabel && weekInfoLabel.textContent) {
                emptyMessage = `暂无排课数据（${weekInfoLabel.textContent}）`;
            }
        }
        
        tbodyHtml = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #666;">
            <div style="font-size: 14px;">${emptyMessage}</div>
            <div style="font-size: 12px; margin-top: 8px; color: #999;">提示：请检查筛选条件，或尝试切换到其他周查看</div>
        </td></tr>`;
    } else if (timeSlots.length === 0) {
        // 如果没有时段，按日期显示
        const coursesByDate = {};
        courses.forEach(c => {
            const date = c.course_date;
            if (!coursesByDate[date]) {
                coursesByDate[date] = [];
            }
            coursesByDate[date].push(c);
        });
        
        // 获取当前周的日期
        const monthInput = document.getElementById('course-month');
        const weekSelect = document.getElementById('course-week-select');
        if (monthInput && weekSelect && monthInput.value && weekSelect.value) {
            // 这里可以显示日期信息
            tbodyHtml = `<tr><td colspan="8" style="text-align: center;">请先设置时段信息</td></tr>`;
        }
    } else {
        // 按时段为行，星期为列
        timeSlots.forEach(timeSlot => {
            tbodyHtml += '<tr>';
            tbodyHtml += `<td style="font-weight: bold; background: #f5f5f5;">${timeSlot}</td>`;
            
            const timeSlotTrimmed = (timeSlot || '').trim();
            
            weekdays.forEach(weekday => {
                // 查找该时段、该星期的所有课程（可能有多个）
                const matchedCourses = courses.filter(c => {
                    // 使用trim()去除空格，确保匹配准确
                    const cTimeSlot = (c.time_slot || '').trim();
                    const cWeekday = (c.weekday || '').trim();
                    const slotMatch = cTimeSlot === timeSlotTrimmed;
                    const weekdayMatch = cWeekday === weekday;
                    
                    // 调试日志（仅针对课程438）
                    if (c.id === 438) {
                        console.log(`课程438匹配检查:`, {
                            course: c,
                            timeSlot: timeSlot,
                            timeSlotTrimmed: timeSlotTrimmed,
                            weekday: weekday,
                            cTimeSlot: cTimeSlot,
                            cWeekday: cWeekday,
                            slotMatch: slotMatch,
                            weekdayMatch: weekdayMatch,
                            match: slotMatch && weekdayMatch
                        });
                    }
                    
                    return slotMatch && weekdayMatch;
                });
                
                if (matchedCourses.length > 0) {
                    // 显示所有匹配的课程，简洁格式：课程名称 学生姓名 老师 时段 教室
                    let cellHtml = '<td style="padding: 4px; vertical-align: top;">';
                    matchedCourses.forEach((course, index) => {
                        const statusClass = course.status === '正常' ? 'normal' : 
                                          course.status === '请假' ? 'leave' : 
                                          course.status === '跑空' ? 'empty' : 'deleted';
                        const marginBottom = index < matchedCourses.length - 1 ? 'margin-bottom: 3px;' : '';
                        
                        // 如果已确认上课，显示为灰色
                        const confirmedStyle = course.is_confirmed ? 'background: #f5f5f5; opacity: 0.8; color: #666;' : 'background: white;';
                        
                        // 构建简洁的显示文本：课程名称 学生姓名 老师 时段 教室
                        const courseName = course.course_name || course.subject || '';
                        const studentName = course.student_name || '';
                        const teacherName = course.teacher_name || '';
                        const timeSlot = course.time_slot || '';
                        const classroom = course.classroom || '';
                        
                        // 格式：课程名称 学生姓名 老师 时段 教室
                        const displayText = [courseName, studentName, teacherName, timeSlot, classroom]
                            .filter(item => item) // 过滤空值
                            .join(' ');
                        
                        cellHtml += `<div style="border: 1px solid #ddd; border-radius: 3px; padding: 3px 4px; ${confirmedStyle} ${marginBottom}">
                            <div style="font-size: 11px; line-height: 1.3; margin-bottom: 2px;">${displayText}</div>
                            <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                                <span class="status-badge status-${statusClass}" style="font-size: 9px; padding: 1px 3px;">${course.status}</span>
                                ${course.is_confirmed ? 
                                    '<button class="btn btn-secondary" onclick="confirmCourse(' + course.id + ')" style="padding: 1px 4px; font-size: 10px; background: #6c757d; color: white;">取消确认</button>' : 
                                    '<button class="btn btn-success" onclick="confirmCourse(' + course.id + ')" style="padding: 1px 4px; font-size: 10px; background: #28a745; color: white;">确认</button>'
                                }
                                <input type="checkbox" class="course-checkbox" value="${course.id}" ${(!course.is_confirmed || (typeof currentUserRole !== 'undefined' && currentUserRole === 'admin')) ? '' : 'disabled title="已确认的排课只有管理员可以删除"'} onchange="updateBatchDeleteButton()" style="margin: 0;">
                                ${(!course.is_confirmed || (typeof currentUserRole !== 'undefined' && currentUserRole === 'admin')) ? 
                                    '<button class="btn btn-warning" onclick="showEditCourseModal(' + course.id + ')" style="padding: 1px 4px; font-size: 10px;">编辑</button>' :
                                    '<button class="btn btn-warning" disabled title="无权限编辑已确认上课的排课，只有管理员可以编辑" style="padding: 1px 4px; font-size: 10px; opacity: 0.5; cursor: not-allowed;">编辑</button>'
                                }
                                ${(!course.is_confirmed || (typeof currentUserRole !== 'undefined' && currentUserRole === 'admin')) ? 
                                    '<button class="btn btn-danger" onclick="deleteCourse(' + course.id + ')" style="padding: 1px 4px; font-size: 10px;">删除</button>' :
                                    '<button class="btn btn-danger" disabled title="无权限删除已确认上课的排课，只有管理员可以删除" style="padding: 1px 4px; font-size: 10px; opacity: 0.5; cursor: not-allowed;">删除</button>'
                                }
                            </div>
                        </div>`;
                    });
                    cellHtml += '</td>';
                    tbodyHtml += cellHtml;
                } else {
                    tbodyHtml += '<td style="background: #fafafa;"></td>';
                }
            });
            
            tbodyHtml += '</tr>';
        });
    }
    
    tbody.innerHTML = tbodyHtml;
    
    // 更新批量删除按钮显示状态
    updateBatchDeleteButton();
}

// 计算日期在该月是第几周（每月从第1周开始）
// 第1周：从1号开始，到第一个周日结束
// 第2周及以后：从第一个周一开始，每7天一周
function getWeekInMonth(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const dayOfMonth = date.getDate();
    
    // 获取该月1号
    const firstDay = new Date(year, month, 1);
    const firstDayWeekday = firstDay.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    
    if (firstDayWeekday === 0) {
        // 1号是周日，第1周只有1号
        if (dayOfMonth === 1) {
            return 1;
        } else {
            // 从第2周开始
            const firstMonday = new Date(year, month, 2);
            const daysFromFirstMonday = dayOfMonth - firstMonday.getDate();
            const weekNum = Math.floor(daysFromFirstMonday / 7) + 2;
            return Math.min(weekNum, 5);
        }
    } else {
        // 找到第一个周日
        // 计算到周日需要多少天：7 - firstDayWeekday
        // 例如：周一(1)->6天到周日, 周二(2)->5天, ..., 周六(6)->1天
        const daysToSunday = 7 - firstDayWeekday;
        const firstSunday = new Date(year, month, 1 + daysToSunday);
        
        if (dayOfMonth <= firstSunday.getDate()) {
            // 在第1周内（1号到第一个周日）
            return 1;
        } else {
            // 在第2周及以后
            // 找到第一个周一
            const daysToMonday = 7 - firstDayWeekday; // 1=周二->6天, 2=周三->5天, ..., 6=周日->1天
            const firstMonday = new Date(year, month, 1 + daysToMonday);
            const daysFromFirstMonday = dayOfMonth - firstMonday.getDate();
            const weekNum = Math.floor(daysFromFirstMonday / 7) + 2;
            return Math.min(weekNum, 5);
        }
    }
}

function showAddCourseModal() {
    // 获取当前月份
    const monthInput = document.getElementById('course-month');
    const currentMonth = monthInput ? monthInput.value : new Date().toISOString().slice(0, 7);
    
    // 辅助函数：安全获取API数据，失败时返回默认值
    function safeFetch(url, defaultValue = [], useCache = false) {
        return fetch(url)
            .then(res => {
                if (!res.ok) {
                    // 如果是429错误且允许使用缓存，尝试使用缓存
                    if (res.status === 429 && useCache) {
                        // 尝试使用缓存（针对time-slots）
                        if (url.includes('/api/time-slots')) {
                            const cachedTimeSlots = localStorage.getItem('cached_time_slots');
                            if (cachedTimeSlots) {
                                try {
                                    const cachedSlots = JSON.parse(cachedTimeSlots);
                                    if (Array.isArray(cachedSlots) && cachedSlots.length > 0) {
                                        console.warn(`API返回429错误，使用缓存数据: ${url}`);
                                        return Promise.resolve(cachedSlots);
                                    }
                                } catch (e) {
                                    console.warn('解析缓存失败:', e);
                                }
                            }
                            // 尝试使用全局变量
                            if (window.allTimeSlots && Array.isArray(window.allTimeSlots) && window.allTimeSlots.length > 0) {
                                console.warn(`API返回429错误，使用全局变量: ${url}`);
                                return Promise.resolve(window.allTimeSlots);
                            }
                        }
                        // 对于其他API，429错误时直接返回默认值
                        console.warn(`API返回429错误，使用默认值: ${url}`);
                        return Promise.resolve(defaultValue);
                    }
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.json();
            })
            .then(data => {
                // 如果成功获取数据，对于time-slots，更新缓存
                if (url.includes('/api/time-slots') && Array.isArray(data) && data.length > 0) {
                    // 排序并保存到缓存和全局变量
                    data.sort((a, b) => {
                        const orderA = a.sort_order !== null && a.sort_order !== undefined ? a.sort_order : 999;
                        const orderB = b.sort_order !== null && b.sort_order !== undefined ? b.sort_order : 999;
                        if (orderA !== orderB) {
                            return orderA - orderB;
                        }
                        return (a.name || '').localeCompare(b.name || '');
                    });
                    localStorage.setItem('cached_time_slots', JSON.stringify(data));
                    localStorage.setItem('cached_time_slots_timestamp', Date.now().toString());
                    window.allTimeSlots = data;
                }
                return data;
            })
            .catch(err => {
                console.error(`获取数据失败 ${url}:`, err);
                // 如果是time-slots API且失败，尝试使用缓存或全局变量
                if (url.includes('/api/time-slots') && useCache) {
                    const cachedTimeSlots = localStorage.getItem('cached_time_slots');
                    if (cachedTimeSlots) {
                        try {
                            const cachedSlots = JSON.parse(cachedTimeSlots);
                            if (Array.isArray(cachedSlots) && cachedSlots.length > 0) {
                                console.warn('使用缓存数据（API失败）:', url);
                                return cachedSlots;
                            }
                        } catch (e) {
                            console.warn('解析缓存失败:', e);
                        }
                    }
                    if (window.allTimeSlots && Array.isArray(window.allTimeSlots) && window.allTimeSlots.length > 0) {
                        console.warn('使用全局变量（API失败）:', url);
                        return window.allTimeSlots;
                    }
                }
                // 对于其他API或没有缓存的情况，返回默认值
                console.warn(`使用默认值: ${url}`);
                return defaultValue;
            });
    }
    
    Promise.all([
        safeFetch('/api/students/paid-courses-need-scheduling', {courses: []}),
        safeFetch('/api/teachers?status=启用', []),
        safeFetch('/api/courses_manage', []),
        safeFetch('/api/time-slots?status=启用', [], true), // 允许使用缓存
        safeFetch('/api/classrooms?status=启用', []),
        safeFetch(`/api/stats?month=${currentMonth}`, []),
        safeFetch('/api/finance-config', [])
    ]).then(([paidCoursesData, teachers, courses, timeSlots, classrooms, stats, configs]) => {
        // 确保configs是数组
        const configsArray = Array.isArray(configs) ? configs : [];
        
        // 获取排课阈值配置
        const schedulingConfig = configsArray.find(c => c.key === 'min_hours_for_scheduling');
        const schedulingThreshold = schedulingConfig ? schedulingConfig.value : -1;
        const reminderConfig = configsArray.find(c => c.key === 'min_hours_for_reminder');
        const reminderThreshold = reminderConfig ? reminderConfig.value : 3;
        
        // 将配置值存储到全局变量，供其他函数使用
        window.minHoursForScheduling = schedulingThreshold;
        window.minHoursForReminder = reminderThreshold;
        
        // 创建剩余课时映射（按学生-课程），存储到全局变量供其他函数使用
        window.remainingHoursMap = {}; // key: "student_id-course_id" or "student_id" (如果没有课程)
        stats.forEach(s => {
            const key = s.course_id ? `${s.student_id}-${s.course_id}` : s.student_id;
            // 如果同一个学生-课程组合有多条记录，取最新的（剩余课时最大的）
            if (!window.remainingHoursMap[key] || s.remaining_hours > window.remainingHoursMap[key]) {
                window.remainingHoursMap[key] = s.remaining_hours || 0;
            }
        });
        
        // 从已缴费需要排课的学生课程列表中提取唯一的学生
        const paidCourses = paidCoursesData.courses || [];
        const studentMap = {}; // {student_id: {student_name, grade, total_remaining_hours}}
        
        paidCourses.forEach(course => {
            const studentId = course.student_id;
            if (!studentMap[studentId]) {
                studentMap[studentId] = {
                    id: studentId,
                    name: course.student_name,
                    grade: course.grade || '',
                    total_remaining_hours: 0
                };
            }
            // 累计该学生的总剩余课时
            studentMap[studentId].total_remaining_hours += course.remaining_hours || 0;
        });
        
        // 转换为数组并排序
        const students = Object.values(studentMap).sort((a, b) => {
            // 按姓名排序
            return a.name.localeCompare(b.name);
        });
        
        // 为每个学生计算所有课程的总剩余课时（用于学生选择框显示）
        const studentTotalHoursMap = {};
        stats.forEach(s => {
            if (!studentTotalHoursMap[s.student_id]) {
                studentTotalHoursMap[s.student_id] = 0;
            }
            studentTotalHoursMap[s.student_id] += (s.remaining_hours || 0);
        });
        
        const studentOptions = students.length > 0 
            ? students.map(s => {
                const totalHours = s.total_remaining_hours || 0;
                const warning = totalHours < schedulingThreshold ? ' ⚠️' : '';
                return `<option value="${s.id}">${s.name} (${s.grade || ''}) - 总剩余课时: ${totalHours.toFixed(1)}${warning}</option>`;
            }).join('')
            : '<option value="">暂无需要排课的学生</option>';
        const teacherOptions = teachers.length > 0
            ? teachers.map(t => `<option value="${t.id}">${t.name} (${t.subject || ''})</option>`).join('')
            : '<option value="">暂无启用教师</option>';
        const courseOptions = '<option value="">-- 选择课程（可选）--</option>' + 
            courses.filter(c => c.status === '启用')
                .map(c => `<option value="${c.id}" data-subject="${c.subject}">${c.name} (${c.subject})</option>`).join('');
        
        // 获取当前周的日期范围，用于限制日期选择器
        let dateMin = '';
        let dateMax = '';
        const monthInput = document.getElementById('course-month');
        const weekSelect = document.getElementById('course-week-select');
        
        if (monthInput && weekSelect && monthInput.value && weekSelect.value) {
            try {
                const [year, month] = monthInput.value.split('-').map(Number);
                const weekNum = parseInt(weekSelect.value);
                const firstDay = new Date(year, month - 1, 1);
                const firstDayWeekday = firstDay.getDay();
                const lastDay = new Date(year, month, 0);
                const monthEnd = lastDay.getDate();
                
                let startDate, endDate;
                
                if (weekNum === 1) {
                    if (firstDayWeekday === 0) {
                        startDate = new Date(year, month - 1, 1);
                        endDate = new Date(year, month - 1, 1);
                    } else {
                        // 计算到周日需要多少天：7 - firstDayWeekday
                        const daysToSunday = 7 - firstDayWeekday;
                        const firstSundayDate = Math.min(1 + daysToSunday, monthEnd);
                        startDate = new Date(year, month - 1, 1);
                        endDate = new Date(year, month - 1, firstSundayDate);
                    }
                } else {
                    // 计算第一个周一
                    // JavaScript的getDay(): 0=周日, 1=周一, 2=周二, 3=周三, 4=周四, 5=周五, 6=周六
                    let daysToMonday;
                    if (firstDayWeekday === 0) {
                        // 1号是周日，第一个周一是2号
                        daysToMonday = 1;
                    } else if (firstDayWeekday === 1) {
                        // 1号是周一，第一个周一就是1号
                        daysToMonday = 0;
                    } else {
                        // 1号是周二到周六，计算到下一个周一需要多少天
                        // 周二(2) -> 周一需要6天, 周三(3) -> 周一需要5天, ..., 周六(6) -> 周一需要2天
                        daysToMonday = 8 - firstDayWeekday;
                    }
                    
                    const firstMondayDate = 1 + daysToMonday;
                    const startDateNum = firstMondayDate + (weekNum - 2) * 7;
                    
                    if (startDateNum <= monthEnd) {
                        startDate = new Date(year, month - 1, startDateNum);
                        // 一周的结束是周日，所以结束日期是开始日期+6天
                        const calculatedEndDateNum = startDateNum + 6;
                        const endDateNum = Math.min(calculatedEndDateNum, monthEnd);
                        endDate = new Date(year, month - 1, endDateNum);
                        
                        // 验证结束日期是否是周日（0=周日）
                        const endDateObj = new Date(year, month - 1, endDateNum);
                        if (endDateObj.getDay() !== 0 && endDateNum < monthEnd) {
                            // 如果不是周日且还有剩余天数，调整到下一个周日
                            const daysToSunday = 7 - endDateObj.getDay();
                            const adjustedEndDateNum = Math.min(endDateNum + daysToSunday, monthEnd);
                            endDate = new Date(year, month - 1, adjustedEndDateNum);
                        }
                    }
                }
                
                if (startDate && endDate) {
                    const formatDate = (date) => {
                        const y = date.getFullYear();
                        const m = String(date.getMonth() + 1).padStart(2, '0');
                        const d = String(date.getDate()).padStart(2, '0');
                        return `${y}-${m}-${d}`;
                    };
                    dateMin = formatDate(startDate);
                    dateMax = formatDate(endDate);
                }
            } catch (e) {
                console.error('计算当前周日期范围失败:', e);
            }
        }
        
        const modalBody = `
            <h2>新增排课</h2>
            <form id="course-form" onsubmit="saveCourse(event)">
                <div class="form-group">
                    <label>学生 *</label>
                    <select name="student_id" id="course-student-select" required onchange="updateStudentPaidCourses(); checkCourseConflicts();">${studentOptions}</select>
                </div>
                <div id="remaining-hours-display" style="margin: -10px 0 15px 0; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 14px;">
                    <span id="remaining-hours-text">请选择学生查看剩余课时</span>
                </div>
                <div class="form-group">
                    <label>课程（已报名课程）</label>
                    <select name="course_id" id="course-select" onchange="updateSubjectFromCourse(); updateRemainingHoursDisplay(); loadStudentCourseDefaultSchedule(document.getElementById('course-student-select').value, this.value);">
                        <option value="">-- 请选择课程（可选）--</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>科目（已报名科目）*</label>
                    <select name="subject" id="subject-select" required onchange="updateCoursesFromSubject()">
                        <option value="">-- 请选择科目 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>老师 *</label>
                    <select name="teacher_id" id="teacher-select" required onchange="checkCourseConflicts()">${teacherOptions}</select>
                </div>
                <div class="form-group">
                    <label>星期</label>
                    <select name="weekday" id="weekday-select" onchange="updateDateFromWeekday()">
                        <option value="">-- 请选择星期 --</option>
                        <option value="周一">周一</option>
                        <option value="周二">周二</option>
                        <option value="周三">周三</option>
                        <option value="周四">周四</option>
                        <option value="周五">周五</option>
                        <option value="周六">周六</option>
                        <option value="周日">周日</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>日期 *</label>
                    <input type="date" name="course_date" id="course-date-input" ${dateMin ? `min="${dateMin}"` : ''} ${dateMax ? `max="${dateMax}"` : ''} onchange="updateWeekdayFromDate(); checkCourseConflicts();" required>
                </div>
                <div class="form-group">
                    <label>时段</label>
                    <select name="time_slot" id="time-slot-select" onchange="checkCourseConflicts()">
                        <option value="">-- 请选择时段 --</option>
                        ${(Array.isArray(timeSlots) ? timeSlots : []).map(slot => {
                            const slotName = slot.name || slot;
                            return `<option value="${slotName}">${slotName}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>教室</label>
                    <select name="classroom" id="classroom-select" onchange="checkCourseConflicts()">
                        <option value="">-- 请选择教室 --</option>
                        ${classrooms.map(room => `<option value="${room.name}">${room.name}</option>`).join('')}
                    </select>
                </div>
                <div id="conflict-warning" style="display: none; margin: 15px 0; padding: 12px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; color: #856404;">
                    <strong>⚠️ 检测到课程冲突：</strong>
                    <ul id="conflict-list" style="margin: 8px 0 0 0; padding-left: 20px;"></ul>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn" onclick="closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary" id="course-submit-btn">保存</button>
                </div>
            </form>
        `;
        showModal(modalBody);
        // 初始化科目选项（从教师API获取）
        initializeSubjectOptions();
        // 初始化时段默认值
        loadLastTimeSlot();
        // 初始化星期（如果日期已设置）
        updateWeekdayFromDate();
        // 初始化剩余课时显示
        updateRemainingHoursDisplay();
        // 如果已选择学生，从缴费记录获取已缴费的课程
        const studentSelect = document.getElementById('course-student-select');
        if (studentSelect && studentSelect.value) {
            updateStudentPaidCourses();
        }
    })
    .catch(err => {
        console.error('加载新增排课模态框失败:', err);
        alert('加载新增排课表单失败，请刷新页面重试。错误信息：' + (err.message || '未知错误'));
    });
}

// 实时检测课程冲突
function checkCourseConflicts() {
    const dateInput = document.getElementById('course-date-input');
    const timeSlotSelect = document.getElementById('time-slot-select');
    const teacherSelect = document.getElementById('teacher-select');
    const classroomSelect = document.getElementById('classroom-select');
    const studentSelect = document.getElementById('course-student-select');
    const conflictWarning = document.getElementById('conflict-warning');
    const conflictList = document.getElementById('conflict-list');
    const submitBtn = document.getElementById('course-submit-btn');
    
    if (!dateInput || !timeSlotSelect || !teacherSelect || !studentSelect || !conflictWarning || !conflictList) {
        return;
    }
    
    const courseDate = dateInput.value;
    const timeSlot = timeSlotSelect.value;
    const teacherId = teacherSelect.value;
    const classroom = classroomSelect ? classroomSelect.value : '';
    const studentId = studentSelect.value;
    
    // 如果缺少必要字段，隐藏冲突提示
    if (!courseDate || !timeSlot || !teacherId || !studentId) {
        conflictWarning.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;
        return;
    }
    
    // 调用冲突检测API
    fetch('/api/courses/check-conflicts', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            course_date: courseDate,
            time_slot: timeSlot,
            teacher_id: teacherId,
            classroom: classroom,
            student_id: studentId
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.has_conflict && data.conflicts && data.conflicts.length > 0) {
            // 显示冲突提示
            conflictWarning.style.display = 'block';
            conflictList.innerHTML = '';
            data.conflicts.forEach(conflict => {
                const li = document.createElement('li');
                li.textContent = conflict.message;
                conflictList.appendChild(li);
            });
            // 禁用提交按钮
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.title = '存在课程冲突，无法保存';
            }
        } else {
            // 隐藏冲突提示
            conflictWarning.style.display = 'none';
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.title = '';
            }
        }
    })
    .catch(err => {
        console.error('检测冲突失败:', err);
        // 出错时不阻止提交，但显示警告
        conflictWarning.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;
    });
}

// 根据日期更新星期选择框
function updateWeekdayFromDate() {
    const dateInput = document.getElementById('course-date-input');
    const weekdaySelect = document.getElementById('weekday-select');
    
    if (!dateInput || !weekdaySelect) return;
    
    const dateValue = dateInput.value;
    if (!dateValue) {
        weekdaySelect.value = '';
        return;
    }
    
    // 计算星期
    const date = new Date(dateValue);
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekday = weekdays[date.getDay()];
    
    weekdaySelect.value = weekday;
}

// 根据星期更新日期（更新到当前周内对应的日期）
function updateDateFromWeekday() {
    const weekdaySelect = document.getElementById('weekday-select');
    const dateInput = document.getElementById('course-date-input');
    const monthInput = document.getElementById('course-month');
    const weekSelect = document.getElementById('course-week-select');
    
    if (!weekdaySelect || !dateInput || !monthInput || !weekSelect) return;
    
    const weekday = weekdaySelect.value;
    if (!weekday) return;
    
    // 获取当前周的日期范围
    const monthValue = monthInput.value;
    const weekValue = weekSelect.value;
    
    if (!monthValue || !weekValue) {
        alert('请先选择月份和周');
        return;
    }
    
    try {
        const [year, month] = monthValue.split('-').map(Number);
        const weekNum = parseInt(weekValue);
        const firstDay = new Date(year, month - 1, 1);
        const firstDayWeekday = firstDay.getDay();
        const lastDay = new Date(year, month, 0);
        const monthEnd = lastDay.getDate();
        
        let weekStart, weekEnd;
        
        // 计算当前周的日期范围
        if (weekNum === 1) {
            if (firstDayWeekday === 0) {
                weekStart = new Date(year, month - 1, 1);
                weekEnd = new Date(year, month - 1, 1);
            } else {
                // 计算到周日需要多少天：7 - firstDayWeekday
                const daysToSunday = 7 - firstDayWeekday;
                const firstSundayDate = Math.min(1 + daysToSunday, monthEnd);
                weekStart = new Date(year, month - 1, 1);
                weekEnd = new Date(year, month - 1, firstSundayDate);
            }
        } else {
            let daysToMonday;
            if (firstDayWeekday === 0) {
                daysToMonday = 1;
            } else if (firstDayWeekday === 1) {
                daysToMonday = 0;
            } else {
                daysToMonday = 8 - firstDayWeekday;
            }
            
            const firstMondayDate = 1 + daysToMonday;
            const startDateNum = firstMondayDate + (weekNum - 2) * 7;
            
            if (startDateNum <= monthEnd) {
                weekStart = new Date(year, month - 1, startDateNum);
                const calculatedEndDateNum = startDateNum + 6;
                const endDateNum = Math.min(calculatedEndDateNum, monthEnd);
                weekEnd = new Date(year, month - 1, endDateNum);
            } else {
                return; // 周数超出范围
            }
        }
        
        // 星期映射：前端星期 -> JavaScript getDay() 值
        const weekdayMap = {
            '周日': 0,
            '周一': 1,
            '周二': 2,
            '周三': 3,
            '周四': 4,
            '周五': 5,
            '周六': 6
        };
        
        const targetWeekday = weekdayMap[weekday];
        if (targetWeekday === undefined) return;
        
        // 在当前周范围内查找对应的日期
        let targetDate = null;
        let currentDate = new Date(weekStart);
        const weekEndTime = weekEnd.getTime();
        
        while (currentDate.getTime() <= weekEndTime) {
            if (currentDate.getDay() === targetWeekday) {
                targetDate = new Date(currentDate);
                break;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        if (targetDate) {
            // 格式化日期为 YYYY-MM-DD
            const y = targetDate.getFullYear();
            const m = String(targetDate.getMonth() + 1).padStart(2, '0');
            const d = String(targetDate.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;
            dateInput.value = dateStr;
            
            // 触发日期变化事件，自动更新星期显示和检查冲突
            // 使用 setTimeout 确保值已设置后再触发
            setTimeout(() => {
                // 触发 change 事件，这会调用 updateWeekdayFromDate 和 checkCourseConflicts
                const event = new Event('change', { bubbles: true });
                dateInput.dispatchEvent(event);
            }, 0);
        } else {
            // 如果找不到对应的日期，提示用户
            console.warn(`当前周（第${weekNum}周）中没有找到${weekday}`);
            alert(`当前周（第${weekNum}周）中没有找到${weekday}，请检查月份和周数是否正确`);
        }
    } catch (e) {
        console.error('根据星期更新日期失败:', e);
        alert('根据星期更新日期失败：' + e.message);
    }
}

function loadLastTimeSlot() {
    const studentSelect = document.getElementById('course-student-select');
    const timeSlotSelect = document.getElementById('time-slot-select');
    
    if (!studentSelect || !timeSlotSelect || !studentSelect.value) {
        return;
    }
    
    const studentId = studentSelect.value;
    fetch(`/api/courses/last-time-slot/${studentId}`)
        .then(res => res.json())
        .then(data => {
            if (data.time_slot) {
                timeSlotSelect.value = data.time_slot;
            }
        })
        .catch(err => {
            console.error('获取上次时段失败:', err);
        });
}

// 存储科目和课程数据
let allSubjectsData = [];  // 从教师API获取的所有科目
let studentPaidCoursesData = [];  // 从学生缴费记录获取的已缴费课程

// 初始化科目选项（从教师页面获取）
function initializeSubjectOptions() {
    const subjectSelect = document.getElementById('subject-select');
    
    if (!subjectSelect) return;
    
    // 从教师API获取所有科目
    fetch('/api/teachers')
        .then(res => res.json())
        .then(teachers => {
            // 提取所有教师的科目并去重
            const subjects = [...new Set(teachers
                .map(t => t.subject)
                .filter(s => s && s.trim() !== '')
            )].sort();
            
            allSubjectsData = subjects;
            
            // 更新科目下拉框
            subjectSelect.innerHTML = '<option value="">-- 请选择科目 --</option>';
            subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject;
                option.textContent = subject;
                subjectSelect.appendChild(option);
            });
        })
        .catch(err => {
            console.error('获取教师科目失败:', err);
            subjectSelect.innerHTML = '<option value="">-- 获取数据失败 --</option>';
        });
}

// 当选择学生时，更新已缴费的课程和科目选项
function updateStudentPaidCourses() {
    const studentSelect = document.getElementById('course-student-select');
    const courseSelect = document.getElementById('course-select');
    const subjectSelect = document.getElementById('subject-select');
    
    if (!studentSelect || !courseSelect || !subjectSelect) return;
    
    const studentId = studentSelect.value;
    if (!studentId) {
        // 清空课程选项，但保留科目选项（因为科目来自教师，不依赖学生）
        courseSelect.innerHTML = '<option value="">-- 请选择课程（可选）--</option>';
        studentPaidCoursesData = [];
        // 科目选项已经在初始化时加载，不需要清空
        updateRemainingHoursDisplay();
        return;
    }
    
    // 加载学生-课程的默认排课设置并自动填充（需要等待课程选择）
    // 这个函数会在选择课程后调用
    
    // 更新剩余课时显示
    updateRemainingHoursDisplay();
    
    // 从学生缴费记录获取已缴费的课程
    fetch(`/api/students/${studentId}/paid-courses`)
        .then(res => res.json())
        .then(data => {
            studentPaidCoursesData = data.courses || [];
            
            // 更新课程下拉框（根据当前选择的科目过滤）
            updateCoursesDropdown();
        })
        .catch(err => {
            console.error('获取学生已缴费课程失败:', err);
            courseSelect.innerHTML = '<option value="">-- 获取数据失败 --</option>';
            studentPaidCoursesData = [];
        });
}

// 加载学生-课程的默认排课设置并自动填充
function loadStudentCourseDefaultSchedule(studentId, courseId) {
    if (!studentId || !courseId) return;
    
    fetch(`/api/students/${studentId}/courses/${courseId}/default-schedule`)
        .then(res => {
            if (res.ok) {
                return res.json();
            }
            return null;
        })
        .then(data => {
            if (data) {
                // 自动填充默认时段
                const timeSlotSelect = document.getElementById('time-slot-select');
                if (timeSlotSelect && data.default_time_slot) {
                    timeSlotSelect.value = data.default_time_slot;
                }
                
                // 自动填充默认星期，并触发日期更新
                const weekdaySelect = document.getElementById('weekday-select');
                if (weekdaySelect && data.default_weekday) {
                    weekdaySelect.value = data.default_weekday;
                    // 触发 change 事件，自动更新日期
                    setTimeout(() => {
                        const event = new Event('change', { bubbles: true });
                        weekdaySelect.dispatchEvent(event);
                    }, 100);
                }
            }
        })
        .catch(err => {
            console.error('加载学生-课程默认设置失败:', err);
        });
}

// 更新课程下拉框（根据当前选择的科目过滤，只显示学生已缴费的课程）
function updateCoursesDropdown() {
    const courseSelect = document.getElementById('course-select');
    const subjectSelect = document.getElementById('subject-select');
    const studentSelect = document.getElementById('course-student-select');
    
    if (!courseSelect) return;
    
    const selectedSubject = subjectSelect ? subjectSelect.value : '';
    const studentId = studentSelect ? studentSelect.value : '';
    
    // 清空课程下拉框
    courseSelect.innerHTML = '<option value="">-- 请选择课程（可选）--</option>';
    
    // 从学生缴费记录获取的课程列表中过滤
    // 如果没有选择科目，显示所有已缴费的课程
    // 如果选择了科目，只显示该科目的已缴费课程
    studentPaidCoursesData.forEach(course => {
        if (!selectedSubject || course.subject === selectedSubject) {
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = course.name;
            option.setAttribute('data-subject', course.subject || '');
            courseSelect.appendChild(option);
        }
    });
}

// 当选择科目时，过滤课程列表
function updateCoursesFromSubject() {
    updateCoursesDropdown();
}

// 当选择课程时，自动填充科目
function updateSubjectFromCourse() {
    const courseSelect = document.getElementById('course-select');
    const subjectSelect = document.getElementById('subject-select');
    
    if (!courseSelect || !subjectSelect) return;
    
    if (courseSelect.value) {
        const selectedOption = courseSelect.options[courseSelect.selectedIndex];
        const subject = selectedOption.getAttribute('data-subject');
        if (subject) {
            subjectSelect.value = subject;
        }
    }
}

function showEditCourseModal(id) {
    // 检查权限：已确认的排课只有管理员可以编辑
    const course = coursesAllData.find(c => c.id === id);
    if (course && course.is_confirmed && currentUserRole !== 'admin') {
        alert('无权限编辑已确认上课的排课，只有管理员可以编辑');
        return;
    }
    
    fetch('/api/courses')
        .then(res => res.json())
        .then(courses => {
            const course = courses.find(c => c.id === id);
            if (!course) return;
            
            // 再次检查权限（从API获取的数据可能更新）
            if (course.is_confirmed && currentUserRole !== 'admin') {
                alert('无权限编辑已确认上课的排课，只有管理员可以编辑');
                return;
            }
            
            const modalBody = `
                <h2>编辑排课</h2>
                <form id="course-form" onsubmit="saveCourse(event, ${id})">
                    <div class="form-group">
                        <label>状态 *</label>
                        <select name="status" required>
                            <option value="正常" ${course.status === '正常' ? 'selected' : ''}>正常</option>
                            <option value="请假" ${course.status === '请假' ? 'selected' : ''}>请假</option>
                            <option value="跑空" ${course.status === '跑空' ? 'selected' : ''}>跑空</option>
                        </select>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn" onclick="closeModal()">取消</button>
                        <button type="submit" class="btn btn-primary">保存</button>
                    </div>
                </form>
            `;
            showModal(modalBody);
        });
}

function saveCourse(e, id) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    // 如果是新增排课，检查冲突
    if (!id && data.course_date && data.time_slot && data.teacher_id && data.student_id) {
        // 检查提交按钮是否被禁用（表示有冲突）
        const submitBtn = document.getElementById('course-submit-btn');
        if (submitBtn && submitBtn.disabled) {
            alert('存在课程冲突，无法保存。请修改排课信息后再试。');
            return;
        }
    }
    
    if (id) {
        // 更新状态
        fetch(`/api/courses/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (!response.ok) {
                throw new Error(data.error || '更新失败');
            }
            closeModal();
            // 刷新页面并保持当前选择
            if (typeof refreshPageWithCurrentSelection === 'function') {
                refreshPageWithCurrentSelection();
            } else {
                loadCourses();
            }
        });
    } else {
        // 创建新排课前检查剩余课时
        const studentSelect = document.getElementById('course-student-select');
        if (studentSelect && studentSelect.value) {
            const selectedOption = studentSelect.options[studentSelect.selectedIndex];
            const remainingHours = parseFloat(selectedOption.getAttribute('data-remaining-hours')) || 0;
            const schedulingThreshold = window.minHoursForScheduling !== undefined ? window.minHoursForScheduling : -1.0;
            
            if (remainingHours < schedulingThreshold) {
                alert(`无法排课！学生剩余课时为 ${remainingHours}，低于 ${schedulingThreshold}。请先缴费！`);
                return;
            }
        }
        
        // 创建新排课
        fetch('/api/courses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(async res => {
            const result = await res.json();
            if (!res.ok) {
                // 如果是冲突错误，显示详细的冲突信息
                if (result.conflicts && result.conflicts.length > 0) {
                    const conflictMessages = result.conflicts.map(c => c.message).join('\n');
                    throw new Error('检测到课程冲突：\n' + conflictMessages);
                }
                const errorMsg = result.error || result.message || `HTTP ${res.status} 错误`;
                const details = result.details ? '\n\n详细信息:\n' + result.details : '';
                throw new Error(errorMsg + details);
            }
            return result;
        })
        .then(() => {
            closeModal();
            // 刷新页面并保持当前选择
            if (typeof refreshPageWithCurrentSelection === 'function') {
                refreshPageWithCurrentSelection();
            } else {
                loadCourses();
            }
        })
        .catch(err => {
            console.error('保存排课失败:', err);
            console.error('错误详情:', err.message);
            // 显示可复制的错误信息
            const errorText = '保存失败：' + err.message;
            alert(errorText);
            // 同时复制到剪贴板（如果支持）
            if (navigator.clipboard) {
                navigator.clipboard.writeText(errorText).catch(() => {});
            }
        });
    }
}

// 更新剩余课时显示
function updateRemainingHoursDisplay() {
    const studentSelect = document.getElementById('course-student-select');
    const courseSelect = document.getElementById('course-select');
    const displayDiv = document.getElementById('remaining-hours-display');
    const textSpan = document.getElementById('remaining-hours-text');
    const submitBtn = document.getElementById('course-submit-btn');
    
    if (!studentSelect || !displayDiv || !textSpan) return;
    
    const selectedOption = studentSelect.options[studentSelect.selectedIndex];
    if (!selectedOption || !selectedOption.value) {
        textSpan.textContent = '请选择学生查看剩余课时';
        displayDiv.style.background = '#f5f5f5';
        displayDiv.style.color = '#333';
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
        }
        return;
    }
    
    const studentId = selectedOption.value;
    const courseId = courseSelect ? courseSelect.value : null;
    
    // 根据学生和课程获取剩余课时
    let remainingHours = 0;
    if (window.remainingHoursMap) {
        if (courseId) {
            // 如果选择了课程，显示该课程的剩余课时
            const key = `${studentId}-${courseId}`;
            remainingHours = window.remainingHoursMap[key] || 0;
        } else {
            // 如果没有选择课程，显示该学生所有课程的总剩余课时
            Object.keys(window.remainingHoursMap).forEach(key => {
                if (key.startsWith(`${studentId}-`)) {
                    remainingHours += window.remainingHoursMap[key] || 0;
                } else if (key === studentId) {
                    remainingHours += window.remainingHoursMap[key] || 0;
                }
            });
        }
    }
    
    // 获取配置值，如果没有则使用默认值
    const schedulingThreshold = window.minHoursForScheduling !== undefined ? window.minHoursForScheduling : -1;
    const reminderThreshold = window.minHoursForReminder !== undefined ? window.minHoursForReminder : 3;
    
    if (remainingHours < schedulingThreshold) {
        textSpan.innerHTML = `<span style="color: #dc3545; font-weight: bold;">⚠️ 剩余课时: ${remainingHours}，低于 ${schedulingThreshold}，无法排课！请先缴费！</span>`;
        displayDiv.style.background = '#f8d7da';
        displayDiv.style.border = '1px solid #dc3545';
        // 禁用提交按钮
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.5';
            submitBtn.style.cursor = 'not-allowed';
            submitBtn.title = `剩余课时低于 ${schedulingThreshold}，无法排课，请先缴费！`;
        }
    } else if (remainingHours < reminderThreshold) {
        textSpan.innerHTML = `<span style="color: #ff6b6b; font-weight: bold;">⚠️ 剩余课时: ${remainingHours}，低于 ${reminderThreshold}，建议及时缴费！</span>`;
        displayDiv.style.background = '#fff3cd';
        displayDiv.style.border = '1px solid #ffc107';
        // 允许提交但显示警告
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
            submitBtn.title = '';
        }
    } else {
        textSpan.innerHTML = `<span style="color: #28a745;">✓ 剩余课时: ${remainingHours}</span>`;
        displayDiv.style.background = '#d4edda';
        displayDiv.style.border = '1px solid #28a745';
        // 正常状态，允许提交
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
            submitBtn.title = '';
        }
    }
}

function confirmCourse(id) {
    // 检查当前课程是否已确认（通过查找按钮文本来判断）
    const checkbox = document.querySelector(`input.course-checkbox[value="${id}"]`);
    let isConfirmed = false;
    let studentId = null;
    let courseId = null;
    
    if (checkbox) {
        const row = checkbox.closest('tr');
        if (row) {
            // 列表模式
            const confirmBtn = row.querySelector('button[onclick*="confirmCourse"]');
            isConfirmed = confirmBtn && confirmBtn.textContent.includes('取消确认');
            
            // 从表格行中获取学生ID和课程ID（通过data属性或从课程数据中获取）
            // 尝试从data属性获取
            studentId = row.getAttribute('data-student-id');
            courseId = row.getAttribute('data-course-id');
            
            // 如果没有data属性，尝试从课程数据中查找
            if (!studentId || !courseId) {
                // 从全局课程数据中查找
                const courseData = window.coursesData || [];
                const course = courseData.find(c => c.id == id);
                if (course) {
                    studentId = course.student_id;
                    courseId = course.course_id;
                }
            }
        } else {
            // 星期模式
            const weekCell = checkbox.closest('div');
            if (weekCell) {
                const confirmBtn = weekCell.querySelector('button[onclick*="confirmCourse"]');
                isConfirmed = confirmBtn && confirmBtn.textContent.includes('取消确认');
                
                // 从data属性获取
                studentId = weekCell.getAttribute('data-student-id');
                courseId = weekCell.getAttribute('data-course-id');
                
                // 如果没有data属性，尝试从课程数据中查找
                if (!studentId || !courseId) {
                    const courseData = window.coursesData || [];
                    const course = courseData.find(c => c.id == id);
                    if (course) {
                        studentId = course.student_id;
                        courseId = course.course_id;
                    }
                }
            }
        }
    }
    
    // 如果是确认上课（不是取消确认），检查剩余课时
    if (!isConfirmed && studentId && courseId) {
        // 获取提醒课时阈值配置值（如果未加载，使用默认值3）
        const reminderThreshold = window.minHoursForReminder !== undefined ? window.minHoursForReminder : 3;
        
        // 从全局剩余课时映射中获取剩余课时
        const key = `${studentId}-${courseId}`;
        let remainingHours = null;
        
        if (window.remainingHoursMap && window.remainingHoursMap[key] !== undefined) {
            remainingHours = window.remainingHoursMap[key];
            
            // 如果剩余课时等于或低于提醒阈值，提示缴费
            if (remainingHours <= reminderThreshold) {
                if (!confirm(`⚠️ 警告：该学生剩余课时为${remainingHours}，低于或等于提醒阈值${reminderThreshold}。确认上课后将剩余${remainingHours - 1}课时。\n\n建议先缴费再确认上课，是否继续确认？`)) {
                    return;
                }
            }
        } else {
            // 如果全局映射中没有，尝试从API查询
            // 获取当前月份
            const monthInput = document.getElementById('course-month');
            const month = monthInput ? monthInput.value : new Date().toISOString().slice(0, 7);
            
            // 查询剩余课时
            fetch(`/api/stats?month=${month}&student_id=${studentId}&course_id=${courseId}`)
                .then(res => res.json())
                .then(stats => {
                    // 获取提醒课时阈值配置值（如果未加载，使用默认值3）
                    const reminderThreshold = window.minHoursForReminder !== undefined ? window.minHoursForReminder : 3;
                    
                    if (stats && stats.length > 0) {
                        const stat = stats.find(s => s.student_id == studentId && s.course_id == courseId);
                        if (stat) {
                            remainingHours = stat.remaining_hours || 0;
                            
                            // 如果剩余课时等于或低于提醒阈值，提示缴费
                            if (remainingHours <= reminderThreshold) {
                                if (!confirm(`⚠️ 警告：该学生剩余课时为${remainingHours}，低于或等于提醒阈值${reminderThreshold}。确认上课后将剩余${remainingHours - 1}课时。\n\n建议先缴费再确认上课，是否继续确认？`)) {
                                    return;
                                }
                            }
                        }
                    }
                    
                    // 执行确认操作
                    performConfirmCourse(id, isConfirmed);
                })
                .catch(err => {
                    console.error('查询剩余课时失败:', err);
                    // 查询失败，直接确认
                    performConfirmCourse(id, isConfirmed);
                });
            return; // 异步查询，先返回
        }
    }
    
    // 执行确认操作
    performConfirmCourse(id, isConfirmed);
}

// 执行确认课程操作
function performConfirmCourse(id, isConfirmed) {
    
    const message = isConfirmed 
        ? '确定要取消确认该课程吗？取消后将恢复剩余课时。' 
        : '确认该课程已上课？确认后将扣除剩余课时。';
    
    if (!confirm(message)) return;
    
    fetch(`/api/courses/${id}/confirm`, { method: 'POST' })
        .then(res => res.json())
        .then((data) => {
            // 更新当前行的确认按钮状态，不刷新页面
            updateCourseConfirmButton(id, !isConfirmed);
            
            // 更新全局课程数据中的确认状态
            if (window.coursesData) {
                const course = window.coursesData.find(c => c.id == id);
                if (course) {
                    course.is_confirmed = !isConfirmed;
                }
            }
            
            // 更新coursesAllData中的确认状态（用于分页）
            if (window.coursesAllData) {
                const course = window.coursesAllData.find(c => c.id == id);
                if (course) {
                    course.is_confirmed = !isConfirmed;
                }
            }
        })
        .catch(err => {
            console.error('操作失败:', err);
            alert('操作失败：' + (err.message || '未知错误'));
        });
}

// 更新课程确认按钮状态
function updateCourseConfirmButton(id, newIsConfirmed) {
    // 查找确认按钮（列表模式和星期模式）
    const checkbox = document.querySelector(`input.course-checkbox[value="${id}"]`);
    
    if (!checkbox) {
        console.warn('未找到课程复选框，ID:', id);
        return;
    }
    
    const row = checkbox.closest('tr');
    if (row) {
        // 列表模式：更新表格行中的确认按钮和行样式
        const confirmBtn = row.querySelector('button[onclick*="confirmCourse"]');
        if (confirmBtn) {
            if (newIsConfirmed) {
                confirmBtn.textContent = '取消确认';
                confirmBtn.className = 'btn btn-secondary';
                confirmBtn.style.background = '#6c757d';
                confirmBtn.style.color = 'white';
                // 立即更新行样式为灰色
                row.style.backgroundColor = '#f5f5f5';
                row.style.color = '#666';
                row.style.opacity = '0.8';
            } else {
                confirmBtn.textContent = '确认上课';
                confirmBtn.className = 'btn btn-success';
                confirmBtn.style.background = '#28a745';
                confirmBtn.style.color = 'white';
                // 恢复行样式为正常
                row.style.backgroundColor = '';
                row.style.color = '';
                row.style.opacity = '';
            }
            console.log('已更新列表模式确认按钮和行样式，ID:', id, '新状态:', newIsConfirmed);
        } else {
            console.warn('列表模式中未找到确认按钮，ID:', id);
        }
    } else {
        // 星期模式：查找包含该课程的div容器
        // 复选框在div中，需要向上查找包含确认按钮的div
        let parentDiv = checkbox.parentElement;
        while (parentDiv && parentDiv.tagName !== 'TD') {
            const confirmBtn = parentDiv.querySelector('button[onclick*="confirmCourse"]');
            if (confirmBtn) {
                // 找到包含课程信息的div（通常是包含确认按钮的div的父级）
                const courseDiv = confirmBtn.closest('div[style*="border"]') || confirmBtn.parentElement;
                
                if (newIsConfirmed) {
                    confirmBtn.textContent = '取消确认';
                    confirmBtn.className = 'btn btn-secondary';
                    confirmBtn.style.background = '#6c757d';
                    confirmBtn.style.color = 'white';
                    // 立即更新课程卡片样式为灰色
                    if (courseDiv) {
                        courseDiv.style.backgroundColor = '#f5f5f5';
                        courseDiv.style.opacity = '0.8';
                        courseDiv.style.color = '#666';
                    }
                } else {
                    confirmBtn.textContent = '确认';
                    confirmBtn.className = 'btn btn-success';
                    confirmBtn.style.background = '#28a745';
                    confirmBtn.style.color = 'white';
                    // 恢复课程卡片样式为正常
                    if (courseDiv) {
                        courseDiv.style.backgroundColor = 'white';
                        courseDiv.style.opacity = '';
                        courseDiv.style.color = '';
                    }
                }
                console.log('已更新星期模式确认按钮和卡片样式，ID:', id, '新状态:', newIsConfirmed);
                return;
            }
            parentDiv = parentDiv.parentElement;
        }
        console.warn('星期模式中未找到确认按钮，ID:', id);
    }
}

function batchConfirmCourses() {
    // 只获取未确认的课程复选框
    const allCheckedCheckboxes = document.querySelectorAll('.course-checkbox:checked');
    const checkboxes = Array.from(allCheckedCheckboxes).filter(cb => {
        const row = cb.closest('tr');
        if (row) {
            // 列表模式下，检查确认按钮是否禁用
            const confirmBtn = row.querySelector('button[onclick*="confirmCourse"]');
            return confirmBtn && !confirmBtn.disabled;
        }
        // 星期模式下，检查是否有确认按钮且未禁用
        const confirmBtn = cb.parentElement?.querySelector('button[onclick*="confirmCourse"]');
        return confirmBtn && !confirmBtn.disabled;
    });
    
    if (checkboxes.length === 0) {
        alert('请先选择要确认的课程（已确认的课程不能再次确认）');
        return;
    }
    
    const courseIds = checkboxes.map(cb => parseInt(cb.value));
    const count = courseIds.length;
    
    if (!confirm(`确定要批量确认 ${count} 个课程吗？确认后将扣除剩余课时。`)) return;
    
    fetch('/api/courses/batch-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_ids: courseIds })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert('批量确认失败：' + data.error);
            return;
        }
        
        alert(`成功确认 ${data.confirmed_count} 个课程${data.already_confirmed_count > 0 ? `，${data.already_confirmed_count} 个已确认` : ''}`);
        
        // 立即更新所有已确认课程的行样式，不刷新页面
        // 只更新实际选中的课程（API会跳过已确认的，所以这里更新所有选中的）
        courseIds.forEach(courseId => {
            // 检查当前状态，只更新未确认的课程
            const checkbox = document.querySelector(`input.course-checkbox[value="${courseId}"]`);
            if (checkbox) {
                const row = checkbox.closest('tr');
                if (row) {
                    const confirmBtn = row.querySelector('button[onclick*="confirmCourse"]');
                    // 如果按钮显示"确认上课"，说明未确认，需要更新为已确认
                    if (confirmBtn && confirmBtn.textContent.includes('确认上课')) {
                        updateCourseConfirmButton(courseId, true);
                        
                        // 更新全局数据中的确认状态
                        if (window.coursesData) {
                            const course = window.coursesData.find(c => c.id == courseId);
                            if (course) {
                                course.is_confirmed = true;
                            }
                        }
                        if (window.coursesAllData) {
                            const course = window.coursesAllData.find(c => c.id == courseId);
                            if (course) {
                                course.is_confirmed = true;
                            }
                        }
                    }
                } else {
                    // 星期模式：检查并更新
                    let parentDiv = checkbox.parentElement;
                    while (parentDiv && parentDiv.tagName !== 'TD') {
                        const confirmBtn = parentDiv.querySelector('button[onclick*="confirmCourse"]');
                        if (confirmBtn && confirmBtn.textContent.includes('确认')) {
                            updateCourseConfirmButton(courseId, true);
                            
                            // 更新全局数据中的确认状态
                            if (window.coursesData) {
                                const course = window.coursesData.find(c => c.id == courseId);
                                if (course) {
                                    course.is_confirmed = true;
                                }
                            }
                            if (window.coursesAllData) {
                                const course = window.coursesAllData.find(c => c.id == courseId);
                                if (course) {
                                    course.is_confirmed = true;
                                }
                            }
                            break;
                        }
                        parentDiv = parentDiv.parentElement;
                    }
                }
            }
        });
        
        // 更新批量删除按钮状态
        if (typeof updateBatchDeleteButton === 'function') {
            updateBatchDeleteButton();
        }
    })
    .catch(err => {
        console.error('批量确认失败:', err);
        alert('批量确认失败：' + (err.message || '未知错误'));
    });
}

function batchCancelConfirmCourses() {
    // 只获取已确认的课程复选框
    const allCheckedCheckboxes = document.querySelectorAll('.course-checkbox:checked');
    const checkboxes = Array.from(allCheckedCheckboxes).filter(cb => {
        const row = cb.closest('tr');
        if (row) {
            // 列表模式下，检查确认按钮文本是否包含"取消确认"
            const confirmBtn = row.querySelector('button[onclick*="confirmCourse"]');
            return confirmBtn && confirmBtn.textContent.includes('取消确认');
        }
        // 星期模式下，检查是否有确认按钮且文本包含"取消确认"
        const confirmBtn = cb.parentElement?.querySelector('button[onclick*="confirmCourse"]');
        return confirmBtn && confirmBtn.textContent.includes('取消确认');
    });
    
    if (checkboxes.length === 0) {
        alert('请先选择要取消确认的课程（只能取消已确认的课程）');
        return;
    }
    
    const courseIds = checkboxes.map(cb => parseInt(cb.value));
    const count = courseIds.length;
    
    if (!confirm(`确定要批量取消确认 ${count} 个课程吗？取消后将恢复剩余课时。`)) return;
    
    fetch('/api/courses/batch-cancel-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_ids: courseIds })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert('批量取消确认失败：' + data.error);
            return;
        }
        
        alert(`成功取消确认 ${data.cancelled_count} 个课程${data.already_cancelled_count > 0 ? `，${data.already_cancelled_count} 个未确认` : ''}`);
        
        // 立即更新所有取消确认课程的行样式，不刷新页面
        // 只更新实际选中的课程（API会跳过未确认的，所以这里更新所有选中的）
        courseIds.forEach(courseId => {
            // 检查当前状态，只更新已确认的课程
            const checkbox = document.querySelector(`input.course-checkbox[value="${courseId}"]`);
            if (checkbox) {
                const row = checkbox.closest('tr');
                if (row) {
                    const confirmBtn = row.querySelector('button[onclick*="confirmCourse"]');
                    // 如果按钮显示"取消确认"，说明已确认，需要更新为未确认
                    if (confirmBtn && confirmBtn.textContent.includes('取消确认')) {
                        updateCourseConfirmButton(courseId, false);
                        
                        // 更新全局数据中的确认状态
                        if (window.coursesData) {
                            const course = window.coursesData.find(c => c.id == courseId);
                            if (course) {
                                course.is_confirmed = false;
                            }
                        }
                        if (window.coursesAllData) {
                            const course = window.coursesAllData.find(c => c.id == courseId);
                            if (course) {
                                course.is_confirmed = false;
                            }
                        }
                    }
                } else {
                    // 星期模式：检查并更新
                    let parentDiv = checkbox.parentElement;
                    while (parentDiv && parentDiv.tagName !== 'TD') {
                        const confirmBtn = parentDiv.querySelector('button[onclick*="confirmCourse"]');
                        if (confirmBtn && confirmBtn.textContent.includes('取消确认')) {
                            updateCourseConfirmButton(courseId, false);
                            
                            // 更新全局数据中的确认状态
                            if (window.coursesData) {
                                const course = window.coursesData.find(c => c.id == courseId);
                                if (course) {
                                    course.is_confirmed = false;
                                }
                            }
                            if (window.coursesAllData) {
                                const course = window.coursesAllData.find(c => c.id == courseId);
                                if (course) {
                                    course.is_confirmed = false;
                                }
                            }
                            break;
                        }
                        parentDiv = parentDiv.parentElement;
                    }
                }
            }
        });
        
        // 更新批量删除按钮状态
        if (typeof updateBatchDeleteButton === 'function') {
            updateBatchDeleteButton();
        }
    })
    .catch(err => {
        console.error('批量取消确认失败:', err);
        alert('批量取消确认失败：' + (err.message || '未知错误'));
    });
}

function batchDeleteCourses() {
    const checkboxes = document.querySelectorAll('.course-checkbox:checked');
    if (checkboxes.length === 0) {
        alert('请先选择要删除的课程');
        return;
    }
    
    // 过滤掉已确认的排课（如果用户不是管理员）
    const courseIds = Array.from(checkboxes)
        .filter(cb => {
            // 如果用户是管理员，可以选择所有排课
            if (currentUserRole === 'admin') {
                return true;
            }
            // 如果不是管理员，只能选择未确认的排课
            const row = cb.closest('tr');
            if (row) {
                const confirmBtn = row.querySelector('button[onclick*="confirmCourse"]');
                // 如果按钮文本包含"取消确认"，说明已确认，不能删除
                return !confirmBtn || !confirmBtn.textContent.includes('取消确认');
            }
            return true;
        })
        .map(cb => parseInt(cb.value));
    
    if (courseIds.length === 0) {
        alert('您没有权限删除已选中的已确认排课，只有管理员可以删除已确认的排课');
        return;
    }
    
    const count = courseIds.length;
    const filteredCount = Array.from(checkboxes).length - courseIds.length;
    let confirmMessage = `确定要批量删除 ${count} 个课程吗？`;
    if (filteredCount > 0) {
        confirmMessage += `\n\n注意：已过滤 ${filteredCount} 个已确认的排课（只有管理员可以删除）`;
    }
    
    if (!confirm(confirmMessage)) return;
    
    // 逐个删除，并处理错误
    const deletePromises = courseIds.map(id => 
        fetch(`/api/courses/${id}`, { method: 'DELETE' })
            .then(response => response.json())
            .then(data => {
                if (!response.ok) {
                    throw new Error(data.error || '删除失败');
                }
                return { id, success: true };
            })
            .catch(error => {
                console.error(`删除排课 ${id} 失败:`, error);
                return { id, success: false, error: error.message || '未知错误' };
            })
    );
    
    Promise.all(deletePromises)
        .then(results => {
            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;
            
            if (failCount === 0) {
                alert(`成功删除 ${successCount} 个课程`);
            } else {
                alert(`删除完成：成功 ${successCount} 个，失败 ${failCount} 个`);
            }
            
            // 刷新页面并保持当前选择
            if (typeof refreshPageWithCurrentSelection === 'function') {
                refreshPageWithCurrentSelection();
            } else {
                loadCourses();
            }
        })
        .catch(err => {
            console.error('批量删除失败:', err);
            alert('批量删除失败：' + (err.message || '未知错误'));
        });
}

function updateBatchDeleteButton() {
    // 统计所有复选框（包括已确认的课程）
    const allCheckboxes = document.querySelectorAll('.course-checkbox');
    const checkedCheckboxes = document.querySelectorAll('.course-checkbox:checked');
    // 统计已选中的未确认课程复选框（用于批量确认）
    const checkedUnconfirmedCheckboxes = Array.from(checkedCheckboxes).filter(cb => {
        const row = cb.closest('tr');
        if (row) {
            // 列表模式下，检查确认按钮文本是否包含"确认"
            const confirmBtn = row.querySelector('button[onclick*="confirmCourse"]');
            return confirmBtn && confirmBtn.textContent.includes('确认') && !confirmBtn.textContent.includes('取消确认');
        }
        // 星期模式下，检查是否有确认按钮且文本包含"确认"但不包含"取消确认"
        const confirmBtn = cb.parentElement?.querySelector('button[onclick*="confirmCourse"]');
        return confirmBtn && confirmBtn.textContent.includes('确认') && !confirmBtn.textContent.includes('取消确认');
    });
    // 统计已选中的已确认课程复选框（用于批量取消确认）
    const checkedConfirmedCheckboxes = Array.from(checkedCheckboxes).filter(cb => {
        const row = cb.closest('tr');
        if (row) {
            // 列表模式下，检查确认按钮文本是否包含"取消确认"
            const confirmBtn = row.querySelector('button[onclick*="confirmCourse"]');
            return confirmBtn && confirmBtn.textContent.includes('取消确认');
        }
        // 星期模式下，检查是否有确认按钮且文本包含"取消确认"
        const confirmBtn = cb.parentElement?.querySelector('button[onclick*="confirmCourse"]');
        return confirmBtn && confirmBtn.textContent.includes('取消确认');
    });
    
    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    const batchConfirmBtn = document.getElementById('batch-confirm-btn');
    const batchCancelBtn = document.getElementById('batch-cancel-btn');
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    
    // 批量删除按钮始终显示，根据选中数量更新文本
    if (batchDeleteBtn) {
        if (checkedCheckboxes.length > 0) {
            batchDeleteBtn.textContent = `批量删除(${checkedCheckboxes.length})`;
        } else {
            batchDeleteBtn.textContent = '批量删除';
        }
    }
    
    // 批量确认按钮始终显示，根据选中未确认课程数量更新文本
    if (batchConfirmBtn) {
        if (checkedUnconfirmedCheckboxes.length > 0) {
            batchConfirmBtn.textContent = `批量确认(${checkedUnconfirmedCheckboxes.length})`;
        } else {
            batchConfirmBtn.textContent = '批量确认';
        }
    }
    
    // 批量取消按钮始终显示，根据选中已确认课程数量更新文本
    if (batchCancelBtn) {
        if (checkedConfirmedCheckboxes.length > 0) {
            batchCancelBtn.textContent = `批量取消(${checkedConfirmedCheckboxes.length})`;
        } else {
            batchCancelBtn.textContent = '批量取消';
        }
    }
    
    // 更新全选复选框状态
    if (selectAllCheckbox && allCheckboxes.length > 0) {
        selectAllCheckbox.checked = checkedCheckboxes.length === allCheckboxes.length && checkedCheckboxes.length > 0;
    } else if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    // 选择所有复选框（包括已确认的课程）
    const checkboxes = document.querySelectorAll('.course-checkbox');
    
    if (!selectAllCheckbox) return;
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
    
    // 如果全选后没有可选的，取消全选状态
    if (checkboxes.length === 0) {
        selectAllCheckbox.checked = false;
    }
    
    updateBatchDeleteButton();
}

function deleteCourse(id) {
    if (!confirm('确定要删除这次排课吗？')) return;
    
    fetch(`/api/courses/${id}`, { method: 'DELETE' })
        .then(response => response.json())
        .then(data => {
            if (!response.ok) {
                throw new Error(data.error || '删除失败');
            }
            // 刷新页面并保持当前选择
            if (typeof refreshPageWithCurrentSelection === 'function') {
                refreshPageWithCurrentSelection();
            } else {
                loadCourses();
            }
        })
        .catch(error => {
            console.error('删除排课失败:', error);
            alert('删除失败：' + (error.message || '未知错误'));
        });
}

// ==================== 缴费管理 ====================

// 当前视图模式：'record' 或 'reminder'
let currentPaymentView = 'record';
// 分页相关变量
let paymentCurrentPage = 1;
const paymentPageSize = 10; // 每页最多10条记录
let paymentAllData = []; // 存储所有支付记录数据

function showPaymentRecord() {
    currentPaymentView = 'record';
    document.getElementById('payment-record-view').style.display = 'block';
    document.getElementById('payment-reminder-view').style.display = 'none';
    document.getElementById('btn-payment-record').classList.add('btn-primary');
    document.getElementById('btn-payment-record').classList.remove('btn-secondary');
    document.getElementById('btn-payment-reminder').classList.remove('btn-primary');
    document.getElementById('btn-payment-reminder').classList.add('btn-secondary');
    
    // 确保年份下拉框已初始化
    const yearSelect = document.getElementById('payment-year');
    if (yearSelect && yearSelect.options.length === 1) {
        // 如果只有"全部年份"选项，初始化年份选项
        const currentYear = new Date().getFullYear();
        for (let i = currentYear; i >= currentYear - 10; i--) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i + '年';
            if (i === currentYear) {
                option.selected = true;
            }
            yearSelect.appendChild(option);
        }
    }
    
    loadPayments();
}

function showPaymentReminder() {
    currentPaymentView = 'reminder';
    document.getElementById('payment-record-view').style.display = 'none';
    document.getElementById('payment-reminder-view').style.display = 'block';
    document.getElementById('btn-payment-reminder').classList.add('btn-primary');
    document.getElementById('btn-payment-reminder').classList.remove('btn-secondary');
    document.getElementById('btn-payment-record').classList.remove('btn-primary');
    document.getElementById('btn-payment-record').classList.add('btn-secondary');
    loadPaymentReminder();
}

function onPaymentYearChange() {
    // 当年份改变时，保持月份选择，但重新加载数据（月份会与新的年份绑定）
    if (currentPaymentView === 'reminder') {
        loadPaymentReminder();
    } else {
        loadPayments();
    }
}

function onPaymentFilterChange() {
    if (currentPaymentView === 'record') {
        loadPayments();
    }
}

function loadPaymentReminder() {
    // 缴费提醒仍然使用当前月份
    const month = currentMonth;
    
    // 获取配置和课时统计
    Promise.all([
        fetch('/api/finance-config').then(r => r.json()),
        fetch(`/api/stats?month=${month}`).then(r => r.json())
    ]).then(([configs, stats]) => {
        // 获取提醒阈值配置
        const reminderConfig = configs.find(c => c.key === 'min_hours_for_reminder');
        const reminderThreshold = reminderConfig ? reminderConfig.value : 3;
        
        // 筛选出剩余课时低于配置值的学生
        const lowHoursStudents = stats.filter(s => s.remaining_hours < reminderThreshold);
            
            if (lowHoursStudents.length === 0) {
                const tbody = document.getElementById('payment-reminder-table-body');
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">暂无需要缴费提醒的学生</td></tr>';
                return;
            }
            
            // 获取学生详细信息
            fetch('/api/students')
                .then(res => res.json())
                .then(students => {
                    // 创建学生信息映射
                    const studentMap = {};
                    students.forEach(s => {
                        studentMap[s.id] = s;
                    });
                    
                    const tbody = document.getElementById('payment-reminder-table-body');
                    tbody.innerHTML = lowHoursStudents.map(s => {
                        const student = studentMap[s.student_id] || {};
                        const remainingHours = s.remaining_hours || 0;
                        const urgencyClass = remainingHours < 0 ? 'style="color: #dc3545; font-weight: bold;"' : 
                                           remainingHours < 1 ? 'style="color: #ff6b6b; font-weight: bold;"' : 
                                           'style="color: #ff9800; font-weight: bold;"';
                        const urgencyText = remainingHours < 0 ? '（紧急！）' : 
                                          remainingHours < 1 ? '（急需缴费）' : 
                                          '（建议缴费）';
                        
                        return `
                            <tr>
                                <td ${urgencyClass}>${s.student_name}${urgencyText}</td>
                                <td>${student.grade || '-'}</td>
                                <td ${urgencyClass}>${remainingHours}</td>
                                <td>${student.phone || '-'}</td>
                                <td>${student.parent_name || '-'}</td>
                                <td>
                                    <button class="btn btn-primary" onclick="showAddPaymentModalForStudent(${s.student_id})">立即缴费</button>
                                </td>
                            </tr>
                        `;
                    }).join('');
                });
        });
}

function showAddPaymentModalForStudent(studentId) {
    // 切换到缴费记录视图
    showPaymentRecord();
    // 显示缴费模态框并预选学生
    showAddPaymentModal();
    // 等待模态框加载完成后设置学生
    setTimeout(() => {
        const studentSelect = document.querySelector('select[name="student_id"]');
        if (studentSelect) {
            studentSelect.value = studentId;
            // 触发change事件
            const changeEvent = new Event('change', { bubbles: true });
            studentSelect.dispatchEvent(changeEvent);
        }
    }, 500);
}

function loadPayments() {
    const yearSelect = document.getElementById('payment-year');
    const year = yearSelect ? yearSelect.value : '';
    const monthSelect = document.getElementById('payment-month');
    const month = monthSelect ? monthSelect.value : '';
    const studentId = document.getElementById('payment-student-filter').value;
    const paymentType = document.getElementById('payment-type-filter').value;
    const paymentStatus = document.getElementById('payment-status-filter').value;
    
    let url = '/api/payments';
    let hasParams = false;
    
    // 处理月份筛选（优先级高于年份筛选，且与年份绑定）
    if (month && month.trim()) {
        // 用户选择了具体月份，需要结合年份来筛选
        if (year && year.trim()) {
            // 有年份，使用年份+月份组合：YYYY-MM
            const monthStr = String(month).padStart(2, '0');
            url += `?month=${year}-${monthStr}`;
            hasParams = true;
        } else {
            // 没有选择年份，但选择了月份，使用当前年份
            const currentYear = new Date().getFullYear();
            const monthStr = String(month).padStart(2, '0');
            url += `?month=${currentYear}-${monthStr}`;
            hasParams = true;
        }
    } else {
        // 没有选择月份，处理年度筛选
        if (year !== undefined && year !== null) {
            // year 有值（可能是空字符串或具体年份）
            if (year === '') {
                // 用户选择了"全部年份"，传递 year= 参数（空字符串），后端会显示所有年份
                url += `?year=`;
                hasParams = true;
            } else {
                // 用户选择了具体年份
                url += `?year=${year}`;
                hasParams = true;
            }
        } else {
            // year 未定义（初始状态），且没有选择学生，默认使用当前年份
            if (!studentId) {
                const currentYear = new Date().getFullYear();
                url += `?year=${currentYear}`;
                hasParams = true;
            }
        }
    }
    
    // 添加学生筛选
    if (studentId) {
        url += hasParams ? `&student_id=${studentId}` : `?student_id=${studentId}`;
        hasParams = true;
    }
    
    // 添加类型筛选
    if (paymentType) {
        url += hasParams ? `&type=${paymentType}` : `?type=${paymentType}`;
        hasParams = true;
    }
    
    // 添加状态筛选
    if (paymentStatus) {
        url += hasParams ? `&status=${paymentStatus}` : `?status=${paymentStatus}`;
        hasParams = true;
    }
    
    // 获取课时统计和配置，用于显示剩余课时
    // 使用当前月份获取课时统计（用于显示剩余课时）
    const currentMonth = new Date().toISOString().slice(0, 7);
    Promise.all([
        fetch(url).then(r => r.json()),
        fetch(`/api/stats?month=${currentMonth}`).then(r => r.json()),
        fetch('/api/finance-config').then(r => r.json())
    ]).then(([payments, stats, configs]) => {
        // 获取提醒阈值配置
        const reminderConfig = configs.find(c => c.key === 'min_hours_for_reminder');
        const reminderThreshold = reminderConfig ? reminderConfig.value : 3;
        
        // 创建学生-课程剩余课时映射（按学生和课程分组）
        const remainingHoursMap = {};
        stats.forEach(s => {
            // 使用 (student_id, course_id) 作为键，确保同一学生不同课程的课时独立计算
            const key = `${s.student_id}_${s.course_id || 'null'}`;
            remainingHoursMap[key] = s.remaining_hours || 0;
        });
        
        // 为每个支付记录添加剩余课时和状态信息，用于排序和筛选
        let paymentsWithInfo = payments.map(p => {
            const status = p.status || '进行中';
            // 优先使用后端返回的剩余课时，如果没有则从映射中查找（按学生和课程）
            let remainingHours = p.remaining_hours;
            if (remainingHours === undefined) {
                const key = `${p.student_id}_${p.course_id || 'null'}`;
                remainingHours = remainingHoursMap[key] || 0;
            }
            return {
                ...p,
                _status: status,
                _remainingHours: remainingHours
            };
        });
        
        // 应用状态筛选（如果选择了状态）
        if (paymentStatus) {
            paymentsWithInfo = paymentsWithInfo.filter(p => p._status === paymentStatus);
        }
        
        // 排序：状态为"进行中"的记录按剩余课时升序排列，状态为"结束"的记录放在后面
        paymentsWithInfo.sort((a, b) => {
            // 如果状态不同，进行中的排在前面
            if (a._status === '结束' && b._status !== '结束') {
                return 1;
            }
            if (a._status !== '结束' && b._status === '结束') {
                return -1;
            }
            // 如果都是进行中，按剩余课时升序排序
            if (a._status !== '结束' && b._status !== '结束') {
                return a._remainingHours - b._remainingHours;
            }
            // 如果都是结束，保持原顺序
            return 0;
        });
        
        // 保存所有数据
        paymentAllData = paymentsWithInfo;
        
        // 重置到第一页（如果筛选条件改变）
        paymentCurrentPage = 1;
        
        // 渲染当前页数据
        renderPaymentPage();
        
        // 更新分页控件
        updatePaymentPagination();
    });
    
    // 加载学生列表到筛选器
    fetch('/api/students')
        .then(res => res.json())
        .then(students => {
            const select = document.getElementById('payment-student-filter');
            const currentValue = select.value;
            select.innerHTML = '<option value="">全部学生</option>' +
                students.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            select.value = currentValue;
        });
}

// 渲染当前页的支付记录
function renderPaymentPage() {
    const startIndex = (paymentCurrentPage - 1) * paymentPageSize;
    const endIndex = startIndex + paymentPageSize;
    const currentPageData = paymentAllData.slice(startIndex, endIndex);
    
    // 获取课时统计和配置，用于显示剩余课时
    const currentMonth = new Date().toISOString().slice(0, 7);
    Promise.all([
        fetch(`/api/stats?month=${currentMonth}`).then(r => r.json()),
        fetch('/api/finance-config').then(r => r.json())
    ]).then(([stats, configs]) => {
        // 获取提醒阈值配置
        const reminderConfig = configs.find(c => c.key === 'min_hours_for_reminder');
        const reminderThreshold = reminderConfig ? reminderConfig.value : 3;
        
        // 创建学生-课程剩余课时映射（按学生和课程分组）
        const remainingHoursMap = {};
        stats.forEach(s => {
            // 使用 (student_id, course_id) 作为键，确保同一学生不同课程的课时独立计算
            const key = `${s.student_id}_${s.course_id || 'null'}`;
            remainingHoursMap[key] = s.remaining_hours || 0;
        });
        
        const tbody = document.getElementById('payments-table-body');
        
        // 计算所有筛选后的数据合计（不是当前页）
        const totals = calculatePagePaymentTotals(paymentAllData || []);
        
        // 渲染合计行的函数（更新独立的合计模块）
        function renderTotalsRow() {
            // 更新独立的合计模块
            const totalPaidEl = document.getElementById('total-paid-amount');
            const totalDiscountEl = document.getElementById('total-discount');
            const totalRefundEl = document.getElementById('total-refund-amount');
            const totalRemainingEl = document.getElementById('total-remaining-cost');
            
            if (totalPaidEl) totalPaidEl.textContent = totals.totalPaidAmount.toFixed(2);
            if (totalDiscountEl) totalDiscountEl.textContent = totals.totalDiscount.toFixed(2);
            if (totalRefundEl) totalRefundEl.textContent = totals.totalRefundAmount.toFixed(2);
            if (totalRemainingEl) totalRemainingEl.textContent = totals.totalRemainingCost.toFixed(2);
        }
        
        if (currentPageData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="14" style="text-align: center;">暂无数据</td></tr>';
            // 即使没有数据，也显示合计行（显示0）
            renderTotalsRow();
            return;
        }
        
        tbody.innerHTML = currentPageData.map((p, index) => {
            // 计算序号：第一页从1开始，第二页接着第一页的序号
            const sequenceNumber = (paymentCurrentPage - 1) * paymentPageSize + index + 1;
            
            const type = p.type || '缴费';
            const typeBadge = type === '退费' 
                ? '<span class="status-badge" style="background: #dc3545; color: white;">退费</span>'
                : '<span class="status-badge" style="background: #28a745; color: white;">缴费</span>';
            const amountColor = type === '退费' ? 'style="color: #dc3545; font-weight: bold;"' : '';
            const amountPrefix = type === '退费' ? '-' : '';
            
            // 计算剩余课时和剩余费用（优先使用API返回的值）
            // 如果没有，则从映射中查找（按学生和课程）
            let remainingHours = p.remaining_hours;
            if (remainingHours === undefined) {
                const key = `${p.student_id}_${p.course_id || 'null'}`;
                remainingHours = remainingHoursMap[key] || 0;
            }
            const remainingCost = p.remaining_cost !== undefined ? p.remaining_cost : (remainingHours * (p.unit_price || 0));
            
            // 获取状态
            const status = p.status || '进行中';
            const statusBadge = status === '结束' 
                ? '<span class="status-badge" style="background: #6c757d; color: white;">结束</span>'
                : '<span class="status-badge" style="background: #17a2b8; color: white;">进行中</span>';
            
            // 如果剩余课时为负数，剩余费用也显示为负数
            const remainingHoursColor = remainingHours < 0 ? 'style="color: #dc3545; font-weight: bold;"' : '';
            const remainingCostColor = remainingCost < 0 ? 'style="color: #dc3545; font-weight: bold;"' : '';
            const remainingCostPrefix = remainingCost < 0 ? '-' : '';
            
            // 如果状态标注为结束，显示为灰色
            // 如果状态为进行中，不显示为灰色
            // 如果剩余课时 < 配置值，显示红色警告（还需要缴费）
            const rowClass = status === '结束' ? 'style="color: #999; opacity: 0.7;"' : '';
            const nameClass = remainingHours < reminderThreshold && type === '缴费' && status !== '结束' ? 'style="color: #ff6b6b; font-weight: bold;"' : '';
            const warningText = remainingHours < reminderThreshold && type === '缴费' && status !== '结束' ? ` (剩余课时: ${remainingHours}，请及时缴费！)` : '';
            
            return `
                <tr ${rowClass}>
                    <td>${sequenceNumber}</td>
                    <td>${typeBadge}</td>
                    <td>${p.payment_date}</td>
                    <td ${nameClass}>${p.student_name}${warningText}</td>
                    <td>${p.course_name || '-'}</td>
                    <td>${p.original_amount.toFixed(2)}</td>
                    <td>${p.discount_rate.toFixed(2)}</td>
                    <td ${amountColor}>${amountPrefix}${p.paid_amount.toFixed(2)}</td>
                    <td>${p.class_count}</td>
                    <td>${p.unit_price ? p.unit_price.toFixed(2) : '-'}</td>
                    <td ${remainingHoursColor}>${remainingHours.toFixed(2)}</td>
                    <td ${remainingCostColor}>${remainingCostPrefix}${Math.abs(remainingCost).toFixed(2)}</td>
                    <td>${statusBadge}</td>
                    <td>${p.remark || '-'}</td>
                    <td>
                        <button class="btn btn-danger" onclick="deletePayment(${p.id})">删除</button>
                    </td>
                </tr>
            `;
        }).join('');
        
        // 渲染合计行
        renderTotalsRow();
        
        // 移除警告提示（现在有专门的提醒页面）
        const warningDiv = document.getElementById('payment-warning');
        if (warningDiv) {
            warningDiv.remove();
        }
    });
}

// 计算缴费记录合计（所有数据）
function calculatePaymentTotals(payments) {
    let totalOriginalAmount = 0;
    let totalDiscount = 0;
    let totalPaidAmount = 0;
    let totalClassCount = 0;
    let totalRemainingHours = 0;
    let totalRemainingCost = 0;
    
    payments.forEach(p => {
        const type = p.type || '缴费';
        const multiplier = type === '退费' ? -1 : 1;
        
        totalOriginalAmount += (p.original_amount || 0) * multiplier;
        totalDiscount += (p.discount_rate || 0) * multiplier;
        totalPaidAmount += (p.paid_amount || 0) * multiplier;
        totalClassCount += (p.class_count || 0) * multiplier;
        
        // 剩余课时和剩余费用只统计缴费记录，不统计退费
        if (type === '缴费') {
            const remainingHours = p.remaining_hours !== undefined ? p.remaining_hours : 0;
            const remainingCost = p.remaining_cost !== undefined ? p.remaining_cost : (remainingHours * (p.unit_price || 0));
            totalRemainingHours += remainingHours;
            totalRemainingCost += remainingCost;
        }
    });
    
    return {
        totalOriginalAmount,
        totalDiscount,
        totalPaidAmount,
        totalClassCount,
        totalRemainingHours,
        totalRemainingCost
    };
}

// 计算当页缴费记录合计（只计算当前页的数据）
function calculatePagePaymentTotals(payments) {
    let totalPaidAmount = 0;      // 缴费总额
    let totalDiscount = 0;        // 优惠总额
    let totalRefundAmount = 0;    // 退费总额
    let totalRemainingCost = 0;   // 剩余费用
    
    payments.forEach(p => {
        const type = p.type || '缴费';
        
        if (type === '缴费') {
            // 缴费记录：累加缴费金额和优惠
            totalPaidAmount += p.paid_amount || 0;
            totalDiscount += p.discount_rate || 0;
            
            // 剩余费用只统计缴费记录
            const remainingHours = p.remaining_hours !== undefined ? p.remaining_hours : 0;
            const remainingCost = p.remaining_cost !== undefined ? p.remaining_cost : (remainingHours * (p.unit_price || 0));
            totalRemainingCost += remainingCost;
        } else if (type === '退费') {
            // 退费记录：累加退费金额
            totalRefundAmount += p.paid_amount || 0;
        }
    });
    
    return {
        totalPaidAmount,
        totalDiscount,
        totalRefundAmount,
        totalRemainingCost
    };
}

// 更新分页控件显示
function updatePaymentPagination() {
    const totalPages = Math.max(1, Math.ceil(paymentAllData.length / paymentPageSize));
    const pageInfo = document.getElementById('payment-page-info');
    const prevBtn = document.getElementById('payment-prev-btn');
    const nextBtn = document.getElementById('payment-next-btn');
    
    if (pageInfo) {
        if (paymentAllData.length === 0) {
            pageInfo.textContent = '暂无记录';
        } else {
            pageInfo.textContent = `第 ${paymentCurrentPage} 页，共 ${totalPages} 页（共 ${paymentAllData.length} 条记录）`;
        }
    }
    
    if (prevBtn) {
        prevBtn.disabled = paymentCurrentPage <= 1 || paymentAllData.length === 0;
    }
    
    if (nextBtn) {
        nextBtn.disabled = paymentCurrentPage >= totalPages || paymentAllData.length === 0;
    }
}

// 切换支付记录页面
function changePaymentPage(delta) {
    const totalPages = Math.ceil(paymentAllData.length / paymentPageSize);
    const newPage = paymentCurrentPage + delta;
    
    if (newPage >= 1 && newPage <= totalPages) {
        paymentCurrentPage = newPage;
        renderPaymentPage();
        updatePaymentPagination();
    }
}

function showAddPaymentModal() {
    showPaymentModal('缴费');
}

function showRefundModal() {
    showPaymentModal('退费');
}

function showPaymentModal(type) {
    // 获取当前月份（用于显示学生剩余课时，始终使用当前月份）
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    Promise.all([
        fetch('/api/students').then(r => r.json()),
        fetch('/api/courses_manage').then(r => r.json()),
        fetch(`/api/stats?month=${currentMonth}`).then(r => r.json()),
        fetch('/api/finance-config').then(r => r.json())
    ]).then(([students, courses, stats, configs]) => {
        // 获取提醒阈值配置
        const reminderConfig = configs.find(c => c.key === 'min_hours_for_reminder');
        const reminderThreshold = reminderConfig ? reminderConfig.value : 3;
        
        // 存储到全局变量
        window.minHoursForReminder = reminderThreshold;
        // 创建剩余课时映射（按学生和课程分组）
        const remainingHoursMap = {};
        stats.forEach(s => {
            // 使用 (student_id, course_id) 作为键，确保同一学生不同课程的课时独立计算
            const key = `${s.student_id}_${s.course_id || 'null'}`;
            remainingHoursMap[key] = s.remaining_hours || 0;
        });
        // 将映射存储到全局变量，供 updatePaymentRemainingHoursDisplay 使用
        window.paymentRemainingHoursMap = remainingHoursMap;
        
        const studentOptions = students.map(s => {
            // 获取该学生所有课程的剩余课时列表
            const studentStats = stats.filter(st => st.student_id === s.id);
            let displayText = s.name;
            if (studentStats.length > 0) {
                const hoursList = studentStats.map(st => `${st.course_name || '未命名课程'}: ${st.remaining_hours || 0}`).join('; ');
                displayText += ` - 剩余课时: ${hoursList}`;
            } else {
                displayText += ' - 剩余课时: 0';
            }
            return `<option value="${s.id}">${displayText}</option>`;
        }).join('');
        const courseOptions = '<option value="">-- 选择课程（可选，将自动计算费用）--</option>' + 
            courses.filter(c => c.status === '启用')
                .map(c => `<option value="${c.id}" data-price="${c.unit_price}">${c.name} (单价: ${c.unit_price}元)</option>`).join('');
        
        const modalBody = `
            <h2>新增${type}</h2>
            <form id="payment-form" onsubmit="savePayment(event)">
                <input type="hidden" name="type" value="${type}">
                <div class="form-group">
                    <label>${type}日期 *</label>
                    <input type="date" name="payment_date" value="${new Date().toISOString().slice(0, 10)}" required>
                </div>
                <div class="form-group">
                    <label>学生 *</label>
                    <select name="student_id" id="payment-student-select" required onchange="updatePaymentRemainingHoursDisplay()">${studentOptions}</select>
                </div>
                <div id="payment-remaining-hours-display" style="margin: -10px 0 15px 0; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 14px;">
                    <span id="payment-remaining-hours-text">请选择学生查看剩余课时</span>
                </div>
                <div class="form-group">
                    <label>课程（可选）</label>
                    <select name="course_id" id="payment-course-select" onchange="updatePaymentAmount(); updatePaymentRemainingHoursDisplay();">
                        ${courseOptions}
                    </select>
                    <small style="color: #666;">选择课程后，将根据课程单价和报课节数自动计算原始费用</small>
                </div>
                <div class="form-group">
                    <label>${type === '退费' ? '退费' : '报课'}节数 *</label>
                    <input type="number" name="class_count" id="payment-class-count" step="1" required min="1" onchange="updatePaymentAmount()">
                </div>
                <div class="form-group">
                    <label>原始费用 *</label>
                    <input type="number" name="original_amount" id="payment-original-amount" step="0.01" required onchange="calculatePaymentAmount()">
                    <small style="color: #666;">选择课程后将自动计算，也可手动输入</small>
                </div>
                <div class="form-group">
                    <label>优惠</label>
                    <input type="number" name="discount_rate" id="payment-discount-rate" class="no-spinner" step="0.01" value="0" min="0" onchange="calculatePaymentAmount()">
                </div>
                <div class="form-group">
                    <label>${type === '退费' ? '退费' : '缴费'}金额</label>
                    <input type="number" name="paid_amount" id="payment-paid-amount" step="0.01" readonly style="background-color: #f5f5f5;">
                    <small style="color: #666;">自动计算：原始费用 - 优惠</small>
                </div>
                <div class="form-group">
                    <label>备注</label>
                    <textarea name="remark"></textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn" onclick="closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        `;
        showModal(modalBody);
        // 初始化时计算一次缴费金额
        setTimeout(() => {
            // 如果已选择学生，显示剩余课时
            updatePaymentRemainingHoursDisplay();
            calculatePaymentAmount();
        }, 100);
    });
}

function updatePaymentAmount() {
    const courseSelect = document.getElementById('payment-course-select');
    const classCountInput = document.getElementById('payment-class-count');
    const originalAmountInput = document.getElementById('payment-original-amount');
    
    if (courseSelect && classCountInput && originalAmountInput && 
        courseSelect.value && classCountInput.value) {
        const selectedOption = courseSelect.options[courseSelect.selectedIndex];
        const unitPrice = parseFloat(selectedOption.getAttribute('data-price'));
        const classCount = parseInt(classCountInput.value);
        
        if (unitPrice && classCount) {
            originalAmountInput.value = (unitPrice * classCount).toFixed(2);
            // 重新计算缴费金额
            calculatePaymentAmount();
        }
    }
}

function calculatePaymentAmount() {
    const originalAmountInput = document.getElementById('payment-original-amount');
    const discountRateInput = document.getElementById('payment-discount-rate');
    const paidAmountInput = document.getElementById('payment-paid-amount');
    
    if (originalAmountInput && discountRateInput && paidAmountInput) {
        const originalAmount = parseFloat(originalAmountInput.value) || 0;
        const discountRate = parseFloat(discountRateInput.value) || 0;
        
        // 计算缴费金额：原始费用 - 优惠（优惠是金额）
        const paidAmount = originalAmount - discountRate;
        
        paidAmountInput.value = paidAmount.toFixed(2);
    }
}

function savePayment(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(() => {
        closeModal();
        // 根据当前视图刷新相应内容
        if (currentPaymentView === 'reminder') {
            loadPaymentReminder();
        } else {
            loadPayments();
        }
        // 如果stats页面存在，也刷新
        if (typeof loadStats === 'function') {
            loadStats();
        }
    });
}

// 更新缴费/退费模态框中的剩余课时显示
function updatePaymentRemainingHoursDisplay() {
    const studentSelect = document.getElementById('payment-student-select');
    const courseSelect = document.getElementById('payment-course-select');
    const displayDiv = document.getElementById('payment-remaining-hours-display');
    const textSpan = document.getElementById('payment-remaining-hours-text');
    
    if (!studentSelect || !displayDiv || !textSpan) return;
    
    const studentId = studentSelect.value;
    if (!studentId) {
        textSpan.textContent = '请选择学生查看剩余课时';
        displayDiv.style.background = '#f5f5f5';
        displayDiv.style.color = '#333';
        return;
    }
    
    // 获取课程ID（可能为空）
    const courseId = courseSelect ? courseSelect.value : null;
    
    // 从全局映射中获取剩余课时（按学生和课程）
    const remainingHoursMap = window.paymentRemainingHoursMap || {};
    const key = `${studentId}_${courseId || 'null'}`;
    const remainingHours = remainingHoursMap[key] || 0;
    
    // 获取配置值，如果没有则使用默认值
    const reminderThreshold = window.minHoursForReminder !== undefined ? window.minHoursForReminder : 3.0;
    
    // 如果选择了课程，显示该课程的剩余课时；否则显示提示信息
    if (courseId) {
        const courseName = courseSelect.options[courseSelect.selectedIndex].text.split(' (')[0];
        if (remainingHours < reminderThreshold) {
            textSpan.innerHTML = `<span style="color: #ff6b6b; font-weight: bold;">⚠️ ${courseName} 剩余课时: ${remainingHours}，低于 ${reminderThreshold}</span>`;
            displayDiv.style.background = '#fff3cd';
            displayDiv.style.border = '1px solid #ffc107';
        } else {
            textSpan.innerHTML = `<span style="color: #28a745;">✓ ${courseName} 剩余课时: ${remainingHours}</span>`;
            displayDiv.style.background = '#d4edda';
            displayDiv.style.border = '1px solid #28a745';
        }
    } else {
        // 未选择课程时，显示提示信息
        textSpan.textContent = '请选择课程查看该课程的剩余课时';
        displayDiv.style.background = '#f5f5f5';
        displayDiv.style.color = '#333';
    }
}

function deletePayment(id) {
    if (!confirm('确定要删除这条缴费记录吗？')) return;
    
    fetch(`/api/payments/${id}`, { method: 'DELETE' })
        .then(() => {
            loadPayments();
            loadStats();
        });
}

// ==================== 课时统计 ====================

function loadStats() {
    const month = document.getElementById('stats-month').value || currentMonth;
    const studentFilter = document.getElementById('stats-student-filter');
    const selectedStudentId = studentFilter ? studentFilter.value : '';
    
    // 加载学生列表（如果还没有加载）
    if (studentFilter && studentFilter.options.length === 1) {
        fetch('/api/students?status=在校')
            .then(res => res.json())
            .then(students => {
                // 添加选项
                students.forEach(student => {
                    const option = document.createElement('option');
                    option.value = student.id;
                    option.textContent = student.name;
                    studentFilter.appendChild(option);
                });
                
                // 加载数据
                loadStatsData(month, selectedStudentId);
            })
            .catch(err => {
                console.error('加载学生列表失败:', err);
                loadStatsData(month, selectedStudentId);
            });
    } else {
        loadStatsData(month, selectedStudentId);
    }
}

function loadStatsData(month, selectedStudentId) {
    let url = `/api/stats?month=${month}`;
    if (selectedStudentId) {
        url += `&student_id=${selectedStudentId}`;
    }
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            const tbody = document.getElementById('stats-table-body');
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">暂无数据</td></tr>';
                return;
            }
            
            // 按课程名称统计剩余课时
            const courseRemainingHours = {};
            data.forEach(s => {
                const courseName = s.course_name || '未知课程';
                if (!courseRemainingHours[courseName]) {
                    courseRemainingHours[courseName] = 0;
                }
                courseRemainingHours[courseName] += (s.remaining_hours || 0);
            });
            
            // 按学生和课程分组数据
            const groupedData = {};
            data.forEach(s => {
                const key = `${s.student_id}-${s.student_name}`;
                if (!groupedData[key]) {
                    groupedData[key] = {
                        student_id: s.student_id,
                        student_name: s.student_name,
                        courses: []
                    };
                }
                groupedData[key].courses.push(s);
            });
            
            // 渲染分组后的数据
            tbody.innerHTML = Object.values(groupedData).map(studentGroup => {
                // 如果学生只有一个课程，直接显示
                if (studentGroup.courses.length === 1) {
                    const s = studentGroup.courses[0];
                    return renderStatsRow(s, courseRemainingHours);
                } else {
                    // 如果学生有多个课程，为每个课程显示一行
                    return studentGroup.courses.map(s => renderStatsRow(s, courseRemainingHours)).join('');
                }
            }).join('');
        });
}

function renderStatsRow(s, courseRemainingHours) {
    // 格式化上课日期和时段
    // 格式：老师姓名:日期(星期) 时段;日期(星期) 时段;
    const courseDetails = s.course_details || [];
    let courseDetailsHtml;
    if (courseDetails.length > 0) {
        courseDetailsHtml = courseDetails.map(detail => {
            // 解析格式：老师姓名:日期(星期) 时段;日期(星期) 时段;
            const colonIndex = detail.indexOf(':');
            if (colonIndex === -1) {
                return `<div style="margin: 3px 0; padding: 4px 8px; background: #f5f5f5; border-radius: 4px; font-size: 12px;">${detail}</div>`;
            }
            
            const teacherName = detail.substring(0, colonIndex);
            const timesPart = detail.substring(colonIndex + 1);
            
            // 解析时间段（用分号分隔）
            const timeSlots = timesPart.split(';').filter(t => t.trim());
            
            return `<div style="margin: 5px 0; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 12px;">
                <div style="font-weight: bold; color: #667eea; margin-bottom: 4px;">${teacherName}:</div>
                <div style="color: #666; margin-left: 10px;">
                    ${timeSlots.map(time => `<div style="margin: 2px 0;">${time}</div>`).join('')}
                </div>
            </div>`;
        }).join('');
    } else {
        courseDetailsHtml = '<span style="color: #999; font-style: italic;">暂无上课记录</span>';
    }
    
    // 获取该课程名称对应的总剩余课时
    const courseName = s.course_name || '未知课程';
    const totalRemainingHours = courseRemainingHours[courseName] || 0;
    
    return `
        <tr>
            <td>${s.student_name}</td>
            <td style="font-weight: bold; color: #1976d2;">${courseName}</td>
            <td>${s.actual_hours}</td>
            <td>${s.last_month_total}</td>
            <td>${s.current_month_total}</td>
            <td>
                <div style="font-weight: bold; color: #28a745; margin-bottom: 2px;">${s.remaining_hours}</div>
                <div style="font-size: 11px; color: #666;">(${courseName}总计: ${totalRemainingHours})</div>
            </td>
            <td style="max-width: 350px; word-wrap: break-word; padding: 10px;">${courseDetailsHtml}</td>
        </tr>
    `;
}

// ==================== 老师课时 ====================

function loadTeacherHours() {
    const month = document.getElementById('teacher-hours-month').value || currentMonth;
    const currentTab = window.currentTab || 'parttime'; // 默认显示兼职
    const employmentType = currentTab === 'fulltime' ? '全职' : '兼职';
    const teacherFilter = document.getElementById('teacher-hours-filter');
    const selectedTeacherId = teacherFilter ? teacherFilter.value : '';
    
    // 加载老师列表（如果还没有加载）
    if (teacherFilter && teacherFilter.options.length === 1) {
        fetch('/api/teachers')
            .then(res => res.json())
            .then(teachers => {
                // 根据当前标签页筛选老师
                const currentTab = window.currentTab || 'parttime'; // 默认显示兼职
                const filteredTeachers = teachers.filter(t => {
                    if (currentTab === 'fulltime') {
                        return (t.employment_type || '兼职') === '全职' && (t.status || '启用') === '启用';
                    } else {
                        return (t.employment_type || '兼职') === '兼职' && (t.status || '启用') === '启用';
                    }
                });
                
                // 添加选项
                filteredTeachers.forEach(teacher => {
                    const option = document.createElement('option');
                    option.value = teacher.id;
                    option.textContent = teacher.name;
                    teacherFilter.appendChild(option);
                });
                
                // 加载数据
                loadTeacherHoursData(month, employmentType, selectedTeacherId);
            })
            .catch(err => {
                console.error('加载老师列表失败:', err);
                loadTeacherHoursData(month, employmentType, selectedTeacherId);
            });
    } else {
        loadTeacherHoursData(month, employmentType, selectedTeacherId);
    }
}

function loadTeacherHoursData(month, employmentType, selectedTeacherId) {
    fetch(`/api/teacher-hours?month=${month}&employment_type=${employmentType}`)
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP错误: ${res.status} ${res.statusText}`);
            }
            return res.json();
        })
        .then(data => {
            // 如果选择了老师，进行筛选
            if (selectedTeacherId) {
                data = data.filter(h => h.teacher_id == selectedTeacherId);
            }
            
            const currentTab = window.currentTab || 'parttime'; // 默认显示兼职
            const tbodyId = currentTab === 'fulltime' ? 'fulltime-teacher-hours-table-body' : 'parttime-teacher-hours-table-body';
            const tbody = document.getElementById(tbodyId);
            const colspan = currentTab === 'fulltime' ? 12 : 11; // 增加1列用于复选框
            
            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center;">暂无数据</td></tr>`;
            } else {
                // 按教师和课程分组数据
                const groupedData = {};
                data.forEach(h => {
                    const key = `${h.teacher_id}-${h.month}`;
                    if (!groupedData[key]) {
                        groupedData[key] = {
                            teacher_id: h.teacher_id,
                            teacher_name: h.teacher_name,
                            month: h.month,
                            courses: [],
                            total_hours_all: 0,
                            total_course_salary: 0,
                            total_experience_cost: 0,
                            total_salary: 0,
                            base_salary: h.base_salary || 0,
                            incentive: h.incentive || 0,
                            remark: h.remark || '',
                            updated_at: h.updated_at,
                            employment_type: h.employment_type || '兼职',
                            calculation_details: [],
                            is_settled: h.is_settled || false,
                            settled_at: h.settled_at || null,
                            hours_ids: []  // 存储所有相关的hours_id
                        };
                    }
                    // 收集hours_id
                    if (h.id && !groupedData[key].hours_ids.includes(h.id)) {
                        groupedData[key].hours_ids.push(h.id);
                    }
                    // 如果任何一个记录已结算，则整个分组标记为已结算
                    if (h.is_settled) {
                        groupedData[key].is_settled = true;
                        if (h.settled_at && (!groupedData[key].settled_at || h.settled_at > groupedData[key].settled_at)) {
                            groupedData[key].settled_at = h.settled_at;
                        }
                    }
                    // 添加课程信息
                    groupedData[key].courses.push({
                        course_id: h.course_id,
                        course_name: h.course_name,
                        total_hours: h.total_hours || 0,
                        course_salary: h.course_salary || 0,
                        experience_cost: h.experience_cost || 0,
                        course_details: h.course_details || [],
                        calculation_details: h.calculation_details || []
                    });
                    groupedData[key].total_hours_all += (h.total_hours || 0);
                    // 注意：每个课程记录的course_salary已经包含了该教师该月份所有课程的工资
                    // 所以不应该累加，只使用第一个课程记录的course_salary即可
                    if (groupedData[key].total_course_salary === 0) {
                        groupedData[key].total_course_salary = h.course_salary || 0;
                    }
                    // 同样，experience_cost也不应该累加
                    if (groupedData[key].total_experience_cost === 0) {
                        groupedData[key].total_experience_cost = h.experience_cost || 0;
                    }
                    // 合并计算明细（去重，避免重复）
                    if (h.calculation_details && h.calculation_details.length > 0) {
                        // 使用Set来去重，基于学生-课程组合
                        const existingKeys = new Set(
                            groupedData[key].calculation_details.map(d => `${d.student_name}-${d.course_name}`)
                        );
                        h.calculation_details.forEach(detail => {
                            const detailKey = `${detail.student_name}-${detail.course_name}`;
                            if (!existingKeys.has(detailKey)) {
                                groupedData[key].calculation_details.push(detail);
                                existingKeys.add(detailKey);
                            }
                        });
                    }
                });
                
                // 计算总工资
                Object.keys(groupedData).forEach(key => {
                    const group = groupedData[key];
                    group.total_salary = group.total_course_salary + group.total_experience_cost + group.base_salary + group.incentive;
                });
                
                // 渲染分组后的数据
                tbody.innerHTML = Object.values(groupedData).map((group, index) => {
                    const h = group; // 使用分组后的数据
                    // 按课程分组显示上课详情
                    let courseDetailsHtml = '';
                    if (h.courses && h.courses.length > 0) {
                        // 收集第一个课程的所有详情（因为每个课程记录的course_details都包含所有课程的详情）
                        const allCourseDetails = h.courses[0].course_details || [];
                        
                        courseDetailsHtml = h.courses.map(course => {
                            // 只显示属于当前课程的学生-课程详情
                            const filteredDetails = allCourseDetails.filter(detail => {
                                const parts = detail.split(': ');
                                const studentCoursePart = parts[0] || '';
                                const studentCourseMatch = studentCoursePart.match(/^(.+?)-(.+)$/);
                                const detailCourseName = studentCourseMatch ? studentCourseMatch[2] : '';
                                // 只匹配当前课程名称
                                return detailCourseName === course.course_name;
                            });
                            
                            // 如果没有已确认的课程，不显示该课程分组
                            if (filteredDetails.length === 0) {
                                return '';
                            }
                            
                            let courseDetailHtml = '';
                            
                            if (filteredDetails.length > 0) {
                                courseDetailHtml = filteredDetails.map(detail => {
                                    // 解析格式：学生姓名-课程名称: 时间1; 时间2; ...
                                    const parts = detail.split(': ');
                                    const studentCoursePart = parts[0] || '';
                                    const timesPart = parts[1] || '';
                                    
                                    // 分离学生姓名和课程名称
                                    const studentCourseMatch = studentCoursePart.match(/^(.+?)-(.+)$/);
                                    const studentName = studentCourseMatch ? studentCourseMatch[1] : '';
                                    const courseName = studentCourseMatch ? studentCourseMatch[2] : '';
                                    
                                    // 分离各个时间，并格式化日期（只显示日）
                                    const times = timesPart.split('; ').filter(t => t.trim()).map(time => {
                                        // 格式：2024-01-15(周一) 8:10-9:30 或 2024-01-15(周一)
                                        // 改为：15(周一) 8:10-9:30 或 15(周一)
                                        return time.replace(/(\d{4})-(\d{2})-(\d{2})/g, '$3');
                                    });
                                    
                                    // 将时间按每2个分组
                                    const timesPerRow = 2;
                                    const timeRows = [];
                                    for (let i = 0; i < times.length; i += timesPerRow) {
                                        timeRows.push(times.slice(i, i + timesPerRow));
                                    }
                                    
                                    return `<div style="margin: 2px 0; padding: 4px 5px; background: #f5f5f5; border-radius: 2px; font-size: 10px;">
                                        <div style="margin-bottom: 2px; line-height: 1.3;">
                                            <span style="color: #667eea; font-weight: 500; font-size: 10px;">${studentName}</span>
                                            <span style="color: #764ba2; font-weight: 500; margin-left: 2px; font-size: 10px;">-${courseName}</span>
                                            <span style="color: #666;">:</span>
                                        </div>
                                        <div style="margin-left: 6px; color: #333;">
                                            ${timeRows.map(row => `
                                                <div style="margin-bottom: 1px; display: flex; flex-wrap: nowrap; align-items: center; gap: 4px;">
                                                    ${row.map(time => `<span style="display: inline-block; flex: 0 1 auto; padding: 1px 3px; background: white; border-radius: 2px; white-space: nowrap; font-size: 9px;">${time}</span>`).join('')}
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>`;
                                }).join('');
                            } else {
                                courseDetailHtml = '<span style="color: #999; font-style: italic;">暂无上课记录</span>';
                            }
                            
                            // 为每个课程添加标题和课时数
                            return `
                                <div style="margin-bottom: 8px; padding: 6px; background: #e3f2fd; border-left: 3px solid #2196f3; border-radius: 3px;">
                                    <div style="font-weight: bold; color: #1976d2; margin-bottom: 4px; font-size: 11px;">
                                        ${course.course_name} <span style="color: #666; font-weight: normal;">(${course.total_hours}课时)</span>
                                    </div>
                                    <div style="margin-left: 8px;">
                                        ${courseDetailHtml}
                                    </div>
                                </div>
                            `;
                        }).filter(html => html.trim() !== '').join(''); // 过滤掉空字符串
                    } else {
                        courseDetailsHtml = '<span style="color: #999; font-style: italic;">暂无上课记录</span>';
                    }
                    
                    // 如果过滤后没有课程分组，显示"暂无上课记录"
                    if (courseDetailsHtml.trim() === '') {
                        courseDetailsHtml = '<span style="color: #999; font-style: italic;">暂无上课记录</span>';
                    }
                    
                    const baseSalary = h.base_salary || 0;
                    const courseSalary = h.total_course_salary || 0;
                    const experienceCost = h.total_experience_cost || 0;
                    const incentive = h.incentive || 0;
                    const totalSalary = h.total_salary || 0;
                    const remark = h.remark || '';
                    const employmentType = h.employment_type || '兼职';
                    const calculationDetails = h.calculation_details || [];
                    const rowId = `teacher-hours-row-${h.teacher_id}-${h.month}-${index}`;
                    
                    // 构建计算明细HTML
                    let calculationHtml = '';
                    if (calculationDetails.length > 0) {
                        // 计算总经验
                        const totalExperienceCost = calculationDetails.reduce((sum, detail) => {
                            return sum + (detail.experience_subtotal || 0);
                        }, 0);
                        
                        // 从计算明细中计算课时工资小计（所有明细的subtotal之和）
                        const calculatedCourseSalary = calculationDetails.reduce((sum, detail) => {
                            return sum + (detail.subtotal || 0);
                        }, 0);
                        
                        calculationHtml = `
                            <div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px; font-size: 12px;">
                                <div style="font-weight: bold; margin-bottom: 8px; color: #495057;">计算明细：</div>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <thead>
                                        <tr style="background: #e9ecef;">
                                            <th style="padding: 6px; text-align: left; border-bottom: 1px solid #dee2e6;">学生-课程</th>
                                            <th style="padding: 6px; text-align: center; border-bottom: 1px solid #dee2e6;">课时</th>
                                            <th style="padding: 6px; text-align: right; border-bottom: 1px solid #dee2e6;">单价</th>
                                            <th style="padding: 6px; text-align: right; border-bottom: 1px solid #dee2e6;">小计</th>
                                            <th style="padding: 6px; text-align: right; border-bottom: 1px solid #dee2e6;">经验</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${calculationDetails.map(detail => `
                                            <tr>
                                                <td style="padding: 6px; border-bottom: 1px solid #dee2e6;">${detail.student_name}-${detail.course_name}</td>
                                                <td style="padding: 6px; text-align: center; border-bottom: 1px solid #dee2e6;">${detail.hours}</td>
                                                <td style="padding: 6px; text-align: right; border-bottom: 1px solid #dee2e6;">${detail.cost_per_class.toFixed(2)}</td>
                                                <td style="padding: 6px; text-align: right; border-bottom: 1px solid #dee2e6;">${detail.subtotal.toFixed(2)}</td>
                                                <td style="padding: 6px; text-align: right; border-bottom: 1px solid #dee2e6;">${(detail.experience_subtotal || 0).toFixed(2)}</td>
                                            </tr>
                                        `).join('')}
                                        <tr style="background: #e9ecef; font-weight: bold;">
                                            <td style="padding: 6px;" colspan="3">课时工资小计：</td>
                                            <td style="padding: 6px; text-align: right;">${calculatedCourseSalary.toFixed(2)}</td>
                                            <td style="padding: 6px; text-align: right;"></td>
                                        </tr>
                                        ${experienceCost > 0 ? `
                                        <tr style="background: #e1f5fe; font-weight: bold;">
                                            <td style="padding: 6px;" colspan="3">经验：</td>
                                            <td style="padding: 6px; text-align: right;"></td>
                                            <td style="padding: 6px; text-align: right;">${experienceCost.toFixed(2)}</td>
                                        </tr>
                                        ` : ''}
                                        ${employmentType === '全职' ? `
                                        <tr style="background: #fff3cd; font-weight: bold;">
                                            <td style="padding: 6px;" colspan="3">底薪：</td>
                                            <td style="padding: 6px; text-align: right;">${baseSalary.toFixed(2)}</td>
                                            <td style="padding: 6px; text-align: right;"></td>
                                        </tr>
                                        ` : ''}
                                        <tr style="background: #ffeaa7; font-weight: bold;">
                                            <td style="padding: 6px;" colspan="3">激励：</td>
                                            <td style="padding: 6px; text-align: right;">${incentive.toFixed(2)}</td>
                                            <td style="padding: 6px; text-align: right;"></td>
                                        </tr>
                                        <tr style="background: #d4edda; font-weight: bold;">
                                            <td style="padding: 6px;" colspan="3">总工资：</td>
                                            <td style="padding: 6px; text-align: right; color: #28a745;" colspan="2">${totalSalary.toFixed(2)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        `;
                    } else {
                        calculationHtml = '<div style="margin-top: 10px; padding: 10px; color: #999; font-style: italic;">暂无计算明细</div>';
                    }
                    
                    // 根据标签页决定是否显示底薪列
                    const currentTab = window.currentTab || 'parttime'; // 默认显示兼职
                    const baseSalaryCell = currentTab === 'fulltime' 
                        ? `<td>${baseSalary.toFixed(2)}</td>` 
                        : '';
                    
                    const detailsColspan = currentTab === 'fulltime' ? 12 : 11; // 复选框 + 其他列（不含更新时间）
                    
                    // 结算状态
                    const is_settled = h.is_settled || false;
                    const settled_at = h.settled_at || null;
                    const settledStatusHtml = is_settled 
                        ? `<div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                            <span style="color: #28a745; font-weight: bold;">已结算</span>
                            ${settled_at ? `<span style="font-size: 11px; color: #666;">${settled_at}</span>` : ''}
                            <button onclick="settleTeacherHours([${h.hours_ids.join(',')}], false, '${rowId}')" 
                                    style="padding: 2px 8px; font-size: 11px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer; margin-top: 4px;">
                                取消结算
                            </button>
                           </div>`
                        : `<button onclick="settleTeacherHours([${h.hours_ids.join(',')}], true, '${rowId}')" 
                                  style="padding: 4px 12px; font-size: 12px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer;">
                            确认结算
                           </button>`;
                    
                    return `
                    <tr id="${rowId}">
                        <td>
                            <input type="checkbox" class="teacher-hours-checkbox" value="${h.hours_ids.join(',')}" data-is-settled="${is_settled ? 'true' : 'false'}" onchange="updateBatchSettleButtons()">
                        </td>
                        <td>${h.teacher_name}</td>
                        <td>${h.month}</td>
                        <td style="min-width: 250px; max-width: 280px; word-wrap: break-word; padding: 5px; font-size: 10px;">${courseDetailsHtml}</td>
                        <td>
                            <div style="font-weight: bold; color: #1976d2; margin-bottom: 4px;">总计: ${h.total_hours_all}</div>
                            ${h.courses.map(c => `<div style="font-size: 11px; color: #666; margin: 2px 0;">${c.course_name}: ${c.total_hours}</div>`).join('')}
                        </td>
                        ${baseSalaryCell}
                        <td>${courseSalary.toFixed(2)}</td>
                        <td>${experienceCost.toFixed(2)}</td>
                        <td>
                            <input type="number" 
                                   id="${rowId}-incentive" 
                                   value="${incentive.toFixed(2)}" 
                                   step="0.01" 
                                   min="0"
                                   style="width: 80px; padding: 4px; border: 1px solid #ddd; border-radius: 3px;"
                                   onchange="updateTeacherHoursRecord(${h.id}, '${rowId}')">
                        </td>
                        <td style="font-weight: bold; color: #28a745;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span id="${rowId}-total-salary">${totalSalary.toFixed(2)}</span>
                                ${calculationDetails.length > 0 ? `
                                <button onclick="toggleCalculationDetails('${rowId}')" 
                                        style="padding: 2px 8px; font-size: 11px; background: #667eea; color: white; border: none; border-radius: 3px; cursor: pointer;">
                                    查看计算
                                </button>
                                ` : ''}
                            </div>
                        </td>
                        <td>
                            <textarea id="${rowId}-remark" 
                                      style="width: 150px; min-height: 40px; padding: 4px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px; resize: vertical;"
                                      placeholder="请输入备注"
                                      onblur="updateTeacherHoursRecord(${h.id}, '${rowId}')">${remark}</textarea>
                        </td>
                        <td style="text-align: center;">${settledStatusHtml}</td>
                    </tr>
                    ${calculationDetails.length > 0 ? `
                    <tr id="${rowId}-details-row" style="display: none;">
                        <td colspan="${detailsColspan}" style="padding: 15px; background: #f8f9fa;">
                            ${calculationHtml}
                        </td>
                    </tr>
                    ` : ''}
                `;
                }).join('');
                
                // 更新批量按钮状态
                updateBatchSettleButtons();
            }
        })
        .catch(err => {
            console.error('加载老师课时失败:', err);
            const currentTab = window.currentTab || 'parttime'; // 默认显示兼职
            const tbodyId = currentTab === 'fulltime' ? 'fulltime-teacher-hours-table-body' : 'parttime-teacher-hours-table-body';
            const tbody = document.getElementById(tbodyId);
            const colspan = currentTab === 'fulltime' ? 11 : 10; // 复选框 + 其他列（不含更新时间）
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center; color: red;">加载失败: ${err.message || '未知错误'}</td></tr>`;
            }
            // 更新批量按钮状态
            updateBatchSettleButtons();
        });
}

function toggleCalculationDetails(rowId) {
    const detailsRow = document.getElementById(rowId + '-details-row');
    const button = document.querySelector(`#${rowId} button`);
    
    if (!detailsRow || !button) return;
    
    if (detailsRow.style.display === 'none') {
        detailsRow.style.display = '';
        button.textContent = '隐藏计算';
        button.style.background = '#dc3545';
    } else {
        detailsRow.style.display = 'none';
        button.textContent = '查看计算';
        button.style.background = '#667eea';
    }
}

function settleTeacherHours(hoursIds, isSettled, rowId) {
    const action = isSettled ? '确认结算' : '取消结算';
    if (!confirm(`确定要${action}这些课时记录吗？`)) {
        return;
    }
    
    fetch('/api/teacher-hours/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            hours_ids: hoursIds,
            is_settled: isSettled
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert('操作失败：' + data.error);
        } else {
            alert(data.message);
            // 重新加载数据
            loadTeacherHours();
        }
    })
    .catch(err => {
        console.error('结算确认失败:', err);
        alert('操作失败，请重试');
    });
}

// 全选/取消全选老师课时
function toggleSelectAllTeacherHours() {
    const currentTab = window.currentTab || 'parttime';
    const selectAllCheckbox = currentTab === 'fulltime' 
        ? document.getElementById('select-all-teacher-hours')
        : document.getElementById('select-all-teacher-hours-parttime');
    
    if (!selectAllCheckbox) return;
    
    const isChecked = selectAllCheckbox.checked;
    // 只选择当前标签页的复选框
    const currentTbodyId = currentTab === 'fulltime' 
        ? 'fulltime-teacher-hours-table-body'
        : 'parttime-teacher-hours-table-body';
    const currentTbody = document.getElementById(currentTbodyId);
    
    if (currentTbody) {
        const checkboxes = currentTbody.querySelectorAll('.teacher-hours-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
        });
    }
    
    updateBatchSettleButtons();
}

// 更新批量确认按钮状态
function updateBatchSettleButtons() {
    const currentTab = window.currentTab || 'parttime';
    const currentTbodyId = currentTab === 'fulltime' 
        ? 'fulltime-teacher-hours-table-body'
        : 'parttime-teacher-hours-table-body';
    const currentTbody = document.getElementById(currentTbodyId);
    
    const checkboxes = currentTbody ? currentTbody.querySelectorAll('.teacher-hours-checkbox') : [];
    const checkedBoxes = currentTbody ? currentTbody.querySelectorAll('.teacher-hours-checkbox:checked') : [];
    
    const batchSettleBtn = document.getElementById('batch-settle-btn');
    const batchCancelSettleBtn = document.getElementById('batch-cancel-settle-btn');
    
    // 更新全选复选框状态
    const selectAllCheckbox = currentTab === 'fulltime' 
        ? document.getElementById('select-all-teacher-hours')
        : document.getElementById('select-all-teacher-hours-parttime');
    
    if (selectAllCheckbox && checkboxes.length > 0) {
        selectAllCheckbox.checked = checkedBoxes.length === checkboxes.length;
    }
    
    // 更新批量按钮状态
    if (checkedBoxes.length === 0) {
        if (batchSettleBtn) batchSettleBtn.disabled = true;
        if (batchCancelSettleBtn) batchCancelSettleBtn.disabled = true;
    } else {
        if (batchSettleBtn) batchSettleBtn.disabled = false;
        if (batchCancelSettleBtn) batchCancelSettleBtn.disabled = false;
    }
}

// 批量确认/取消结算老师课时
function batchSettleTeacherHours(isSettled) {
    const currentTab = window.currentTab || 'parttime';
    const currentTbodyId = currentTab === 'fulltime' 
        ? 'fulltime-teacher-hours-table-body'
        : 'parttime-teacher-hours-table-body';
    const currentTbody = document.getElementById(currentTbodyId);
    
    if (!currentTbody) {
        alert('无法找到表格数据');
        return;
    }
    
    const checkboxes = currentTbody.querySelectorAll('.teacher-hours-checkbox:checked');
    
    if (checkboxes.length === 0) {
        alert('请先选择要操作的记录');
        return;
    }
    
    // 收集所有选中的hours_ids
    const allHoursIds = [];
    const settledRecords = [];
    const unSettledRecords = [];
    
    checkboxes.forEach(checkbox => {
        const hoursIdsStr = checkbox.value;
        const hoursIds = hoursIdsStr.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
        allHoursIds.push(...hoursIds);
        
        const isRecordSettled = checkbox.getAttribute('data-is-settled') === 'true';
        if (isRecordSettled) {
            settledRecords.push(...hoursIds);
        } else {
            unSettledRecords.push(...hoursIds);
        }
    });
    
    // 检查操作是否合理
    if (isSettled && settledRecords.length > 0) {
        if (!confirm(`选中的记录中有 ${settledRecords.length} 条已经结算，是否继续？`)) {
            return;
        }
    }
    
    if (!isSettled && unSettledRecords.length > 0) {
        if (!confirm(`选中的记录中有 ${unSettledRecords.length} 条未结算，是否继续？`)) {
            return;
        }
    }
    
    const action = isSettled ? '确认结算' : '取消结算';
    if (!confirm(`确定要${action}选中的 ${checkboxes.length} 条记录吗？`)) {
        return;
    }
    
    // 去重
    const uniqueHoursIds = [...new Set(allHoursIds)];
    
    fetch('/api/teacher-hours/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            hours_ids: uniqueHoursIds,
            is_settled: isSettled
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert('操作失败：' + data.error);
        } else {
            alert(`批量${action}成功！共处理 ${checkboxes.length} 条记录`);
            // 清除所有复选框选中状态
            checkboxes.forEach(cb => cb.checked = false);
            const currentTab = window.currentTab || 'parttime';
            const selectAllCheckbox = currentTab === 'fulltime' 
                ? document.getElementById('select-all-teacher-hours')
                : document.getElementById('select-all-teacher-hours-parttime');
            if (selectAllCheckbox) selectAllCheckbox.checked = false;
            // 重新加载数据
            loadTeacherHours();
        }
    })
    .catch(err => {
        console.error('批量结算确认失败:', err);
        alert('操作失败，请重试');
    });
}

function updateTeacherHoursRecord(hoursId, rowId) {
    const incentiveInput = document.getElementById(rowId + '-incentive');
    const remarkTextarea = document.getElementById(rowId + '-remark');
    const totalSalarySpan = document.getElementById(rowId + '-total-salary');
    
    if (!incentiveInput || !remarkTextarea) return;
    
    const incentive = parseFloat(incentiveInput.value) || 0;
    const remark = remarkTextarea.value || '';
    
    // 获取当前的基础工资（课时工资 + 底薪 + 经验）
    // 全职列顺序：复选框(0), 姓名(1), 月份(2), 上课时间(3), 课时(4), 底薪(5), 课时费(6), 经验(7), 激励(8), 总工资(9), 备注(10), 结算状态(11)
    // 兼职列顺序：复选框(0), 姓名(1), 月份(2), 上课时间(3), 课时(4), 课时费(5), 经验(6), 激励(7), 总工资(8), 备注(9), 结算状态(10)
    const row = incentiveInput.closest('tr');
    const currentTab = window.currentTab || 'parttime'; // 默认显示兼职
    const isFulltime = currentTab === 'fulltime';
    const baseSalaryCell = isFulltime ? row.cells[5] : null; // 底薪在第5列（索引5）
    const courseSalaryCell = isFulltime ? row.cells[6] : row.cells[5]; // 课时费：全职第6列，兼职第5列
    const experienceCostCell = isFulltime ? row.cells[7] : row.cells[6]; // 经验：全职第7列，兼职第6列
    const baseSalary = isFulltime && baseSalaryCell ? parseFloat(baseSalaryCell.textContent) || 0 : 0;
    const courseSalary = parseFloat(courseSalaryCell.textContent) || 0;
    const experienceCost = parseFloat(experienceCostCell.textContent) || 0;
    const newTotalSalary = baseSalary + courseSalary + experienceCost + incentive;
    
    // 更新总工资显示
    if (totalSalarySpan) {
        totalSalarySpan.textContent = newTotalSalary.toFixed(2);
    }
    
    // 发送更新请求
    fetch(`/api/teacher-hours/${hoursId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            incentive: incentive,
            remark: remark
        })
    })
    .then(res => res.json())
    .then(data => {
        console.log('更新成功:', data);
        // 重新加载数据以确保数据同步
        loadTeacherHours();
    })
    .catch(err => {
        console.error('更新失败:', err);
        alert('更新失败：' + err.message);
        // 重新加载数据以恢复原值
        loadTeacherHours();
    });
}

// ==================== 财务统计 ====================

function loadFinance() {
    const viewMode = document.getElementById('finance-view-mode')?.value || 'month';
    let apiUrl;
    
    if (viewMode === 'year') {
        const year = document.getElementById('finance-year').value;
        if (!year) return Promise.resolve();
        apiUrl = `/api/finance?year=${year}`;
    } else {
        const month = document.getElementById('finance-month').value || currentMonth;
        apiUrl = `/api/finance?month=${month}`;
    }
    
    return fetch(apiUrl)
        .then(res => res.json())
        .then(data => {
            if (Object.keys(data).length === 0) return;
            
            // 更新标签文本
            const isYearView = viewMode === 'year';
            const periodLabel = isYearView ? '年' : '月';
            document.getElementById('revenue-label').textContent = `当${periodLabel}收入`;
            document.getElementById('profit-label').textContent = `当${periodLabel}利润`;
            document.getElementById('payment-paid-label').textContent = `当${periodLabel}缴费`;
            document.getElementById('payment-refund-label').textContent = `当${periodLabel}退费`;
            
            // 更新概览卡片
            const monthlyRevenue = data.monthly_revenue || 0;
            document.getElementById('monthly-revenue').textContent = monthlyRevenue.toFixed(2);
            document.getElementById('total-class-hours').textContent = (data.total_class_hours || 0).toFixed(2);
            // 净利润将在计算总成本后更新
            
            // 计算总成本
            const partTimeSalary = data.part_time_salary || 0;  // 兼职老师工资
            const fullTimeSalary = data.full_time_salary || 0;  // 全职老师工资
            const teacherCost = partTimeSalary + fullTimeSalary;  // 老师工资 = 兼职 + 全职
            const rentUtilities = (data.rent || 0) + (data.utilities || 0);
            const marketingCost = (data.marketing_flyer || 0) + (data.marketing_labor || 0);
            const otherCost = (data.other_paper || 0) + (data.other_toner || 0);
            const totalCost = teacherCost + rentUtilities + marketingCost + otherCost;
            document.getElementById('total-cost').textContent = totalCost.toFixed(2);
            
            // 更新成本表
            document.getElementById('part-time-salary').textContent = partTimeSalary.toFixed(2);
            document.getElementById('full-time-salary').textContent = fullTimeSalary.toFixed(2);
            document.getElementById('teacher-cost-amount').textContent = teacherCost.toFixed(2);
            
            // 年份模式下禁用成本输入框（因为年份数据是聚合的，不能直接编辑）
            const costInputs = [
                { id: 'rent', field: 'rent' },
                { id: 'utilities', field: 'utilities' },
                { id: 'marketing-flyer', field: 'marketing_flyer' },
                { id: 'marketing-labor', field: 'marketing_labor' },
                { id: 'other-paper', field: 'other_paper' },
                { id: 'other-toner', field: 'other_toner' }
            ];
            costInputs.forEach(({ id, field }) => {
                const input = document.getElementById(id);
                if (input) {
                    input.disabled = isYearView;
                    input.value = data[field] || 0;
                }
            });
            
            document.getElementById('rent-utilities-total').textContent = rentUtilities.toFixed(2);
            document.getElementById('marketing-cost-total').textContent = marketingCost.toFixed(2);
            document.getElementById('other-cost-total').textContent = otherCost.toFixed(2);
            document.getElementById('total-cost-detail').textContent = totalCost.toFixed(2);
            
            // 计算净利润 = 营业收入 - 营业成本
            const monthlyProfit = monthlyRevenue - totalCost;
            
            // 更新概览卡片中的净利润
            document.getElementById('monthly-profit').textContent = monthlyProfit.toFixed(2);
            
            // 更新利润表
            document.getElementById('revenue-amount').textContent = monthlyRevenue.toFixed(2);
            document.getElementById('cost-amount').textContent = totalCost.toFixed(2);
            document.getElementById('profit-amount').textContent = monthlyProfit.toFixed(2);
            
            // 更新收入计算模式（年份模式下隐藏选择器）
            const revenueMode = data.revenue_mode || '课耗模式';
            const revenueModeSelect = document.getElementById('revenue-mode-select');
            if (revenueModeSelect) {
                if (isYearView) {
                    revenueModeSelect.style.display = 'none';
                    document.getElementById('revenue-description').textContent = '年份汇总数据';
                } else {
                    revenueModeSelect.style.display = '';
                    revenueModeSelect.value = revenueMode;
                    updateRevenueDescription(revenueMode);
                }
            }
            
            // 更新收入明细
            updateRevenueDetail(data.revenue_detail);
            
            // 更新老师工资明细
            const detailBody = document.getElementById('teacher-cost-detail-body');
            detailBody.innerHTML = '';
            
            // 计算总计
            let totalBaseSalary = 0;
            let totalCourseCost = 0;
            let totalExperienceCost = 0;
            let totalIncentive = 0;
            let totalSalary = 0;
            
            if (data.teacher_cost_detail && data.teacher_cost_detail.length > 0) {
                data.teacher_cost_detail.forEach(item => {
                    totalBaseSalary += item.base_salary || 0;
                    totalCourseCost += item.course_cost || 0;
                    totalExperienceCost += item.experience_cost || 0;
                    totalIncentive += item.incentive || 0;
                    totalSalary += item.total || 0;
                    
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${item.teacher_name}</td>
                        <td class="amount">${item.base_salary.toFixed(2)}</td>
                        <td class="amount">${item.course_cost.toFixed(2)}</td>
                        <td class="amount">${(item.experience_cost || 0).toFixed(2)}</td>
                        <td class="amount">${item.incentive.toFixed(2)}</td>
                        <td class="amount"><strong>${item.total.toFixed(2)}</strong></td>
                    `;
                    detailBody.appendChild(row);
                });
            } else {
                // 如果没有数据，显示提示
                const row = document.createElement('tr');
                row.innerHTML = '<td colspan="6" style="text-align: center; color: #999; padding: 20px;">暂无数据</td>';
                detailBody.appendChild(row);
            }
            
            // 更新总计行
            document.getElementById('total-base-salary').textContent = totalBaseSalary.toFixed(2);
            document.getElementById('total-course-cost').textContent = totalCourseCost.toFixed(2);
            document.getElementById('total-experience-cost').textContent = totalExperienceCost.toFixed(2);
            document.getElementById('total-incentive').textContent = totalIncentive.toFixed(2);
            document.getElementById('total-salary').textContent = totalSalary.toFixed(2);
            
            // 更新缴费情况
            if (data.payment_detail) {
                document.getElementById('payment-count-paid').textContent = data.payment_detail.count_paid || 0;
                document.getElementById('payment-amount-paid').textContent = (data.payment_detail.total_paid || 0).toFixed(2) + ' 元';
                document.getElementById('payment-count-refund').textContent = data.payment_detail.count_refund || 0;
                document.getElementById('payment-amount-refund').textContent = (data.payment_detail.total_refund || 0).toFixed(2) + ' 元';
            }
            
            return data;
        })
        .catch(err => {
            console.error('加载财务数据失败:', err);
            throw err;
        });
}

function updateFinanceCosts() {
    const viewMode = document.getElementById('finance-view-mode')?.value || 'month';
    if (viewMode === 'year') {
        alert('年份数据是聚合数据，不能直接编辑。请切换到月份视图进行编辑。');
        return;
    }
    const month = document.getElementById('finance-month').value || currentMonth;
    const revenueModeSelect = document.getElementById('revenue-mode-select');
    const revenueMode = revenueModeSelect ? revenueModeSelect.value : '课耗模式';
    
    const data = {
        month: month,
        marketing_flyer: parseFloat(document.getElementById('marketing-flyer').value) || 0,
        marketing_labor: parseFloat(document.getElementById('marketing-labor').value) || 0,
        rent: parseFloat(document.getElementById('rent').value) || 0,
        utilities: parseFloat(document.getElementById('utilities').value) || 0,
        other_paper: parseFloat(document.getElementById('other-paper').value) || 0,
        other_toner: parseFloat(document.getElementById('other-toner').value) || 0,
        revenue_mode: revenueMode
    };
    
    fetch('/api/finance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        // 重新加载财务数据以更新所有显示
        loadFinance();
    })
    .catch(err => {
        console.error('更新财务数据失败:', err);
        alert('更新失败，请重试');
    });
}

function updateRevenueMode() {
    const viewMode = document.getElementById('finance-view-mode')?.value || 'month';
    if (viewMode === 'year') {
        alert('年份数据不支持修改收入计算模式。请切换到月份视图进行修改。');
        return;
    }
    
    const revenueModeSelect = document.getElementById('revenue-mode-select');
    if (!revenueModeSelect) return;
    
    const revenueMode = revenueModeSelect.value;
    updateRevenueDescription(revenueMode);
    
    // 保存明细展开状态
    const detailRow = document.getElementById('revenue-detail-row');
    const isDetailExpanded = detailRow && detailRow.style.display !== 'none';
    
    // 只更新收入计算模式，不更新成本数据
    const month = document.getElementById('finance-month').value || currentMonth;
    const data = {
        month: month,
        revenue_mode: revenueMode,
        // 保持现有的成本数据不变
        marketing_flyer: parseFloat(document.getElementById('marketing-flyer')?.value) || 0,
        marketing_labor: parseFloat(document.getElementById('marketing-labor')?.value) || 0,
        rent: parseFloat(document.getElementById('rent')?.value) || 0,
        utilities: parseFloat(document.getElementById('utilities')?.value) || 0,
        other_paper: parseFloat(document.getElementById('other-paper')?.value) || 0,
        other_toner: parseFloat(document.getElementById('other-toner')?.value) || 0
    };
    
    fetch('/api/finance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        // 重新加载财务数据以更新所有显示
        loadFinance().then(() => {
            // 恢复明细展开状态
            if (isDetailExpanded && detailRow) {
                detailRow.style.display = '';
                const toggleBtn = document.getElementById('revenue-detail-toggle');
                if (toggleBtn) {
                    toggleBtn.textContent = '隐藏明细';
                }
            }
        });
    })
    .catch(err => {
        console.error('更新收入计算模式失败:', err);
        alert('更新失败，请重试');
    });
}

function updateRevenueDescription(mode) {
    const descriptionElement = document.getElementById('revenue-description');
    if (descriptionElement) {
        if (mode === '缴费模式') {
            descriptionElement.textContent = '当月缴费 - 当月退费';
        } else {
            descriptionElement.textContent = '当月课耗 × 学生单价';
        }
    }
}

function updateRevenueDetail(revenueDetail) {
    const detailContent = document.getElementById('revenue-detail-content');
    if (!detailContent || !revenueDetail) return;
    
    let html = '';
    
    if (revenueDetail.mode === '缴费模式') {
        // 缴费模式：显示缴费和退费明细
        html += '<div class="revenue-detail-section">';
        html += '<h4>缴费明细</h4>';
        if (revenueDetail.paid_list && revenueDetail.paid_list.length > 0) {
            html += '<table class="revenue-detail-table">';
            html += '<thead><tr><th>日期</th><th>学生姓名</th><th>金额（元）</th><th>备注</th></tr></thead>';
            html += '<tbody>';
            revenueDetail.paid_list.forEach(item => {
                html += `<tr>
                    <td>${item.date}</td>
                    <td>${item.student_name}</td>
                    <td class="amount">${item.amount.toFixed(2)}</td>
                    <td>${item.remark || ''}</td>
                </tr>`;
            });
            html += `<tr class="total-row">
                <td colspan="2"><strong>缴费小计</strong></td>
                <td class="amount"><strong>${revenueDetail.total_paid.toFixed(2)}</strong></td>
                <td></td>
            </tr>`;
            html += '</tbody></table>';
        } else {
            html += '<p style="color: #999; margin: 10px 0;">暂无缴费记录</p>';
        }
        html += '</div>';
        
        html += '<div class="revenue-detail-section">';
        html += '<h4>退费明细</h4>';
        if (revenueDetail.refund_list && revenueDetail.refund_list.length > 0) {
            html += '<table class="revenue-detail-table">';
            html += '<thead><tr><th>日期</th><th>学生姓名</th><th>金额（元）</th><th>备注</th></tr></thead>';
            html += '<tbody>';
            revenueDetail.refund_list.forEach(item => {
                html += `<tr>
                    <td>${item.date}</td>
                    <td>${item.student_name}</td>
                    <td class="amount">${item.amount.toFixed(2)}</td>
                    <td>${item.remark || ''}</td>
                </tr>`;
            });
            html += `<tr class="total-row">
                <td colspan="2"><strong>退费小计</strong></td>
                <td class="amount"><strong>${revenueDetail.total_refund.toFixed(2)}</strong></td>
                <td></td>
            </tr>`;
            html += '</tbody></table>';
        } else {
            html += '<p style="color: #999; margin: 10px 0;">暂无退费记录</p>';
        }
        html += '</div>';
        
        html += '<div class="revenue-detail-section">';
        html += `<p style="font-size: 14px; font-weight: bold; margin: 10px 0;">营业收入 = ${revenueDetail.total_paid.toFixed(2)} - ${revenueDetail.total_refund.toFixed(2)} = ${revenueDetail.total_revenue.toFixed(2)} 元</p>`;
        html += '</div>';
    } else if (revenueDetail.mode === '年份汇总') {
        // 年份汇总模式：只显示总收入
        html += '<div class="revenue-detail-section">';
        html += '<h4>年份汇总</h4>';
        html += `<p style="font-size: 14px; font-weight: bold; margin: 10px 0;">年度总收入：${revenueDetail.total_revenue.toFixed(2)} 元</p>`;
        html += '<p style="color: #999; margin: 10px 0;">年份数据为全年各月份数据的汇总，详细明细请切换到月份视图查看。</p>';
        html += '</div>';
    } else {
        // 课耗模式：显示学生课耗明细
        html += '<div class="revenue-detail-section">';
        html += '<h4>学生课耗明细</h4>';
        if (revenueDetail.student_list && revenueDetail.student_list.length > 0) {
            html += '<table class="revenue-detail-table">';
            html += '<thead><tr><th>学生姓名</th><th>当月课耗（课时）</th><th>实际单价（元/课时）</th><th>收入（元）</th><th>操作</th></tr></thead>';
            html += '<tbody>';
            revenueDetail.student_list.forEach((item, index) => {
                html += `<tr>
                    <td>${item.student_name}</td>
                    <td class="amount">${item.actual_hours.toFixed(2)}</td>
                    <td class="amount">${item.unit_price.toFixed(2)}</td>
                    <td class="amount">${item.revenue.toFixed(2)}</td>
                    <td>${item.price_detail && item.price_detail.length > 0 ? `<button onclick="toggleStudentPriceDetail(${index})" style="padding: 2px 8px; font-size: 11px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer;">查看明细</button>` : ''}</td>
                </tr>`;
                // 添加单价明细行（默认隐藏）
                if (item.price_detail && item.price_detail.length > 0) {
                    html += `<tr id="student-price-detail-${index}" style="display: none;">
                        <td colspan="5" style="padding: 10px; background: #f8f9fa;">
                            <div style="margin-left: 20px;">
                                <strong>单价明细：</strong>
                                <table style="width: 100%; margin-top: 8px; border-collapse: collapse;">
                                    <thead>
                                        <tr style="background: #e9ecef;">
                                            <th style="padding: 6px; text-align: left; border: 1px solid #dee2e6; font-size: 12px;">缴费日期</th>
                                            <th style="padding: 6px; text-align: right; border: 1px solid #dee2e6; font-size: 12px;">消耗课时</th>
                                            <th style="padding: 6px; text-align: right; border: 1px solid #dee2e6; font-size: 12px;">单价（元/课时）</th>
                                            <th style="padding: 6px; text-align: right; border: 1px solid #dee2e6; font-size: 12px;">收入（元）</th>
                                        </tr>
                                    </thead>
                                    <tbody>`;
                    item.price_detail.forEach(detail => {
                        html += `<tr>
                            <td style="padding: 6px; border: 1px solid #dee2e6; font-size: 12px;">${detail.payment_date}</td>
                            <td style="padding: 6px; text-align: right; border: 1px solid #dee2e6; font-size: 12px;">${detail.hours.toFixed(2)}</td>
                            <td style="padding: 6px; text-align: right; border: 1px solid #dee2e6; font-size: 12px;">${detail.unit_price.toFixed(2)}</td>
                            <td style="padding: 6px; text-align: right; border: 1px solid #dee2e6; font-size: 12px;">${detail.revenue.toFixed(2)}</td>
                        </tr>`;
                    });
                    html += `</tbody></table>
                            </div>
                        </td>
                    </tr>`;
                }
            });
            html += `<tr class="total-row">
                <td><strong>合计</strong></td>
                <td class="amount"></td>
                <td class="amount"></td>
                <td class="amount"><strong>${revenueDetail.total_revenue.toFixed(2)}</strong></td>
                <td></td>
            </tr>`;
            html += '</tbody></table>';
        } else {
            html += '<p style="color: #999; margin: 10px 0;">暂无学生课耗记录</p>';
        }
        html += '</div>';
    }
    
    detailContent.innerHTML = html;
}

function toggleRevenueDetail() {
    const detailRow = document.getElementById('revenue-detail-row');
    const toggleBtn = document.getElementById('revenue-detail-toggle');
    
    if (detailRow.style.display === 'none') {
        detailRow.style.display = '';
        toggleBtn.textContent = '隐藏明细';
    } else {
        detailRow.style.display = 'none';
        toggleBtn.textContent = '查看明细';
    }
}

function toggleStudentPriceDetail(index) {
    const detailRow = document.getElementById(`student-price-detail-${index}`);
    if (!detailRow) return;
    
    const buttons = document.querySelectorAll(`button[onclick="toggleStudentPriceDetail(${index})"]`);
    const button = buttons.length > 0 ? buttons[0] : null;
    
    if (detailRow.style.display === 'none') {
        detailRow.style.display = '';
        if (button) button.textContent = '隐藏明细';
    } else {
        detailRow.style.display = 'none';
        if (button) button.textContent = '查看明细';
    }
}

// ==================== 通用函数 ====================

function showModal(content) {
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal').classList.add('show');
    
    // 重新绑定表单提交事件（确保动态插入的表单能正常工作）
    const form = document.getElementById('teacher-form');
    if (form) {
        form.onsubmit = function(e) {
            const formId = form.getAttribute('data-teacher-id');
            if (formId) {
                saveTeacher(e, parseInt(formId));
            } else {
                saveTeacher(e);
            }
        };
    }
}

function closeModal() {
    document.getElementById('modal').classList.remove('show');
}

// 点击模态框外部关闭
document.getElementById('modal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        closeModal();
    }
});

