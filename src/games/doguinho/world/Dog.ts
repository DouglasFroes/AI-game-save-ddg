import type Phaser from 'phaser';
import { BodyLabel, DOG_BODY } from '../config';
import { Tex, type Mood } from '../art';

/** The dog: a physics body plus a sprite that follows it (so visual tweens never touch physics). */
export class Dog {
  readonly body: MatterJS.BodyType;
  readonly sprite: Phaser.GameObjects.Image;
  private mood: Mood = 'idle';
  private readonly breathe: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.body = scene.matter.add.rectangle(x, y, DOG_BODY.width, DOG_BODY.height, {
      label: BodyLabel.dog,
      chamfer: { radius: 24 },
      density: 0.012,
      friction: 0.9,
      frictionStatic: 1,
      restitution: 0,
    });
    this.sprite = scene.add.image(x, y - 6, Tex.dog('idle')).setDepth(4);
    this.breathe = scene.tweens.add({
      targets: this.sprite,
      scaleY: 1.04,
      scaleX: 0.98,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  get position(): { x: number; y: number } {
    return this.body.position;
  }

  setMood(mood: Mood): void {
    if (this.mood === mood) return;
    this.mood = mood;
    this.sprite.setTexture(Tex.dog(mood));
    if (mood === 'hurt') this.breathe.pause();
  }

  sync(): void {
    const { position, angle } = this.body;
    this.sprite.setPosition(position.x, position.y - 6).setRotation(angle);
  }
}
