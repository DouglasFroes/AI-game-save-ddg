import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { formatNumber } from '@/platform/ranking';
import { generateFusaoTextures, FT, playerKey, skillIcon } from '../art';
import { audio } from '../audio';
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENTS,
  CHARACTER_IDS,
  CHARACTERS,
  FUSION_IDS,
  FUSIONS,
  META_IDS,
  META_UPGRADES,
  MODIFIER_IDS,
  MODIFIERS,
  SKILL_IDS,
  SKILLS,
  type CharacterId,
  type ModifierId,
} from '../core/defs';
import {
  buyCharacter,
  buyUpgrade,
  dailyChallenge,
  dateKey,
  defaultSave,
  modifiersUnlocked,
} from '../core/meta';
import { hashSeed } from '../core/rng';
import { clearRecoveredFlag, getSave, recoveredFromCorruption, setSave } from '../state';
import { clock, css, neonButton, neonPanel, txt, UI } from '../ui';
import type { RunData } from './RunScene';

type Page = 'home' | 'chars' | 'upgrades' | 'collection' | 'records' | 'daily' | 'settings';

let splashShown = false;

/** Main menu and its pages (characters, upgrades, collection, records, daily, settings). */
export class FusaoMenuScene extends Phaser.Scene {
  private page: Phaser.GameObjects.Container | null = null;
  private seedText = '';

  constructor() {
    super(SceneKeys.FusaoMenu);
  }

