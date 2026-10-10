// assets/js/calls.js - Call UI, Status State, Ringback, and Active Call Timer Controller

// CallAudioKeepalive: Provides continuous background audio stream & pre-decoded ringtone buffer
// to bypass mobile browser (Chrome / Safari) background freezing and autoplay blocking.
class CallAudioKeepalive {
    constructor() {
        this.ctx = null;
        this.silentNode = null;
        this.html5Audio = null;
        this.isUnlocked = false;
        this.ringtoneBuffer = null;
        this.activeRingtoneSource = null;
        this.isRinging = false;
    }

    async init() {
        if (this.isUnlocked) {
            if (this.ctx && this.ctx.state === 'suspended') {
                try { await this.ctx.resume(); } catch (e) {}
            }
            return;
        }

        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                if (!this.ctx) {
                    this.ctx = new AudioCtx();
                }
                if (this.ctx.state === 'suspended') {
                    await this.ctx.resume();
                }

                // Inaudible silent buffer looped forever.
                // Mobile OS (Android/iOS) recognizes active media playback and prevents
                // cgroup process suspension/freezing when user locks phone or switches apps.
                if (!this.silentNode && this.ctx) {
                    const buffer = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate), this.ctx.sampleRate);
                    const source = this.ctx.createBufferSource();
                    source.buffer = buffer;
                    source.loop = true;
                    const gain = this.ctx.createGain();
                    gain.gain.setValueAtTime(0.00001, this.ctx.currentTime);
                    source.connect(gain);
                    gain.connect(this.ctx.destination);
                    source.start(0);
                    this.silentNode = source;
                }
            }

            // HTML5 backup keepalive element
            this.html5Audio = document.getElementById('keepAliveAudio');
            if (this.html5Audio) {
                this.html5Audio.volume = 0.001;
                const p = this.html5Audio.play();
                if (p !== undefined) p.catch(() => {});
            }

            // Also prime the incoming ringtone audio element
            const rTone = document.getElementById('incomingRingtoneAudio');
            if (rTone) {
                rTone.volume = 1.0;
                rTone.load();
            }

            // Preload and decode Apple iPhone Marimba MP3 into memory buffer
            this.preloadRingtone();

            this.isUnlocked = true;
            console.log('[CallAudioKeepalive] Mobile background keepalive and audio engine active.');
        } catch (e) {
            console.warn('[CallAudioKeepalive] Init warning:', e);
        }
    }

    async preloadRingtone() {
        if (this.ringtoneBuffer || !this.ctx) return;
        try {
            const resp = await fetch('assets/sounds/ringtone.mp3');
            if (resp.ok) {
                const arrayBuf = await resp.arrayBuffer();
                this.ringtoneBuffer = await this.ctx.decodeAudioData(arrayBuf);
                console.log('[CallAudioKeepalive] Apple Marimba ringtone decoded into RAM.');
            }
        } catch (e) {
            console.warn('[CallAudioKeepalive] Preload ringtone warning:', e);
        }
    }

    playRingtone() {
        this.isRinging = true;
        this.stopRingtone(); // Clean any previous instance

        // 1. Primary: Play pre-decoded Apple iPhone Marimba MP3 via running AudioContext
        // Because the AudioContext is already running and unlocked, this is 100% immune to autoplay blocks.
        if (this.ctx && this.ringtoneBuffer) {
            try {
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume().catch(() => {});
                }
                const src = this.ctx.createBufferSource();
                src.buffer = this.ringtoneBuffer;
                src.loop = true;
                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(1.0, this.ctx.currentTime);
                src.connect(gain);
                gain.connect(this.ctx.destination);
                src.start(0);
                this.activeRingtoneSource = src;
            } catch (e) {
                console.warn('[CallAudioKeepalive] WebAudio buffer play warning:', e);
            }
        }

        // 2. Parallel: Play HTML5 <audio> element
        try {
            const rTone = document.getElementById('incomingRingtoneAudio');
            if (rTone) {
                rTone.currentTime = 0;
                rTone.volume = 1.0;
                const p = rTone.play();
                if (p !== undefined) p.catch(() => {});
            }
        } catch (e) {}
    }

    stopRingtone() {
        this.isRinging = false;
        if (this.activeRingtoneSource) {
            try {
                this.activeRingtoneSource.stop();
                this.activeRingtoneSource.disconnect();
            } catch (e) {}
            this.activeRingtoneSource = null;
        }

        try {
            const rTone = document.getElementById('incomingRingtoneAudio');
            if (rTone) {
                rTone.pause();
                rTone.currentTime = 0;
            }
        } catch (e) {}
    }

    isPlaying() {
        return !!this.activeRingtoneSource || (this.html5Audio && !this.html5Audio.paused);
    }
}

window.callKeepalive = new CallAudioKeepalive();

class CallController {
    constructor() {
        this.activeCallOverlay = document.getElementById('callModalOverlay');
        this.incomingBox = document.getElementById('incomingCallBox');
        this.voiceBox = document.getElementById('activeVoiceBox');
        this.videoBox = document.getElementById('activeVideoBox');
        this.callTimerEl = document.getElementById('callTimerDisplay');
        this.statusTextEl = document.getElementById('voiceCallStatusText');
        this.timerInterval = null;
        this.callSeconds = 0;
        this.audioContext = null;
        this.ringbackCtx = null;
        this.ringtoneTimeout = null;
        this.ringbackTimeout = null;
        this.isRinging = false;
        this.isRingbackPlaying = false;
        this.pendingIncomingPayload = null;
        this.acceptPendingCallId = null;
        this.isAcceptingCall = false;
        this.incomingNotification = null;
        this.vibrateInterval = null;
        this.titleFlashInterval = null;
        this.originalTitle = null;

        this.wakeLock = null;
        this.notificationInterval = null;

        this.initControls();
        this.initServiceWorkerBridge();
        this.requestNotificationPermission();
        this.initAudioUnlock();
    }

