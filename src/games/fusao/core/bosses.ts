/**
 * Boss patterns. Each boss is a small state machine with readable, telegraphed attacks and a
 * second phase below half health. They act through `BossHost`.
 */
import { BOSSES, type BossKind, type EnemyKind } from './defs';
import type { Enemy, Hazard, SimEvent } from './types';

export interface BossHost {
  readonly px: number;
  readonly py: number;
  rng(): number;
  bullet(x: number, y: number, angle: number, speed: number, damage: number): void;
  hazard(h: Omit<Hazard, 'hit' | 'ownerId'>, owner: Enemy): void;
  summon(kind: EnemyKind, x: number, y: number): void;
  emit(e: SimEvent): void;
}

const TAU = Math.PI * 2;

function setState(b: Enemy, state: string, timer: number): void {
  b.state = state;
  b.timer = timer;
}

function moveTo(b: Enemy, x: number, y: number, speed: number, dt: number): void {
  const d = Math.hypot(x - b.x, y - b.y) || 1;
  b.x += ((x - b.x) / d) * speed * dt;
  b.y += ((y - b.y) / d) * speed * dt;
}

export function updateBoss(h: BossHost, b: Enemy, dt: number): void {
  if (b.entering > 0) {
    b.entering -= dt;
    return;
  }
  const kind = b.kind as BossKind;
  // Second phase below half health (once).
  if (b.phase === 1 && b.hp < b.maxHp * (kind === 'eclipse' ? 0.4 : 0.5)) {
    b.phase = 2;
    h.emit({ type: 'bossPhase', kind });
  }
  b.timer -= dt;
  const enraged = b.phase === 2;
  switch (kind) {
    case 'colosso':
      return colosso(h, b, dt, enraged);
    case 'tecela':
      return tecela(h, b, dt, enraged);
    case 'eclipse':
      return eclipse(h, b, dt, enraged);
  }
}

/** Walks in, aims (a red line), charges along it; summons minions; phase 2 charges twice and
 * ends each charge with a ring of bullets. */
function colosso(h: BossHost, b: Enemy, dt: number, enraged: boolean): void {
  const dmg = BOSSES.colosso.damage;
  const aim = (warn: number) => {
    b.angle = Math.atan2(h.py - b.y, h.px - b.x);
    h.hazard(
      {
        kind: 'line',
        x: b.x,
        y: b.y,
        angle: b.angle,
        length: 900,
        width: b.radius * 1.6,
        radius: 0,
        spin: 0,
        warn,
        active: 0,
        damage: 0,
      },
      b,
    );
  };
  switch (b.state) {
    case 'walk':
      moveTo(b, h.px, h.py, b.speed, dt);
      if (b.timer <= 0) {
        aim(0.85);
        setState(b, 'aim', 0.85);
      }
      return;
    case 'aim':
    case 'aim2':
      if (b.timer <= 0) setState(b, b.state === 'aim' ? 'charge' : 'charge2', 0.75);
      return;
    case 'charge':
    case 'charge2':
      b.x += Math.cos(b.angle) * 780 * dt;
      b.y += Math.sin(b.angle) * 780 * dt;
      if (b.timer > 0) return;
      if (enraged)
        for (let i = 0; i < 14; i++)
          h.bullet(b.x, b.y, (i / 14) * TAU + (b.state === 'charge2' ? 0.22 : 0), 210, dmg * 0.5);
      if (enraged && b.state === 'charge') {
        aim(0.6);
        setState(b, 'aim2', 0.6);
      } else setState(b, 'rest', 1.1);
      return;
    case 'rest':
      if (b.timer <= 0) {
        b.data = (b.data ?? 0) + 1;
        if (b.data % 3 === 0)
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU;
            h.summon('perseguidor', b.x + Math.cos(a) * 120, b.y + Math.sin(a) * 120);
          }
        setState(b, 'walk', 2.2);
      }
      return;
    default:
      setState(b, 'walk', 2);
  }
}

