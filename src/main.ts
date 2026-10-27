import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { isAdminRoute, mountAdminDashboard } from '@/platform/adminDashboard';
import { fullscreenOnFirstTap } from '@/platform/fullscreen';
import { BootScene } from '@/platform/scenes/BootScene';
import { GameOverScene } from '@/platform/scenes/GameOverScene';
import { HallScene } from '@/platform/scenes/HallScene';
import { HubScene } from '@/platform/scenes/HubScene';
import { LeaderboardScene } from '@/platform/scenes/LeaderboardScene';
import { bindConnectivityNotices } from '@/platform/connectivityNotices';
import { publishNotice } from '@/platform/notices';
import { registerServiceWorker } from '@/platform/pwa/register';
import { bindBrowserLifecycle } from '@/platform/sessionTracker';
import { bindConnectivitySync } from '@/platform/sync';
import { createServices, provideServices } from '@/services';

registerServiceWorker();

const services = createServices();

if (isAdminRoute()) {
  void mountAdminDashboard(services.telemetry);
} else {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    // Transparent so Grau 3D's Three.js canvas shows through; the page behind is the same navy.
    transparent: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    dom: { createContainer: true },
    disableContextMenu: true,
    render: { antialias: true },
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

  fullscreenOnFirstTap();

  // Audio may only start after a user gesture.
  window.addEventListener('pointerdown', () => services.sfx.unlock(), { passive: true });

  if (import.meta.env.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game;
}
