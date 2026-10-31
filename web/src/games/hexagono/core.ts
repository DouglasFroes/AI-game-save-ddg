/**
 * "Hexágono" — pure rules. Walls close in on a spinning hexagon; the player is a small arrow
 * orbiting the centre and must slip through the gaps. Everything is measured in the hexagon's own
 * frame (the spin is only drawn), so collisions are a question of "which side, how far".
 */
export const SIDES = 6;
export const SECTOR = (Math.PI * 2) / SIDES;
/** Distance (px) from the centre at which the player orbits. */
export const PLAYER_R = 118;
/** Walls vanish once they reach the central hexagon. */
export const CORE_R = 74;
export const WALL_T = 34;
export const SPAWN_R = 900;
/** Radians per second the player turns while a side of the screen is held. */
export const TURN = 9.2;

/** Seconds at which the stage name changes (and the game gets faster). */
export const STAGES: ReadonlyArray<{ at: number; name: string }> = [
  { at: 0, name: 'PONTO' },
  { at: 10, name: 'LINHA' },
  { at: 20, name: 'TRIÂNGULO' },
  { at: 30, name: 'QUADRADO' },
  { at: 45, name: 'PENTÁGONO' },
  { at: 60, name: 'HEXÁGONO' },
];

export interface Wall {
  /** Inner edge distance from the centre. */
  dist: number;
  /** Bit i set = side i is blocked. */
  readonly mask: number;
}

export type HexEvent = { type: 'stage'; index: number; name: string } | { type: 'dead' };

export const normalize = (a: number): number => {
  const t = Math.PI * 2;
  return ((a % t) + t) % t;
};

export const sectorOf = (angle: number): number => Math.floor(normalize(angle) / SECTOR) % SIDES;

export const blocked = (mask: number, side: number): boolean => ((mask >> side) & 1) === 1;

/** Index of the stage for a survival time. */
export function stageAt(time: number): number {
  let i = 0;
  for (let s = 0; s < STAGES.length; s++) if (time >= STAGES[s]!.at) i = s;
  return i;
}

export const rotateMask = (mask: number, by: number): number => {
  const k = ((by % SIDES) + SIDES) % SIDES;
  return ((mask << k) | (mask >> (SIDES - k))) & 0b111111;
};

/** Families of wall rings (rotated at random). Every ring leaves at least one side open. */
export function pattern(rng: () => number, stage: number): number[] {
  const shift = Math.floor(rng() * SIDES);
  const kind = Math.floor(rng() * Math.min(5, 2 + stage));
  switch (kind) {
    case 0: // one ring with a single opening
      return [rotateMask(0b111110, shift)];
    case 1: // alternating thirds
      return [rotateMask(0b010101, shift), rotateMask(0b101010, shift)];
    case 2: // spiral: the gap walks around
      return [0, 1, 2, 3].map((i) => rotateMask(0b111110, shift + i));
    case 3: // two gaps, then the other two
      return [rotateMask(0b110110, shift), rotateMask(0b011011, shift)];
    default: // the "C": go half way round
      return [rotateMask(0b111110, shift), rotateMask(0b111110, shift + 3)];
  }
}

export class HexSim {
  /** Player angle in the hexagon's frame. */
  angle = SECTOR / 2;
  /** Spin of the hexagon (drawing only). */
  spin = 0;
  spinSpeed = 1.1;
  time = 0;
  walls: Wall[] = [];
  alive = true;
  stage = 0;
  private queue: number[] = [];
  private nextAt = 0;
  private flipIn = 4;

  constructor(private readonly rng: () => number = Math.random) {}

  get speed(): number {
    return Math.min(560, 270 + this.time * 5.2);
  }

  /** Tenths of a second survived: the score. */
  get score(): number {
    return Math.floor(this.time * 10);
  }

  /** `input`: -1 turns anticlockwise, 1 clockwise, 0 holds still. */
  step(dt: number, input: -1 | 0 | 1): HexEvent[] {
    const events: HexEvent[] = [];
    if (!this.alive) return events;
    this.time += dt;
    const st = stageAt(this.time);
    if (st !== this.stage) {
      this.stage = st;
      events.push({ type: 'stage', index: st, name: STAGES[st]!.name });
    }

    this.flipIn -= dt;
    if (this.flipIn <= 0) {
      this.flipIn = 2.5 + this.rng() * 4;
      this.spinSpeed = -Math.sign(this.spinSpeed) * (1 + this.stage * 0.32 + this.rng() * 0.6);
    }
    this.spin += this.spinSpeed * dt;

    // Turning: a wall beside the player stops the arrow instead of killing it.
    if (input !== 0) {
      const next = this.angle + input * TURN * dt;
      const side = sectorOf(next);
      if (side === sectorOf(this.angle) || !this.wallAt(side)) this.angle = normalize(next);
    }

    for (const w of this.walls) w.dist -= this.speed * dt;
    this.walls = this.walls.filter((w) => w.dist + WALL_T > CORE_R);

    this.nextAt -= this.speed * dt;
    while (this.nextAt <= 0) {
      if (!this.queue.length) this.queue = pattern(this.rng, this.stage);
      const mask = this.queue.shift()!;
      this.walls.push({ dist: SPAWN_R - this.nextAt, mask });
      // Rings of a pattern come close together; patterns leave room for a full turn.
      this.nextAt += this.queue.length ? 220 : 320;
    }

    if (this.wallAt(sectorOf(this.angle))) {
      this.alive = false;
      events.push({ type: 'dead' });
    }
    return events;
  }

  /** Whether a wall overlaps the player's orbit on that side. */
  wallAt(side: number): boolean {
    return this.walls.some(
      (w) => w.dist <= PLAYER_R + 6 && w.dist + WALL_T >= PLAYER_R - 6 && blocked(w.mask, side),
    );
  }
}
