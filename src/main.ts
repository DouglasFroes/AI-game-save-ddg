import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { fullscreenOnFirstTap } from '@/platform/fullscreen';
import { BootScene } from '@/platform/scenes/BootScene';
import { GameOverScene } from '@/platform/scenes/GameOverScene';
import { HubScene } from '@/platform/scenes/HubScene';
import { LeaderboardScene } from '@/platform/scenes/LeaderboardScene';
import { createServices, provideServices } from '@/services';

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
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  dom: { createContainer: true },
  disableContextMenu: true,
  render: { antialias: true },
  // Each game's scenes are added on demand by platform/gameLoader.ts.
  scene: [BootScene, HubScene, LeaderboardScene, GameOverScene],
});

provideServices(game, services);

fullscreenOnFirstTap();

// Audio may only start after a user gesture.
window.addEventListener('pointerdown', () => services.sfx.unlock(), { passive: true });

if (import.meta.env.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game;
