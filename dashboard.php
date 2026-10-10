<?php
// dashboard.php - Main Application Dashboard
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/models/User.php';
require_once __DIR__ . '/models/SystemSetting.php';

if (empty($_SESSION['user_id'])) {
    header('Location: login.php');
    exit;
}

$userModel = new User();
$currentUser = $userModel->findById((int)$_SESSION['user_id']);

if (!$currentUser) {
    header('Location: logout.php');
    exit;
}

// Mark the authenticated dashboard view online immediately, before relying on
// JavaScript heartbeats to maintain presence while the page stays open.
$userModel->updateStatus((int)$currentUser['id'], 'online');

require_once __DIR__ . '/models/Friend.php';

// Release session write lock early so parallel AJAX calls are never blocked
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$friendModel = new Friend();
$initialFriends = [];
try {
    $initialFriends = $friendModel->getFriendsList((int)$currentUser['id']);
} catch (Throwable $e) {
    $initialFriends = [];
}

$settingModel = new SystemSetting();
$screenshotSetting = $settingModel->get('screenshot_detection', '1');

$userAvatar = $currentUser['profile_image'] ? 
    (str_starts_with($currentUser['profile_image'], 'http') || str_starts_with($currentUser['profile_image'], 'assets/') || str_starts_with($currentUser['profile_image'], 'uploads/')
        ? $currentUser['profile_image'] 
        : 'uploads/images/' . $currentUser['profile_image']) : 
    'assets/images/default-avatar.png';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>A/N Chat — Connect. Chat. Call. Share.</title>
    <link rel="icon" type="image/png" href="assets/icons/favicon.png">
    <link rel="apple-touch-icon" href="assets/icons/icon-192.png">
    <link rel="manifest" href="pwa/manifest.json">
    <meta name="theme-color" content="#E91E63">
    <script>
        (function () {
            const root = document.documentElement;
            const syncViewport = () => {
                const viewport = window.visualViewport;
                root.style.setProperty('--app-viewport-height', `${Math.round(viewport ? viewport.height : window.innerHeight)}px`);
                root.style.setProperty('--app-viewport-top', `${Math.round(viewport ? viewport.offsetTop : 0)}px`);
            };
            syncViewport();
            window.addEventListener('resize', syncViewport, { passive: true });
            window.addEventListener('orientationchange', syncViewport, { passive: true });
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', syncViewport, { passive: true });
                window.visualViewport.addEventListener('scroll', syncViewport, { passive: true });
            }
        })();
    </script>

    <!-- FontAwesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

    <!-- Stylesheets with Cache Busting -->
    <link rel="stylesheet" href="assets/css/variables.css?v=<?= @filemtime(__DIR__ . '/assets/css/variables.css') ?: time() ?>">
    <link rel="stylesheet" href="assets/css/reset.css?v=<?= @filemtime(__DIR__ . '/assets/css/reset.css') ?: time() ?>">
    <link rel="stylesheet" href="assets/css/style.css?v=<?= @filemtime(__DIR__ . '/assets/css/style.css') ?: time() ?>">
    <link rel="stylesheet" href="assets/css/dashboard.css?v=<?= @filemtime(__DIR__ . '/assets/css/dashboard.css') ?: time() ?>">
    <link rel="stylesheet" href="assets/css/messages.css?v=<?= @filemtime(__DIR__ . '/assets/css/messages.css') ?: time() ?>">
    <link rel="stylesheet" href="assets/css/calls.css?v=<?= @filemtime(__DIR__ . '/assets/css/calls.css') ?: time() ?>">
    <link rel="stylesheet" href="assets/css/responsive.css?v=<?= @filemtime(__DIR__ . '/assets/css/responsive.css') ?: time() ?>">

    <!-- Inline Resilient Global Utilities & Navigation Stubs -->
    <script>
        function escapeHtml(text) {
            if (text === null || text === undefined) return '';
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
            return String(text).replace(/[&<>"']/g, m => map[m]);
        }
        window.escapeHtml = escapeHtml;

        function formatDate(dateStr) {
            if (!dateStr) return '';
            try {
                const parts = String(dateStr).trim().split(/[- :T]/);
                if (parts.length >= 5) {
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const mIdx = parseInt(parts[1], 10) - 1;
                    const month = months[mIdx] || parts[1];
                    const day = parseInt(parts[2], 10);
                    let hour = parseInt(parts[3], 10);
                    const minute = parts[4];
                    const ampm = hour >= 12 ? 'PM' : 'AM';
                    hour = hour % 12;
                    hour = hour ? hour : 12;
                    return `${month} ${day}, ${hour}:${minute} ${ampm}`;
                }
                const d = new Date(String(dateStr).replace(' ', 'T'));
                if (isNaN(d.getTime())) return '';
                return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch (e) {
                return '';
            }
        }
        window.formatDate = formatDate;

        function formatTime(dateStr) {
            if (!dateStr) return '';
            try {
                const parts = String(dateStr).trim().split(/[- :T]/);
                if (parts.length >= 5) {
                    let hour = parseInt(parts[3], 10);
                    const minute = parts[4];
                    const ampm = hour >= 12 ? 'PM' : 'AM';
                    hour = hour % 12;
                    hour = hour ? hour : 12;
                    return `${hour}:${minute} ${ampm}`;
                }
                const d = new Date(String(dateStr).replace(' ', 'T'));
                if (isNaN(d.getTime())) return '';
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } catch (e) {
                return '';
            }
        }
        window.formatTime = formatTime;

        function closeActiveChat() {
            const container = document.querySelector('.app-container');
            if (container) container.classList.remove('chat-open');

            // openChatWith() forces these views visible with inline !important
            // styles, so removing the mobile class alone cannot close a chat.
            const activeChatView = document.getElementById('activeChatView');
            if (activeChatView) activeChatView.style.setProperty('display', 'none', 'important');
            const emptyState = document.getElementById('chatEmptyState');
            if (emptyState) emptyState.style.removeProperty('display');
            const mainStage = document.querySelector('.main-stage');
            if (mainStage) mainStage.style.removeProperty('display');

            window.activeFriendId = null;
            if (window.chatManager) {
                if (window.chatManager.conversationPollTimer) {
                    clearInterval(window.chatManager.conversationPollTimer);
                    window.chatManager.conversationPollTimer = null;
                }
                window.chatManager.activeFriend = null;
            }

            // Always return to the actual conversation list after leaving a chat.
            if (typeof window.switchTab === 'function') {
                window.switchTab('chats');
            } else if (typeof window.loadChatsList === 'function') {
                window.loadChatsList();
            }
        }
        window.closeActiveChat = closeActiveChat;

        window.activeFriendId = null;

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
                const lastSeen = window.friendsCache && window.friendsCache[id] ? window.friendsCache[id].last_seen : '';
                const presenceLabel = typeof window.formatPresenceLabel === 'function'
                    ? window.formatPresenceLabel(status, lastSeen)
                    : (status === 'online' ? 'Online' : 'Offline');
                statusEl.innerHTML = '<i class="fas fa-circle" style="font-size:8px;"></i> ' + presenceLabel;
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

            // 6. Delegate to ChatManager or fallback message fetcher
            if (!window.chatManager && typeof ChatManager === 'function') {
                try { window.chatManager = new ChatManager(); } catch (e) { console.error(e); }
            }

            if (window.chatManager && typeof window.chatManager.openConversation === 'function') {
                window.chatManager.openConversation(id, name, avatar, status);
            } else {
                loadMessagesFallback(id);
            }
        }
        window.openChatWith = openChatWith;
        window._openChatWithImpl = openChatWith;

        function startCall(type) {
            const friend = window.chatManager && window.chatManager.activeFriend;
            const peerId = (friend && friend.id) || window.activeFriendId;
            if (peerId && typeof window.startCallWith === 'function') {
                return window.startCallWith(
                    peerId,
                    friend ? friend.name : (document.getElementById('chatHeaderName')?.textContent || 'Friend'),
                    friend ? friend.avatar : 'assets/images/default-avatar.png',
                    type || 'voice'
                );
            }
            if (typeof window.showToast === 'function') window.showToast('Marka hore dooro qofka aad wacayso.', 'info');
        }
        window.startCall = startCall;

        async function loadMessagesFallback(friendId) {
            const container = document.getElementById('chatMessages');
            if (!container) return;
            container.innerHTML = '<div style="display:flex;justify-content:center;padding:40px;"><div class="spinner"></div></div>';
            try {
                const res = await fetch('api/messages/fetch.php?friend_id=' + friendId);
                const data = await res.json();
                if (window.chatManager && typeof window.chatManager.openConversation === 'function') {
                    window.chatManager.openConversation(friendId);
                    return;
                }
                if (!data.success || !data.data || data.data.length === 0) {
                    container.innerHTML = '<div class="empty-state" style="margin:auto;"><div class="empty-state-icon"><i class="fas fa-hand-wave"></i></div><div class="empty-state-title">Ku bilow fariin!</div><div class="empty-state-desc">U dir fariin qoraal ah si aad u bilowdo sheekada.</div></div>';
                    return;
                }
                container.innerHTML = '';
                data.data.forEach(msg => {
                    const isMine = (parseInt(msg.sender_id) === parseInt(window.CURRENT_USER ? window.CURRENT_USER.id : 0));
                    const row = document.createElement('div');
                    row.className = 'message-row ' + (isMine ? 'mine' : 'theirs');
                    row.id = 'msg-row-' + msg.id;
                    const isRead = (msg.is_read == 1);
                    const ticksHtml = isMine ? `<span class="bubble-ticks ${isRead ? 'read' : ''}">${isRead ? '✓✓' : (msg.is_delivered == 1 ? '✓✓' : '✓')}</span>` : '';
                    row.innerHTML = `<div class="message-bubble"><div class="bubble-text">${escapeHtml(msg.message || '')}</div><div class="bubble-meta"><span>${formatTime(msg.created_at)}</span>${ticksHtml}</div></div>`;
                    container.appendChild(row);
                });
                container.scrollTop = container.scrollHeight;
            } catch (err) {
                console.error('Fallback fetch error:', err);
                if (container) {
                    container.innerHTML = '<div class="empty-state"><div class="empty-state-desc">Cillad fariimaha soo qaadistooda ah.</div></div>';
                }
            }
        }
        window.loadMessagesFallback = loadMessagesFallback;

        async function sendChatMessage() {
            if (window.chatManager && typeof window.chatManager.sendMessage === 'function') {
                return window.chatManager.sendMessage();
            }
            const input = document.getElementById('chatInputField');
            if (!input) return;
            const text = input.value.trim();
            if (!text) return;
            const friendId = window.activeFriendId || (window.chatManager && window.chatManager.activeFriend ? window.chatManager.activeFriend.id : null);
            if (!friendId) {
                if (typeof showToast === 'function') showToast('Fadlan marka hore dooro qofka aad la hadleyso', 'info');
                return;
            }
            input.value = '';
            input.style.height = 'auto';

            try {
                const res = await fetch('api/messages/send.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        receiver_id: parseInt(friendId),
                        message: text,
                        message_type: 'text'
                    })
                });
                const data = await res.json();
                if (data.success && data.data) {
                    const container = document.getElementById('chatMessages');
                    if (container) {
                        const empty = container.querySelector('.empty-state');
                        if (empty) empty.remove();
                        const row = document.createElement('div');
                        row.className = 'message-row mine';
                        row.id = 'msg-row-' + data.data.id;
                        row.innerHTML = `<div class="message-bubble"><div class="bubble-text">${escapeHtml(data.data.message)}</div><div class="bubble-meta"><span>${formatTime(data.data.created_at || new Date())}</span><span class="bubble-ticks">✓</span></div></div>`;
                        container.appendChild(row);
                        container.scrollTop = container.scrollHeight;
                    }
                } else {
                    input.value = text;
                    if (typeof showToast === 'function') showToast(data.message || 'Fariinta ma dirmin', 'error');
                }
            } catch (err) {
                input.value = text;
                if (typeof showToast === 'function') showToast('Cillad xiriirka ah', 'error');
            }
        }
        window.sendChatMessage = sendChatMessage;

        function switchTab(tab) {
            if (window._switchTabImpl) return window._switchTabImpl(tab);
            document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => {
                el.classList.toggle('active', el.getAttribute('data-tab') === tab);
            });
            if (window.loadChatsList && tab === 'chats') window.loadChatsList();
            if (window.loadFriendsList && tab === 'friends') window.loadFriendsList();
            if (window.loadCallsList && tab === 'calls') window.loadCallsList();
            if (tab === 'profile') openProfileModal();
            if (tab === 'settings') openSettingsModal();
        }
        function toggleAppTheme() {
            if (window._toggleThemeImpl) return window._toggleThemeImpl();
            document.documentElement.classList.toggle('dark');
        }
        function openProfileModal() {
            const m = document.getElementById('profileEditModal');
            if (m) m.classList.add('active');
        }
        function openSettingsModal() {
            const m = document.getElementById('settingsModal');
            if (m) m.classList.add('active');
        }
    </script>