    initControls() {
        // Accept Incoming Call
        const btnAccept = document.getElementById('btnAcceptCall');
        if (btnAccept) {
            btnAccept.type = 'button';
            const unlockCallAudio = () => {
                const remoteAudio = document.getElementById('remoteAudio');
                if (remoteAudio) {
                    remoteAudio.muted = false;
                    remoteAudio.volume = 1;
                    remoteAudio.play().catch(() => {});
                }
                if (!window.webrtc && typeof WebRTCManager === 'function') {
                    window.webrtc = new WebRTCManager(window.wsClient || null);
                }
                if (window.webrtc) window.webrtc.unlockAudioOutput();
            };
            btnAccept.addEventListener('pointerdown', unlockCallAudio, { passive: true });
            btnAccept.addEventListener('click', unlockCallAudio);
        }

        // Decline Incoming Call
        const btnDecline = document.getElementById('btnDeclineCall');
        if (btnDecline) {
            btnDecline.addEventListener('click', () => {
                this.stopRingtone();
                this.stopRingbackTone();
                if (!window.webrtc && typeof WebRTCManager === 'function') {
                    window.webrtc = new WebRTCManager(window.wsClient || null);
                }
                if (this.pendingIncomingPayload && window.webrtc) {
                    window.webrtc.declineCall(this.pendingIncomingPayload.from_user_id, this.pendingIncomingPayload.call_id);
                } else if (this.pendingIncomingPayload && this.pendingIncomingPayload.call_id) {
                    fetch('api/calls/update.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ call_id: this.pendingIncomingPayload.call_id, status: 'declined' })
                    }).catch(() => {});
                }
                this.hideCallOverlay();
            });
        }

        // Remind Me / Mute Ringtone (iOS Style)
        const btnMuteRing = document.getElementById('btnSilenceRingtone');
        if (btnMuteRing) {
            btnMuteRing.addEventListener('click', () => {
                this.stopRingtone();
                this.stopVibration();
                if (typeof showToast === 'function') showToast('Codka wicitaanka waa la aamusiyay', 'info');
            });
        }

        // Quick Message Button (iOS Style)
        const btnQuickMsg = document.getElementById('btnQuickMessage');
        if (btnQuickMsg) {
            btnQuickMsg.addEventListener('click', () => {
                const payload = this.pendingIncomingPayload;
                if (payload) {
                    const peerId = payload.from_user_id || payload.caller_id;
                    if (window.webrtc) window.webrtc.declineCall(peerId, payload.call_id);
                    this.hideCallOverlay();
                    if (window.chatManager && typeof window.chatManager.openChat === 'function') {
                        window.chatManager.openChat(peerId);
                    }
                }
            });
        }

        // Notification & Background Call Audio Permission Banner
        const banner = document.getElementById('notifPermissionBanner');
        const btnEnable = document.getElementById('btnEnableNotif');
        if (banner) {
            const checkBanner = () => {
                if ('Notification' in window && Notification.permission === 'granted' && window.callKeepalive && window.callKeepalive.isUnlocked) {
                    banner.style.display = 'none';
                } else if ('Notification' in window && Notification.permission !== 'granted') {
                    banner.style.display = 'flex';
                }
            };
            checkBanner();

            if (btnEnable) {
                btnEnable.addEventListener('click', async () => {
                    if (window.callKeepalive) {
                        await window.callKeepalive.init();
                    }
                    if ('Notification' in window) {
                        try {
                            const perm = await Notification.requestPermission();
                            if (perm === 'granted') {
                                banner.style.display = 'none';
                                if (typeof showToast === 'function') {
                                    showToast('Ogaysiisyada iyo codka wicitaanka waa la oggolaaday!', 'success');
                                }
                            }
                        } catch (e) {}
                    }
                });
            }
        }

        // End Active Call
        const endBtns = [document.getElementById('btnEndVoiceCall'), document.getElementById('btnEndVideoCall')];
        endBtns.forEach(b => {
            if (b) {
                b.addEventListener('click', () => {
                    this.stopRingbackTone();
                    this.stopRingtone();
                    this.stopCallTimer();
                    if (!window.webrtc && typeof WebRTCManager === 'function') {
                        window.webrtc = new WebRTCManager(window.wsClient || null);
                    }
                    if (window.webrtc) {
                        window.webrtc.endCall('ended', this.callSeconds);
                    }
                    this.hideCallOverlay();
                    this.playCallEndTone();
                });
            }
        });

        // Toggle Mute Audio
        const muteBtns = [document.getElementById('btnToggleVoiceMute'), document.getElementById('btnToggleVideoAudio')];
        muteBtns.forEach(b => {
            if (b) {
                b.addEventListener('click', () => {
                    if (window.webrtc) {
                        const isMuted = window.webrtc.toggleAudioMute();
                        b.classList.toggle('muted', isMuted);
                        b.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
                    }
                });
            }
        });

        // Toggle Camera (Video Call)
        const toggleCamBtn = document.getElementById('btnToggleVideoCam');
        if (toggleCamBtn) {
            toggleCamBtn.addEventListener('click', () => {
                if (window.webrtc) {
                    const isMuted = window.webrtc.toggleVideoMute();
                    toggleCamBtn.classList.toggle('muted', isMuted);
                    toggleCamBtn.innerHTML = isMuted ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
                }
            });
        }

