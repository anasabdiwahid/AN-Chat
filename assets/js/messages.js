// assets/js/chat.js - Chat & Messaging Controller

class ChatManager {
    constructor() {
        this.activeFriend = null; // { id, name, avatar, status }
        this.messagesContainer = document.getElementById('chatMessages');
        this.inputField = document.getElementById('chatInputField');
        this.sendBtn = document.getElementById('btnSendMessage');
        this.replyBar = document.getElementById('replyPreviewBar');
        this.activeReplyMessage = null;
        this.typingTimeout = null;
        this.isTyping = false;
        this.audioPingCtx = null;
        this.highestMessageId = 0;
        this.conversationPollTimer = null;
        this.conversationPollInProgress = false;

        this.initEvents();
    }

    initEvents() {
        // Send message click
        if (this.sendBtn) {
            this.sendBtn.addEventListener('click', () => this.sendMessage());
        }

        // Enter key to send
        if (this.inputField) {
            this.inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            // Typing indicator and auto-grow handler
            this.inputField.addEventListener('input', () => {
                // Auto grow textarea smoothly up to 120px
                this.inputField.style.height = 'auto';
                this.inputField.style.height = Math.min(this.inputField.scrollHeight, 120) + 'px';

                if (!this.activeFriend || !window.wsClient) return;

                if (!this.isTyping) {
                    this.isTyping = true;
                    window.wsClient.send({
                        type: 'typing',
                        receiver_id: this.activeFriend.id,
                        is_typing: true
                    });
                }

                clearTimeout(this.typingTimeout);
                this.typingTimeout = setTimeout(() => {
                    this.isTyping = false;
                    window.wsClient.send({
                        type: 'typing',
                        receiver_id: this.activeFriend.id,
                        is_typing: false
                    });
                }, 2000);
            });
        }

        // Close reply bar
        const closeReplyBtn = document.getElementById('btnCloseReply');
        if (closeReplyBtn) {
            closeReplyBtn.addEventListener('click', () => this.clearReply());
        }

        // Attachment popover toggle
        const btnAttach = document.getElementById('btnAttachmentToggle');
        const popover = document.getElementById('attachmentPopover');
        if (btnAttach && popover) {
            btnAttach.addEventListener('click', (e) => {
                e.stopPropagation();
                const emojiP = document.getElementById('emojiPickerPopover');
                if (emojiP) emojiP.classList.remove('active');
                popover.classList.toggle('active');
            });

            document.addEventListener('click', () => {
                popover.classList.remove('active');
            });
        }

        // Attachment file inputs
        const fileImageInput = document.getElementById('attachImageInput');
        if (fileImageInput) {
            fileImageInput.addEventListener('change', async () => {
                const file = fileImageInput.files[0];
                if (!file) return;

                // Show preview before sending
                FileUploader.showImagePreview(file, async (confirmedFile) => {
                    showToast('Uploading image...', 'info');
                    const uploadRes = await FileUploader.upload(confirmedFile, 'image');
                    if (uploadRes) {
                        this.sendMediaMessage('image', uploadRes.file_path, uploadRes.file_name, uploadRes.file_size);
                    }
                });
                fileImageInput.value = '';
            });
        }

        const fileDocInput = document.getElementById('attachDocInput');
        if (fileDocInput) {
            fileDocInput.addEventListener('change', async () => {
                const file = fileDocInput.files[0];
                if (!file) return;

                showToast('Uploading document...', 'info');
                const uploadRes = await FileUploader.upload(file, 'document');
                if (uploadRes) {
                    this.sendMediaMessage('document', uploadRes.file_path, uploadRes.file_name, uploadRes.file_size);
                }
                fileDocInput.value = '';
            });
        }

        const fileVideoInput = document.getElementById('attachVideoInput');
        if (fileVideoInput) {
            fileVideoInput.addEventListener('change', async () => {
                const file = fileVideoInput.files[0];
                if (!file) return;

                showToast('Uploading video...', 'info');
                const uploadRes = await FileUploader.upload(file, 'video');
                if (uploadRes) {
                    this.sendMediaMessage('video', uploadRes.file_path, uploadRes.file_name, uploadRes.file_size);
                }
                fileVideoInput.value = '';
            });
        }

        // Voice Message recording setup
        const voiceBtn = document.getElementById('btnVoiceRecord');
        const cancelRecordBtn = document.getElementById('btnCancelRecord');
        const sendRecordBtn = document.getElementById('btnSendRecord');
        
        try {
            this.recorder = (typeof VoiceRecorder === 'function') ? new VoiceRecorder() : null;
        } catch (e) {
            this.recorder = null;
        }

        if (voiceBtn) {
            voiceBtn.addEventListener('click', async () => {
                if (!this.activeFriend) {
                    showToast('Select a conversation first', 'info');
                    return;
                }
                if (!this.recorder) {
                    showToast('Voice recording not supported on this device/browser', 'error');
                    return;
                }
                const started = await this.recorder.start();
                if (started) {
                    showToast('Recording audio...', 'info');
                }
            });
        }

        if (cancelRecordBtn) {
            cancelRecordBtn.addEventListener('click', () => {
                if (this.recorder) this.recorder.cancel();
                showToast('Voice message cancelled.', 'info');
            });
        }

        if (sendRecordBtn) {
            sendRecordBtn.addEventListener('click', async () => {
                if (!this.recorder) return;
                const audioBlob = await this.recorder.stop();
                if (audioBlob) {
                    showToast('Sending voice message...', 'info');
                    const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
                    const uploadRes = await FileUploader.upload(audioFile, 'voice');
                    if (uploadRes) {
                        this.sendMediaMessage('voice', uploadRes.file_path, uploadRes.file_name, uploadRes.file_size);
                    }
                }
            });
        }
    }

