// assets/js/calls.js - Call UI, Status State, Ringback, and Active Call Timer Controller

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

        this.initControls();
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
        this.voiceBox.style.display = 'flex';
        document.getElementById('voiceCallPeerName').textContent = peerName;
        const imgEl = document.getElementById('voiceCallPeerAvatar');
        if (imgEl) {
            const resolved = typeof window.resolveAvatarUrl === 'function'
                ? window.resolveAvatarUrl(peerImage)
                : (peerImage || 'assets/images/default-avatar.png');
            imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = 'assets/images/default-avatar.png'; };
            imgEl.src = resolved;
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
        this.incomingBox.style.display = 'flex';

        document.getElementById('incomingCallerName').textContent = payload.caller_name || 'A/N User';
        document.getElementById('incomingCallType').textContent = payload.call_type === 'video' ? 'Incoming Video Call 🎥' : 'Incoming Voice Call 📞';

        const avatarEl = document.getElementById('incomingCallerAvatar');
        if (avatarEl) {
            const resolved = typeof window.resolveAvatarUrl === 'function'
                ? window.resolveAvatarUrl(payload.caller_image)
                : (payload.caller_image || 'assets/images/default-avatar.png');
            avatarEl.onerror = () => { avatarEl.onerror = null; avatarEl.src = 'assets/images/default-avatar.png'; };
            avatarEl.src = resolved;
        }

        this.startRingtone();
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
            this.videoBox.style.display = 'flex';
            const vTimer = document.getElementById('videoCallTimer');
            if (vTimer) vTimer.textContent = '00:00';
        } else {
            this.voiceBox.style.display = 'flex';
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
        this.incomingBox.style.display = 'none';
        this.voiceBox.style.display = 'none';
        this.videoBox.style.display = 'none';
    }

    hideCallOverlay() {
        this.stopRingtone();
        this.stopRingbackTone();
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

    // Pleasant Outgoing Ringback Tone (Caller hears dialing sound: tuut... tuut...)
    startRingbackTone() {
        if (this.isRingbackPlaying) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ringbackCtx = new AudioContext();
            if (this.ringbackCtx.state === 'suspended') {
                this.ringbackCtx.resume().catch(() => {});
            }
            this.isRingbackPlaying = true;

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

                gain.gain.setValueAtTime(0.08, now);
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
            console.warn('Ringback tone error', e);
        }
    }

    stopRingbackTone() {
        this.isRingbackPlaying = false;
        clearTimeout(this.ringbackTimeout);
        if (this.ringbackCtx) {
            this.ringbackCtx.close().catch(() => {});
            this.ringbackCtx = null;
        }
    }

    // Pleasant Web Audio ringtone for Incoming Calls
    startRingtone() {
        if (this.isRinging) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {});
            }
            this.isRinging = true;

            const playBurst = () => {
                if (!this.isRinging || !this.audioContext) return;
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume().catch(() => {});
                }
                const now = this.audioContext.currentTime;
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.setValueAtTime(480, now + 0.1);

                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

                osc.connect(gain);
                gain.connect(this.audioContext.destination);

                osc.start(now);
                osc.stop(now + 0.8);

                this.ringtoneTimeout = setTimeout(playBurst, 2000);
            };

            playBurst();
        } catch (e) {
            console.warn('Ringtone error', e);
        }
    }

    stopRingtone() {
        this.isRinging = false;
        clearTimeout(this.ringtoneTimeout);
        if (this.audioContext) {
            this.audioContext.close().catch(() => {});
            this.audioContext = null;
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

async function checkForIncomingCall() {
    if (incomingCallRequestPending) return;
    incomingCallRequestPending = true;
    try {
        const response = await fetch('api/calls/incoming.php', { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) {
            console.warn('[Call] Incoming-call endpoint returned HTTP', response.status);
            return;
        }
        const text = await response.text();
        if (!text || !text.trim()) return;
        const result = JSON.parse(text);
        if (!result.success) {
            console.warn('[Call] Incoming-call endpoint error:', result.message || 'Unknown error');
            return;
        }

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
        console.warn('[Call] Could not check for incoming calls:', error);
    } finally {
        incomingCallRequestPending = false;
    }
}

window.checkForIncomingCall = checkForIncomingCall;
checkForIncomingCall();
setInterval(checkForIncomingCall, 1000);

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
