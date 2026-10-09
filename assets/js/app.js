// assets/js/app.js - Master Dashboard Application Controller

// Global Safe Utilities
if (typeof window.escapeHtml !== 'function') {
    window.escapeHtml = function(text) {
        if (text === null || text === undefined) return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    };
}
const escapeHtml = window.escapeHtml;

if (typeof window.formatDate !== 'function') {
    window.formatDate = function(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(String(dateStr).replace(' ', 'T'));
            if (isNaN(d.getTime())) return '';
            return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    };
}
const formatDate = window.formatDate;

if (typeof window.formatTime !== 'function') {
    window.formatTime = function(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(String(dateStr).replace(' ', 'T'));
            if (isNaN(d.getTime())) return '';
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    };
}
const formatTime = window.formatTime;

if (typeof window.resolveAvatarUrl !== 'function') {
    window.resolveAvatarUrl = function(img) {
        if (!img || img === 'null' || img === 'undefined' || (typeof img === 'string' && img.trim() === '')) {
            return 'assets/images/default-avatar.png';
        }
        if (typeof img !== 'string') return 'assets/images/default-avatar.png';
        img = img.trim();
        if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:') || img.startsWith('blob:')) {
            return img;
        }
        if (img.startsWith('assets/')) {
            return img;
        }
        if (img.startsWith('uploads/')) {
            return img;
        }
        return 'uploads/images/' + img;
    };
    window.resolveAvatar = window.resolveAvatarUrl;
}

class WebSocketClient {
    constructor(url, userId) {
        this.url = url;
        this.userId = userId;
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.connect();
    }

    connect() {
        try {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('[WebSocket] Connected to real-time server at', this.url);
                this.isConnected = true;
                this.reconnectAttempts = 0;

                // Send Auth Frame
                this.send({
                    type: 'auth',
                    user_id: this.userId
                });
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error('[WebSocket] Message parse error', e);
                }
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                console.log('[WebSocket] Connection closed. Retrying in 3s...');
                setTimeout(() => this.connect(), 3000);
            };

            this.ws.onerror = (err) => {
                console.warn('[WebSocket] Error occurred', err);
                this.ws.close();
            };
        } catch (err) {
            console.error('[WebSocket] Failed to initialize socket', err);
        }
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('[WebSocket] Cannot send, socket not open', data);
        }
    }

    handleMessage(data) {
        console.log('[WebSocket Event]', data.type, data);

        switch (data.type) {
            case 'new_message':
                if (window.chatManager) {
                    const msg = data.message;
                    // If chat is open with sender
                    if (window.chatManager.activeFriend && parseInt(window.chatManager.activeFriend.id) === parseInt(msg.sender_id)) {
                        window.chatManager.appendMessage(msg, true);
                        window.chatManager.playMessagePing();
                        // Mark read immediately
                        this.send({ type: 'message_read', sender_id: msg.sender_id });
                    } else {
                        // Play alert
                        window.chatManager.playMessagePing();
                        showToast(`New message from ${msg.sender_name || 'Friend'}`, 'info');
                    }
                    // Trigger immediate auto-sync heartbeat so conversation list and badges update in 0ms
                    if (typeof runAutoSyncHeartbeat === 'function') {
                        runAutoSyncHeartbeat();
                    }
                }
                break;

            case 'typing':
                if (window.chatManager && window.chatManager.activeFriend && parseInt(window.chatManager.activeFriend.id) === parseInt(data.sender_id)) {
                    const statusEl = document.getElementById('chatHeaderStatus');
                    if (statusEl) {
                        if (data.is_typing) {
                            statusEl.className = 'chat-header-status typing';
                            statusEl.innerHTML = '<i class="fas fa-pencil-alt"></i> typing...';
                        } else {
                            const st = window.chatManager.activeFriend.status;
                            statusEl.className = `chat-header-status ${st}`;
                            statusEl.innerHTML = `<i class="fas fa-circle" style="font-size:8px;"></i> ${st === 'online' ? 'Online' : 'Offline'}`;
                        }
                    }
                }
                break;

            case 'messages_read':
                // Update ticks to pink read ticks
                document.querySelectorAll('.message-row.mine .bubble-ticks').forEach(el => {
                    el.textContent = '✓✓';
                    el.classList.add('read');
                });
                break;

            case 'reaction':
                if (window.chatManager) {
                    window.chatManager.updateMessageReactions(data.message_id, data.reactions);
                }
                break;

            case 'screenshot_alert':
                const alertNotice = data.notice || `⚠️ ${data.sender_name || 'User'} took a screenshot of this conversation.`;
                showToast(`🚨 ${data.sender_name || 'User'} took a screenshot of your chat!`, 'warning');

                if (window.chatManager) {
                    window.chatManager.playMessagePing();
                    if (window.chatManager.activeFriend && parseInt(window.chatManager.activeFriend.id) === parseInt(data.sender_id)) {
                        window.chatManager.appendMessage({
                            message_type: 'system',
                            message: alertNotice,
                            created_at: new Date().toISOString()
                        }, true);
                    }
                }
                break;

            case 'system_setting_updated':
                if (data.key && window.SYSTEM_SETTINGS) {
                    window.SYSTEM_SETTINGS[data.key] = data.value;
                    console.log(`[System Setting Updated] ${data.key} = ${data.value}`);
                }
                break;

            case 'call_offer':
                // Incoming voice or video call
                if (window.callController) {
                    window.callController.showIncomingCall(data);
                }
                // Acknowledge to caller that this device received the call and is ringing
                if (data.from_user_id) {
                    this.send({
                        type: 'call_status',
                        target_user_id: data.from_user_id,
                        status: 'ringing'
                    });
                }
                break;

            case 'call_answer':
                if (window.webrtc) {
                    window.webrtc.handleIncomingAnswer(data);
                    if (window.callController) {
                        window.callController.showActiveCallScreen(window.webrtc.callType);
                        // Start the call timer ONLY after recipient answers and conversation begins
                        window.callController.startCallTimer();
                    }
                }
                break;

            case 'call_ice':
                if (window.webrtc) {
                    window.webrtc.handleIncomingIce(data);
                }
                break;

            case 'call_status':
                if (data.status === 'ringing') {
                    if (window.callController) {
                        window.callController.setStatusRinging();
                    }
                } else if (data.status === 'offline') {
                    if (window.callController) {
                        window.callController.setStatusOffline();
                    }
                } else if (data.status === 'declined' || data.status === 'ended') {
                    if (window.callController) {
                        window.callController.hideCallOverlay();
                        window.callController.playCallEndTone();
                        showToast(`Call ${data.status}`, 'info');
                    }
                    if (window.webrtc) {
                        window.webrtc.cleanup();
                    }
                }
                break;

            case 'user_status':
                // Update dot in chat list or active chat
                updateUserStatusInUI(data.user_id, data.status, data.last_seen);
                break;

            case 'friend_request':
                showToast(`${data.sender_name || 'Someone'} sent you a friend request!`, 'info');
                if (window.NotificationManager) {
                    NotificationManager.loadList(document.getElementById('notificationsListContainer'));
                }
                break;
        }
    }
}

