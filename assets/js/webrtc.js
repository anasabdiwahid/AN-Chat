// assets/js/webrtc.js - WebRTC Voice and Video Peer Connection Manager

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

        this.iceConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
    }

    async initiateCall(receiverId, callType = 'voice') {
        this.activePeerId = receiverId;
        this.callType = callType;

        // 1. Notify Backend DB
        try {
            const res = await fetch('api/calls/create.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiver_id: receiverId, call_type: callType })
            });
            const data = await res.json();
            if (!data.success) {
                showToast(data.message || 'Cannot start call', 'error');
                return false;
            }
            this.currentCallId = data.data.call_id;
        } catch (e) {
            console.error('Call API error', e);
        }

        // 2. Obtain local media stream
        const constraints = {
            audio: true,
            video: callType === 'video'
        };

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            console.error('getUserMedia failed:', err);
            showToast('Could not access microphone/camera.', 'error');
            this.endCall('declined');
            return false;
        }

        // Attach local preview if video
        if (callType === 'video') {
            const localVideo = document.getElementById('localVideo');
            if (localVideo) localVideo.srcObject = this.localStream;
        }

        // 3. Initialize RTCPeerConnection
        this.setupPeerConnection();

        // 4. Create Offer SDP
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        // 5. Send Signaling Offer via WebSocket
        this.ws.send({
            type: 'call_offer',
            target_user_id: receiverId,
            call_id: this.currentCallId,
            call_type: callType,
            caller_name: window.CURRENT_USER.fullname,
            caller_image: window.CURRENT_USER.profile_image,
            sdp: offer
        });

        return true;
    }

    setupPeerConnection() {
        if (this.peerConnection) {
            this.peerConnection.close();
        }

        this.peerConnection = new RTCPeerConnection(this.iceConfig);

        // Add local tracks to peer connection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        // Remote track received
        this.peerConnection.ontrack = (event) => {
            console.log('[WebRTC] Received remote track', event.streams[0]);
            this.remoteStream = event.streams[0];

            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                remoteVideo.srcObject = this.remoteStream;
            }
        };

        // ICE candidate found -> forward to peer
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.activePeerId) {
                this.ws.send({
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

    async handleIncomingOffer(payload) {
        this.activePeerId = payload.from_user_id;
        this.currentCallId = payload.call_id;
        this.callType = payload.call_type || 'voice';

        // Obtain local media
        const constraints = {
            audio: true,
            video: this.callType === 'video'
        };

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            console.error('getUserMedia failed for answer:', err);
            showToast('Could not access microphone/camera for call answer.', 'error');
            this.declineCall(payload.from_user_id, this.currentCallId);
            return;
        }

        if (this.callType === 'video') {
            const localVideo = document.getElementById('localVideo');
            if (localVideo) localVideo.srcObject = this.localStream;
        }

        this.setupPeerConnection();

        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        // Send answer back to caller
        this.ws.send({
            type: 'call_answer',
            target_user_id: payload.from_user_id,
            call_id: this.currentCallId,
            sdp: answer
        });

        // Notify DB call answered
        fetch('api/calls/update.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ call_id: this.currentCallId, status: 'answered' })
        }).catch(() => {});
    }

    async handleIncomingAnswer(payload) {
        if (this.peerConnection) {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        }
    }

    async handleIncomingIce(payload) {
        if (this.peerConnection && payload.candidate) {
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch (e) {
                console.error('[WebRTC] Error adding ICE candidate', e);
            }
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
        this.ws.send({
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
            this.ws.send({
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
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        this.remoteStream = null;
        this.activePeerId = null;
        this.currentCallId = null;
        this.isAudioMuted = false;
        this.isVideoMuted = false;
    }
}

window.WebRTCManager = WebRTCManager;
