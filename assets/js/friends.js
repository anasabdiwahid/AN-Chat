// assets/js/friends.js - Friends Management & User Search

class FriendsManager {
    static async search(query, containerEl) {
        if (!query || query.trim().length === 0) {
            containerEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-search"></i></div>
                    <div class="empty-state-title">Search Users</div>
                    <div class="empty-state-desc">Enter a phone number to find friends on A/N Chat.</div>
                </div>
            `;
            return;
        }

        containerEl.innerHTML = `<div style="display:flex;justify-content:center;padding:30px;"><div class="spinner"></div></div>`;

        try {
            const res = await fetch(`api/users/search.php?q=${encodeURIComponent(query)}`);
            const data = await res.json();

            if (!data.success || !data.data || data.data.length === 0) {
                containerEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon"><i class="fas fa-user-slash"></i></div>
                        <div class="empty-state-title">User not found</div>
                        <div class="empty-state-desc">No registered user found with phone "${escapeHtml(query)}".</div>
                    </div>
                `;
                return;
            }

            let html = '';
            data.data.forEach(u => {
                const userId = parseInt(u.id);
                window.friendsCache = window.friendsCache || {};
                window.friendsCache[userId] = u;

                const avatar = typeof window.resolveAvatarUrl === 'function' ? window.resolveAvatarUrl(u.profile_image) : (u.profile_image || 'assets/images/default-avatar.png');
                let btnHtml = '';

                const safeName = escapeHtml(u.fullname).replace(/'/g, "\\'");
                const safeAvatar = avatar.replace(/'/g, "\\'");
                const safeStatus = (u.status || 'offline').replace(/'/g, "\\'");

                if (u.is_friend > 0) {
                    btnHtml = `
                        <div style="display:flex;gap:6px;align-items:center;">
                            <button class="btn-icon btn-sm" title="Voice call" style="color:var(--primary);" onclick="event.stopPropagation(); if (typeof window.startCallWith === 'function') window.startCallWith(${userId}, '${safeName}', '${safeAvatar}', 'voice');">
                                <i class="fas fa-phone-alt"></i>
                            </button>
                            <button class="btn-icon btn-sm" title="Video call" style="color:var(--primary);" onclick="event.stopPropagation(); if (typeof window.startCallWith === 'function') window.startCallWith(${userId}, '${safeName}', '${safeAvatar}', 'video');">
                                <i class="fas fa-video"></i>
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openChatWith(${userId}, '${safeName}', '${safeAvatar}', '${safeStatus}');">
                                <i class="fas fa-comment"></i> Chat
                            </button>
                        </div>
                    `;
                } else if (u.sent_req_status === 'pending') {
                    btnHtml = `<button class="btn btn-outline btn-sm" disabled><i class="fas fa-clock"></i> Requested</button>`;
                } else if (u.recv_req_status === 'pending') {
                    btnHtml = `<button class="btn btn-primary btn-sm" onclick="FriendsManager.acceptFromSearch(${userId})">Accept Request</button>`;
                } else {
                    btnHtml = `<button class="btn btn-primary btn-sm" onclick="FriendsManager.sendRequest(${userId}, this)"><i class="fas fa-user-plus"></i> Add Friend</button>`;
                }

                const itemClick = (u.is_friend > 0) ? `onclick="openChatWith(${userId}, '${safeName}', '${safeAvatar}', '${safeStatus}')" style="cursor:pointer;"` : `style="cursor:default;"`;

                html += `
                    <div class="list-item" id="friend-item-${userId}" ${itemClick}>
                        <div class="avatar avatar-md">
                            <img src="${avatar}" alt="${escapeHtml(u.fullname)}" onerror="this.src='assets/images/default-avatar.png'">
                            <span class="status-dot ${u.status}"></span>
                        </div>
                        <div class="list-item-content">
                            <div class="list-item-name">${escapeHtml(u.fullname)}</div>
                            <div class="list-item-preview"><i class="fas fa-phone-alt" style="font-size:11px;margin-right:4px;"></i>${escapeHtml(u.phone)}</div>
                        </div>
                        <div>${btnHtml}</div>
                    </div>
                `;
            });

            containerEl.innerHTML = html;
        } catch (e) {
            console.error('Search error', e);
            containerEl.innerHTML = `<div class="empty-state"><div class="empty-state-desc">Failed to perform search.</div></div>`;
        }
    }

    static async sendRequest(receiverId, btnEl) {
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.innerHTML = '<div class="spinner"></div> Sending...';
        }

        try {
            const res = await fetch('api/friends/send-request.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiver_id: receiverId })
            });
            const data = await res.json();

            if (data.success) {
                showToast('Friend request sent!', 'success');
                if (btnEl) {
                    btnEl.outerHTML = `<button class="btn btn-outline btn-sm" disabled><i class="fas fa-clock"></i> Requested</button>`;
                }
                // Notify WebSocket
                if (window.wsClient) {
                    window.wsClient.send({
                        type: 'friend_request',
                        receiver_id: receiverId,
                        sender_name: window.CURRENT_USER.fullname
                    });
                }
            } else {
                showToast(data.message || 'Could not send request', 'error');
                if (btnEl) {
                    btnEl.disabled = false;
                    btnEl.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
                }
            }
        } catch (e) {
            showToast('Network error while sending request', 'error');
            if (btnEl) btnEl.disabled = false;
        }
    }

    static async acceptRequest(requestId, itemEl) {
        try {
            const res = await fetch('api/friends/accept-request.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request_id: requestId })
            });
            const data = await res.json();

            if (data.success) {
                showToast('Friend request accepted!', 'success');
                if (itemEl) itemEl.remove();
                // Reload friend list
                if (typeof loadFriendsList === 'function') {
                    loadFriendsList();
                }
            } else {
                showToast(data.message || 'Could not accept request', 'error');
            }
        } catch (e) {
            showToast('Network error', 'error');
        }
    }

    static async rejectRequest(requestId, itemEl) {
        try {
            const res = await fetch('api/friends/reject-request.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request_id: requestId })
            });
            const data = await res.json();

            if (data.success) {
                showToast('Friend request rejected.', 'info');
                if (itemEl) itemEl.remove();
            } else {
                showToast(data.message || 'Could not reject request', 'error');
            }
        } catch (e) {
            showToast('Network error', 'error');
        }
    }

    static async acceptFromSearch(userId) {
        try {
            const res = await fetch('api/friends/accept-request.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ friend_id: userId })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Friend request accepted!', 'success');
                if (typeof loadFriendsList === 'function') loadFriendsList();
                if (typeof loadChatsList === 'function') loadChatsList();
            } else {
                showToast(data.message || 'Could not accept request', 'error');
            }
        } catch (e) {
            showToast('Network error', 'error');
        }
    }
}

window.FriendsManager = FriendsManager;

