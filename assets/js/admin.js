// assets/js/admin.js - A/N Chat Admin Portal Controller

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTabs();
    loadStats();
    loadUsers();
    loadFriendships();
    loadScreenshotLogs();
    initFeatureToggle();
    initWebSocket();
});

function initTheme() {
    const savedTheme = localStorage.getItem('an_chat_theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
        const icon = document.querySelector('#btnAdminToggleTheme i');
        if (icon) icon.className = 'fas fa-sun';
    }

    const btn = document.getElementById('btnAdminToggleTheme');
    if (btn) {
        btn.addEventListener('click', () => {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('an_chat_theme', isDark ? 'dark' : 'light');
            const icon = btn.querySelector('i');
            if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        });
    }
}

function initTabs() {
    const btns = document.querySelectorAll('.admin-tab-btn');
    btns.forEach(b => {
        b.addEventListener('click', () => {
            btns.forEach(x => x.classList.remove('active'));
            document.querySelectorAll('.admin-tab-pane').forEach(p => p.classList.remove('active'));

            b.classList.add('active');
            const targetId = b.getAttribute('data-tab');
            const pane = document.getElementById(targetId);
            if (pane) pane.classList.add('active');
        });
    });
}

let wsClient = null;
function initWebSocket() {
    try {
        const wsHost = window.location.hostname || 'localhost';
        wsClient = new WebSocket(`ws://${wsHost}:8085`);
        wsClient.onopen = () => {
            if (window.CURRENT_USER) {
                wsClient.send(JSON.stringify({ type: 'auth', user_id: window.CURRENT_USER.id }));
            }
        };
        wsClient.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'system_setting_updated') {
                    if (data.key === 'screenshot_detection') {
                        updateFeatureToggleUI(data.value === '1');
                    }
                } else if (data.type === 'screenshot_alert') {
                    showAdminToast(`🚨 Live Alert: ${data.notice}`, 'warning');
                    loadScreenshotLogs();
                    loadStats();
                }
            } catch (e) {}
        };
    } catch (e) {
        console.warn('Admin WebSocket connection error', e);
    }
}

async function loadStats() {
    try {
        const res = await fetch('api/admin/stats.php');
        const data = await res.json();
        if (data.success && data.data) {
            const s = data.data;
            document.getElementById('statTotalUsers').textContent = s.total_users || 0;
            document.getElementById('statOnlineUsers').textContent = s.online_users || 0;
            document.getElementById('statFriendships').textContent = s.total_friendships || 0;
            document.getElementById('statMessages').textContent = s.total_messages || 0;
            document.getElementById('statCalls').textContent = s.total_calls || 0;
            document.getElementById('statScreenshots').textContent = s.total_screenshots || 0;

            updateFeatureToggleUI(s.screenshot_detection);
        }
    } catch (e) {
        console.error('Failed to load stats', e);
    }
}

function updateFeatureToggleUI(isEnabled) {
    const toggle = document.getElementById('screenshotToggleInput');
    const pill = document.getElementById('featureStatusPill');
    const cardStatus = document.getElementById('featureStatusBadge');

    if (toggle) toggle.checked = isEnabled;
    if (pill) {
        pill.className = `feature-status-pill ${isEnabled ? 'active' : 'disabled'}`;
        pill.textContent = isEnabled ? 'Active (ON)' : 'Disabled (OFF)';
    }
    if (cardStatus) {
        cardStatus.className = `role-badge ${isEnabled ? 'admin' : 'user'}`;
        cardStatus.innerHTML = isEnabled ? '<i class="fas fa-shield-alt"></i> Active' : '<i class="fas fa-ban"></i> Disabled';
    }
}

function initFeatureToggle() {
    const toggle = document.getElementById('screenshotToggleInput');
    if (!toggle) return;

    toggle.addEventListener('change', async () => {
        const isChecked = toggle.checked;
        try {
            const res = await fetch('api/admin/toggle-feature.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    feature: 'screenshot_detection',
                    enabled: isChecked ? 1 : 0
                })
            });
            const data = await res.json();
            if (data.success) {
                showAdminToast(data.message, 'success');
                updateFeatureToggleUI(isChecked);

                // Broadcast change over WebSocket to all active chat clients
                if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                    wsClient.send(JSON.stringify({
                        type: 'admin_setting_update',
                        key: 'screenshot_detection',
                        value: isChecked ? '1' : '0'
                    }));
                }
            } else {
                showAdminToast(data.message || 'Error updating feature', 'error');
                toggle.checked = !isChecked;
            }
        } catch (e) {
            showAdminToast('Network error updating feature', 'error');
            toggle.checked = !isChecked;
        }
    });
}

