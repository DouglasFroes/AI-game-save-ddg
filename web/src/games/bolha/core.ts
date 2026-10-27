/**
 * "Bolha Gulosa" (agar.io-like) — pure rules. The player steers a blob around a big arena,
 * eats dots and smaller blobs to grow, and runs from bigger ones. Bots with names compete,
 * a live top 5 keeps the pressure on, and a boost trades a bit of mass for speed.
 */

export type Rng = () => number;

export const WORLD = 3200;
const START_MASS = 20;
const DOTS = 420;
const BOTS = 14;
const DOT_MASS = 1;
/** You must be this much bigger (in radius) to eat someone. */
export const EAT_RATIO = 1.12;
const BOOST_COST = 0.08;
const BOOST_S = 0.5;
const BOOST_SPEED = 2.3;
const BOOST_COOLDOWN = 1.2;
/** Big blobs slowly lose mass, so nobody stays on top forever. */
const DECAY = 0.0025;

export const radiusOf = (mass: number) => 8 + Math.sqrt(mass) * 6;
/** Bigger is slower. */
export const speedOf = (mass: number) => 420 / Math.pow(mass, 0.18);

export interface Blob {
  readonly id: number;
  readonly name: string;
  readonly color: number;
  readonly bot: boolean;
  x: number;
  y: number;
  mass: number;
  /** Heading of a bot (radians). */
  dir: number;
  boost: number;
  cooldown: number;
  alive: boolean;
  /** Seconds since a bot last picked a target. */
  think: number;
  /** Seconds of spawn protection (can't be eaten). */
  shield: number;
}

export interface Dot {
  x: number;
  y: number;
  color: number;
}

export type BolhaEvent =
  { type: 'eat'; who: Blob; prey: Blob } | { type: 'dot'; who: Blob } | { type: 'over'; by: Blob };

const BOT_NAMES = [
  'Bia',
  'Caio',
  'Duda',
  'Enzo',
  'Gabi',
  'Heitor',
  'Iris',
  'Juca',
  'Lara',
  'Malu',
  'Nico',
  'Otto',
  'Pipoca',
  'Quica',
  'Rafa',
  'Sofi',
  'Theo',
  'Vivi',
  'Zeca',
  'Biscoito',
  'Tampinha',
  'Foguete',
];
export const COLORS = [
  0xff4f8b, 0x4cc9f0, 0xffd23f, 0x5bd46f, 0x9b5de5, 0xff7b00, 0x00bbf9, 0xf15bb5,
];

export class BolhaSim {
  readonly blobs: Blob[] = [];
  readonly dots: Dot[] = [];
  readonly player: Blob;
  over = false;
  /** Best mass reached (the score). */
  best = START_MASS;
  kills = 0;
  /** Best place reached in the live top. */
  bestRank = BOTS + 1;
  time = 0;
  private ids = 0;

  constructor(
    name: string,
    private readonly rng: Rng = Math.random,
  ) {
    this.player = this.spawn(name, 0x35e0ff, false, START_MASS);
    this.player.x = this.player.y = WORLD / 2;
    for (let i = 0; i < BOTS; i++) this.spawnBot();
    for (let i = 0; i < DOTS; i++) this.dots.push(this.newDot());
  }

  get score(): number {
    return Math.floor(this.best);
  }

  /** Alive blobs, biggest first. */
  ranking(): Blob[] {
    return this.blobs.filter((b) => b.alive).sort((a, b) => b.mass - a.mass);
  }

  rankOf(b: Blob): number {
    return this.ranking().indexOf(b) + 1;
  }

  private newDot(): Dot {
    return {
      x: 20 + this.rng() * (WORLD - 40),
      y: 20 + this.rng() * (WORLD - 40),
      color: COLORS[Math.floor(this.rng() * COLORS.length)]!,
    };
  }

  private spawn(name: string, color: number, bot: boolean, mass: number): Blob {
    const b: Blob = {
      id: ++this.ids,
      name,
      color,
      bot,
      x: 100 + this.rng() * (WORLD - 200),
      y: 100 + this.rng() * (WORLD - 200),
      mass,
      dir: this.rng() * Math.PI * 2,
      boost: 0,
      cooldown: 0,
      alive: true,
      think: 0,
      shield: 2,
    };
    this.blobs.push(b);
    return b;
  }

  private spawnBot(): void {
    const used = new Set(this.blobs.filter((b) => b.alive).map((b) => b.name));
    const free = BOT_NAMES.filter((n) => !used.has(n));
    const name = free[Math.floor(this.rng() * free.length)] ?? 'Bolha';
    // Bots come in all sizes, a few big ones to fear from the start; more later on.
    const growth = 1 + Math.min(3, this.time / 120);
    const mass = (10 + Math.pow(this.rng(), 2.2) * 160) * growth;
    const b = this.spawn(name, COLORS[Math.floor(this.rng() * COLORS.length)]!, true, mass);
    // Never right on top of the player.
    if (Math.hypot(b.x - this.player.x, b.y - this.player.y) < 600) {
      b.x = (this.player.x + WORLD / 2) % WORLD;
      b.y = (this.player.y + WORLD / 2) % WORLD;
    }
  }

  /** Spends a little mass for a short burst of speed. */
  boost(b: Blob = this.player): boolean {
    if (!b.alive || b.cooldown > 0 || b.mass < START_MASS * 1.5) return false;
    b.mass *= 1 - BOOST_COST;
    b.boost = BOOST_S;
    b.cooldown = BOOST_COOLDOWN;
    return true;
  }