        // Toggle Speaker Output (Speaker Out / Earpiece)
        const speakerBtns = [document.getElementById('btnToggleVoiceSpeaker'), document.getElementById('btnToggleVideoSpeaker')];
        speakerBtns.forEach(b => {
            if (b) {
                b.addEventListener('click', async () => {
                    if (window.webrtc && typeof window.webrtc.toggleSpeakerOut === 'function') {
                        const isSpeaker = await window.webrtc.toggleSpeakerOut();
                        speakerBtns.forEach(btn => {
                            if (!btn) return;
                            btn.classList.toggle('active', isSpeaker);
                            btn.classList.toggle('off', !isSpeaker);
                            btn.innerHTML = isSpeaker ? '<i class="fas fa-volume-high"></i>' : '<i class="fas fa-volume-xmark"></i>';
                            btn.title = isSpeaker ? 'Speaker Out: ON' : 'Speaker Out: OFF';
                        });
                        if (typeof showToast === 'function') {
                            showToast(isSpeaker ? 'Speaker Out: ON (Codka Sare)' : 'Speaker Out: OFF (Codka Hoose / Dhagta)', 'info');
                        }
                    }
                });
            }
        });
    }

    // 1. Initial State: Outgoing Call Dialing (Calling...)
    startOutgoingCall(peerName, peerImage, callType = 'voice') {
        this.stopCallTimer();
        this.stopRingbackTone();
        this.stopRingtone();
        this.callSeconds = 0;

        this.resetOverlay();
        this.activeCallOverlay.classList.add('active');

        // Show voice box as dialing container for both voice and video
        if (this.voiceBox) {
            this.voiceBox.style.display = 'flex';
            this.voiceBox.classList.add('active');
        }
        document.getElementById('voiceCallPeerName').textContent = peerName;
        const imgEl = document.getElementById('voiceCallPeerAvatar');
        if (imgEl) {
            const resolved = typeof window.resolveAvatarUrl === 'function'
                ? window.resolveAvatarUrl(peerImage)
                : (peerImage || 'assets/images/default-avatar.png');
            imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = 'assets/images/default-avatar.png'; };
            imgEl.src = resolved;
            const bgEl = document.getElementById('voiceCallAmbientBg');
            if (bgEl) bgEl.style.backgroundImage = `url("${resolved}")`;
        }

        // IMPORTANT: Start in "Calling..." state and HIDE timer until call is answered
        if (this.statusTextEl) {
            this.statusTextEl.textContent = 'Calling...';
        }
        if (this.callTimerEl) {
            this.callTimerEl.style.display = 'none';
            this.callTimerEl.textContent = '00:00';
        }

        // Reset mute buttons to default unmuted state
        const muteBtns = [document.getElementById('btnToggleVoiceMute'), document.getElementById('btnToggleVideoAudio')];
        muteBtns.forEach(b => {
            if (b) {
                b.classList.remove('muted');
                b.innerHTML = '<i class="fas fa-microphone"></i>';
            }
        });
        const camBtn = document.getElementById('btnToggleVideoCam');
        if (camBtn) {
            camBtn.classList.remove('muted');
            camBtn.innerHTML = '<i class="fas fa-video"></i>';
        }

        // Play standard telephone ringback tone to caller
        this.startRingbackTone();

        // NOTE: We DO NOT start the call timer here! Timer only starts when answered!
    }

    // 2. Ringing State: Remote device acknowledged & is ringing
    setStatusRinging() {
        if (this.statusTextEl) {
            this.statusTextEl.innerHTML = '<span style="color:var(--primary);font-weight:700;"><i class="fas fa-bell"></i> Ringing...</span>';
        }
        this.startRingbackTone();
    }

    // 3. Offline State: Recipient not connected to network
    setStatusOffline() {
        if (this.statusTextEl) {
            this.statusTextEl.innerHTML = '<span style="color:var(--text-muted);"><i class="fas fa-wifi"></i> Calling... (User is offline)</span>';
        }
    }

    // 4. Incoming Call Notification Screen on Recipient's side
    showIncomingCall(payload) {
        this.pendingIncomingPayload = payload;
        this.resetOverlay();
        this.activeCallOverlay.classList.add('active');
        if (this.incomingBox) {
            this.incomingBox.style.display = 'flex';
            this.incomingBox.classList.add('active');
        }

        const callerName = payload.caller_name || 'A/N User';
        const isVideo = payload.call_type === 'video';

        const nameEl = document.getElementById('incomingCallerName');
        if (nameEl) nameEl.textContent = callerName;

        const typeEl = document.getElementById('incomingCallType');
        if (typeEl) typeEl.textContent = isVideo ? 'Incoming Video Call 🎥' : 'Incoming Call';

        const subtextEl = document.getElementById('incomingCallSubtext');
        if (subtextEl) subtextEl.textContent = isVideo ? 'A/N Chat Video' : 'A/N Chat Audio';

        const avatarEl = document.getElementById('incomingCallerAvatar');
        if (avatarEl) {
            const resolved = typeof window.resolveAvatarUrl === 'function'
                ? window.resolveAvatarUrl(payload.caller_image)
                : (payload.caller_image || 'assets/images/default-avatar.png');
            avatarEl.onerror = () => { avatarEl.onerror = null; avatarEl.src = 'assets/images/default-avatar.png'; };
            avatarEl.src = resolved;
            const inBgEl = document.getElementById('incomingCallAmbientBg');
            if (inBgEl) inBgEl.style.backgroundImage = `url("${resolved}")`;
        }

        // 1. Play loud ringing audio
        this.startRingtone();
        // 2. Keep screen awake and lit up while on the table
        this.acquireWakeLock();
        // 3. Show lockscreen caller widget via MediaSession
        this.setupMediaSession(payload);
        // 4. Repeated system notification with actions & vibration
        this.showSystemCallNotification(payload);
        // 5. Hardware vibration loop
        this.startVibration();
        // 6. Tab title flashing
        this.startTitleFlash(payload.caller_name || 'A/N User');
    }

    async acceptIncomingCall() {
        const payload = this.pendingIncomingPayload;
        if (!payload || this.isAcceptingCall) return false;

        // The database notification can arrive while the caller is still
        // opening its microphone. Keep the accept intent until the SDP offer
        // arrives over WebSocket; answering an empty offer cannot carry audio.
        if (!Object.prototype.hasOwnProperty.call(payload, 'sdp')) {
            this.acceptPendingCallId = parseInt(payload.call_id || payload.id || 0);
            const typeEl = document.getElementById('incomingCallType');
            if (typeEl) typeEl.textContent = 'Connecting to caller...';
            return true;
        }
        if (!payload.sdp) {
            this.acceptPendingCallId = null;
            const typeEl = document.getElementById('incomingCallType');
            if (typeEl) typeEl.textContent = 'Wacaha makarafoonkiisa ma uusan oggolaan.';
            if (typeof showToast === 'function') showToast('Wacaha ha oggolaado makarafoonka kadibna mar kale ha soo waco.', 'error');
            return false;
        }

        this.isAcceptingCall = true;
        this.acceptPendingCallId = null;
        this.stopRingtone();
        this.stopRingbackTone();
        this.releaseWakeLock();
        this.clearMediaSession();
        this.closeSystemCallNotification();
        this.stopVibration();
        this.stopTitleFlash();

        // Show immediate progress, but only mark Connected when SDP/media setup succeeds.
        this.showActiveCallScreen(payload.call_type || 'voice');
        if (this.statusTextEl) {
            this.statusTextEl.textContent = 'Connecting...';
        }

        try {
            if (!window.webrtc && typeof WebRTCManager === 'function') {
                window.webrtc = new WebRTCManager(window.wsClient || null);
            }
            if (window.webrtc) {
                await window.webrtc.handleIncomingOffer(payload);
                if (this.statusTextEl) {
                    this.statusTextEl.textContent = 'Connecting media...';
                }
            } else {
                throw new Error('WebRTC is unavailable in this browser.');
            }
            return true;
        } catch (error) {
            console.error('[Call] Could not accept incoming call:', error);
            this.hideCallOverlay();
            if (window.webrtc) window.webrtc.cleanup();
            if (typeof showToast === 'function') showToast(error.message || 'Wicitaanka lama xiri karin.', 'error');
            return false;
        } finally {
            this.isAcceptingCall = false;
        }
    }

    // 5. Active Call Screen (Call is Answered & Connected)
    showActiveCallScreen(callType) {
        this.stopRingtone();
        this.stopRingbackTone();
        this.resetOverlay();
        this.activeCallOverlay.classList.add('active');

        if (callType === 'video') {
            if (this.videoBox) {
                this.videoBox.style.display = 'flex';
                this.videoBox.classList.add('active');
            }
            const vTimer = document.getElementById('videoCallTimer');
            if (vTimer) vTimer.textContent = '00:00';
        } else {
            if (this.voiceBox) {
                this.voiceBox.style.display = 'flex';
                this.voiceBox.classList.add('active');
            }
            if (this.pendingIncomingPayload) {
                const nameEl = document.getElementById('voiceCallPeerName');
                if (nameEl && this.pendingIncomingPayload.caller_name) {
                    nameEl.textContent = this.pendingIncomingPayload.caller_name;
                }
                const avatarEl = document.getElementById('voiceCallPeerAvatar');
                if (avatarEl && this.pendingIncomingPayload.caller_image) {
                    const resolved = typeof window.resolveAvatarUrl === 'function'
                        ? window.resolveAvatarUrl(this.pendingIncomingPayload.caller_image)
                        : (this.pendingIncomingPayload.caller_image || 'assets/images/default-avatar.png');
                    avatarEl.onerror = () => { avatarEl.onerror = null; avatarEl.src = 'assets/images/default-avatar.png'; };
                    avatarEl.src = resolved;
                    const bgEl = document.getElementById('voiceCallAmbientBg');
                    if (bgEl) bgEl.style.backgroundImage = `url("${resolved}")`;
                }
            }
            if (this.statusTextEl) {
                this.statusTextEl.textContent = 'Connecting media...';
            }
            if (this.callTimerEl) {
                this.callTimerEl.style.display = 'inline-block';
                this.callTimerEl.textContent = '00:00';
            }
        }
    }

    resetOverlay() {
        if (this.incomingBox) {
            this.incomingBox.style.display = 'none';
            this.incomingBox.classList.remove('active');
        }
        if (this.voiceBox) {
            this.voiceBox.style.display = 'none';
            this.voiceBox.classList.remove('active');
        }
        if (this.videoBox) {
            this.videoBox.style.display = 'none';
            this.videoBox.classList.remove('active');
        }
    }

    hideCallOverlay() {
        this.stopRingtone();
        this.stopRingbackTone();
        this.releaseWakeLock();
        this.clearMediaSession();
        this.closeSystemCallNotification();
        this.stopVibration();
        this.stopTitleFlash();
        this.stopCallTimer();
        this.resetOverlay();
        this.acceptPendingCallId = null;
        if (this.activeCallOverlay) {
            this.activeCallOverlay.classList.remove('active');
        }
        const speakerBtns = [document.getElementById('btnToggleVoiceSpeaker'), document.getElementById('btnToggleVideoSpeaker')];
        speakerBtns.forEach(btn => {
            if (!btn) return;
            btn.classList.add('active');
            btn.classList.remove('off');
            btn.innerHTML = '<i class="fas fa-volume-high"></i>';
            btn.title = 'Speaker Out';
        });
        const muteBtns = [document.getElementById('btnToggleVoiceMute'), document.getElementById('btnToggleVideoAudio')];
        muteBtns.forEach(btn => {
            if (!btn) return;
            btn.classList.remove('muted');
            btn.innerHTML = '<i class="fas fa-microphone"></i>';
        });
        const camBtn = document.getElementById('btnToggleVideoCam');
        if (camBtn) {
            camBtn.classList.remove('muted');
            camBtn.innerHTML = '<i class="fas fa-video"></i>';
        }
    }

    // Timer calculation ONLY starts when conversation officially begins
    startCallTimer() {
        this.callSeconds = 0;
        clearInterval(this.timerInterval);
        if (this.callTimerEl) {
            this.callTimerEl.style.display = 'inline-block';
            this.callTimerEl.textContent = '00:00';
        }
        const vTimer = document.getElementById('videoCallTimer');
        if (vTimer) vTimer.textContent = '00:00';

        this.timerInterval = setInterval(() => {
            this.callSeconds++;
            const mins = String(Math.floor(this.callSeconds / 60)).padStart(2, '0');
            const secs = String(this.callSeconds % 60).padStart(2, '0');
            const formatted = `${mins}:${secs}`;
            if (this.callTimerEl) this.callTimerEl.textContent = formatted;
            if (vTimer) vTimer.textContent = formatted;
        }, 1000);
    }

    stopCallTimer() {
        clearInterval(this.timerInterval);
    }

    initAudioUnlock() {
        const unlock = () => {
            if (window.callKeepalive) {
                window.callKeepalive.init();
            }
        };

        ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(evt => {
            window.addEventListener(evt, unlock, { passive: true });
        });
    }

    async acquireWakeLock() {
        if ('wakeLock' in navigator && navigator.wakeLock.request) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                this.wakeLock.addEventListener('release', () => {
                    this.wakeLock = null;
                });
            } catch (e) {
                console.warn('[Call] WakeLock request warning:', e);
            }
        }
    }

    releaseWakeLock() {
        if (this.wakeLock) {
            try {
                this.wakeLock.release();
            } catch (e) {}
            this.wakeLock = null;
        }
    }

    setupMediaSession(payload) {
        if ('mediaSession' in navigator && window.MediaMetadata) {
            try {
                const callerName = payload.caller_name || 'A/N User';
                const avatarUrl = payload.caller_image && typeof window.resolveAvatarUrl === 'function'
                    ? window.resolveAvatarUrl(payload.caller_image)
                    : 'assets/icons/icon-192.png';

                navigator.mediaSession.metadata = new MediaMetadata({
                    title: `📞 Wicitaan: ${callerName}`,
                    artist: 'A/N Chat - Wicitaan Soo Dhacaya...',
                    album: payload.call_type === 'video' ? 'Video Call 🎥' : 'Voice Call 📞',
                    artwork: [
                        { src: avatarUrl, sizes: '192x192', type: 'image/png' },
                        { src: avatarUrl, sizes: '512x512', type: 'image/png' }
                    ]
                });
                navigator.mediaSession.playbackState = 'playing';

                navigator.mediaSession.setActionHandler('play', () => this.acceptIncomingCall());
                navigator.mediaSession.setActionHandler('pause', () => this.acceptIncomingCall());
                navigator.mediaSession.setActionHandler('nexttrack', () => this.acceptIncomingCall());
                navigator.mediaSession.setActionHandler('previoustrack', () => {
                    if (window.webrtc) window.webrtc.declineCall(payload.from_user_id || payload.caller_id, payload.call_id);
                    this.hideCallOverlay();
                });
            } catch (e) {
                console.warn('[Call] MediaSession setup error:', e);
            }
        }
    }

    clearMediaSession() {
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.playbackState = 'none';
                navigator.mediaSession.setActionHandler('play', null);
                navigator.mediaSession.setActionHandler('pause', null);
                navigator.mediaSession.setActionHandler('nexttrack', null);
                navigator.mediaSession.setActionHandler('previoustrack', null);
            } catch (e) {}
        }
    }

    startRingbackTone() {
        if (this.isRingbackPlaying) return;
        this.isRingbackPlaying = true;
        try {
            const ringbackAudio = document.getElementById('outgoingRingbackAudio');
            if (ringbackAudio) {
                ringbackAudio.volume = 0.85;
                ringbackAudio.currentTime = 0;
                const p = ringbackAudio.play();
                if (p !== undefined) {
                    p.catch(() => this.playWebAudioRingback());
                }
            } else {
                this.playWebAudioRingback();
            }
        } catch (e) {
            this.playWebAudioRingback();
        }
    }

    stopRingbackTone() {
        this.isRingbackPlaying = false;
        clearTimeout(this.ringbackTimeout);
        try {
            const ringbackAudio = document.getElementById('outgoingRingbackAudio');
            if (ringbackAudio) {
                ringbackAudio.pause();
                ringbackAudio.currentTime = 0;
            }
        } catch (e) {}

        if (this.ringbackCtx) {
            this.ringbackCtx.close().catch(() => {});
            this.ringbackCtx = null;
        }
    }

    playWebAudioRingback() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            this.ringbackCtx = new AudioContext();
            if (this.ringbackCtx.state === 'suspended') {
                this.ringbackCtx.resume().catch(() => {});
            }

            const playTone = () => {
                if (!this.isRingbackPlaying || !this.ringbackCtx) return;
                if (this.ringbackCtx.state === 'suspended') {
                    this.ringbackCtx.resume().catch(() => {});
                }
                const now = this.ringbackCtx.currentTime;
                const osc1 = this.ringbackCtx.createOscillator();
                const osc2 = this.ringbackCtx.createOscillator();
                const gain = this.ringbackCtx.createGain();

                osc1.type = 'sine';
                osc1.frequency.setValueAtTime(440, now);
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(480, now);

                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(this.ringbackCtx.destination);

                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 1.2);
                osc2.stop(now + 1.2);

                this.ringbackTimeout = setTimeout(playTone, 3000);
            };

            playTone();
        } catch (e) {
            console.warn('[Call] WebAudio ringback error:', e);
        }
    }

    // Loud, clear ringtone for Incoming Calls
    startRingtone() {
        if (this.isRinging) return;
        this.isRinging = true;

        if (window.callKeepalive) {
            window.callKeepalive.playRingtone();
        } else {
            try {
                const ringAudio = document.getElementById('incomingRingtoneAudio');
                if (ringAudio) {
                    ringAudio.volume = 1.0;
                    ringAudio.currentTime = 0;
                    ringAudio.play().catch(() => {});
                }
            } catch (e) {}
        }
    }

    stopRingtone() {
        this.isRinging = false;
        clearTimeout(this.ringtoneTimeout);
        if (window.callKeepalive) {
            window.callKeepalive.stopRingtone();
        }
        try {
            const ringAudio = document.getElementById('incomingRingtoneAudio');
            if (ringAudio) {
                ringAudio.pause();
                ringAudio.currentTime = 0;
            }
        } catch (e) {}

        if (this.audioContext) {
            try { this.audioContext.close().catch(() => {}); } catch (e) {}
            this.audioContext = null;
        }
    }

    playWebAudioRingtone() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            this.audioContext = new AudioContext();
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {});
            }

            const playBurst = () => {
                if (!this.isRinging || !this.audioContext) return;
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume().catch(() => {});
                }
                const now = this.audioContext.currentTime;
                const osc1 = this.audioContext.createOscillator();
                const osc2 = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();

                osc1.type = 'triangle';
                osc2.type = 'sine';
                osc1.frequency.setValueAtTime(523, now);
                osc1.frequency.setValueAtTime(659, now + 0.15);
                osc1.frequency.setValueAtTime(784, now + 0.3);
                osc1.frequency.setValueAtTime(1046, now + 0.45);

                osc2.frequency.setValueAtTime(1046, now);
                osc2.frequency.setValueAtTime(784, now + 0.45);

                gain.gain.setValueAtTime(0.7, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(this.audioContext.destination);

                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 0.9);
                osc2.stop(now + 0.9);

                this.ringtoneTimeout = setTimeout(playBurst, 1500);
            };

            playBurst();
        } catch (e) {
            console.warn('[Call] WebAudio ringtone error:', e);
        }
    }

    playCallEndTone() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(480, now);
            osc.frequency.setValueAtTime(320, now + 0.15);

            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.35);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.35);
        } catch (e) {}
    }

    requestNotificationPermission() {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'granted') return;

        const ask = () => {
            try {
                Notification.requestPermission().then(perm => {
                    console.info('[Call] System Notification permission status:', perm);
                }).catch(() => {});
            } catch (e) {}
        };

        if (Notification.permission === 'default') {
            ask();
            window.addEventListener('click', ask, { once: true });
            window.addEventListener('touchstart', ask, { once: true });
        }
    }

    initServiceWorkerBridge() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'accept_incoming_call') {
                    this.acceptIncomingCall();
                } else if (event.data && event.data.type === 'decline_incoming_call') {
                    if (this.pendingIncomingPayload) {
                        const p = this.pendingIncomingPayload;
                        if (window.webrtc) window.webrtc.declineCall(p.from_user_id || p.caller_id, p.call_id);
                        this.hideCallOverlay();
                    }
                } else if (event.data && event.data.type === 'view_incoming_call') {
                    if (this.pendingIncomingPayload) {
                        this.showIncomingCall(this.pendingIncomingPayload);
                    }
                }
            });
        }
    }

    showSystemCallNotification(payload) {
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            this.requestNotificationPermission();
            return;
        }

        this.dispatchNotification(payload);

        // Keep Android lockscreen and heads-up banner buzzing while phone is sitting on the table
        clearInterval(this.notificationInterval);
        this.notificationInterval = setInterval(() => {
            if (this.isRinging && ('Notification' in window) && Notification.permission === 'granted') {
                this.dispatchNotification(payload);
            } else {
                clearInterval(this.notificationInterval);
            }
        }, 3500);
    }

    dispatchNotification(payload) {
        const callerName = payload.caller_name || 'A/N User';
        const isVideo = payload.call_type === 'video';
        const typeText = isVideo ? 'Wicitaan Muuqaal ah (Video Call 🎥)' : 'Wicitaan Cod ah (Voice Call 📞)';
        const title = `📞 Wicitaan: ${callerName}`;
        const avatarUrl = payload.caller_image && typeof window.resolveAvatarUrl === 'function'
            ? window.resolveAvatarUrl(payload.caller_image)
            : 'assets/icons/icon-192.png';

        const options = {
            body: `${typeText}\n📞 Taabo si aad u aragto shaashadda wicitaanka!`,
            icon: avatarUrl,
            image: avatarUrl,
            badge: 'assets/icons/icon-192.png',
            tag: 'incoming-call',
            renotify: true,
            requireInteraction: true,
            vibrate: [1000, 600, 1000, 600, 1000, 600, 1000, 600],
            silent: false,
            data: {
                call_id: payload.call_id,
                type: 'incoming_call',
                url: window.location.href
            },
            actions: [
                { action: 'accept', title: '📞 Qabo' },
                { action: 'decline', title: '❌ Diid' }
            ]
        };

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(reg => {
                if (reg && typeof reg.showNotification === 'function') {
                    reg.showNotification(title, options).catch(() => {
                        this.showFallbackNotification(title, options);
                    });
                } else if (navigator.serviceWorker.ready) {
                    navigator.serviceWorker.ready.then(activeReg => {
                        if (activeReg && typeof activeReg.showNotification === 'function') {
                            activeReg.showNotification(title, options).catch(() => {
                                this.showFallbackNotification(title, options);
                            });
                        } else {
                            this.showFallbackNotification(title, options);
                        }
                    }).catch(() => this.showFallbackNotification(title, options));
                } else {
                    this.showFallbackNotification(title, options);
                }
            }).catch(() => {
                this.showFallbackNotification(title, options);
            });
        } else {
            this.showFallbackNotification(title, options);
        }
    }

    showFallbackNotification(title, options) {
        try {
            // Strip options that trigger TypeError in native Notification constructor
            const fallbackOptions = {
                body: options.body,
                icon: options.icon,
                badge: options.badge,
                tag: options.tag,
                renotify: options.renotify,
                requireInteraction: options.requireInteraction,
                silent: options.silent
            };
            const notif = new Notification(title, fallbackOptions);
            this.incomingNotification = notif;
            notif.onclick = () => {
                try { window.focus(); } catch (e) {}
                this.acceptIncomingCall();
                notif.close();
            };
        } catch (e) {
            console.warn('[Call] Native Notification creation warning:', e);
        }
    }

    closeSystemCallNotification() {
        if (this.notificationInterval) {
            clearInterval(this.notificationInterval);
            this.notificationInterval = null;
        }
        if (this.incomingNotification) {
            try { this.incomingNotification.close(); } catch (e) {}
            this.incomingNotification = null;
        }
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(regs => {
                regs.forEach(reg => {
                    reg.getNotifications().then(notifs => {
                        notifs.forEach(n => {
                            if (!n.tag || n.tag.startsWith('incoming-call')) {
                                n.close();
                            }
                        });
                    }).catch(() => {});
                });
            }).catch(() => {});
        }
    }

    startVibration() {
        if ('vibrate' in navigator) {
            try {
                // Intense phone call vibration pattern: 1000ms vibrate, 600ms silence
                const pattern = [1000, 600, 1000, 600, 1000, 600, 1000, 600];
                navigator.vibrate(pattern);
                clearInterval(this.vibrateInterval);
                this.vibrateInterval = setInterval(() => {
                    if (this.isRinging && 'vibrate' in navigator) {
                        navigator.vibrate(pattern);
                    } else {
                        clearInterval(this.vibrateInterval);
                    }
                }, 3500);
            } catch (e) {}
        }
    }

    stopVibration() {
        if (this.vibrateInterval) {
            clearInterval(this.vibrateInterval);
            this.vibrateInterval = null;
        }
        if ('vibrate' in navigator) {
            try { navigator.vibrate(0); } catch (e) {}
        }
    }

    startTitleFlash(callerName) {
        this.stopTitleFlash();
        this.originalTitle = document.title;
        let toggle = false;
        this.titleFlashInterval = setInterval(() => {
            if (!this.isRinging) {
                this.stopTitleFlash();
                return;
            }
            document.title = toggle ? `📞 Wicitaan: ${callerName}!` : `🔔 Soo qabo wicitaanka...`;
            toggle = !toggle;
        }, 800);
    }

    stopTitleFlash() {
        if (this.titleFlashInterval) {
            clearInterval(this.titleFlashInterval);
            this.titleFlashInterval = null;
        }
        if (this.originalTitle) {
            document.title = this.originalTitle;
            this.originalTitle = null;
        }
    }
}

