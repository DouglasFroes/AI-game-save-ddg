// main.js — Game lifecycle: boot, campaign state, input (draw-to-physics), main loop, audio/effects,
// and the glue between physics.js and ui.js.
import { PhysicsWorld, STEP } from './physics.js';
import * as UI from './ui.js';

// Optional remote leaderboard. Leave empty to keep the ranking local (leaderboard.json + localStorage).
// Expected API: GET → { entries: [...] }, POST (JSON entry) → 2xx.
const LEADERBOARD_API = '';

const STORE_CAMPAIGN = 'dts.campaign.v1';
const STORE_BOARD = 'dts.leaderboard.v1';
const MIN_SEG = 6, MAX_SEG = 14;     // point spacing while drawing (world units)
const GAME_OVER_PENALTY = 3;         // each game over counts as 3 extra deaths in the score

// ---------------------------------------------------------------------------
// Persistence helpers (localStorage can throw in private mode — never let it break the game)
// ---------------------------------------------------------------------------
const store = {
  load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let config, levels, maxLives, surviveSeconds;
let seedBoard = [];
let campaign;
let renderer;

let world = null, level = null, levelIndex = 0, levelDeaths = 0;
let state = 'boot';          // boot | map | draw | attack | win | fail | ranking
let face = 'idle';           // idle | scared | tense | happy | hurt
let points = [], drawing = false, pointerId = null, inkUsed = 0;
let attackTime = 0, spawnQueue = [];
let particles = [], shake = 0, hiveShake = 0;
let timers = [];

function newCampaign() {
  return { id: uid(), deaths: 0, gameOvers: 0, lives: maxLives, unlocked: 1, results: {}, submittedId: null };
}

function saveCampaign() {
  store.save(STORE_CAMPAIGN, campaign);
}

function later(ms, fn) {
  timers.push(setTimeout(fn, ms));
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

// ---------------------------------------------------------------------------
// Audio — tiny synthesized SFX, no audio files
// ---------------------------------------------------------------------------
let actx = null;

function unlockAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch { /* audio unsupported */ }
}

function tone(freq, t0, dur, type = 'sine', vol = 0.12, slide = 0) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(actx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function sfx(kind, n = 0) {
  if (!actx || actx.state !== 'running') return;
  const t = actx.currentTime;
  if (kind === 'hit') tone(300, t, 0.35, 'sawtooth', 0.12, -220);
  else if (kind === 'win') [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.09, 0.22, 'triangle', 0.12));
  else if (kind === 'start') { tone(660, t, 0.08, 'square', 0.05); tone(880, t + 0.08, 0.1, 'square', 0.05); }
  else if (kind === 'stars') for (let i = 0; i < n; i++) tone(880 + i * 220, t + 0.15 + i * 0.18, 0.18, 'triangle', 0.1);
  else if (kind === 'click') tone(520, t, 0.05, 'square', 0.04);
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------
function burst(x, y, colors, n, sp) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random());
    particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 1, decay: 0.02 + Math.random() * 0.02,
      size: 2 + Math.random() * 3, color: colors[i % colors.length], rot: Math.random() * 6, g: 0.12,
    });
  }
}

function confetti(x, y) {
  const c = ['#ff5d5d', '#ffd23f', '#4da3ff', '#5bd46f', '#c77dff'];
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 40, y: y - 20, vx: (Math.random() - 0.5) * 7, vy: -3 - Math.random() * 5,
      life: 1, decay: 0.008 + Math.random() * 0.008, size: 3 + Math.random() * 3, color: c[i % c.length],
      rot: Math.random() * 6, g: 0.15, rect: true,
    });
  }
}

function updateParticles(k) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += p.g * k;
    p.x += p.vx * k;
    p.y += p.vy * k;
    p.vx *= 0.99;
    p.rot += 0.15 * k;
    p.life -= p.decay * k;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
function openMap() {
  clearTimers();
  state = 'map';
  world = null;
  drawing = false;
  UI.hideModals();
  UI.renderMap(levels, campaign, maxLives, selectLevel);
  UI.showScreen('map');
}

function selectLevel(i) {
  unlockAudio();
  if (i + 1 > campaign.unlocked) return;
  sfx('click');
  startLevel(i, true);
}

