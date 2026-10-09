// assets/js/recorder.js - MediaRecorder Audio Recording Handler

class VoiceRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.startTime = null;
        this.timerInterval = null;
        this.isRecording = false;
        this.audioContext = null;
        this.analyser = null;
        this.visualizerFrame = null;
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
            this.startVisualizer();

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

    startVisualizer() {
        const container = document.getElementById('recordingWaveform');
        if (!container) return;
        container.replaceChildren();
        const barCount = 36;
        for (let i = 0; i < barCount; i++) {
            const bar = document.createElement('span');
            bar.setAttribute('aria-hidden', 'true');
            container.appendChild(bar);
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        try {
            this.audioContext = new AudioContextClass();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 128;
            this.analyser.smoothingTimeConstant = 0.72;
            this.audioContext.createMediaStreamSource(this.stream).connect(this.analyser);
            const values = new Uint8Array(this.analyser.frequencyBinCount);
            const bars = Array.from(container.children);
            const draw = () => {
                if (!this.isRecording || !this.analyser) return;
                this.analyser.getByteFrequencyData(values);
                bars.forEach((bar, index) => {
                    const bin = Math.floor(index * values.length / bars.length);
                    const level = values[bin] / 255;
                    const scale = Math.max(.1, Math.min(1, .1 + level * 2.1));
                    bar.style.transform = `scaleY(${scale})`;
                });
                this.visualizerFrame = requestAnimationFrame(draw);
            };
            this.audioContext.resume().catch(() => {});
            draw();
        } catch (error) {
            console.warn('[VoiceRecorder] Audio visualizer unavailable:', error);
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
        if (this.visualizerFrame) cancelAnimationFrame(this.visualizerFrame);
        this.visualizerFrame = null;
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(() => {});
        }
        this.audioContext = null;
        this.analyser = null;
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        const recordingBar = document.getElementById('recordingBar');
        if (recordingBar) recordingBar.classList.remove('active');
        const timerEl = document.getElementById('recordingTimer');
        if (timerEl) timerEl.textContent = '00:00';
        const waveform = document.getElementById('recordingWaveform');
        if (waveform) waveform.replaceChildren();
    }
}

window.VoiceRecorder = VoiceRecorder;