window.CallController = CallController;

// Inline fallback keeps the Accept action reachable if another dashboard
// initializer failed before CallController could attach its event listener.
window.acceptIncomingCall = function() {
    if (!window.callController && typeof CallController === 'function') {
        window.callController = new CallController();
    }
    return window.callController ? window.callController.acceptIncomingCall() : false;
};

// Incoming call delivery is started by the call module itself, independently
// from dashboard/message initialization so it cannot be skipped by that code.
let incomingCallRequestPending = false;
let lastCallCheckTime = 0;

async function checkForIncomingCall() {
    const now = Date.now();
    // Safety check: if request was pending for more than 4 seconds, force reset
    if (incomingCallRequestPending && (now - lastCallCheckTime > 4000)) {
        incomingCallRequestPending = false;
    }
    if (incomingCallRequestPending) return;
    incomingCallRequestPending = true;
    lastCallCheckTime = now;

    let abortController = null;
    let timeoutId = null;
    if (typeof AbortController === 'function') {
        abortController = new AbortController();
        timeoutId = setTimeout(() => {
            try { abortController.abort(); } catch (e) {}
        }, 3500);
    }

    try {
        const fetchOpts = { cache: 'no-store', credentials: 'same-origin' };
        if (abortController) fetchOpts.signal = abortController.signal;

        const response = await fetch('api/calls/incoming.php', fetchOpts);
        if (timeoutId) clearTimeout(timeoutId);
        if (!response.ok) return;

        const text = await response.text();
        if (!text || !text.trim()) return;
        const result = JSON.parse(text);
        if (!result || !result.success) return;

        const call = result.data;
        if (call) {
            if (!window.callController) window.callController = new CallController();
            const controller = window.callController;
            const current = controller.pendingIncomingPayload;
            const incomingBoxVisible = controller.incomingBox && controller.incomingBox.style.display === 'flex';
            const anotherCallIsActive = controller.activeCallOverlay
                && controller.activeCallOverlay.classList.contains('active')
                && !incomingBoxVisible;

            if (!anotherCallIsActive && (!current || parseInt(current.call_id) !== parseInt(call.id))) {
                controller.showIncomingCall({
                    from_user_id: parseInt(call.caller_id),
                    call_id: parseInt(call.id),
                    call_type: call.call_type,
                    caller_name: call.caller_name,
                    caller_image: call.caller_image
                });
            } else if (!anotherCallIsActive && current && parseInt(current.call_id) === parseInt(call.id)) {
                // Ensure ringtone is actively playing if incoming call is still ringing
                if (controller.isRinging && window.callKeepalive && !window.callKeepalive.isPlaying()) {
                    window.callKeepalive.playRingtone();
                }
            }
        } else if (window.callController && window.callController.pendingIncomingPayload) {
            const controller = window.callController;
            const incomingBoxVisible = controller.incomingBox && controller.incomingBox.style.display === 'flex';
            if (incomingBoxVisible) {
                controller.hideCallOverlay();
                controller.playCallEndTone();
            }
            controller.pendingIncomingPayload = null;
        }
    } catch (error) {
        // Network error or aborted - keep polling
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        incomingCallRequestPending = false;
    }
}