// 1. Users Directory
async function loadUsers(search = '') {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;"><div class="spinner"></div></td></tr>`;

    try {
        const res = await fetch(`api/admin/users.php?q=${encodeURIComponent(search)}`);
        const data = await res.json();

        if (!data.success || !data.data || data.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-secondary);">No users found.</td></tr>`;
            return;
        }

        let html = '';
        data.data.forEach(u => {
            const isOnline = u.status === 'online';
            const isAdmin = parseInt(u.is_admin) === 1;
            const isSelf = window.CURRENT_USER && parseInt(window.CURRENT_USER.id) === parseInt(u.id);

            html += `
                <tr>
                    <td><strong>#${u.id}</strong></td>
                    <td>
                        <div class="user-cell">
                            <img src="${u.profile_image}" alt="${escapeHtml(u.fullname)}" class="user-cell-avatar" onerror="this.src='assets/images/default-avatar.png'">
                            <div class="user-cell-info">
                                <span class="user-cell-name">${escapeHtml(u.fullname)}</span>
                                <span class="user-cell-sub">${escapeHtml(u.bio || '')}</span>
                            </div>
                        </div>
                    </td>
                    <td><i class="fas fa-phone-alt" style="font-size:11px;color:var(--primary);margin-right:4px;"></i>${escapeHtml(u.phone)}</td>
                    <td>
                        <span class="status-indicator ${isOnline ? 'online' : 'offline'}">
                            <i class="fas fa-circle" style="font-size:8px;"></i> ${isOnline ? 'Online' : 'Offline'}
                        </span>
                    </td>
                    <td><strong>${u.friend_count || 0}</strong> friends</td>
                    <td>${u.message_count || 0} msgs</td>
                    <td>
                        <span class="role-badge ${isAdmin ? 'admin' : 'user'}">
                            <i class="fas ${isAdmin ? 'fa-shield-alt' : 'fa-user'}"></i> ${isAdmin ? 'Admin' : 'Member'}
                        </span>
                    </td>
                    <td>
                        ${isSelf ? '<span style="font-size:11px;color:var(--text-muted);">Current Admin</span>' : `
                            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                                <button class="btn btn-outline btn-sm" onclick="toggleAdminRole(${u.id}, ${isAdmin ? 0 : 1})">
                                    ${isAdmin ? '<i class="fas fa-user-minus"></i> Remove Admin' : '<i class="fas fa-user-shield"></i> Make Admin'}
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="deleteAdminUser(${u.id}, ${isAdmin ? 'true' : 'false'})">
                                    <i class="fas fa-trash-alt"></i> Delete
                                </button>
                            </div>
                        `}
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--danger);">Error loading users list.</td></tr>`;
    }
}

async function deleteAdminUser(userId, isAdmin) {
    const extra = isAdmin ? '\nAkoonkani waa admin; tirtiristiisu waxay ka saari doontaa xogtiisa app-ka.' : '\nTirtiristu waa joogto, waxayna ka saari doontaa fariimaha, calls-ka iyo xiriirrada user-kan.';
    if (!confirm(`Ma hubtaa inaad si joogto ah u tirtirayso user #${userId}?${extra}`)) return;

    try {
        const res = await fetch('api/admin/delete-user.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': window.ADMIN_CSRF_TOKEN || ''
            },
            body: JSON.stringify({ user_id: userId })
        });
        const data = await res.json();
        showAdminToast(data.message || (data.success ? 'User deleted.' : 'User could not be deleted.'), data.success ? 'success' : 'error');
        if (data.success) {
            loadUsers(document.getElementById('adminSearchUsers')?.value || '');
            loadStats();
        }
    } catch (e) {
        showAdminToast('Network error deleting user.', 'error');
    }
}

async function toggleAdminRole(userId, newStatus) {
    const actionText = newStatus ? 'promote this user to Admin' : 'remove Admin privileges from this user';
    if (!confirm(`Are you sure you want to ${actionText}?`)) return;

    try {
        const res = await fetch('api/admin/toggle-admin.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, is_admin: newStatus })
        });
        const data = await res.json();
        showAdminToast(data.message, data.success ? 'success' : 'error');
        if (data.success) {
            loadUsers(document.getElementById('adminSearchUsers')?.value || '');
            loadStats();
        }
    } catch (e) {
        showAdminToast('Network error updating role', 'error');
    }
}

