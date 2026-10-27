import type { Rnd } from '@/platform/rnd';

export type SimonPhase = 'show' | 'input' | 'over';
export type SimonPress = 'ok' | 'round' | 'fail';

/** "Sequência": watch the pads light up and repeat the order; it grows by one each round. */
export class SimonSim {
  seq: number[] = [];
  pos = 0;
  phase: SimonPhase = 'show';

  constructor(
    private readonly rnd: Rnd = Math.random,
    readonly pads = 4,
  ) {
    this.startRound();
  }

  /** Rounds completed so far. */
  get score(): number {
    return this.phase === 'over' ? Math.max(0, this.seq.length - 1) : this.seq.length - 1;
  }

  startRound(): void {
    this.seq.push(Math.floor(this.rnd() * this.pads));
    this.pos = 0;
    this.phase = 'show';
  }

  /** The scene finished playing the sequence back. */
  doneShowing(): void {
    if (this.phase === 'show') {
      this.phase = 'input';
      this.pos = 0;
    }
  }

  press(i: number): SimonPress {
    if (this.phase !== 'input') return 'fail';
    if (this.seq[this.pos] !== i) {
      this.phase = 'over';
      return 'fail';
    }
    this.pos++;
    if (this.pos < this.seq.length) return 'ok';
    this.startRound();
    return 'round';
  }
}
