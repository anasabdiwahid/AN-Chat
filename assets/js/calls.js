// assets/js/calls.js - Call UI and Audio Controller

class CallController {
    constructor() {
        this.activeCallOverlay = document.getElementById('callModalOverlay');
        this.incomingBox = document.getElementById('incomingCallBox');
        this.voiceBox = document.getElementById('activeVoiceBox');
        this.videoBox = document.getElementById('activeVideoBox');
        this.callTimerEl = document.getElementById('callTimerDisplay');
        this.timerInterval = null;
        this.callSeconds = 0;
        this.audioContext = null;
        this.ringtoneOscillator = null;
        this.ringtoneGain = null;
        this.isRinging = false;
        this.pendingIncomingPayload = null;

        this.initControls();
    }

    initControls() {
        // Accept Incoming Call
        const btnAccept = document.getElementById('btnAcceptCall');
        if (btnAccept) {
            btnAccept.addEventListener('click', async () => {
                this.stopRingtone();
                if (this.pendingIncomingPayload && window.webrtc) {
                    await window.webrtc.handleIncomingOffer(this.pendingIncomingPayload);
                    this.showActiveCallScreen(this.pendingIncomingPayload.call_type);
                    this.startCallTimer();
                }
            });
        }

        // Decline Incoming Call
        const btnDecline = document.getElementById('btnDeclineCall');
        if (btnDecline) {
            btnDecline.addEventListener('click', () => {
                this.stopRingtone();
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

    startOutgoingCall(peerName, peerImage, callType = 'voice') {
        this.resetOverlay();
        this.activeCallOverlay.classList.add('active');

        if (callType === 'voice') {
            this.voiceBox.style.display = 'flex';
            document.getElementById('voiceCallPeerName').textContent = peerName;
            const imgEl = document.getElementById('voiceCallPeerAvatar');
            if (imgEl) imgEl.src = peerImage || 'assets/images/logo.png';
            document.getElementById('voiceCallStatusText').textContent = 'Calling...';
        } else {
            this.videoBox.style.display = 'flex';
        }

        this.startCallTimer();
    }

    showIncomingCall(payload) {
        this.pendingIncomingPayload = payload;
        this.resetOverlay();
        this.activeCallOverlay.classList.add('active');
        this.incomingBox.style.display = 'flex';

        document.getElementById('incomingCallerName').textContent = payload.caller_name || 'A/N User';
        document.getElementById('incomingCallType').textContent = payload.call_type === 'video' ? 'Incoming Video Call 🎥' : 'Incoming Voice Call 📞';
        
        const avatarEl = document.getElementById('incomingCallerAvatar');
        if (avatarEl) {
            avatarEl.src = payload.caller_image ? (payload.caller_image.startsWith('http') ? payload.caller_image : 'uploads/images/' + payload.caller_image) : 'assets/images/logo.png';
        }

        this.startRingtone();
    }

    showActiveCallScreen(callType) {
        this.resetOverlay();
        this.activeCallOverlay.classList.add('active');

        if (callType === 'video') {
            this.videoBox.style.display = 'flex';
        } else {
            this.voiceBox.style.display = 'flex';
            document.getElementById('voiceCallStatusText').textContent = 'Connected';
        }
    }

    resetOverlay() {
        this.incomingBox.style.display = 'none';
        this.voiceBox.style.display = 'none';
        this.videoBox.style.display = 'none';
    }

    hideCallOverlay() {
        this.stopRingtone();
        this.stopCallTimer();
        this.resetOverlay();
        if (this.activeCallOverlay) {
            this.activeCallOverlay.classList.remove('active');
        }
    }

    startCallTimer() {
        this.callSeconds = 0;
        clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this.callSeconds++;
            const mins = String(Math.floor(this.callSeconds / 60)).padStart(2, '0');
            const secs = String(this.callSeconds % 60).padStart(2, '0');
            const formatted = `${mins}:${secs}`;
            if (this.callTimerEl) this.callTimerEl.textContent = formatted;
            const vTimer = document.getElementById('videoCallTimer');
            if (vTimer) vTimer.textContent = formatted;
        }, 1000);
    }

    stopCallTimer() {
        clearInterval(this.timerInterval);
    }

    // Pleasant Web Audio ringtone synthesizer
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