    async openConversation(friendId, friendName, friendAvatar, friendStatus) {
        if (!friendId) return;
        friendId = parseInt(friendId);
        let friendLastSeen = '';
        if (this.conversationPollTimer) clearInterval(this.conversationPollTimer);
        this.conversationPollTimer = null;

        // Auto lookup from cache if friendName or avatar missing
        if (window.friendsCache && window.friendsCache[friendId]) {
            const cached = window.friendsCache[friendId];
            friendName = friendName || cached.fullname;
            friendAvatar = friendAvatar || cached.profile_image;
            friendStatus = friendStatus || cached.status;
            friendLastSeen = cached.last_seen || '';
        }

        friendName = friendName || 'Conversation';
        friendAvatar = friendAvatar || 'assets/images/default-avatar.png';
        friendStatus = friendStatus || 'offline';

        this.activeFriend = {
            id: friendId,
            name: friendName,
            avatar: friendAvatar,
            status: friendStatus,
            phone: (window.friendsCache && window.friendsCache[friendId] && window.friendsCache[friendId].phone) || ''
        };

        // 1. Immediately toggle Active Chat UI and hide Empty State
        const emptyState = document.getElementById('chatEmptyState');
        const activeChatView = document.getElementById('activeChatView');
        if (emptyState) emptyState.style.setProperty('display', 'none', 'important');
        if (activeChatView) activeChatView.style.setProperty('display', 'flex', 'important');

        // 2. Ensure mobile & tablet container shows chat
        const appContainer = document.querySelector('.app-container');
        if (appContainer) appContainer.classList.add('chat-open');

        const mainStage = document.querySelector('.main-stage');
        if (mainStage) mainStage.style.setProperty('display', 'flex', 'important');

        // 3. Update Chat Header safely
        const nameEl = document.getElementById('chatHeaderName');
        if (nameEl) nameEl.textContent = friendName;

        const statusEl = document.getElementById('chatHeaderStatus');
        const headerDot = document.getElementById('chatHeaderStatusDot');
        if (headerDot) {
            headerDot.className = `status-dot ${friendStatus}`;
            headerDot.setAttribute('aria-label', friendStatus);
        }
        if (statusEl) {
            statusEl.className = `chat-header-status ${friendStatus}`;
            const presenceLabel = typeof window.formatPresenceLabel === 'function'
                ? window.formatPresenceLabel(friendStatus, friendLastSeen)
                : (friendStatus === 'online' ? 'Online' : 'Offline');
            statusEl.innerHTML = `<i class="fas fa-circle" style="font-size:8px;"></i> ${presenceLabel}`;
        }

        const headerAvatar = document.getElementById('chatHeaderAvatar');
        if (headerAvatar) {
            headerAvatar.onerror = () => { headerAvatar.onerror = null; headerAvatar.src = 'assets/images/default-avatar.png'; };
            headerAvatar.src = typeof window.resolveAvatarUrl === 'function' ? window.resolveAvatarUrl(friendAvatar) : (friendAvatar || 'assets/images/default-avatar.png');
        }

        // 4. Highlight active item across lists
        document.querySelectorAll('.list-item.active').forEach(el => el.classList.remove('active'));
        const activeItem = document.getElementById(`chat-item-${friendId}`) || document.getElementById(`friend-item-${friendId}`);
        if (activeItem) activeItem.classList.add('active');

        // 5. Ensure elements are cached for messaging
        this.messagesContainer = document.getElementById('chatMessages');
        this.inputField = document.getElementById('chatInputField');
        this.sendBtn = document.getElementById('btnSendMessage');

        // 6. Focus input field
        if (this.inputField) {
            this.inputField.disabled = false;
            setTimeout(() => {
                try { this.inputField.focus(); } catch (e) {}
            }, 100);
        }

        // 7. Load conversation messages
        this.highestMessageId = 0;
        await this.loadMessages(friendId);
        this.startConversationPolling(friendId);

        // 8. Notify WebSocket that messages are read (if connected)
        if (window.wsClient && typeof window.wsClient.send === 'function') {
            try {
                window.wsClient.send({
                    type: 'message_read',
                    sender_id: friendId
                });
            } catch (e) {}
        }
    }

