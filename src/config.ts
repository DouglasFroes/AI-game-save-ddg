import type Phaser from 'phaser';

/** Logical resolution (9:16). Phaser scales it to fit any screen. */
export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

/**
 * Matter.js setup, enabled only by the scenes that need physics (Doguinho, Fruit Merge) so the
 * other scenes don't pay for an idle physics world. Both step it manually with a fixed timestep.
 */
export const MATTER_PHYSICS: Phaser.Types.Core.PhysicsConfig = {
  default: 'matter',
  matter: {
    gravity: { x: 0, y: 1 },
    autoUpdate: false,
    positionIterations: 10,
    velocityIterations: 8,
    debug: false,
  },
};

export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Shared palette used by the platform UI and the games. */
export const COLORS = {
  ink: 0x2b2d42,
  inkPreview: 0x3d405b,
  dirt: 0x9b6a43,
  dirtDark: 0x7a4f2e,
  grass: 0x6cc551,
  grassDark: 0x4e9f3a,
  spike: 0xc5ccd8,
  spikeDark: 0x7d8597,
  primary: 0xffb703,
  primaryDark: 0xd98c00,
  secondary: 0x4da3ff,
  secondaryDark: 0x2a7ad1,
  success: 0x5bd46f,
  successDark: 0x35a249,
  danger: 0xff5d5d,
  dangerDark: 0xc93c3c,
  panel: 0xffffff,
  locked: 0xb8c0cc,
  navy: 0x1d2b53,
  text: '#1d2b53',
  textMuted: '#5b6b8c',
  textLight: '#ffffff',
} as const;

export const SceneKeys = {
  Boot: 'Boot',
  Hub: 'Hub',
  Leaderboard: 'Leaderboard',
  GameOver: 'GameOver',
  DogLevels: 'DogLevels',
  DogGame: 'DogGame',
  DogResult: 'DogResult',
  BlockBlast: 'BlockBlast',
  SudokuMenu: 'SudokuMenu',
  Sudoku: 'Sudoku',
  RoadFighter: 'RoadFighter',
  Game2048: 'Game2048',
  FlappyBee: 'FlappyBee',
  Snake: 'Snake',
  Stack: 'Stack',
  FruitMerge: 'FruitMerge',
  Grau: 'Grau',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
