import type { Rnd } from '@/platform/rnd';

export const FIELD = { x: 36, y: 200, w: 648, h: 1030 };
export const BLAST_R = 74;
const GROW = 0.32;
const HOLD = 1.15;
const FADE = 0.3;

export type Phase = 'idle' | 'grow' | 'hold' | 'fade' | 'gone';

export interface Atom {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: Phase;
  t: number;
  /** 0..1, picks the atom's colour. */
  hue: number;
}

export type CadeiaEvent =
  | { type: 'seed'; x: number; y: number }
  | { type: 'pop'; x: number; y: number; hue: number; chain: number; points: number }
  | { type: 'levelEnd'; cleared: boolean; popped: number; target: number; bonus: number };

/** How many atoms a level has, and how many must pop. */
export function levelSpec(level: number): { count: number; target: number } {
  const count = Math.min(70, 12 + level * 4);
  const target = Math.min(count - 2, Math.ceil(count * Math.min(0.75, 0.18 + level * 0.045)));
  return { count, target };
}

/**
 * "Reação em Cadeia": one tap sets off a blast; every atom it touches blows up too. Pop enough atoms
 * to clear the level — three misses and it's over. Longer chains pay more per atom.
 */
export class CadeiaSim {
  level = 1;
  lives = 3;
  score = 0;
  atoms: Atom[] = [];
  state: 'aim' | 'running' | 'done' = 'aim';
  chain = 0;
  popped = 0;
  bestChain = 0;
  over = false;
  cleared = false;
  target = 0;
  private nextId = 1;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.startLevel();
  }

  /** (Re)builds the field for the current level. */
  startLevel(): void {
    const { count, target } = levelSpec(this.level);
    this.target = target;
    this.atoms = [];
    this.state = 'aim';
    this.chain = 0;
    this.popped = 0;
    this.cleared = false;
    const speed = 70 + Math.min(this.level, 14) * 7;
    for (let i = 0; i < count; i++) {
      const a = this.rnd() * Math.PI * 2;
      const v = speed * (0.6 + this.rnd() * 0.8);
      this.atoms.push({
        id: this.nextId++,
        x: FIELD.x + 30 + this.rnd() * (FIELD.w - 60),
        y: FIELD.y + 30 + this.rnd() * (FIELD.h - 60),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        r: 15,
        phase: 'idle',
        t: 0,
        hue: this.rnd(),
      });
    }
  }

  /** Moves on after a finished level: next level on a clear, a retry after a miss. */
  advance(): void {
    if (this.over) return;
    if (this.cleared) this.level++;
    this.startLevel();
  }

  tap(x: number, y: number): CadeiaEvent[] {
    if (this.state !== 'aim') return [];
    if (x < FIELD.x || x > FIELD.x + FIELD.w || y < FIELD.y || y > FIELD.y + FIELD.h) return [];
    this.state = 'running';
    this.atoms.push({
      id: this.nextId++,
      x,
      y,
      vx: 0,
      vy: 0,
      r: 15,
      phase: 'grow',
      t: 0,
      hue: 0.1,
    });
    return [{ type: 'seed', x, y }];
  }

  step(dt: number): CadeiaEvent[] {
    if (this.state === 'done') return [];
    const events: CadeiaEvent[] = [];

    for (const a of this.atoms) {
      if (a.phase === 'idle') {
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        const minX = FIELD.x + a.r;
        const maxX = FIELD.x + FIELD.w - a.r;
        const minY = FIELD.y + a.r;
        const maxY = FIELD.y + FIELD.h - a.r;
        if (a.x < minX) {
          a.x = minX;
          a.vx = Math.abs(a.vx);
        } else if (a.x > maxX) {
          a.x = maxX;
          a.vx = -Math.abs(a.vx);
        }
        if (a.y < minY) {
          a.y = minY;
          a.vy = Math.abs(a.vy);
        } else if (a.y > maxY) {
          a.y = maxY;
          a.vy = -Math.abs(a.vy);
        }
        continue;
      }
      a.t += dt;
      if (a.phase === 'grow') {
        a.r = 15 + (BLAST_R - 15) * Math.min(1, a.t / GROW);
        if (a.t >= GROW) {
          a.phase = 'hold';
          a.t = 0;
        }
      } else if (a.phase === 'hold') {
        if (a.t >= HOLD) {
          a.phase = 'fade';
          a.t = 0;
        }
      } else if (a.phase === 'fade') {
        a.r = BLAST_R * Math.max(0, 1 - a.t / FADE);
        if (a.t >= FADE) a.phase = 'gone';
      }
    }

    // Anything idle that touches a live blast joins it.
    const live = this.atoms.filter((a) => a.phase === 'grow' || a.phase === 'hold');
    for (const a of this.atoms) {
      if (a.phase !== 'idle') continue;
      if (!live.some((b) => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r)) continue;
      a.phase = 'grow';
      a.t = 0;
      a.vx = a.vy = 0;
      this.chain++;
      this.popped++;
      this.bestChain = Math.max(this.bestChain, this.chain);
      const points = 10 * this.chain;
      this.score += points;
      events.push({ type: 'pop', x: a.x, y: a.y, hue: a.hue, chain: this.chain, points });
    }

    if (
      this.state === 'running' &&
      this.atoms.every((a) => a.phase === 'idle' || a.phase === 'gone')
    ) {
      this.state = 'done';
      this.cleared = this.popped >= this.target;
      let bonus = 0;
      if (this.cleared) {
        bonus = 100 * this.level + 25 * (this.popped - this.target);
        this.score += bonus;
      } else {
        this.lives--;
        if (this.lives <= 0) this.over = true;
      }
      events.push({
        type: 'levelEnd',
        cleared: this.cleared,
        popped: this.popped,
        target: this.target,
        bonus,
      });
    }
    return events;
  }
}
