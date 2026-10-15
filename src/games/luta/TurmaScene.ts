import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { KIDS, kidKey } from '@/games/bomba/art';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { KidFighterView } from './kidView';
import { GROUND_Y, LutaScene, type FightSetup, type FightView, type LutaData } from './LutaScene';
import { kidStats, POWERS, turmaRival } from './turma';

/**
 * "Turma da Luta": the cartoon kids fight each other, each with a power of their own.
 * Same rules and flow as "Luta de Rua"; only the cast, the stage and the powers change.
 */
export class TurmaScene extends LutaScene {
  private kid: number | null = null;
  private rivalKid = 0;

  constructor() {
    super(SceneKeys.Turma);
  }

  override init(data: LutaData): void {
    this.gameId = 'turma';
    this.sceneKey = SceneKeys.Turma;
    this.kid = data.kid ?? null;
    super.init(data);
  }

  private get me(): number {
    return this.kid ?? 0;
  }

  protected override setupFight(): FightSetup {
    const rival = turmaRival(this.level, this.me);
    this.rivalKid = rival.kid;
    return {
      names: [KIDS[this.me]!.name, KIDS[rival.kid]!.name],
      player: kidStats(this.me),
      rival: rival.stats,
    };
  }

  protected override makeViews(): [FightView, FightView] {
    return [
      new KidFighterView(this, KIDS[this.me]!, GROUND_Y),
      new KidFighterView(this, KIDS[this.rivalKid]!, GROUND_Y),
    ];
  }

  protected override powerLabel(): string {
    return POWERS[this.me]!.name.toUpperCase();
  }

  protected override powerName(owner: 0 | 1): string {
    return POWERS[owner === 0 ? this.me : this.rivalKid]!.name;
  }

  protected override helpText(): string {
    const p = POWERS[this.me]!;
    return `Segure para trás para defender\nSeu poder: ${p.name}\n${p.hint}`;
  }

  protected override carryData(): LutaData {
    return { kid: this.me };
  }

  /** A sunny playground: sky, clouds, a painted school wall, a tree and grass. */
  protected override drawStage(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(0x5ec8ff, 0x5ec8ff, 0xc9f0ff, 0xc9f0ff, 1).fillRect(
      0,
      0,
      GAME_WIDTH,
      GROUND_Y,
    );
    g.fillStyle(0xfff3b0).fillCircle(600, 300, 50);
    for (const [x, y, s] of [
      [150, 320, 1],
      [420, 270, 0.8],
      [640, 420, 0.7],
    ] as const) {
      g.fillStyle(0xffffff, 0.95)
        .fillCircle(x, y, 30 * s)
        .fillCircle(x + 35 * s, y - 12 * s, 38 * s)
        .fillCircle(x + 75 * s, y, 28 * s)
        .fillRect(x, y, 75 * s, 28 * s);
    }
    // School wall with colorful stripes and windows.
    g.fillStyle(0xffd6a5).fillRect(0, GROUND_Y - 260, GAME_WIDTH, 260);
    const stripes = [0xff6b6b, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xc77dff];
    stripes.forEach((c, i) => g.fillStyle(c).fillRect(0, GROUND_Y - 260 + i * 10, GAME_WIDTH, 10));
    for (let x = 40; x < GAME_WIDTH; x += 170) {
      g.fillStyle(0x2b4a6f).fillRoundedRect(x, GROUND_Y - 190, 100, 80, 10);
      g.fillStyle(0x9bd0ff).fillRoundedRect(x + 6, GROUND_Y - 184, 88, 68, 8);
      g.fillStyle(0x2b4a6f).fillRect(x + 48, GROUND_Y - 184, 4, 68);
    }
    // Tree.
    g.fillStyle(0x7f5539).fillRect(620, GROUND_Y - 220, 26, 220);
    g.fillStyle(0x2ecc71)
      .fillCircle(633, GROUND_Y - 250, 70)
      .fillCircle(590, GROUND_Y - 220, 46)
      .fillCircle(675, GROUND_Y - 215, 46);
    // Grass and a sandy ring.
    g.fillStyle(0x6cc551).fillRect(0, GROUND_Y, GAME_WIDTH, 1280 - GROUND_Y);
    g.fillStyle(0x4e9f3a).fillRect(0, GROUND_Y + 70, GAME_WIDTH, 1280 - GROUND_Y);
    g.fillStyle(0xf2d492).fillEllipse(GAME_WIDTH / 2, GROUND_Y + 14, 640, 44);
  }

  protected override intro(): void {
    if (this.kid === null) {
      this.chooseKid();
      return;
    }
    super.intro();
  }

  private chooseKid(): void {
    const layer: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      layer.push(o);
      return o;
    };
    add(
      this.add
        .rectangle(0, 0, GAME_WIDTH, 1280, 0x1d2b53, 0.88)
        .setOrigin(0)
        .setDepth(60)
        .setInteractive(),
    );
    add(
      addText(this, GAME_WIDTH / 2, 150, 'Escolha seu lutador', 46, {
        color: '#ffd23f',
        stroke: '#1d2b53',
        strokeThickness: 10,
      }).setDepth(61),
    );
    KIDS.forEach((kid, i) => {
      const row = Math.floor(i / 3);
      const perRow = row < 2 ? 3 : 1;
      const col = i % 3;
      const x = GAME_WIDTH / 2 + (col - (perRow - 1) / 2) * 220;
      const y = 360 + row * 300;
      const card = add(this.add.graphics().setDepth(61));
      card.fillStyle(0xffffff).fillRoundedRect(x - 100, y - 125, 200, 270, 24);
      const img = add(
        this.add
          .image(x, y - 30, kidKey(i, 0))
          .setScale(1.25)
          .setDepth(62),
      );
      this.tweens.add({
        targets: img,
        y: y - 38,
        duration: 500 + i * 70,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      add(addText(this, x, y + 70, kid.name, 30, { color: COLORS.text }).setDepth(62));
      add(
        addText(this, x, y + 108, `⚡ ${POWERS[i]!.name}`, 22, { color: '#7209b7' }).setDepth(62),
      );
      const zone = add(
        this.add.zone(x, y, 200, 270).setInteractive({ useHandCursor: true }).setDepth(63),
      );
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        getServices(this).sfx.play('pop');
        for (const o of layer) o.destroy();
        this.scene.restart({ kid: i } satisfies LutaData);
      });
    });
  }
}
