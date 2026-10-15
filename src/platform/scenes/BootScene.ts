import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { generateBlockBlastTextures } from '@/games/blockblast/art';
import { generateFruitTextures } from '@/games/fruitmerge/FruitMergeScene';
import { generate2048Textures } from '@/games/game2048/Game2048Scene';
import { generateSnakeTextures } from '@/games/snake/SnakeScene';
import { generateStackTextures } from '@/games/stack/StackScene';
import { generateDoguinhoTextures } from '@/games/doguinho/art';
import { generateRoadFighterTextures } from '@/games/roadfighter/art';
import { generateSudokuTextures } from '@/games/sudoku/SudokuMenuScene';
import { generatePlatformTextures } from '@/platform/art/textures';

/** Generates all procedural textures once, then opens the hub. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  create(): void {
    generatePlatformTextures(this);
    generateDoguinhoTextures(this);
    generateBlockBlastTextures(this);
    generateSudokuTextures(this);
    generateRoadFighterTextures(this);
    generate2048Textures(this);
    generateSnakeTextures(this);
    generateStackTextures(this);
    generateFruitTextures(this);
    this.scene.start(SceneKeys.Hub);
  }
}
