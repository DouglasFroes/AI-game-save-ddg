/**
 * One run of FUSÃO INFINITA, fully simulated without Phaser: the player, the enemy waves, bosses,
 * skills, experience, level-up offers and missions. The scene calls `step()` while playing and
 * `choose()` when a level-up is pending, then draws whatever is in the arrays.
 */
import { updateBoss, type BossHost } from './bosses';
import {
  ARENA,
  BOSS_ORDER,
  BOSS_TIMES,
  BOSSES,
  CHARACTERS,
  ENEMIES,
  FUSIONS,
  MISSION_POOL,
  RUN_LENGTH_S,
  scaling,
  SKILLS,
  xpToNext,
  type BossKind,
  type CharacterId,
  type EnemyKind,
  type FusionId,
  type MissionDef,
  type ModifierId,
  type PassiveId,
  type SkillId,
} from './defs';
import { SpatialGrid } from './grid';
import type { MetaBonuses, RunSummary } from './meta';
import { damageTaken, generateOffers, type Offer, type OwnedSkill } from './progression';
import { mulberry32, weighted, type Rng } from './rng';
import { BEHAVIORS, statsOf, type SkillHost, type SkillRuntime } from './skills';
import type {
  Bullet,
  Enemy,
  Gem,
  Hazard,
  Player,
  Projectile,
  ProjectileKind,
  SimEvent,
  Zone,
} from './types';

export interface RunConfig {
  character: CharacterId;
  seed: number;
  meta: MetaBonuses;
  modifiers: readonly ModifierId[];
  /** Simultaneous enemies (quality setting). */
  maxEnemies: number;
  daily?: boolean;
}

export interface Input {
  /** Movement direction, each axis in [-1, 1] (length ≤ 1). */
  x: number;
  y: number;
}

export interface Mission extends MissionDef {
  progress: number;
  done: boolean;
}

const TAU = Math.PI * 2;
const SPAWN_MIN = 780;
const SPAWN_MAX = 880;
const MAX_GEMS = 350;
const CONTACT_IFRAMES = 0.45;
const PICKUP_RADIUS = 95;

export class RunSim implements SkillHost, BossHost {
  readonly rng: Rng;
  readonly player: Player;
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly bullets: Bullet[] = [];
  readonly gems: Gem[] = [];
  readonly hazards: Hazard[] = [];
  readonly zones: Zone[] = [];
  readonly skills: SkillRuntime[] = [];
  readonly passives: Partial<Record<PassiveId, number>> = {};
  readonly missions: Mission[];
  time = 0;
  kills = 0;
  damageDone = 0;
  gemsCollected = 0;
  bossesDown: BossKind[] = [];
  fusionsMade: FusionId[] = [];
  skillsUsed = new Set<SkillId>();
  /** Level-ups waiting for a choice (the scene pauses and shows `offers`). */
  pendingLevels = 0;
  pendingChests = 0;
  offers: Offer[] | null = null;
  bonusEssence = 0;
  over: 'death' | 'victory' | null = null;
  readonly character: CharacterId;
  private events: SimEvent[] = [];
  private grid = new SpatialGrid<Enemy>(96);
  private ids = 0;
  private spawnBudget = 0;
  private nextWave = 60;
  private bossIndex = 0;
  private readonly hordeMult: number;
  private readonly speedMult: number;