    startConversationPolling(friendId) {
        const poll = async () => {
            if (this.conversationPollInProgress || !this.activeFriend || parseInt(this.activeFriend.id) !== friendId) return;
            this.conversationPollInProgress = true;
            try {
                const afterId = parseInt(this.highestMessageId) || 0;
                const response = await fetch(`api/messages/fetch.php?friend_id=${friendId}&after_id=${afterId}`, { cache: 'no-store' });
                if (!response.ok) return;
                const result = await response.json();
                if (!result.success || !Array.isArray(result.data)) return;
                let gotIncoming = false;
                result.data.forEach(message => {
                    if (!document.getElementById(`msg-row-${message.id}`)) {
                        this.appendMessage(message, true);
                        if (parseInt(message.sender_id) !== parseInt(window.CURRENT_USER.id)) gotIncoming = true;
                    }
                });
                if (gotIncoming) {
                    this.playMessagePing();
                    if (window.wsClient && typeof window.wsClient.send === 'function') {
                        window.wsClient.send({ type: 'message_read', sender_id: friendId });
                    }
                }
            } catch (error) {
                // Keep polling; the next interval retries automatically.
            } finally {
                this.conversationPollInProgress = false;
            }
        };
        poll();
        this.conversationPollTimer = setInterval(poll, 1000);
    }

    async loadMessages(friendId) {
        if (!this.messagesContainer) this.messagesContainer = document.getElementById('chatMessages');
        if (!this.messagesContainer) return;
        this.messagesContainer.innerHTML = `<div style="display:flex;justify-content:center;padding:40px;"><div class="spinner"></div></div>`;

        try {
            const res = await fetch(`api/messages/fetch.php?friend_id=${friendId}`);
            const data = await res.json();

            if (!data.success || !data.data || data.data.length === 0) {
                this.messagesContainer.innerHTML = `
                    <div class="empty-state" style="margin:auto;">
                        <div class="empty-state-icon"><i class="fas fa-hand-wave"></i></div>
                        <div class="empty-state-title">Say hello to ${escapeHtml(this.activeFriend.name)}!</div>
                        <div class="empty-state-desc">Send a text, photo, or voice message to start chatting.</div>
                    </div>
                `;
                return;
            }

            this.messagesContainer.innerHTML = '';
            this.highestMessageId = 0;
            data.data.forEach(msg => {
                const mid = parseInt(msg.id);
                if (mid && mid > this.highestMessageId) {
                    this.highestMessageId = mid;
                }
                this.appendMessage(msg, false);
            });

            this.scrollToBottom();
        } catch (e) {
            console.error('Load messages error', e);
            if (this.messagesContainer) {
                this.messagesContainer.innerHTML = `<div class="empty-state"><div class="empty-state-desc">Error loading messages.</div></div>`;
            }
        }
    }

