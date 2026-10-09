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
        this.callAccepted = false;
        this.callUiActivated = false;
        this.statusPollInterval = null;
        this.signalPollInterval = null;
        this.lastSignalId = 0;
        this.signalPollInProgress = false;
        this.ringingTimeout = null;
        this.disconnectTimeout = null;
        this.mediaWarningTimeout = null;

        const configuredIceServers = Array.isArray(window.WEBRTC_ICE_SERVERS) ? window.WEBRTC_ICE_SERVERS : [];
        const fallbackStunServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ];
        this.iceConfig = {
            iceServers: [...(configuredIceServers.length ? configuredIceServers : fallbackStunServers),
                ...(Array.isArray(window.WEBRTC_TURN_SERVERS) ? window.WEBRTC_TURN_SERVERS : [])],
            iceCandidatePoolSize: 4
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
        this.callAccepted = false;
        this.callUiActivated = false;

        // Acquire microphone before creating the incoming-call row. Otherwise
        // the recipient can accept while the caller's permission prompt is
        // still open and the SDP has not been made yet.
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.RTCPeerConnection) {
                throw new Error('Browser-kan ma taageerayo wicitaan cod ah.');
            }
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: callType === 'video'
            });
            if (!this.localStream || !this.localStream.getAudioTracks().length) {
                throw new Error('Makarafoon lama helin. Fadlan oggolow microphone-ka browser-ka.');
            }

            if (callType === 'video') {
                const localVideo = document.getElementById('localVideo');
                if (localVideo) localVideo.srcObject = this.localStream;
            }

            this.setupPeerConnection();
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.localOffer = this.peerConnection.localDescription;

            const res = await fetch('api/calls/create.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiver_id: receiverId, call_type: callType })
            });
            const result = await res.json();
            if (!res.ok || !result.success || !result.data || !result.data.call_id) {
                throw new Error(result.message || 'Wicitaanka lama bilaabi karin.');
            }

            this.currentCallId = parseInt(result.data.call_id);
            this.startStatusPolling(this.currentCallId);
            clearTimeout(this.ringingTimeout);
            this.ringingTimeout = setTimeout(() => {
                if (this.currentCallId && !this.callConnected) {
                    this.endCall('missed');
                    if (window.callController) {
                        window.callController.hideCallOverlay();
                        window.callController.playCallEndTone();
                    }
                    if (typeof showToast === 'function') showToast('Qofku kama jawaabin wicitaanka.', 'info');
                }
            }, 35000);

            this.startSignalPolling(this.currentCallId);
            const offerSignal = await this.sendCallSignal('offer', {
                call_type: callType,
                caller_name: window.CURRENT_USER ? window.CURRENT_USER.fullname : 'A/N User',
                caller_image: window.CURRENT_USER ? window.CURRENT_USER.profile_image : '',
                sdp: this.localOffer
            });
            if (!offerSignal) throw new Error('Offer-ka wicitaanka server-ka ma gaarin. Hubi call_signals database-ka.');
            for (const candidate of (this.pendingLocalIceCandidates || [])) {
                await this.sendCallSignal('ice', { candidate });
            }
            this.pendingLocalIceCandidates = [];
            return true;
        } catch (error) {
            console.error('[WebRTC] Could not start call:', error);
            if (this.currentCallId) {
                fetch('api/calls/update.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ call_id: this.currentCallId, status: 'missed' })
                }).catch(() => {});
            }
            this.cleanup();
            if (window.callController) window.callController.hideCallOverlay();
            if (typeof showToast === 'function') showToast(error.message || 'Microphone-ka lama heli karin.', 'error');
            return false;
        }
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
                    if (status === 'answered' && !this.callAccepted) {
                        this.markCallAccepted();
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

    async sendCallSignal(signalType, payload) {
        if (!this.currentCallId) return null;
        try {
            const response = await fetch('api/calls/signal.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ call_id: this.currentCallId, signal_type: signalType, payload })
            });
            const text = await response.text();
            if (!text || !text.trim()) return null;
            const result = JSON.parse(text);
            if (!response.ok || !result.success) {
                console.error(`[WebRTC] ${signalType} signaling rejected:`, response.status, result.message || 'Unknown server error');
                return null;
            }
            return result && result.data ? result.data : null;
        } catch (e) {
            console.warn('[WebRTC] sendCallSignal network warning:', e);
            return null;
        }
    }

    startSignalPolling(callId) {
        this.stopSignalPolling();
        this.lastSignalId = 0;
        this.signalPollInterval = setInterval(async () => {
            if (this.signalPollInProgress || parseInt(this.currentCallId) !== parseInt(callId)) return;
            this.signalPollInProgress = true;
            try {
                const response = await fetch(`api/calls/signal.php?call_id=${encodeURIComponent(callId)}&after_id=${this.lastSignalId}`, {
                    cache: 'no-store', credentials: 'same-origin'
                });
                if (!response.ok) return;
                const text = await response.text();
                if (!text || !text.trim()) return;
                const result = JSON.parse(text);
                if (!result || !result.success || !Array.isArray(result.data)) {
                    console.warn('[WebRTC] Signal poll returned an invalid response:', result && result.message);
                    return;
                }
                for (const signal of result.data) {
                    this.lastSignalId = Math.max(this.lastSignalId, parseInt(signal.id) || 0);
                    if (signal.signal_type === 'answer') {
                        console.info('[WebRTC] Received SDP answer through HTTP signaling.');
                        await this.handleIncomingAnswer(signal.payload || {});
                    } else if (signal.signal_type === 'ice') {
                        await this.handleIncomingIce(signal.payload || {});
                    }
                }
            } catch (error) {
                console.warn('[WebRTC] Database signaling poll failed:', error);
            } finally {
                this.signalPollInProgress = false;
            }
        }, 500);
    }

    stopSignalPolling() {
        if (this.signalPollInterval) {
            clearInterval(this.signalPollInterval);
            this.signalPollInterval = null;
        }
        this.signalPollInProgress = false;
    }

    setupPeerConnection() {
        if (this.peerConnection) {
            try { this.peerConnection.close(); } catch (e) {}
        }

        this.peerConnection = new RTCPeerConnection(this.iceConfig);
        this.pendingIceCandidates = this.pendingIceCandidates || [];

        // Add local tracks to peer connection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        // Remote track received -> Attach to Audio and/or Video elements
        this.peerConnection.ontrack = (event) => {
            console.log('[WebRTC] Received remote track', event.streams[0]);
            this.remoteStream = event.streams && event.streams[0]
                ? event.streams[0]
                : (this.remoteStream || new MediaStream());
            if (!event.streams || !event.streams[0]) this.remoteStream.addTrack(event.track);

            // 1. Voice audio output
            let remoteAudio = document.getElementById('remoteAudio');
            if (!remoteAudio) {
                remoteAudio = document.createElement('audio');
                remoteAudio.id = 'remoteAudio';
                remoteAudio.autoplay = true;
                remoteAudio.playsInline = true;
                remoteAudio.muted = false;
                remoteAudio.volume = 1;
                remoteAudio.style.display = 'none';
                document.body.appendChild(remoteAudio);
            }
            try {
                remoteAudio.muted = false;
                remoteAudio.volume = 1;
                remoteAudio.srcObject = this.remoteStream;
                remoteAudio.play().catch(e => {
                    console.warn('[WebRTC] remoteAudio autoplay was blocked:', e);
                    if (typeof showToast === 'function') showToast('Codka maqalka u taabo shaashadda hal mar.', 'info');
                    document.addEventListener('pointerdown', () => remoteAudio.play().catch(() => {}), { once: true });
                });
            } catch (err) {}

            // 2. Video output (if video call)
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                try {
                    remoteVideo.muted = true; // Audio is played through remoteAudio, avoiding autoplay/mixed-audio issues.
                    remoteVideo.srcObject = this.remoteStream;
                    remoteVideo.play().catch(e => console.warn('[WebRTC] remoteVideo autoplay:', e));
                } catch (err) {}
            }
        };

        // ICE candidate found -> forward to peer
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.activePeerId) {
                if (!this.currentCallId) {
                    this.pendingLocalIceCandidates = this.pendingLocalIceCandidates || [];
                    this.pendingLocalIceCandidates.push(event.candidate);
                } else {
                    this.sendCallSignal('ice', { candidate: event.candidate })
                        .catch(error => console.warn('[WebRTC] Could not store local ICE candidate:', error));
                }
            }
        };
        this.peerConnection.onicecandidateerror = (event) => {
            console.warn('[WebRTC] ICE server error:', event.errorCode, event.errorText, event.url);
        };
        this.peerConnection.onconnectionstatechange = () => {
            console.info('[WebRTC] Peer connection state:', this.peerConnection && this.peerConnection.connectionState);
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState;
            console.log('[WebRTC] ICE Connection State:', state);
            if (state === 'connected' || state === 'completed') {
                clearTimeout(this.disconnectTimeout);
                this.disconnectTimeout = null;
                this.markCallConnected();
            } else if (state === 'disconnected') {
                clearTimeout(this.disconnectTimeout);
                this.disconnectTimeout = setTimeout(() => {
                    if (this.peerConnection && this.peerConnection.iceConnectionState === 'disconnected') {
                        this.endCall('ended');
                        if (window.callController) window.callController.hideCallOverlay();
                    }
                }, 10000);
            } else if (state === 'failed') {
                if (typeof showToast === 'function') showToast('Shabakadu ma helin waddo ay codka/muuqaalka ku gudbiso. TURN server ayaa loo baahan karaa.', 'error');
                this.endCall('ended');
                if (window.callController) window.callController.hideCallOverlay();
            }
        };
        this.peerConnection.onicegatheringstatechange = () => {
            console.log('[WebRTC] ICE gathering state:', this.peerConnection && this.peerConnection.iceGatheringState);
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
        this.activePeerId = parseInt(payload.from_user_id || payload.caller_id || 0);
        this.currentCallId = parseInt(payload.call_id || payload.id || 0);
        this.callType = payload.call_type || 'voice';
        if (!payload.sdp || !this.activePeerId || !this.currentCallId) {
            throw new Error('Wicitaanku weli diyaar ma aha. Sug offer-ka wicaha.');
        }
        if (this.peerConnection && this.peerConnection.remoteDescription
            && this.peerConnection.remoteDescription.type === 'offer'
            && parseInt(this.currentCallId) === parseInt(payload.call_id)) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.RTCPeerConnection) {
            throw new Error('Browser-kan ma taageerayo wicitaanka codka.');
        }

        // Do not mark the call answered until this device has microphone access
        // and has built a real SDP answer containing its audio track.
        this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: this.callType === 'video'
        });
        if (!this.localStream || !this.localStream.getAudioTracks().length) {
            throw new Error('Makarafoon lama helin. Fadlan oggolow microphone-ka browser-ka.');
        }

        if (this.callType === 'video' && this.localStream) {
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
                localVideo.play().catch(() => {});
            }
        }

        this.setupPeerConnection();
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await this.drainPendingIceCandidates();
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        const answerSignal = await this.sendCallSignal('answer', { sdp: this.peerConnection.localDescription });
        if (!answerSignal) throw new Error('Jawaabta wicitaanka lama gaarsiin karin. Hubi xiriirka server-ka kadib isku day mar kale.');
        await fetch('api/calls/update.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ call_id: this.currentCallId, status: 'answered' })
        });
        this.markCallAccepted();
        this.startStatusPolling(this.currentCallId);
        this.startSignalPolling(this.currentCallId);
    }

    async handleIncomingAnswer(payload) {
        if (this.peerConnection && this.peerConnection.remoteDescription
            && this.peerConnection.remoteDescription.type === 'answer') return;
        if (!this.peerConnection || !payload.sdp) {
            console.warn('[WebRTC] Received an answer without a peer connection or SDP.');
            return false;
        }

        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            await this.drainPendingIceCandidates();
            console.info('[WebRTC] Remote SDP answer applied successfully.');
            this.markCallAccepted();
            return true;
        } catch (e) {
            console.warn('[WebRTC] Answer setRemoteDescription error:', e);
            return false;
        }
    }

    markCallConnected() {
        this.callConnected = true;
        clearTimeout(this.mediaWarningTimeout);
        this.mediaWarningTimeout = null;
        this.markCallAccepted();
        if (this.callUiActivated) {
            if (window.callController && window.callController.statusTextEl && this.callType === 'voice') {
                window.callController.statusTextEl.innerHTML = '<span style="color:var(--success);font-weight:600;"><i class="fas fa-check-circle"></i> Connected</span>';
            }
            return;
        }
        this.callUiActivated = true;
        if (window.callController && window.callController.statusTextEl && this.callType === 'voice') {
            window.callController.statusTextEl.innerHTML = '<span style="color:var(--success);font-weight:600;"><i class="fas fa-check-circle"></i> Connected</span>';
        }
    }

    markCallAccepted() {
        if (this.callAccepted) return;
        this.callAccepted = true;
        if (this.ringingTimeout) {
            clearTimeout(this.ringingTimeout);
            this.ringingTimeout = null;
        }
        if (window.callController) {
            window.callController.stopRingbackTone();
            window.callController.showActiveCallScreen(this.callType);
            if (window.callController.statusTextEl && this.callType === 'voice') {
                window.callController.statusTextEl.textContent = 'Connecting media...';
            }
            window.callController.startCallTimer();
        }
        clearTimeout(this.mediaWarningTimeout);
        this.mediaWarningTimeout = setTimeout(() => {
            if (!this.callConnected && this.peerConnection) {
                const state = this.peerConnection.iceConnectionState;
                if (state !== 'connected' && state !== 'completed') {
                    if (window.callController && window.callController.statusTextEl && this.callType === 'voice') {
                        window.callController.statusTextEl.textContent = 'Media wali ma xirmana — TURN/network ayaa loo baahan kara.';
                    }
                    if (typeof showToast === 'function') showToast('Call-ku waa la aqbalay, balse codku ma gudbayo. Hubi TURN server-ka iyo shabakadda.', 'error');
                }
            }
        }, 12000);
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
        this.stopSignalPolling();
        if (this.disconnectTimeout) {
            clearTimeout(this.disconnectTimeout);
            this.disconnectTimeout = null;
        }
        if (this.mediaWarningTimeout) {
            clearTimeout(this.mediaWarningTimeout);
            this.mediaWarningTimeout = null;
        }
        if (this.ringingTimeout) {
            clearTimeout(this.ringingTimeout);
            this.ringingTimeout = null;
        }
        this.callConnected = false;
        this.callAccepted = false;
        this.callUiActivated = false;

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
        this.localOffer = null;
        this.pendingLocalIceCandidates = [];
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
