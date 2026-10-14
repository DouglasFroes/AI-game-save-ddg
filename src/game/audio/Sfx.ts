export type SfxName = 'click' | 'draw' | 'start' | 'hit' | 'win' | 'star' | 'pop' | 'locked';

/** Tiny synthesized sound effects (Web Audio) — no audio files to download. */
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private lastDraw = 0;

  /** Browsers only allow audio after a user gesture: call this from a pointer event. */
  unlock(): void {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  play(name: SfxName, index = 0): void {
    const ctx = this.ctx;
    if (this.muted || !ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    switch (name) {
      case 'click':
        this.tone(ctx, 520, t, 0.06, 'square', 0.04);
        break;
      case 'draw':
        if (t - this.lastDraw < 0.06) return;
        this.lastDraw = t;
        this.tone(ctx, 300 + Math.random() * 120, t, 0.04, 'triangle', 0.025);
        break;
      case 'start':
        this.tone(ctx, 660, t, 0.08, 'square', 0.05);
        this.tone(ctx, 880, t + 0.08, 0.1, 'square', 0.05);
        break;
      case 'hit':
        this.tone(ctx, 320, t, 0.4, 'sawtooth', 0.12, -240);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) =>
          this.tone(ctx, f, t + i * 0.09, 0.22, 'triangle', 0.12),
        );
        break;
      case 'star':
        this.tone(ctx, 880 + index * 220, t, 0.18, 'triangle', 0.1);
        break;
      case 'pop':
        this.tone(ctx, 900, t, 0.08, 'sine', 0.08, -500);
        break;
      case 'locked':
        this.tone(ctx, 180, t, 0.12, 'square', 0.05);
        break;
    }
  }

  vibrate(pattern: number | number[]): void {
    if (this.muted) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* not supported */
    }
  }

  private tone(
    ctx: AudioContext,
    freq: number,
    t0: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slide = 0,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}
