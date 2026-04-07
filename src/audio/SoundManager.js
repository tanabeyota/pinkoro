// ==========================================
// 0. サウンド管理クラス (SoundManager)
// ==========================================

export class SoundManager {
    constructor() { 
        
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    resume() { if (this.ctx.state === 'suspended') this.ctx.resume(); }

    playTone(freq, type, duration, vol = 0.1) {
        if (this.ctx.state === 'suspended') return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playClick() { this.playTone(600, 'sine', 0.1, 0.05); }
    playTurn() { this.playTone(880, 'sine', 0.2, 0.1); }
    playWin() {
        this.playTone(440, 'square', 0.1, 0.1);
        setTimeout(() => this.playTone(554, 'square', 0.1, 0.1), 100);
        setTimeout(() => this.playTone(659, 'square', 0.3, 0.1), 200);
    }
    playLose() {
        this.playTone(300, 'sawtooth', 0.3, 0.1);
        setTimeout(() => this.playTone(250, 'sawtooth', 0.5, 0.1), 300);
    }

    playDiceHit(vol = 0.05) {
        if (this.ctx.state === 'suspended') return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'square';
        osc.frequency.setValueAtTime(400 + Math.random() * 600, this.ctx.currentTime);
        filter.type = 'bandpass';
        filter.frequency.value = 1000;
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.03);
}