// Global navigation and action functions
function setAppTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        localStorage.setItem('an_chat_theme', 'dark');
        const icon = document.querySelector('#btnToggleTheme i');
        if (icon) icon.className = 'fas fa-sun';
    } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('an_chat_theme', 'light');
        const icon = document.querySelector('#btnToggleTheme i');
        if (icon) icon.className = 'fas fa-moon';
    }
}
window.setAppTheme = setAppTheme;

function toggleAppTheme() {
    const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    setAppTheme(next);
    fetch('api/users/settings.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next })
    }).catch(() => {});
}
window.toggleAppTheme = toggleAppTheme;
window._toggleThemeImpl = toggleAppTheme;

function switchTab(tab) {
    if (!tab) return;

    // On mobile, switching tabs exits any open chat view so the user sees the clicked tab
    const appContainer = document.querySelector('.app-container');
    if (appContainer && appContainer.classList.contains('chat-open')) {
        appContainer.classList.remove('chat-open');
    }

    // Update active states on both desktop and mobile
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => {
        if (el.getAttribute('data-tab') === tab) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    const middleTitle = document.getElementById('middlePanelTitle');
    const searchInput = document.getElementById('middleSearchInput');
    const listContainer = document.getElementById('middleListContainer');
    if (searchInput) searchInput.value = '';

    switch (tab) {
        case 'chats':
            if (middleTitle) middleTitle.textContent = 'Chats';
            if (searchInput) searchInput.placeholder = 'Search chats or phone...';
            loadChatsList();
            break;
        case 'friends':
            if (middleTitle) middleTitle.textContent = 'Friends';
            if (searchInput) searchInput.placeholder = 'Search by phone number...';
            loadFriendsList();
            break;
        case 'calls':
            if (middleTitle) middleTitle.textContent = 'Calls';
            if (searchInput) searchInput.placeholder = 'Search call history...';
            loadCallsList();
            break;
        case 'notifications':
            if (middleTitle) middleTitle.textContent = 'Notifications';
            if (searchInput) searchInput.placeholder = 'Search notifications...';
            if (window.NotificationManager) {
                NotificationManager.loadList(listContainer);
            }
            break;
        case 'profile':
            openProfileModal();
            break;
        case 'settings':
            openSettingsModal();
            break;
    }
}
window.switchTab = switchTab;
window._switchTabImpl = switchTab;

function setupTabNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-tab], .bottom-nav-item[data-tab]');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const tab = item.getAttribute('data-tab');
            if (tab) switchTab(tab);
        });
    });
}

