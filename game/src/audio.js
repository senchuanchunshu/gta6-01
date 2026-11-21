// All sound is synthesised with WebAudio — no audio files, no network.
// Engine hum, sirens, gunshots, pickups and a small bass groove.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.musicOn = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Engine: a low sawtooth whose pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    // Siren: two-tone square wave, toggled by update().
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  setEngine(speedRatio, driving) {
    if (!this.ctx) return;
    const target = driving ? 0.05 + 0.11 * speedRatio : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + 130 * speedRatio, this.ctx.currentTime, 0.08);
  }

  setSiren(on, dt) {
    if (!this.ctx) return;
    if (on) {
      this.sirenTimer += dt;
      const high = Math.floor(this.sirenTimer * 2.4) % 2 === 0;
      this.sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, this.ctx.currentTime, 0.03);
      this.sirenGain.gain.setTargetAtTime(0.045, this.ctx.currentTime, 0.1);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
  }

  // Tiny bass groove, one step per call while the title or free roam plays.
  musicTick(dt) {
    if (!this.ctx || this.muted) return;
    this.musicTimer += dt;
    if (this.musicTimer < 0.24) return;
    this.musicTimer = 0;
    if (!this.musicOn) return;
    const bassLine = [55, 0, 65.4, 0, 49, 0, 58.3, 73.4];
    const freq = bassLine[this.musicStep % bassLine.length];
    this.musicStep += 1;
    if (freq === 0) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.24);
  }

  blip(freq, duration, type, volume) {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume || 0.18, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration + 0.02);
  }

  noiseBurst(duration, volume, filterFreq) {
    if (!this.ctx || this.muted) return;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1800;
    const gain = this.ctx.createGain();
    gain.gain.value = volume || 0.3;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
  }

  gunshot() {
    this.noiseBurst(0.14, 0.5, 2600);
    this.blip(140, 0.09, 'square', 0.16);
  }

  punch() {
    this.noiseBurst(0.08, 0.3, 900);
  }

  pickup() {
    this.blip(660, 0.09, 'sine', 0.2);
    setTimeout(() => this.blip(990, 0.12, 'sine', 0.2), 70);
  }

  crash() {
    this.noiseBurst(0.25, 0.45, 700);
  }

  missionDone() {
    [523, 659, 784, 1047].forEach((freq, i) => {
      setTimeout(() => this.blip(freq, 0.22, 'triangle', 0.22), i * 110);
    });
  }

  busted() {
    [392, 330, 262].forEach((freq, i) => {
      setTimeout(() => this.blip(freq, 0.3, 'sawtooth', 0.14), i * 160);
    });
  }
}
