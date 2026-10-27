import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { HUB_FONT } from '@/platform/fonts';
import { MAX_NAME_LENGTH, sanitizeName } from '@/platform/leaderboard';
import { getServices } from '@/services';
import { CTA, GLASS_PILL, glassArt, glowBlob, pillArt, UI } from './hubTheme';
import { drawIcon } from './icons';
import { addText } from './widgets';

export interface NameDialogOptions {
  /** The player can't leave without typing a name: no Cancel button, nothing behind is reachable. */
  readonly required?: boolean;
}

/** A name needs at least one visible character once control characters and markup are stripped. */
const hasVisibleChar = (value: string): boolean => value.replace(/[\p{C}<>\s]/gu, '').length > 0;

const text = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size: number,
  color: string,
  weight: 'normal' | 'bold' = 'bold',
) => addText(scene, x, y, value, size, { color, weight, family: HUB_FONT });

/** A gradient pill button with a springy press. */
export function pillButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  size: number,
  colors: readonly number[],
  glow: boolean,
  onClick: () => void,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  c.add([
    scene.add.image(0, 0, pillArt(scene, w, h, colors, glow)),
    text(scene, 0, -1, label, size, '#ffffff'),
  ]);
  c.setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => c.setScale(0.95));
  c.on('pointerout', () => c.setScale(1));
  c.on('pointerup', () => {
    scene.tweens.add({ targets: c, scale: 1, duration: 220, ease: 'Back.easeOut' });
    getServices(scene).sfx.play('click');
    onClick();
  });
  return c;
}

/** Modal asking for the player's nickname. Resolves with the sanitized name, or null if cancelled. */
export function askName(
  scene: Phaser.Scene,
  current: string,
  opts: NameDialogOptions = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    const required = opts.required === true;
    const cx = GAME_WIDTH / 2;
    const cy = 470;
    const w = 636;
    const h = 560;
    const depth = 1000;
    const objects: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject & { setDepth(v: number): T }>(o: T): T => {
      objects.push(o);
      return o.setDepth(depth);
    };

    add(
      scene.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x03040a, 0.86)
        .setOrigin(0)
        .setInteractive(),
    );
    add(
      scene.add
        .image(cx, cy - 120, glowBlob(scene))
        .setTint(UI.violet)
        .setScale(6)
        .setAlpha(0.32)
        .setBlendMode('ADD'),
    );

    const card = scene.add.graphics();
    card.fillStyle(0x0c0e22).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 44);
    card.lineStyle(2, 0xffffff, 0.16).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 44);
    add(card);
    // A touch of glass under the field, so it reads as part of the card.
    add(scene.add.image(cx, cy + 28, glassArt(scene, w - 80, 88, 28, { fill: 0.04 })));

    // Avatar badge: a gradient orb.
    add(scene.add.image(cx, cy - 188, pillArt(scene, 104, 104, CTA, true)));
    add(drawIcon(scene, 'user', cx, cy - 188, 52, 0xffffff));

    add(
      text(
        scene,
        cx,
        cy - 100,
        required ? 'Como você se chama?' : 'Seu nome no ranking',
        38,
        '#ffffff',
      ),
    );
    add(
      text(scene, cx, cy - 54, 'Ele aparece no ranking de todos os jogos.', 21, UI.mute, 'normal'),
    );

    const input = document.createElement('input');
    input.className = 'name-input';
    input.maxLength = MAX_NAME_LENGTH;
    input.placeholder = 'Digite seu nome';
    input.value = current;
    input.enterKeyHint = 'done';
    input.setAttribute('autocomplete', 'nickname');
    add(scene.add.dom(cx, cy + 28, input));

    const error = add(
      text(scene, cx, cy + 96, 'Digite um nome para continuar', 21, '#ff7b9c').setAlpha(0),
    );

    const close = (value: string | null) => {
      input.blur();
      objects.forEach((o) => o.destroy());
      resolve(value);
    };
    const confirm = () => {
      if (!hasVisibleChar(input.value)) {
        error.setAlpha(1);
        input.focus();
        return;
      }
      close(sanitizeName(input.value));
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && confirm());
    input.addEventListener('input', () => error.setAlpha(0));

    if (required) {
      add(pillButton(scene, cx, cy + 188, w - 96, 96, 'Começar a jogar', 34, CTA, true, confirm));
    } else {
      add(
        pillButton(scene, cx - 140, cy + 188, 250, 90, 'Cancelar', 30, GLASS_PILL, false, () =>
          close(null),
        ),
      );
      add(pillButton(scene, cx + 140, cy + 188, 250, 90, 'Salvar', 30, CTA, true, confirm));
    }
    setTimeout(() => input.focus(), 50);
  });
}
