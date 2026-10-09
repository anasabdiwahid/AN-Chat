// assets/js/webrtc.js - WebRTC Voice and Video Peer Connection Manager with HTTP Sync Fallback

class WebRTCManager {
    constructor(wsClient) {
        this.ws = wsClient;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.currentCallId = null;
        this.activePeerId = null;
        this.callType = 'voice'; // 'voice' or 'video'
        this.isAudioMuted = false;
        this.isVideoMuted = false;
        this.callConnected = false;
        this.statusPollInterval = null;
        this.ringingTimeout = null;

        this.iceConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
    }

    sendWs(data) {
        const client = (this.ws && typeof this.ws.send === 'function') ? this.ws : (window.wsClient || null);
        if (client && typeof client.send === 'function') {
            try {
                client.send(data);
            } catch (e) {
                console.warn('[WebRTC] WS send error:', e);
            }
        }
    }

    async initiateCall(receiverId, callType = 'voice') {
        this.activePeerId = receiverId;
        this.callType = callType;
        this.callConnected = false;

        // 1. Notify Backend DB
        try {
            const res = await fetch('api/calls/create.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiver_id: receiverId, call_type: callType })
            });
            const data = await res.json();
            if (!data.success) {
                if (typeof showToast === 'function') {
                    showToast(data.message || 'Cannot start call', 'error');
                }
                if (window.callController) window.callController.hideCallOverlay();
                return false;
            }
            this.currentCallId = data.data.call_id;
            // Start HTTP Status Polling so caller detects when receiver answers, declines, or hangs up
            this.startStatusPolling(this.currentCallId);
        } catch (e) {
            console.error('Call API error', e);
        }

        // Auto cancel if unanswered after 35 seconds
        clearTimeout(this.ringingTimeout);
        this.ringingTimeout = setTimeout(() => {
            if (this.currentCallId && !this.callConnected) {
                this.endCall('missed');
                if (window.callController) {
                    window.callController.hideCallOverlay();
                    window.callController.playCallEndTone();
                }
                if (typeof showToast === 'function') {
                    showToast('Qofku kama jawaabin wicitaanka.', 'info');
                }
            }
        }, 35000);

        // 2. Check media devices support
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const constraints = {
                audio: true,
                video: callType === 'video'
            };