  create(): void {
    generateFusaoTextures(this);
    this.cameras.main.setBackgroundColor(UI.bg);
    const stars = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, FT.stars).setOrigin(0);
    this.tweens.add({ targets: stars, tilePositionY: -512, duration: 40000, repeat: -1 });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => audio.unlock());
    if (!splashShown) this.splash();
    else this.show('home');
  }

  /** Short boot animation the first time (textures are already generated). */
  private splash(): void {
    splashShown = true;
    const core = this.add
      .image(GAME_WIDTH / 2, 560, FT.logo)
      .setScale(0.1)
      .setAlpha(0);
    const label = txt(
      this,
      GAME_WIDTH / 2,
      760,
      'Inicializando núcleo de energia…',
      26,
      UI.muted,
      'normal',
    );
    this.tweens.add({
      targets: core,
      scale: 1.4,
      alpha: 1,
      angle: 360,
      duration: 1100,
      ease: 'Cubic.easeOut',
    });
    this.time.delayedCall(1300, () => {
      this.tweens.add({
        targets: [core, label],
        alpha: 0,
        duration: 250,
        onComplete: () => {
          core.destroy();
          label.destroy();
          this.show('home');
        },
      });
    });
  }

  private show(page: Page): void {
    this.page?.destroy();
    const c = this.add.container(0, 0);
    this.page = c;
    const pages: Record<Page, () => void> = {
      home: () => this.home(c),
      chars: () => this.chars(c),
      upgrades: () => this.upgrades(c),
      collection: () => this.collection(c),
      records: () => this.records(c),
      daily: () => this.daily(c),
      settings: () => this.settings(c),
    };
    pages[page]();
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
  }

  private header(c: Phaser.GameObjects.Container, title: string): void {
    c.add(txt(this, GAME_WIDTH / 2, 90, title, 48, '#ffffff'));
    c.add(
      txt(
        this,
        GAME_WIDTH - 40,
        40,
        `${formatNumber(getSave().essence)} Essência`,
        24,
        UI.gold,
      ).setOrigin(1, 0.5),
    );
    c.add(neonButton(this, 90, 1210, 140, 70, '‹ Voltar', () => this.show('home'), UI.accent, 26));
  }

  private play(run: RunData): void {
    this.scene.start(SceneKeys.FusaoRun, run);
  }

  // ── Home ───────────────────────────────────────────────────────────────

  private home(c: Phaser.GameObjects.Container): void {
    const save = getSave();
    const cx = GAME_WIDTH / 2;
    const core = this.add.image(cx, 250, FT.logo).setScale(1.2);
    this.tweens.add({ targets: core, angle: 360, duration: 12000, repeat: -1 });
    const glow = this.add
      .image(cx, 250, FT.glow)
      .setScale(3)
      .setTint(0xff3df2)
      .setAlpha(0.35)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: glow,
      alpha: 0.6,
      scale: 3.4,
      duration: 1400,
      yoyo: true,
      repeat: -1,
    });
    c.add([glow, core]);
    const t1 = txt(this, cx, 420, 'FUSÃO', 92, '#ffffff');
    t1.setShadow(0, 0, '#4cc9f0', 24, true, true);
    const t2 = txt(this, cx, 505, 'INFINITA', 64, '#ff3df2');
    t2.setShadow(0, 0, '#ff3df2', 24, true, true);
    c.add([t1, t2]);
    c.add(
      txt(
        this,
        cx,
        565,
        `${CHARACTERS[save.selected].name} · ${formatNumber(save.essence)} Essência`,
        24,
        UI.muted,
        'normal',
      ),
    );

    const modifiers = this.activeModifiers();
    const play = neonButton(
      this,
      cx,
      680,
      520,
      120,
      'JOGAR',
      () =>
        this.play({
          character: save.selected,
          modifiers,
          seed: this.seedText ? hashSeed(this.seedText) : undefined,
        }),
      0xff3df2,
      56,
    );
    this.tweens.add({ targets: play, scale: 1.04, duration: 700, yoyo: true, repeat: -1 });
    c.add(play);
    const w = 300;
    const items: [string, Page, number][] = [
      ['Personagens', 'chars', 0x4cc9f0],
      ['Melhorias', 'upgrades', 0xc77dff],
      ['Coleção', 'collection', 0x06d6a0],
      ['Conquistas', 'records', 0xffd23f],
      ['Desafio diário', 'daily', 0xff7b00],
      ['Configurações', 'settings', 0x9aa5b8],
    ];
    items.forEach(([label, page, color], i) => {
      const x = cx + (i % 2 ? w / 2 + 10 : -w / 2 - 10);
      const y = 820 + Math.floor(i / 2) * 105;
      c.add(neonButton(this, x, y, w, 88, label, () => this.show(page), color, 28));
    });
    c.add(
      neonButton(
        this,
        cx,
        1160,
        360,
        70,
        '‹ Fliperama',
        () => this.scene.start(SceneKeys.Hub),
        0x5a6290,
        26,
      ),
    );
    if (recoveredFromCorruption) {
      c.add(
        txt(
          this,
          cx,
          1240,
          'O progresso salvo estava corrompido e foi reiniciado.',
          20,
          '#ff8fa3',
          'normal',
        ),
      );
      clearRecoveredFlag();
    }
  }

  private activeModifiers(): ModifierId[] {
    const save = getSave();
    return modifiersUnlocked(save) ? save.modifiers : [];
  }

  // ── Characters ─────────────────────────────────────────────────────────

  private chars(c: Phaser.GameObjects.Container): void {
    this.header(c, 'Personagens');
    const save = getSave();
    CHARACTER_IDS.forEach((id: CharacterId, i) => {
      const d = CHARACTERS[id];
      const y = 290 + i * 300;
      const owned = save.characters[id];
      const selected = save.selected === id;
      c.add(neonPanel(this, GAME_WIDTH / 2, y, 640, 270, selected ? d.color : UI.line));
      c.add(
        this.add
          .image(110, y - 40, playerKey(id))
          .setScale(1.5)
          .setAlpha(owned ? 1 : 0.35),
      );
      c.add(txt(this, 200, y - 95, d.name, 36, css(d.color)).setOrigin(0, 0.5));
      c.add(txt(this, 200, y - 55, d.title, 22, UI.muted, 'normal').setOrigin(0, 0.5));
      c.add(
        txt(
          this,
          200,
          y - 15,
          `Vida ${d.maxHp} · Veloc. ${d.speed} · Dano ${Math.round(d.might * 100)}%${d.armor ? ` · Armadura ${d.armor}` : ''}`,
          20,
          UI.text,
          'normal',
        ).setOrigin(0, 0.5),
      );
      c.add(
        txt(
          this,
          200,
          y + 20,
          `Começa com: ${SKILLS[d.start].name}`,
          20,
          UI.text,
          'normal',
        ).setOrigin(0, 0.5),
      );
      c.add(txt(this, 200, y + 52, d.perk, 20, UI.gold, 'normal').setOrigin(0, 0.5));
      if (owned) {
        c.add(
          neonButton(
            this,
            GAME_WIDTH / 2 + 180,
            y + 100,
            220,
            56,
            selected ? 'Selecionado' : 'Selecionar',
            () => {
              setSave({ ...getSave(), selected: id });
              this.show('chars');
            },
            d.color,
            24,
          ),
        );
      } else if (d.unlock) {
        c.add(
          txt(this, 200, y + 100, `Bloqueado: ${d.unlock.text}`, 20, '#ff8fa3', 'normal').setOrigin(
            0,
            0.5,
          ),
        );
        const buy = neonButton(
          this,
          GAME_WIDTH / 2 + 220,
          y + 100,
          170,
          56,
          `${d.unlock.price}`,
          () => {
            const next = buyCharacter(getSave(), id);
            if (next) {
              setSave(next);
              audio.play('levelup');
              this.show('chars');
            }
          },
          0xffd23f,
          24,
        );
        buy.setEnabled(save.essence >= d.unlock.price);
        c.add(buy);
      }
    });
  }

  // ── Permanent upgrades and modifiers ───────────────────────────────────

  private upgrades(c: Phaser.GameObjects.Container): void {
    this.header(c, 'Melhorias');
    const save = getSave();
    META_IDS.forEach((id, i) => {
      const d = META_UPGRADES[id];
      const level = save.upgrades[id];
      const y = 220 + i * 128;
      c.add(neonPanel(this, GAME_WIDTH / 2, y, 640, 112, UI.line));
      c.add(txt(this, 60, y - 24, d.name, 30, '#ffffff').setOrigin(0, 0.5));
      c.add(txt(this, 60, y + 18, d.desc, 20, UI.muted, 'normal').setOrigin(0, 0.5));
      const pips = this.add.graphics();
      for (let l = 0; l < d.maxLevel; l++)
        pips
          .fillStyle(l < level ? 0xc77dff : 0x2a3070)
          .fillRoundedRect(330 + l * 30, y - 34, 22, 14, 4);
      c.add(pips);
      if (level < d.maxLevel) {
        const cost = d.cost(level);
        const b = neonButton(
          this,
          GAME_WIDTH - 110,
          y + 8,
          150,
          60,
          `${cost}`,
          () => {
            const next = buyUpgrade(getSave(), id);
            if (next) {
              setSave(next);
              audio.play('choose');
              this.show('upgrades');
            }
          },
          0xffd23f,
          26,
        );
        b.setEnabled(save.essence >= cost);
        c.add(b);
      } else c.add(txt(this, GAME_WIDTH - 110, y + 8, 'MÁX', 26, '#c77dff'));
    });

    // Optional difficulty modifiers (more essence) once unlocked.
    const y0 = 880;
    c.add(txt(this, GAME_WIDTH / 2, y0, 'Modificadores de dificuldade', 28, '#ffffff'));
    if (!modifiersUnlocked(save)) {
      c.add(
        txt(
          this,
          GAME_WIDTH / 2,
          y0 + 50,
          'Derrote a Tecelã do Vazio para desbloquear',
          22,
          UI.muted,
          'normal',
        ),
      );
    } else {
      MODIFIER_IDS.forEach((id, i) => {
        const on = save.modifiers.includes(id);
        const m = MODIFIERS[id];
        c.add(
          neonButton(
            this,
            140 + i * 220,
            y0 + 80,
            200,
            90,
            `${m.name}${on ? ' ✓' : ''}`,
            () => {
              const s = getSave();
              const mods = on ? s.modifiers.filter((x) => x !== id) : [...s.modifiers, id];
              setSave({ ...s, modifiers: mods });
              this.show('upgrades');
            },
            on ? 0xff4d6d : 0x5a6290,
            24,
          ),
        );
        c.add(
          txt(
            this,
            140 + i * 220,
            y0 + 150,
            `${m.desc}\n+${Math.round(m.essence * 100)}% Essência`,
            18,
            UI.muted,
            'normal',
          ),
        );
      });
    }
    // Optional seed to replay a run.
    const seed = neonButton(
      this,
      GAME_WIDTH / 2 + 120,
      1210,
      360,
      70,
      this.seedText ? `Semente: ${this.seedText}` : 'Semente: aleatória',
      () => {
        const v = window.prompt('Semente (deixe vazio para aleatória):', this.seedText);
        if (v === null) return;
        this.seedText = v.trim().slice(0, 24);
        this.show('upgrades');
      },
      0x9aa5b8,
      22,
    );
    c.add(seed);
  }

  // ── Collection ─────────────────────────────────────────────────────────

  private collection(c: Phaser.GameObjects.Container): void {
    this.header(c, 'Coleção');
    const save = getSave();
    c.add(
      txt(
        this,
        GAME_WIDTH / 2,
        160,
        `Habilidades (${save.skillsSeen.length}/${SKILL_IDS.length})`,
        26,
        UI.muted,
      ),
    );
    SKILL_IDS.forEach((id, i) => {
      const x = 90 + (i % 5) * 135;
      const y = 240 + Math.floor(i / 5) * 140;
      const seen = save.skillsSeen.includes(id);
      c.add(
        this.add
          .image(x, y, skillIcon(id))
          .setScale(1.3)
          .setAlpha(seen ? 1 : 0.25),
      );
      c.add(
        txt(
          this,
          x,
          y + 58,
          seen ? SKILLS[id].name : '???',
          16,
          seen ? UI.text : UI.muted,
          'normal',
        ).setWordWrapWidth(130),
      );
    });
    c.add(
      txt(
        this,
        GAME_WIDTH / 2,
        545,
        `Fusões (${save.fusions.length}/${FUSION_IDS.length})`,
        26,
        UI.muted,
      ),
    );
    FUSION_IDS.forEach((id, i) => {
      const f = FUSIONS[id];
      const y = 610 + i * 92;
      const found = save.fusions.includes(id);
      c.add(
        this.add
          .image(80, y, skillIcon(id))
          .setScale(1.1)
          .setAlpha(found ? 1 : 0.25),
      );
      const name = found ? f.name : f.secret ? '??? (fusão secreta)' : '???';
      const recipe =
        found || !f.secret
          ? `${SKILLS[f.requires[0]].name} + ${SKILLS[f.requires[1]].name} (nível 4)`
          : 'Experimente combinações…';
      c.add(txt(this, 135, y - 16, name, 24, found ? css(f.color) : UI.muted).setOrigin(0, 0.5));
      c.add(txt(this, 135, y + 16, recipe, 18, UI.muted, 'normal').setOrigin(0, 0.5));
    });
  }

  // ── Achievements and stats ─────────────────────────────────────────────

  private records(c: Phaser.GameObjects.Container): void {
    this.header(c, 'Conquistas');
    const save = getSave();
    ACHIEVEMENT_IDS.forEach((id, i) => {
      const a = ACHIEVEMENTS[id];
      const got = save.achievements.includes(id);
      const y = 170 + i * 58;
      c.add(txt(this, 50, y, got ? '◆' : '◇', 26, got ? UI.gold : UI.muted).setOrigin(0, 0.5));
      c.add(txt(this, 90, y - 10, a.name, 22, got ? '#ffffff' : UI.muted).setOrigin(0, 0.5));
      c.add(txt(this, 90, y + 14, a.desc, 17, UI.muted, 'normal').setOrigin(0, 0.5));
    });
    const st = save.stats;
    const lines = [
      `Partidas: ${st.runs} · Vitórias: ${st.victories}`,
      `Inimigos derrotados: ${formatNumber(st.kills)} · Chefes: ${st.bosses}`,
      `Tempo total: ${clock(st.seconds)} · Melhor: ${clock(st.bestSeconds)}`,
      `Maior nível: ${st.bestLevel} · Recorde: ${formatNumber(st.bestScore)}`,
      `Essência obtida: ${formatNumber(st.essenceEarned)}`,
    ];
    lines.forEach((l, i) =>
      c.add(txt(this, GAME_WIDTH / 2, 950 + i * 38, l, 21, UI.text, 'normal')),
    );
  }

  // ── Daily challenge ────────────────────────────────────────────────────

  private daily(c: Phaser.GameObjects.Container): void {
    this.header(c, 'Desafio diário');
    const today = dateKey(new Date());
    const ch = dailyChallenge(today);
    const save = getSave();
    const done = save.daily.date === today && save.daily.done;
    c.add(neonPanel(this, GAME_WIDTH / 2, 480, 600, 460, 0xff7b00));
    c.add(txt(this, GAME_WIDTH / 2, 300, today.split('-').reverse().join('/'), 30, UI.muted));
    c.add(this.add.image(GAME_WIDTH / 2, 410, playerKey(ch.character)).setScale(1.8));
    c.add(
      txt(
        this,
        GAME_WIDTH / 2,
        510,
        CHARACTERS[ch.character].name,
        38,
        css(CHARACTERS[ch.character].color),
      ),
    );
    c.add(
      txt(
        this,
        GAME_WIDTH / 2,
        565,
        `Modificador: ${MODIFIERS[ch.modifier].name} (${MODIFIERS[ch.modifier].desc})`,
        22,
        UI.text,
        'normal',
      ),
    );
    c.add(
      txt(this, GAME_WIDTH / 2, 620, 'Mesma semente para todo mundo hoje', 20, UI.muted, 'normal'),
    );
    c.add(
      txt(
        this,
        GAME_WIDTH / 2,
        665,
        done
          ? 'Concluído hoje ✓ (pode jogar de novo, sem bônus)'
          : 'Bônus de +50% de Essência na primeira vez',
        22,
        done ? '#5bd46f' : UI.gold,
        'normal',
      ),
    );
    c.add(
      neonButton(
        this,
        GAME_WIDTH / 2,
        800,
        440,
        100,
        'Jogar desafio',
        () =>
          this.play({
            character: ch.character,
            seed: ch.seed,
            daily: true,
            modifiers: [ch.modifier],
          }),
        0xff7b00,
        36,
      ),
    );
  }

  // ── Settings ───────────────────────────────────────────────────────────

  private settings(c: Phaser.GameObjects.Container): void {
    this.header(c, 'Configurações');
    const s = () => getSave().settings;
    const update = (patch: Partial<ReturnType<typeof s>>) => {
      setSave({ ...getSave(), settings: { ...s(), ...patch } });
      this.show('settings');
    };
    c.add(txt(this, GAME_WIDTH / 2, 230, `Volume: ${Math.round(s().volume * 100)}%`, 32));
    c.add(
      neonButton(
        this,
        GAME_WIDTH / 2 - 200,
        230,
        100,
        76,
        '−',
        () => update({ volume: Math.max(0, Math.round((s().volume - 0.1) * 10) / 10) }),
        UI.accent,
        40,
      ),
    );
    c.add(
      neonButton(
        this,
        GAME_WIDTH / 2 + 200,
        230,
        100,
        76,
        '+',
        () => update({ volume: Math.min(1, Math.round((s().volume + 0.1) * 10) / 10) }),
        UI.accent,
        40,
      ),
    );
    c.add(
      neonButton(
        this,
        GAME_WIDTH / 2,
        360,
        520,
        84,
        `Efeitos intensos: ${s().intenseFx ? 'sim' : 'não'}`,
        () => update({ intenseFx: !s().intenseFx }),
        UI.accent,
        28,
      ),
    );
    c.add(
      neonButton(
        this,
        GAME_WIDTH / 2,
        470,
        520,
        84,
        `Tremor de tela: ${s().shake ? 'sim' : 'não'}`,
        () => update({ shake: !s().shake }),
        UI.accent,
        28,
      ),
    );
    const q = s().quality;
    const nextQ = q === 'alta' ? 'media' : q === 'media' ? 'baixa' : 'alta';
    c.add(
      neonButton(
        this,
        GAME_WIDTH / 2,
        580,
        520,
        84,
        `Qualidade: ${q === 'media' ? 'média' : q}`,
        () => update({ quality: nextQ }),
        UI.accent,
        28,
      ),
    );
    c.add(
      txt(
        this,
        GAME_WIDTH / 2,
        650,
        'Qualidade menor = menos inimigos e partículas na tela',
        20,
        UI.muted,
        'normal',
      ),
    );
    let confirm = 0;
    const reset = neonButton(
      this,
      GAME_WIDTH / 2,
      860,
      520,
      84,
      'Reiniciar todo o progresso',
      () => {
        confirm++;
        if (confirm === 1) reset.setLabel('Tem certeza? Toque de novo');
        else if (confirm === 2) reset.setLabel('Última chance: apaga TUDO');
        else {
          setSave({ ...defaultSave(), settings: s() });
          audio.play('defeat');
          this.show('home');
        }
      },
      0xff4d6d,
      26,
    );
    c.add(reset);
  }
}
