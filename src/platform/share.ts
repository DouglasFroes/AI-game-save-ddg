import type Phaser from 'phaser';
import { formatShareMessage, gameLink } from '@/platform/shareLink';
import { showNotice } from '@/platform/ui/noticeCard';

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
  showNotice(scene, {
    key: 'share',
    kind: result === 'failed' ? 'warn' : 'success',
    glyph: 'share',
    title: message,
  });
}
