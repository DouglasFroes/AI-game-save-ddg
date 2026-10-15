/**
 * Skill behaviours. Each skill (and each fusion) is a small object with an `update` run every
 * step; they only talk to the run through the `SkillHost` API, so new skills plug in by adding
 * an entry to `BEHAVIORS`.
 */
import { FUSIONS, SKILLS, type FusionId, type SkillId, type SkillLevel } from './defs';
import { cooldownOf, damageDealt } from './progression';
import type { Enemy, Player, ProjectileKind, SimEvent, Zone } from './types';

export interface SkillRuntime {
  readonly id: SkillId | FusionId;
  level: number;
  readonly fusion: boolean;
  timer: number;
  angle: number;
  /** Per-skill scratch numbers (shield refill, drone timers…). */
  data: number[];
  /** Points the renderer draws (blade tips, drones). */
  points: number[];
}

/** What a skill may do to the world. */
export interface SkillHost {
  readonly player: Player;
  readonly time: number;
  rng(): number;
  nearest(x: number, y: number, r: number, skip?: (e: Enemy) => boolean): Enemy | null;
  around(x: number, y: number, r: number, fn: (e: Enemy) => void): void;
  /** The point (near an enemy) where an area attack catches the most enemies. */
  densest(r: number, range: number): { x: number; y: number } | null;
  damage(
    e: Enemy,
    amount: number,
    opts?: { burn?: number; knock?: number; fromX?: number; fromY?: number },
  ): void;
  fire(
    kind: ProjectileKind,
    x: number,
    y: number,
    angle: number,
    o: {
      speed: number;
      damage: number;
      pierce?: number;
      life?: number;
      area?: number;
      burn?: number;
      radius?: number;
    },
  ): void;
  emit(e: SimEvent): void;
  zones: Zone[];
}

/** Stats for a skill at its level, after the player's power/area/cooldown bonuses. */
export function statsOf(s: SkillRuntime, p: Player): SkillLevel {
  const base = s.fusion
    ? FUSIONS[s.id as FusionId].stats
    : SKILLS[s.id as SkillId].levels[s.level - 1]!;
  return {
    ...base,
    damage: damageDealt(base.damage, p.might),
    cooldown: cooldownOf(base.cooldown, p.cdMult),
    area: base.area * p.areaMult,
  };
}

interface Behavior {
  update(host: SkillHost, s: SkillRuntime, dt: number): void;
}

const TAU = Math.PI * 2;
const angleTo = (x: number, y: number, e: { x: number; y: number }) => Math.atan2(e.y - y, e.x - x);

/** Chain lightning from (x, y): hits up to `jumps` enemies, each within `range` of the last. */
function chain(
  host: SkillHost,
  x: number,
  y: number,
  jumps: number,
  range: number,
  damage: number,
  color: number,
): void {
  const hit = new Set<number>();
  const points = [x, y];
  let cx = x;
  let cy = y;
  for (let i = 0; i <= jumps; i++) {
    const next = host.nearest(cx, cy, i === 0 ? range * 2.4 : range, (e) => hit.has(e.id));
    if (!next) break;
    hit.add(next.id);
    host.damage(next, damage * (1 - i * 0.06));
    points.push(next.x, next.y);
    cx = next.x;
    cy = next.y;
  }
  if (points.length > 2) host.emit({ type: 'chain', points, color });
}

/** Contact damage from blades orbiting the player, with a per-enemy hit cooldown. */
function blades(
  host: SkillHost,
  s: SkillRuntime,
  st: SkillLevel,
  radius: number,
  dt: number,
): void {
  const p = host.player;
  s.angle = (s.angle + st.speed * dt) % TAU;
  s.points.length = 0;
  for (let i = 0; i < st.count; i++) {
    const a = s.angle + (i / st.count) * TAU;
    const bx = p.x + Math.cos(a) * radius;
    const by = p.y + Math.sin(a) * radius;
    s.points.push(bx, by);
    host.around(bx, by, 26, (e) => {
      // data[] keeps "last hit time" per enemy id slot (small ring buffer by id).
      const slot = e.id % 512;
      if (host.time - (s.data[slot] ?? -9) < st.cooldown) return;
      s.data[slot] = host.time;
      host.damage(e, st.damage, { knock: 90, fromX: p.x, fromY: p.y });
    });
  }
}

