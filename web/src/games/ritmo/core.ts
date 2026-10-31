/**
 * "Círculos do Ritmo" — pure rules of a tap-on-the-beat game. Circles pop up on the beat with a
 * ring closing in on them; tap a circle as its ring meets it. The closer to the beat, the more it
 * is worth. Misses drain the health bar; good hits refill it. The tempo keeps rising.
 */
export const AREA = { x0: 90, y0: 280, x1: 630, y1: 1120 } as const;
export const RADIUS = 62;
/** Timing windows (seconds from the beat). */
export const PERFECT = 0.07;
export const GOOD = 0.14;
export const OK = 0.22;

export interface Note {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** Time the ring meets the circle. */
  readonly at: number;
  /** Order shown on the circle. */
  readonly n: number;
}

export type Judgement = 'perfect' | 'good' | 'ok';
export type RhythmEvent =
  | { type: 'hit'; note: Note; judgement: Judgement; points: number }
  | { type: 'miss'; note: Note }
  | { type: 'dead' };

const HEAL: Record<Judgement, number> = { perfect: 0.05, good: 0.03, ok: 0.01 };
const BASE: Record<Judgement, number> = { perfect: 300, good: 100, ok: 50 };

export class RhythmSim {
  time = 0;
  notes: Note[] = [];
  health = 1;
  score = 0;
  combo = 0;
  bestCombo = 0;
  hits = 0;
  perfects = 0;
  alive = true;
  private nextBeat = 1.2;
  private nextId = 0;
  private counter = 0;
  private last = { x: 360, y: 700 };

  constructor(private readonly rng: () => number = Math.random) {}

  /** Beats per minute: 90 rising to 190. */
  get bpm(): number {
    return Math.min(190, 90 + this.time * 1.4);
  }

  /** How long a ring takes to close (shorter at faster tempos). */
  get approach(): number {
    return Math.max(0.55, 1.25 - this.time * 0.006);
  }

  private spawn(at: number): void {
    // Next circle a comfortable hop away from the previous one, inside the play area.
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 12; tries++) {
      const a = this.rng() * Math.PI * 2;
      const d = 150 + this.rng() * 170;
      x = this.last.x + Math.cos(a) * d;
      y = this.last.y + Math.sin(a) * d;
      if (x > AREA.x0 && x < AREA.x1 && y > AREA.y0 && y < AREA.y1) break;
    }
    x = Math.max(AREA.x0, Math.min(AREA.x1, x));
    y = Math.max(AREA.y0, Math.min(AREA.y1, y));
    this.last = { x, y };
    this.counter = (this.counter % 9) + 1;
    this.notes.push({ id: this.nextId++, x, y, at, n: this.counter });
  }

  step(dt: number): RhythmEvent[] {
    const ev: RhythmEvent[] = [];
    if (!this.alive) return ev;
    this.time += dt;
    // Schedule circles one approach ahead of their beat; now and then a quick double.
    while (this.nextBeat - this.approach <= this.time) {
      this.spawn(this.nextBeat);
      const beat = 60 / this.bpm;
      this.nextBeat += this.time > 20 && this.rng() < 0.18 ? beat / 2 : beat;
    }
    for (const n of [...this.notes]) {
      if (this.time - n.at > OK) {
        this.notes.splice(this.notes.indexOf(n), 1);
        this.combo = 0;
        this.health -= 0.12;
        ev.push({ type: 'miss', note: n });
      }
    }
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      ev.push({ type: 'dead' });
    }
    return ev;
  }

  /** A tap at (x, y): hits the oldest circle under the finger if its beat is close enough. */
  tap(x: number, y: number): RhythmEvent[] {
    if (!this.alive) return [];
    const note = this.notes.find((n) => Math.hypot(n.x - x, n.y - y) <= RADIUS * 1.15);
    if (!note) return [];
    const off = Math.abs(this.time - note.at);
    // Too early: ignored (the ring is still closing); the circle stays.
    if (off > OK) return [];
    const judgement: Judgement = off <= PERFECT ? 'perfect' : off <= GOOD ? 'good' : 'ok';
    this.notes.splice(this.notes.indexOf(note), 1);
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.hits++;
    if (judgement === 'perfect') this.perfects++;
    const points = Math.round(BASE[judgement] * (1 + Math.min(this.combo, 50) * 0.04));
    this.score += points;
    this.health = Math.min(1, this.health + HEAL[judgement]);
    return [{ type: 'hit', note, judgement, points }];
  }
}
