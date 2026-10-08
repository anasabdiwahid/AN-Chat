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

            // Typing indicator handler
            this.inputField.addEventListener('input', () => {
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
        this.recorder = new VoiceRecorder();

        if (voiceBtn) {
            voiceBtn.addEventListener('click', async () => {
                if (!this.activeFriend) {
                    showToast('Select a conversation first', 'info');
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
                this.recorder.cancel();
                showToast('Voice message cancelled.', 'info');
            });
        }

        if (sendRecordBtn) {
            sendRecordBtn.addEventListener('click', async () => {
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
        this.activeFriend = {
            id: friendId,
            name: friendName,
            avatar: friendAvatar,
            status: friendStatus
        };

        // Update Chat Header
        document.getElementById('chatHeaderName').textContent = friendName;
        const statusEl = document.getElementById('chatHeaderStatus');
        statusEl.className = `chat-header-status ${friendStatus}`;
        statusEl.innerHTML = `<i class="fas fa-circle" style="font-size:8px;"></i> ${friendStatus === 'online' ? 'Online' : 'Offline'}`;

        const headerAvatar = document.getElementById('chatHeaderAvatar');
        if (headerAvatar) {
            headerAvatar.onerror = () => { headerAvatar.onerror = null; headerAvatar.src = 'assets/images/default-avatar.png'; };
            headerAvatar.src = typeof window.resolveAvatarUrl === 'function' ? window.resolveAvatarUrl(friendAvatar) : (friendAvatar || 'assets/images/default-avatar.png');
        }

        // Hide Empty State and Show Active Chat UI
        const emptyState = document.getElementById('chatEmptyState');
        const activeChatView = document.getElementById('activeChatView');
        if (emptyState) emptyState.style.display = 'none';
        if (activeChatView) activeChatView.style.display = 'flex';

        // Add mobile class to container
        const appContainer = document.querySelector('.app-container');
        if (appContainer) appContainer.classList.add('chat-open');

        // Load conversation messages
        await this.loadMessages(friendId);

        // Notify WebSocket that messages are read
        if (window.wsClient) {
            window.wsClient.send({
                type: 'message_read',
                sender_id: friendId
            });
        }
    }

    async loadMessages(friendId) {
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
            data.data.forEach(msg => {
                this.appendMessage(msg, false);
            });

            this.scrollToBottom();
        } catch (e) {
            console.error('Load messages error', e);
            this.messagesContainer.innerHTML = `<div class="empty-state"><div class="empty-state-desc">Error loading messages.</div></div>`;
        }
    }

    async sendMessage() {
        if (!this.activeFriend) return;
        const text = this.inputField.value.trim();
        if (!text) return;

        const replyToId = this.activeReplyMessage ? this.activeReplyMessage.id : null;

        // Clear input and reply preview
        this.inputField.value = '';
        this.clearReply();

        try {
            const res = await fetch('api/messages/send.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    receiver_id: this.activeFriend.id,
                    message: text,
                    message_type: 'text',
                    reply_to_id: replyToId
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
            } else {
                showToast(data.message || 'Failed to send message', 'error');
            }
        } catch (e) {
            showToast('Network error while sending message', 'error');
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
            } else {
                showToast(data.message || 'Failed to send media', 'error');
            }
        } catch (e) {
            showToast('Network error while sending media', 'error');
        }
    }

    appendMessage(msg, shouldScroll = true) {
        if (!this.messagesContainer) return;

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
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr.replace(' ', 'T'));
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr.replace(' ', 'T'));
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

window.ChatManager = ChatManager;

