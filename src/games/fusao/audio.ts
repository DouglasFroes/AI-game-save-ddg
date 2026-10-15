/**
 * Synthesized sound effects (Web Audio, no files). Starts only after a user gesture, respects
 * the volume setting, and rate-limits each sound so big fights don't turn into noise.
 */
export type SoundName =
  | 'shot'
  | 'hit'
  | 'kill'
  | 'pickup'
  | 'levelup'
  | 'choose'
  | 'fusion'
  | 'boss'
  | 'hurt'
  | 'explosion'
  | 'victory'
  | 'defeat'
  | 'click';

const MIN_GAP: Partial<Record<SoundName, number>> = {
  shot: 0.07,
  hit: 0.05,
  kill: 0.04,
  pickup: 0.03,
  explosion: 0.08,
  hurt: 0.15,
};

export class FusaoAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = new Map<SoundName, number>();
  private noiseBuf: AudioBuffer | null = null;
  volume = 0.8;

  /** Call from a pointer/key handler: browsers only allow audio after a gesture. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
    delay = 0,
  ): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, filter = 1200): void {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur);
  }

  play(name: SoundName): void {
    if (!this.ctx || !this.master || this.volume <= 0) return;
    const now = this.ctx.currentTime;
    const gap = MIN_GAP[name] ?? 0;
    if (now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);
    this.master.gain.value = this.volume * 0.5;
    switch (name) {
      case 'shot':
        return this.tone(880, 0.08, 'square', 0.05, 440);
      case 'hit':
        return this.tone(220, 0.05, 'triangle', 0.06, 140);
      case 'kill':
        return this.tone(520, 0.09, 'triangle', 0.07, 1040);
      case 'pickup':
        return this.tone(1200 + Math.random() * 300, 0.05, 'sine', 0.05);
      case 'levelup':
        [523, 659, 784, 1046].forEach((f, i) =>
          this.tone(f, 0.18, 'triangle', 0.12, undefined, i * 0.07),
        );
        return;
      case 'choose':
        return this.tone(660, 0.12, 'sine', 0.12, 990);
      case 'fusion':
        [392, 523, 659, 784, 1046, 1318].forEach((f, i) =>
          this.tone(f, 0.3, 'sawtooth', 0.06, undefined, i * 0.06),
        );
        this.noise(0.6, 0.12, 3000);
        return;
      case 'boss':
        this.tone(110, 1.1, 'sawtooth', 0.15, 55);
        this.tone(165, 1.1, 'square', 0.06, 82);
        return;
      case 'hurt':
        this.tone(160, 0.18, 'sawtooth', 0.12, 80);
        return;
      case 'explosion':
        return this.noise(0.35, 0.18, 700);
      case 'victory':
        [523, 659, 784, 1046, 1318].forEach((f, i) =>
          this.tone(f, 0.4, 'triangle', 0.12, undefined, i * 0.12),
        );
        return;
      case 'defeat':
        [392, 330, 262, 196].forEach((f, i) =>
          this.tone(f, 0.4, 'sine', 0.12, undefined, i * 0.16),
        );
        return;
      case 'click':
        return this.tone(700, 0.04, 'sine', 0.08);
    }
  }
}

export const audio = new FusaoAudio();