// 2. Friendships & Connections Network
async function loadFriendships(search = '') {
    const tbody = document.getElementById('friendshipsTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;"><div class="spinner"></div></td></tr>`;

    try {
        const res = await fetch(`api/admin/friendships.php?q=${encodeURIComponent(search)}`);
        const data = await res.json();

        if (!data.success || !data.data || data.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-secondary);">No friendships found.</td></tr>`;
            return;
        }

        let html = '';
        data.data.forEach(f => {
            html += `
                <tr>
                    <td><strong>#${f.id}</strong></td>
                    <td>
                        <div class="connection-pair">
                            <div class="user-cell">
                                <img src="${f.user1_avatar}" alt="${escapeHtml(f.user1_name)}" class="user-cell-avatar" onerror="this.src='assets/images/default-avatar.png'">
                                <div class="user-cell-info">
                                    <span class="user-cell-name">${escapeHtml(f.user1_name)}</span>
                                    <span class="user-cell-sub">${escapeHtml(f.user1_phone)}</span>
                                </div>
                            </div>
                            <span class="connection-arrow"><i class="fas fa-arrows-alt-h"></i></span>
                            <div class="user-cell">
                                <img src="${f.user2_avatar}" alt="${escapeHtml(f.user2_name)}" class="user-cell-avatar" onerror="this.src='assets/images/default-avatar.png'">
                                <div class="user-cell-info">
                                    <span class="user-cell-name">${escapeHtml(f.user2_name)}</span>
                                    <span class="user-cell-sub">${escapeHtml(f.user2_phone)}</span>
                                </div>
                            </div>
                        </div>
                    </td>
                    <td><strong>${f.shared_messages || 0}</strong> messages</td>
                    <td><span class="status-indicator online"><i class="fas fa-check-circle"></i> Connected</span></td>
                    <td style="color:var(--text-secondary);font-size:12px;">${formatAdminDate(f.created_at)}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--danger);">Error loading friendships.</td></tr>`;
    }
}

// 3. Screenshot & Recording Logs
async function loadScreenshotLogs() {
    const tbody = document.getElementById('screenshotLogsTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;"><div class="spinner"></div></td></tr>`;

    try {
        const res = await fetch('api/admin/screenshot-logs.php');
        const data = await res.json();

        if (!data.success || !data.data || data.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-secondary);">No screenshot detection events recorded yet.</td></tr>`;
            return;
        }

        let html = '';
        data.data.forEach(log => {
            const isRec = log.action_type === 'screen_recording';
            html += `
                <tr>
                    <td><strong>#${log.id}</strong></td>
                    <td>
                        <span class="role-badge ${isRec ? 'admin' : 'user'}">
                            <i class="fas ${isRec ? 'fa-video' : 'fa-camera'}"></i> ${isRec ? 'Screen Recording' : 'Screenshot'}
                        </span>
                    </td>
                    <td>
                        <div class="user-cell">
                            <img src="${log.user_avatar}" alt="${escapeHtml(log.user_name)}" class="user-cell-avatar" onerror="this.src='assets/images/default-avatar.png'">
                            <div class="user-cell-info">
                                <span class="user-cell-name">${escapeHtml(log.user_name)}</span>
                                <span class="user-cell-sub">${escapeHtml(log.user_phone)}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="user-cell">
                            <img src="${log.target_avatar}" alt="${escapeHtml(log.target_name)}" class="user-cell-avatar" onerror="this.src='assets/images/default-avatar.png'">
                            <div class="user-cell-info">
                                <span class="user-cell-name">${escapeHtml(log.target_name)}</span>
                                <span class="user-cell-sub">${escapeHtml(log.target_phone)}</span>
                            </div>
                        </div>
                    </td>
                    <td style="color:var(--text-secondary);font-size:12.5px;">${formatAdminDate(log.created_at)}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--danger);">Error loading screenshot logs.</td></tr>`;
    }
}

// Search Inputs Debounce
const searchUsersInput = document.getElementById('adminSearchUsers');
if (searchUsersInput) {
    let t = null;
    searchUsersInput.addEventListener('input', (e) => {
        clearTimeout(t);
        t = setTimeout(() => loadUsers(e.target.value.trim()), 300);
    });
}

const searchFriendsInput = document.getElementById('adminSearchFriends');
if (searchFriendsInput) {
    let t = null;
    searchFriendsInput.addEventListener('input', (e) => {
        clearTimeout(t);
        t = setTimeout(() => loadFriendships(e.target.value.trim()), 300);
    });
}

function showAdminToast(msg, type = 'info') {
    const c = document.getElementById('adminToastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 3500);
}

function formatAdminDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
