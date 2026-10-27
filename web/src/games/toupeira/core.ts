import type { Rnd } from '@/platform/rnd';

export type MoleKind = 'mole' | 'gold' | 'bomb';

export interface Hole {
  kind: MoleKind | null;
  /** Seconds before it hides again. */
  ttl: number;
}

export type MoleEvent =
  | { type: 'hit'; kind: Exclude<MoleKind, 'bomb'>; hole: number; points: number }
  | { type: 'bombed'; hole: number }
  | { type: 'escaped'; hole: number };

/** "Toupeira": whack the moles, spare the bombs, don't let moles get away. */
export class MoleSim {
  readonly holes: Hole[] = Array.from({ length: 9 }, () => ({ kind: null, ttl: 0 }));
  lives = 3;
  score = 0;
  combo = 0;
  maxCombo = 0;
  time = 0;
  private spawnIn = 0.6;

  constructor(private readonly rnd: Rnd = Math.random) {}

  get dead(): boolean {
    return this.lives <= 0;
  }

  hit(i: number): MoleEvent | null {
    const hole = this.holes[i];
    if (this.dead || !hole?.kind) return null;
    const kind = hole.kind;
    hole.kind = null;
    if (kind === 'bomb') {
      this.lives--;
      this.combo = 0;
      return { type: 'bombed', hole: i };
    }
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const points = (kind === 'gold' ? 5 : 1) + Math.floor(this.combo / 5);
    this.score += points;
    return { type: 'hit', kind, hole: i, points };
  }

  step(dt: number): MoleEvent[] {
    const events: MoleEvent[] = [];
    if (this.dead) return events;
    this.time += dt;
    this.holes.forEach((h, i) => {
      if (!h.kind) return;
      h.ttl -= dt;
      if (h.ttl > 0) return;
      if (h.kind !== 'bomb') {
        this.lives--;
        this.combo = 0;
        events.push({ type: 'escaped', hole: i });
      }
      h.kind = null;
    });
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawn();
      this.spawnIn = Math.max(0.3, 0.85 - this.time * 0.01) * (0.7 + this.rnd() * 0.6);
    }
    return events;
  }

  private spawn(): void {
    const free = this.holes.map((h, i) => (h.kind ? -1 : i)).filter((i) => i >= 0);
    if (free.length === 0) return;
    const hole = this.holes[free[Math.floor(this.rnd() * free.length)]!]!;
    const r = this.rnd();
    const bomb = Math.min(0.28, 0.12 + this.time * 0.003);
    hole.kind = r < bomb ? 'bomb' : r < bomb + 0.07 ? 'gold' : 'mole';
    hole.ttl = Math.max(0.55, 1.5 - this.time * 0.015);
  }
}
