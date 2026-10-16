import type Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '@/config';
import { gameLink } from '@/platform/shareLink';
import { addText } from '@/platform/ui/widgets';

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Native share sheet when the browser has one (phones), otherwise copies the message + link. */
export async function shareGame(id: string, title: string, text: string): Promise<ShareResult> {
  const url = gameLink(id);
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title, text, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
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
  const toast = addText(scene, GAME_WIDTH / 2, 1180, message, 28, {
    color: COLORS.textLight,
    stroke: '#1d2b53',
    strokeThickness: 7,
  }).setDepth(1000);
  scene.time.delayedCall(2200, () => toast.destroy());
}