            try {
                this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
                console.warn('getUserMedia warning:', err);
                if (typeof showToast === 'function') {
                    showToast('Fadlan ogolow Microphone/Camera-ka browser-ka si aad u wacdo.', 'warning');
                }
            }
        }

        // Attach local preview if video
        if (callType === 'video' && this.localStream) {
            const localVideo = document.getElementById('localVideo');
            if (localVideo) localVideo.srcObject = this.localStream;
        }

        // 3. Initialize RTCPeerConnection if available
        let offer = null;
        try {
            if (window.RTCPeerConnection && this.localStream) {
                this.setupPeerConnection();
                offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
            }
        } catch (webrtcErr) {
            console.warn('[WebRTC] WebRTC handshake warning:', webrtcErr);
        }

        // 4. Send Signaling Offer via WebSocket - ALWAYS SEND so recipient rings!
        this.sendWs({
            type: 'call_offer',
            target_user_id: receiverId,
            call_id: this.currentCallId,
            call_type: callType,
            caller_name: window.CURRENT_USER ? window.CURRENT_USER.fullname : 'A/N User',
            caller_image: window.CURRENT_USER ? window.CURRENT_USER.profile_image : '',
            sdp: offer
        });

        return true;
    }

    startStatusPolling(callId) {
        this.stopStatusPolling();
        this.statusPollInterval = setInterval(async () => {
            if (!this.currentCallId || this.currentCallId !== callId) {
                this.stopStatusPolling();
                return;
            }
            try {
                const res = await fetch(`api/calls/status.php?call_id=${callId}`);
                const data = await res.json();
                if (data && data.success && data.data) {
                    const status = data.data.status;
                    if (status === 'answered' && !this.callConnected) {
                        this.callConnected = true;
                        if (this.ringingTimeout) {
                            clearTimeout(this.ringingTimeout);
                            this.ringingTimeout = null;
                        }
                        if (window.callController) {
                            window.callController.showActiveCallScreen(this.callType);
                            window.callController.startCallTimer();
                        }
                    } else if (status === 'declined' || status === 'missed' || status === 'ended') {
                        this.stopStatusPolling();
                        if (window.callController) {
                            window.callController.hideCallOverlay();
                            window.callController.playCallEndTone();
                        }
                        if (typeof showToast === 'function') {
                            const msg = status === 'declined' 
                                ? 'Wicitaanka waa la diiday.' 
                                : (status === 'missed' ? 'Qofku kama jawaabin wicitaanka.' : 'Wicitaanku wuu dhamaaday.');
                            showToast(msg, 'info');
                        }
                        this.cleanup();
                    }
                }
            } catch (e) {
                console.warn('[WebRTC] Call status poll error:', e);
            }
        }, 1500);
    }

    stopStatusPolling() {
        if (this.statusPollInterval) {
            clearInterval(this.statusPollInterval);
            this.statusPollInterval = null;
        }
    }

    setupPeerConnection() {
        if (this.peerConnection) {
            try { this.peerConnection.close(); } catch (e) {}
        }

        this.peerConnection = new RTCPeerConnection(this.iceConfig);
        this.pendingIceCandidates = [];

        // Add local tracks to peer connection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        // Remote track received -> Attach to Audio and/or Video elements
        this.peerConnection.ontrack = (event) => {
            console.log('[WebRTC] Received remote track', event.streams[0]);
            this.remoteStream = event.streams[0];

            // 1. Voice audio output
            let remoteAudio = document.getElementById('remoteAudio');
            if (!remoteAudio) {
                remoteAudio = document.createElement('audio');
                remoteAudio.id = 'remoteAudio';
                remoteAudio.autoplay = true;
                remoteAudio.playsInline = true;
                remoteAudio.style.display = 'none';
                document.body.appendChild(remoteAudio);
            }
            try {
                remoteAudio.srcObject = this.remoteStream;
                remoteAudio.play().catch(e => console.warn('[WebRTC] remoteAudio autoplay:', e));
            } catch (err) {}

            // 2. Video output (if video call)
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                try {
                    remoteVideo.srcObject = this.remoteStream;
                    remoteVideo.play().catch(e => console.warn('[WebRTC] remoteVideo autoplay:', e));
                } catch (err) {}
            }
        };

        // ICE candidate found -> forward to peer
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.activePeerId) {
                this.sendWs({
                    type: 'call_ice',
                    target_user_id: this.activePeerId,
                    candidate: event.candidate
                });
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('[WebRTC] ICE Connection State:', this.peerConnection.iceConnectionState);
            if (this.peerConnection.iceConnectionState === 'disconnected' || this.peerConnection.iceConnectionState === 'failed') {
                this.endCall('ended');
            }
        };
    }

    async drainPendingIceCandidates() {
        if (this.peerConnection && this.pendingIceCandidates && this.pendingIceCandidates.length > 0) {
            for (const cand of this.pendingIceCandidates) {
                try {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
                } catch (e) {
                    console.warn('[WebRTC] Drain ICE candidate error:', e);
                }
            }
            this.pendingIceCandidates = [];
        }
    }

    async handleIncomingOffer(payload) {
        this.activePeerId = payload.from_user_id;
        this.currentCallId = payload.call_id;
        this.callType = payload.call_type || 'voice';
        this.callConnected = true;

        // Obtain local media
        const constraints = {
            audio: true,
            video: this.callType === 'video'
        };

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
                console.warn('[WebRTC] getUserMedia failed for answer:', err);
            }
        }

        if (this.callType === 'video' && this.localStream) {
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
                localVideo.play().catch(() => {});
            }
        }

        let answer = null;
        if (window.RTCPeerConnection && payload.sdp) {
            try {
                this.setupPeerConnection();
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                await this.drainPendingIceCandidates();
                answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
            } catch (e) {
                console.warn('[WebRTC] SDP handshake warning:', e);
            }
        }

        // Send answer back to caller via WebSocket - ALWAYS SEND so caller UI transitions instantly
        this.sendWs({
            type: 'call_answer',
            target_user_id: payload.from_user_id,
            call_id: this.currentCallId,
            sdp: answer
        });

        // Also notify call_status answered
        this.sendWs({
            type: 'call_status',
            target_user_id: payload.from_user_id,
            call_id: this.currentCallId,
            status: 'answered'
        });

        // Notify DB call answered
        fetch('api/calls/update.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ call_id: this.currentCallId, status: 'answered' })
        }).catch(() => {});

        // Start status polling on receiver side too so if caller hangs up, receiver ends
        this.startStatusPolling(this.currentCallId);
    }

    async handleIncomingAnswer(payload) {
        this.callConnected = true;
        if (this.ringingTimeout) {
            clearTimeout(this.ringingTimeout);
            this.ringingTimeout = null;
        }

        if (this.peerConnection && payload.sdp) {
            try {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                await this.drainPendingIceCandidates();
            } catch (e) {
                console.warn('[WebRTC] Answer setRemoteDescription error:', e);
            }
        }
    }

    async handleIncomingIce(payload) {
        if (!payload.candidate) return;

        if (this.peerConnection && this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch (e) {
                console.error('[WebRTC] Error adding ICE candidate', e);
            }
        } else {
            this.pendingIceCandidates = this.pendingIceCandidates || [];
            this.pendingIceCandidates.push(payload.candidate);
        }
    }

    toggleAudioMute() {
        if (!this.localStream) return false;
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            this.isAudioMuted = !this.isAudioMuted;
            audioTrack.enabled = !this.isAudioMuted;
            return this.isAudioMuted;
        }
        return false;
    }

    toggleVideoMute() {
        if (!this.localStream) return false;
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            this.isVideoMuted = !this.isVideoMuted;
            videoTrack.enabled = !this.isVideoMuted;
            return this.isVideoMuted;
        }
        return false;
    }

    declineCall(callerId, callId) {
        this.sendWs({
            type: 'call_status',
            target_user_id: callerId,
            call_id: callId,
            status: 'declined'
        });

        if (callId) {
            fetch('api/calls/update.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ call_id: callId, status: 'declined' })
            }).catch(() => {});
        }

        this.cleanup();
    }

    endCall(status = 'ended', duration = 0) {
        if (this.activePeerId) {
            this.sendWs({
                type: 'call_status',
                target_user_id: this.activePeerId,
                call_id: this.currentCallId,
                status: status
            });
        }

        if (this.currentCallId) {
            fetch('api/calls/update.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ call_id: this.currentCallId, status: status, duration: duration })
            }).catch(() => {});
        }

        this.cleanup();
    }

    cleanup() {
        this.stopStatusPolling();
        if (this.ringingTimeout) {
            clearTimeout(this.ringingTimeout);
            this.ringingTimeout = null;
        }
        this.callConnected = false;

        if (this.peerConnection) {
            try { this.peerConnection.close(); } catch (e) {}
            this.peerConnection = null;
        }

        if (this.localStream) {
            try { this.localStream.getTracks().forEach(track => track.stop()); } catch (e) {}
            this.localStream = null;
        }

        this.remoteStream = null;
        this.activePeerId = null;
        this.currentCallId = null;
        this.isAudioMuted = false;
        this.isVideoMuted = false;
        this.pendingIceCandidates = [];

        // Clear audio & video players
        const remoteAudio = document.getElementById('remoteAudio');
        if (remoteAudio) {
            try { remoteAudio.pause(); remoteAudio.srcObject = null; } catch (e) {}
        }
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
            try { remoteVideo.pause(); remoteVideo.srcObject = null; } catch (e) {}
        }
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            try { localVideo.pause(); localVideo.srcObject = null; } catch (e) {}
        }
    }
}

window.WebRTCManager = WebRTCManager;