    async sendMessage() {
        if (this.isSending) return;

        if (!this.activeFriend || !this.activeFriend.id) {
            if (window.activeFriendId) {
                this.activeFriend = { id: parseInt(window.activeFriendId), name: 'Chat', avatar: 'assets/images/default-avatar.png', status: 'offline' };
            } else {
                showToast('Please select a conversation first', 'info');
                return;
            }
        }

        if (!this.inputField) this.inputField = document.getElementById('chatInputField');
        if (!this.inputField) return;

        const text = this.inputField.value.trim();
        if (!text) return;

        this.isSending = true;
        const replyToId = this.activeReplyMessage ? this.activeReplyMessage.id : null;
        const receiverId = parseInt(this.activeFriend.id);

        // Clear input and reply preview immediately
        this.inputField.value = '';
        this.inputField.style.height = 'auto';
        this.clearReply();

        try {
            const res = await fetch('api/messages/send.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    receiver_id: receiverId,
                    message: text,
                    message_type: 'text',
                    reply_to_id: replyToId
                })
            });

            const data = await res.json();
            if (data.success && data.data) {
                this.appendMessage(data.data, true);

                // Dispatch via WebSocket if active
                if (window.wsClient && typeof window.wsClient.send === 'function') {
                    try {
                        window.wsClient.send({
                            type: 'new_message',
                            receiver_id: receiverId,
                            message_data: data.data
                        });
                    } catch (e) {}
                }

                // Immediate background sync to refresh recent list
                if (typeof runAutoSyncHeartbeat === 'function') {
                    setTimeout(runAutoSyncHeartbeat, 200);
                }
            } else {
                showToast(data.message || 'Failed to send message', 'error');
                this.inputField.value = text;
            }
        } catch (e) {
            showToast('Network error while sending message', 'error');
            this.inputField.value = text;
        } finally {
            this.isSending = false;
        }
    }

    async sendMediaMessage(type, filePath, fileName, fileSize) {
        if (!this.activeFriend) return;
        try {
            const res = await fetch('api/messages/send.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    receiver_id: this.activeFriend.id,
                    message: '',
                    message_type: type,
                    file_path: filePath,
                    file_name: fileName,
                    file_size: fileSize
                })
            });

            const data = await res.json();
            if (data.success && data.data) {
                this.appendMessage(data.data, true);

                // Dispatch via WebSocket
                if (window.wsClient) {
                    window.wsClient.send({
                        type: 'new_message',
                        receiver_id: this.activeFriend.id,
                        message_data: data.data
                    });
                }

                // Immediate background sync
                if (typeof runAutoSyncHeartbeat === 'function') {
                    setTimeout(runAutoSyncHeartbeat, 200);
                }
            } else {
                showToast(data.message || 'Failed to send media', 'error');
            }
        } catch (e) {
            showToast('Network error while sending media', 'error');
        }
    }

    appendMessage(msg, shouldScroll = true) {
        if (!this.messagesContainer) return;

        // Prevent duplicate rendering
        if (msg.id && document.getElementById(`msg-row-${msg.id}`)) {
            return;
        }

        const mid = parseInt(msg.id);
        if (mid && mid > this.highestMessageId) {
            this.highestMessageId = mid;
        }

        // Remove empty state if present
        const emptyEl = this.messagesContainer.querySelector('.empty-state');
        if (emptyEl) emptyEl.remove();

        // Render System / Screenshot Alert Notice Pill
        if (msg.message_type === 'system' || msg.message_type === 'screenshot') {
            const systemRow = document.createElement('div');
            systemRow.className = 'message-system-notice';
            systemRow.id = `msg-row-${msg.id || Date.now()}`;
            systemRow.innerHTML = `
                <div class="system-notice-pill">
                    <i class="fas fa-camera"></i>
                    <span>${escapeHtml(msg.message)}</span>
                    <span class="system-notice-time">${formatTime(msg.created_at || new Date())}</span>
                </div>
            `;
            this.messagesContainer.appendChild(systemRow);
            if (shouldScroll) this.scrollToBottom();
            return;
        }

        const isMine = (parseInt(msg.sender_id) === parseInt(window.CURRENT_USER.id));
        const row = document.createElement('div');
        row.className = `message-row ${isMine ? 'mine' : 'theirs'}`;
        row.id = `msg-row-${msg.id}`;

        let mediaHtml = '';
        if (msg.message_type === 'image') {
            mediaHtml = `
                <div class="bubble-media-image" onclick="window.open('${escapeHtml(msg.file_path)}', '_blank')">
                    <img src="${escapeHtml(msg.file_path)}" alt="Image" loading="lazy">
                </div>
            `;
        } else if (msg.message_type === 'video') {
            mediaHtml = `
                <div class="bubble-media-video">
                    <video controls preload="metadata">
                        <source src="${escapeHtml(msg.file_path)}">
                    </video>
                </div>
            `;
        } else if (msg.message_type === 'document') {
            mediaHtml = `
                <div class="bubble-media-doc">
                    <i class="fas fa-file-pdf" style="font-size:24px;color:var(--primary);"></i>
                    <div style="flex:1;overflow:hidden;">
                        <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(msg.file_name || 'Document')}</div>
                        <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(msg.file_size || '')}</div>
                    </div>
                    <a href="${escapeHtml(msg.file_path)}" download="${escapeHtml(msg.file_name || 'document')}" class="btn btn-secondary btn-sm" style="padding:4px 8px;">
                        <i class="fas fa-download"></i>
                    </a>
                </div>
            `;
        } else if (msg.message_type === 'voice') {
            mediaHtml = `
                <div class="bubble-media-voice">
                    <audio controls style="height:36px;outline:none;">
                        <source src="${escapeHtml(msg.file_path)}" type="audio/webm">
                    </audio>
                </div>
            `;
        }

        let replySnippetHtml = '';
        if (msg.reply_to_id && msg.reply_text) {
            replySnippetHtml = `
                <div class="bubble-reply">
                    <div class="bubble-reply-sender">${escapeHtml(msg.reply_sender_name || 'User')}</div>
                    <div class="bubble-reply-text">${escapeHtml(msg.reply_text)}</div>
                </div>
            `;
        }

        let ticksHtml = '';
        if (isMine) {
            const isRead = (msg.is_read == 1);
            ticksHtml = `<span class="bubble-ticks ${isRead ? 'read' : ''}">${isRead ? '✓✓' : (msg.is_delivered == 1 ? '✓✓' : '✓')}</span>`;
        }

        // Reactions html
        let reactionsHtml = '';
        if (msg.reactions && msg.reactions.length > 0) {
            const summary = msg.reactions.map(r => r.reaction).join(' ');
            reactionsHtml = `<div class="reaction-pill" onclick="chatManager.openReactionPopover(${msg.id})">${summary} <span style="font-size:10px;font-weight:700;">${msg.reactions.length}</span></div>`;
        }

        row.innerHTML = `
            <div class="message-bubble">
                ${replySnippetHtml}
                ${mediaHtml}
                ${msg.message ? `<div class="bubble-text">${escapeHtml(msg.message)}</div>` : ''}
                <div class="bubble-meta">
                    <span>${formatTime(msg.created_at)}</span>
                    ${ticksHtml}
                </div>
                ${reactionsHtml}
            </div>
            <div class="message-actions">
                <button class="action-btn" title="React" onclick="chatManager.showQuickReactions(${msg.id}, this)"><i class="far fa-smile"></i></button>
                <button class="action-btn" title="Reply" onclick="chatManager.setReply(${msg.id}, '${escapeHtml(msg.sender_name || 'User')}', '${escapeHtml(msg.message || msg.message_type)}')"><i class="fas fa-reply"></i></button>
                <button class="action-btn" title="Copy" onclick="chatManager.copyMessage('${escapeHtml(msg.message || '')}')"><i class="far fa-copy"></i></button>
                <button class="action-btn" title="Delete" onclick="chatManager.deleteDialog(${msg.id}, ${isMine})"><i class="far fa-trash-alt"></i></button>
            </div>
        `;

        this.messagesContainer.appendChild(row);

        if (shouldScroll) {
            this.scrollToBottom();
        }
    }

    scrollToBottom() {
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    setReply(msgId, senderName, text) {
        this.activeReplyMessage = { id: msgId, senderName, text };
        document.getElementById('replySenderName').textContent = senderName;
        document.getElementById('replyBodyText').textContent = text;
        if (this.replyBar) this.replyBar.classList.add('active');
        if (this.inputField) this.inputField.focus();
    }

    clearReply() {
        this.activeReplyMessage = null;
        if (this.replyBar) this.replyBar.classList.remove('active');
    }

    copyMessage(text) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            showToast('Message copied to clipboard', 'info');
        });
    }

    showQuickReactions(msgId, btnEl) {
        const existingBar = document.querySelector('.quick-reaction-bar');
        if (existingBar) existingBar.remove();

        const bar = document.createElement('div');
        bar.className = 'quick-reaction-bar';
        const emojis = ['❤️', '😂', '👍', '🔥', '😍', '😢'];

        emojis.forEach(emo => {
            const span = document.createElement('span');
            span.className = 'reaction-opt';
            span.textContent = emo;
            span.onclick = () => {
                this.sendReaction(msgId, emo);
                bar.remove();
            };
            bar.appendChild(span);
        });

        btnEl.parentElement.appendChild(bar);

        setTimeout(() => {
            document.addEventListener('click', function closeBar(e) {
                if (!bar.contains(e.target)) {
                    bar.remove();
                    document.removeEventListener('click', closeBar);
                }
            });
        }, 10);
    }

    async sendReaction(msgId, reaction) {
        try {
            const res = await fetch('api/messages/reaction.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message_id: msgId, reaction: reaction })
            });
            const data = await res.json();
            if (data.success && this.activeFriend) {
                // Update local UI
                this.updateMessageReactions(msgId, data.data.reactions);

                // Send via WebSocket
                if (window.wsClient) {
                    window.wsClient.send({
                        type: 'reaction',
                        receiver_id: this.activeFriend.id,
                        message_id: msgId,
                        reactions: data.data.reactions
                    });
                }
            }
        } catch (e) {}
    }

    updateMessageReactions(msgId, reactions) {
        const row = document.getElementById(`msg-row-${msgId}`);
        if (!row) return;

        let pill = row.querySelector('.reaction-pill');
        if (!reactions || reactions.length === 0) {
            if (pill) pill.remove();
            return;
        }

        const summary = reactions.map(r => r.reaction).join(' ');
        if (!pill) {
            pill = document.createElement('div');
            pill.className = 'reaction-pill';
            row.querySelector('.message-bubble').appendChild(pill);
        }
        pill.innerHTML = `${summary} <span style="font-size:10px;font-weight:700;">${reactions.length}</span>`;
    }

    deleteDialog(msgId, isMine) {
        const modal = document.getElementById('deleteMessageModal');
        const btnForEveryone = document.getElementById('btnDeleteForEveryone');
        const btnForMe = document.getElementById('btnDeleteForMe');
        const btnCancel = document.getElementById('btnCancelDelete');

        if (!modal) return;

        if (btnForEveryone) {
            btnForEveryone.style.display = isMine ? 'inline-flex' : 'none';
        }

        modal.classList.add('active');

        const executeDelete = async (type) => {
            modal.classList.remove('active');
            try {
                const res = await fetch('api/messages/delete.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message_id: msgId, type: type })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(data.message, 'info');
                    const row = document.getElementById(`msg-row-${msgId}`);
                    if (row) {
                        if (type === 'for_everyone') {
                            const textEl = row.querySelector('.bubble-text');
                            if (textEl) textEl.innerHTML = '<em>This message was deleted</em>';
                        } else {
                            row.remove();
                        }
                    }
                } else {
                    showToast(data.message, 'error');
                }
            } catch (e) {}
        };

        btnForMe.onclick = () => executeDelete('for_me');
        if (btnForEveryone) btnForEveryone.onclick = () => executeDelete('for_everyone');
        btnCancel.onclick = () => modal.classList.remove('active');
    }

    // Play subtle soft ping when new message arrives
    playMessagePing() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);

            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.25);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.25);
        } catch (e) {}
    }

    updateReadStatus(readIds) {
        if (!Array.isArray(readIds) || readIds.length === 0) return;
        readIds.forEach(id => {
            const row = document.getElementById(`msg-row-${id}`);
            if (row && row.classList.contains('mine')) {
                const ticks = row.querySelector('.bubble-ticks');
                if (ticks && !ticks.classList.contains('read')) {
                    ticks.textContent = '✓✓';
                    ticks.classList.add('read');
                }
            }
        });
    }

    updateDeletedMessages(deletedIds) {
        if (!Array.isArray(deletedIds) || deletedIds.length === 0) return;
        deletedIds.forEach(id => {
            const row = document.getElementById(`msg-row-${id}`);
            if (row) {
                const textEl = row.querySelector('.bubble-text');
                if (textEl && !textEl.innerHTML.includes('deleted')) {
                    textEl.innerHTML = '<em style="color:var(--text-secondary);font-size:12.5px;">This message was deleted</em>';
                    const media = row.querySelector('.bubble-media');
                    if (media) media.remove();
                }
            }
        });
    }
}

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

window.ChatManager = ChatManager;