  constructor(private readonly cfg: RunConfig) {
    this.rng = mulberry32(cfg.seed);
    this.character = cfg.character;
    const c = CHARACTERS[cfg.character];
    const fragile = cfg.modifiers.includes('fragil') ? 0.6 : 1;
    const maxHp = Math.round((c.maxHp + cfg.meta.hp) * fragile);
    this.player = {
      x: ARENA.w / 2,
      y: ARENA.h / 2,
      hp: maxHp,
      maxHp,
      speed: c.speed * cfg.meta.speed,
      armor: c.armor,
      regen: c.regen,
      might: c.might * cfg.meta.might,
      cdMult: c.cooldown,
      areaMult: 1,
      burnMult: c.burn,
      pickup: PICKUP_RADIUS,
      xpMult: cfg.meta.xp,
      level: 1,
      xp: 0,
      iframes: 0,
      shield: 0,
      shieldMax: 0,
      pulse: 0,
      pulseSpeed: 0,
      pulseInvuln: false,
      facingX: 0,
      facingY: -1,
    };
    this.hordeMult = cfg.modifiers.includes('horda') ? 1.5 : 1;
    this.speedMult = cfg.modifiers.includes('turbo') ? 1.2 : 1;
    this.addSkill(c.start);
    // Three different missions for this run.
    const pool = [...MISSION_POOL];
    this.missions = [];
    while (this.missions.length < 3 && pool.length) {
      const m = pool.splice(Math.floor(this.rng() * pool.length), 1)[0]!;
      if (this.missions.some((x) => x.kind === m.kind)) continue;
      this.missions.push({ ...m, progress: 0, done: false });
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────

  get build() {
    return {
      skills: this.skills.map((s): OwnedSkill => ({ id: s.id, level: s.level, fusion: s.fusion })),
      passives: this.passives,
      hpRatio: this.player.hp / this.player.maxHp,
    };
  }

  get xpNeeded(): number {
    return xpToNext(this.player.level);
  }

  get boss(): Enemy | undefined {
    return this.enemies.find((e) => e.boss && !e.dead);
  }

  /** The next boss arrival time, or null after the last one. */
  get nextBossAt(): number | null {
    return BOSS_TIMES[this.bossIndex] ?? null;
  }

  /** Waiting for a choice: the scene must not call `step()`. */
  get choosing(): boolean {
    return this.offers !== null;
  }

  step(dt: number, input: Input): SimEvent[] {
    this.events = [];
    if (this.over || this.offers) return this.events;
    this.time += dt;
    this.movePlayer(dt, input);
    this.direct(dt);
    this.rebuildGrid();
    for (const s of this.skills) BEHAVIORS[s.id].update(this, s, dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateBullets(dt);
    this.updateHazards(dt);
    this.updateZones(dt);
    this.updateGems(dt);
    this.cleanup();
    this.updateMissions();
    if (!this.over && this.player.hp <= 0) {
      this.over = 'death';
      this.emit({ type: 'death' });
    }
    if (!this.over && this.time >= RUN_LENGTH_S && !this.boss) {
      this.over = 'victory';
      this.emit({ type: 'victory' });
    }
    if (!this.over && !this.offers && (this.pendingLevels > 0 || this.pendingChests > 0))
      this.openOffers();
    return this.events;
  }

  /** Applies the chosen offer; more pending level-ups open the next set. */
  choose(index: number): SimEvent[] {
    this.events = [];
    const offer = this.offers?.[index];
    if (!offer) return this.events;
    this.offers = null;
    if (this.pendingChests > 0) this.pendingChests--;
    else this.pendingLevels--;
    this.apply(offer);
    if (this.pendingLevels > 0 || this.pendingChests > 0) this.openOffers();
    return this.events;
  }

  summary(): RunSummary {
    return {
      character: this.character,
      seconds: this.time,
      kills: this.kills,
      level: this.player.level,
      damage: Math.round(this.damageDone),
      gems: this.gemsCollected,
      bosses: [...this.bossesDown],
      fusions: [...this.fusionsMade],
      skills: [...this.skillsUsed],
      missionEssence: this.missions.filter((m) => m.done).reduce((s, m) => s + m.reward, 0),
      bonusEssence: this.bonusEssence,
      victory: this.over === 'victory',
      modifiers: [...this.cfg.modifiers],
      daily: !!this.cfg.daily,
    };
  }

  // ── SkillHost / BossHost ───────────────────────────────────────────────

  emit(e: SimEvent): void {
    // Hit numbers are capped per step: they are feedback, not information.
    if (e.type === 'hit' && this.events.length > 160) return;
    this.events.push(e);
  }

  nearest(x: number, y: number, r: number, skip?: (e: Enemy) => boolean): Enemy | null {
    return this.grid.nearest(x, y, r, (e) => e.dead || e.entering > 0 || !!skip?.(e));
  }

  around(x: number, y: number, r: number, fn: (e: Enemy) => void): void {
    this.grid.query(x, y, r + 40, (e, d2) => {
      if (e.dead || e.entering > 0) return;
      const reach = r + e.radius;
      if (d2 <= reach * reach) fn(e);
    });
  }

  densest(r: number, range: number): { x: number; y: number } | null {
    const p = this.player;
    let best: Enemy | null = null;
    let bestN = -1;
    let tries = 0;
    this.grid.query(p.x, p.y, range, (e) => {
      if (e.dead || tries++ > 18) return tries > 18;
      let n = 0;
      this.grid.query(e.x, e.y, r, () => {
        n++;
      });
      if (n > bestN) {
        bestN = n;
        best = e;
      }
    });
    const b = best as Enemy | null;
    return b ? { x: b.x, y: b.y } : null;
  }

  damage(
    e: Enemy,
    amount: number,
    opts: { burn?: number; knock?: number; fromX?: number; fromY?: number } = {},
  ): void {
    if (e.dead || e.entering > 0 || amount <= 0) return;
    e.hp -= amount;
    e.flash = 0.08;
    this.damageDone += amount;
    if (opts.burn) {
      e.burn = 3;
      e.burnDps = Math.max(e.burnDps, opts.burn / 3);
    }
    if (opts.knock && !e.boss && opts.fromX !== undefined && opts.fromY !== undefined) {
      const d = Math.hypot(e.x - opts.fromX, e.y - opts.fromY) || 1;
      const k = opts.knock * (e.kind === 'tanque' ? 0.3 : 1);
      e.kbx += ((e.x - opts.fromX) / d) * k;
      e.kby += ((e.y - opts.fromY) / d) * k;
    }
    this.emit({ type: 'hit', x: e.x, y: e.y, amount, big: amount >= 30 });
    if (e.hp <= 0) this.kill(e);
  }

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
  ): void {
    this.projectiles.push({
      id: ++this.ids,
      kind,
      x,
      y,
      vx: Math.cos(angle) * o.speed,
      vy: Math.sin(angle) * o.speed,
      damage: o.damage,
      pierce: o.pierce ?? 0,
      life: o.life ?? 1,
      radius: o.radius ?? 8,
      area: o.area ?? 0,
      burn: o.burn ?? 0,
      tick: 0.3,
      hits: [],
      dead: false,
    });
  }

  get px(): number {
    return this.player.x;
  }

  get py(): number {
    return this.player.y;
  }

  bullet(x: number, y: number, angle: number, speed: number, damage: number): void {
    this.bullets.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage,
      radius: 9,
      life: 5,
      dead: false,
    });
  }

