/**
 * All sound is synthesized with WebAudio: no audio files to download,
 * and the landing notes climb a pentatonic scale as the combo grows.
 */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
const BASE = 523.25; // C5
const note = (semi: number) => BASE * Math.pow(2, semi / 12);

// I - vi - IV - V in C, as [root, third, fifth] semitone offsets from C
const CHORDS = [
  [0, 4, 7],
  [-3, 0, 4],
  [-7, -3, 0],
  [-5, -1, 2],
];

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private delay!: DelayNode;
  private noiseBuf!: AudioBuffer;
  sfxOn = true;
  bgmOn = true;
  private bgmTimer = 0;
  private nextNoteT = 0;
  private step = 0;
  private playing = false;
  intensity = 0;

  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = this.sfxOn ? 1 : 0;
      this.sfx.connect(this.master);
      this.music = ctx.createGain();
      this.music.gain.value = this.bgmOn ? 0.55 : 0;
      this.music.connect(this.master);
      // Spacey echo shared by music + chimes
      this.delay = ctx.createDelay(1);
      this.delay.delayTime.value = 0.28;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      const dl = ctx.createBiquadFilter();
      dl.type = 'lowpass';
      dl.frequency.value = 2400;
      this.delay.connect(dl).connect(fb).connect(this.delay);
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      dl.connect(wet).connect(this.master);
      const len = ctx.sampleRate * 0.5;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  }

  setBgm(on: boolean): void {
    this.bgmOn = on;
    if (this.ctx) this.music.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.1);
  }

  private tone(
    freq: number,
    dur: number,
    opts: { type?: OscillatorType; vol?: number; at?: number; slide?: number; attack?: number; echo?: boolean; dest?: AudioNode } = {},
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (opts.at ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    const vol = opts.vol ?? 0.2;
    const atk = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(opts.dest ?? this.sfx);
    if (opts.echo && this.sfxOn) g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, opts: { vol?: number; at?: number; freq?: number; q?: number; type?: BiquadFilterType; sweep?: number; dest?: AudioNode } = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (opts.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1200, t);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol ?? 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(opts.dest ?? this.sfx);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  click(): void {
    this.tone(880, 0.06, { type: 'triangle', vol: 0.12 });
  }

  jump(): void {
    this.tone(330, 0.16, { type: 'triangle', vol: 0.16, slide: 820 });
    this.noise(0.18, { vol: 0.08, freq: 900, sweep: 3200, q: 0.8 });
  }

  land(step: number, perfect: boolean): void {
    const n = note(SCALE[Math.min(step, SCALE.length - 1)]);
    this.tone(150, 0.12, { type: 'sine', vol: 0.28, slide: 60 });
    this.noise(0.07, { vol: 0.08, freq: 500, type: 'lowpass' });
    if (perfect) {
      this.tone(n, 0.5, { type: 'sine', vol: 0.2, echo: true });
      this.tone(n * 2, 0.35, { type: 'triangle', vol: 0.06, at: 0.01, echo: true });
      this.tone(n * 1.5, 0.3, { type: 'sine', vol: 0.07, at: 0.06, echo: true });
    } else {
      this.tone(n / 2, 0.25, { type: 'triangle', vol: 0.12 });
    }
  }

  coin(): void {
    this.tone(1318.5, 0.09, { type: 'square', vol: 0.05 });
    this.tone(1975.5, 0.22, { type: 'square', vol: 0.05, at: 0.07, echo: true });
  }

  tick(urgent: boolean): void {
    this.tone(urgent ? 1400 : 1000, 0.04, { type: 'square', vol: 0.05 });
  }

  pop(): void {
    this.noise(0.5, { vol: 0.35, freq: 900, sweep: 120, q: 0.7 });
    this.tone(200, 0.4, { type: 'sawtooth', vol: 0.12, slide: 40 });
  }

  bonk(): void {
    this.tone(180, 0.18, { type: 'square', vol: 0.15, slide: 70 });
    this.noise(0.15, { vol: 0.25, freq: 600, q: 2 });
  }

  fall(): void {
    this.tone(700, 0.9, { type: 'sine', vol: 0.12, slide: 90, attack: 0.02 });
  }

  /** A synthesized cartoon "nya!" (sawtooth through two moving formants). */
  meow(pitch = 1, at = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(520 * pitch, t);
    o.frequency.linearRampToValueAtTime(820 * pitch, t + 0.09);
    o.frequency.linearRampToValueAtTime(560 * pitch, t + 0.36);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 5;
    f1.frequency.setValueAtTime(900, t);
    f1.frequency.linearRampToValueAtTime(1700, t + 0.1);
    f1.frequency.linearRampToValueAtTime(800, t + 0.36);
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 7;
    f2.frequency.setValueAtTime(2300, t);
    f2.frequency.linearRampToValueAtTime(2900, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
    g.gain.setValueAtTime(0.5, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    o.connect(f1).connect(g);
    o.connect(f2).connect(g2).connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + 0.45);
  }

  zone(): void {
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone(note(s), 0.5, { type: 'triangle', vol: 0.1, at: i * 0.07, echo: true }));
    this.noise(0.8, { vol: 0.1, freq: 400, sweep: 4000, q: 0.6 });
  }

  fever(): void {
    [0, 7, 12, 19, 24].forEach((s, i) => this.tone(note(s), 0.3, { type: 'square', vol: 0.05, at: i * 0.05, echo: true }));
  }

  record(): void {
    [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(note(s), 0.35, { type: 'triangle', vol: 0.11, at: i * 0.09, echo: true }));
  }

  gacha(): void {
    for (let i = 0; i < 14; i++) this.tone(note(i % 2 === 0 ? 0 : 7) * (1 + i * 0.03), 0.06, { type: 'square', vol: 0.04, at: i * 0.07 });
  }

  reveal(rarity: number): void {
    const seq = rarity >= 3 ? [0, 4, 7, 12, 16, 19, 24, 28] : rarity === 2 ? [0, 4, 7, 12, 16] : [0, 7, 12];
    seq.forEach((s, i) => this.tone(note(s), 0.5, { type: 'triangle', vol: 0.12, at: i * 0.08, echo: true }));
    this.meow(rarity >= 3 ? 1.2 : 1, 0.15);
  }

  // ---------------- BGM ----------------

  startBgm(): void {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.nextNoteT = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.bgmTimer = window.setInterval(() => this.schedule(), 40);
  }

  stopBgm(): void {
    this.playing = false;
    window.clearInterval(this.bgmTimer);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const spb = 60 / 104 / 2; // eighth notes at 104 BPM
    while (this.nextNoteT < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextNoteT);
      this.nextNoteT += spb;
      this.step++;
    }
  }

  private playStep(step: number, t: number): void {
    const ctx = this.ctx!;
    const bar = Math.floor(step / 8);
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const pos = step % 8;
    const at = t - ctx.currentTime;
    const dest = this.music;
    // Bass
    if (pos === 0 || pos === 3 || pos === 6) {
      this.tone(note(chord[0] - 24), 0.32, { type: 'sine', vol: 0.18, at, dest });
    }
    // Arpeggio
    const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
    const oct = pos >= 4 ? 12 : 0;
    this.tone(note(chord[pattern[pos]] + oct), 0.22, { type: 'triangle', vol: 0.06, at, dest });
    // Sparkle layer when things heat up
    if (this.intensity > 0 && (pos === 2 || pos === 7)) {
      this.tone(note(chord[(pos + bar) % 3] + 24), 0.18, { type: 'sine', vol: 0.035 * this.intensity, at, dest });
    }
    if (this.intensity > 0.5 && pos % 2 === 1) {
      this.noise(0.04, { vol: 0.03, freq: 8000, type: 'highpass', at, dest });
    }
  }
}