window.checkForIncomingCall = checkForIncomingCall;

// Web Worker Background Timer: Prevents mobile browsers (Chrome / Safari)
// from freezing the call poller when the tab is hidden, screen is locked, or user is in another app.
function initBackgroundCallWorker() {
    try {
        const workerScript = `
            let callTimer = null;
            let signalTimer = null;
            self.onmessage = function(e) {
                if (e.data === 'start') {
                    if (!callTimer) {
                        callTimer = setInterval(() => self.postMessage('check_call'), 1000);
                    }
                    if (!signalTimer) {
                        signalTimer = setInterval(() => self.postMessage('poll_signal'), 400);
                    }
                } else if (e.data === 'stop') {
                    if (callTimer) clearInterval(callTimer);
                    if (signalTimer) clearInterval(signalTimer);
                    callTimer = null;
                    signalTimer = null;
                }
            };
        `;
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);
        worker.onmessage = (e) => {
            if (e.data === 'check_call') {
                checkForIncomingCall();
            } else if (e.data === 'poll_signal') {
                if (typeof pollIncomingCallOffer === 'function') pollIncomingCallOffer();
            }
        };
        worker.postMessage('start');
        console.log('[Call] Background anti-freeze Web Worker poller active.');
    } catch (e) {
        console.warn('[Call] Web Worker not supported in this environment:', e);
    }

    // High-reliability parallel interval on window for extra redundancy
    setInterval(checkForIncomingCall, 1200);
    setInterval(pollIncomingCallOffer, 400);
}