function startLevel(i, fresh) {
  clearTimers();
  if (fresh) levelDeaths = 0;
  if (campaign.lives <= 0) { campaign.lives = maxLives; saveCampaign(); }
  levelIndex = i;
  level = levels[i];
  world = new PhysicsWorld(level, {
    onDogHit: (kind) => fail(kind === 'bee' ? 'Uma abelha picou o doguinho!' : 'O doguinho encostou nos espinhos!'),
  });
  UI.hideModals();
  UI.showScreen('game');
  renderer.setLevel(level, world.statics);
  UI.setInkMarkers(level.stars);

  state = 'draw';
  face = 'scared';
  points = [];
  drawing = false;
  inkUsed = 0;
  attackTime = 0;
  spawnQueue = [];
  particles = [];
  shake = 0;
  UI.showHint(`✏️ ${level.tip}`);
  sfx('start');
}

function startAttack() {
  state = 'attack';
  face = 'tense';
  attackTime = 0;
  world.mode = 'chase';
  UI.hideHint();
  const { count, interval } = level.bees, hives = level.hives;
  for (let i = 0; i < count; i++) {
    spawnQueue.push({ t: 0.3 + Math.floor(i / hives.length) * interval, hive: hives[i % hives.length] });
  }
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------
function fail(msg) {
  if (state !== 'attack') return;
  state = 'fail';
  face = 'hurt';
  world.mode = 'hover';
  campaign.deaths++;
  levelDeaths++;
  campaign.lives--;
  const gameOver = campaign.lives <= 0;
  if (gameOver) campaign.gameOvers++;
  saveCampaign();

  shake = 14;
  burst(world.dog.position.x, world.dog.position.y, ['#ff5d5d', '#ffd23f', '#fff'], 22, 4);
  sfx('hit');
  later(1100, () => (gameOver ? UI.showGameOver(msg, campaign.gameOvers) : UI.showFail(msg, campaign.lives)));
}

function win() {
  state = 'win';
  face = 'happy';
  world.release();
  confetti(world.dog.position.x, world.dog.position.y);
  sfx('win');

  const inkFrac = Math.min(1, inkUsed / level.ink);
  const stars = UI.calcStars(inkFrac, levelDeaths, level.stars);
  const prev = campaign.results[levelIndex];
  if (!prev || stars > prev.stars || (stars === prev.stars && inkFrac < prev.inkFrac)) {
    campaign.results[levelIndex] = { stars, inkFrac };
  }
  campaign.unlocked = Math.max(campaign.unlocked, Math.min(levels.length, levelIndex + 2));
  saveCampaign();

  const isLast = levelIndex === levels.length - 1;
  const allCleared = levels.every((_, i) => campaign.results[i]);
  later(1300, () => {
    if (isLast && allCleared && !campaign.submittedId) {
      UI.showFinish(summary());
    } else {
      UI.showWin({
        levelNum: levelIndex + 1, stars, inkFrac,
        nextLabel: isLast ? '🏆 Ver ranking' : 'Próxima fase',
      });
      sfx('stars', stars);
    }
  });
}

// ---------------------------------------------------------------------------
// Score & leaderboard
// ---------------------------------------------------------------------------

/** Lexicographic score: more stars > fewer (penalised) deaths > more ink saved. */
function computeScore({ stars, deaths, gameOvers, inkSaved }) {
  const penalised = Math.min(9999, deaths + GAME_OVER_PENALTY * gameOvers);
  return stars * 1_000_000 + (9999 - penalised) * 100 + Math.min(99, Math.max(0, inkSaved));
}

function summary() {
  let stars = 0, saved = 0;
  levels.forEach((_, i) => {
    const r = campaign.results[i];
    if (r) { stars += r.stars; saved += 1 - r.inkFrac; }
  });
  const s = {
    stars,
    maxStars: levels.length * 3,
    deaths: campaign.deaths,
    gameOvers: campaign.gameOvers,
    inkSaved: Math.round((saved / levels.length) * 100),
  };
  s.score = computeScore(s);
  return s;
}

function cleanName(raw) {
  const name = String(raw || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16);
  return name || 'Anônimo';
}

function normalizeEntry(e) {
  const entry = {
    id: String(e.id),
    name: cleanName(e.name),
    stars: Number(e.stars) || 0,
    deaths: Number(e.deaths) || 0,
    gameOvers: Number(e.gameOvers) || 0,
    inkSaved: Number(e.inkSaved) || 0,
    date: e.date || new Date(0).toISOString(),
  };
  entry.score = computeScore(entry); // never trust stored scores
  return entry;
}

async function loadBoard() {
  const sources = [seedBoard, store.load(STORE_BOARD, [])];
  if (LEADERBOARD_API) {
    try { sources.push((await fetchJSON(LEADERBOARD_API)).entries || []); } catch { /* offline: local only */ }
  }
  const byId = new Map();
  for (const list of sources) for (const e of list) if (e && e.id) byId.set(String(e.id), normalizeEntry(e));
  return [...byId.values()].sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
}

async function submitScore(rawName) {
  const s = summary();
  const entry = normalizeEntry({
    id: uid(), name: rawName, stars: s.stars, deaths: s.deaths, gameOvers: s.gameOvers,
    inkSaved: s.inkSaved, date: new Date().toISOString(),
  });
  const local = store.load(STORE_BOARD, []);
  local.push(entry);
  store.save(STORE_BOARD, local);
  campaign.submittedId = entry.id;
  saveCampaign();
  if (LEADERBOARD_API) {
    fetch(LEADERBOARD_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
    }).catch(() => { /* kept locally anyway */ });
  }
  await showRanking(entry.id);
}

