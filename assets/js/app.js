// assets/js/app.js - Master Dashboard Application Controller

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

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Theme from localStorage or DB
    const savedTheme = localStorage.getItem('an_chat_theme') || (window.CURRENT_USER ? window.CURRENT_USER.theme : 'light');
    setAppTheme(savedTheme);

    const themeToggleBtn = document.getElementById('btnToggleTheme');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            setAppTheme(next);
            // Save to settings API
            fetch('api/users/settings.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme: next })
            }).catch(() => {});
        });
    }

    // 2. Initialize WebSocket Client
    if (window.CURRENT_USER && window.CURRENT_USER.id) {
        const wsHost = window.location.hostname || 'localhost';
        const wsUrl = `ws://${wsHost}:8085`;
        window.wsClient = new WebSocketClient(wsUrl, window.CURRENT_USER.id);
        window.webrtc = new WebRTCManager(window.wsClient);
        window.callController = new CallController();
        window.chatManager = new ChatManager();

        // Unified Real-Time 4-Second Auto-Sync Engine (Auto-Refresh & Auto-Save)
        startUnifiedAutoSyncEngine();
    }

    // 3. Navigation Rail / Bottom Nav Tab Switching
    setupTabNavigation();

    // 4. Initial List Loads
    loadChatsList();
    if (window.NotificationManager) {
        NotificationManager.loadList(document.getElementById('notificationsListContainer'));
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
            if (!window.chatManager || !window.chatManager.activeFriend) return;
            const f = window.chatManager.activeFriend;
            window.callController.startOutgoingCall(f.name, f.avatar, 'voice');
            window.webrtc.initiateCall(f.id, 'voice');
        });
    }

    if (btnVideoCall) {
        btnVideoCall.addEventListener('click', () => {
            if (!window.chatManager || !window.chatManager.activeFriend) return;
            const f = window.chatManager.activeFriend;
            window.callController.startOutgoingCall(f.name, f.avatar, 'video');
            window.webrtc.initiateCall(f.id, 'video');
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
                const activeTab = document.querySelector('.nav-item.active')?.getAttribute('data-tab') || 'chats';
                if (activeTab === 'friends' || val.length > 0) {
                    FriendsManager.search(val, document.getElementById('middleListContainer'));
                } else {
                    loadChatsList(val);
                }
            }, 300);
        });
    }

    // 8. User Profile Modal & Settings
    setupProfileModal();
});

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

function setupTabNavigation() {
    const navItems = document.querySelectorAll('.nav-item, .bottom-nav-item');
    const middleTitle = document.getElementById('middlePanelTitle');
    const searchInput = document.getElementById('middleSearchInput');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const tab = item.getAttribute('data-tab');
            if (!tab) return;

            // Update active states
            document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => el.classList.remove('active'));
            document.querySelectorAll(`[data-tab="${tab}"]`).forEach(el => el.classList.add('active'));

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
                    NotificationManager.loadList(listContainer);
                    break;
                case 'profile':
                    openProfileModal();
                    break;
                case 'settings':
                    openSettingsModal();
                    break;
            }
        });
    });
}