initBackgroundCallWorker();
checkForIncomingCall();

// Immediate wake-up check whenever the tab/device becomes visible again
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        incomingCallRequestPending = false;
        checkForIncomingCall();
    }
});

// Poll the persisted offer independently of WebSocket availability. This is
// what lets an early Accept tap wait for and then consume the caller's SDP.
const incomingSignalOffsets = Object.create(null);
let incomingSignalPollBusy = false;
async function pollIncomingCallOffer() {
    const controller = window.callController;
    const call = controller && controller.pendingIncomingPayload;
    const callId = parseInt((call && (call.call_id || call.id)) || 0);
    if (!callId || Object.prototype.hasOwnProperty.call(call, 'sdp') || incomingSignalPollBusy) return;
    incomingSignalPollBusy = true;
    try {
        const afterId = incomingSignalOffsets[callId] || 0;
        const response = await fetch(`api/calls/signal.php?call_id=${callId}&after_id=${afterId}`, {
            cache: 'no-store', credentials: 'same-origin'
        });
        if (!response.ok) return;
        const text = await response.text();
        if (!text || !text.trim()) return;
        const result = JSON.parse(text);
        if (!result || !result.success || !Array.isArray(result.data)) return;
        for (const signal of result.data) {
            incomingSignalOffsets[callId] = Math.max(incomingSignalOffsets[callId] || 0, parseInt(signal.id) || 0);
            if (signal.signal_type === 'offer' && parseInt(signal.from_user_id) === parseInt(call.from_user_id || call.caller_id)) {
                controller.pendingIncomingPayload = {
                    ...call,
                    ...(signal.payload || {}),
                    call_id: callId,
                    from_user_id: parseInt(signal.from_user_id)
                };
                if (parseInt(controller.acceptPendingCallId) === callId) {
                    await controller.acceptIncomingCall();
                    break;
                }
            } else if (signal.signal_type === 'ice' && window.webrtc
                && parseInt(window.webrtc.currentCallId) === callId) {
                await window.webrtc.handleIncomingIce(signal.payload || {});
            }
        }
    } catch (error) {
        console.warn('[Call] Could not poll incoming offer:', error);
    } finally {
        incomingSignalPollBusy = false;
    }
}
setInterval(pollIncomingCallOffer, 400);

