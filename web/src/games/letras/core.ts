/**
 * "Chuva de Letras" — pure rules. Letters fall from the sky; tap that letter on the keyboard to
 * zap the lowest one. A letter reaching the ground costs a life; tapping a letter that is not
 * falling breaks the combo. The rain gets faster and denser.
 */
export const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const POOL = 'AAAEEEIIOOUUBCDFGHJLMNPRSTVXZQKWY';
export const SKY_TOP = 240;
export const GROUND = 880;
export const LIVES = 5;

export interface Drop {
  readonly id: number;
  readonly ch: string;
  readonly x: number;
  y: number;
  readonly speed: number;
}

export type RainEvent =
  | { type: 'zap'; drop: Drop; points: number }
  | { type: 'wrong' }
  | { type: 'ground'; drop: Drop; livesLeft: number }
  | { type: 'over' };

export class LetterRain {
  time = 0;
  drops: Drop[] = [];
  score = 0;
  zapped = 0;
  combo = 0;
  bestCombo = 0;
  lives = LIVES;
  private spawnIn = 0.5;
  private nextId = 0;

  constructor(private readonly rng: () => number = Math.random) {}

  get over(): boolean {
    return this.lives <= 0;
  }

  get level(): number {
    return 1 + Math.floor(this.time / 15);
  }

  step(dt: number): RainEvent[] {
    const ev: RainEvent[] = [];
    if (this.over) return ev;
    this.time += dt;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnIn = Math.max(0.35, 1.4 - this.time * 0.012) * (0.7 + this.rng() * 0.6);
      this.drops.push({
        id: this.nextId++,
        ch: POOL[Math.floor(this.rng() * POOL.length)]!,
        x: 70 + this.rng() * 580,
        y: SKY_TOP,
        speed: Math.min(330, 70 + this.time * 2.2) * (0.8 + this.rng() * 0.4),
      });
    }
    for (const d of this.drops) d.y += d.speed * dt;
    for (const d of this.drops.filter((x) => x.y >= GROUND)) {
      this.drops.splice(this.drops.indexOf(d), 1);
      this.lives--;
      this.combo = 0;
      ev.push({ type: 'ground', drop: d, livesLeft: this.lives });
      if (this.over) {
        ev.push({ type: 'over' });
        break;
      }
    }
    return ev;
  }

  /** Zaps the lowest falling copy of the letter. */
  press(ch: string): RainEvent[] {
    if (this.over) return [];
    const target = this.drops.filter((d) => d.ch === ch).sort((a, b) => b.y - a.y)[0];
    if (!target) {
      this.combo = 0;
      return [{ type: 'wrong' }];
    }
    this.drops.splice(this.drops.indexOf(target), 1);
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.zapped++;
    // Lower letters (closer to the ground) and long combos pay more.
    const danger = (target.y - SKY_TOP) / (GROUND - SKY_TOP);
    const points = Math.round((10 + danger * 20) * (1 + Math.min(this.combo, 30) * 0.1));
    this.score += points;
    return [{ type: 'zap', drop: target, points }];
  }
}
