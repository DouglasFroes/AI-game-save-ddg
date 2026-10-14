import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { generateBlockBlastTextures } from '@/games/blockblast/art';
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
    this.scene.start(SceneKeys.Hub);
  }
}