let _isInitiatingCall = false;

/**
 * Universal Global Function to Initiate a Call with a specific peer
 */
window.startCallWith = function(peerId, peerName, peerAvatar, callType = 'voice') {
    peerId = parseInt(peerId);
    if (!peerId) {
        if (typeof showToast === 'function') showToast('Qofka la wacayo lama helin.', 'error');
        return;
    }

    if (_isInitiatingCall) {
        console.warn('[Call] Call initiation already in progress, ignoring duplicate click.');
        return;
    }
    _isInitiatingCall = true;
    setTimeout(() => { _isInitiatingCall = false; }, 2000);

    // Ensure controllers exist
    if (!window.callController && typeof CallController === 'function') {
        window.callController = new CallController();
    }
    if (!window.webrtc && typeof WebRTCManager === 'function') {
        window.webrtc = new WebRTCManager(window.wsClient || null);
    } else if (window.webrtc && window.wsClient) {
        window.webrtc.ws = window.wsClient;
    }
    const remoteAudio = document.getElementById('remoteAudio');
    if (remoteAudio) {
        remoteAudio.muted = false;
        remoteAudio.volume = 1;
        remoteAudio.play().catch(() => {});
    }
    if (window.webrtc) window.webrtc.unlockAudioOutput();

    // 1. Show dialing overlay with ringback tone
    if (window.callController) {
        window.callController.startOutgoingCall(peerName || 'Friend', peerAvatar || 'assets/images/default-avatar.png', callType);
    }

    // 2. Initiate WebRTC peer connection & DB record
    if (window.webrtc) {
        window.webrtc.initiateCall(peerId, callType);
    }
};

