import type { Rnd } from '@/platform/rnd';

export type ReflexPhase = 'wait' | 'go' | 'decoy' | 'over';
export type ReflexEvent =
  | { type: 'go' }
  | { type: 'decoy' }
  | { type: 'hit'; ms: number; points: number }
  | { type: 'dodged' }
  | { type: 'fail'; reason: 'early' | 'late' | 'decoy' };

/** "Relâmpago": wait for the green flash and tap; ignore the blue decoys. */
export class ReflexSim {
  round = 0;
  score = 0;
  phase: ReflexPhase = 'wait';
  /** Seconds left in the current phase. */
  timer = 0;
  /** Seconds the player gets to react once it turns green. */
  window = 1;
  bestMs = 0;
  private fake = false;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.start();
  }

  private start(): void {
    this.round++;
    this.fake = this.round >= 3 && this.rnd() < 0.3;
    this.phase = 'wait';
    this.timer = 0.8 + this.rnd() * 1.8;
    this.window = Math.max(0.3, 0.95 - this.round * 0.035);
  }

  tap(): ReflexEvent | null {
    if (this.phase === 'over') return null;
    if (this.phase === 'wait' || this.phase === 'decoy') {
      const reason = this.phase === 'wait' ? 'early' : 'decoy';
      this.phase = 'over';
      return { type: 'fail', reason };
    }
    const ms = Math.round((this.window - this.timer) * 1000);
    const points = 1 + (ms <= 220 ? 2 : ms <= 300 ? 1 : 0);
    this.score += points;
    if (this.bestMs === 0 || ms < this.bestMs) this.bestMs = ms;
    this.start();
    return { type: 'hit', ms, points };
  }

  step(dt: number): ReflexEvent | null {
    if (this.phase === 'over') return null;
    this.timer -= dt;
    if (this.timer > 0) return null;
    if (this.phase === 'wait') {
      if (this.fake) {
        this.phase = 'decoy';
        this.timer = 0.9;
        return { type: 'decoy' };
      }
      this.phase = 'go';
      this.timer = this.window;
      return { type: 'go' };
    }
    if (this.phase === 'decoy') {
      this.score += 1;
      this.start();
      return { type: 'dodged' };
    }
    this.phase = 'over';
    return { type: 'fail', reason: 'late' };
  }
}
