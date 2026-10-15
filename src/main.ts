import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { BlockBlastScene } from '@/games/blockblast/BlockBlastScene';
import { FlappyScene } from '@/games/flappy/FlappyScene';
import { FruitMergeScene } from '@/games/fruitmerge/FruitMergeScene';
import { Game2048Scene } from '@/games/game2048/Game2048Scene';
import { SnakeScene } from '@/games/snake/SnakeScene';
import { StackScene } from '@/games/stack/StackScene';
import { GameScene as DogGameScene } from '@/games/doguinho/scenes/GameScene';
import { LevelSelectScene as DogLevelsScene } from '@/games/doguinho/scenes/LevelSelectScene';
import { ResultScene as DogResultScene } from '@/games/doguinho/scenes/ResultScene';
import { RoadFighterScene } from '@/games/roadfighter/RoadFighterScene';
import { SudokuMenuScene } from '@/games/sudoku/SudokuMenuScene';
import { SudokuScene } from '@/games/sudoku/SudokuScene';
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
      // Stepped manually with a fixed timestep in the Doguinho GameScene.
      autoUpdate: false,
      positionIterations: 10,
      velocityIterations: 8,
      debug: false,
    },
  },
  scene: [
    BootScene,
    HubScene,
    LeaderboardScene,
    DogLevelsScene,
    DogGameScene,
    DogResultScene,
    BlockBlastScene,
    SudokuMenuScene,
    SudokuScene,
    RoadFighterScene,
    Game2048Scene,
    FlappyScene,
    SnakeScene,
    StackScene,
    FruitMergeScene,
    // Overlays last so they render on top.
    GameOverScene,
  ],
});

provideServices(game, services);

// Audio may only start after a user gesture.
window.addEventListener('pointerdown', () => services.sfx.unlock(), { passive: true });

if (import.meta.env.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game;