/**
 * Universal Global Function to Start Call from Active Conversation or Selected Friend
 */
window.startCall = function(callType = 'voice') {
    let peerId = null;
    let peerName = 'Friend';
    let peerAvatar = 'assets/images/default-avatar.png';

    // Priority 1: Check chatManager.activeFriend
    if (window.chatManager && window.chatManager.activeFriend && window.chatManager.activeFriend.id) {
        peerId = parseInt(window.chatManager.activeFriend.id);
        peerName = window.chatManager.activeFriend.name || window.chatManager.activeFriend.fullname || peerName;
        peerAvatar = window.chatManager.activeFriend.avatar || window.chatManager.activeFriend.profile_image || peerAvatar;
    }
    // Priority 2: Check window.activeFriendId and cache
    else if (window.activeFriendId) {
        peerId = parseInt(window.activeFriendId);
        if (window.friendsCache && window.friendsCache[peerId]) {
            peerName = window.friendsCache[peerId].fullname || peerName;
            peerAvatar = window.friendsCache[peerId].profile_image || peerAvatar;
        } else {
            const nameEl = document.getElementById('chatHeaderName');
            if (nameEl && nameEl.textContent.trim()) peerName = nameEl.textContent.trim();
        }
    }
    // Priority 3: Check active list item
    else {
        const activeItem = document.querySelector('.list-item.active');
        if (activeItem) {
            const idMatch = activeItem.id.match(/\d+/);
            if (idMatch) {
                peerId = parseInt(idMatch[0]);
                const nameEl = activeItem.querySelector('.list-item-name');
                if (nameEl) peerName = nameEl.textContent.trim();
                const imgEl = activeItem.querySelector('img');
                if (imgEl) peerAvatar = imgEl.src;
            }
        }
    }

    if (!peerId) {
        if (typeof showToast === 'function') {
            showToast('Fadlan marka hore dooro qofka aad rabto inaad wacdo (Select a conversation first)', 'info');
        }
        return;
    }

    window.startCallWith(peerId, peerName, peerAvatar, callType);
};

window.acceptIncomingCall = function() {
    if (window.callController && typeof window.callController.acceptIncomingCall === 'function') {
        return window.callController.acceptIncomingCall();
    }
};

window.declineIncomingCall = function() {
    if (window.callController) {
        window.callController.stopRingtone();
        window.callController.stopRingbackTone();
        if (window.callController.pendingIncomingPayload) {
            const p = window.callController.pendingIncomingPayload;
            if (window.webrtc) {
                window.webrtc.declineCall(p.from_user_id, p.call_id);
            } else if (p.call_id) {
                fetch('api/calls/update.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ call_id: p.call_id, status: 'declined' })
                }).catch(() => {});
            }
        }
        window.callController.hideCallOverlay();
    }
};
