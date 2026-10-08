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

        this.initControls();
    }

    initControls() {
        // Accept Incoming Call
        const btnAccept = document.getElementById('btnAcceptCall');
        if (btnAccept) {
            btnAccept.addEventListener('click', async () => {
                this.stopRingtone();
                this.stopRingbackTone();
                if (this.pendingIncomingPayload && window.webrtc) {
                    await window.webrtc.handleIncomingOffer(this.pendingIncomingPayload);
                    this.showActiveCallScreen(this.pendingIncomingPayload.call_type);
                    // Start timer ONLY once call is answered and conversation begins
                    this.startCallTimer();
                }
            });
        }

        // Decline Incoming Call
        const btnDecline = document.getElementById('btnDeclineCall');
        if (btnDecline) {
            btnDecline.addEventListener('click', () => {
                this.stopRingtone();
                this.stopRingbackTone();
                if (this.pendingIncomingPayload && window.webrtc) {
                    window.webrtc.declineCall(this.pendingIncomingPayload.from_user_id, this.pendingIncomingPayload.call_id);
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
                this.statusTextEl.innerHTML = '<span style="color:var(--success);font-weight:600;"><i class="fas fa-check-circle"></i> Connected</span>';
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
        if (this.activeCallOverlay) {
            this.activeCallOverlay.classList.remove('active');
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
            this.isRingbackPlaying = true;

            const playTone = () => {
                if (!this.isRingbackPlaying || !this.ringbackCtx) return;
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
            this.isRinging = true;

            const playBurst = () => {
                if (!this.isRinging || !this.audioContext) return;
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