async function loadChatsList(filterQuery = '') {
    const container = document.getElementById('middleListContainer');
    if (!container) return;

    try {
        const res = await fetch('api/friends/list.php');
        const data = await res.json();

        if (!data.success || !data.data || data.data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-comments"></i></div>
                    <div class="empty-state-title">No chats yet</div>
                    <div class="empty-state-desc">Search for friends by phone number and start a conversation.</div>
                    <button class="btn btn-primary btn-sm" onclick="document.querySelector('[data-tab=friends]').click()">Find Friends</button>
                </div>
            `;
            return;
        }

        let filtered = data.data;
        if (filterQuery) {
            const q = filterQuery.toLowerCase();
            filtered = data.data.filter(f => f.fullname.toLowerCase().includes(q) || f.phone.includes(q));
        }

        let html = '';
        filtered.forEach(f => {
            const avatar = window.resolveAvatarUrl(f.profile_image);
            const unreadCount = parseInt(f.unread_count) || 0;
            const hasUnread = unreadCount > 0;

            let previewText = f.last_message || 'Start chatting...';
            if (f.last_message_type === 'image') previewText = '📷 Photo';
            if (f.last_message_type === 'video') previewText = '🎥 Video';
            if (f.last_message_type === 'voice') previewText = '🎤 Voice message';
            if (f.last_message_type === 'document') previewText = '📄 Document';

            const activeClass = (window.chatManager && window.chatManager.activeFriend && window.chatManager.activeFriend.id === f.id) ? 'active' : '';

            html += `
                <div class="list-item ${activeClass}" id="chat-item-${f.id}" onclick="openChatWith(${f.id}, '${escapeHtml(f.fullname)}', '${escapeHtml(avatar)}', '${f.status}')">
                    <div class="avatar avatar-md">
                        <img src="${avatar}" alt="${escapeHtml(f.fullname)}" onerror="this.src='assets/images/default-avatar.png'">
                        <span class="status-dot ${f.status}" id="status-dot-${f.id}"></span>
                    </div>
                    <div class="list-item-content">
                        <div class="list-item-top">
                            <span class="list-item-name">${escapeHtml(f.fullname)}</span>
                            <span class="list-item-time">${formatDate(f.last_message_time)}</span>
                        </div>
                        <div class="list-item-bottom">
                            <span class="list-item-preview ${hasUnread ? 'unread' : ''}">${escapeHtml(previewText)}</span>
                            ${hasUnread ? `<span class="badge">${unreadCount}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (e) {
        console.error('Load chats error', e);
    }
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
                const avatar = window.resolveAvatarUrl(f.profile_image);
                html += `
                    <div class="list-item">
                        <div class="avatar avatar-md">
                            <img src="${avatar}" alt="${escapeHtml(f.fullname)}" onerror="this.src='assets/images/default-avatar.png'">
                            <span class="status-dot ${f.status}"></span>
                        </div>
                        <div class="list-item-content">
                            <div class="list-item-name">${escapeHtml(f.fullname)}</div>
                            <div class="list-item-preview"><i class="fas fa-phone-alt" style="font-size:11px;margin-right:4px;"></i>${escapeHtml(f.phone)}</div>
                        </div>
                        <div>
                            <button class="btn btn-secondary btn-sm" onclick="openChatWith(${f.id}, '${escapeHtml(f.fullname)}', '${escapeHtml(avatar)}', '${f.status}')">
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

            html += `
                <div class="list-item">
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
                    <div style="font-size:11px;color:var(--text-muted);text-align:right;">
                        ${formatDate(c.created_at)}
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
    if (window.chatManager) {
        window.chatManager.openConversation(id, name, avatar, status);
    }
}

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
/* Unified Real-Time 4-Second Auto-Sync Engine                */
/* (Auto-Refresh & Auto-Save: Messages, Settings, Badges)    */
/* ========================================================== */
let isSyncInProgress = false;
let previousUnreadMap = {};

function startUnifiedAutoSyncEngine() {
    // Initial heartbeat after 1s, then every 4s continuously
    setTimeout(runAutoSyncHeartbeat, 1000);
    setInterval(runAutoSyncHeartbeat, 4000);
}

async function runAutoSyncHeartbeat() {
    if (isSyncInProgress) return;
    if (!window.CURRENT_USER || !window.CURRENT_USER.id) return;

    isSyncInProgress = true;
    try {
        const activeFriendId = (window.chatManager && window.chatManager.activeFriend) ? parseInt(window.chatManager.activeFriend.id) : 0;
        const lastMsgId = (window.chatManager && window.chatManager.highestMessageId) ? parseInt(window.chatManager.highestMessageId) : 0;

        const res = await fetch(`api/messages/sync.php?active_friend_id=${activeFriendId}&last_msg_id=${lastMsgId}`);
        const data = await res.json();

        if (data && data.success && data.data) {
            handleAutoSyncPayload(data.data, activeFriendId);
        }
    } catch (err) {
        console.debug('[AutoSync] Silent sync retry:', err);
    } finally {
        isSyncInProgress = false;
    }
}

function handleAutoSyncPayload(payload, activeFriendId) {
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

    // 4. Process System Settings (Admin Updates)
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
    }

    // 6. Incoming Call Fallback
    if (payload.incoming_call && window.callController) {
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
}

function updateConversationsListUI(conversations) {
    if (!Array.isArray(conversations)) return;

    const container = document.getElementById('middleListContainer');
    if (!container) return;

    // Only update if current active tab is 'chats'
    const activeTab = document.querySelector('.nav-item.active, .bottom-nav-item.active')?.getAttribute('data-tab') || 'chats';
    if (activeTab !== 'chats') return;

    const searchInput = document.getElementById('middleSearchInput');
    const isSearching = searchInput && searchInput.value.trim().length > 0;
    if (isSearching) {
        // Do not alter UI during active user search
        return;
    }

    if (conversations.length === 0) {
        if (!container.querySelector('.empty-state')) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-comments"></i></div>
                    <div class="empty-state-title">No chats yet</div>
                    <div class="empty-state-desc">Search for friends by phone number and start a conversation.</div>
                    <button class="btn btn-primary btn-sm" onclick="document.querySelector('[data-tab=friends]').click()">Find Friends</button>
                </div>
            `;
        }
        return;
    }

    // Remove empty state if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        container.innerHTML = '';
    }

    const currentActiveFriendId = (window.chatManager && window.chatManager.activeFriend) ? parseInt(window.chatManager.activeFriend.id) : 0;

    conversations.forEach(f => {
        const friendId = parseInt(f.id);
        const avatar = window.resolveAvatarUrl(f.profile_image);
        const unreadCount = parseInt(f.unread_count) || 0;
        const hasUnread = unreadCount > 0;

        let previewText = f.last_message || 'Start chatting...';
        if (f.last_message_type === 'image') previewText = '📷 Photo';
        if (f.last_message_type === 'video') previewText = '🎥 Video';
        if (f.last_message_type === 'voice') previewText = '🎤 Voice message';
        if (f.last_message_type === 'document') previewText = '📄 Document';

        // Check if unread count increased from previous check
        const prevUnread = previousUnreadMap[friendId] || 0;
        if (unreadCount > prevUnread && currentActiveFriendId !== friendId) {
            if (window.chatManager) window.chatManager.playMessagePing();
            showToast(`💬 ${f.fullname}: ${previewText}`, 'info');
        }
        previousUnreadMap[friendId] = unreadCount;

        const isActive = (currentActiveFriendId === friendId);

        let item = document.getElementById(`chat-item-${friendId}`);
        if (!item) {
            item = document.createElement('div');
            item.className = `list-item ${isActive ? 'active' : ''}`;
            item.id = `chat-item-${friendId}`;
            item.onclick = () => openChatWith(friendId, f.fullname, avatar, f.status);
            item.innerHTML = `
                <div class="avatar avatar-md">
                    <img src="${avatar}" alt="${escapeHtml(f.fullname)}" onerror="this.src='assets/images/default-avatar.png'">
                    <span class="status-dot ${f.status}" id="status-dot-${friendId}"></span>
                </div>
                <div class="list-item-content">
                    <div class="list-item-top">
                        <span class="list-item-name">${escapeHtml(f.fullname)}</span>
                        <span class="list-item-time">${formatDate(f.last_message_time)}</span>
                    </div>
                    <div class="list-item-bottom">
                        <span class="list-item-preview ${hasUnread ? 'unread' : ''}">${escapeHtml(previewText)}</span>
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
            if (dot) dot.className = `status-dot ${f.status}`;

            const nameEl = item.querySelector('.list-item-name');
            if (nameEl) nameEl.textContent = f.fullname;

            const timeEl = item.querySelector('.list-item-time');
            if (timeEl) timeEl.textContent = formatDate(f.last_message_time);

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

function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.add('active');
}

