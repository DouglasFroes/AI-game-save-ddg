import * as THREE from 'three';
import {
  BIKE_LEN,
  CAR_LEN,
  CAR_W,
  CROSS_W,
  LANE_W,
  POTHOLE_R,
  ROAD_HALF,
  SIDEWALK_W,
  worldPos,
  type CrashReason,
  type GrauSim,
  type Heading,
  type Segment,
  type StreetKind,
} from './core';

/**
 * Three.js view of the Grau simulation. It draws on its own canvas placed *under* the (transparent)
 * Phaser canvas, so the Phaser HUD and the shared GameOver overlay render on top of the 3D world.
 * The WebGL renderer is created once and reused across runs (browsers cap live WebGL contexts).
 */

const SKY = 0xffb48a;
const FOG_NEAR = 60;
const FOG_FAR = 190;
const STUB_LEN = 70;
/** Deeper than any building, so corner blocks of crossing streets never overlap. */
const MAX_DEPTH = 16;
const CORNER_CLEAR = ROAD_HALF + SIDEWALK_W + MAX_DEPTH + 1;
const WHEEL_R = 0.34;
const PAINTS = [0xe63946, 0x1d3557, 0xf1faee, 0x2a9d8f, 0xe9c46a, 0x6c757d, 0x111111, 0x8338ec];
const HOUSE_COLORS = [
  0xff6b6b, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xf78c6b, 0xc77dff, 0xfff1e6, 0x90be6d,
];
const TOWER_COLORS = [0xb8c0cc, 0x8d99ae, 0xa3b1c6, 0xd6d6d6, 0x9fb4c7];

const yawOf = (h: Heading) => (-h * Math.PI) / 2;
const pickOf = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Box whose side faces repeat the texture every tile; the roof samples the plain wall corner. */
function tiledBox(sx: number, sy: number, sz: number, tileX: number, tileY: number) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z (4 vertices each).
  const widths = [sz, sz, 0, 0, sx, sx];
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      if (face === 2 || face === 3) uv.setXY(i, 0.01, 0.01);
      else uv.setXY(i, (uv.getX(i) * widths[face]!) / tileX, (uv.getY(i) * sy) / tileY);
    }
  }
  return g;
}

interface SegmentView {
  readonly group: THREE.Group;
  /** Crossing-street stubs by exit direction (-1 left, 0 straight, 1 right). */
  readonly stubs: Map<number, THREE.Object3D>;
}

type TextureKey = 'road' | 'plain' | 'tower' | 'house' | 'bump' | 'zebra';

export class GrauWorld {
  private static instance: GrauWorld | null = null;

  /** One renderer for the whole session, drawn right under the Phaser canvas `host`. */
  static get(host: HTMLCanvasElement): GrauWorld {
    GrauWorld.instance ??= new GrauWorld();
    GrauWorld.instance.host = host;
    return GrauWorld.instance;
  }

  private host!: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(66, 9 / 16, 0.1, FOG_FAR + 20);
  private size = { w: 0, h: 0, left: 0, top: 0 };

  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly materials = new Map<string, THREE.Material>();
  private readonly textures: Record<TextureKey, THREE.Texture>;

  private segments = new Map<number, SegmentView>();
  private cars = new Map<number, THREE.Group>();
  private potholes = new Map<number, THREE.Object3D>();
  private ground!: THREE.Mesh;
  private bike!: THREE.Group;
  private pitchPivot!: THREE.Group;
  private wheels: THREE.Object3D[] = [];

  private yaw = 0;
  private lean = 0;
  private readonly offset = new THREE.Vector3();
  private readonly lastPos = new THREE.Vector3();
  private shake = 0;
  private crashT = 0;

