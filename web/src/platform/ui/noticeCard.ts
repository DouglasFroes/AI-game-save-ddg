import type Phaser from 'phaser';
import { GAME_WIDTH } from '@/config';
import { HUB_FONT } from '@/platform/fonts';
import { NoticeQueue, type AppNotice, type NoticeKind } from '@/platform/notices';
import { UI } from '@/platform/ui/hubTheme';
import { drawIcon, type IconKind } from '@/platform/ui/icons';
import { addText } from '@/platform/ui/widgets';

const CARD_W = 660;
const PAD = 28;
const ICON = 88;
const TEXT_X = -CARD_W / 2 + PAD + ICON + 24;
const TEXT_W = CARD_W / 2 - PAD - 24 - TEXT_X;
const TOP = 28;
const DEPTH = 1200;
const SHOW_MS = 5000;
const SHOW_ACTION_MS = 7500;
const STICKY_MS = 10000;

const ACCENT: Record<NoticeKind, number> = {
  info: UI.cyan,
  success: 0x5bd46f,
  warn: UI.gold,
  rival: UI.pink,
};
const GLYPH: Record<NoticeKind, IconKind> = {
  info: 'star',
  success: 'check',
  warn: 'globe',
  rival: 'trophy',
};

interface SceneNotices {
  queue: NoticeQueue<AppNotice>;
  showing: boolean;
}
const states = new WeakMap<Phaser.Scene, SceneNotices>();

/**
 * Shows an in-app notification card at the top of the scene, one at a time (the rest wait in
 * line). The card carries the game's icon, a title and detail, and buttons for what to do next;
 * tapping the card runs the first action, the ✕ or the timer dismisses it.
 */
export function showNotice(scene: Phaser.Scene, notice: AppNotice): void {
  let state = states.get(scene);
  if (!state) {
    state = { queue: new NoticeQueue<AppNotice>(), showing: false };
    states.set(scene, state);
    scene.events.once('shutdown', () => states.delete(scene));
  }
  state.queue.push(notice);
  pump(scene, state);
}

function pump(scene: Phaser.Scene, state: SceneNotices): void {
  if (state.showing || !scene.sys.isActive()) return;
  const next = state.queue.shift();
  if (!next) return;
  state.showing = true;
  buildCard(scene, next, () => {
    state.showing = false;
    pump(scene, state);
  });
}

const label = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size: number,
  color: string,
  weight: 'normal' | 'bold' = 'bold',
): Phaser.GameObjects.Text =>
  addText(scene, x, y, value, size, {
    family: HUB_FONT,
    color,
    weight,
    align: 'left',
    wrapWidth: TEXT_W,
  }).setOrigin(0, 0);

function buildCard(scene: Phaser.Scene, notice: AppNotice, done: () => void): void {
  const kind = notice.kind ?? 'info';
  const accent = ACCENT[kind];
  const actions = (notice.actions ?? []).slice(0, 2);

  const title = label(scene, TEXT_X, 0, notice.title, 26, kind === 'rival' ? '#ffd166' : UI.white);
  const body = notice.body ? label(scene, TEXT_X, 0, notice.body, 21, UI.soft, 'normal') : null;
  const textH = title.height + (body ? 8 + body.height : 0);
  const chipsH = actions.length > 0 ? 18 + 56 : 0;
  const h = Math.max(ICON + PAD * 2, textH + chipsH + PAD * 2);

  const card = scene.add
    .container(GAME_WIDTH / 2, -h)
    .setDepth(DEPTH)
    .setScrollFactor(0);
  const restY = TOP + h / 2;
  let closed = false;
  const close = () => {
    if (closed || !card.active) return;
    closed = true;
    scene.tweens.add({
      targets: card,
      y: -h,
      alpha: 0,
      duration: 240,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        card.destroy();
        done();
      },
    });
  };

  // Card body: soft shadow, glass fill, accent-coloured edge.
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.35).fillRoundedRect(-CARD_W / 2, -h / 2 + 8, CARD_W, h, 32);
  bg.fillStyle(0x0f1126, 0.97).fillRoundedRect(-CARD_W / 2, -h / 2, CARD_W, h, 32);
  bg.lineStyle(2, accent, 0.85).strokeRoundedRect(-CARD_W / 2, -h / 2, CARD_W, h, 32);
  bg.fillStyle(accent, 1).fillRoundedRect(-CARD_W / 2 + 1, -h / 2 + 26, 7, h - 52, 3);
  card.add(bg);

  // The tap target for the whole card sits under the buttons and the ✕.
  const hit = scene.add
    .rectangle(0, 0, CARD_W, h, 0xffffff, 0.001)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerup', () => {
    if (closed) return;
    actions[0]?.run();
    close();
  });
  card.add(hit);

  // Icon: the game's own artwork on a tinted disc, or a vector glyph.
  const ix = -CARD_W / 2 + PAD + ICON / 2;
  const disc = scene.add.graphics();
  disc.fillStyle(accent, 0.18).fillCircle(ix, 0, ICON / 2 + 4);
  disc.lineStyle(2, accent, 0.55).strokeCircle(ix, 0, ICON / 2 + 4);
  card.add(disc);
  if (notice.texture && scene.textures.exists(notice.texture)) {
    const img = scene.add.image(ix, 0, notice.texture);
    img.setScale(Math.min((ICON - 8) / img.width, (ICON - 8) / img.height));
    card.add(img);
  } else {
    card.add(drawIcon(scene, notice.glyph ?? GLYPH[kind], ix, 0, ICON * 0.46, accent));
  }

  const top = -h / 2 + PAD;
  title.setPosition(TEXT_X, top);
  card.add(title);
  if (body) {
    body.setPosition(TEXT_X, top + title.height + 8);
    card.add(body);
  }

  // Buttons: "what do I do about it".
  let cx = TEXT_X;
  actions.forEach((action, index) => {
    const t = addText(scene, 0, 0, action.label, 22, { family: HUB_FONT, color: '#06070f' });
    const w = t.width + 48;
    const y = h / 2 - PAD - 28;
    const chip = scene.add.graphics();
    if (index === 0) chip.fillStyle(accent, 1).fillRoundedRect(cx, y - 28, w, 56, 28);
    else {
      chip.lineStyle(2, accent, 0.9).strokeRoundedRect(cx, y - 28, w, 56, 28);
      t.setColor(css(accent));
    }
    t.setPosition(cx + w / 2, y);
    const zone = scene.add
      .rectangle(cx + w / 2, y, w, 56, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => {
      if (closed) return;
      action.run();
      close();
    });
    card.add([chip, t, zone]);
    cx += w + 14;
  });

  // ✕ and the time left.
  const x = scene.add
    .rectangle(CARD_W / 2 - 40, -h / 2 + 40, 64, 64, 0xffffff, 0.001)
    .setInteractive({ useHandCursor: true });
  x.on('pointerup', close);
  card.add([drawIcon(scene, 'close', CARD_W / 2 - 40, -h / 2 + 40, 18, 0x7a80a8), x]);

  const duration = notice.sticky ? STICKY_MS : actions.length > 0 ? SHOW_ACTION_MS : SHOW_MS;
  const bar = scene.add
    .rectangle(-CARD_W / 2 + 40, h / 2 - 10, CARD_W - 80, 4, accent, 0.7)
    .setOrigin(0, 0.5);
  card.add(bar);
  scene.tweens.add({ targets: bar, scaleX: 0, duration, ease: 'Linear', onComplete: close });

  notice.onShow?.();
  scene.tweens.add({ targets: card, y: restY, duration: 380, ease: 'Back.easeOut' });
}

const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
