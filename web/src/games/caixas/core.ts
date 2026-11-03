/**
 * "Empurra Caixas" (Sokoban) — pure rules. Push every box onto a goal; boxes can only be pushed,
 * never pulled. Levels are made by playing a solved board *backwards* (pulling boxes away from the
 * goals), so every level is solvable by construction.
 */
export const DR = [-1, 1, 0, 0] as const;
export const DC = [0, 0, -1, 1] as const;

export interface Level {
  w: number;
  h: number;
  walls: boolean[];
  goals: boolean[];
  boxes: number[];
  player: number;
}
export interface State {
  boxes: number[];
  player: number;
}

export function start(l: Level): State {
  return { boxes: [...l.boxes], player: l.player };
}

/** Cell reached from `i` going in direction `d`, or -1 outside the board. */
export function step(l: Level, i: number, d: number): number {
  const r = Math.floor(i / l.w) + DR[d]!;
  const c = (i % l.w) + DC[d]!;
  return r < 0 || r >= l.h || c < 0 || c >= l.w ? -1 : r * l.w + c;
}

export function isSolved(l: Level, s: State): boolean {
  return s.boxes.every((b) => l.goals[b]);
}

/** Moves the player one step (pushing a box if there is one). Null when blocked. */
export function move(l: Level, s: State, d: number): { state: State; pushed: boolean } | null {
  const t = step(l, s.player, d);
  if (t < 0 || l.walls[t]) return null;
  const at = s.boxes.indexOf(t);
  if (at < 0) return { state: { boxes: s.boxes, player: t }, pushed: false };
  const n = step(l, t, d);
  if (n < 0 || l.walls[n] || s.boxes.includes(n)) return null;
  const boxes = s.boxes.slice();
  boxes[at] = n;
  return { state: { boxes, player: t }, pushed: true };
}

/** A level of the given difficulty: bigger rooms, more boxes and a longer scramble. */
export function generate(level: number, rng: () => number = Math.random): Level {
  const size = Math.min(8, 5 + Math.floor(level / 2));
  const nBoxes = Math.min(4, 1 + Math.floor((level + 1) / 2));
  for (let attempt = 0; attempt < 200; attempt++) {
    const w = size;
    const h = size;
    const walls = Array.from({ length: w * h }, (_, i) => {
      const r = Math.floor(i / w);
      const c = i % w;
      return r === 0 || c === 0 || r === h - 1 || c === w - 1;
    });
    for (let k = 0; k < Math.floor(size * size * 0.07); k++) {
      const i = (1 + Math.floor(rng() * (h - 2))) * w + 1 + Math.floor(rng() * (w - 2));
      walls[i] = true;
    }
    const free = walls.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
    if (free.length < nBoxes + 6) continue;
    const pick = () => free.splice(Math.floor(rng() * free.length), 1)[0]!;
    const goals = Array.from({ length: w * h }, () => false);
    const boxes: number[] = [];
    for (let k = 0; k < nBoxes; k++) {
      const g = pick();
      goals[g] = true;
      boxes.push(g);
    }
    const lv: Level = { w, h, walls, goals, boxes, player: pick() };
    // Scramble: walk around, sometimes pulling the box that is behind the player.
    let player = lv.player;
    let pulls = 0;
    const want = 4 + level * 3;
    for (let tries = 0; tries < 600 && pulls < want; tries++) {
      const d = Math.floor(rng() * 4);
      const q = step(lv, player, d);
      if (q < 0 || walls[q] || boxes.includes(q)) continue;
      const behind = step(lv, player, d ^ 1);
      const at = behind >= 0 ? boxes.indexOf(behind) : -1;
      if (at >= 0 && rng() < 0.75) {
        boxes[at] = player;
        pulls++;
      }
      player = q;
    }
    lv.player = player;
    lv.boxes = boxes;
    if (!isSolved(lv, start(lv)) && pulls >= Math.min(want, 3)) return lv;
  }
  // Fallback: one box a step from its goal.
  const w = 5;
  const walls = Array.from(
    { length: 25 },
    (_, i) => i < 5 || i >= 20 || i % 5 === 0 || i % 5 === 4,
  );
  const goals = Array.from({ length: 25 }, (_, i) => i === 8);
  return { w, h: 5, walls, goals, boxes: [7], player: 6 };
}

/** Breadth-first solver (for tests and hints): the fewest moves, or null past `maxNodes`. */
export function solve(l: Level, maxNodes = 200000): number | null {
  const key = (s: State) => `${s.player}|${[...s.boxes].sort((a, b) => a - b).join(',')}`;
  const first = start(l);
  const seen = new Set([key(first)]);
  let frontier = [first];
  for (let depth = 0; frontier.length > 0 && seen.size < maxNodes; depth++) {
    const next: State[] = [];
    for (const s of frontier) {
      if (isSolved(l, s)) return depth;
      for (let d = 0; d < 4; d++) {
        const m = move(l, s, d);
        if (!m) continue;
        const k = key(m.state);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(m.state);
      }
    }
    frontier = next;
  }
  return null;
}
