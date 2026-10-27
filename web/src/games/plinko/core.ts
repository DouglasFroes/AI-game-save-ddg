import { pick, shuffle, type Rnd } from '@/platform/rnd';

export const BOARD_L = 60;
export const BOARD_R = 660;
export const DROP_Y = 262;
export const SLOT_TOP = 1052;
export const BALL_R = 11;
export const PEG_R = 9;
export const SLOTS = 9;
export const SLOT_W = (BOARD_R - BOARD_L) / SLOTS;
const GRAVITY = 1400;
const SUBSTEPS = 4;
const RESTITUTION = 0.5;
export const DROP_COOLDOWN = 0.22;

/** Value of each landing slot before upgrades: the edges are rare and pay the most. */
export const BASE_MULTS: readonly number[] = [10, 3, 1.5, 0.5, 0.2, 0.5, 1.5, 3, 10];

export interface Peg {
  x: number;
  y: number;
  /** Golden pegs pay a coin every time a ball touches them. */
  gold: boolean;
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds spent nearly still, used to nudge a ball balanced on a peg. */
  idle: number;
}

export type UpgradeId = 'balls' | 'mult' | 'center' | 'gold' | 'value' | 'magnet';

export interface UpgradeInfo {
  id: UpgradeId;
  name: string;
  desc: string;
  emoji: string;
  max: number;
}

export const UPGRADES: readonly UpgradeInfo[] = [
  { id: 'balls', name: 'Mais bolas', desc: '+2 bolas por rodada', emoji: '🎱', max: 5 },
  { id: 'mult', name: 'Multiplicador', desc: 'Todos os poços valem +20%', emoji: '✨', max: 8 },
  { id: 'center', name: 'Poço dourado', desc: 'O poço do meio ganha +1x', emoji: '🏆', max: 5 },
  { id: 'gold', name: 'Pinos ricos', desc: 'Pinos dourados pagam +2 moedas', emoji: '🪙', max: 6 },
  { id: 'value', name: 'Bola valiosa', desc: 'Cada bola vale +4 moedas', emoji: '💎', max: 6 },
  {
    id: 'magnet',
    name: 'Ímã',
    desc: 'Bolas são puxadas para os poços das pontas',
    emoji: '🧲',
    max: 4,
  },
];

export type PlinkoEvent =
  | { type: 'drop'; x: number }
  | { type: 'peg'; x: number; y: number; gold: boolean; coins: number }
  | { type: 'land'; x: number; slot: number; coins: number; mult: number }
  | { type: 'roundEnd'; success: boolean; earned: number; quota: number };

/** Pegs in alternating rows of 9 and 8; every seventh one is golden. */
export function makePegs(): Peg[] {
  const pegs: Peg[] = [];
  const spacing = SLOT_W;
  for (let row = 0; row < 12; row++) {
    const odd = row % 2 === 1;
    const n = odd ? SLOTS - 1 : SLOTS;
    for (let i = 0; i < n; i++) {
      pegs.push({
        // Even rows sit over the slots, odd rows between them.
        x: BOARD_L + (odd ? spacing : spacing / 2) + i * spacing,
        y: 340 + row * 56,
        gold: (row * 9 + i) % 7 === 3,
      });
    }
  }
  return pegs;
}

/** Coins asked for in a round: gentle at first, then it climbs steadily. */
export function quotaFor(round: number): number {
  return Math.round((60 * 1.5 ** (round - 1)) / 5) * 5;
}

/**
 * "Chuva de Bolas": drop balls through a field of pegs into multiplier slots. Reach the round's quota
 * to visit the shop and pick a permanent upgrade; miss it and the run is over.
 */
