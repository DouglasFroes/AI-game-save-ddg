import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { generateBlockBlastTextures } from '@/games/blockblast/art';
import { generateFruitTextures } from '@/games/fruitmerge/art';
import { generateGrauTextures } from '@/games/grau/art';
import { generateLutaTextures } from '@/games/luta/art';
import { generateBombaTextures } from '@/games/bomba/art';
import { generateCorreTextures } from '@/games/corre/art';
import { generateCrushTextures } from '@/games/crush/art';
import { generateAlvoTextures } from '@/games/alvo/art';
import { generateAtravessaTextures } from '@/games/atravessa/art';
import { generateLenhaTextures } from '@/games/lenha/art';
import { generatePianoTextures } from '@/games/piano/art';
import { generatePulaTextures } from '@/games/pula/art';
import { generateFusaoTextures } from '@/games/fusao/art';
import { generate2048Textures } from '@/games/game2048/art';
import { generateSnakeTextures } from '@/games/snake/art';
import { generateStackTextures } from '@/games/stack/art';
import { generateDoguinhoTextures } from '@/games/doguinho/art';
import { generateRoadFighterTextures } from '@/games/roadfighter/art';
import { generateSudokuTextures } from '@/games/sudoku/art';
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
    generateGrauTextures(this);
    generateLutaTextures(this);
    generateBombaTextures(this);
    generateCorreTextures(this);
    generateCrushTextures(this);
    generateLenhaTextures(this);
    generatePianoTextures(this);
    generateAlvoTextures(this);
    generatePulaTextures(this);
    generateAtravessaTextures(this);
    generateFusaoTextures(this);
    this.scene.start(SceneKeys.Hub);
  }
}
