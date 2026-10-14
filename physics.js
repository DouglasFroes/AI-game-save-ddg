// physics.js — Matter.js world: terrain, the player's drawn barrier, bee chase AI and collisions.
// Matter is loaded as a classic <script> from the CDN, so it lives on window.
const { Engine, Bodies, Body, Composite, Events, Query } = window.Matter;

export const STEP = 1000 / 60;    // fixed physics step (ms)
export const DOG_R = 20;          // character radius
export const LINE_W = 9;          // drawn barrier thickness
const LINE_DENSITY = 0.0024;      // heavy enough that a swarm can't simply lift it
const SPEED_FLEE = 6;
const SEGMENT_LEN = 14;           // target length of each rigid part of the barrier

function makeTerrain(t) {
  const isSpike = t.type === 'spikes';
  const b = Bodies.rectangle(t.x, t.y, t.w, t.h, {
    isStatic: true,
    label: isSpike ? 'spike' : 'ground',
    friction: 0.9,
  });
  if (t.angle) Body.setAngle(b, t.angle);
  b.kind = t.kind || 'ground';
  b.dir = t.dir;
  b.w = t.w;
  b.h = t.h;
  b.seed = (t.x * 73 + t.y * 31 + t.w) | 0; // stable seed for terrain decoration
  return b;
}

export class PhysicsWorld {
  /**
   * @param {object} level  one entry of levels.json
   * @param {{onDogHit?: (kind: 'bee'|'spike') => void}} hooks
   */
  constructor(level, hooks = {}) {
    this.level = level;
    this.cfg = level.bees;
    this.hooks = hooks;
    // calm (drawing) | chase (attack) | hover (after a hit) | flee (after a win)
    this.mode = 'calm';
    this.time = 0;
    this.bees = [];
    this.line = null;
    this._killed = [];
    this._seq = 0;

    this.engine = Engine.create({ positionIterations: 10, velocityIterations: 8 });
    this.engine.gravity.y = 1;

    this.statics = level.terrain.map(makeTerrain);
    const d = level.dog;
    // Low static friction matters: high values make Matter explode when the barrier lands on the dog.
    this.dog = Bodies.circle(d.x, d.y, DOG_R, {
      label: 'dog', friction: 1, frictionStatic: 0.5, density: 0.003, restitution: 0,
    });
    Body.setInertia(this.dog, Infinity); // keep the character upright
    Composite.add(this.engine.world, [...this.statics, this.dog]);

    Events.on(this.engine, 'beforeUpdate', () => this._steerBees());
    Events.on(this.engine, 'afterUpdate', () => this._limitBeeSpeed());
    Events.on(this.engine, 'collisionStart', (e) => this._onCollision(e));
  }

  get obstacles() {
    return [...this.statics, this.dog];
  }

  /** True when a point is not inside terrain or the character. */
  isFree(p) {
    return Query.point(this.obstacles, p).length === 0;
  }

  /** True when a drawn segment a→b would not cut through terrain or the character. */
  canPlace(a, b) {
    const obs = this.obstacles;
    if (Query.point(obs, b).length) return false;
    return Query.ray(obs, a, b, LINE_W + 2).length === 0;
  }

  /**
   * Re-samples the stroke into chords of up to `maxLen`, keeping a point only when the shortcut
   * would cut through terrain or the character. Many tiny parts make the compound body unstable:
   * each bee contact is resolved per part, so short segments multiply the push the swarm applies.
   */
  resample(points, maxLen = SEGMENT_LEN) {
    const out = [points[0]];
    let i = 0;
    while (i < points.length - 1) {
      let j = i + 1;
      while (
        j + 1 < points.length &&
        Math.hypot(points[j + 1].x - points[i].x, points[j + 1].y - points[i].y) <= maxLen &&
        this.canPlace(points[i], points[j + 1])
      ) j++;
      out.push(points[j]);
      i = j;
    }
    return out;
  }

