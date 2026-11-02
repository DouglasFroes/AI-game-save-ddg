import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { fullscreenOnFirstTap } from '@/platform/fullscreen';
import { BootScene } from '@/platform/scenes/BootScene';
import { GameOverScene } from '@/platform/scenes/GameOverScene';
import { HallScene } from '@/platform/scenes/HallScene';
import { HubScene } from '@/platform/scenes/HubScene';
import { LeaderboardScene } from '@/platform/scenes/LeaderboardScene';
import { bindConnectivityNotices } from '@/platform/connectivityNotices';
import { publishNotice } from '@/platform/notices';
import { installPrompt } from '@/platform/pwa/installPrompt';
import { registerServiceWorker } from '@/platform/pwa/register';
import { bindBrowserLifecycle } from '@/platform/sessionTracker';
import { isLite } from '@/platform/perf';
import { bindConnectivitySync } from '@/platform/sync';
import { createServices, provideServices } from '@/services';

registerServiceWorker();

const services = createServices();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  // Transparent so Grau 3D's Three.js canvas shows through; the page behind is the same navy.
  transparent: true,
  scale: {
    mode: Phaser.Scale.FIT,
    // #game is already the game's height and pinned to the bottom (index.html): centre across only.
    autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
  },
  dom: { createContainer: true },
  disableContextMenu: true,
  // Texture smoothing stays on; only the canvas MSAA (costly on weak GPUs) goes in lite mode.
  render: { antialias: true, antialiasGL: !isLite() },
  // Each game's scenes are added on demand by platform/gameLoader.ts.
  scene: [BootScene, HubScene, LeaderboardScene, GameOverScene, HallScene],
});

provideServices(game, services);
bindBrowserLifecycle(services.sessionTracker);
// Runs played offline are already saved on the device; send them once the connection is back.
bindConnectivitySync(services, window, document, (scores) =>
  publishNotice({
    key: 'synced',
    kind: 'success',
    glyph: 'check',
    title: 'Recordes sincronizados',
    body:
      scores === 1
        ? 'O recorde que você fez offline já está no ranking global.'
        : `${scores} recordes feitos offline já estão no ranking global.`,
  }),
);
bindConnectivityNotices();
// Presence heartbeats and the unread badge (only for signed-in players).
services.chat.start();

fullscreenOnFirstTap(() => installPrompt.state() === 'prompt');

// Audio may only start after a user gesture.
window.addEventListener('pointerdown', () => services.sfx.unlock(), { passive: true });

if (import.meta.env.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game;