  /** Bot brain: chase the best nearby prey, run from danger, otherwise graze. */
  private steerBot(b: Blob, dt: number): void {
    b.think -= dt;
    if (b.think > 0) return;
    b.think = 0.25 + this.rng() * 0.25;
    const r = radiusOf(b.mass);
    const view = 380 + r * 3;
    let threat: Blob | null = null;
    let prey: Blob | null = null;
    let threatD = Infinity;
    let preyScore = 0;
    for (const o of this.blobs) {
      if (o === b || !o.alive) continue;
      const d = Math.hypot(o.x - b.x, o.y - b.y);
      if (d > view) continue;
      const or = radiusOf(o.mass);
      if (or > r * EAT_RATIO && d < threatD) {
        threat = o;
        threatD = d;
      } else if (r > or * EAT_RATIO && o.shield <= 0) {
        const score = o.mass / (d + 50);
        if (score > preyScore) {
          prey = o;
          preyScore = score;
        }
      }
    }
    if (threat && threatD < 260 + radiusOf(threat.mass)) {
      b.dir = Math.atan2(b.y - threat.y, b.x - threat.x) + (this.rng() - 0.5) * 0.6;
      if (threatD < radiusOf(threat.mass) + r + 60) this.boost(b);
    } else if (prey) {
      b.dir = Math.atan2(prey.y - b.y, prey.x - b.x);
      if (Math.hypot(prey.x - b.x, prey.y - b.y) < r + 140 && this.rng() < 0.3) this.boost(b);
    } else {
      // Graze: head for the closest dot (sampled), with some wandering.
      let best: Dot | null = null;
      let bestD = Infinity;
      for (let i = 0; i < 24; i++) {
        const d0 = this.dots[Math.floor(this.rng() * this.dots.length)];
        if (!d0) continue;
        const d = Math.hypot(d0.x - b.x, d0.y - b.y);
        if (d < bestD) {
          bestD = d;
          best = d0;
        }
      }
      if (best) b.dir = Math.atan2(best.y - b.y, best.x - b.x) + (this.rng() - 0.5) * 0.4;
    }
  }

  private move(b: Blob, dx: number, dy: number, dt: number): void {
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      const v = speedOf(b.mass) * (b.boost > 0 ? BOOST_SPEED : 1) * Math.min(1, len);
      b.x += (dx / len) * v * dt;
      b.y += (dy / len) * v * dt;
    }
    const r = radiusOf(b.mass) * 0.5;
    b.x = Math.max(r, Math.min(WORLD - r, b.x));
    b.y = Math.max(r, Math.min(WORLD - r, b.y));
    b.boost = Math.max(0, b.boost - dt);
    b.cooldown = Math.max(0, b.cooldown - dt);
    b.shield = Math.max(0, b.shield - dt);
    if (b.mass > 60) b.mass = Math.max(60, b.mass * (1 - DECAY * dt));
  }

  /**
   * `steerX/steerY`: where the player wants to go (a direction; length ≤ 1 sets the speed,
   * like a joystick).
   */
  step(dt: number, steerX: number, steerY: number): BolhaEvent[] {
    if (this.over) return [];
    this.time += dt;
    const events: BolhaEvent[] = [];
    this.move(this.player, steerX, steerY, dt);
    for (const b of this.blobs) {
      if (!b.bot || !b.alive) continue;
      this.steerBot(b, dt);
      this.move(b, Math.cos(b.dir), Math.sin(b.dir), dt);
    }

    // Dots.
    for (const b of this.blobs) {
      if (!b.alive) continue;
      const r = radiusOf(b.mass);
      for (const d of this.dots) {
        if (Math.abs(d.x - b.x) > r || Math.abs(d.y - b.y) > r) continue;
        if ((d.x - b.x) ** 2 + (d.y - b.y) ** 2 > r * r) continue;
        b.mass += DOT_MASS;
        Object.assign(d, this.newDot());
        if (b === this.player) events.push({ type: 'dot', who: b });
      }
    }

    // Blobs eating blobs: the center of the smaller one must be inside the bigger one.
    const alive = this.blobs.filter((b) => b.alive).sort((a, b) => b.mass - a.mass);
    for (const big of alive) {
      if (!big.alive) continue;
      const R = radiusOf(big.mass);
      for (const small of alive) {
        if (small === big || !small.alive || small.shield > 0) continue;
        if (R < radiusOf(small.mass) * EAT_RATIO) continue;
        if (Math.hypot(small.x - big.x, small.y - big.y) > R - radiusOf(small.mass) * 0.4) continue;
        small.alive = false;
        big.mass += small.mass * 0.8;
        events.push({ type: 'eat', who: big, prey: small });
        if (big === this.player) this.kills++;
        if (small === this.player) {
          this.over = true;
          events.push({ type: 'over', by: big });
          return events;
        }
      }
    }
    for (let i = this.blobs.length - 1; i >= 0; i--)
      if (!this.blobs[i]!.alive && this.blobs[i] !== this.player) this.blobs.splice(i, 1);
    while (this.blobs.filter((b) => b.bot).length < BOTS) this.spawnBot();

    this.best = Math.max(this.best, this.player.mass);
    this.bestRank = Math.min(this.bestRank, this.rankOf(this.player));
    return events;
  }
}