  private constructor() {
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({
      antialias: dpr < 2,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(dpr, 1.5));
    // Negative z-index inside #game (a stacking context): below Phaser's canvas and DOM layer.
    Object.assign(this.renderer.domElement.style, {
      position: 'absolute',
      zIndex: '-1',
      pointerEvents: 'none',
    });
    this.textures = this.makeTextures();
  }

  /** Shows the 3D canvas and builds the world for a new run. */
  start(sim: GrauSim): void {
    const el = this.renderer.domElement;
    if (el.parentElement !== this.host.parentElement) this.host.parentElement?.prepend(el);
    el.style.display = 'block';

    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, FOG_NEAR, FOG_FAR);
    this.scene.add(new THREE.HemisphereLight(0xfff1dc, 0x5a4a6a, 1.6));
    const sun = new THREE.DirectionalLight(0xffd2a6, 1.6);
    sun.position.set(-40, 60, 30);
    this.scene.add(sun);

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshLambertMaterial({ color: 0x6b6158 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.scene.add(this.ground);

    this.bike = this.buildBike();
    this.scene.add(this.bike);

    this.yaw = yawOf(sim.segment.heading);
    this.offset.set(0, 0, 0);
    this.shake = 0;
    this.crashT = 0;
    this.lean = 0;
    this.addSegment(sim.segment, true);
    this.size = { w: 0, h: 0, left: 0, top: 0 };
    this.syncSize();
  }

  /** Hides the canvas and frees the run's GPU resources (the renderer itself is kept). */
  stop(): void {
    this.renderer.domElement.style.display = 'none';
    for (const child of [...this.scene.children]) this.disposeTree(child);
    this.scene.clear();
    this.segments.clear();
    this.cars.clear();
    this.potholes.clear();
    this.wheels = [];
  }

  /** The bike entered a new street segment, taking `dir` at the crossing of `previous`. */
  onStreet(sim: GrauSim, previous: Segment, dir: number): void {
    // The stub of the street we took is replaced by the real segment (same geometry).
    const taken = this.segments.get(previous.id)?.stubs.get(dir);
    if (taken) this.disposeTree(taken);
    this.addSegment(sim.segment, false);
    // Keep the two latest segments: the one we left is still visible during the turn.
    const keep = new Set([sim.segment.id, previous.id]);
    for (const [id, view] of this.segments) {
      if (keep.has(id)) continue;
      this.disposeTree(view.group);
      this.segments.delete(id);
    }
    for (const [id, mesh] of this.potholes) {
      if (sim.segment.potholes.some((p) => p.id === id)) continue;
      this.disposeTree(mesh);
      this.potholes.delete(id);
    }
    // Smooth the jump caused by snapping to the new street's frame.
    const now = worldPos(sim.segment, sim.s, sim.x);
    this.offset.set(this.lastPos.x - now.x, 0, this.lastPos.z - now.z);
  }

  bump(strength = 0.25): void {
    this.shake = Math.max(this.shake, strength);
  }

  update(sim: GrauSim, dt: number, throttle: boolean): void {
    this.syncSize();
    const seg = sim.segment;
    const p = worldPos(seg, sim.s, sim.x);
    this.lastPos.set(p.x, 0, p.z);
    this.offset.multiplyScalar(Math.exp(-dt * 5));

    // Yaw follows the street with a short swing, like leaning into the corner.
    let diff = yawOf(seg.heading) - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * (1 - Math.exp(-dt * 7));
    const leanTarget = (sim.x - sim.lane * LANE_W) * 0.12 - diff * 0.5;
    this.lean += (leanTarget - this.lean) * (1 - Math.exp(-dt * 10));

    const bikePos = new THREE.Vector3(p.x + this.offset.x, 0, p.z + this.offset.z);
    this.bike.position.copy(bikePos);
    this.bike.rotation.set(0, this.yaw, 0);

    if (sim.crashed) this.animateCrash(sim.crashed, dt);
    else {
      this.pitchPivot.rotation.set(sim.pitch, 0, this.lean);
      const spin = ((throttle ? 1.15 : 1) * sim.speed * dt) / WHEEL_R;
      for (const w of this.wheels) w.rotation.x -= spin;
    }

    this.updateCars(sim);
    this.updatePotholes(sim);
    this.ground.position.set(bikePos.x, -0.03, bikePos.z);

    // Chase camera: pulls back and widens with speed.
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const fast = Math.min(1, sim.speed / 30);
    this.camera.position
      .copy(bikePos)
      .addScaledVector(fwd, -(6.2 + fast * 1.4))
      .setY(3.1 + sim.pitch * 0.6);
    this.camera.fov = 64 + fast * 8;
    this.camera.updateProjectionMatrix();
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    this.camera.lookAt(bikePos.clone().addScaledVector(fwd, 7).setY(1.2));
    this.renderer.render(this.scene, this.camera);
  }

  private animateCrash(reason: CrashReason, dt: number): void {
    this.crashT += dt;
    const k = 1 - Math.exp(-dt * 6);
    const r = this.pitchPivot.rotation;
    if (reason === 'loop') r.x += (Math.PI * 0.95 - r.x) * k;
    else {
      r.x += (0 - r.x) * k;
      r.z += (Math.PI / 2.1 - r.z) * k;
    }
  }

  // ── Layout ──────────────────────────────────────────────────────────────

  /** Matches the 3D canvas to the Phaser canvas (letterboxed by the Scale manager). */
  private syncSize(): void {
    const parent = this.host.parentElement;
    if (!parent) return;
    const r = this.host.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const next = {
      w: Math.round(r.width),
      h: Math.round(r.height),
      left: Math.round(r.left - pr.left),
      top: Math.round(r.top - pr.top),
    };
    const s = this.size;
    if (next.w === s.w && next.h === s.h && next.left === s.left && next.top === s.top) return;
    this.size = next;
    Object.assign(this.renderer.domElement.style, {
      left: `${next.left}px`,
      top: `${next.top}px`,
      width: `${next.w}px`,
      height: `${next.h}px`,
    });
    this.renderer.setSize(next.w, next.h, false);
    this.camera.aspect = next.w / Math.max(1, next.h);
    this.camera.updateProjectionMatrix();
  }

  // ── City ────────────────────────────────────────────────────────────────

  private addSegment(seg: Segment, first: boolean): void {
    const group = new THREE.Group();
    group.position.set(seg.origin.x, 0, seg.origin.z);
    group.rotation.y = yawOf(seg.heading);
    const L = seg.length;

    // The road starts at the edge of the previous crossing (or behind the bike on the first one).
    if (first) this.buildStreet(group, -40, L - ROAD_HALF, seg.street.kind, -40, false);
    else this.buildStreet(group, ROAD_HALF, L - ROAD_HALF, seg.street.kind, CORNER_CLEAR, true);

    // Crossing square, its four corners and the zebra crossing.
    const square = new THREE.Mesh(
      this.geo('square', () => new THREE.PlaneGeometry(CROSS_W, CROSS_W)),
      this.mat('asphalt', () => new THREE.MeshLambertMaterial({ map: this.textures.plain })),
    );
    square.rotation.x = -Math.PI / 2;
    square.position.set(0, 0.002, -L);
    group.add(square);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner = new THREE.Mesh(
          this.geo('corner', () => new THREE.BoxGeometry(SIDEWALK_W, 0.18, SIDEWALK_W)),
          this.sidewalkMaterial(),
        );
        const off = ROAD_HALF + SIDEWALK_W / 2;
        corner.position.set(sx * off, 0.09, -L + sz * off);
        group.add(corner);
      }
    }
    const zebra = new THREE.Mesh(
      this.geo('zebra', () => new THREE.PlaneGeometry(2 * ROAD_HALF, 2.4)),
      this.mat(
        'zebra',
        () => new THREE.MeshLambertMaterial({ map: this.textures.zebra, transparent: true }),
      ),
    );
    zebra.rotation.x = -Math.PI / 2;
    zebra.position.set(0, 0.006, -(L - ROAD_HALF - 1.6));
    group.add(zebra);

    for (const b of seg.bumps) {
      const bump = new THREE.Mesh(
        this.geo('bump', () => new THREE.BoxGeometry(2 * ROAD_HALF, 0.16, 0.9)),
        this.mat('bump', () => new THREE.MeshLambertMaterial({ map: this.textures.bump })),
      );
      bump.position.set(0, 0.08, -b);
      group.add(bump);
    }

    // Stubs of the streets you can take at the end of this one.
    const stubs = new Map<number, THREE.Object3D>();
    const frames: Array<[number, THREE.Vector3, number, StreetKind]> = [
      [0, new THREE.Vector3(0, 0, -(L + ROAD_HALF)), 0, seg.street.kind],
      [-1, new THREE.Vector3(-ROAD_HALF, 0, -L), Math.PI / 2, seg.left.kind],
      [1, new THREE.Vector3(ROAD_HALF, 0, -L), -Math.PI / 2, seg.right.kind],
    ];
    for (const [dir, pos, rot, kind] of frames) {
      const stub = new THREE.Group();
      stub.position.copy(pos);
      stub.rotation.y = rot;
      this.buildStreet(stub, 0, STUB_LEN, kind, CORNER_CLEAR - ROAD_HALF, true);
      group.add(stub);
      stubs.set(dir, stub);
    }

    group.add(this.streetSign(seg));
    this.scene.add(group);
    this.segments.set(seg.id, { group, stubs });
  }