async function showRanking(highlightId = campaign.submittedId) {
  clearTimers();
  state = 'ranking';
  world = null;
  UI.hideModals();
  UI.showScreen('ranking');
  UI.renderLeaderboard(await loadBoard(), highlightId);
}

function resetCampaign() {
  if (!confirm('Começar uma nova campanha? Estrelas, mortes e fases desbloqueadas serão zeradas (o ranking é mantido).')) return;
  campaign = newCampaign();
  saveCampaign();
  openMap();
}

// ---------------------------------------------------------------------------
// Input: draw-to-physics
// ---------------------------------------------------------------------------
function addPoint(p) {
  const last = points[points.length - 1];
  const dx = p.x - last.x, dy = p.y - last.y;
  let d = Math.hypot(dx, dy);
  if (d < MIN_SEG) return;
  if (d > MAX_SEG) { // subdivide fast strokes so collision checks stay accurate
    const n = Math.ceil(d / MAX_SEG);
    for (let i = 1; i <= n; i++) {
      const before = points.length;
      addPoint({ x: last.x + (dx * i) / n, y: last.y + (dy * i) / n });
      if (points.length === before) return; // blocked or out of ink
    }
    return;
  }
  const remaining = level.ink - inkUsed;
  if (remaining <= 1) return;
  if (d > remaining) {
    p = { x: last.x + (dx / d) * remaining, y: last.y + (dy / d) * remaining };
    d = remaining;
  }
  if (!renderer.inView(p) || !world.canPlace(last, p)) return;
  points.push(p);
  inkUsed += d;
}

function onPointerDown(e) {
  unlockAudio();
  if (state !== 'draw' || drawing || world.line) return;
  const p = renderer.toWorld(e.clientX, e.clientY);
  if (!renderer.inView(p) || !world.isFree(p)) return;
  drawing = true;
  pointerId = e.pointerId;
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
  points = [p];
  inkUsed = 0;
  UI.hideHint();
  e.preventDefault();
}

function onPointerMove(e) {
  if (!drawing || e.pointerId !== pointerId) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of evs.length ? evs : [e]) addPoint(renderer.toWorld(ev.clientX, ev.clientY));
  e.preventDefault();
}

function onPointerUp(e) {
  if (!drawing || e.pointerId !== pointerId) return;
  drawing = false;
  pointerId = null;
  if (state !== 'draw') return;
  if (points.length >= 2 && inkUsed >= 10) {
    world.commitLine(points);
    points = [];
    startAttack();
  } else { // a tap, or a stroke that was blocked immediately: let the player try again
    points = [];
    inkUsed = 0;
    UI.showHint(`✏️ ${level.tip}`);
  }
}

// ---------------------------------------------------------------------------
// Main loop (fixed-step physics, variable-rate rendering)
// ---------------------------------------------------------------------------
function physicsStep() {
  const killed = world.step();
  for (const b of killed) burst(b.position.x, b.position.y, ['#ffd23f', '#222'], 8, 2);

  if (state === 'attack') {
    attackTime += STEP / 1000;
    while (spawnQueue.length && spawnQueue[0].t <= attackTime) {
      world.spawnBee(spawnQueue.shift().hive);
      hiveShake = 10;
    }
    const p = world.dog.position, v = renderer.view;
    if (p.y > v.b + 40 || p.x < v.l - 60 || p.x > v.r + 60) fail('O doguinho caiu no abismo!');
    else if (attackTime >= surviveSeconds) win();
  } else if (state === 'win') {
    for (const b of [...world.bees]) if (b.position.y < renderer.view.t - 60) world.removeBee(b);
  }
}

