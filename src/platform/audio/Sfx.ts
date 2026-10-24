import { DEFAULT_SOUND, type SoundPrefs } from '../profile';

export type SfxName =
  | 'click'
  | 'draw'
  | 'start'
  | 'hit'
  | 'win'
  | 'star'
  | 'pop'
  | 'locked'
  | 'coin'
  | 'boom'
  | 'zap'
  | 'bounce'
  | 'tick'
  | 'level';

/** Tiny synthesized sound effects (Web Audio) — no audio files to download. */
export class Sfx {
  private prefs: SoundPrefs = DEFAULT_SOUND;
  private ctx: AudioContext | null = null;
  private lastDraw = 0;

  /** Applies the player's settings (called at start-up and whenever they change them). */
  configure(prefs: SoundPrefs): void {
    this.prefs = prefs;
  }

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
    const p = this.prefs;
    if (p.muted || !(name === 'click' ? p.uiSounds : p.gameSounds)) return;
    if (!ctx || ctx.state !== 'running') return;
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
      // `index` raises the pitch (combos climb a scale instead of repeating one note).
      case 'coin': {
        const f = 740 * 2 ** (Math.min(index, 12) / 12);
        this.tone(ctx, f, t, 0.07, 'square', 0.05);
        this.tone(ctx, f * 1.5, t + 0.06, 0.14, 'square', 0.05);
        break;
      }
      case 'boom':
        this.tone(ctx, 170, t, 0.35, 'sawtooth', 0.14, -130);
        this.tone(ctx, 90, t, 0.45, 'sine', 0.16, -50);
        break;
      case 'zap':
        this.tone(ctx, 420, t, 0.12, 'square', 0.05, 900);
        break;
      case 'bounce':
        this.tone(ctx, 260 + Math.min(index, 8) * 40, t, 0.1, 'sine', 0.1, 420);
        break;
      case 'tick':
        this.tone(ctx, 1200, t, 0.03, 'square', 0.03);
        break;
      case 'level':
        [392, 523, 659, 784, 1046].forEach((f, i) =>
          this.tone(ctx, f, t + i * 0.07, 0.2, 'triangle', 0.1),
        );
        break;
    }
  }

  vibrate(pattern: number | number[]): void {
    if (!this.prefs.vibration) return;
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
    const level = vol * this.prefs.volume;
    gain.gain.setValueAtTime(level, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}