export class PlinkoSim {
  round = 1;
  pegs = makePegs();
  balls: Ball[] = [];
  state: 'play' | 'shop' | 'over' = 'play';
  total = 0;
  earned = 0;
  quota = quotaFor(1);
  dropsLeft = 0;
  droppedThisRound = 0;
  lastDrop = -9;
  shopChoices: UpgradeInfo[] = [];
  picked: UpgradeId[] = [];
  levels: Record<UpgradeId, number> = {
    balls: 0,
    mult: 0,
    center: 0,
    gold: 0,
    value: 0,
    magnet: 0,
  };
  time = 0;
  bestLanding = 0;
  private nextId = 1;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.dropsLeft = this.ballsPerRound;
  }

  get ballsPerRound(): number {
    return 10 + 2 * this.levels.balls;
  }

  get ballValue(): number {
    return 10 + 4 * this.levels.value;
  }

  /** Multiplier of one slot with the upgrades applied. */
  slotMult(slot: number): number {
    const base = BASE_MULTS[slot] ?? 0;
    const center = slot === (SLOTS - 1) / 2 ? this.levels.center : 0;
    return Math.round((base * (1 + 0.2 * this.levels.mult) + center) * 100) / 100;
  }

  /** Whether another ball can be released right now. */
  canDrop(): boolean {
    return (
      this.state === 'play' && this.dropsLeft > 0 && this.time - this.lastDrop >= DROP_COOLDOWN
    );
  }

  drop(x: number): PlinkoEvent[] {
    if (!this.canDrop()) return [];
    const cx = Math.max(BOARD_L + BALL_R + 4, Math.min(BOARD_R - BALL_R - 4, x));
    this.balls.push({
      id: this.nextId++,
      x: cx,
      y: DROP_Y,
      vx: (this.rnd() - 0.5) * 24,
      vy: 0,
      idle: 0,
    });
    this.dropsLeft--;
    this.droppedThisRound++;
    this.lastDrop = this.time;
    return [{ type: 'drop', x: cx }];
  }

  step(dt: number): PlinkoEvent[] {
    this.time += dt;
    if (this.state !== 'play') return [];
    const events: PlinkoEvent[] = [];
    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      for (const b of this.balls) this.moveBall(b, h, events);
      this.balls = this.balls.filter((b) => b.y < SLOT_TOP + 500);
    }
    if (this.dropsLeft === 0 && this.balls.length === 0 && this.droppedThisRound > 0) {
      const success = this.earned >= this.quota;
      events.push({ type: 'roundEnd', success, earned: this.earned, quota: this.quota });
      if (success) {
        this.state = 'shop';
        this.shopChoices = this.offer();
      } else this.state = 'over';
    }
    return events;
  }

  /** Takes the chosen upgrade and starts the next round. */
  choose(id: UpgradeId): boolean {
    if (this.state !== 'shop' || !this.shopChoices.some((u) => u.id === id)) return false;
    this.levels[id]++;
    this.picked.push(id);
    this.round++;
    this.quota = quotaFor(this.round);
    this.earned = 0;
    this.droppedThisRound = 0;
    this.dropsLeft = this.ballsPerRound;
    this.shopChoices = [];
    this.state = 'play';
    return true;
  }

  private offer(): UpgradeInfo[] {
    const open = UPGRADES.filter((u) => this.levels[u.id] < u.max);
    const choices = shuffle(this.rnd, [...open]).slice(0, 3);
    return choices.length > 0 ? choices : [pick(this.rnd, UPGRADES)];
  }

  private moveBall(b: Ball, h: number, events: PlinkoEvent[]): void {
    b.vy += GRAVITY * h;
    if (this.levels.magnet > 0 && b.y > 760) {
      // Lean toward whichever edge is nearer.
      const toward = b.x < (BOARD_L + BOARD_R) / 2 ? -1 : 1;
      b.vx += toward * 110 * this.levels.magnet * h;
    }
    b.x += b.vx * h;
    b.y += b.vy * h;
    if (b.x < BOARD_L + BALL_R) {
      b.x = BOARD_L + BALL_R;
      b.vx = Math.abs(b.vx) * 0.6;
    } else if (b.x > BOARD_R - BALL_R) {
      b.x = BOARD_R - BALL_R;
      b.vx = -Math.abs(b.vx) * 0.6;
    }

    for (const p of this.pegs) {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      if (Math.abs(dy) > BALL_R + PEG_R || Math.abs(dx) > BALL_R + PEG_R) continue;
      const d = Math.hypot(dx, dy);
      if (d >= BALL_R + PEG_R || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      b.x = p.x + nx * (BALL_R + PEG_R);
      b.y = p.y + ny * (BALL_R + PEG_R);
      const vn = b.vx * nx + b.vy * ny;
      if (vn >= 0) continue;
      b.vx -= (1 + RESTITUTION) * vn * nx;
      b.vy -= (1 + RESTITUTION) * vn * ny;
      // A little scatter keeps balls from balancing forever and makes every drop different.
      b.vx += (this.rnd() - 0.5) * 38;
      if (-vn > 90) {
        const coins = p.gold ? 1 + 2 * this.levels.gold : 0;
        if (coins > 0) {
          this.earned += coins;
          this.total += coins;
        }
        events.push({ type: 'peg', x: p.x, y: p.y, gold: p.gold, coins });
      }
    }

    if (Math.hypot(b.vx, b.vy) < 12) {
      b.idle += h;
      if (b.idle > 0.5) {
        b.vx += (this.rnd() < 0.5 ? -1 : 1) * 90;
        b.idle = 0;
      }
    } else b.idle = 0;

    if (b.y >= SLOT_TOP) {
      const slot = Math.max(0, Math.min(SLOTS - 1, Math.floor((b.x - BOARD_L) / SLOT_W)));
      const mult = this.slotMult(slot);
      const coins = Math.round(this.ballValue * mult);
      this.earned += coins;
      this.total += coins;
      this.bestLanding = Math.max(this.bestLanding, coins);
      events.push({ type: 'land', x: b.x, slot, coins, mult });
      // Off the board: filtered out at the end of the substep, so a landing is counted once.
      b.y = SLOT_TOP + 1000;
    }
  }
}