let last = performance.now(), acc = 0;

function frame(now) {
  const dt = Math.min(now - last, 100);
  last = now;
  const playing = world && (state === 'attack' || state === 'win' || state === 'fail');
  if (playing) {
    acc += dt;
    let n = 0;
    while (world && acc >= STEP && n < 5) { physicsStep(); acc -= STEP; n++; }
    if (n === 5) acc = 0; // drop backlog instead of spiralling on slow devices
  } else {
    acc = 0;
  }

  if (world && level) {
    const k = dt / STEP;
    shake = Math.max(0, shake - 0.8 * k);
    hiveShake = Math.max(0, hiveShake - 0.5 * k);
    updateParticles(k);
    renderer.render({ world, points, face, particles, t: now, dt, shake, hiveShake });
    const inkFrac = inkUsed / level.ink;
    UI.updateHUD({
      levelNum: levelIndex + 1,
      total: levels.length,
      lives: campaign.lives,
      maxLives,
      inkFrac,
      remain: state === 'attack' ? Math.max(0, surviveSeconds - attackTime) : state === 'win' ? 0 : surviveSeconds,
      live: state === 'attack',
      previewStars: UI.calcStars(inkFrac, levelDeaths, level.stars),
    });
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function bindUI() {
  const on = (id, fn) => UI.$(id).addEventListener('click', () => { unlockAudio(); sfx('click'); fn(); });

  on('btnRanking', () => showRanking());
  on('btnNewCampaign', resetCampaign);
  on('btnRankNew', resetCampaign);
  on('btnRankBack', openMap);
  on('btnBack', openMap);

  on('btnWinNext', () => (levelIndex < levels.length - 1 ? startLevel(levelIndex + 1, true) : showRanking()));
  on('btnWinRetry', () => startLevel(levelIndex, true));
  on('btnWinMap', openMap);

  on('btnFailRetry', () => startLevel(levelIndex, false));
  on('btnFailMap', openMap);

  on('btnGameoverRetry', () => { campaign.lives = maxLives; saveCampaign(); startLevel(levelIndex, false); });
  on('btnGameoverMap', () => { campaign.lives = maxLives; saveCampaign(); openMap(); });

  UI.$('finishForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = UI.$('btnSubmitName');
    if (btn.disabled) return;
    btn.disabled = true;
    submitScore(UI.$('playerName').value).finally(() => { btn.disabled = false; });
  });

  const canvas = UI.$('c');
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // Block pull-to-refresh / page scroll, except inside explicitly scrollable areas (ranking table).
  document.addEventListener('touchmove', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('.scrollable')) e.preventDefault();
  }, { passive: false });
}

function loadCampaign() {
  const saved = store.load(STORE_CAMPAIGN, null);
  if (!saved || typeof saved !== 'object' || !saved.results) return newCampaign();
  const c = { ...newCampaign(), ...saved };
  c.unlocked = Math.min(levels.length, Math.max(1, c.unlocked | 0));
  if (!(c.lives > 0)) c.lives = maxLives;
  return c;
}

async function boot() {
  if (!window.Matter) {
    UI.bootError('Não foi possível carregar o motor de física (Matter.js). Verifique sua conexão e recarregue.');
    return;
  }
  try {
    const [lv, lb] = await Promise.all([
      fetchJSON('levels.json'),
      fetchJSON('leaderboard.json').catch(() => ({ entries: [] })),
    ]);
    config = lv;
    seedBoard = Array.isArray(lb.entries) ? lb.entries : [];
  } catch (err) {
    console.error(err);
    UI.bootError('Não foi possível carregar levels.json. Abra o jogo por um servidor web (ex.: "python3 -m http.server") em vez de abrir o arquivo direto (file://).');
    return;
  }
  levels = config.levels;
  maxLives = config.rules.lives;
  surviveSeconds = config.rules.surviveSeconds;
  campaign = loadCampaign();

  renderer = new UI.Renderer(UI.$('c'), UI.$('screen-game'), config.world);
  bindUI();
  UI.hideModals();
  openMap();
  requestAnimationFrame(frame);
}

boot();