  /** Turns the drawn polyline into one compound rigid body. */
  commitLine(rawPoints) {
    const points = this.resample(rawPoints);
    const parts = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      parts.push(Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, len + 1, LINE_W, {
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        density: LINE_DENSITY,
      }));
    }
    this.line = Body.create({
      parts, label: 'line', friction: 0.8, frictionStatic: 1, restitution: 0, frictionAir: 0.008,
    });
    Composite.add(this.engine.world, this.line);
    return this.line;
  }

  spawnBee(hive) {
    const c = this.cfg;
    const b = Bodies.circle(hive.x + (Math.random() * 8 - 4), hive.y + 28, c.radius, {
      label: 'bee', frictionAir: 0.03, density: c.density, restitution: 0.3, friction: 0.05,
    });
    b.id = this._seq++;
    b.side = Math.random() < 0.5 ? -1 : 1;           // preferred side when going around obstacles
    b.phase = Math.random() * Math.PI * 2;            // wobble phase
    b.freq = 0.004 + Math.random() * 0.004;           // wobble frequency
    b.blocked = false;
    Body.setVelocity(b, { x: (Math.random() - 0.5) * 2, y: 1.5 });
    this.bees.push(b);
    Composite.add(this.engine.world, b);
    return b;
  }

  /** Swarm gives up: bees fly away and stop colliding. */
  release() {
    this.mode = 'flee';
    for (const b of this.bees) b.collisionFilter.mask = 0;
  }

  removeBee(b) {
    const i = this.bees.indexOf(b);
    if (i >= 0) this.bees.splice(i, 1);
    Composite.remove(this.engine.world, b);
  }

  /** Advances one fixed step. Returns bees killed by spikes during the step. */
  step() {
    Engine.update(this.engine, STEP);
    this.time += STEP;
    const killed = [...new Set(this._killed)];
    this._killed = [];
    for (const b of killed) this.removeBee(b);
    return killed;
  }

  // Homing with wobble; if the barrier blocks line of sight, slide sideways around it while pushing.
  _steerBees() {
    const g = this.engine.gravity;
    const tgt = this.dog.position;
    const accel = this.cfg.accel;
    const tick = Math.round(this.time / STEP);
    for (const b of this.bees) {
      b.force.y -= b.mass * g.y * g.scale; // bees ignore gravity
      if (this.mode === 'flee') {
        b.force.y -= b.mass * 0.0009;
        b.force.x += b.mass * 0.0003 * b.side;
        continue;
      }
      let dx = tgt.x - b.position.x, dy = tgt.y - b.position.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const tx = -dy * b.side, ty = dx * b.side;
      const wob = Math.sin(this.time * b.freq + b.phase) * 0.35;
      if (this.line && (b.id + tick) % 6 === 0) {
        b.blocked = Query.ray([this.line], b.position, tgt, 6).length > 0;
      }
      let ax = dx + tx * wob, ay = dy + ty * wob;
      if (b.blocked) { ax += tx * 0.55; ay += ty * 0.55; }
      const n = Math.hypot(ax, ay) || 1;
      b.force.x += (ax / n) * accel * b.mass;
      b.force.y += (ay / n) * accel * b.mass;
    }
  }

  _limitBeeSpeed() {
    const max = this.mode === 'flee' ? SPEED_FLEE : this.cfg.maxSpeed;
    for (const b of this.bees) {
      const v = b.velocity, sp = Math.hypot(v.x, v.y);
      if (sp > max) Body.setVelocity(b, { x: (v.x / sp) * max, y: (v.y / sp) * max });
    }
  }

  _onCollision(e) {
    for (const p of e.pairs) {
      const a = p.bodyA.parent, b = p.bodyB.parent;
      if (a.label === 'bee' && b.label === 'spike') this._killed.push(a);
      else if (b.label === 'bee' && a.label === 'spike') this._killed.push(b);

      if (this.mode !== 'chase') continue;
      const other = a === this.dog ? b : b === this.dog ? a : null;
      if (other && (other.label === 'bee' || other.label === 'spike') && this.hooks.onDogHit) {
        this.hooks.onDogHit(other.label);
      }
    }
  }
}
