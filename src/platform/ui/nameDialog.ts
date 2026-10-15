import type Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { MAX_NAME_LENGTH, sanitizeName } from '@/platform/leaderboard';
import { addText, Button, panel } from './widgets';

/** Modal asking for the player's nickname. Resolves with the sanitized name, or null if cancelled. */
export function askName(scene: Phaser.Scene, current: string): Promise<string | null> {
  return new Promise((resolve) => {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 - 160;
    const objects: Phaser.GameObjects.GameObject[] = [];
    const depth = 1000;

    objects.push(
      scene.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b1430, 0.6)
        .setOrigin(0)
        .setInteractive()
        .setDepth(depth),
    );
    objects.push(panel(scene, cx, cy, 600, 420).setDepth(depth));
    objects.push(addText(scene, cx, cy - 140, 'Seu nome no ranking', 40).setDepth(depth));

    const input = document.createElement('input');
    input.className = 'name-input';
    input.maxLength = MAX_NAME_LENGTH;
    input.placeholder = 'Apelido';
    input.value = current;
    input.enterKeyHint = 'done';
    input.setAttribute('autocomplete', 'nickname');
    objects.push(scene.add.dom(cx, cy - 40, input).setDepth(depth));

    const close = (value: string | null) => {
      input.blur();
      objects.forEach((o) => o.destroy());
      resolve(value);
    };
    const confirm = () => {
      if (!input.value.trim()) {
        input.focus();
        return;
      }
      close(sanitizeName(input.value));
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && confirm());

    objects.push(
      new Button(scene, cx - 135, cy + 110, 'Cancelar', () => close(null), {
        width: 240,
        height: 92,
        fontSize: 34,
        color: COLORS.locked,
        shade: 0x8e97a5,
      }).setDepth(depth),
    );
    objects.push(
      new Button(scene, cx + 135, cy + 110, 'Salvar', confirm, {
        width: 240,
        height: 92,
        fontSize: 34,
        color: COLORS.success,
        shade: COLORS.successDark,
      }).setDepth(depth),
    );
    setTimeout(() => input.focus(), 50);
  });
}
