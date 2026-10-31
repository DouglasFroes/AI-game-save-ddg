/**
 * "Corrida de 100 m" — pure rules of a tap sprint. Wait for the gun (tapping early is a false
 * start), then tap the left and right buttons alternately: each good step adds speed, tapping the
 * same side twice is a stumble. Beat the three rivals to the line to reach the next, faster race;
 * not winning ends the run. The score adds up every race, faster times paying more.
 */
export const DISTANCE = 100;
/** Speed gained per good step (less as you get faster) and lost per second. Steady tapping at
 * 6 steps/s settles near 10 m/s; 9 steps/s near 11.3 m/s. */
const STEP_GAIN = 1.75;
const MAX_SPEED = 12.2;
const DECAY = 3;

export interface Runner {
  readonly name: string;
  pos: number;
  speed: number;
  readonly top: number;
  finish: number | null;
}

export type RaceEvent =
  | { type: 'go' }
  | { type: 'false-start' }
  | { type: 'stumble' }
  | { type: 'finish'; place: number; time: number; points: number }
  | { type: 'over' };

const NAMES = ['Bolt', 'Raio', 'Flecha', 'Foguete', 'Cometa', 'Trovão', 'Jato'];

export class SprintRace {
  race = 1;
  time = 0;
  goAt = 0;
  phase: 'set' | 'run' | 'done' = 'set';
  me: Runner;
  rivals: Runner[] = [];
  score = 0;
  wins = 0;
  bestTime = 0;
  over = false;
  private lastSide: 'L' | 'R' | null = null;
  private falseStarts = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.me = { name: 'Você', pos: 0, speed: 0, top: MAX_SPEED, finish: null };
    this.setup();
  }

  private setup(): void {
    this.time = 0;
    this.goAt = 1.5 + this.rng() * 1.8;
    this.phase = 'set';
    this.lastSide = null;
    this.me = { name: 'Você', pos: 0, speed: 0, top: MAX_SPEED, finish: null };
    // Rivals' target times: 14 s in the first race, getting near world class later.
    this.rivals = [0, 1, 2].map((i) => {
      const target = Math.max(9.6, 14.2 - this.race * 0.45 - i * 0.35 + this.rng() * 0.5);
      return {
        name: NAMES[(this.race + i) % NAMES.length]!,
        pos: 0,
        speed: 0,
        top: DISTANCE / (target - 1.2),
        finish: null,
      };
    });
  }

  /** A tap on the left or right button. */
  tap(side: 'L' | 'R'): RaceEvent[] {
    if (this.over || this.phase === 'done') return [];
    if (this.phase === 'set') {
      this.falseStarts++;
      if (this.falseStarts >= 2) {
        this.over = true;
        return [{ type: 'false-start' }, { type: 'over' }];
      }
      this.setup();
      return [{ type: 'false-start' }];
    }
    if (side === this.lastSide) {
      this.me.speed *= 0.55;
      this.lastSide = side;
      return [{ type: 'stumble' }];
    }
    this.lastSide = side;
    this.me.speed = Math.min(MAX_SPEED, this.me.speed + STEP_GAIN * (1 - this.me.speed / 14));
    return [];
  }

  step(dt: number): RaceEvent[] {
    const ev: RaceEvent[] = [];
    if (this.over || this.phase === 'done') return ev;
    this.time += dt;
    if (this.phase === 'set') {
      if (this.time >= this.goAt) {
        this.phase = 'run';
        this.time = 0;
        ev.push({ type: 'go' });
      }
      return ev;
    }
    this.me.speed = Math.max(0, this.me.speed - DECAY * dt);
    for (const r of [this.me, ...this.rivals]) {
      if (r !== this.me) r.speed = Math.min(r.top, r.speed + r.top * 0.9 * dt);
      if (r.finish !== null) continue;
      r.pos += r.speed * dt;
      if (r.pos >= DISTANCE) r.finish = this.time - (r.pos - DISTANCE) / Math.max(1, r.speed);
    }
    if (this.me.finish !== null) {
      const place =
        1 + this.rivals.filter((r) => r.finish !== null && r.finish < this.me.finish!).length;
      const t = this.me.finish;
      const points = Math.max(0, Math.round((16 - t) * 100)) + (place === 1 ? 300 * this.race : 0);
      this.score += points;
      this.phase = 'done';
      ev.push({ type: 'finish', place, time: t, points });
      if (place === 1) {
        this.wins++;
        this.bestTime = this.bestTime ? Math.min(this.bestTime, t) : t;
      } else {
        this.over = true;
        ev.push({ type: 'over' });
      }
    }
    return ev;
  }

  nextRace(): void {
    if (this.phase !== 'done' || this.over) return;
    this.race++;
    this.falseStarts = 0;
    this.setup();
  }
}