function nova(
  host: SkillHost,
  x: number,
  y: number,
  r: number,
  damage: number,
  color: number,
): void {
  host.around(x, y, r, (e) => host.damage(e, damage, { knock: 260, fromX: x, fromY: y }));
  host.emit({ type: 'ring', x, y, r, color });
}

export const BEHAVIORS: Record<SkillId | FusionId, Behavior> = {
  faisca: {
    update(h, s, dt) {
      if ((s.timer -= dt) > 0) return;
      const st = statsOf(s, h.player);
      s.timer = st.cooldown;
      const p = h.player;
      const used = new Set<number>();
      for (let i = 0; i < st.count; i++) {
        const t = h.nearest(p.x, p.y, 560, (e) => used.has(e.id)) ?? h.nearest(p.x, p.y, 560);
        const a = t
          ? angleTo(p.x, p.y, t)
          : Math.atan2(p.facingY, p.facingX) + (i - (st.count - 1) / 2) * 0.25;
        if (t) used.add(t.id);
        h.fire('faisca', p.x, p.y, a, {
          speed: st.speed,
          damage: st.damage,
          pierce: st.pierce,
          life: 1.1,
          radius: 9,
        });
      }
      h.emit({ type: 'shot', skill: 'faisca' });
    },
  },
  orbe: {
    update(h, s, dt) {
      if ((s.timer -= dt) > 0) return;
      const st = statsOf(s, h.player);
      s.timer = st.cooldown;
      const p = h.player;
      const t = h.nearest(p.x, p.y, 520);
      const base = t ? angleTo(p.x, p.y, t) : h.rng() * TAU;
      for (let i = 0; i < st.count; i++)
        h.fire('orbe', p.x, p.y, base + (i - (st.count - 1) / 2) * 0.4, {
          speed: st.speed,
          damage: st.damage,
          area: st.area,
          burn: st.damage * 0.35 * p.burnMult * st.duration,
          life: 1.4,
          radius: 13,
        });
      h.emit({ type: 'shot', skill: 'orbe' });
    },
  },
  escudo: {
    // data[0]: seconds until the broken shield comes back.
    update(h, s, dt) {
      const st = statsOf(s, h.player);
      const p = h.player;
      p.shieldMax = st.damage;
      if (s.data[0] === undefined) {
        // Picked up: the barrier starts full.
        s.data[0] = st.cooldown;
        p.shield = p.shieldMax;
      }
      if (p.shield > 0) return;
      s.data[0] = (s.data[0] ?? st.cooldown) - dt;
      if (s.data[0] <= 0) {
        p.shield = p.shieldMax;
        s.data[0] = st.cooldown;
        h.emit({ type: 'shield', broke: false });
      }
    },
  },
  laminas: {
    update(h, s, dt) {
      const st = statsOf(s, h.player);
      blades(h, s, st, st.area, dt);
    },
  },
  explosao: {
    update(h, s, dt) {
      if ((s.timer -= dt) > 0) return;
      const st = statsOf(s, h.player);
      s.timer = st.cooldown;
      for (let i = 0; i < st.count; i++) {
        const at = h.densest(st.area, 560);
        if (!at) return;
        h.around(at.x, at.y, st.area, (e) =>
          h.damage(e, st.damage, { knock: 160, fromX: at.x, fromY: at.y }),
        );
        h.emit({ type: 'explosion', x: at.x, y: at.y, r: st.area, color: SKILLS.explosao.color });
      }
    },
  },
  raio: {
    update(h, s, dt) {
      if ((s.timer -= dt) > 0) return;
      const st = statsOf(s, h.player);
      s.timer = st.cooldown;
      for (let i = 0; i < st.count; i++)
        chain(h, h.player.x, h.player.y, st.pierce, st.area, st.damage, SKILLS.raio.color);
      h.emit({ type: 'shot', skill: 'raio' });
    },
  },
  gravidade: {
    // data[0]: damage tick timer.
    update(h, s, dt) {
      const st = statsOf(s, h.player);
      const p = h.player;
      const tick = (s.data[0] = (s.data[0] ?? 0.5) - dt) <= 0;
      if (tick) s.data[0] = 0.5;
      h.around(p.x, p.y, st.area, (e) => {
        e.slow = 0.25;
        e.slowFactor = Math.min(e.slowFactor, 1 - st.duration);
        if (tick && st.damage > 0) h.damage(e, st.damage * 0.5);
      });
    },
  },
  drones: {
    // data[i]: timer of drone i.
    update(h, s, dt) {
      const st = statsOf(s, h.player);
      const p = h.player;
      s.angle = (s.angle + 1.6 * dt) % TAU;
      s.points.length = 0;
      for (let i = 0; i < st.count; i++) {
        const a = s.angle + (i / st.count) * TAU;
        const dx = p.x + Math.cos(a) * 70;
        const dy = p.y + Math.sin(a) * 70;
        s.points.push(dx, dy);
        s.data[i] = (s.data[i] ?? i * 0.2) - dt;
        if (s.data[i]! > 0) continue;
        s.data[i] = st.cooldown;
        const t = h.nearest(dx, dy, st.area);
        if (t)
          h.fire('drone', dx, dy, angleTo(dx, dy, t), {
            speed: st.speed,
            damage: st.damage,
            life: 1,
            radius: 7,
          });
      }
    },
  },
  pulso: {
    update(h, s, dt) {
      if ((s.timer -= dt) > 0) return;
      const st = statsOf(s, h.player);
      s.timer = st.cooldown;
      const p = h.player;
      p.pulse = st.duration;
      p.pulseSpeed = st.speed;
      p.pulseInvuln = st.pierce > 0;
      h.emit({ type: 'pulse' });
    },
  },
  nova: {
    // data[0]: delay of the second ring (level 5).
    update(h, s, dt) {
      const st = statsOf(s, h.player);
      const p = h.player;
      if (s.data[0] !== undefined && s.data[0] > 0 && (s.data[0] -= dt) <= 0)
        nova(h, p.x, p.y, st.area * 1.45, st.damage * 0.8, SKILLS.nova.color);
      if ((s.timer -= dt) > 0) return;
      s.timer = st.cooldown;
      nova(h, p.x, p.y, st.area, st.damage, SKILLS.nova.color);
      if (st.count > 1) s.data[0] = 0.35;
    },
  },

  // ── Fusions ──────────────────────────────────────────────────────────
  plasma: {
    update(h, s, dt) {
      if ((s.timer -= dt) > 0) return;
      const st = statsOf(s, h.player);
      s.timer = st.cooldown;
      const p = h.player;
      for (let i = 0; i < st.count; i++) {
        const t = h.nearest(p.x, p.y, 600);
        const a = (t ? angleTo(p.x, p.y, t) : h.rng() * TAU) + (h.rng() - 0.5) * 0.9;
        h.fire('plasma', p.x, p.y, a, {
          speed: st.speed,
          damage: st.damage,
          area: st.area,
          burn: st.damage * 0.5 * p.burnMult * st.duration,
          life: 2.2,
          radius: 16,
          pierce: 99,
        });
      }
      h.emit({ type: 'shot', skill: 'plasma' });
    },
  },
  ruptura: {
    // The shield part works like "escudo"; the shockwaves are triggered by the run when it
    // absorbs a hit (see RunSim.hurtPlayer). data[0]: refill timer.
    update(h, s, dt) {
      const st = statsOf(s, h.player);
      const p = h.player;
      p.shieldMax = st.damage * 2;
      if (s.data[0] === undefined) {
        s.data[0] = st.cooldown;
        p.shield = p.shieldMax;
      }
      if (p.shield > 0) return;
      s.data[0] = (s.data[0] ?? st.cooldown) - dt;
      if (s.data[0] <= 0) {
        p.shield = p.shieldMax;
        s.data[0] = st.cooldown;
        // Coming back online: a big detonation around the player.
        nova(h, p.x, p.y, st.area, st.damage * 1.5, FUSIONS.ruptura.color);
        h.emit({ type: 'shield', broke: false });
      }
    },
  },
  enxame: {
    // data[i]: drone timers; data[16]: tether tick.
    update(h, s, dt) {
      const st = statsOf(s, h.player);
      const p = h.player;
      s.angle = (s.angle + st.speed * dt) % TAU;
      s.points.length = 0;
      for (let i = 0; i < st.count; i++) {
        const a = s.angle + (i / st.count) * TAU;
        s.points.push(p.x + Math.cos(a) * 110, p.y + Math.sin(a) * 110);
      }
      // Electric tethers between neighbouring drones cut through enemies.
      const tick = (s.data[16] = (s.data[16] ?? 0.35) - dt) <= 0;
      if (tick) {
        s.data[16] = 0.35;
        for (let i = 0; i < st.count; i++) {
          const ax = s.points[i * 2]!;
          const ay = s.points[i * 2 + 1]!;
          const bx = s.points[((i + 1) % st.count) * 2]!;
          const by = s.points[((i + 1) % st.count) * 2 + 1]!;
          const mx = (ax + bx) / 2;
          const my = (ay + by) / 2;
          const half = Math.hypot(bx - ax, by - ay) / 2;
          h.around(mx, my, half + 16, (e) => {
            const t = Math.max(
              0,
              Math.min(
                1,
                ((e.x - ax) * (bx - ax) + (e.y - ay) * (by - ay)) / (half * half * 4 || 1),
              ),
            );
            const d = Math.hypot(e.x - (ax + (bx - ax) * t), e.y - (ay + (by - ay) * t));
            if (d < 18 + e.radius) h.damage(e, st.damage * 0.45);
          });
        }
      }
      for (let i = 0; i < st.count; i++) {
        s.data[i] = (s.data[i] ?? i * 0.15) - dt;
        if (s.data[i]! > 0) continue;
        s.data[i] = st.cooldown;
        chain(
          h,
          s.points[i * 2]!,
          s.points[i * 2 + 1]!,
          st.pierce,
          170,
          st.damage,
          FUSIONS.enxame.color,
        );
      }
    },
  },
  vortice: {
    update(h, s, dt) {
      const st = statsOf(s, h.player);
      const p = h.player;
      // The ring breathes in and out while the vortex drags enemies into it.
      const radius = st.area * (0.85 + 0.25 * Math.sin(h.time * 2.2));
      h.around(p.x, p.y, st.duration * p.areaMult, (e) => {
        if (e.boss) return;
        const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
        const pull = 150 * dt;
        e.x += ((p.x - e.x) / d) * pull * (d > radius ? 1 : -0.4);
        e.y += ((p.y - e.y) / d) * pull * (d > radius ? 1 : -0.4);
        e.slow = 0.2;
        e.slowFactor = Math.min(e.slowFactor, 0.5);
      });
      blades(h, s, st, radius, dt);
    },
  },
  dimensional: {
    // data[0]: seconds until the next rift while pulsing.
    update(h, s, dt) {
      const st = statsOf(s, h.player);
      const p = h.player;
      if (p.pulse > 0) {
        s.data[0] = (s.data[0] ?? 0) - dt;
        if (s.data[0] <= 0) {
          s.data[0] = 0.22;
          h.zones.push({
            kind: 'rift',
            x: p.x,
            y: p.y,
            r: st.area,
            t: 0,
            ttl: 0.7,
            damage: st.damage,
          });
        }
      }
      if ((s.timer -= dt) > 0) return;
      s.timer = st.cooldown;
      p.pulse = st.duration;
      p.pulseSpeed = st.speed;
      p.pulseInvuln = true;
      h.emit({ type: 'pulse' });
    },
  },
  colapso: {
    update(h, s, dt) {
      if ((s.timer -= dt) > 0) return;
      const st = statsOf(s, h.player);
      s.timer = st.cooldown;
      const at = h.densest(st.area * 0.6, 520) ?? {
        x: h.player.x + h.player.facingX * 160,
        y: h.player.y + h.player.facingY * 160,
      };
      h.zones.push({
        kind: 'star',
        x: at.x,
        y: at.y,
        r: st.area,
        t: 0,
        ttl: st.duration,
        damage: st.damage,
      });
      h.emit({ type: 'shot', skill: 'colapso' });
    },
  },
};
