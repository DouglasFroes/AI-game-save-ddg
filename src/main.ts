import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { BootScene } from '@/game/scenes/BootScene';
import { GameScene } from '@/game/scenes/GameScene';
import { LevelSelectScene } from '@/game/scenes/LevelSelectScene';
import { MenuScene } from '@/game/scenes/MenuScene';
import { RankingScene } from '@/game/scenes/RankingScene';
import { ResultScene } from '@/game/scenes/ResultScene';
import { createServices, provideServices } from '@/services';

const services = createServices();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1d2b53',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  dom: { createContainer: true },
  disableContextMenu: true,
  render: { antialias: true },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1 },
      // Stepped manually with a fixed timestep in GameScene.
      autoUpdate: false,
      positionIterations: 10,
      velocityIterations: 8,
      debug: false,
    },
  },
  scene: [BootScene, MenuScene, LevelSelectScene, GameScene, ResultScene, RankingScene],
});

provideServices(game, services);

// Audio may only start after a user gesture.
window.addEventListener('pointerdown', () => services.sfx.unlock(), { passive: true });

if (import.meta.env.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game;