async function loadChatsList(filterQuery = '') {
    const container = document.getElementById('middleListContainer');
    if (!container) return;

    // Only show spinner if container has no items and no empty state
    const hasExistingContent = container.querySelector('.list-item, .empty-state');
    if (!hasExistingContent) {
        container.innerHTML = `<div style="display:flex;justify-content:center;padding:30px;"><div class="spinner"></div></div>`;
    }

    try {
        let data = null;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 7000);
            const res = await fetch('api/friends/list.php', { signal: controller.signal });
            clearTimeout(timeoutId);
            data = await res.json();
        } catch (fetchErr) {
            console.warn('Friends list fetch warning:', fetchErr);
        }

        // If fetch succeeded with data
        if (data && data.success && Array.isArray(data.data)) {
            if (data.data.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon"><i class="fas fa-comments"></i></div>
                        <div class="empty-state-title">No chats yet</div>
                        <div class="empty-state-desc">You don't have any chats yet. Search for friends by phone number to start chatting.</div>
                        <button class="btn btn-primary btn-sm" onclick="switchTab('friends')">Find Friends</button>
                    </div>
                `;
                return;
            }

            let filtered = data.data;
            if (filterQuery) {
                const q = filterQuery.toLowerCase();
                filtered = data.data.filter(f => (f.fullname && f.fullname.toLowerCase().includes(q)) || (f.phone && f.phone.includes(q)));
            }

            let html = '';
            filtered.forEach(f => {
                const friendId = parseInt(f.id);
                window.friendsCache = window.friendsCache || {};
                window.friendsCache[friendId] = f;

                const avatar = typeof window.resolveAvatarUrl === 'function' ? window.resolveAvatarUrl(f.profile_image) : (f.profile_image || 'assets/images/default-avatar.png');
                const unreadCount = parseInt(f.unread_count) || 0;
                const hasUnread = unreadCount > 0;

                let previewText = f.last_message || 'Start chatting...';
                if (f.last_message_type === 'image') previewText = '📷 Photo';
                if (f.last_message_type === 'video') previewText = '🎥 Video';
                if (f.last_message_type === 'voice') previewText = '🎤 Voice message';
                if (f.last_message_type === 'document') previewText = '📄 Document';

                const activeClass = (window.chatManager && window.chatManager.activeFriend && parseInt(window.chatManager.activeFriend.id) === friendId) ? 'active' : '';

                const safeName = window.escapeHtml ? window.escapeHtml(f.fullname || 'Friend') : (f.fullname || 'Friend');
                const safeTime = window.formatDate ? window.formatDate(f.last_message_time) : '';
                const safePreview = window.escapeHtml ? window.escapeHtml(previewText) : previewText;

                html += `
                    <div class="list-item ${activeClass}" id="chat-item-${friendId}" onclick="openChatWith(${friendId}, '${safeName.replace(/'/g, "\\'")}', '${avatar.replace(/'/g, "\\'")}', '${(f.status || 'offline')}')" style="cursor:pointer;">
                        <div class="avatar avatar-md">
                            <img src="${avatar}" alt="${safeName}" onerror="this.src='assets/images/default-avatar.png'">
                            <span class="status-dot ${f.status || 'offline'}" id="status-dot-${friendId}"></span>
                        </div>
                        <div class="list-item-content">
                            <div class="list-item-top">
                                <span class="list-item-name">${safeName}</span>
                                <span class="list-item-time">${safeTime}</span>
                            </div>
                            <div class="list-item-bottom">
                                <span class="list-item-preview ${hasUnread ? 'unread' : ''}">${safePreview}</span>
                                ${hasUnread ? `<span class="badge">${unreadCount}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
        } else if (!container.querySelector('.list-item')) {
            // Only show empty state if container has no items
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-comments"></i></div>
                    <div class="empty-state-title">No chats yet</div>
                    <div class="empty-state-desc">You don't have any chats yet. Search for friends by phone number to start chatting.</div>
                    <button class="btn btn-primary btn-sm" onclick="switchTab('friends')">Find Friends</button>
                </div>
            `;
        }
    } catch (e) {
        console.error('Load chats error', e);
        if (!container.querySelector('.list-item')) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-comments"></i></div>
                    <div class="empty-state-title">No chats yet</div>
                    <div class="empty-state-desc">Search for friends by phone number to start chatting.</div>
                    <button class="btn btn-primary btn-sm" onclick="switchTab('friends')">Find Friends</button>
                </div>
            `;
        }
    }
}
window.loadChatsList = loadChatsList;

// Main App Initializer
function initializeDashboardApp() {
    if (window._dashboardInitialized) return;
    window._dashboardInitialized = true;

    // 1. Initialize Theme from localStorage or DB
    const savedTheme = localStorage.getItem('an_chat_theme') || (window.CURRENT_USER ? window.CURRENT_USER.theme : 'light');
    setAppTheme(savedTheme);

    const themeToggleBtn = document.getElementById('btnToggleTheme');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleAppTheme);
    }

    // 2. Initialize WebSocket Client (Smart detection for Localhost vs InfinityFree)
    if (window.CURRENT_USER && window.CURRENT_USER.id) {
        try {
            const isSecure = window.location.protocol === 'https:';
            const wsHost = window.location.hostname || 'localhost';
            const isInfinityFree = wsHost.includes('infinityfree') || wsHost.includes('epizy') || wsHost.includes('byethost');

            if (!isInfinityFree) {
                const wsUrl = `${isSecure ? 'wss://' : 'ws://'}${wsHost}:8085`;
                window.wsClient = new WebSocketClient(wsUrl, window.CURRENT_USER.id);
            } else {
                console.log('[A/N Chat] Running on InfinityFree Cloud. HTTP Polling Sync Engine active.');
                window.wsClient = null;
            }
        } catch (wsErr) {
            console.warn('[WebSocket Init Warning]', wsErr);
            window.wsClient = null;
        }

        try { window.webrtc = new WebRTCManager(window.wsClient); } catch (e) {}
        try { window.callController = new CallController(); } catch (e) {}
        try { window.chatManager = new ChatManager(); } catch (e) {}

        // Unified Real-Time 4-Second Auto-Sync Engine (Auto-Refresh & Auto-Save)
        try { startUnifiedAutoSyncEngine(); } catch (e) {}
    }

    // 3. Navigation Rail / Bottom Nav Tab Switching
    try { setupTabNavigation(); } catch (e) { console.error(e); }

    // 4. Initial List Loads
    try { loadChatsList(); } catch (e) { console.error(e); }
    if (window.NotificationManager) {
        try { NotificationManager.loadList(document.getElementById('notificationsListContainer')); } catch (e) {}
    }

    // 5. Back Button on Mobile
    const backBtn = document.getElementById('chatBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            const container = document.querySelector('.app-container');
            if (container) container.classList.remove('chat-open');
        });
    }

    // 6. Header Call Buttons
    const btnVoiceCall = document.getElementById('btnStartVoiceCall');
    const btnVideoCall = document.getElementById('btnStartVideoCall');

    if (btnVoiceCall) {
        btnVoiceCall.addEventListener('click', () => {
            if (typeof window.startCall === 'function') {
                window.startCall('voice');
            }
        });
    }

    if (btnVideoCall) {
        btnVideoCall.addEventListener('click', () => {
            if (typeof window.startCall === 'function') {
                window.startCall('video');
            }
        });
    }

    // 7. Middle Panel Search Input
    const searchInput = document.getElementById('middleSearchInput');
    let searchDebounce = null;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
                const activeTab = document.querySelector('.nav-item.active, .bottom-nav-item.active')?.getAttribute('data-tab') || 'chats';
                if (activeTab === 'friends') {
                    if (val.length === 0) {
                        loadFriendsList();
                    } else {
                        FriendsManager.search(val, document.getElementById('middleListContainer'));
                    }
                } else if (activeTab === 'chats') {
                    loadChatsList(val);
                }
            }, 300);
        });
    }

    // 8. User Profile Modal & Settings
    setupProfileModal();
}

// Lifecycle execution guard: executes immediately if DOM is ready, or on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDashboardApp);
} else {
    initializeDashboardApp();
}

async function loadFriendsList() {
    const container = document.getElementById('middleListContainer');
    if (!container) return;
    container.innerHTML = `<div style="display:flex;justify-content:center;padding:30px;"><div class="spinner"></div></div>`;

    try {
        // Fetch pending requests + friends
        const [resP, resF] = await Promise.all([
            fetch('api/friends/pending.php'),
            fetch('api/friends/list.php')
        ]);
        const dataP = await resP.json();
        const dataF = await resF.json();

        let html = '';

        // Pending Requests Header & List
        if (dataP.success && dataP.data && dataP.data.length > 0) {
            html += `<div style="padding:10px 18px 4px;font-size:12px;font-weight:700;color:var(--primary);text-transform:uppercase;">Friend Requests (${dataP.data.length})</div>`;
            dataP.data.forEach(p => {
                const avatar = window.resolveAvatarUrl(p.profile_image);
                html += `
                    <div class="list-item" id="req-item-${p.id}">
                        <div class="avatar avatar-md">
                            <img src="${avatar}" alt="${escapeHtml(p.fullname)}" onerror="this.src='assets/images/default-avatar.png'">
                        </div>
                        <div class="list-item-content">
                            <div class="list-item-name">${escapeHtml(p.fullname)}</div>
                            <div class="list-item-preview">${escapeHtml(p.phone)}</div>
                            <div style="display:flex;gap:8px;margin-top:6px;">
                                <button class="btn btn-primary btn-sm" onclick="FriendsManager.acceptRequest(${p.id}, document.getElementById('req-item-${p.id}'))">Accept</button>
                                <button class="btn btn-outline btn-sm" onclick="FriendsManager.rejectRequest(${p.id}, document.getElementById('req-item-${p.id}'))">Reject</button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        // Friends Header & List
        html += `<div style="padding:14px 18px 4px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;">All Friends</div>`;
        if (dataF.success && dataF.data && dataF.data.length > 0) {
            dataF.data.forEach(f => {
                const friendId = parseInt(f.id);
                window.friendsCache = window.friendsCache || {};
                window.friendsCache[friendId] = f;

                const avatar = (typeof window.resolveAvatarUrl === 'function') ? window.resolveAvatarUrl(f.profile_image) : (f.profile_image || 'assets/images/default-avatar.png');
                const safeFName = escapeHtml(f.fullname).replace(/'/g, "\\'");
                const safeFAvatar = avatar.replace(/'/g, "\\'");
                const safeFStatus = (f.status || 'offline').replace(/'/g, "\\'");
                html += `
                    <div class="list-item" id="friend-item-${friendId}" onclick="openChatWith(${friendId}, '${safeFName}', '${safeFAvatar}', '${safeFStatus}')" style="cursor:pointer;">
                        <div class="avatar avatar-md">
                            <img src="${avatar}" alt="${escapeHtml(f.fullname)}" onerror="this.src='assets/images/default-avatar.png'">
                            <span class="status-dot ${f.status || 'offline'}"></span>
                        </div>
                        <div class="list-item-content">
                            <div class="list-item-name">${escapeHtml(f.fullname)}</div>
                            <div class="list-item-preview"><i class="fas fa-phone-alt" style="font-size:11px;margin-right:4px;"></i>${escapeHtml(f.phone)}</div>
                        </div>
                        <div style="display:flex;gap:6px;align-items:center;">
                            <button class="btn-icon btn-sm" title="Voice call" style="color:var(--primary);" onclick="event.stopPropagation(); if (typeof window.startCallWith === 'function') window.startCallWith(${friendId}, '${safeFName}', '${safeFAvatar}', 'voice');">
                                <i class="fas fa-phone-alt"></i>
                            </button>
                            <button class="btn-icon btn-sm" title="Video call" style="color:var(--primary);" onclick="event.stopPropagation(); if (typeof window.startCallWith === 'function') window.startCallWith(${friendId}, '${safeFName}', '${safeFAvatar}', 'video');">
                                <i class="fas fa-video"></i>
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openChatWith(${friendId}, '${safeFName}', '${safeFAvatar}', '${safeFStatus}');">
                                <i class="fas fa-comment"></i> Chat
                            </button>
                        </div>
                    </div>
                `;
            });
        } else {
            html += `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-user-friends"></i></div>
                    <div class="empty-state-title">No friends yet</div>
                    <div class="empty-state-desc">Use the search bar above with a phone number to find friends.</div>
                </div>
            `;
        }

        container.innerHTML = html;
    } catch (e) {
        console.error('Load friends error', e);
    }
}

async function loadCallsList() {
    const container = document.getElementById('middleListContainer');
    if (!container) return;
    container.innerHTML = `<div style="display:flex;justify-content:center;padding:30px;"><div class="spinner"></div></div>`;

    try {
        const res = await fetch('api/calls/history.php');
        const data = await res.json();

        if (!data.success || !data.data || data.data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-phone"></i></div>
                    <div class="empty-state-title">No calls yet</div>
                    <div class="empty-state-desc">Voice and video call history will appear here.</div>
                </div>
            `;
            return;
        }

        let html = '';
        data.data.forEach(c => {
            const avatar = window.resolveAvatarUrl(c.other_user_image);
            const isMissed = (c.status === 'missed' || c.status === 'declined');
            const isVideo = (c.call_type === 'video');

            let icon = isVideo ? 'fa-video' : 'fa-phone-alt';
            let badgeClass = c.direction === 'outgoing' ? 'outgoing' : (isMissed ? 'missed' : 'incoming');
            let directionText = c.direction === 'outgoing' ? 'Outgoing' : (isMissed ? 'Missed' : 'Incoming');

            let durationText = '';
            if (c.duration > 0) {
                const mins = Math.floor(c.duration / 60);
                const secs = c.duration % 60;
                durationText = ` • ${mins}m ${secs}s`;
            }

            const otherId = parseInt(c.other_user_id);
            const safeCName = escapeHtml(c.other_user_name).replace(/'/g, "\\'");
            const safeCAvatar = avatar.replace(/'/g, "\\'");

            html += `
                <div class="list-item" onclick="openChatWith(${otherId}, '${safeCName}', '${safeCAvatar}', 'offline')" style="cursor:pointer;">
                    <div class="avatar avatar-md">
                        <img src="${avatar}" alt="${escapeHtml(c.other_user_name)}" onerror="this.src='assets/images/default-avatar.png'">
                    </div>
                    <div class="list-item-content">
                        <div class="list-item-name">${escapeHtml(c.other_user_name)}</div>
                        <div class="list-item-preview">
                            <span class="call-log-badge ${badgeClass}" style="display:inline-flex;width:20px;height:20px;font-size:10px;margin-right:4px;">
                                <i class="fas ${icon}"></i>
                            </span>
                            ${directionText} ${c.call_type} call ${durationText}
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="font-size:11px;color:var(--text-muted);text-align:right;">
                            ${formatDate(c.created_at)}
                        </div>
                        <button class="btn-icon btn-sm" title="Redial (${c.call_type})" style="color:var(--primary);" onclick="event.stopPropagation(); if (typeof window.startCallWith === 'function') window.startCallWith(${otherId}, '${safeCName}', '${safeCAvatar}', '${c.call_type || 'voice'}');">
                            <i class="fas ${isVideo ? 'fa-video' : 'fa-phone-alt'}"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (e) {
        console.error('Load calls error', e);
    }
}

function openChatWith(id, name, avatar, status) {
    if (!id) return;
    id = parseInt(id);
    window.activeFriendId = id;

    // 1. Force UI switch immediately - 0ms delay!
    const appContainer = document.querySelector('.app-container');
    if (appContainer) appContainer.classList.add('chat-open');

    const emptyState = document.getElementById('chatEmptyState');
    if (emptyState) emptyState.style.setProperty('display', 'none', 'important');

    const activeChatView = document.getElementById('activeChatView');
    if (activeChatView) activeChatView.style.setProperty('display', 'flex', 'important');

    const mainStage = document.querySelector('.main-stage');
    if (mainStage) mainStage.style.setProperty('display', 'flex', 'important');

    // 2. Discover user info from cache, DOM, or params
    if ((!name || !avatar) && window.friendsCache && window.friendsCache[id]) {
        const u = window.friendsCache[id];
        name = name || u.fullname;
        avatar = avatar || (typeof window.resolveAvatarUrl === 'function' ? window.resolveAvatarUrl(u.profile_image) : (u.profile_image || 'assets/images/default-avatar.png'));
        status = status || (u.status || 'offline');
    }
    if (!name || !avatar) {
        const el = document.getElementById('chat-item-' + id) || document.getElementById('friend-item-' + id);
        if (el) {
            const nEl = el.querySelector('.list-item-name');
            if (nEl && !name) name = nEl.textContent.trim();
            const aImg = el.querySelector('img');
            if (aImg && !avatar) avatar = aImg.src;
            const dot = el.querySelector('.status-dot');
            if (dot && !status) status = dot.classList.contains('online') ? 'online' : 'offline';
        }
    }
    name = name || 'Chat';
    avatar = avatar || 'assets/images/default-avatar.png';
    status = status || 'offline';

    // 3. Update Chat Header immediately
    const nameEl = document.getElementById('chatHeaderName');
    if (nameEl) nameEl.textContent = name;

    const headerAvatar = document.getElementById('chatHeaderAvatar');
    if (headerAvatar) {
        headerAvatar.onerror = function() { headerAvatar.onerror = null; headerAvatar.src = 'assets/images/default-avatar.png'; };
        headerAvatar.src = typeof window.resolveAvatarUrl === 'function' ? window.resolveAvatarUrl(avatar) : avatar;
    }

    const statusEl = document.getElementById('chatHeaderStatus');
    if (statusEl) {
        statusEl.className = 'chat-header-status ' + status;
        statusEl.innerHTML = '<i class="fas fa-circle" style="font-size:8px;"></i> ' + (status === 'online' ? 'Online' : 'Offline');
    }

    // 4. Highlight active list item
    document.querySelectorAll('.list-item.active').forEach(e => e.classList.remove('active'));
    const activeItem = document.getElementById('chat-item-' + id) || document.getElementById('friend-item-' + id);
    if (activeItem) activeItem.classList.add('active');

    // 5. Enable and focus message input field
    const inputField = document.getElementById('chatInputField');
    if (inputField) {
        inputField.disabled = false;
        setTimeout(() => {
            try { inputField.focus(); } catch (e) {}
        }, 50);
    }

    // 6. Ensure ChatManager instance exists & delegate
    if (!window.chatManager && typeof ChatManager === 'function') {
        try { window.chatManager = new ChatManager(); } catch (e) { console.error(e); }
    }

    if (window.chatManager && typeof window.chatManager.openConversation === 'function') {
        window.chatManager.openConversation(id, name, avatar, status);
    } else if (typeof window.loadMessagesFallback === 'function') {
        window.loadMessagesFallback(id);
    }
}
window.openChatWith = openChatWith;
window._openChatWithImpl = openChatWith;

function updateUserStatusInUI(userId, status, lastSeen) {
    const dot = document.getElementById(`status-dot-${userId}`);
    if (dot) {
        dot.className = `status-dot ${status}`;
    }

    if (window.chatManager && window.chatManager.activeFriend && parseInt(window.chatManager.activeFriend.id) === parseInt(userId)) {
        window.chatManager.activeFriend.status = status;
        const statusEl = document.getElementById('chatHeaderStatus');
        if (statusEl) {
            statusEl.className = `chat-header-status ${status}`;
            statusEl.innerHTML = `<i class="fas fa-circle" style="font-size:8px;"></i> ${status === 'online' ? 'Online' : 'Offline'}`;
        }
    }
}

/* ========================================================== */
/* Unified Real-Time 1-Second Auto-Sync Engine                */
/* (Auto-Refresh & Auto-Save: Messages, Settings, Badges)    */
/* ========================================================== */
let isSyncInProgress = false;
let previousUnreadMap = {};
let autoSyncIntervalTimer = null;

function refreshCurrentTab() {
    const activeTab = document.querySelector('.nav-item.active, .bottom-nav-item.active')?.getAttribute('data-tab') || 'chats';
    if (activeTab === 'chats') {
        loadChatsList();
    } else if (activeTab === 'friends') {
        loadFriendsList();
    } else if (activeTab === 'calls') {
        loadCallsList();
    } else if (activeTab === 'notifications') {
        if (window.NotificationManager) NotificationManager.loadList(document.getElementById('middleListContainer'));
    }
}
window.refreshCurrentTab = refreshCurrentTab;

function startUnifiedAutoSyncEngine() {
    // Ultra-Fast 1-Second Background Auto-Sync Engine (Auto-Refresh & Auto-Save every 1 second)
    const intervalMs = 1000;
    if (autoSyncIntervalTimer) clearInterval(autoSyncIntervalTimer);
    setTimeout(runAutoSyncHeartbeat, 300);
    autoSyncIntervalTimer = setInterval(runAutoSyncHeartbeat, intervalMs);

    // Request Web Notification permission on first user interaction so alerts pop up even if tab minimized
    const requestPushPermission = () => {
        if ('Notification' in window && Notification.permission === 'default') {
            try { Notification.requestPermission().catch(() => {}); } catch (e) {}
        }
        document.removeEventListener('click', requestPushPermission);
        document.removeEventListener('touchstart', requestPushPermission);
    };
    document.addEventListener('click', requestPushPermission, { once: true });
    document.addEventListener('touchstart', requestPushPermission, { once: true });
}

async function runAutoSyncHeartbeat() {
    if (isSyncInProgress) return;
    if (!window.CURRENT_USER || !window.CURRENT_USER.id) return;

    isSyncInProgress = true;
    try {
        const activeFriendId = (window.chatManager && window.chatManager.activeFriend) ? parseInt(window.chatManager.activeFriend.id) : 0;
        const lastMsgId = (window.chatManager && window.chatManager.highestMessageId) ? parseInt(window.chatManager.highestMessageId) : 0;
        const lastGlobalId = window.highestGlobalMessageId || 0;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(`api/messages/sync.php?active_friend_id=${activeFriendId}&last_msg_id=${lastMsgId}&last_global_id=${lastGlobalId}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();

        if (data && data.success && data.data) {
            handleAutoSyncPayload(data.data, activeFriendId);
        }
    } catch (err) {
        // Silent retry
    } finally {
        isSyncInProgress = false;
    }
}

function handleAutoSyncPayload(payload, activeFriendId) {
    // 0. Advance Global Message ID Cursor
    if (payload.max_global_id) {
        window.highestGlobalMessageId = Math.max(window.highestGlobalMessageId || 0, parseInt(payload.max_global_id));
    }

    // 1. Process New Messages in Active Chat
    if (activeFriendId > 0 && Array.isArray(payload.new_messages) && payload.new_messages.length > 0) {
        if (window.chatManager && window.chatManager.activeFriend && parseInt(window.chatManager.activeFriend.id) === activeFriendId) {
            let receivedNewTheirs = false;
            payload.new_messages.forEach(msg => {
                if (!document.getElementById(`msg-row-${msg.id}`)) {
                    const container = window.chatManager.messagesContainer;
                    const isNearBottom = container ? (container.scrollHeight - container.scrollTop - container.clientHeight < 180) : true;
                    
                    window.chatManager.appendMessage(msg, isNearBottom);

                    if (parseInt(msg.sender_id) !== parseInt(window.CURRENT_USER.id)) {
                        receivedNewTheirs = true;
                    }
                }
            });

            if (receivedNewTheirs) {
                window.chatManager.playMessagePing();
            }
        }
    }

    // 1b. Process Incoming Messages Across The Whole App (Instant Toast & Sound if chat not currently open)
    if (Array.isArray(payload.recent_incoming) && payload.recent_incoming.length > 0) {
        payload.recent_incoming.forEach(msg => {
            const senderId = parseInt(msg.sender_id);
            const isCurrentlyChatting = (activeFriendId > 0 && activeFriendId === senderId);

            if (!isCurrentlyChatting) {
                // Play notification sound
                if (window.chatManager && typeof window.chatManager.playMessagePing === 'function') {
                    window.chatManager.playMessagePing();
                }

                let preview = msg.message || '';
                if (msg.message_type === 'image') preview = '📷 Photo';
                if (msg.message_type === 'video') preview = '🎥 Video';
                if (msg.message_type === 'voice') preview = '🎤 Voice message';
                if (msg.message_type === 'document') preview = '📄 Document';

                const safeSender = msg.sender_name || 'Friend';

                // Display interactive toast notification (click toast to open chat immediately)
                showToast(`💬 ${safeSender}: ${preview}`, 'message', () => {
                    if (typeof openChatWith === 'function') {
                        openChatWith(senderId, safeSender, msg.sender_image, 'online');
                    }
                });

                // Display native system push notification if permission granted
                if ('Notification' in window && Notification.permission === 'granted') {
                    try {
                        const notif = new Notification(safeSender, {
                            body: preview,
                            icon: msg.sender_image || 'assets/icons/icon-192.png',
                            badge: 'assets/icons/favicon.png',
                            tag: 'chat-msg-' + senderId
                        });
                        notif.onclick = () => {
                            window.focus();
                            if (typeof openChatWith === 'function') {
                                openChatWith(senderId, safeSender, msg.sender_image, 'online');
                            }
                        };
                    } catch (e) {}
                }
            }
        });
    }

    // 2. Process Read Receipts & Deleted Messages in Active Chat
    if (activeFriendId > 0 && window.chatManager) {
        if (Array.isArray(payload.read_message_ids) && payload.read_message_ids.length > 0) {
            window.chatManager.updateReadStatus(payload.read_message_ids);
        }
        if (Array.isArray(payload.deleted_message_ids) && payload.deleted_message_ids.length > 0) {
            window.chatManager.updateDeletedMessages(payload.deleted_message_ids);
        }
    }

    // 3. Process Live Conversations List (Chats tab) in place without flicker
    if (Array.isArray(payload.conversations)) {
        updateConversationsListUI(payload.conversations);
    }

    // 3b. Update Total Unread Messages Badges (Navigation Rail & Mobile Bottom Bar)
    if (typeof payload.total_unread_messages !== 'undefined') {
        const total = parseInt(payload.total_unread_messages) || 0;
        document.querySelectorAll('.chats-badge').forEach(b => {
            if (total > 0) {
                b.style.display = 'inline-flex';
                b.textContent = total > 99 ? '99+' : total;
            } else {
                b.style.display = 'none';
            }
        });
    }

    // 4. Process System Settings (Admin Updates in Real-Time without Refresh)
    if (payload.system_settings) {
        const prevSettings = window.SYSTEM_SETTINGS ? { ...window.SYSTEM_SETTINGS } : {};
        window.SYSTEM_SETTINGS = Object.assign(window.SYSTEM_SETTINGS || {}, payload.system_settings);

        if (prevSettings.screenshot_detection !== undefined && prevSettings.screenshot_detection !== payload.system_settings.screenshot_detection) {
            const isEnabled = payload.system_settings.screenshot_detection === '1';
            console.log(`[AutoSync] Admin updated screenshot_detection to: ${isEnabled ? 'ON' : 'OFF'}`);
            if (isEnabled) {
                showToast('🛡️ Admin has enabled screenshot protection.', 'info');
            } else {
                showToast('ℹ️ Admin has disabled screenshot protection.', 'info');
            }
        }
    }

    // 5. Process Notification Badges
    if (typeof payload.unread_notifications !== 'undefined') {
        const notifBadges = document.querySelectorAll('.notif-badge');
        const count = parseInt(payload.unread_notifications) || 0;
        notifBadges.forEach(b => {
            if (count > 0) {
                b.style.display = 'inline-flex';
                b.textContent = count > 99 ? '99+' : count;
            } else {
                b.style.display = 'none';
            }
        });

        // If user is currently viewing the notifications tab and a new notification arrived, auto-refresh it
        const activeTab = document.querySelector('.nav-item.active, .bottom-nav-item.active')?.getAttribute('data-tab') || 'chats';
        if (activeTab === 'notifications' && window.NotificationManager && typeof window.lastUnreadNotifsCount !== 'undefined' && count !== window.lastUnreadNotifsCount) {
            NotificationManager.loadList(document.getElementById('middleListContainer'));
        }
        window.lastUnreadNotifsCount = count;
    }

    // 6. Incoming Call Handling
    if (payload.incoming_call) {
        if (!window.callController && typeof CallController === 'function') {
            try { window.callController = new CallController(); } catch (e) {}
        }
        if (window.callController) {
            const overlay = document.getElementById('callModalOverlay');
            if (!overlay || !overlay.classList.contains('active')) {
                window.callController.showIncomingCall({
                    from_user_id: payload.incoming_call.caller_id,
                    call_id: payload.incoming_call.id,
                    call_type: payload.incoming_call.call_type,
                    caller_name: payload.incoming_call.caller_name,
                    caller_image: payload.incoming_call.caller_image
                });
            }
        }
    } else if (!payload.incoming_call && window.callController) {
        // If an incoming call screen is ringing but caller cancelled/hung up, dismiss it
        const incBox = document.getElementById('incomingCallBox');
        if (incBox && incBox.style.display === 'flex') {
            window.callController.hideCallOverlay();
            window.callController.playCallEndTone();
            if (typeof showToast === 'function') {
                showToast('Wicitaankii waa la xiray.', 'info');
            }
        }
    }
}

function updateConversationsListUI(conversations) {
    if (!Array.isArray(conversations)) return;

    // Always maintain friends cache regardless of active tab
    conversations.forEach(f => {
        const friendId = parseInt(f.id);
        window.friendsCache = window.friendsCache || {};
        window.friendsCache[friendId] = f;
    });

    const container = document.getElementById('middleListContainer');
    if (!container) return;

    // Only update middle list container DOM if current active tab is 'chats'
    const activeTab = document.querySelector('.nav-item.active, .bottom-nav-item.active')?.getAttribute('data-tab') || 'chats';
    if (activeTab !== 'chats') return;

    const searchInput = document.getElementById('middleSearchInput');
    const isSearching = searchInput && searchInput.value.trim().length > 0;
    if (isSearching) {
        // Do not alter UI during active user search
        return;
    }

    try {
        if (conversations.length === 0) {
            if (!container.querySelector('.empty-state')) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon"><i class="fas fa-comments"></i></div>
                        <div class="empty-state-title">No chats yet</div>
                        <div class="empty-state-desc">Search for friends by phone number and start a conversation.</div>
                        <button class="btn btn-primary btn-sm" onclick="switchTab('friends')">Find Friends</button>
                    </div>
                `;
            }
            return;
        }

        // Remove empty state and any spinner if present
        const spinner = container.querySelector('.spinner');
        if (spinner) {
            spinner.closest('div[style*="padding"]')?.remove() || spinner.remove();
        }
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) {
            container.innerHTML = '';
        }

        const currentActiveFriendId = (window.chatManager && window.chatManager.activeFriend) ? parseInt(window.chatManager.activeFriend.id) : 0;

        conversations.forEach(f => {
            const friendId = parseInt(f.id);
            const avatar = typeof window.resolveAvatarUrl === 'function' ? window.resolveAvatarUrl(f.profile_image) : (f.profile_image || 'assets/images/default-avatar.png');
            const unreadCount = parseInt(f.unread_count) || 0;
            const hasUnread = unreadCount > 0;

            let previewText = f.last_message || 'Start chatting...';
            if (f.last_message_type === 'image') previewText = '📷 Photo';
            if (f.last_message_type === 'video') previewText = '🎥 Video';
            if (f.last_message_type === 'voice') previewText = '🎤 Voice message';
            if (f.last_message_type === 'document') previewText = '📄 Document';

            previousUnreadMap[friendId] = unreadCount;

            const isActive = (currentActiveFriendId === friendId);

            const safeName = window.escapeHtml ? window.escapeHtml(f.fullname || 'Friend') : (f.fullname || 'Friend');
            const safeTime = window.formatDate ? window.formatDate(f.last_message_time) : '';
            const safePreview = window.escapeHtml ? window.escapeHtml(previewText) : previewText;

            let item = document.getElementById(`chat-item-${friendId}`);
            if (!item) {
                item = document.createElement('div');
                item.className = `list-item ${isActive ? 'active' : ''}`;
                item.id = `chat-item-${friendId}`;
                item.onclick = () => openChatWith(friendId);
                item.innerHTML = `
                    <div class="avatar avatar-md">
                        <img src="${avatar}" alt="${safeName}" onerror="this.src='assets/images/default-avatar.png'">
                        <span class="status-dot ${f.status || 'offline'}" id="status-dot-${friendId}"></span>
                    </div>
                    <div class="list-item-content">
                        <div class="list-item-top">
                            <span class="list-item-name">${safeName}</span>
                            <span class="list-item-time">${safeTime}</span>
                        </div>
                        <div class="list-item-bottom">
                            <span class="list-item-preview ${hasUnread ? 'unread' : ''}">${safePreview}</span>
                            ${hasUnread ? `<span class="badge">${unreadCount}</span>` : ''}
                        </div>
                    </div>
                `;
                container.appendChild(item);
            } else {
                // Update in-place smoothly
                if (isActive && !item.classList.contains('active')) {
                    item.classList.add('active');
                } else if (!isActive && item.classList.contains('active')) {
                    item.classList.remove('active');
                }

                const dot = item.querySelector('.status-dot');
                if (dot) dot.className = `status-dot ${f.status || 'offline'}`;

                const nameEl = item.querySelector('.list-item-name');
                if (nameEl) nameEl.textContent = f.fullname;

                const timeEl = item.querySelector('.list-item-time');
                if (timeEl) timeEl.textContent = safeTime;

                const prevEl = item.querySelector('.list-item-preview');
                if (prevEl) {
                    prevEl.textContent = previewText;
                    if (hasUnread) {
                        prevEl.classList.add('unread');
                    } else {
                        prevEl.classList.remove('unread');
                    }
                }

                const bottomEl = item.querySelector('.list-item-bottom');
                let badge = bottomEl ? bottomEl.querySelector('.badge') : null;
                if (hasUnread) {
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'badge';
                        if (bottomEl) bottomEl.appendChild(badge);
                    }
                    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                } else if (badge) {
                    badge.remove();
                }

                // Move to correct position according to sorted order without flicker
                container.appendChild(item);
            }
        });
    } catch (err) {
        console.warn('[AutoSync update error]', err);
    }
}

function setupProfileModal() {
    const modal = document.getElementById('profileEditModal');
    const form = document.getElementById('profileEditForm');
    const btnClose = document.getElementById('btnCloseProfileModal');

    if (btnClose && modal) {
        btnClose.addEventListener('click', () => modal.classList.remove('active'));
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            formData.append('action', 'info');

            try {
                const res = await fetch('api/users/update-profile.php', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Profile updated successfully!', 'success');
                    modal.classList.remove('active');
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    showToast(data.message || 'Update failed', 'error');
                }
            } catch (e) {
                showToast('Network error', 'error');
            }
        });
    }
}

function openProfileModal() {
    const modal = document.getElementById('profileEditModal');
    if (modal) modal.classList.add('active');
}
window.openProfileModal = openProfileModal;

function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.add('active');
}
window.openSettingsModal = openSettingsModal;