</head>
<body>
    <div class="app-container">
        <!-- ============================================== -->
        <!-- 1. LEFT NAVIGATION RAIL (Desktop)             -->
        <!-- ============================================== -->
        <aside class="nav-rail">
            <div class="brand-badge" title="A/N Chat">
                <img src="assets/images/logo.png" alt="A/N Chat" onerror="this.onerror=null; this.src='assets/images/logo.jpg';">
            </div>

            <nav class="nav-rail-menu">
                <button class="nav-item active" data-tab="chats" title="Chats" onclick="switchTab('chats')" style="position:relative;">
                    <i class="fas fa-comment-dots"></i>
                    <span class="badge chats-badge" style="display:none;position:absolute;top:4px;right:6px;min-width:18px;height:18px;font-size:11px;padding:0 4px;">0</span>
                </button>
                <button class="nav-item" data-tab="friends" title="Friends" onclick="switchTab('friends')">
                    <i class="fas fa-user-friends"></i>
                </button>
                <button class="nav-item" data-tab="calls" title="Calls" onclick="switchTab('calls')">
                    <i class="fas fa-phone-alt"></i>
                </button>
                <button class="nav-item" data-tab="notifications" title="Notifications" onclick="switchTab('notifications')">
                    <i class="fas fa-bell"></i>
                    <span class="badge notif-badge" style="display:none;">0</span>
                </button>
            </nav>

            <div class="nav-rail-bottom">
                <button class="nav-item" id="btnToggleTheme" title="Toggle Light/Dark Theme" onclick="toggleAppTheme()">
                    <i class="fas fa-moon"></i>
                </button>
                <button class="nav-item" data-tab="profile" title="Profile" onclick="openProfileModal()">
                    <div class="avatar avatar-sm">
                        <img src="<?= htmlspecialchars($userAvatar) ?>" alt="<?= htmlspecialchars($currentUser['fullname']) ?>" onerror="this.src='assets/images/default-avatar.png'">
                    </div>
                </button>
                <button class="nav-item" data-tab="settings" title="Settings" onclick="openSettingsModal()">
                    <i class="fas fa-cog"></i>
                </button>
                <?php if (!empty($currentUser['is_admin'])): ?>
                <a href="admin.php" class="nav-item" title="Admin Portal" style="color:var(--primary);">
                    <i class="fas fa-shield-alt"></i>
                </a>
                <?php endif; ?>
                <a href="logout.php" class="nav-item" title="Logout" style="color:var(--danger);">
                    <i class="fas fa-sign-out-alt"></i>
                </a>
            </div>
        </aside>

        <!-- ============================================== -->
        <!-- 2. MIDDLE LIST PANEL (Chats, Friends, Calls)   -->
        <!-- ============================================== -->
        <section class="middle-panel">
            <div class="middle-header">
                <h2 class="middle-title" id="middlePanelTitle">Chats</h2>
                <div style="display:flex;align-items:center;gap:6px;">
                    <button type="button" class="btn-icon" id="btnRefreshList" title="Refresh application" aria-label="Refresh application" onclick="window.location.reload()">
                        <i class="fas fa-redo-alt" style="font-size:14px;"></i>
                    </button>
                    <button class="btn-icon" title="New Chat / Find Friend" onclick="switchTab('friends')">
                        <i class="fas fa-user-plus" style="font-size:14px;"></i>
                    </button>
                    <button type="button" class="btn-icon" data-theme-toggle title="Toggle Light/Dark Theme" aria-label="Toggle Light/Dark Theme" onclick="toggleAppTheme()">
                        <i class="fas fa-moon" style="font-size:14px;"></i>
                    </button>
                    <a class="btn-icon" href="logout.php" title="Logout" aria-label="Logout" style="color:var(--danger);">
                        <i class="fas fa-sign-out-alt" style="font-size:14px;"></i>
                    </a>
                </div>
            </div>

            <div class="search-box-container">
                <div class="search-input-wrap">
                    <i class="fas fa-search"></i>
                    <input type="text" id="middleSearchInput" placeholder="Search chats or phone..." autocomplete="off">
                </div>
            </div>

            <div class="list-container" id="middleListContainer">
                <?php if (empty($initialFriends)): ?>
                    <div class="empty-state">
                        <div class="empty-state-icon"><i class="fas fa-comments"></i></div>
                        <div class="empty-state-title">No chats yet</div>
                        <div class="empty-state-desc">You don't have any chats yet. Search for friends by phone number to start chatting.</div>
                        <button class="btn btn-primary btn-sm" onclick="switchTab('friends')">Find Friends</button>
                    </div>
                <?php else: ?>
                    <?php foreach ($initialFriends as $f): 
                        $fid = (int)$f['id'];
                        $fAvatar = !empty($f['profile_image']) ? 
                            (str_starts_with($f['profile_image'], 'http') || str_starts_with($f['profile_image'], 'assets/') || str_starts_with($f['profile_image'], 'uploads/') 
                                ? $f['profile_image'] 
                                : 'uploads/images/' . $f['profile_image']) : 
                            'assets/images/default-avatar.png';
                        $fUnread = (int)($f['unread_count'] ?? 0);
                        $preview = $f['last_message'] ?: 'Start chatting...';
                        if (($f['last_message_type'] ?? '') === 'image') $preview = '📷 Photo';
                        if (($f['last_message_type'] ?? '') === 'video') $preview = '🎥 Video';
                        if (($f['last_message_type'] ?? '') === 'voice') $preview = '🎤 Voice message';
                        if (($f['last_message_type'] ?? '') === 'document') $preview = '📄 Document';
                        $timeStr = !empty($f['last_message_time']) ? date('M j, H:i', strtotime($f['last_message_time'])) : '';
                    ?>
                    <div class="list-item" id="chat-item-<?= $fid ?>" onclick="openChatWith(<?= $fid ?>, '<?= addslashes(htmlspecialchars($f['fullname'])) ?>', '<?= addslashes(htmlspecialchars($fAvatar)) ?>', '<?= addslashes(htmlspecialchars($f['status'] ?? 'offline')) ?>')" style="cursor:pointer;">
                        <div class="avatar avatar-md">
                            <img src="<?= htmlspecialchars($fAvatar) ?>" alt="<?= htmlspecialchars($f['fullname']) ?>" onerror="this.src='assets/images/default-avatar.png'">
                            <span class="status-dot <?= htmlspecialchars($f['status'] ?? 'offline') ?>" id="status-dot-<?= $fid ?>"></span>
                        </div>
                        <div class="list-item-content">
                            <div class="list-item-top">
                                <span class="list-item-name"><?= htmlspecialchars($f['fullname']) ?></span>
                                <span class="list-item-time"><?= htmlspecialchars($timeStr) ?></span>
                            </div>
                            <div class="list-item-bottom">
                                <span class="list-item-preview <?= $fUnread > 0 ? 'unread' : '' ?>"><?= htmlspecialchars($preview) ?></span>
                                <?php if ($fUnread > 0): ?>
                                    <span class="badge"><?= $fUnread ?></span>
                                <?php endif; ?>
                            </div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>
        </section>

        <!-- ============================================== -->
        <!-- 3. MAIN STAGE (Conversation / Welcome)         -->
        <!-- ============================================== -->
        <main class="main-stage">
            <!-- Empty / Welcome state -->
            <div id="chatEmptyState" class="empty-state" style="margin:auto;max-width:440px;">
                <img src="assets/images/logo.png" alt="A/N Chat" onerror="this.onerror=null; this.src='assets/images/logo.jpg';" style="width:96px;height:96px;border-radius:40px;object-fit:cover;border:3px solid #ffffff;box-shadow:var(--shadow);margin-bottom:12px;">
                <h1 style="font-size:26px;font-weight:800;color:var(--primary);">A/N Chat</h1>
                <p style="font-size:14px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Connect. Chat. Call. Share.</p>
                <div class="empty-state-desc">Select a friend from the left sidebar or search a phone number to start instant real-time messaging, voice, or video calling.</div>
                <button class="btn btn-primary btn-sm" style="margin-top:14px;" onclick="switchTab('friends')">
                    <i class="fas fa-search"></i> Find Friends by Phone
                </button>
            </div>

            <!-- Active Conversation Container -->
            <div id="activeChatView" class="chat-view" style="display:none;">
                <!-- Chat Header -->
                <header class="chat-header">
                    <div class="chat-header-user">
                        <button class="btn-icon chat-back-btn" id="chatBackBtn" title="Back to Chats" onclick="closeActiveChat()">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        <button type="button" class="avatar avatar-md chat-profile-trigger" aria-label="View contact profile" onclick="openContactProfile()">
                            <img id="chatHeaderAvatar" src="assets/images/default-avatar.png" alt="Friend" onerror="this.src='assets/images/default-avatar.png'">
                            <span class="status-dot offline" id="chatHeaderStatusDot" aria-label="Offline"></span>
                        </button>
                        <div class="chat-header-info chat-profile-trigger" role="button" tabindex="0" onclick="openContactProfile()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openContactProfile();}">
                            <span class="chat-header-name" id="chatHeaderName">Conversation</span>
                            <span class="chat-header-status offline" id="chatHeaderStatus">
                                <i class="fas fa-circle" style="font-size:8px;"></i> Offline
                            </span>
                        </div>
                    </div>

                    <div class="chat-header-actions">
                        <button type="button" class="btn-icon" id="btnStartVoiceCall" title="Start Voice Call" aria-label="Start voice call" onclick="if (typeof window.startCall === 'function') window.startCall('voice');">
                            <i class="fas fa-phone-alt"></i>
                        </button>
                        <button type="button" class="btn-icon" id="btnStartVideoCall" title="Start Video Call" aria-label="Start video call" onclick="if (typeof window.startCall === 'function') window.startCall('video');">
                            <i class="fas fa-video"></i>
                        </button>
                        <div style="position:relative;">
                            <button class="btn-icon" id="btnChatMoreMenu" title="More options" onclick="toggleChatMoreMenu()">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <!-- Dropdown options -->
                            <div id="chatMoreDropdown" class="attachment-popover" style="right:0;left:auto;top:44px;bottom:auto;">
                                <div class="attachment-item" id="chatBlockMenuItem" onclick="openBlockModal()"><i class="fas fa-ban" style="color:var(--danger);"></i> <span id="chatBlockMenuLabel">Block User</span></div>
                                <div class="attachment-item" onclick="openReportModal()"><i class="fas fa-flag" style="color:var(--warning);"></i> Report User</div>
                            </div>
                        </div>
                    </div>
                </header>

                <!-- Scrollable Messages Area -->
                <div class="chat-messages" id="chatMessages">
                    <!-- Appended dynamically -->
                </div>

                <!-- Reply Preview Bar -->
                <div class="reply-preview-bar" id="replyPreviewBar">
                    <div class="reply-preview-content">
                        <div class="reply-preview-title" id="replySenderName">Reply to User</div>
                        <div class="reply-preview-body" id="replyBodyText">Message text...</div>
                    </div>
                    <button class="btn-icon btn-sm" id="btnCloseReply" title="Cancel reply">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- Voice Recording Bar Overlay -->
                <div class="recording-bar" id="recordingBar">
                    <div class="recording-toolbar">
                        <div class="recording-indicator" id="recordingIndicator">
                            <div class="recording-dot"></div>
                            <span>Recording <span id="recordingTimer">00:00</span></span>
                        </div>
                        <div class="recording-waveform" id="recordingWaveform" role="img" aria-label="Live audio level"></div>
                        <div class="recording-actions">
                            <button class="btn btn-outline btn-sm" id="btnCancelRecord"><i class="fas fa-trash"></i> Cancel</button>
                            <button class="btn btn-primary btn-sm" id="btnSendRecord"><i class="fas fa-stop"></i> Finish &amp; Listen</button>
                        </div>
                    </div>
                    <div class="recording-preview" id="recordingPreview" hidden>
                        <audio id="recordingPreviewAudio" controls preload="metadata"></audio>
                    </div>
                </div>

                <!-- Bottom Input Bar -->
                <footer class="chat-input-bar">
                    <div class="message-composer">
                        <textarea id="chatInputField" class="chat-input-field" placeholder="Type a message..." rows="1" onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); sendChatMessage(); }"></textarea>
                        <div class="message-composer-tools">
                            <div class="message-composer-left-tools">
                                <div class="composer-emoji-wrap">
                                    <button type="button" class="composer-tool-btn" id="btnEmojiToggle" title="Emojis" onclick="toggleEmojiPicker(this)"><i class="far fa-smile"></i></button>
                                    <div id="emojiPickerPopover" class="attachment-popover emoji-popover">
                                        <span class="reaction-opt" onclick="insertEmoji('😊')">😊</span>
                                        <span class="reaction-opt" onclick="insertEmoji('👋')">👋</span>
                                        <span class="reaction-opt" onclick="insertEmoji('❤️')">❤️</span>
                                        <span class="reaction-opt" onclick="insertEmoji('😂')">😂</span>
                                        <span class="reaction-opt" onclick="insertEmoji('👍')">👍</span>
                                        <span class="reaction-opt" onclick="insertEmoji('🔥')">🔥</span>
                                        <span class="reaction-opt" onclick="insertEmoji('😍')">😍</span>
                                        <span class="reaction-opt" onclick="insertEmoji('🎉')">🎉</span>
                                        <span class="reaction-opt" onclick="insertEmoji('🙏')">🙏</span>
                                        <span class="reaction-opt" onclick="insertEmoji('😢')">😢</span>
                                        <span class="reaction-opt" onclick="insertEmoji('😎')">😎</span>
                                        <span class="reaction-opt" onclick="insertEmoji('✨')">✨</span>
                                        <span class="reaction-opt" onclick="insertEmoji('👏')">👏</span>
                                        <span class="reaction-opt" onclick="insertEmoji('💯')">💯</span>
                                        <span class="reaction-opt" onclick="insertEmoji('🤝')">🤝</span>
                                        <span class="reaction-opt" onclick="insertEmoji('🌹')">🌹</span>
                                    </div>
                                </div>
                                <div class="composer-attachment-wrap">
                                    <button type="button" class="composer-tool-btn" id="btnAttachmentToggle" title="Attach file"><i class="fas fa-paperclip"></i></button>
                                    <div class="attachment-popover" id="attachmentPopover">
                                        <label class="attachment-item" for="attachImageInput"><i class="fas fa-image" style="color:#E91E63;"></i> Photos & Images</label>
                                        <label class="attachment-item" for="attachVideoInput"><i class="fas fa-video" style="color:#9C27B0;"></i> Video File</label>
                                        <label class="attachment-item" for="attachDocInput"><i class="fas fa-file-alt" style="color:#2196F3;"></i> Document (PDF, DOC)</label>
                                        <input type="file" id="attachImageInput" accept="image/*" style="display:none;">
                                        <input type="file" id="attachVideoInput" accept="video/*" style="display:none;">
                                        <input type="file" id="attachDocInput" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" style="display:none;">
                                    </div>
                                </div>
                            </div>
                            <div class="message-composer-right-tools">
                                <button type="button" class="composer-tool-btn composer-voice-btn" id="btnVoiceRecord" title="Record Voice Message"><i class="fas fa-microphone"></i></button>
                                <button type="button" class="send-btn" id="btnSendMessage" title="Send Message" aria-label="Send message" onclick="sendChatMessage();"><i class="fas fa-arrow-up"></i></button>
                            </div>
                        </div>
                    </div>
                </footer>
            </div>
        </main>

        <!-- ============================================== -->
        <!-- 4. BOTTOM MOBILE NAVIGATION                   -->
        <!-- ============================================== -->
        <nav class="bottom-nav">
            <button class="bottom-nav-item active" data-tab="chats" onclick="switchTab('chats')" style="position:relative;">
                <i class="fas fa-comment-dots"></i>
                <span>Chats</span>
                <span class="badge chats-badge" style="display:none;position:absolute;top:3px;right:calc(50% - 18px);min-width:16px;height:16px;font-size:10px;padding:0 3px;">0</span>
            </button>
            <button class="bottom-nav-item" data-tab="friends" onclick="switchTab('friends')">
                <i class="fas fa-user-friends"></i>
                <span>Friends</span>
            </button>
            <button class="bottom-nav-item" data-tab="calls" onclick="switchTab('calls')">
                <i class="fas fa-phone-alt"></i>
                <span>Calls</span>
            </button>
            <button class="bottom-nav-item" data-tab="notifications" onclick="switchTab('notifications')">
                <i class="fas fa-bell"></i>
                <span>Alerts</span>
                <span class="badge notif-badge" style="display:none;">0</span>
            </button>
            <button class="bottom-nav-item" data-tab="profile" onclick="openProfileModal()">
                <i class="fas fa-user"></i>
                <span>Profile</span>
            </button>
        </nav>

        <!-- Floating Bouncing PWA Install Button -->
        <div id="pwaFloatingInstallContainer" class="pwa-floating-install-container" style="display:none;">
            <button id="pwaFloatingInstallBtn" class="pwa-bouncing-btn" title="Install A/N Chat on your device" aria-label="Install App">
                <i class="fas fa-download"></i>
                <span>Install App</span>
            </button>
        </div>
    </div>

    <!-- ============================================== -->
    <!-- 5. WEBRTC CALL OVERLAY MODAL (Voice & Video)   -->
    <!-- ============================================== -->
    <div class="call-modal-overlay" id="callModalOverlay">
        <!-- Remote Audio Stream Player for Voice Calls -->
        <audio id="remoteAudio" autoplay playsinline style="position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0.001;pointer-events:none;"></audio>

        <!-- A. Incoming Call Screen -->
        <div class="incoming-call-box" id="incomingCallBox" style="display:none;">
            <div class="incoming-call-avatar">
                <img id="incomingCallerAvatar" src="assets/images/default-avatar.png" alt="Caller" onerror="this.onerror=null;this.src='assets/images/default-avatar.png'">
            </div>
            <div>
                <div class="incoming-call-name" id="incomingCallerName">Caller Name</div>
                <div class="incoming-call-type" id="incomingCallType">Incoming Call...</div>
            </div>
            <div class="incoming-actions">
                <div class="call-btn-action">
                    <button class="call-btn-circle decline" id="btnDeclineCall" title="Decline">
                        <i class="fas fa-phone-slash"></i>
                    </button>
                    <span style="font-size:12px;color:rgba(255,255,255,0.8);">Decline</span>
                </div>
                <div class="call-btn-action">
                    <button type="button" class="call-btn-circle accept" id="btnAcceptCall" title="Accept" aria-label="Accept call" onclick="if (typeof window.acceptIncomingCall === 'function') window.acceptIncomingCall();">
                        <i class="fas fa-phone"></i>
                    </button>
                    <span style="font-size:12px;color:rgba(255,255,255,0.8);">Accept</span>
                </div>
            </div>
        </div>

        <!-- B. Active Voice Call Screen -->
        <div class="active-voice-box" id="activeVoiceBox" style="display:none;">
            <div class="incoming-call-avatar" style="width:140px;height:140px;">
                <img id="voiceCallPeerAvatar" src="assets/images/default-avatar.png" alt="Peer" onerror="this.onerror=null;this.src='assets/images/default-avatar.png'">
            </div>
            <div style="font-size:24px;font-weight:700;" id="voiceCallPeerName">Anas Abdiwahid</div>
            <div class="call-timer" id="callTimerDisplay" style="display:none;">00:00</div>
            <div style="font-size:15px;color:rgba(255,255,255,0.85);font-weight:600;" id="voiceCallStatusText">Calling...</div>

            <div class="active-call-controls">
                <button class="control-btn" id="btnToggleVoiceMute" title="Mute Microphone">
                    <i class="fas fa-microphone"></i>
                </button>
                <button class="call-btn-circle end" id="btnEndVoiceCall" title="End Call">
                    <i class="fas fa-phone-slash"></i>
                </button>
            </div>
        </div>

        <!-- C. Active Video Call Screen -->
        <div class="active-video-container" id="activeVideoBox" style="display:none;">
            <video id="remoteVideo" autoplay playsinline muted webkit-playsinline></video>
            <div class="pip-video-box">
                <video id="localVideo" autoplay playsinline muted></video>
            </div>
            <div class="video-controls-bar">
                <span id="videoCallTimer" style="font-size:14px;font-weight:600;color:var(--primary);margin-right:8px;">00:00</span>
                <button class="control-btn" id="btnToggleVideoAudio" title="Toggle Mic">
                    <i class="fas fa-microphone"></i>
                </button>
                <button class="control-btn" id="btnToggleVideoCam" title="Toggle Camera">
                    <i class="fas fa-video"></i>
                </button>
                <button class="call-btn-circle end" id="btnEndVideoCall" title="End Call" style="width:48px;height:48px;font-size:18px;">
                    <i class="fas fa-phone-slash"></i>
                </button>
            </div>
        </div>
    </div>

    <!-- ============================================== -->
    <!-- 6. MODALS                                      -->
    <!-- ============================================== -->
    <!-- Image Preview Modal Before Sending -->
    <div class="modal-overlay" id="imagePreviewModal">
        <div class="modal-card" style="max-width:420px;">
            <div class="modal-header">
                <h3>Preview Image</h3>
            </div>
            <div class="modal-body" style="text-align:center;">
                <img id="previewModalImg" src="" alt="Preview" style="max-height:300px;margin:0 auto;border-radius:var(--radius-md);">
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline btn-sm" id="previewCancelBtn">Cancel</button>
                <button class="btn btn-primary btn-sm" id="previewSendBtn"><i class="fas fa-paper-plane"></i> Send Photo</button>
            </div>
        </div>
    </div>

    <!-- Delete Message Modal -->
    <div class="modal-overlay" id="deleteMessageModal">
        <div class="modal-card" style="max-width:380px;">
            <div class="modal-header">
                <h3>Delete Message?</h3>
            </div>
            <div class="modal-body">
                Are you sure you want to delete this message?
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline btn-sm" id="btnCancelDelete">Cancel</button>
                <button class="btn btn-secondary btn-sm" id="btnDeleteForMe">Delete for me</button>
                <button class="btn btn-danger btn-sm" id="btnDeleteForEveryone">Delete for everyone</button>
            </div>
        </div>
    </div>

    <!-- Contact Profile Modal -->
    <div class="modal-overlay" id="contactProfileModal" onclick="if(event.target===this)this.classList.remove('active')">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="contactProfileName">
            <div class="modal-header">
                <h3>Contact profile</h3>
                <button type="button" class="btn-icon btn-sm" aria-label="Close" onclick="document.getElementById('contactProfileModal').classList.remove('active')"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body" style="text-align:center;padding:26px 22px;">
                <img id="contactProfileAvatar" src="assets/images/default-avatar.png" alt="Contact photo" style="width:104px;height:104px;border-radius:50%;object-fit:cover;border:3px solid var(--primary);">
                <h2 id="contactProfileName" style="margin:14px 0 18px;color:var(--text-primary);"></h2>
                <div style="color:var(--text-secondary);"><i class="fas fa-phone-alt" style="margin-right:8px;color:var(--primary);"></i><span id="contactProfilePhone"></span></div>
            </div>
        </div>
    </div>

    <!-- Edit Profile Modal -->
    <div class="modal-overlay" id="profileEditModal">
        <div class="modal-card">
            <div class="modal-header">
                <h3>My Profile</h3>
                <button class="btn-icon btn-sm" id="btnCloseProfileModal"><i class="fas fa-times"></i></button>
            </div>
            <form id="profileEditForm" enctype="multipart/form-data">
                <div class="modal-body">
                    <div class="avatar-upload-box">
                        <label for="editAvatarInput" class="avatar-upload-preview" title="Click to change photo">
                            <img src="<?= htmlspecialchars($userAvatar) ?>" id="editAvatarPreviewImg" alt="Avatar" onerror="this.src='assets/images/default-avatar.png'">
                            <span style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.5);color:#fff;font-size:11px;padding:3px 0;text-align:center;"><i class="fas fa-camera"></i></span>
                        </label>
                        <span class="avatar-upload-hint">Click to change photo</span>
                        <input type="file" id="editAvatarInput" name="profile_image" accept="image/*" style="display:none;" onchange="
                            if (this.files[0]) {
                                const r = new FileReader();
                                r.onload = (e) => document.getElementById('editAvatarPreviewImg').src = e.target.result;
                                r.readAsDataURL(this.files[0]);
                            }
                        ">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Phone Number (Cannot be changed)</label>
                        <input type="text" class="form-control" value="<?= htmlspecialchars($currentUser['phone']) ?>" disabled>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Full Name</label>
                        <input type="text" name="fullname" class="form-control" value="<?= htmlspecialchars($currentUser['fullname']) ?>" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Bio / Status</label>
                        <input type="text" name="bio" class="form-control" value="<?= htmlspecialchars($currentUser['bio'] ?? '') ?>" placeholder="Hey there! I am using A/N Chat.">
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save Changes</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Settings Modal -->
    <div class="modal-overlay" id="settingsModal">
        <div class="modal-card">
            <div class="modal-header">
                <h3>Settings</h3>
                <button class="btn-icon btn-sm" onclick="document.getElementById('settingsModal').classList.remove('active')"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
                    <div>
                        <div style="font-weight:600;color:var(--text-primary);">Theme Preference</div>
                        <div style="font-size:12px;color:var(--text-secondary);">Toggle between Modern Pink Light and Dark mode</div>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('btnToggleTheme').click()">Switch Theme</button>
                </div>

                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
                    <div>
                        <div style="font-weight:600;color:var(--text-primary);">PWA Application</div>
                        <div style="font-size:12px;color:var(--text-secondary);">Install A/N Chat to home screen</div>
                    </div>
                    <button class="btn btn-outline btn-sm" id="btnInstallApp" style="display:none;"><i class="fas fa-mobile-alt"></i> Install</button>
                </div>

                <div style="padding:14px 0;">
                    <div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">About A/N Chat</div>
                    <div style="font-size:12px;color:var(--text-secondary);">Version <?= APP_VERSION ?> • Built with WebRTC, WebSocket, PHP & MySQL.</div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-primary btn-sm" onclick="document.getElementById('settingsModal').classList.remove('active')">Close</button>
            </div>
        </div>
    </div>

    <!-- Block Modal -->
    <div class="modal-overlay" id="blockUserModal">
        <div class="modal-card" style="max-width:380px;">
            <div class="modal-header">
                <h3 id="blockUserModalTitle">Block User?</h3>
            </div>
            <div class="modal-body">
                <span id="blockUserModalText">Blocked users cannot send you messages, friend requests, or initiate calls.</span>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline btn-sm" onclick="document.getElementById('blockUserModal').classList.remove('active')">Cancel</button>
                <button class="btn btn-danger btn-sm" id="btnConfirmBlock">Block</button>
            </div>
        </div>
    </div>

    <!-- Report Modal -->
    <div class="modal-overlay" id="reportUserModal">
        <div class="modal-card">
            <div class="modal-header">
                <h3>Report User</h3>
                <button class="btn-icon btn-sm" onclick="document.getElementById('reportUserModal').classList.remove('active')"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                <p style="margin-bottom:14px;">Please select the reason for reporting this user:</p>
                <div style="display:flex;flex-direction:column;gap:10px;">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="report_reason" value="Spam" checked> Spam</label>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="report_reason" value="Harassment"> Harassment</label>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="report_reason" value="Fake account"> Fake account</label>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="report_reason" value="Inappropriate content"> Inappropriate content</label>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="report_reason" value="Other"> Other</label>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline btn-sm" onclick="document.getElementById('reportUserModal').classList.remove('active')">Cancel</button>
                <button class="btn btn-danger btn-sm" id="btnConfirmReport">Submit Report</button>
            </div>
        </div>
    </div>

    <!-- Toast Notification Container -->
    <div id="toast-container"></div>

    <!-- Global Application State -->
    <script>
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

        window.CURRENT_USER = <?= json_encode([
            'id' => (int)$currentUser['id'],
            'fullname' => $currentUser['fullname'],
            'phone' => $currentUser['phone'],
            'profile_image' => $userAvatar,
            'is_admin' => (int)($currentUser['is_admin'] ?? 0),
            'theme' => $currentUser['theme'] ?? 'light'
        ], JSON_UNESCAPED_SLASHES) ?>;

        // ICE/TURN configuration comes from config/config.php. Add TURN
        // credentials there to relay media on restrictive mobile networks.
        window.WEBRTC_ICE_SERVERS = <?= json_encode(ICE_SERVERS, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
        // Metered credential-scoped API keys are designed for client-side use.
        // Never put a Metered account Secret Key in this page.
        window.METERED_APP_NAME = <?= json_encode(METERED_APP_NAME, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
        window.METERED_TURN_API_KEY = <?= json_encode(METERED_TURN_API_KEY, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;

        window.SYSTEM_SETTINGS = {
            screenshot_detection: <?= json_encode($screenshotSetting) ?>
        };

        window.initialFriendsData = <?= json_encode($initialFriends, JSON_UNESCAPED_SLASHES) ?>;
        if (Array.isArray(window.initialFriendsData)) {
            window.friendsCache = window.friendsCache || {};
            window.initialFriendsData.forEach(f => {
                window.friendsCache[parseInt(f.id)] = f;
            });
        }

        function toggleEmojiPicker(btn) {
            if (window.event) window.event.stopPropagation();
            const p = document.getElementById('emojiPickerPopover');
            const attachP = document.getElementById('attachmentPopover');
            if (attachP) attachP.classList.remove('active');
            if (p) {
                p.classList.toggle('active');
            }
        }

        function insertEmoji(char) {
            const input = document.getElementById('chatInputField');
            if (input) {
                input.value += char;
                input.focus();
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const p = document.getElementById('emojiPickerPopover');
            if (p) {
                p.classList.remove('active');
            }
        }

        // Close popovers on outside click
        document.addEventListener('click', (e) => {
            const emojiP = document.getElementById('emojiPickerPopover');
            if (emojiP && !emojiP.contains(e.target) && !e.target.closest('#btnEmojiToggle')) {
                emojiP.classList.remove('active');
            }
            const attachP = document.getElementById('attachmentPopover');
            if (attachP && !attachP.contains(e.target) && !e.target.closest('#btnAttachmentToggle')) {
                attachP.classList.remove('active');
            }
        });

        window.activeChatUserBlocked = false;
        async function toggleChatMoreMenu() {
            const dropdown = document.getElementById('chatMoreDropdown');
            if (!dropdown) return;
            const opening = !dropdown.classList.contains('active');
            dropdown.classList.toggle('active');
            if (!opening) return;
            const userId = window.activeFriendId || (window.chatManager && window.chatManager.activeFriend && window.chatManager.activeFriend.id);
            if (!userId) return;
            try {
                const response = await fetch(`api/users/profile.php?id=${encodeURIComponent(userId)}`, { cache: 'no-store' });
                const result = await response.json();
                if (!response.ok || !result.success) throw new Error(result.message || 'Could not load block status.');
                window.activeChatUserBlocked = !!(result.data && result.data.is_blocked);
                const label = document.getElementById('chatBlockMenuLabel');
                const icon = document.querySelector('#chatBlockMenuItem i');
                if (label) label.textContent = window.activeChatUserBlocked ? 'Unblock User' : 'Block User';
                if (icon) icon.className = window.activeChatUserBlocked ? 'fas fa-unlock' : 'fas fa-ban';
            } catch (error) {
                console.error('[Block status]', error);
            }
        }

        function openBlockModal() {
            document.getElementById('chatMoreDropdown')?.classList.remove('active');
            const m = document.getElementById('blockUserModal');
            const blocked = !!window.activeChatUserBlocked;
            const title = document.getElementById('blockUserModalTitle');
            const text = document.getElementById('blockUserModalText');
            const confirm = document.getElementById('btnConfirmBlock');
            if (title) title.textContent = blocked ? 'Unblock User?' : 'Block User?';
            if (text) text.textContent = blocked
                ? 'This user will be able to send you messages, friend requests, and calls again.'
                : 'Blocked users cannot send you messages, friend requests, or initiate calls.';
            if (confirm) {
                confirm.textContent = blocked ? 'Unblock' : 'Block';
                confirm.classList.toggle('btn-danger', !blocked);
                confirm.classList.toggle('btn-primary', blocked);
                confirm.onclick = async () => {
                    const targetId = window.activeFriendId || (window.chatManager && window.chatManager.activeFriend && window.chatManager.activeFriend.id);
                    if (!targetId) return;
                    confirm.disabled = true;
                    try {
                        const action = blocked ? 'unblock' : 'block';
                        const res = await fetch('api/users/block.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ target_id: targetId, action })
                        });
                        const data = await res.json();
                        showToast(data.message, data.success ? 'success' : 'error');
                        if (data.success) {
                            window.activeChatUserBlocked = !blocked;
                            const label = document.getElementById('chatBlockMenuLabel');
                            if (label) label.textContent = window.activeChatUserBlocked ? 'Unblock User' : 'Block User';
                            m?.classList.remove('active');
                        }
                    } catch (error) {
                        showToast('Could not update block status. Please try again.', 'error');
                    } finally {
                        confirm.disabled = false;
                    }
                };
            }
            if (m) m.classList.add('active');
        }

        function openReportModal() {
            document.getElementById('chatMoreDropdown').classList.remove('active');
            const m = document.getElementById('reportUserModal');
            if (m) m.classList.add('active');
            document.getElementById('btnConfirmReport').onclick = async () => {
                if (window.chatManager && window.chatManager.activeFriend) {
                    const checked = document.querySelector('input[name="report_reason"]:checked')?.value || 'Other';
                    const res = await fetch('api/users/report.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ target_id: window.chatManager.activeFriend.id, reason: checked, details: '' })
                    });
                    const data = await res.json();
                    showToast(data.message, data.success ? 'success' : 'error');
                    m.classList.remove('active');
                }
            };
        }
    </script>

    <!-- Application Scripts with Cache Busting -->
    <script src="assets/js/auth.js?v=<?= @filemtime(__DIR__ . '/assets/js/auth.js') ?: time() ?>"></script>
    <script src="assets/js/pwa.js?v=<?= @filemtime(__DIR__ . '/assets/js/pwa.js') ?: time() ?>"></script>
    <script src="assets/js/upload.js?v=<?= @filemtime(__DIR__ . '/assets/js/upload.js') ?: time() ?>"></script>
    <script src="assets/js/recorder.js?v=<?= @filemtime(__DIR__ . '/assets/js/recorder.js') ?: time() ?>"></script>
    <script src="assets/js/webrtc.js?v=<?= @filemtime(__DIR__ . '/assets/js/webrtc.js') ?: time() ?>"></script>
    <script src="assets/js/calls.js?v=<?= @filemtime(__DIR__ . '/assets/js/calls.js') ?: time() ?>"></script>
    <script src="assets/js/friends.js?v=<?= @filemtime(__DIR__ . '/assets/js/friends.js') ?: time() ?>"></script>
    <script src="assets/js/notifications.js?v=<?= @filemtime(__DIR__ . '/assets/js/notifications.js') ?>"></script>
    <script src="assets/js/messages.js?v=<?= @filemtime(__DIR__ . '/assets/js/messages.js') ?: time() ?>"></script>
    <script src="assets/js/privacy-shield.js?v=<?= @filemtime(__DIR__ . '/assets/js/privacy-shield.js') ?: time() ?>"></script>
    <script src="assets/js/app.js?v=<?= @filemtime(__DIR__ . '/assets/js/app.js') ?: time() ?>"></script>
</body>
</html>
