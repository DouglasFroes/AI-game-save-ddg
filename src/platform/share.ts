import type Phaser from 'phaser';
import { GAME_WIDTH } from '@/config';
import { HUB_FONT } from '@/platform/fonts';
import { formatShareMessage, gameLink } from '@/platform/shareLink';
import { UI } from '@/platform/ui/hubTheme';
import { addText } from '@/platform/ui/widgets';

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Native share sheet when the browser has one (phones), otherwise copies the message + link.
 * Combines `text` and `url` into a single `text` payload so WhatsApp and OS share sheets never
 * strip the score/challenge message while still generating the link preview.
 */
export async function shareGame(id: string, title: string, text: string): Promise<ShareResult> {
  const url = gameLink(id);
  const fullText = formatShareMessage(text, url);
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title, text: fullText });
      return 'shared';
    }
    await navigator.clipboard.writeText(fullText);
    return 'copied';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    try {
      await navigator.clipboard.writeText(fullText);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
}

const MESSAGES: Record<ShareResult, string> = {
  shared: '',
  cancelled: '',
  copied: 'Link copiado! Cole para o seu amigo 🔗',
  failed: 'Não deu para compartilhar',
};

/** Shares a game and shows a short confirmation on the scene when there is something to say. */
export async function shareWithToast(
  scene: Phaser.Scene,
  id: string,
  title: string,
  text: string,
): Promise<void> {
  const result = await shareGame(id, title, text);
  const message = MESSAGES[result];
  if (!message || !scene.sys.isActive()) return;
  const label = addText(scene, 0, 0, message, 24, {
    color: UI.white,
    family: HUB_FONT,
  });
  const w = Math.min(660, label.width + 64);
  const h = label.height + 36;
  const pill = scene.add.container(GAME_WIDTH / 2, 1180).setDepth(1100);
  const bg = scene.add.graphics();
  bg.fillStyle(0x0c0e22, 0.96).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  bg.lineStyle(2, UI.cyan, 0.75).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  pill.add([bg, label]);
  pill.setAlpha(0).setY(1204);
  scene.tweens.add({ targets: pill, alpha: 1, y: 1180, duration: 240, ease: 'Back.easeOut' });
  scene.time.delayedCall(2200, () => {
    if (!pill.active) return;
    scene.tweens.add({
      targets: pill,
      alpha: 0,
      y: 1200,
      duration: 200,
      onComplete: () => pill.destroy(),
    });
  });
}
