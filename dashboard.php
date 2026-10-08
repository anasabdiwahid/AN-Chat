<?php
// dashboard.php - Main Application Dashboard
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/models/User.php';

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

$userAvatar = $currentUser['profile_image'] ? 
    (str_starts_with($currentUser['profile_image'], 'http') ? $currentUser['profile_image'] : 'uploads/images/' . $currentUser['profile_image']) : 
    'assets/images/logo.png';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>A/N Chat — Connect. Chat. Call. Share.</title>
    <link rel="icon" type="image/png" href="assets/icons/favicon.png">
    <link rel="manifest" href="pwa/manifest.json">
    <meta name="theme-color" content="#E91E63">

    <!-- FontAwesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

    <!-- Stylesheets -->
    <link rel="stylesheet" href="assets/css/variables.css">
    <link rel="stylesheet" href="assets/css/reset.css">
    <link rel="stylesheet" href="assets/css/style.css">
    <link rel="stylesheet" href="assets/css/dashboard.css">
    <link rel="stylesheet" href="assets/css/chat.css">
    <link rel="stylesheet" href="assets/css/calls.css">
    <link rel="stylesheet" href="assets/css/responsive.css">
</head>
<body>
    <div class="app-container">
        <!-- ============================================== -->
        <!-- 1. LEFT NAVIGATION RAIL (Desktop)             -->
        <!-- ============================================== -->
        <aside class="nav-rail">
            <div class="brand-badge" title="A/N Chat">
                <img src="assets/images/logo.png" alt="A/N Chat">
            </div>

            <nav class="nav-rail-menu">
                <button class="nav-item active" data-tab="chats" title="Chats">
                    <i class="fas fa-comment-dots"></i>
                </button>
                <button class="nav-item" data-tab="friends" title="Friends">
                    <i class="fas fa-user-friends"></i>
                </button>
                <button class="nav-item" data-tab="calls" title="Calls">
                    <i class="fas fa-phone-alt"></i>
                </button>
                <button class="nav-item" data-tab="notifications" title="Notifications">
                    <i class="fas fa-bell"></i>
                    <span class="badge notif-badge" style="display:none;">0</span>
                </button>
            </nav>

            <div class="nav-rail-bottom">
                <button class="nav-item" id="btnToggleTheme" title="Toggle Light/Dark Theme">
                    <i class="fas fa-moon"></i>
                </button>
                <button class="nav-item" data-tab="profile" title="Profile">
                    <div class="avatar avatar-sm">
                        <img src="<?= htmlspecialchars($userAvatar) ?>" alt="<?= htmlspecialchars($currentUser['fullname']) ?>" onerror="this.src='assets/images/logo.png'">
                    </div>
                </button>
                <button class="nav-item" data-tab="settings" title="Settings">
                    <i class="fas fa-cog"></i>
                </button>
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
                    <button class="btn-icon" id="btnRefreshList" title="Refresh" onclick="loadChatsList()">
                        <i class="fas fa-redo-alt" style="font-size:14px;"></i>
                    </button>
                    <button class="btn-icon" title="New Chat / Find Friend" onclick="document.querySelector('[data-tab=friends]').click()">
                        <i class="fas fa-user-plus" style="font-size:14px;"></i>
                    </button>
                </div>
            </div>

            <div class="search-box-container">
                <div class="search-input-wrap">
                    <i class="fas fa-search"></i>
                    <input type="text" id="middleSearchInput" placeholder="Search chats or phone..." autocomplete="off">
                </div>
            </div>

            <div class="list-container" id="middleListContainer">
                <!-- Dynamically populated via JavaScript -->
            </div>
        </section>

        <!-- ============================================== -->
        <!-- 3. MAIN STAGE (Conversation / Welcome)         -->
        <!-- ============================================== -->
        <main class="main-stage">
            <!-- Empty / Welcome state -->
            <div id="chatEmptyState" class="empty-state" style="margin:auto;max-width:440px;">
                <img src="assets/images/logo.png" alt="A/N Chat" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid var(--primary);box-shadow:var(--shadow);margin-bottom:12px;">
                <h1 style="font-size:26px;font-weight:800;color:var(--primary);">A/N Chat</h1>
                <p style="font-size:14px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Connect. Chat. Call. Share.</p>
                <div class="empty-state-desc">Select a friend from the left sidebar or search a phone number to start instant real-time messaging, voice, or video calling.</div>
                <button class="btn btn-primary btn-sm" style="margin-top:14px;" onclick="document.querySelector('[data-tab=friends]').click()">
                    <i class="fas fa-search"></i> Find Friends by Phone
                </button>
            </div>

            <!-- Active Conversation Container -->
            <div id="activeChatView" class="chat-view" style="display:none;">
                <!-- Chat Header -->
                <header class="chat-header">
                    <div class="chat-header-user">
                        <button class="btn-icon chat-back-btn" id="chatBackBtn" title="Back to Chats">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        <div class="avatar avatar-md">
                            <img id="chatHeaderAvatar" src="assets/images/logo.png" alt="Friend" onerror="this.src='assets/images/logo.png'">
                        </div>
                        <div class="chat-header-info">
                            <span class="chat-header-name" id="chatHeaderName">Conversation</span>
                            <span class="chat-header-status offline" id="chatHeaderStatus">
                                <i class="fas fa-circle" style="font-size:8px;"></i> Offline
                            </span>
                        </div>
                    </div>

                    <div class="chat-header-actions">
                        <button class="btn-icon" id="btnStartVoiceCall" title="Start Voice Call" style="color:var(--primary);">
                            <i class="fas fa-phone-alt"></i>
                        </button>
                        <button class="btn-icon" id="btnStartVideoCall" title="Start Video Call" style="color:var(--primary);">
                            <i class="fas fa-video"></i>
                        </button>
                        <div style="position:relative;">
                            <button class="btn-icon" id="btnChatMoreMenu" title="More options" onclick="document.getElementById('chatMoreDropdown').classList.toggle('active')">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <!-- Dropdown options -->
                            <div id="chatMoreDropdown" class="attachment-popover" style="right:0;left:auto;top:44px;bottom:auto;">
                                <div class="attachment-item" onclick="openProfileModal()"><i class="fas fa-user"></i> View Profile</div>
                                <div class="attachment-item" onclick="openBlockModal()"><i class="fas fa-ban" style="color:var(--danger);"></i> Block User</div>
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
                    <div class="recording-indicator">
                        <div class="recording-dot"></div>
                        <span>Recording Voice Note... <span id="recordingTimer">00:00</span></span>
                    </div>
                    <div style="display:flex;gap:10px;">
                        <button class="btn btn-outline btn-sm" id="btnCancelRecord"><i class="fas fa-trash"></i> Cancel</button>
                        <button class="btn btn-primary btn-sm" id="btnSendRecord"><i class="fas fa-paper-plane"></i> Send Audio</button>
                    </div>
                </div>

                <!-- Bottom Input Bar -->
                <footer class="chat-input-bar">
                    <!-- Emojis & Quick reactions -->
                    <button class="btn-icon" id="btnEmojiToggle" title="Emojis" onclick="toggleEmojiPicker(this)">
                        <i class="far fa-smile" style="font-size:20px;"></i>
                    </button>

                    <!-- Attachment button & Popover -->
                    <div style="position:relative;">
                        <button class="btn-icon" id="btnAttachmentToggle" title="Attach file">
                            <i class="fas fa-paperclip" style="font-size:18px;"></i>
                        </button>
                        <div class="attachment-popover" id="attachmentPopover">
                            <label class="attachment-item" for="attachImageInput">
                                <i class="fas fa-image" style="color:#E91E63;"></i> Photos & Images
                            </label>
                            <label class="attachment-item" for="attachVideoInput">
                                <i class="fas fa-video" style="color:#9C27B0;"></i> Video File
                            </label>
                            <label class="attachment-item" for="attachDocInput">
                                <i class="fas fa-file-alt" style="color:#2196F3;"></i> Document (PDF, DOC)
                            </label>
                            <input type="file" id="attachImageInput" accept="image/*" style="display:none;">
                            <input type="file" id="attachVideoInput" accept="video/*" style="display:none;">
                            <input type="file" id="attachDocInput" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" style="display:none;">
                        </div>
                    </div>

                    <!-- Message Textarea -->
                    <textarea id="chatInputField" class="chat-input-field" placeholder="Type a message..." rows="1"></textarea>

                    <!-- Voice Record Mic -->
                    <button class="btn-icon" id="btnVoiceRecord" title="Record Voice Message" style="color:var(--primary);">
                        <i class="fas fa-microphone" style="font-size:19px;"></i>
                    </button>

                    <!-- Send Button (Pink) -->
                    <button class="send-btn" id="btnSendMessage" title="Send Message">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </footer>
            </div>
        </main>

        <!-- ============================================== -->
        <!-- 4. BOTTOM MOBILE NAVIGATION                   -->
        <!-- ============================================== -->
        <nav class="bottom-nav">
            <button class="bottom-nav-item active" data-tab="chats">
                <i class="fas fa-comment-dots"></i>
                <span>Chats</span>
            </button>
            <button class="bottom-nav-item" data-tab="friends">
                <i class="fas fa-user-friends"></i>
                <span>Friends</span>
            </button>
            <button class="bottom-nav-item" data-tab="calls">
                <i class="fas fa-phone-alt"></i>
                <span>Calls</span>
            </button>
            <button class="bottom-nav-item" data-tab="notifications">
                <i class="fas fa-bell"></i>
                <span>Alerts</span>
                <span class="badge notif-badge" style="display:none;">0</span>
            </button>
            <button class="bottom-nav-item" data-tab="profile">
                <i class="fas fa-user"></i>
                <span>Profile</span>
            </button>
        </nav>
    </div>

    <!-- ============================================== -->
    <!-- 5. WEBRTC CALL OVERLAY MODAL (Voice & Video)   -->
    <!-- ============================================== -->
    <div class="call-modal-overlay" id="callModalOverlay">
        <!-- A. Incoming Call Screen -->
        <div class="incoming-call-box" id="incomingCallBox" style="display:none;">
            <div class="incoming-call-avatar">
                <img id="incomingCallerAvatar" src="assets/images/logo.png" alt="Caller">
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
                    <button class="call-btn-circle accept" id="btnAcceptCall" title="Accept">
                        <i class="fas fa-phone"></i>
                    </button>
                    <span style="font-size:12px;color:rgba(255,255,255,0.8);">Accept</span>
                </div>
            </div>
        </div>

        <!-- B. Active Voice Call Screen -->
        <div class="active-voice-box" id="activeVoiceBox" style="display:none;">
            <div class="incoming-call-avatar" style="width:140px;height:140px;">
                <img id="voiceCallPeerAvatar" src="assets/images/logo.png" alt="Peer">
            </div>
            <div style="font-size:24px;font-weight:700;" id="voiceCallPeerName">Anas Abdiwahid</div>
            <div class="call-timer" id="callTimerDisplay">00:00</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.7);" id="voiceCallStatusText">Connected</div>

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
            <video id="remoteVideo" autoplay playsinline></video>
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
                        <label for="editAvatarInput" class="avatar-upload-preview">
                            <img src="<?= htmlspecialchars($userAvatar) ?>" id="editAvatarPreviewImg" alt="Avatar">
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
                <h3>Block User?</h3>
            </div>
            <div class="modal-body">
                Blocked users cannot send you messages, friend requests, or initiate calls.
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

    <!-- Emoji Popover -->
    <div id="emojiPickerPopover" class="attachment-popover" style="bottom:64px;left:16px;max-width:280px;flex-direction:row;flex-wrap:wrap;padding:12px;gap:8px;">
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
    </div>

    <!-- Toast Notification Container -->
    <div id="toast-container"></div>

    <!-- Global Application State -->
    <script>
        window.CURRENT_USER = <?= json_encode([
            'id' => (int)$currentUser['id'],
            'fullname' => $currentUser['fullname'],
            'phone' => $currentUser['phone'],
            'profile_image' => $userAvatar,
            'theme' => $currentUser['theme'] ?? 'light'
        ], JSON_UNESCAPED_SLASHES) ?>;

        function toggleEmojiPicker(btn) {
            const p = document.getElementById('emojiPickerPopover');
            if (p) p.classList.toggle('active');
        }

        function insertEmoji(char) {
            const input = document.getElementById('chatInputField');
            if (input) {
                input.value += char;
                input.focus();
            }
            const p = document.getElementById('emojiPickerPopover');
            if (p) p.classList.remove('active');
        }

        function openBlockModal() {
            document.getElementById('chatMoreDropdown').classList.remove('active');
            const m = document.getElementById('blockUserModal');
            if (m) m.classList.add('active');
            document.getElementById('btnConfirmBlock').onclick = async () => {
                if (window.chatManager && window.chatManager.activeFriend) {
                    const res = await fetch('api/users/block.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ target_id: window.chatManager.activeFriend.id, action: 'block' })
                    });
                    const data = await res.json();
                    showToast(data.message, data.success ? 'success' : 'error');
                    m.classList.remove('active');
                    setTimeout(() => window.location.reload(), 1000);
                }
            };
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

    <!-- Application Scripts -->
    <script src="assets/js/auth.js"></script>
    <script src="assets/js/pwa.js"></script>
    <script src="assets/js/upload.js"></script>
    <script src="assets/js/recorder.js"></script>
    <script src="assets/js/webrtc.js"></script>
    <script src="assets/js/calls.js"></script>
    <script src="assets/js/friends.js"></script>
    <script src="assets/js/notifications.js"></script>
    <script src="assets/js/chat.js"></script>
    <script src="assets/js/app.js"></script>
</body>
</html>
