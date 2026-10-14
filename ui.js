// ui.js — Level map (trail), HUD, star rating, modals, global ranking table and the Canvas scene renderer.
import { DOG_R, LINE_W } from './physics.js';

export const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------

/**
 * Star rating for a cleared level. The ink rule and the deaths rule are both applied and
 * the stricter one wins: ≤50% ink and no deaths → 3; ≤80% ink or 1 death → 2; otherwise 1.
 */
export function calcStars(inkFrac, deaths, th) {
  const byInk = inkFrac <= th.three ? 3 : inkFrac <= th.two ? 2 : 1;
  const byDeaths = deaths === 0 ? 3 : deaths === 1 ? 2 : 1;
  return Math.min(byInk, byDeaths);
}

function starsHTML(n, max = 3) {
  let html = '';
  for (let i = 0; i < max; i++) html += `<span class="star${i < n ? ' on' : ''}">★</span>`;
  return html;
}

const HEART = (full) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.3 2.2 4 6.2 4c2.4 0 3.9 1.4 4.8 2.8C11.9 5.4 13.4 4 15.8 4c4 0 5.8 4.3 4.2 7.7C19.5 16.4 12 21 12 21z" fill="${full ? '#ff4d6d' : '#d9cfc4'}" stroke="${full ? '#b3123a' : '#a89a8c'}" stroke-width="1.6"/></svg>`;

export function heartsHTML(lives, max) {
  let html = '';
  for (let i = 0; i < max; i++) html += HEART(i < lives);
  return html;
}

// ---------------------------------------------------------------------------
// Screens & modals
// ---------------------------------------------------------------------------

const SCREENS = ['map', 'game', 'ranking'];

export function showScreen(name) {
  for (const s of SCREENS) $(`screen-${s}`).classList.toggle('hidden', s !== name);
}

export function showModal(id) {
  hideModals();
  $(id).classList.add('show');
  hideHint();
}

export function hideModals() {
  document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show'));
}

export function bootError(text) {
  $('bootText').textContent = text;
  $('bootSpinner').hidden = true;
  $('modal-boot').classList.add('show');
}

export function showHint(text) {
  const h = $('hint');
  h.textContent = text;
  h.classList.remove('hide');
}

export function hideHint() {
  $('hint').classList.add('hide');
}

export function showWin({ levelNum, stars, inkFrac, nextLabel }) {
  $('winTitle').textContent = `Fase ${levelNum} concluída!`;
  $('winStars').innerHTML = starsHTML(stars);
  $('winText').textContent = `Tinta usada: ${Math.round(inkFrac * 100)}%`;
  $('btnWinNext').textContent = nextLabel;
  showModal('modal-win');
}

export function showFail(msg, lives) {
  $('failText').textContent = `${msg} Restam ${lives} ${lives === 1 ? 'vida' : 'vidas'}.`;
  showModal('modal-fail');
}

export function showGameOver(msg, gameOvers) {
  $('gameoverText').textContent =
    `${msg} Suas 4 vidas acabaram — penalidade aplicada no ranking (${gameOvers}× game over). As vidas serão restauradas para tentar esta fase de novo.`;
  showModal('modal-gameover');
}

export function showFinish(summary) {
  $('finStars').textContent = `${summary.stars}/${summary.maxStars}`;
  $('finDeaths').textContent = String(summary.deaths);
  $('finInk').textContent = `${summary.inkSaved}%`;
  $('finScore').textContent = summary.score.toLocaleString('pt-BR');
  $('finPenalty').hidden = summary.gameOvers === 0;
  $('finPenalty').textContent = `Penalidade: ${summary.gameOvers}× game over`;
  showModal('modal-finish');
  setTimeout(() => $('playerName').focus(), 300);
}

// ---------------------------------------------------------------------------
// Level map ("Candy Crush" trail)
// ---------------------------------------------------------------------------

/**
 * @param {object[]} levels
 * @param {{unlocked:number, results:Object<number,{stars:number}>, lives:number, deaths:number}} campaign
 * @param {number} maxLives
 * @param {(index:number) => void} onSelect
 */
