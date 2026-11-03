/**
 * "Estilingue" — pure rules. Pull the sling back and let go: the stone flies in an arc, bursts
 * through weak blocks and pops every pig it touches. Pigs that lose the block under them fall.
 */
export const ANCHOR = { x: 150, y: 930 } as const;
export const GROUND = 1100;
export const STONE_R = 22;
export const PIG_R = 32;
export const MAX_PULL = 190;
const POWER = 7.2;
const GRAVITY = 1500;
const BREAK_SPEED = 430;

export interface Block {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
}
export interface Pig {
  x: number;
  y: number;
  alive: boolean;
  /** The block it stands on (it dies when that block breaks), or -1 for the ground. */
  support: number;
}
export interface Stone {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
}
export interface SlingState {
  stage: number;
  shots: number;
  blocks: Block[];
  pigs: Pig[];
  stone: Stone | null;
  score: number;
  /** Pigs popped by the shot in flight. */
  popped: number;
}

/** A stage: a few towers, each topped by a pig, further and taller as the stages go on. */
export function newStage(stage: number, rng: () => number = Math.random): SlingState {
  const towers = Math.min(5, 1 + Math.ceil(stage / 2));
  const blocks: Block[] = [];
  const pigs: Pig[] = [];
  let id = 0;
  for (let i = 0; i < towers; i++) {
    const x = 400 + ((i + rng() * 0.5) * 290) / towers;
    const height = 1 + Math.floor(rng() * Math.min(3, 1 + Math.ceil(stage / 2)));
    let top = GROUND;
    let support = -1;
    for (let k = 0; k < height; k++) {
      const h = 64;
      top -= h;
      blocks.push({ id, x: x - 36, y: top, w: 72, h, hp: stage < 3 ? 1 : 1 + (k % 2) });
      support = id++;
    }
    pigs.push({ x, y: top - PIG_R, alive: true, support });
  }
  return { stage, shots: towers + 2, blocks, pigs, stone: null, score: 0, popped: 0 };
}

export function pigsLeft(s: SlingState): number {
  return s.pigs.filter((p) => p.alive).length;
}

/** Launches from a pull vector (pointer minus anchor, clamped): the stone goes the opposite way. */
export function launch(s: SlingState, pullX: number, pullY: number): boolean {
  if (s.stone || s.shots <= 0) return false;
  const len = Math.hypot(pullX, pullY);
  if (len < 24) return false;
  const k = Math.min(1, MAX_PULL / len);
  s.stone = { x: ANCHOR.x, y: ANCHOR.y, vx: -pullX * k * POWER, vy: -pullY * k * POWER, t: 0 };
  s.shots--;
  s.popped = 0;
  return true;
}

/** Advances the stone in flight. Returns true when the shot is over. */
export function step(s: SlingState, dt: number): boolean {
  const st = s.stone;
  if (!st) return true;
  st.t += dt;
  st.vy += GRAVITY * dt;
  st.x += st.vx * dt;
  st.y += st.vy * dt;
  for (const pig of s.pigs) {
    if (pig.alive && Math.hypot(pig.x - st.x, pig.y - st.y) < PIG_R + STONE_R) {
      pig.alive = false;
      s.popped++;
      s.score += 100;
      st.vx *= 0.8;
      st.vy *= 0.8;
    }
  }
  for (const b of [...s.blocks]) {
    const cx = Math.max(b.x, Math.min(st.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(st.y, b.y + b.h));
    if (Math.hypot(st.x - cx, st.y - cy) >= STONE_R) continue;
    const speed = Math.hypot(st.vx, st.vy);
    if (speed > BREAK_SPEED) {
      b.hp--;
      st.vx *= 0.6;
      st.vy *= 0.6;
      if (b.hp <= 0) {
        s.blocks = s.blocks.filter((o) => o.id !== b.id);
        s.score += 20;
        for (const pig of s.pigs) {
          if (pig.alive && pig.support === b.id) {
            pig.alive = false;
            s.popped++;
            s.score += 100;
          }
        }
      }
    } else {
      // Too weak to break it: bounce back.
      if (Math.abs(st.x - cx) > Math.abs(st.y - cy)) st.vx = -st.vx * 0.4;
      else st.vy = -st.vy * 0.4;
      st.x += Math.sign(st.x - cx || 1) * 3;
    }
    break;
  }
  const over = st.y > GROUND - STONE_R || st.x > 800 || st.x < -80 || st.t > 6;
  if (over) s.stone = null;
  return over;
}

/** Whether the stage is cleared (all pigs gone) or lost (no shots left, nothing in flight). */
export function outcome(s: SlingState): 'playing' | 'clear' | 'lost' {
  if (pigsLeft(s) === 0) return 'clear';
  if (s.shots <= 0 && !s.stone) return 'lost';
  return 'playing';
}

/** Runs a whole shot on a copy and returns it (the bot uses it to try aims). */
export function simulate(s: SlingState, pullX: number, pullY: number): SlingState {
  const c = structuredClone(s);
  if (!launch(c, pullX, pullY)) return c;
  for (let i = 0; i < 800 && !step(c, 1 / 120); i++);
  return c;
}

/** Best aim out of a grid of angles and powers: the one that pops the most pigs. */
export function bestPull(s: SlingState): { x: number; y: number } {
  let best = { x: -MAX_PULL * 0.7, y: MAX_PULL * 0.7 };
  let bestScore = -1;
  for (let deg = 10; deg <= 80; deg += 2) {
    for (let p = 0.45; p <= 1.001; p += 0.05) {
      const a = (deg * Math.PI) / 180;
      const x = -Math.cos(a) * MAX_PULL * p;
      const y = Math.sin(a) * MAX_PULL * p;
      const r = simulate(s, x, y);
      const v = r.score - s.score;
      if (v > bestScore) {
        bestScore = v;
        best = { x, y };
      }
    }
  }
  return best;
}
