// assets/js/privacy-shield.js - Real-Time Screenshot & Screen Recording Detection Engine

class PrivacyShield {
    constructor() {
        this.lastTriggeredTime = 0;
        this.isArmed = false;
        this.armTimeout = null;
        this.init();
    }

    isEnabled() {
        return window.SYSTEM_SETTINGS && String(window.SYSTEM_SETTINGS.screenshot_detection) === '1';
    }

    init() {
        // 1. Keyboard Shortcuts (PrintScreen, Win+Shift+S, Mac Cmd+Shift+3/4/5)
        window.addEventListener('keydown', (e) => this.handleKeyDown(e), true);
        window.addEventListener('keyup', (e) => this.handleKeyUp(e), true);

        // 2. Window Blur while armed (e.g. Snipping tool overlay steals window focus)
        window.addEventListener('blur', () => this.handleWindowBlur());

        // 3. Screen capture via getDisplayMedia
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
            const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getDisplayMedia = async (...args) => {
                this.triggerAlert('screen_recording');
                return originalGetDisplayMedia(...args);
            };
        }
    }

    handleKeyDown(e) {
        if (!this.isEnabled()) return;

        // Detect PrintScreen key
        if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
            this.triggerAlert('screenshot');
            return;
        }

        // Detect Windows Snipping Tool (Win + Shift + S) or Shift + Meta + S
        if (e.shiftKey && (e.metaKey || e.key === 'Meta') && (e.key === 's' || e.code === 'KeyS' || e.key === 'S')) {
            this.triggerAlert('screenshot');
            return;
        }

        // Detect Mac Screenshot Shortcuts (Cmd + Shift + 3, Cmd + Shift + 4, Cmd + Shift + 5)
        if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
            this.triggerAlert('screenshot');
            return;
        }

        // Arm detection when user presses Meta or Shift (potential prelude to screenshot combo)
        if (e.key === 'Meta' || (e.shiftKey && e.key === 'Shift')) {
            this.isArmed = true;
            clearTimeout(this.armTimeout);
            this.armTimeout = setTimeout(() => { this.isArmed = false; }, 2500);
        }
    }

    handleKeyUp(e) {
        if (!this.isEnabled()) return;
        if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
            this.triggerAlert('screenshot');
        }
    }

    handleWindowBlur() {
        if (!this.isEnabled()) return;
        // If window loses focus while armed, it indicates an external snipping tool stole focus
        if (this.isArmed) {
            this.isArmed = false;
            this.triggerAlert('screenshot');
        }
    }

    triggerAlert(actionType = 'screenshot') {
        if (!this.isEnabled()) return;

        // Check if user is currently inside an active chat
        if (!window.chatManager || !window.chatManager.activeFriend) {
            return;
        }

        const now = Date.now();
        // Prevent repeated triggers within 4 seconds (debounce)
        if (now - this.lastTriggeredTime < 4000) {
            return;
        }
        this.lastTriggeredTime = now;

        const friend = window.chatManager.activeFriend;
        const myName = window.CURRENT_USER ? window.CURRENT_USER.fullname : 'You';
        const actionLabel = actionType === 'screen_recording' ? 'screen recording' : 'screenshot';
        const noticeMessage = `⚠️ ${myName} took a ${actionLabel} of this conversation.`;

        console.log(`[PrivacyShield] ${actionType} detected in conversation with ${friend.name} (#${friend.id})`);

        // 1. Show immediate notice in local chat view for the perpetrator
        const selfNotice = `📷 You took a ${actionLabel}.`;
        window.chatManager.appendMessage({
            message_type: 'system',
            message: selfNotice,
            created_at: new Date().toISOString()
        }, true);
        showToast('⚠️ Screenshot alert was sent to the chat participant.', 'warning');

        // 2. Broadcast via WebSocket to the other user
        if (window.wsClient && window.wsClient.isConnected) {
            window.wsClient.send({
                type: 'screenshot_alert',
                receiver_id: friend.id,
                target_user_id: friend.id,
                sender_id: window.CURRENT_USER.id,
                sender_name: window.CURRENT_USER.fullname,
                action_type: actionType,
                notice: noticeMessage
            });
        }

        // 3. Persist in database & notify receiver via API
        fetch('api/messages/screenshot-alert.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                target_user_id: friend.id,
                action_type: actionType
            })
        }).catch(err => console.warn('Screenshot alert API error', err));
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    window.privacyShield = new PrivacyShield();
});
