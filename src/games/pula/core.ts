/**
 * "Pula Pula" (Doodle Jump-like) — pure rules. The kid bounces automatically on platforms when
 * falling onto them; the player only steers left/right (wrapping around the screen edges).
 * World y grows upwards; the score is the best height reached.
 */

export type Rng = () => number;

export const WIDTH = 720;
const GRAVITY = 2300;
const JUMP_VY = 1180;
const SPRING_VY = 1950;
const STEER = 560;
const MAX_NUDGE = 90;
export const PLATFORM_W = 124;
const KID_HALF = 30;
/** Highest gap the kid can jump: v²/2g, with a safety margin. */
export const MAX_GAP = Math.floor(((JUMP_VY * JUMP_VY) / (2 * GRAVITY)) * 0.82);

export type PlatformKind = 'normal' | 'moving' | 'fragile' | 'spring';

/** Height (world px) at which the game reaches full difficulty (≈ 800 points). */
export const HARDEST_AT = 8000;
/** Monsters show up from this height (≈ 150 points). */
export const MONSTERS_FROM = 1500;

/** 0 at the start → 1 at full difficulty. */
export const difficultyAt = (height: number): number =>
  Math.min(1, Math.max(0, height / HARDEST_AT));

export interface Platform {
  readonly id: number;
  x: number;
  readonly y: number;
  /** Width: platforms shrink as it gets harder. */
  readonly w: number;
  readonly kind: PlatformKind;
  vx: number;
  broken: boolean;
}

/** Floating monster: touching it ends the run, landing on top of it bounces (and scores). */
export interface Monster {
  readonly id: number;
  x: number;
  readonly y: number;
  vx: number;
  alive: boolean;
}

export const MONSTER_R = 34;
const STOMP_BONUS = 50;

export type PulaEvent =
  | { type: 'bounce'; kind: PlatformKind }
  | { type: 'break' }
  | { type: 'stomp' }
  | { type: 'over'; reason: 'fall' | 'monster' };

export class PulaSim {
  x = WIDTH / 2;
  y = 40;
  vy = JUMP_VY;
  /** Best height reached; the camera bottom follows it. */
  top = 0;
  over = false;
  /** Points from stomping monsters (on top of the height). */
  bonus = 0;
  readonly platforms: Platform[] = [];
  readonly monsters: Monster[] = [];
  private ids = 0;
  private highest = 0;

  constructor(private readonly rng: Rng = Math.random) {
    this.platforms.push({
      id: ++this.ids,
      x: WIDTH / 2,
      y: 0,
      w: PLATFORM_W,
      kind: 'normal',
      vx: 0,
      broken: false,
    });
    this.fill(1400);
  }

  get score(): number {
    return Math.floor(this.top / 10) + this.bonus;
  }

  /** Visible window: [camera, camera + 1280). */
  get camera(): number {
    return Math.max(0, this.top - 700);
  }

  /**
   * Builds the course upwards. As the height grows: wider gaps (never beyond a jump), narrower
   * platforms, more and faster moving ones, more breakable decoys and, later, monsters.
   */
  private fill(upTo: number): void {
    while (this.highest < upTo) {
      const d = difficultyAt(this.highest);
      const minGap = 60 + d * 90;
      const maxGap = MAX_GAP * (0.5 + 0.5 * d);
      const y = this.highest + minGap + this.rng() * (maxGap - minGap);
      const w = Math.round(PLATFORM_W - d * 44);
      const r = this.rng();
      const kind: PlatformKind =
        r < 0.07 ? 'spring' : r < 0.07 + 0.08 + d * 0.4 ? 'moving' : 'normal';
      const x = w / 2 + 20 + this.rng() * (WIDTH - w - 40);
      const speed = 90 + d * 230;
      this.platforms.push({
        id: ++this.ids,
        x,
        y,
        w,
        kind,
        vx: kind === 'moving' ? (this.rng() < 0.5 ? -1 : 1) * speed : 0,
        broken: false,
      });
      // Fragile decoys between the real ones (they never are the only way up).
      if (this.rng() < 0.15 + d * 0.35)
        this.platforms.push({
          id: ++this.ids,
          x: 70 + this.rng() * (WIDTH - 140),
          y: y - 30 - this.rng() * 40,
          w,
          kind: 'fragile',
          vx: 0,
          broken: false,
        });
      // Monsters float between platforms, drifting sideways (steer around, or land on them).
      if (this.highest > MONSTERS_FROM && this.rng() < 0.07 + d * 0.13)
        this.monsters.push({
          id: ++this.ids,
          x: 80 + this.rng() * (WIDTH - 160),
          y: y + (this.highest - y) * 0.5 + 40,
          vx: (this.rng() < 0.5 ? -1 : 1) * (50 + d * 110),
          alive: true,
        });
      this.highest = y;
    }
  }