export function renderMap(levels, campaign, maxLives, onSelect) {
  const trail = $('trail');
  trail.querySelectorAll('.node').forEach((n) => n.remove());

  const n = levels.length;
  const xs = [28, 72, 30, 70];
  const pos = levels.map((_, i) => ({ x: xs[i % xs.length], y: 86 - (i * 72) / Math.max(1, n - 1) }));

  // Dotted path, one segment per link so cleared links can be highlighted.
  let svg = '';
  for (let i = 0; i < n - 1; i++) {
    const a = pos[i], b = pos[i + 1], my = (a.y + b.y) / 2;
    const done = campaign.results[i] ? ' done' : '';
    svg += `<path class="${done}" d="M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}"/>`;
  }
  $('trailPath').innerHTML = svg;

  let totalStars = 0;
  levels.forEach((lv, i) => {
    const res = campaign.results[i];
    const stars = res ? res.stars : 0;
    totalStars += stars;
    const locked = i + 1 > campaign.unlocked;
    const current = !locked && !res;

    const node = document.createElement('button');
    node.type = 'button';
    node.className = `node${locked ? ' locked' : ''}${current ? ' current' : ''}`;
    node.style.left = `${pos[i].x}%`;
    node.style.top = `${pos[i].y}%`;
    node.setAttribute('aria-label', `Fase ${lv.id}: ${lv.name}${locked ? ' (bloqueada)' : ''}`);
    node.innerHTML =
      `<span class="node-name">${lv.name} · ${lv.difficulty}</span>` +
      (locked ? '<span class="lock">🔒</span>' : `<span class="num">${lv.id}</span>`) +
      `<span class="node-stars">${starsHTML(stars)}</span>`;
    if (!locked) node.addEventListener('click', () => onSelect(i));
    trail.appendChild(node);
  });

  $('mapStars').textContent = `★ ${totalStars}/${n * 3}`;
  $('mapDeaths').textContent = `💀 ${campaign.deaths}`;
  $('mapHearts').innerHTML = heartsHTML(campaign.lives, maxLives);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

let hudCache = {};

export function setInkMarkers(th) {
  // The bar shows ink *remaining*, so the 50%-used mark sits at 50% and the 80%-used mark at 20%.
  $('mark3').style.left = `${Math.round((1 - th.three) * 100)}%`;
  $('mark2').style.left = `${Math.round((1 - th.two) * 100)}%`;
  hudCache = {};
}

export function updateHUD({ levelNum, total, lives, maxLives, inkFrac, remain, live, previewStars }) {
  const lvl = `Fase ${levelNum}/${total}`;
  if (hudCache.lvl !== lvl) $('hudLevel').textContent = hudCache.lvl = lvl;
  if (hudCache.lives !== lives) {
    hudCache.lives = lives;
    $('hudHearts').innerHTML = heartsHTML(lives, maxLives);
  }
  const left = Math.max(0, 1 - inkFrac);
  const fill = $('inkFill');
  fill.style.width = `${(left * 100).toFixed(1)}%`;
  fill.classList.toggle('low', left < 0.2);
  const timer = `⏱ ${remain.toFixed(1)}`;
  if (hudCache.timer !== timer) $('hudTimer').textContent = hudCache.timer = timer;
  $('hudTimer').classList.toggle('live', live);
  if (hudCache.stars !== previewStars) {
    hudCache.stars = previewStars;
    $('hudStars').innerHTML = starsHTML(previewStars);
  }
}

// ---------------------------------------------------------------------------
// Global ranking
// ---------------------------------------------------------------------------

/** Renders the sorted ranking and returns the 1-based position of `highlightId` (or 0). */
export function renderLeaderboard(entries, highlightId) {
  const tbody = $('rankTable').querySelector('tbody');
  tbody.textContent = '';
  let myRank = 0;
  const medals = ['🥇', '🥈', '🥉'];
  entries.forEach((e, i) => {
    const tr = document.createElement('tr');
    if (e.id === highlightId) { tr.className = 'me'; myRank = i + 1; }
    const cells = [medals[i] || String(i + 1), e.name, `★ ${e.stars}`, String(e.deaths), `${e.inkSaved}%`];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c; // names are user input: never use innerHTML here
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  const you = $('rankYou');
  if (myRank) {
    you.textContent = `Você ficou em ${myRank}º lugar de ${entries.length} jogadores!`;
    you.hidden = false;
    requestAnimationFrame(() => tbody.querySelector('tr.me')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  } else {
    you.hidden = true;
  }
  return myRank;
}

// ---------------------------------------------------------------------------
// Canvas scene renderer
// ---------------------------------------------------------------------------

function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OUTLINE = '#5a3412';

export class Renderer {
  constructor(canvas, host, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.host = host;
    this.W = world.width;
    this.H = world.height;
    this.staticCanvas = document.createElement('canvas');
    this.sctx = this.staticCanvas.getContext('2d');
    this.dpr = 1; this.s = 1; this.ox = 0; this.oy = 0; this.cw = 0;
    this.view = { l: 0, r: this.W, t: 0, b: this.H };
    this.level = null;
    this.statics = [];
    this.clouds = Array.from({ length: 5 }, (_, i) => ({
      x: i * 90 - 20, sc: 0.7 + Math.random() * 0.6, sp: 0.004 + Math.random() * 0.006, fy: Math.random(),
    }));
    new ResizeObserver(() => this.resize()).observe(host);
  }

  resize(force = false) {
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return; // screen hidden
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(r.width * this.dpr), h = Math.round(r.height * this.dpr);
    if (!force && this.canvas.width === w && this.canvas.height === h && this.cw === r.width) return;
    this.cw = r.width;
    this.canvas.width = this.staticCanvas.width = w;
    this.canvas.height = this.staticCanvas.height = h;
    this.s = Math.min(r.width / this.W, r.height / this.H);
    this.ox = (r.width - this.W * this.s) / 2;
    this.oy = r.height - this.H * this.s; // bottom-aligned: extra height becomes sky
    this.view = { l: -this.ox / this.s, r: (r.width - this.ox) / this.s, t: -this.oy / this.s, b: this.H };
    this.renderStatic();
  }

  setLevel(level, statics) {
    this.level = level;
    this.statics = statics;
    this.resize(true);
  }

  toWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.ox) / this.s, y: (clientY - r.top - this.oy) / this.s };
  }

  inView(p) {
    const v = this.view;
    return p.x > v.l + 2 && p.x < v.r - 2 && p.y > v.t + 2 && p.y < this.H - 2;
  }

  worldTf(c, sx = 0, sy = 0) {
    const d = this.dpr;
    c.setTransform(d * this.s, 0, 0, d * this.s, d * (this.ox + sx), d * (this.oy + sy));
  }

  // ---- static layer: pit, terrain and spikes are pre-rendered once per level/resize ----
  renderStatic() {
    if (!this.level) return;
    const c = this.sctx, v = this.view, H = this.H;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.staticCanvas.width, this.staticCanvas.height);
    this.worldTf(c);
    if (this.level.pit) {
      const g = c.createLinearGradient(0, 470, 0, H);
      g.addColorStop(0, 'rgba(40,25,18,0)');
      g.addColorStop(1, 'rgba(40,25,18,.85)');
      c.fillStyle = g;
      c.fillRect(v.l, 470, v.r - v.l, H - 470);
    }
    for (const b of this.statics) if (b.label === 'ground') this.drawGround(c, b);
    for (const b of this.statics) if (b.label === 'spike') this.drawSpikes(c, b);
  }

  drawGround(c, b) {
    const { w, h } = b, hw = w / 2, hh = h / 2;
    const r = rng(b.seed);
    c.save();
    c.translate(b.position.x, b.position.y);
    c.rotate(b.angle);

    if (b.kind === 'plat') { // hanging dirt and roots under floating platforms
      c.beginPath();
      c.moveTo(-hw, hh);
      for (let x = -hw; x < hw; x += 12) {
        c.lineTo(x + 6, hh + 5 + r() * Math.min(14, w / 5));
        c.lineTo(Math.min(x + 12, hw), hh);
      }
      c.closePath();
      c.fillStyle = '#6b4526';
      c.fill();
      c.strokeStyle = '#4a2f18';
      c.lineWidth = 1.5;
      const roots = Math.max(1, Math.round(w / 55));
      for (let i = 0; i < roots; i++) {
        const x = -hw + 10 + r() * (w - 20);
        c.beginPath();
        c.moveTo(x, hh);
        c.quadraticCurveTo(x + 6, hh + 14, x - 2, hh + 20 + r() * 10);
        c.stroke();
      }
    }

    // Dirt body with strata — a cross-section of the subsoil.
    c.beginPath();
    c.rect(-hw, -hh, w, h);
    const g = c.createLinearGradient(0, -hh, 0, -hh + Math.min(h, 260));
    g.addColorStop(0, '#a5713f');
    g.addColorStop(1, '#5e3b1f');
    c.fillStyle = g;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = 'rgba(70,40,18,.25)';
    for (let y = -hh + 28; y < hh; y += 34 + r() * 20) {
      c.beginPath();
      c.moveTo(-hw, y);
      for (let x = -hw; x <= hw; x += 30) c.lineTo(x, y + Math.sin(x * 0.05 + y) * 4);
      c.lineTo(hw, y + 8);
      c.lineTo(-hw, y + 8);
      c.fill();
    }
    const count = Math.min(220, (w * h) / 700);
    for (let i = 0; i < count; i++) {
      const x = -hw + r() * w, y = -hh + 14 + r() * (h - 14), rr = 1.2 + r() * 3;
      c.beginPath();
      c.ellipse(x, y, rr * 1.3, rr, r() * 3, 0, TAU);
      c.fillStyle = r() < 0.5 ? 'rgba(60,35,15,.45)' : 'rgba(200,160,110,.35)';
      c.fill();
    }
    if (b.kind === 'cave') { // darker mold where the dog sits
      c.fillStyle = 'rgba(40,22,10,.35)';
      c.fillRect(-hw, -hh, w, 14);
    }
    c.restore();
    c.strokeStyle = 'rgba(60,35,15,.6)';
    c.lineWidth = 1.5;
    c.strokeRect(-hw, -hh, w, h);

    // Grass on the top edge.
    c.fillStyle = '#58b947';
    c.fillRect(-hw, -hh - 2, w, Math.min(9, h));
    c.fillStyle = '#3e9a33';
    if (h > 10) c.fillRect(-hw, -hh + 5, w, 3);
    c.beginPath();
    for (let x = -hw; x < hw; x += 5) {
      const bh = 3 + r() * 5;
      c.moveTo(x, -hh);
      c.lineTo(x + 2.5, -hh - 2 - bh);
      c.lineTo(Math.min(x + 5, hw), -hh);
    }
    c.fillStyle = '#6fcf5a';
    c.fill();
    c.restore();
  }

  drawSpikes(c, b) {
    const { min, max } = b.bounds, sz = 12, v = this.view;
    const metal = (x0, y0, x1, y1) => {
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, '#f1f4f8');
      g.addColorStop(1, '#8c95a3');
      return g;
    };
    c.save();
    c.lineJoin = 'round';
    c.fillStyle = '#3d3f46';
    c.beginPath();
    if (b.dir === 'up') {
      c.fillRect(min.x, max.y - 5, max.x - min.x, 5);
      for (let x = Math.max(min.x, v.l - sz); x < Math.min(max.x, v.r + sz); x += sz) {
        c.moveTo(x, max.y - 4); c.lineTo(x + sz / 2, min.y); c.lineTo(x + sz, max.y - 4);
      }
      c.fillStyle = metal(0, min.y, 0, max.y);
    } else if (b.dir === 'right') {
      c.fillRect(min.x, min.y, 5, max.y - min.y);
      for (let y = min.y; y < max.y - 2; y += sz) {
        c.moveTo(min.x + 4, y); c.lineTo(max.x, y + sz / 2); c.lineTo(min.x + 4, Math.min(y + sz, max.y));
      }
      c.fillStyle = metal(min.x, 0, max.x, 0);
    } else if (b.dir === 'left') {
      c.fillRect(max.x - 5, min.y, 5, max.y - min.y);
      for (let y = min.y; y < max.y - 2; y += sz) {
        c.moveTo(max.x - 4, y); c.lineTo(min.x, y + sz / 2); c.lineTo(max.x - 4, Math.min(y + sz, max.y));
      }
      c.fillStyle = metal(max.x, 0, min.x, 0);
    }
    c.fill();
    c.strokeStyle = '#4b5260';
    c.lineWidth = 1.2;
    c.stroke();
    c.restore();
  }

  // ---- per-frame drawing ----
  /** @param {{world, points, face, particles, t, dt, shake, hiveShake}} scene */
  render(scene) {
    const { world, t, dt } = scene;
    const ctx = this.ctx;
    const sx = scene.shake > 0 ? (Math.random() - 0.5) * scene.shake : 0;
    const sy = scene.shake > 0 ? (Math.random() - 0.5) * scene.shake : 0;

    // Sky
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    g.addColorStop(0, '#5ab8f5');
    g.addColorStop(0.6, '#a9e0ff');
    g.addColorStop(1, '#e6f7ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.worldTf(ctx);
    ctx.beginPath();
    ctx.arc(this.view.r - 40, this.view.t + 130, 26, 0, TAU);
    ctx.fillStyle = 'rgba(255,240,160,.85)';
    ctx.fill();
    this.drawClouds(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.staticCanvas, sx * this.dpr, sy * this.dpr);

    this.worldTf(ctx, sx, sy);
    for (const h of this.level.hives) this.drawHive(h, t, scene.hiveShake);
    this.drawLineBody(world.line);
    this.drawStroke(scene.points);
    this.drawDog(world, scene.face, t);
    const angry = this.level.id >= 3;
    for (const b of world.bees) this.drawBee(b, t, angry);
    this.drawParticles(scene.particles);
  }

  drawClouds(dt) {
    const ctx = this.ctx, v = this.view;
    const top = v.t + 70;
    for (const c of this.clouds) {
      c.x += c.sp * dt;
      if (c.x > v.r + 70) c.x = v.l - 70;
      const y = top + c.fy * (340 - top);
      ctx.save();
      ctx.translate(c.x, y);
      ctx.scale(c.sc, c.sc);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.arc(-22, 4, 14, 0, TAU);
      ctx.arc(0, -4, 20, 0, TAU);
      ctx.arc(24, 4, 14, 0, TAU);
      ctx.fill();
      ctx.fillRect(-22, 4, 46, 14);
      ctx.restore();
    }
  }

  drawHive(h, t, shake) {
    const ctx = this.ctx, v = this.view;
    const left = h.x < this.W / 2;
    const by = h.y - 50;
    const edge = left ? v.l - 10 : v.r + 10;
    // Branch coming in from the side of the screen.
    ctx.strokeStyle = '#6b4423';
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(edge, by - 12);
    ctx.quadraticCurveTo((h.x + edge) / 2, by + 4, h.x + (left ? 22 : -22), by);
    ctx.stroke();
    ctx.fillStyle = '#4caf50';
    for (let i = 0; i < 4; i++) {
      const lx = h.x + (left ? -1 : 1) * (12 + i * 18);
      ctx.beginPath();
      ctx.ellipse(lx, by - 8 - (i % 2) * 6, 9, 5, (left ? -0.5 : 0.5) + i * 0.3, 0, TAU);
      ctx.fill();
    }
    // Hive body (wobbles while releasing bees)
    const wob = shake > 0 ? Math.sin(t * 0.09) * shake * 0.15 : 0;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(wob * 0.03);
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -50);
    ctx.lineTo(0, -30);
    ctx.stroke();
    const rings = [[-26, 12], [-15, 20], [-3, 25], [9, 23], [20, 16]];
    for (const [y, rx] of rings) {
      ctx.beginPath();
      ctx.ellipse(0, y, rx, 8, 0, 0, TAU);
      ctx.fillStyle = '#f5b83d';
      ctx.fill();
      ctx.strokeStyle = '#c4851a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(0, 12, 7, 5, 0, 0, TAU);
    ctx.fillStyle = '#3a2208';
    ctx.fill();
    ctx.restore();
  }

  strokeInk() {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1f1f2b';
    ctx.lineWidth = LINE_W + 1;
    ctx.stroke();
    ctx.strokeStyle = '#4a4a66';
    ctx.lineWidth = LINE_W - 4;
    ctx.stroke();
  }

  drawLineBody(line) {
    if (!line) return;
    const ctx = this.ctx, parts = line.parts;
    ctx.beginPath();
    // Each part is a rectangle; its short-edge midpoints are the segment endpoints.
    for (let i = 1; i < parts.length; i++) {
      const v = parts[i].vertices;
      if (i === 1) ctx.moveTo((v[0].x + v[3].x) / 2, (v[0].y + v[3].y) / 2);
      ctx.lineTo((v[1].x + v[2].x) / 2, (v[1].y + v[2].y) / 2);
    }
    this.strokeInk();
  }

  drawStroke(points) {
    if (!points.length) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    if (points.length === 1) ctx.lineTo(points[0].x + 0.1, points[0].y);
    this.strokeInk();
  }

  drawBee(b, t, angry) {
    const ctx = this.ctx;
    const v = b.velocity, dir = v.x < -0.05 ? -1 : 1;
    const sc = b.circleRadius / 7;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.scale(dir * sc, sc);
    ctx.rotate(Math.max(-0.5, Math.min(0.5, v.y * 0.12 * dir)));
    // wings
    const flap = 0.5 + 0.5 * Math.abs(Math.sin(t * 0.06 + b.phase));
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.strokeStyle = 'rgba(80,120,160,.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(-1, -7, 4.5, 6 * flap + 1, -0.3, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(3, -7, 3.5, 5 * flap + 1, 0.3, 0, TAU); ctx.fill(); ctx.stroke();
    // stinger
    ctx.beginPath(); ctx.moveTo(-8, -1.5); ctx.lineTo(-12, 0); ctx.lineTo(-8, 1.5);
    ctx.fillStyle = '#222'; ctx.fill();
    // striped body
    ctx.beginPath(); ctx.ellipse(0, 0, 8.5, 6.5, 0, 0, TAU);
    ctx.fillStyle = '#ffd23f'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#2a2108';
    ctx.fillRect(-4.5, -7, 2.6, 14);
    ctx.fillRect(0.5, -7, 2.6, 14);
    ctx.restore();
    ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1.2; ctx.stroke();
    // eye (+ angry brow on harder levels)
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(5.2, -1.5, 1.7, 0, TAU); ctx.fill();
    if (angry) { ctx.beginPath(); ctx.moveTo(3.5, -5); ctx.lineTo(7.5, -3.2); ctx.lineWidth = 1.3; ctx.stroke(); }
    ctx.restore();
  }

  nearestBeeDir(world) {
    const dog = world.dog.position;
    let best = null, bd = Infinity;
    for (const b of world.bees) {
      const d = (b.position.x - dog.x) ** 2 + (b.position.y - dog.y) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return { x: 0, y: -1 };
    const dx = best.position.x - dog.x, dy = best.position.y - dog.y, n = Math.hypot(dx, dy) || 1;
    return { x: dx / n, y: dy / n };
  }

  sweat(x, y, ph, size) {
    const ctx = this.ctx;
    ctx.globalAlpha = 1 - ph;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.quadraticCurveTo(x + size * 0.7, y, x, y + size * 0.5);
    ctx.quadraticCurveTo(x - size * 0.7, y, x, y - size);
    ctx.fillStyle = '#7cc8ff'; ctx.fill();
    ctx.strokeStyle = '#3a8fd0'; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Shiba-style head with dynamic expressions: idle, scared, tense, happy, hurt. */
  drawDog(world, face, t) {
    const ctx = this.ctx, dog = world.dog, p = dog.position, R = DOG_R;
    let jx = 0, jy = 0;
    if (face === 'scared') jx = Math.sin(t * 0.09) * 0.9;
    if (face === 'tense') jx = Math.sin(t * 0.2) * 0.5;
    if (face === 'happy') jy = -Math.abs(Math.sin(t * 0.012)) * 4;
    ctx.save();
    ctx.translate(p.x + jx, p.y + jy);
    ctx.rotate(dog.angle);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // ears
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * R * 0.95, -R * 0.25); ctx.lineTo(sx * R * 0.78, -R * 1.3); ctx.lineTo(sx * R * 0.18, -R * 0.88);
      ctx.closePath();
      ctx.fillStyle = '#e0913a'; ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx * R * 0.8, -R * 0.42); ctx.lineTo(sx * R * 0.74, -R * 1.05); ctx.lineTo(sx * R * 0.38, -R * 0.82);
      ctx.closePath();
      ctx.fillStyle = '#f6b9a6'; ctx.fill();
    }
    // head + cream muzzle
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU);
    ctx.fillStyle = '#eaa04c'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.beginPath(); ctx.ellipse(0, R * 0.52, R * 0.88, R * 0.62, 0, 0, TAU);
    ctx.fillStyle = '#fdf0da'; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();

    const ex = R * 0.38, ey = -R * 0.08;
    ctx.strokeStyle = OUTLINE;

    if (face === 'idle' || face === 'happy') { // shiba eyebrow dots
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(sx * ex, ey - 9, 3, 2, 0, 0, TAU);
        ctx.fillStyle = '#fdf0da'; ctx.fill();
      }
    }

    if (face === 'idle') {
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sx * ex, ey, 2.8, 0, TAU); ctx.fillStyle = '#1c120c'; ctx.fill();
        ctx.beginPath(); ctx.arc(sx * ex + 0.9, ey - 0.9, 0.9, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, R * 0.3, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineWidth = 1.8; ctx.stroke();
    } else if (face === 'scared') { // wide eyes, worried brows, sweating
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sx * ex, ey, 5.4, 0, TAU);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx * ex + Math.sin(t * 0.02) * 1.3, ey + 0.6, 2.1, 0, TAU);
        ctx.fillStyle = '#1c120c'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx * (ex + 5), ey - 8); ctx.lineTo(sx * (ex - 3), ey - 12.5);
        ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(0, R * 0.55, 3, 3.8 + Math.sin(t * 0.03) * 0.6, 0, 0, TAU);
      ctx.fillStyle = '#5c1a1a'; ctx.fill();
      for (let i = 0; i < 2; i++) {
        const ph = (t * 0.0012 + i * 0.5) % 1;
        this.sweat((i ? -1 : 1) * R * 0.95, -R * 0.6 + ph * 16, ph, 5);
      }
    } else if (face === 'tense') { // determined brows, gritted teeth, eyes on the nearest bee
      const look = this.nearestBeeDir(world);
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sx * ex, ey, 4.6, 0, TAU);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx * ex + look.x * 1.8, ey + look.y * 1.8, 2.3, 0, TAU);
        ctx.fillStyle = '#1c120c'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx * (ex + 5.5), ey - 11); ctx.lineTo(sx * (ex - 4), ey - 6);
        ctx.lineWidth = 2.6; ctx.stroke();
      }
      const my = R * 0.42;
      ctx.beginPath(); ctx.rect(-7, my, 14, 6.5);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-7, my + 3.25); ctx.lineTo(7, my + 3.25);
      for (const x of [-3.5, 0, 3.5]) { ctx.moveTo(x, my); ctx.lineTo(x, my + 6.5); }
      ctx.lineWidth = 1; ctx.stroke();
      const ph = (t * 0.001) % 1;
      this.sweat(R * 0.95, -R * 0.5 + ph * 12, ph, 4);
    } else if (face === 'happy') { // ^^ eyes, blush, open smile
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sx * ex, ey + 2.5, 4, Math.PI * 1.1, Math.PI * 1.9);
        ctx.lineWidth = 2.4; ctx.strokeStyle = '#1c120c'; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(sx * R * 0.62, R * 0.24, 3.8, 2.2, 0, 0, TAU);
        ctx.fillStyle = 'rgba(255,110,130,.55)'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, R * 0.36, 6.5, 0, Math.PI); ctx.closePath();
      ctx.fillStyle = '#6b1f1f'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, R * 0.36 + 4.5, 3.2, 2.2, 0, 0, TAU);
      ctx.fillStyle = '#ff7f96'; ctx.fill();
    } else if (face === 'hurt') { // X eyes
      ctx.lineWidth = 2.2; ctx.strokeStyle = '#1c120c';
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx * ex - 3.5, ey - 3.5); ctx.lineTo(sx * ex + 3.5, ey + 3.5);
        ctx.moveTo(sx * ex + 3.5, ey - 3.5); ctx.lineTo(sx * ex - 3.5, ey + 3.5);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(0, R * 0.52, 4.5, 3.5, 0, 0, TAU);
      ctx.fillStyle = '#5c1a1a'; ctx.fill();
    }
    // nose last so it sits over the mouth area
    ctx.beginPath(); ctx.ellipse(0, R * 0.2, 3.6, 2.6, 0, 0, TAU);
    ctx.fillStyle = '#2b1d14'; ctx.fill();
    ctx.restore();
  }

  drawParticles(particles) {
    const ctx = this.ctx;
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      if (p.rect) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