  hazard(h: Omit<Hazard, 'hit' | 'ownerId'>, owner: Enemy): void {
    this.hazards.push({ ...h, hit: false, ownerId: owner.id });
  }

  summon(kind: EnemyKind, x: number, y: number): void {
    if (this.enemies.length < this.cfg.maxEnemies + 20) this.spawn(kind, x, y);
  }

  // ── Player ─────────────────────────────────────────────────────────────

  private movePlayer(dt: number, input: Input): void {
    const p = this.player;
    let { x, y } = input;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    if (len > 0.05) {
      p.facingX = x / (len || 1);
      p.facingY = y / (len || 1);
    }
    const speed = p.speed * (p.pulse > 0 ? 1 + p.pulseSpeed : 1);
    p.x = Math.max(30, Math.min(ARENA.w - 30, p.x + x * speed * dt));
    p.y = Math.max(30, Math.min(ARENA.h - 30, p.y + y * speed * dt));
    p.iframes = Math.max(0, p.iframes - dt);
    if (p.pulse > 0) p.pulse = Math.max(0, p.pulse - dt);
    if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
  }

  /** Damage to the player: pulse invulnerability, then the shield, then armor. */
  hurtPlayer(raw: number): void {
    const p = this.player;
    if (this.over || p.iframes > 0 || (p.pulse > 0 && p.pulseInvuln)) return;
    p.iframes = CONTACT_IFRAMES;
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, raw);
      p.shield -= absorbed;
      raw -= absorbed;
      const ruptura = this.skills.find((s) => s.id === 'ruptura');
      if (ruptura) {
        // Ruptura Defensiva: every absorbed blow becomes a shockwave.
        const st = statsOf(ruptura, p);
        this.around(p.x, p.y, 140 * p.areaMult, (e) =>
          this.damage(e, st.damage, { knock: 300, fromX: p.x, fromY: p.y }),
        );
        this.emit({
          type: 'ring',
          x: p.x,
          y: p.y,
          r: 140 * p.areaMult,
          color: FUSIONS.ruptura.color,
        });
      }
      if (p.shield <= 0) {
        this.emit({ type: 'shield', broke: true });
        const shield = this.skills.find((s) => s.id === 'escudo');
        if (shield) {
          const st = statsOf(shield, p);
          if (st.area > 0) {
            this.around(p.x, p.y, st.area, (e) =>
              this.damage(e, 6, { knock: 420, fromX: p.x, fromY: p.y }),
            );
            this.emit({ type: 'ring', x: p.x, y: p.y, r: st.area, color: SKILLS.escudo.color });
          }
        }
      }
      if (raw <= 0) return;
    }
    const taken = damageTaken(raw, p.armor);
    p.hp = Math.max(0, p.hp - taken);
    this.emit({ type: 'hurt', amount: taken });
  }

  // ── Director: waves, bosses ────────────────────────────────────────────

  private direct(dt: number): void {
    const m = this.time / 60;
    const bossAlive = !!this.boss;
    // Steady stream, thinner while a boss is on the field.
    const rate = (1.2 + 0.55 * m + 0.035 * m * m) * this.hordeMult * (bossAlive ? 0.35 : 1);
    this.spawnBudget += rate * dt;
    const room = () => this.enemies.length < this.cfg.maxEnemies;
    while (this.spawnBudget >= 1) {
      this.spawnBudget--;
      if (!room()) continue;
      const kind = weighted<EnemyKind>(this.rng, [
        { w: 10, v: 'perseguidor' },
        { w: this.time > 45 ? 4 + m : 0, v: 'corredor' },
        { w: this.time > 110 ? 2 + 0.6 * m : 0, v: 'atirador' },
        { w: this.time > 150 ? 1.5 + 0.5 * m : 0, v: 'tanque' },
        { w: this.time > 230 ? 2 + 0.5 * m : 0, v: 'explosivo' },
      ])!;
      const at = this.spawnPoint();
      this.spawn(kind, at.x, at.y);
    }
    // Every 40 s: a ring closes in from all sides (with gaps to slip through).
    if (this.time >= this.nextWave && !bossAlive) {
      this.nextWave += 40;
      const n = Math.min(28, 12 + Math.floor(m * 2));
      const kind: EnemyKind = m > 3 && this.rng() < 0.5 ? 'corredor' : 'perseguidor';
      const gap = this.rng() * TAU;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        if (Math.abs(((a - gap + Math.PI * 3) % TAU) - Math.PI) < 0.45) continue;
        if (!room()) break;
        this.spawn(kind, this.player.x + Math.cos(a) * 560, this.player.y + Math.sin(a) * 560);
      }
      this.emit({ type: 'wave' });
    }
    const bossAt = BOSS_TIMES[this.bossIndex];
    if (bossAt !== undefined && this.time >= bossAt && !bossAlive) {
      const kind = BOSS_ORDER[this.bossIndex]!;
      this.bossIndex++;
      const at = this.spawnPoint(520);
      const b = this.spawn(kind, at.x, at.y);
      b.entering = 1.6;
      this.emit({ type: 'boss', kind });
    }
  }

  private spawnPoint(dist?: number): { x: number; y: number } {
    const p = this.player;
    for (let i = 0; i < 8; i++) {
      const a = this.rng() * TAU;
      const d = dist ?? SPAWN_MIN + this.rng() * (SPAWN_MAX - SPAWN_MIN);
      const x = p.x + Math.cos(a) * d;
      const y = p.y + Math.sin(a) * d;
      if (x > 40 && y > 40 && x < ARENA.w - 40 && y < ARENA.h - 40) return { x, y };
    }
    // Near a corner: the opposite direction always fits.
    return { x: ARENA.w - p.x, y: ARENA.h - p.y };
  }

  private spawn(kind: EnemyKind | BossKind, x: number, y: number): Enemy {
    const boss = kind in BOSSES;
    const def = boss ? BOSSES[kind as BossKind] : ENEMIES[kind as EnemyKind];
    const sc = scaling(this.time);
    const hp = boss ? def.hp * (1 + 0.05 * (this.time / 60)) : def.hp * sc.hp;
    const e: Enemy = {
      id: ++this.ids,
      kind,
      boss,
      x,
      y,
      hp,
      maxHp: hp,
      speed: def.speed * sc.speed * this.speedMult,
      damage: def.damage * (boss ? 1 : sc.damage),
      radius: def.radius,
      xp: def.xp,
      slow: 0,
      slowFactor: 1,
      burn: 0,
      burnDps: 0,
      flash: 0,
      kbx: 0,
      kby: 0,
      timer:
        kind === 'atirador' ? 1.5 + this.rng() * 1.5 : kind === 'corredor' ? 1 + this.rng() * 2 : 0,
      state: '',
      phase: 1,
      entering: 0,
      angle: 0,
      dead: false,
    };
    this.enemies.push(e);
    return e;
  }

  // ── Enemies ────────────────────────────────────────────────────────────

  private rebuildGrid(): void {
    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e);
  }

  private updateEnemies(dt: number): void {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt);
      if (e.burn > 0) {
        e.burn -= dt;
        e.hp -= e.burnDps * dt;
        this.damageDone += e.burnDps * dt;
        if (e.hp <= 0) {
          this.kill(e);
          continue;
        }
      }
      const slowMult = e.slow > 0 ? e.slowFactor : 1;
      if (e.slow > 0) e.slow -= dt;
      else e.slowFactor = 1;
      // Knockback fades fast.
      e.x += e.kbx * dt;
      e.y += e.kby * dt;
      e.kbx *= Math.exp(-dt * 9);
      e.kby *= Math.exp(-dt * 9);

      if (e.boss) {
        const sx = e.speed;
        e.speed = sx * slowMult;
        updateBoss(this, e, dt);
        e.speed = sx;
      } else this.enemyAi(e, dt, slowMult);

      e.x = Math.max(20, Math.min(ARENA.w - 20, e.x));
      e.y = Math.max(20, Math.min(ARENA.h - 20, e.y));
      if (e.entering > 0) continue;
      const reach = e.radius + 16;
      if (
        Math.abs(e.x - p.x) < reach &&
        Math.abs(e.y - p.y) < reach &&
        (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < reach * reach
      ) {
        if (e.kind === 'explosivo' && e.state !== 'fuse') {
          e.state = 'fuse';
          e.timer = 0.75;
        } else if (e.kind !== 'explosivo') this.hurtPlayer(e.damage);
      }
    }
    // Light separation so crowds don't collapse into one blob.
    for (const e of this.enemies) {
      if (e.dead || e.boss) continue;
      this.grid.query(e.x, e.y, e.radius * 2, (o, d2) => {
        if (o === e || o.dead || o.boss || d2 < 0.01) return;
        const min = e.radius + o.radius;
        if (d2 >= min * min) return;
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.25;
        e.x += (e.x - o.x) * push;
        e.y += (e.y - o.y) * push;
      });
    }
  }

  private enemyAi(e: Enemy, dt: number, slowMult: number): void {
    const p = this.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    let speed = e.speed * slowMult;
    let dirX = dx / d;
    let dirY = dy / d;
    switch (e.kind) {
      case 'corredor':
        // Short bursts of extra speed.
        e.timer -= dt;
        if (e.timer <= 0) e.timer = 2.4 + this.rng();
        if (e.timer < 0.5) speed *= 2;
        break;
      case 'atirador': {
        // Keeps its distance, strafes, and shoots after a short flash (the warning).
        const want = 330;
        const away = d < want - 60 ? -1 : d > want + 60 ? 1 : 0;
        dirX = (dx / d) * away + (-dy / d) * 0.55;
        dirY = (dy / d) * away + (dx / d) * 0.55;
        e.timer -= dt;
        if (e.timer <= 0.3 && e.timer + dt > 0.3) e.flash = 0.3;
        if (e.timer <= 0) {
          e.timer = 2.4 + this.rng() * 0.8;
          if (d < 620) this.bullet(e.x, e.y, Math.atan2(dy, dx), 235, e.damage * 1.2);
        }
        break;
      }
      case 'explosivo':
        if (e.state === 'fuse') {
          speed = 0;
          e.timer -= dt;
          if (e.timer <= 0) {
            // Hurts the player if still close, and the enemies around it.
            const r = 95;
            if (Math.hypot(p.x - e.x, p.y - e.y) < r + 16) this.hurtPlayer(e.damage);
            this.around(e.x, e.y, r, (o) => o !== e && this.damage(o, 20));
            this.emit({ type: 'explosion', x: e.x, y: e.y, r, color: ENEMIES.explosivo.color });
            e.dead = true;
          }
        }
        break;
    }
    e.x += dirX * speed * dt;
    e.y += dirY * speed * dt;
  }

  private kill(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    const color = e.boss ? BOSSES[e.kind as BossKind].color : ENEMIES[e.kind as EnemyKind].color;
    this.emit({ type: 'kill', x: e.x, y: e.y, kind: e.kind, color });
    if (e.boss) {
      const kind = e.kind as BossKind;
      this.bossesDown.push(kind);
      this.emit({ type: 'bossDown', kind, x: e.x, y: e.y });
      this.hazards.length = 0;
      for (const b of this.bullets) b.dead = true;
      this.dropGem('chest', e.x, e.y, 1);
      for (let i = 0; i < 14; i++)
        this.dropGem(
          'xp',
          e.x + (this.rng() - 0.5) * 160,
          e.y + (this.rng() - 0.5) * 160,
          Math.ceil(e.xp / 14),
        );
      return;
    }
    const r = this.rng();
    if (r < 0.012) this.dropGem('heal', e.x, e.y, 25);
    else if (r < 0.016) this.dropGem('magnet', e.x, e.y, 0);
    this.dropGem('xp', e.x, e.y, e.xp);
  }

  // ── Projectiles, bullets, hazards, zones ───────────────────────────────

  private explode(
    x: number,
    y: number,
    r: number,
    damage: number,
    burn: number,
    color: number,
  ): void {
    this.around(x, y, r, (e) => this.damage(e, damage, { burn, knock: 120, fromX: x, fromY: y }));
    this.emit({ type: 'explosion', x, y, r, color });
  }

  private updateProjectiles(dt: number): void {
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      if (pr.kind === 'plasma') {
        // Arcs to nearby enemies while flying.
        pr.tick -= dt;
        if (pr.tick <= 0) {
          pr.tick = 0.3;
          let n = 0;
          this.around(pr.x, pr.y, 150, (e) => {
            if (n++ >= 3) return;
            this.damage(e, pr.damage * 0.35);
            this.emit({
              type: 'chain',
              points: [pr.x, pr.y, e.x, e.y],
              color: FUSIONS.plasma.color,
            });
          });
        }
      }
      if (pr.life <= 0) {
        pr.dead = true;
        if (pr.kind === 'orbe' || pr.kind === 'plasma')
          this.explode(
            pr.x,
            pr.y,
            pr.area,
            pr.damage,
            pr.burn,
            pr.kind === 'orbe' ? SKILLS.orbe.color : FUSIONS.plasma.color,
          );
        continue;
      }
      this.grid.query(pr.x, pr.y, pr.radius + 70, (e) => {
        if (pr.dead || e.dead || e.entering > 0 || pr.hits.includes(e.id)) return;
        const reach = pr.radius + e.radius;
        if ((e.x - pr.x) ** 2 + (e.y - pr.y) ** 2 > reach * reach) return;
        if (pr.kind === 'orbe' || (pr.kind === 'plasma' && e.boss)) {
          pr.dead = true;
          this.explode(
            pr.x,
            pr.y,
            pr.area,
            pr.damage,
            pr.burn,
            pr.kind === 'orbe' ? SKILLS.orbe.color : FUSIONS.plasma.color,
          );
          return true;
        }
        if (pr.kind === 'plasma') return; // passes through, arcing
        pr.hits.push(e.id);
        this.damage(e, pr.damage);
        if (pr.pierce-- <= 0) {
          pr.dead = true;
          return true;
        }
      });
    }
  }

  private updateBullets(dt: number): void {
    const p = this.player;
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) b.dead = true;
      else if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (b.radius + 14) ** 2) {
        b.dead = true;
        this.hurtPlayer(b.damage);
      }
    }
  }

  private updateHazards(dt: number): void {
    const p = this.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]!;
      const owner = this.enemies.find((e) => e.id === h.ownerId && !e.dead);
      if (!owner) {
        this.hazards.splice(i, 1);
        continue;
      }
      if (h.kind === 'beam') {
        h.x = owner.x;
        h.y = owner.y;
      }
      if (h.warn > 0) {
        h.warn -= dt;
        continue;
      }
      h.active -= dt;
      if (h.kind === 'beam') {
        h.angle += h.spin * dt;
        // Distance from the player to the beam segment.
        const ux = Math.cos(h.angle);
        const uy = Math.sin(h.angle);
        const t = (p.x - h.x) * ux + (p.y - h.y) * uy;
        if (
          t > 0 &&
          t < h.length &&
          Math.abs((p.x - h.x) * uy - (p.y - h.y) * ux) < h.width / 2 + 12
        )
          this.hurtPlayer(h.damage);
      } else if (h.kind === 'ring') {
        h.radius += h.spin * dt;
        const d = Math.hypot(p.x - h.x, p.y - h.y);
        if (!h.hit && h.radius > 0 && Math.abs(d - h.radius) < h.width / 2 + 12) {
          h.hit = true;
          this.hurtPlayer(h.damage);
        }
      }
      if (h.active <= 0) this.hazards.splice(i, 1);
    }
  }

  private updateZones(dt: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]!;
      z.t += dt;
      if (z.kind === 'star') {
        // Pulls enemies in, then implodes.
        this.around(z.x, z.y, z.r, (e) => {
          if (e.boss) return;
          const d = Math.hypot(z.x - e.x, z.y - e.y) || 1;
          const pull = Math.min(d, 260 * dt);
          e.x += ((z.x - e.x) / d) * pull;
          e.y += ((z.y - e.y) / d) * pull;
        });
      }
      if (z.t < z.ttl) continue;
      this.zones.splice(i, 1);
      const r = z.kind === 'star' ? z.r * 0.75 : z.r;
      const color = z.kind === 'star' ? FUSIONS.colapso.color : FUSIONS.dimensional.color;
      this.around(z.x, z.y, r, (e) =>
        this.damage(e, z.damage, { knock: 220, fromX: z.x, fromY: z.y }),
      );
      this.emit({ type: z.kind === 'star' ? 'explosion' : 'ring', x: z.x, y: z.y, r, color });
    }
  }

  // ── Experience and pickups ─────────────────────────────────────────────

  private dropGem(kind: Gem['kind'], x: number, y: number, value: number): void {
    if (kind === 'xp' && this.gems.length > MAX_GEMS) {
      // Too many on the floor: fold this one into the nearest gem.
      let best: Gem | undefined;
      let bd = Infinity;
      for (const g of this.gems) {
        if (g.kind !== 'xp' || g.dead) continue;
        const d = (g.x - x) ** 2 + (g.y - y) ** 2;
        if (d < bd) {
          bd = d;
          best = g;
        }
      }
      if (best) {
        best.value += value;
        return;
      }
    }
    this.gems.push({ id: ++this.ids, kind, x, y, value, pulled: false, dead: false });
  }

  private updateGems(dt: number): void {
    const p = this.player;
    const reach = p.pickup * (1 + 0.35 * (this.passives.ima ?? 0));
    for (const g of this.gems) {
      if (g.dead) continue;
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d = Math.hypot(dx, dy);
      if (!g.pulled && d < reach) g.pulled = true;
      if (g.pulled) {
        const sp = 700 * dt;
        g.x += (dx / (d || 1)) * Math.min(sp, d);
        g.y += (dy / (d || 1)) * Math.min(sp, d);
      }
      if (d > 26) continue;
      g.dead = true;
      this.emit({ type: 'pickup', kind: g.kind });
      if (g.kind === 'xp') {
        this.gemsCollected++;
        this.gainXp(g.value);
      } else if (g.kind === 'heal') p.hp = Math.min(p.maxHp, p.hp + g.value);
      else if (g.kind === 'magnet') {
        for (const o of this.gems) if (o.kind === 'xp') o.pulled = true;
      } else if (g.kind === 'chest') this.pendingChests++;
    }
  }

  gainXp(value: number): void {
    const p = this.player;
    p.xp += value * p.xpMult;
    while (p.xp >= xpToNext(p.level)) {
      p.xp -= xpToNext(p.level);
      p.level++;
      this.pendingLevels++;
      this.emit({ type: 'levelup', level: p.level });
    }
  }

  private openOffers(): void {
    this.offers = generateOffers(this.build, this.rng, 3, this.pendingChests > 0);
  }

  private apply(o: Offer): void {
    const p = this.player;
    switch (o.kind) {
      case 'new':
        this.addSkill(o.skill);
        break;
      case 'upgrade': {
        const s = this.skills.find((k) => k.id === o.skill);
        if (s) s.level = o.level;
        break;
      }
      case 'passive':
        this.passives[o.passive] = o.level;
        this.applyPassive(o.passive);
        break;
      case 'heal':
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4);
        break;
      case 'essence':
        this.bonusEssence += o.amount;
        break;
      case 'fusion': {
        // The two parts make way for the fusion (only once per run).
        const parts = FUSIONS[o.fusion].requires;
        for (const part of parts) {
          const i = this.skills.findIndex((s) => s.id === part);
          if (i >= 0) this.skills.splice(i, 1);
        }
        // The plain shield's barrier goes with it (Ruptura brings its own).
        if (parts.includes('escudo')) p.shield = 0;
        this.skills.push({
          id: o.fusion,
          level: 1,
          fusion: true,
          timer: 0.5,
          angle: 0,
          data: [],
          points: [],
        });
        this.fusionsMade.push(o.fusion);
        this.emit({ type: 'fusion', fusion: o.fusion });
        break;
      }
    }
  }

  private addSkill(id: SkillId): void {
    if (this.skills.some((s) => s.id === id)) return;
    this.skills.push({ id, level: 1, fusion: false, timer: 0.4, angle: 0, data: [], points: [] });
    this.skillsUsed.add(id);
  }

  private applyPassive(id: PassiveId): void {
    const p = this.player;
    switch (id) {
      case 'vigor':
        p.maxHp += 20;
        p.hp += 20;
        break;
      case 'agilidade':
        p.speed *= 1.08;
        break;
      case 'potencia':
        p.might *= 1.1;
        break;
      case 'foco':
        p.cdMult *= 0.93;
        break;
      case 'alcance':
        p.areaMult *= 1.1;
        break;
      case 'regeneracao':
        p.regen += 0.5;
        break;
      case 'ima':
        break; // read from `passives` when collecting
    }
  }

  private updateMissions(): void {
    const value: Record<Mission['kind'], number> = {
      kills: this.kills,
      level: this.player.level,
      survive: this.time,
      fusion: this.fusionsMade.length,
      boss: this.bossesDown.length,
      gems: this.gemsCollected,
    };
    for (const m of this.missions) {
      m.progress = Math.min(m.target, value[m.kind]);
      if (!m.done && m.progress >= m.target) {
        m.done = true;
        this.emit({ type: 'mission', text: m.text, reward: m.reward });
      }
    }
  }

  /** Drops dead things so nothing piles up in memory (swap-remove keeps it cheap). */
  private cleanup(): void {
    const sweep = <T extends { dead: boolean }>(list: T[]) => {
      let w = 0;
      for (let r = 0; r < list.length; r++) if (!list[r]!.dead) list[w++] = list[r]!;
      list.length = w;
    };
    sweep(this.enemies);
    sweep(this.projectiles);
    sweep(this.bullets);
    sweep(this.gems);
    // Off the arena or far behind: gone.
    const p = this.player;
    for (const b of this.bullets)
      if (Math.abs(b.x - p.x) > 1400 || Math.abs(b.y - p.y) > 1400) b.dead = true;
  }
}