  /**
   * `dir`: held direction (-1 left, 0 none, 1 right; keyboard). `nudge`: pixels to move this step
   * straight from a finger drag (capped so a wild swipe can't teleport the kid).
   */
  step(dt: number, dir: number, nudge = 0): PulaEvent[] {
    if (this.over) return [];
    const events: PulaEvent[] = [];
    this.x += dir * STEER * dt + Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, nudge));
    if (this.x < -KID_HALF) this.x += WIDTH + KID_HALF * 2;
    if (this.x > WIDTH + KID_HALF) this.x -= WIDTH + KID_HALF * 2;

    for (const p of this.platforms) {
      if (p.kind !== 'moving') continue;
      p.x += p.vx * dt;
      if (p.x < p.w / 2 || p.x > WIDTH - p.w / 2) p.vx *= -1;
    }
    for (const m of this.monsters) {
      m.x += m.vx * dt;
      if (m.x < MONSTER_R || m.x > WIDTH - MONSTER_R) m.vx *= -1;
    }

    const prevY = this.y;
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.vy < 0) {
      // Landing: feet crossed a platform top this step.
      for (const p of this.platforms) {
        if (p.broken || prevY < p.y || this.y > p.y) continue;
        if (Math.abs(this.x - p.x) > p.w / 2 + KID_HALF * 0.6) continue;
        if (p.kind === 'fragile') {
          p.broken = true;
          events.push({ type: 'break' });
          continue;
        }
        this.y = p.y;
        this.vy = p.kind === 'spring' ? SPRING_VY : JUMP_VY;
        events.push({ type: 'bounce', kind: p.kind });
        break;
      }
    }
    // Monsters: land on top to squash one, touch it any other way and it's over.
    for (const m of this.monsters) {
      if (!m.alive || Math.abs(this.x - m.x) > MONSTER_R + KID_HALF * 0.7) continue;
      if (this.y > m.y + MONSTER_R || this.y + 70 < m.y - MONSTER_R) continue;
      if (this.vy < 0 && prevY >= m.y + MONSTER_R * 0.4) {
        m.alive = false;
        this.vy = JUMP_VY * 1.15;
        this.bonus += STOMP_BONUS;
        events.push({ type: 'stomp' });
      } else {
        this.over = true;
        events.push({ type: 'over', reason: 'monster' });
        return events;
      }
    }
    this.top = Math.max(this.top, this.y);
    this.fill(this.top + 1600);
    const bottom = this.camera - 120;
    for (let i = this.platforms.length - 1; i >= 0; i--)
      if (this.platforms[i]!.y < bottom - 200) this.platforms.splice(i, 1);
    for (let i = this.monsters.length - 1; i >= 0; i--)
      if (this.monsters[i]!.y < bottom - 200 || !this.monsters[i]!.alive)
        this.monsters.splice(i, 1);
    if (this.y < bottom) {
      this.over = true;
      events.push({ type: 'over', reason: 'fall' });
    }
    return events;
  }
}