/** Keeps its distance, weaves bullet spirals and teleports; phase 2 doubles the spiral. */
function tecela(h: BossHost, b: Enemy, dt: number, enraged: boolean): void {
  const dmg = BOSSES.tecela.damage * 0.55;
  const d = Math.hypot(h.px - b.x, h.py - b.y);
  // Orbit at mid range.
  const want = 330;
  const a = Math.atan2(b.y - h.py, b.x - h.px) + 0.6 * dt;
  const tx = h.px + Math.cos(a) * want;
  const ty = h.py + Math.sin(a) * want;
  moveTo(b, tx, ty, d > want + 80 ? b.speed * 1.4 : b.speed, dt);
  switch (b.state) {
    case 'spiral':
      b.angle += enraged ? 0.42 : 0.33;
      b.data = (b.data ?? 0) - dt;
      if (b.data <= 0) {
        b.data = enraged ? 0.09 : 0.12;
        h.bullet(b.x, b.y, b.angle, 200, dmg);
        if (enraged) h.bullet(b.x, b.y, b.angle + Math.PI, 200, dmg);
      }
      if (b.timer <= 0) setState(b, 'rest', enraged ? 1 : 1.5);
      return;
    case 'rest':
      if (b.timer <= 0) {
        b.teleports = (b.teleports ?? 0) + 1;
        if (b.teleports % 3 === 0) {
          // Blink to the other side of the player.
          const ang = h.rng() * TAU;
          b.x = h.px + Math.cos(ang) * 360;
          b.y = h.py + Math.sin(ang) * 360;
          h.emit({ type: 'ring', x: b.x, y: b.y, r: 90, color: BOSSES.tecela.color });
          if (enraged) for (let i = 0; i < 4; i++) h.summon('corredor', b.x + (i - 1.5) * 50, b.y);
        }
        setState(b, 'spiral', enraged ? 2.6 : 2.2);
      }
      return;
    default:
      setState(b, 'spiral', 2);
  }
}

/** Sweeping beams and expanding shockwave rings; phase 2: two faster beams and exploders. */
function eclipse(h: BossHost, b: Enemy, dt: number, enraged: boolean): void {
  const dmg = BOSSES.eclipse.damage;
  moveTo(b, h.px, h.py, b.state === 'beam' ? b.speed * 0.3 : b.speed, dt);
  switch (b.state) {
    case 'drift':
      if (b.timer <= 0) {
        b.cycle = (b.cycle ?? 0) + 1;
        if (b.cycle % 2 === 1) {
          const start = Math.atan2(h.py - b.y, h.px - b.x) + Math.PI / 2;
          const spin = (enraged ? 1.15 : 0.8) * (h.rng() < 0.5 ? -1 : 1);
          const beam = {
            kind: 'beam' as const,
            x: b.x,
            y: b.y,
            angle: start,
            length: 1000,
            width: 46,
            radius: 0,
            spin,
            warn: 1,
            active: 2.6,
            damage: dmg,
          };
          h.hazard(beam, b);
          if (enraged) h.hazard({ ...beam, angle: start + Math.PI }, b);
          setState(b, 'beam', 3.8);
        } else {
          for (let i = 0; i < 3; i++)
            h.hazard(
              {
                kind: 'ring',
                x: b.x,
                y: b.y,
                angle: 0,
                length: 0,
                width: 26,
                radius: 40 - i * 160,
                spin: 230,
                warn: 0.6,
                active: 4,
                damage: dmg * 0.8,
              },
              b,
            );
          if (enraged)
            for (let i = 0; i < 4; i++)
              h.summon('explosivo', b.x + Math.cos(i * 1.6) * 140, b.y + Math.sin(i * 1.6) * 140);
          setState(b, 'rings', 3.5);
        }
      }
      return;
    case 'beam':
    case 'rings':
      if (b.timer <= 0) setState(b, 'drift', enraged ? 1.2 : 2);
      return;
    default:
      setState(b, 'drift', 2.5);
  }
}
