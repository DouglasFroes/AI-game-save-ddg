import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { generateTextures } from '@/game/art/textures';

/** Generates all procedural textures once, then opens the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  create(): void {
    generateTextures(this);
    this.scene.start(SceneKeys.Menu);
  }
}