  /**
   * Road, sidewalks and buildings of a straight stretch in `parent`'s frame (forward = -z).
   * With `corner`, the first sidewalk square is left to the crossing's corner piece.
   */
  private buildStreet(
    parent: THREE.Object3D,
    from: number,
    to: number,
    kind: StreetKind,
    buildFrom: number,
    corner: boolean,
  ): void {
    const len = to - from;
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * ROAD_HALF, len),
      this.roadMaterial(len),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -(from + len / 2));
    parent.add(road);

    const walkFrom = corner ? from + SIDEWALK_W : from;
    const walkLen = to - SIDEWALK_W - walkFrom;
    for (const side of [-1, 1]) {
      if (walkLen > 0) {
        const walk = new THREE.Mesh(
          new THREE.BoxGeometry(SIDEWALK_W, 0.18, walkLen),
          this.sidewalkMaterial(),
        );
        walk.position.set(side * (ROAD_HALF + SIDEWALK_W / 2), 0.09, -(walkFrom + walkLen / 2));
        parent.add(walk);
      }
      this.buildBlock(parent, side, buildFrom, to - SIDEWALK_W - MAX_DEPTH - 1, kind);
    }
  }

  private buildBlock(
    parent: THREE.Object3D,
    side: number,
    from: number,
    to: number,
    kind: StreetKind,
  ): void {
    const tower = kind === 'avenida';
    for (let s = from; s < to;) {
      const w = Math.min(to - s, tower ? 9 + Math.random() * 9 : 6 + Math.random() * 6);
      if (w < 4) break;
      const d = tower ? 12 + Math.random() * (MAX_DEPTH - 12) : 8 + Math.random() * 6;
      const h = tower ? 14 + Math.random() * 30 : 3.5 + Math.random() * 6;
      const color = pickOf(tower ? TOWER_COLORS : HOUSE_COLORS);
      const map = tower ? this.textures.tower : this.textures.house;
      const mat = this.mat(`${kind}-${color}`, () => new THREE.MeshLambertMaterial({ color, map }));
      const box = new THREE.Mesh(tiledBox(d, h, w, tower ? 3.2 : 4, tower ? 3.4 : 3.2), mat);
      box.position.set(side * (ROAD_HALF + SIDEWALK_W + 0.6 + d / 2), h / 2, -(s + w / 2));
      parent.add(box);
      s += w + (tower ? 0.4 : 0.15);
    }
  }

  private streetSign(seg: Segment): THREE.Object3D {
    const sign = new THREE.Group();
    const pole = new THREE.Mesh(
      this.geo('pole', () => new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6)),
      this.mat('pole', () => new THREE.MeshLambertMaterial({ color: 0x3d405b })),
    );
    pole.position.y = 1.7;
    const tex = canvasTexture(512, 160, (ctx) => {
      ctx.fillStyle = '#1b7f3b';
      ctx.fillRect(0, 0, 512, 160);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      ctx.strokeRect(6, 6, 500, 148);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`← ${seg.left.name}`, 256, 66);
      ctx.fillText(`${seg.right.name} →`, 256, 126);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 1),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
    );
    plate.position.y = 3.5;
    sign.add(pole, plate);
    sign.position.set(ROAD_HALF + SIDEWALK_W / 2, 0, -(seg.length - ROAD_HALF - 3));
    return sign;
  }

  // ── Traffic and obstacles ───────────────────────────────────────────────

  private updateCars(sim: GrauSim): void {
    const seen = new Set<number>();
    for (const car of sim.cars) {
      seen.add(car.id);
      let view = this.cars.get(car.id);
      if (!view) {
        view = this.buildCar(PAINTS[car.paint % PAINTS.length]!);
        this.cars.set(car.id, view);
        this.scene.add(view);
      }
      const p = worldPos(sim.segment, car.s, car.x);
      view.position.set(p.x, 0, p.z);
      view.rotation.y = yawOf(sim.segment.heading);
    }
    for (const [id, view] of this.cars) {
      if (seen.has(id)) continue;
      view.removeFromParent();
      this.cars.delete(id);
    }
  }

  private updatePotholes(sim: GrauSim): void {
    for (const hole of sim.segment.potholes) {
      if (this.potholes.has(hole.id)) continue;
      const rim = new THREE.Mesh(
        this.geo('rim', () => new THREE.CircleGeometry(POTHOLE_R * 1.18, 18)),
        this.mat('rim', () => new THREE.MeshLambertMaterial({ color: 0x5c564f })),
      );
      const pit = new THREE.Mesh(
        this.geo('pit', () => new THREE.CircleGeometry(POTHOLE_R, 18)),
        this.mat('pit', () => new THREE.MeshBasicMaterial({ color: 0x141210 })),
      );
      rim.rotation.x = pit.rotation.x = -Math.PI / 2;
      rim.position.y = 0.008;
      pit.position.y = 0.012;
      const hole3d = new THREE.Group().add(rim, pit);
      const p = worldPos(sim.segment, hole.s, hole.lane * LANE_W);
      hole3d.position.set(p.x, 0, p.z);
      this.scene.add(hole3d);
      this.potholes.set(hole.id, hole3d);
    }
  }

  private buildCar(color: number): THREE.Group {
    const car = new THREE.Group();
    const body = new THREE.Mesh(
      this.geo('car-body', () => new THREE.BoxGeometry(CAR_W, 0.75, CAR_LEN)),
      this.mat(`paint-${color}`, () => new THREE.MeshLambertMaterial({ color })),
    );
    body.position.y = 0.72;
    const cabin = new THREE.Mesh(
      this.geo('car-cabin', () => new THREE.BoxGeometry(CAR_W * 0.86, 0.62, CAR_LEN * 0.5)),
      this.mat('glass', () => new THREE.MeshLambertMaterial({ color: 0x23395b })),
    );
    cabin.position.set(0, 1.4, 0.25);
    car.add(body, cabin);
    const wheelGeo = this.geo('car-wheel', () =>
      new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12).rotateZ(Math.PI / 2),
    );
    const tire = this.mat('tire', () => new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        const w = new THREE.Mesh(wheelGeo, tire);
        w.position.set(x * (CAR_W / 2 - 0.05), 0.36, z * CAR_LEN * 0.32);
        car.add(w);
      }
      const light = new THREE.Mesh(
        this.geo('tail', () => new THREE.BoxGeometry(0.4, 0.18, 0.05)),
        this.mat('tail', () => new THREE.MeshBasicMaterial({ color: 0xff2a2a })),
      );
      light.position.set(x * (CAR_W / 2 - 0.3), 0.85, CAR_LEN / 2 + 0.01);
      car.add(light);
    }
    return car;
  }

  // ── Bike ────────────────────────────────────────────────────────────────

  /** The pivot sits on the rear wheel's contact point, so pitch lifts the front naturally. */
  private buildBike(): THREE.Group {
    const root = new THREE.Group();
    const pivot = new THREE.Group();
    root.add(pivot);
    this.pitchPivot = pivot;

    const lambert = (key: string, color: number) =>
      this.mat(key, () => new THREE.MeshLambertMaterial({ color }));
    const part = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
      rx = 0,
    ) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      pivot.add(m);
      return m;
    };

    const tire = lambert('tire', 0x1a1a1a);
    const chrome = lambert('chrome', 0xd9d9d9);
    const wheelGeo = new THREE.TorusGeometry(WHEEL_R - 0.07, 0.09, 8, 18).rotateY(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8).rotateZ(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(0.03, WHEEL_R * 1.6, 0.03);
    const frontZ = -BIKE_LEN * 0.68;
    for (const z of [0, frontZ]) {
      const wheel = new THREE.Group();
      wheel.add(new THREE.Mesh(wheelGeo, tire), new THREE.Mesh(hubGeo, chrome));
      for (let i = 0; i < 3; i++) {
        const spoke = new THREE.Mesh(spokeGeo, chrome);
        spoke.rotation.x = (i * Math.PI) / 3;
        wheel.add(spoke);
      }
      wheel.position.set(0, WHEEL_R, z);
      pivot.add(wheel);
      this.wheels.push(wheel);
    }

    const red = lambert('bike-red', 0xe63946);
    const dark = lambert('bike-dark', 0x22223b);
    part(new THREE.BoxGeometry(0.22, 0.28, 1.05), dark, 0, 0.62, frontZ / 2);
    part(new THREE.BoxGeometry(0.34, 0.26, 0.55), red, 0, 0.86, frontZ * 0.62);
    part(new THREE.BoxGeometry(0.3, 0.12, 0.6), dark, 0, 0.86, frontZ * 0.2);
    part(new THREE.BoxGeometry(0.26, 0.14, 0.5), red, 0, 0.7, 0.12, -0.25);
    part(new THREE.BoxGeometry(0.06, 0.75, 0.06), chrome, 0.1, 0.72, frontZ + 0.12, -0.38);
    part(new THREE.BoxGeometry(0.06, 0.75, 0.06), chrome, -0.1, 0.72, frontZ + 0.12, -0.38);
    part(new THREE.BoxGeometry(0.7, 0.05, 0.05), chrome, 0, 1.08, frontZ + 0.3);
    part(
      new THREE.BoxGeometry(0.18, 0.14, 0.08),
      lambert('lamp', 0xfff3b0),
      0,
      0.95,
      frontZ + 0.02,
    );
    part(new THREE.CylinderGeometry(0.05, 0.07, 0.6, 6), chrome, 0.16, 0.42, 0.05, 1.37);

    // Rider: leans back over the rear wheel, arms to the bars.
    const shirt = lambert('shirt', 0x00b4d8);
    const jeans = lambert('jeans', 0x264653);
    const skin = lambert('skin', 0xc68642);
    const handGeo = new THREE.SphereGeometry(0.1, 8, 8);
    part(new THREE.BoxGeometry(0.42, 0.62, 0.28), shirt, 0, 1.36, frontZ * 0.22, 0.22);
    for (const x of [-1, 1]) {
      part(new THREE.BoxGeometry(0.16, 0.16, 0.6), jeans, x * 0.13, 0.98, frontZ * 0.38);
      part(new THREE.BoxGeometry(0.12, 0.12, 0.62), shirt, x * 0.25, 1.38, frontZ * 0.52, 0.35);
      part(handGeo, skin, x * 0.3, 1.18, frontZ + 0.32);
    }
    part(
      new THREE.SphereGeometry(0.22, 14, 12),
      lambert('helmet', 0xffd23f),
      0,
      1.86,
      frontZ * 0.14,
    );
    part(
      new THREE.BoxGeometry(0.3, 0.1, 0.06),
      lambert('visor', 0x111111),
      0,
      1.88,
      frontZ * 0.14 - 0.2,
    );
    return root;
  }

  // ── Resources ───────────────────────────────────────────────────────────

  private makeTextures(): Record<TextureKey, THREE.Texture> {
    const road = canvasTexture(256, 512, (ctx) => {
      ctx.fillStyle = '#3b3e47';
      ctx.fillRect(0, 0, 256, 512);
      for (let i = 0; i < 1800; i++) {
        ctx.fillStyle = Math.random() < 0.5 ? '#44474f' : '#33363e';
        ctx.fillRect(Math.random() * 256, Math.random() * 512, 2, 2);
      }
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(4, 0, 6, 512);
      ctx.fillRect(246, 0, 6, 512);
      for (const x of [256 / 3, (2 * 256) / 3]) ctx.fillRect(x - 3, 0, 6, 256);
    });
    const plain = canvasTexture(64, 64, (ctx) => {
      ctx.fillStyle = '#3b3e47';
      ctx.fillRect(0, 0, 64, 64);
    });
    const tower = canvasTexture(64, 64, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#2b4a6f';
      ctx.fillRect(12, 14, 40, 34);
      ctx.fillStyle = '#ffe7a3';
      ctx.fillRect(12, 14, 18, 34);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(30, 14, 4, 34);
    });
    const house = canvasTexture(64, 64, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#3d2c22';
      ctx.fillRect(10, 22, 20, 18);
      ctx.fillStyle = '#7f5539';
      ctx.fillRect(40, 30, 14, 34);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, 0, 64, 5);
    });
    const bump = canvasTexture(128, 16, (ctx) => {
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#111111' : '#ffcc00';
        ctx.fillRect(i * 16, 0, 16, 16);
      }
    });
    const zebra = canvasTexture(256, 32, (ctx) => {
      ctx.fillStyle = '#f2f2f2';
      for (let i = 0; i < 9; i++) ctx.fillRect(8 + i * 28, 0, 16, 32);
    });
    return { road, plain, tower, house, bump, zebra };
  }

  private roadMaterial(len: number): THREE.Material {
    // Each road gets its own texture view so the dashes repeat every 12 m whatever its length.
    const map = this.textures.road.clone();
    map.repeat.set(1, len / 12);
    return new THREE.MeshLambertMaterial({ map });
  }

  private sidewalkMaterial(): THREE.Material {
    return this.mat('sidewalk', () => new THREE.MeshLambertMaterial({ color: 0xc9c2b8 }));
  }

  private geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geometries.get(key);
    if (!g) this.geometries.set(key, (g = make()));
    return g;
  }

  private mat(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.materials.get(key);
    if (!m) this.materials.set(key, (m = make()));
    return m;
  }

  private disposeTree(root: THREE.Object3D): void {
    const sharedGeo = new Set(this.geometries.values());
    const sharedMat = new Set(this.materials.values());
    const sharedTex = new Set(Object.values(this.textures));
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!sharedGeo.has(obj.geometry)) obj.geometry.dispose();
      const m = obj.material as THREE.MeshLambertMaterial;
      if (sharedMat.has(m)) return;
      if (m.map && !sharedTex.has(m.map)) m.map.dispose();
      m.dispose();
    });
    root.removeFromParent();
  }
}
