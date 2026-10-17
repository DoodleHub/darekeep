// Procedural audio: synthesized SFX + a look-ahead music sequencer. No audio files to download.

export type Track = "title" | "dungeon" | "build" | "none";

export type Sfx =
  | "click"
  | "hover"
  | "back"
  | "place"
  | "erase"
  | "invalid"
  | "swing"
  | "hit"
  | "kill"
  | "hurt"
  | "roll"
  | "token"
  | "key"
  | "locked"
  | "win"
  | "die"
  | "arrow"
  | "dart"
  | "projHit"
  | "spike"
  | "lever"
  | "gate"
  | "telegraph"
  | "charge"
  | "slam"
  | "aim"
  | "step"
  | "tick"
  | "go"
  | "medal"
  | "timeout"
  | "publish"
  | "pause";

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Settings {
  music: number;
  sfx: number;
}

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private sfxBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private delay!: DelayNode;
  private delaySend!: GainNode;
  private noise!: AudioBuffer;
  settings: Settings = { music: 0.55, sfx: 0.8 };

  private track: Track = "none";
  private trackGain: GainNode | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  intensity = 0;
  private lastPlayed = new Map<Sfx, number>();

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const s = JSON.parse(localStorage.getItem("dk.audio") ?? "null");
        if (s && typeof s.music === "number") this.settings = s;
      } catch {}
    }
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx({ latencyHint: "interactive" });
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(comp).connect(ctx.destination);

      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.4, 2.8);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.35;
      this.reverbSend.connect(this.reverb).connect(this.master);

      this.delay = ctx.createDelay(1);
      this.delay.delayTime.value = 0.375;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      const dlp = ctx.createBiquadFilter();
      dlp.type = "lowpass";
      dlp.frequency.value = 2400;
      this.delaySend = ctx.createGain();
      this.delaySend.gain.value = 0.25;
      this.delaySend.connect(this.delay);
      this.delay.connect(dlp).connect(fb).connect(this.delay);
      dlp.connect(this.master);

      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = "lowpass";
      this.musicFilter.frequency.value = 18000;
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.musicFilter).connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.applyVolumes();

      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // a track requested before the first gesture starts now
      const pending = this.track;
      this.track = "none";
      this.setTrack(pending);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setVolumes(v: Partial<Settings>) {
    this.settings = { ...this.settings, ...v };
    try {
      localStorage.setItem("dk.audio", JSON.stringify(this.settings));
    } catch {}
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.settings.music * 0.5, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
  }

  /** Muffle the music (pause menus, results). */
  duck(on: boolean) {
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(on ? 700 : 18000, this.ctx.currentTime, 0.12);
  }

  // ---------------- primitives ----------------
  private tone(
    freq: number,
    dur: number,
    opts: {
      type?: OscillatorType;
      vol?: number;
      attack?: number;
      slide?: number;
      when?: number;
      dest?: AudioNode;
      detune?: number;
      reverb?: number;
      delay?: number;
      filter?: number;
    } = {},
  ) {
    const ctx = this.ctx!;
    const t = opts.when ?? ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = opts.type ?? "sine";
    o.frequency.setValueAtTime(freq, t);
    if (opts.detune) o.detune.value = opts.detune;
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    const g = ctx.createGain();
    const vol = opts.vol ?? 0.3;
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = opts.filter;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    const dest = opts.dest ?? this.sfxBus;
    g.connect(dest);
    if (opts.reverb) {
      const s = ctx.createGain();
      s.gain.value = opts.reverb;
      g.connect(s).connect(this.reverbSend);
    }
    if (opts.delay) {
      const s = ctx.createGain();
      s.gain.value = opts.delay;
      g.connect(s).connect(this.delaySend);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hiss(
    dur: number,
    opts: {
      vol?: number;
      type?: BiquadFilterType;
      freq?: number;
      to?: number;
      q?: number;
      when?: number;
      dest?: AudioNode;
      attack?: number;
      reverb?: number;
    } = {},
  ) {
    const ctx = this.ctx!;
    const t = opts.when ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? "bandpass";
    f.frequency.setValueAtTime(opts.freq ?? 2000, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const vol = opts.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(opts.dest ?? this.sfxBus);
    if (opts.reverb) {
      const s = ctx.createGain();
      s.gain.value = opts.reverb;
      g.connect(s).connect(this.reverbSend);
    }
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---------------- sound effects ----------------
  play(name: Sfx, arg = 0) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    // avoid machine-gun stacking of identical sounds in the same few ms
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < 0.03) return;
    this.lastPlayed.set(name, now);
    const r = 1 + (Math.random() - 0.5) * 0.08;
    switch (name) {
      case "click":
        this.tone(880 * r, 0.06, { type: "triangle", vol: 0.12 });
        this.tone(1320 * r, 0.05, { type: "sine", vol: 0.06, when: now + 0.02 });
        break;
      case "hover":
        this.tone(1500 * r, 0.03, { type: "sine", vol: 0.025 });
        break;
      case "back":
        this.tone(660, 0.08, { type: "triangle", vol: 0.1, slide: 440 });
        break;
      case "place":
        this.tone(320 * r, 0.09, { type: "triangle", vol: 0.16, slide: 520 });
        this.hiss(0.04, { vol: 0.06, freq: 3000 });
        break;
      case "erase":
        this.tone(420 * r, 0.1, { type: "triangle", vol: 0.12, slide: 180 });
        break;
      case "invalid":
        this.tone(160, 0.14, { type: "square", vol: 0.06, filter: 900 });
        this.tone(150, 0.14, { type: "square", vol: 0.06, filter: 900, when: now + 0.09 });
        break;
      case "swing":
        this.hiss(0.14, { vol: 0.22, type: "bandpass", freq: 900 * r, to: 4200, q: 1.4 });
        break;
      case "hit":
        this.tone(180 * r, 0.12, { type: "square", vol: 0.14, slide: 60, filter: 1600 });
        this.hiss(0.06, { vol: 0.25, type: "highpass", freq: 2500 });
        this.tone(1200 * r, 0.05, { type: "sine", vol: 0.08 });
        break;
      case "kill":
        this.tone(520 * r, 0.18, { type: "triangle", vol: 0.14, slide: 90 });
        this.hiss(0.25, { vol: 0.18, type: "lowpass", freq: 3000, to: 200, reverb: 0.4 });
        this.tone(midi(84), 0.2, { type: "sine", vol: 0.06, when: now + 0.05, reverb: 0.3 });
        break;
      case "hurt":
        this.tone(220, 0.25, { type: "sawtooth", vol: 0.16, slide: 70, filter: 1400 });
        this.hiss(0.18, { vol: 0.25, type: "lowpass", freq: 1800 });
        this.tone(55, 0.3, { type: "sine", vol: 0.4, slide: 35 });
        break;
      case "roll":
        this.hiss(0.24, { vol: 0.16, type: "bandpass", freq: 500, to: 1800, q: 0.8, attack: 0.03 });
        break;
      case "token": {
        const base = 76 + arg * 2;
        [0, 4, 7, 12].forEach((s, i) =>
          this.tone(midi(base + s), 0.22, { type: "triangle", vol: 0.1, when: now + i * 0.045, reverb: 0.35, delay: 0.25 }),
        );
        this.tone(midi(base + 24), 0.3, { type: "sine", vol: 0.05, when: now + 0.18, reverb: 0.5 });
        break;
      }
      case "key":
        [0, 7, 12, 16, 19, 24].forEach((s, i) =>
          this.tone(midi(72 + s), 0.5, { type: "triangle", vol: 0.09, when: now + i * 0.06, reverb: 0.6, delay: 0.35 }),
        );
        this.hiss(0.6, { vol: 0.05, type: "highpass", freq: 7000, attack: 0.1, reverb: 0.5 });
        break;
      case "locked":
        this.tone(140, 0.08, { type: "square", vol: 0.08, filter: 700 });
        this.tone(110, 0.1, { type: "square", vol: 0.08, filter: 700, when: now + 0.08 });
        break;
      case "win":
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) =>
          this.tone(midi(67 + s), 0.6, { type: "triangle", vol: 0.1, when: now + i * 0.07, reverb: 0.6, delay: 0.3 }),
        );
        [55, 62, 67].forEach((n) =>
          this.tone(midi(n), 1.4, { type: "sawtooth", vol: 0.04, attack: 0.08, when: now + 0.45, filter: 2200, reverb: 0.6 }),
        );
        break;
      case "die":
        this.tone(330, 0.9, { type: "sawtooth", vol: 0.12, slide: 50, filter: 1200, reverb: 0.5 });
        this.tone(midi(50), 1.2, { type: "triangle", vol: 0.12, when: now + 0.25, reverb: 0.6 });
        this.tone(midi(49), 1.4, { type: "triangle", vol: 0.1, when: now + 0.55, reverb: 0.6 });
        break;
      case "timeout":
        [72, 67, 63, 60].forEach((n, i) => this.tone(midi(n), 0.3, { type: "square", vol: 0.06, when: now + i * 0.14, filter: 2000 }));
        break;
      case "arrow":
        this.tone(900 * r, 0.06, { type: "triangle", vol: 0.12, slide: 300 });
        this.hiss(0.12, { vol: 0.12, type: "highpass", freq: 3000 });
        break;
      case "dart":
        this.tone(1400 * r, 0.05, { type: "square", vol: 0.04, slide: 600, filter: 3000 });
        this.hiss(0.08, { vol: 0.1, type: "bandpass", freq: 5000 });
        break;
      case "projHit":
        this.tone(1800 * r, 0.04, { type: "triangle", vol: 0.05 });
        this.hiss(0.05, { vol: 0.08, type: "highpass", freq: 4000 });
        break;
      case "spike":
        this.tone(2400 * r, 0.12, { type: "triangle", vol: 0.04, slide: 1800 });
        this.hiss(0.08, { vol: 0.07, type: "highpass", freq: 6000 });
        break;
      case "lever":
        this.tone(240, 0.08, { type: "square", vol: 0.1, filter: 1200 });
        this.tone(360, 0.12, { type: "square", vol: 0.08, filter: 1500, when: now + 0.07 });
        break;
      case "gate":
        this.hiss(0.6, { vol: 0.16, type: "lowpass", freq: 600, to: 200, attack: 0.05, reverb: 0.4 });
        this.tone(70, 0.6, { type: "sawtooth", vol: 0.08, filter: 300 });
        this.tone(midi(79), 0.4, { type: "triangle", vol: 0.06, when: now + 0.3, reverb: 0.6 });
        break;
      case "telegraph":
        this.tone(90, 0.5, { type: "sawtooth", vol: 0.08, slide: 160, filter: 600 });
        this.hiss(0.4, { vol: 0.06, type: "lowpass", freq: 400 });
        break;
      case "charge":
        this.hiss(0.45, { vol: 0.16, type: "lowpass", freq: 900, to: 300 });
        this.tone(60, 0.4, { type: "square", vol: 0.08, filter: 300 });
        break;
      case "slam":
        this.tone(80, 0.35, { type: "sine", vol: 0.5, slide: 30 });
        this.hiss(0.3, { vol: 0.25, type: "lowpass", freq: 1200, to: 100, reverb: 0.3 });
        break;
      case "aim":
        this.tone(600, 0.25, { type: "sine", vol: 0.03, slide: 1200 });
        break;
      case "step":
        this.hiss(0.035, { vol: 0.03, type: "lowpass", freq: 900 + Math.random() * 400 });
        break;
      case "tick":
        this.tone(1000, 0.07, { type: "sine", vol: 0.08 });
        break;
      case "go":
        this.tone(midi(84), 0.25, { type: "triangle", vol: 0.12, reverb: 0.4 });
        this.tone(midi(91), 0.3, { type: "triangle", vol: 0.08, when: now + 0.06, reverb: 0.4 });
        break;
      case "medal":
        [0, 7, 12].forEach((s, i) =>
          this.tone(midi(79 + s + arg * 2), 0.35, { type: "triangle", vol: 0.1, when: now + i * 0.05, reverb: 0.5 }),
        );
        break;
      case "publish":
        [0, 4, 7, 11, 14].forEach((s, i) =>
          this.tone(midi(65 + s), 0.8, { type: "sine", vol: 0.08, when: now + i * 0.08, reverb: 0.7, delay: 0.3 }),
        );
        break;
      case "pause":
        this.tone(520, 0.1, { type: "triangle", vol: 0.08, slide: 380 });
        break;
    }
  }

  // ---------------- music ----------------
  setTrack(track: Track) {
    if (track === this.track) return;
    this.track = track;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.trackGain) {
      const old = this.trackGain;
      old.gain.setTargetAtTime(0.0001, t, 0.4);
      setTimeout(() => old.disconnect(), 2500);
    }
    this.trackGain = null;
    if (track === "none") return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.setTargetAtTime(1, t + 0.1, 0.6);
    g.connect(this.musicBus);
    this.trackGain = g;
    this.step = 0;
    this.nextTime = t + 0.12;
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.trackGain || this.track === "none" || ctx.state !== "running") return;
    const bpm = this.track === "dungeon" ? 112 : this.track === "build" ? 88 : 76;
    const sixteenth = 60 / bpm / 4;
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.14) {
      this.note(this.step, this.nextTime, sixteenth);
      this.step++;
      this.nextTime += sixteenth;
    }
  }

  private note(step: number, t: number, s16: number) {
    const dest = this.trackGain!;
    const bar = Math.floor(step / 16) % 4;
    const st = step % 16;
    if (this.track === "title") {
      const chords = [
        [57, 60, 64, 69],
        [53, 57, 60, 65],
        [48, 55, 60, 64],
        [55, 59, 62, 67],
      ];
      const ch = chords[bar];
      if (st === 0)
        for (const n of ch)
          this.tone(midi(n), s16 * 16, { type: "sawtooth", vol: 0.022, attack: 0.9, when: t, dest, filter: 900, reverb: 0.7, detune: (n % 3) * 6 - 6 });
      if (st % 2 === 0) {
        const n = ch[(st / 2) % 4] + 12 + (st >= 8 ? 12 : 0);
        this.tone(midi(n), s16 * 2.5, { type: "triangle", vol: 0.035, when: t, dest, delay: 0.5, reverb: 0.3 });
      }
      if (st === 0) this.tone(midi(ch[0] - 24), s16 * 14, { type: "sine", vol: 0.12, attack: 0.2, when: t, dest });
      const melody = [76, 0, 74, 72, 0, 0, 69, 0, 72, 0, 0, 0, 71, 0, 67, 0];
      const m = melody[(step + bar * 3) % 16];
      if (m && Math.floor(step / 64) % 2 === 1 && st % 4 === 0)
        this.tone(midi(m), s16 * 5, { type: "sine", vol: 0.04, when: t, dest, reverb: 0.6, delay: 0.4, attack: 0.03 });
      return;
    }
    if (this.track === "dungeon") {
      const roots = [50, 46, 41, 48]; // D Bb F C
      const thirds = [53, 50, 45, 52];
      const fifths = [57, 53, 48, 55];
      const r = roots[bar];
      const I = this.intensity;
      // bass: driving eighths with octave pops
      if (st % 2 === 0) {
        const n = r - 12 + (st % 8 === 6 ? 12 : 0);
        this.tone(midi(n), s16 * 1.8, { type: "sawtooth", vol: 0.07, when: t, dest, filter: 420 + I * 500 });
      }
      // pluck arp
      const arp = [r + 12, thirds[bar] + 12, fifths[bar] + 12, thirds[bar] + 24];
      this.tone(midi(arp[st % 4] + (st >= 8 && bar % 2 ? 12 : 0)), s16 * 1.4, {
        type: "square",
        vol: 0.016 + I * 0.01,
        when: t,
        dest,
        filter: 1800 + I * 2000,
        delay: 0.35,
      });
      // pads
      if (st === 0)
        for (const n of [r, thirds[bar], fifths[bar]])
          this.tone(midi(n + 12), s16 * 16, { type: "triangle", vol: 0.02, attack: 0.4, when: t, dest, reverb: 0.6 });
      if (I > 0.05) {
        if (st % 8 === 0) this.kick(t, dest, 0.5);
        if (st % 8 === 4) this.snare(t, dest, 0.16);
        if (st % 2 === 0) this.hiss(0.03, { vol: 0.03 * I, type: "highpass", freq: 8000, when: t, dest });
        if (st === 14 && bar === 3) this.snare(t, dest, 0.1);
        if (I > 0.6 && st % 4 === 2) this.hiss(0.05, { vol: 0.03, type: "highpass", freq: 6000, when: t, dest });
      }
      return;
    }
    if (this.track === "build") {
      const chords = [
        [53, 57, 60, 64],
        [52, 55, 59, 62],
        [50, 53, 57, 60],
        [48, 52, 55, 59],
      ];
      const ch = chords[bar];
      if (st === 0 || st === 10)
        ch.forEach((n, i) =>
          this.tone(midi(n + 12), s16 * 7, { type: "sine", vol: 0.04, attack: 0.01, when: t + i * 0.012, dest, reverb: 0.4 }),
        );
      if (st === 0) this.tone(midi(ch[0] - 12), s16 * 8, { type: "triangle", vol: 0.1, when: t, dest, filter: 600 });
      if (st === 8) this.tone(midi(ch[2] - 12), s16 * 6, { type: "triangle", vol: 0.08, when: t, dest, filter: 600 });
      if (st % 8 === 0) this.kick(t, dest, 0.25);
      if (st % 8 === 4) this.hiss(0.12, { vol: 0.05, type: "bandpass", freq: 2500, when: t, dest, reverb: 0.2 });
      if (st % 2 === 1) this.hiss(0.025, { vol: 0.018, type: "highpass", freq: 9000, when: t, dest });
      if (st % 4 === 2 && (step >> 4) % 2 === 1)
        this.tone(midi(ch[(st >> 2) % 4] + 24), s16 * 3, { type: "triangle", vol: 0.025, when: t, dest, delay: 0.5 });
    }
  }

  private kick(t: number, dest: AudioNode, vol: number) {
    this.tone(120, 0.28, { type: "sine", vol, slide: 40, when: t, dest });
  }

  private snare(t: number, dest: AudioNode, vol: number) {
    this.hiss(0.16, { vol, type: "bandpass", freq: 1800, q: 0.7, when: t, dest, reverb: 0.25 });
    this.tone(200, 0.08, { type: "triangle", vol: vol * 0.6, slide: 120, when: t, dest });
  }
}

export const audio = new AudioEngine();
