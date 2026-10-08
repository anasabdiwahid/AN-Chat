// assets/js/notifications.js - Notification Manager

class NotificationManager {
    static async loadList(containerEl) {
        if (!containerEl) return;
        containerEl.innerHTML = `<div style="display:flex;justify-content:center;padding:30px;"><div class="spinner"></div></div>`;

        try {
            const res = await fetch('api/notifications/list.php');
            const data = await res.json();

            if (!data.success || !data.data || !data.data.notifications || data.data.notifications.length === 0) {
                containerEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon"><i class="fas fa-bell-slash"></i></div>
                        <div class="empty-state-title">No notifications</div>
                        <div class="empty-state-desc">You are all caught up! Updates and friend requests will appear here.</div>
                    </div>
                `;
                this.updateBadges(0);
                return;
            }

            const unread = data.data.unread_count || 0;
            this.updateBadges(unread);

            let html = `
                <div style="padding:10px 16px;display:flex;justify-content:flex-end;">
                    <button class="btn btn-outline btn-sm" onclick="NotificationManager.markAllRead()"><i class="fas fa-check-double"></i> Mark all read</button>
                </div>
            `;

            data.data.notifications.forEach(n => {
                const avatar = n.sender_image ? (n.sender_image.startsWith('http') ? n.sender_image : 'uploads/images/' + n.sender_image) : 'assets/images/logo.png';
                const isUnread = n.is_read == 0;
                
                let iconClass = 'fa-bell';
                if (n.type === 'friend_request') iconClass = 'fa-user-plus';
                if (n.type === 'friend_accepted') iconClass = 'fa-user-check';
                if (n.type === 'new_message') iconClass = 'fa-comment';
                if (n.type === 'missed_call') iconClass = 'fa-phone-slash';

                html += `
                    <div class="list-item ${isUnread ? 'active' : ''}" onclick="NotificationManager.markRead(${n.id}, this)">
                        <div class="avatar avatar-md">
                            <img src="${avatar}" alt="Sender" onerror="this.src='assets/images/logo.png'">
                            <span class="status-dot online"></span>
                        </div>
                        <div class="list-item-content">
                            <div class="list-item-top">
                                <span class="list-item-name">${escapeHtml(n.sender_name || 'System')}</span>
                                <span class="list-item-time">${formatDate(n.created_at)}</span>
                            </div>
                            <div class="list-item-preview ${isUnread ? 'unread' : ''}">
                                <i class="fas ${iconClass}" style="color:var(--primary);margin-right:4px;"></i> ${escapeHtml(n.message)}
                            </div>
                        </div>
                    </div>
                `;
            });

            containerEl.innerHTML = html;
        } catch (e) {
            console.error('Notification error', e);
            containerEl.innerHTML = `<div class="empty-state"><div class="empty-state-desc">Failed to load notifications.</div></div>`;
        }
    }

    static async markRead(notifId, el) {
        if (el) el.classList.remove('active');
        try {
            await fetch('api/notifications/mark-read.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: notifId })
            });
        } catch (e) {}
    }

    static async markAllRead() {
        try {
            await fetch('api/notifications/mark-read.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: 0 })
            });
            showToast('All notifications marked as read', 'success');
            const notifBox = document.getElementById('notificationsListContainer');
            if (notifBox) this.loadList(notifBox);
        } catch (e) {}
    }

    static updateBadges(count) {
        const badges = document.querySelectorAll('.notif-badge');
        badges.forEach(b => {
            if (count > 0) {
                b.textContent = count > 99 ? '99+' : count;
                b.style.display = 'inline-flex';
            } else {
                b.style.display = 'none';
            }
        });
    }
}

window.NotificationManager = NotificationManager;
