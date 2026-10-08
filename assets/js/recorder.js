// assets/js/recorder.js - MediaRecorder Audio Recording Handler

class VoiceRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.startTime = null;
        this.timerInterval = null;
        this.isRecording = false;
    }

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(this.stream);

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.audioChunks.push(e.data);
                }
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.startTime = Date.now();

            const recordingBar = document.getElementById('recordingBar');
            const timerEl = document.getElementById('recordingTimer');
            if (recordingBar) recordingBar.classList.add('active');

            this.timerInterval = setInterval(() => {
                const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
                const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
                const secs = String(elapsedSec % 60).padStart(2, '0');
                if (timerEl) timerEl.textContent = `${mins}:${secs}`;
            }, 500);

            return true;
        } catch (err) {
            console.error('[Microphone Access Error]', err);
            showToast('Microphone access denied or not available.', 'error');
            return false;
        }
    }

    stop() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder || !this.isRecording) {
                resolve(null);
                return;
            }

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.cleanup();
                resolve(audioBlob);
            };

            this.mediaRecorder.stop();
        });
    }

    cancel() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
        }
        this.cleanup();
    }

    cleanup() {
        this.isRecording = false;
        clearInterval(this.timerInterval);
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        const recordingBar = document.getElementById('recordingBar');
        if (recordingBar) recordingBar.classList.remove('active');
        const timerEl = document.getElementById('recordingTimer');
        if (timerEl) timerEl.textContent = '00:00';
    }
}

window.VoiceRecorder = VoiceRecorder;
