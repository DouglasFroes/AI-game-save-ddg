import type { BeeTuning, BlockDef, Direction, LevelDef, SpikesDef } from './types';

/*
 * World is 720×1280. The HUD covers y < 150, so keep hives and the dog below that.
 * The dog body is ~88×80: its center sits 40px above the surface it stands on.
 */

const FLOOR = 1050;

/** Block from edges (left, top, right, bottom). */
const rect = (l: number, t: number, r: number, b: number, angle = 0): BlockDef => ({
  type: 'block',
  x: (l + r) / 2,
  y: (t + b) / 2,
  w: r - l,
  h: b - t,
  angle,
});

const slab = (x: number, y: number, w: number, h: number, angle: number): BlockDef => ({
  type: 'block',
  x,
  y,
  w,
  h,
  angle,
});

const ground = (top = FLOOR): BlockDef => rect(-40, top, 760, 1320);

const spikes = (x: number, y: number, length: number, dir: Direction): SpikesDef => ({
  type: 'spikes',
  x,
  y,
  length,
  dir,
});

const bees = (speed = 6, agility = 0.08, interval = 230): BeeTuning => ({
  speed,
  agility,
  interval,
});

const EASY = { three: 0.4, two: 0.7 } as const;
const NORMAL = { three: 0.45, two: 0.75 } as const;
const TIGHT = { three: 0.6, two: 0.85 } as const;

export const LEVELS: readonly LevelDef[] = [
  {
    id: 1,
    name: 'Primeiros Passos',
    tip: 'Desenhe uma cúpula sobre o doguinho!',
    ink: 1100,
    stars: EASY,
    survive: 6,
    dog: { x: 360, y: FLOOR - 40 },
    hives: [{ x: 540, y: 330, bees: 6 }],
    bees: bees(5),
    terrain: [ground()],
  },
  {
    id: 2,
    name: 'Dos Dois Lados',
    tip: 'Elas atacam pela esquerda e pela direita.',
    ink: 1100,
    stars: EASY,
    survive: 7,
    dog: { x: 360, y: FLOOR - 40 },
    hives: [
      { x: 120, y: 330, bees: 5 },
      { x: 600, y: 330, bees: 5 },
    ],
    bees: bees(5.5),
    terrain: [ground()],
  },
  {
    id: 3,
    name: 'Buraquinho',
    tip: 'Uma tampa no buraco basta.',
    ink: 700,
    stars: NORMAL,
    survive: 7,
    dog: { x: 360, y: 1120 },
    hives: [{ x: 360, y: 300, bees: 8 }],
    bees: bees(6),
    terrain: [rect(-40, 1000, 250, 1320), rect(470, 1000, 760, 1320), rect(250, 1160, 470, 1320)],
  },
  {
    id: 4,
    name: 'Espinhos Amigos',
    tip: 'Abelhas que tocam nos espinhos… pop!',
    ink: 1000,
    stars: NORMAL,
    survive: 7,
    dog: { x: 170, y: FLOOR - 40 },
    hives: [{ x: 600, y: 320, bees: 10 }],
    bees: bees(6.5),
    terrain: [ground(), rect(-40, 600, 40, FLOOR), spikes(40, 825, 420, 'right')],
  },
  {
    id: 5,
    name: 'Degrau',
    tip: 'Apoie a linha no degrau.',
    ink: 900,
    stars: NORMAL,
    survive: 7,
    dog: { x: 340, y: FLOOR - 40 },
    hives: [{ x: 620, y: 300, bees: 10 }],
    bees: bees(6.5),
    terrain: [rect(-40, 860, 280, 1320), rect(280, FLOOR, 760, 1320)],
  },
  {
    id: 6,
    name: 'Vale',
    tip: 'O doguinho está no fundo do vale.',
    ink: 900,
    stars: NORMAL,
    survive: 8,
    dog: { x: 360, y: 1020 },
    hives: [
      { x: 140, y: 300, bees: 6 },
      { x: 580, y: 300, bees: 6 },
    ],
    bees: bees(6.5),
    terrain: [
      slab(180, 1120, 460, 200, 20),
      slab(540, 1120, 460, 200, -20),
      rect(-40, 1150, 760, 1320),
    ],
  },
  {
    id: 7,
    name: 'No Pilar',
    tip: 'Cuidado para não derrubar o doguinho nos espinhos!',
    ink: 1000,
    stars: NORMAL,
    survive: 8,
    dog: { x: 360, y: 920 },
    hives: [{ x: 150, y: 330, bees: 10 }],
    bees: bees(6.5),
    terrain: [
      rect(-40, 1180, 760, 1320),
      spikes(125, 1180, 250, 'up'),
      spikes(595, 1180, 250, 'up'),
      rect(250, 960, 470, 1320),
    ],
  },
  {
    id: 8,
    name: 'Enxame',
    tip: 'Três colmeias de uma vez!',
    ink: 1100,
    stars: NORMAL,
    survive: 8,
    dog: { x: 360, y: FLOOR - 40 },
    hives: [
      { x: 100, y: 320, bees: 6 },
      { x: 360, y: 240, bees: 6 },
      { x: 620, y: 320, bees: 6 },
    ],
    bees: bees(6.5),
    terrain: [ground()],
  },
  {
    id: 9,
    name: 'Corredor',
    tip: 'Pouca tinta: feche só a entrada.',
    ink: 520,
    stars: { three: 0.5, two: 0.8 },
    survive: 8,
    dog: { x: 360, y: FLOOR - 40 },
    hives: [{ x: 360, y: 260, bees: 12 }],
    bees: bees(7),
    terrain: [ground(), rect(170, 640, 250, FLOOR), rect(470, 640, 550, FLOOR)],
  },
  {
    id: 10,
    name: 'Teto Baixo',
    tip: 'As abelhas vêm pelo lado.',
    ink: 900,
    stars: NORMAL,
    survive: 8,
    dog: { x: 220, y: FLOOR - 40 },
    hives: [{ x: 640, y: 840, bees: 10 }],
    bees: bees(6.5),
    terrain: [ground(), rect(-40, 640, 560, 700)],
  },
  {
    id: 11,
    name: 'Ilha',
    tip: 'Lá embaixo só tem espinhos.',
    ink: 900,
    stars: NORMAL,
    survive: 8,
    dog: { x: 360, y: 840 },
    hives: [
      { x: 110, y: 330, bees: 6 },
      { x: 610, y: 330, bees: 6 },
    ],
    bees: bees(6.5),
    terrain: [rect(230, 880, 490, 960), rect(-40, 1240, 760, 1320), spikes(360, 1240, 800, 'up')],
  },
  {
    id: 12,
    name: 'Lá de Baixo',
    tip: 'Elas vêm de baixo! Envolva a plataforma inteira.',
    ink: 1400,
    stars: NORMAL,
    survive: 8,
    dog: { x: 360, y: 660 },
    hives: [
      { x: 100, y: 1150, bees: 6 },
      { x: 620, y: 1150, bees: 6 },
    ],
    bees: bees(6),
    terrain: [rect(240, 700, 480, 770), rect(-40, 1220, 760, 1320)],
  },
  {
    id: 13,
    name: 'Apressadas',
    tip: 'Essas abelhas são rápidas!',
    ink: 1000,
    stars: NORMAL,
    survive: 7,
    dog: { x: 360, y: FLOOR - 40 },
    hives: [{ x: 360, y: 480, bees: 10 }],
    bees: bees(9, 0.12),
    terrain: [ground()],
  },
  {
    id: 14,
    name: 'Muralha',
    tip: 'A muralha ajuda de um lado só.',
    ink: 1000,
    stars: NORMAL,
    survive: 9,
    dog: { x: 300, y: FLOOR - 40 },
    hives: [
      { x: 640, y: 300, bees: 8 },
      { x: 80, y: 300, bees: 6 },
    ],
    bees: bees(7),
    terrain: [ground(), rect(420, 560, 500, FLOOR)],
  },
  {
    id: 15,
    name: 'Equilíbrio',
    tip: 'Leveza! O pilar é estreito.',
    ink: 1000,
    stars: NORMAL,
    survive: 9,
    dog: { x: 360, y: 940 },
    hives: [
      { x: 100, y: 360, bees: 8 },
      { x: 620, y: 360, bees: 8 },
    ],
    bees: bees(6.5),
    terrain: [
      rect(-40, 1180, 760, 1320),
      spikes(130, 1180, 260, 'up'),
      spikes(590, 1180, 260, 'up'),
      rect(260, 980, 460, 1320),
    ],
  },
  {
    id: 16,
    name: 'Caverna',
    tip: 'Use a pedra como teto.',
    ink: 800,
    stars: NORMAL,
    survive: 9,
    dog: { x: 300, y: FLOOR - 40 },
    hives: [
      { x: 640, y: 700, bees: 8 },
      { x: 640, y: 980, bees: 6 },
    ],
    bees: bees(7),
    terrain: [ground(), rect(-40, 560, 420, 700), rect(-40, 700, 160, FLOOR)],
  },
  {
    id: 17,
    name: 'Pouca Tinta',
    tip: 'Cada pixel conta!',
    ink: 300,
    stars: TIGHT,
    survive: 8,
    dog: { x: 360, y: 1120 },
    hives: [{ x: 360, y: 280, bees: 14 }],
    bees: bees(7),
    terrain: [rect(-40, 980, 280, 1320), rect(440, 980, 760, 1320), rect(280, 1160, 440, 1320)],
  },
  {
    id: 18,
    name: 'Escada de Espinhos',
    tip: 'Degraus perigosos dos dois lados.',
    ink: 950,
    stars: NORMAL,
    survive: 9,
    dog: { x: 360, y: 940 },
    hives: [
      { x: 100, y: 330, bees: 8 },
      { x: 640, y: 330, bees: 8 },
    ],
    bees: bees(7),
    terrain: [
      rect(-40, 1100, 240, 1320),
      rect(240, 980, 480, 1320),
      rect(480, 860, 760, 1320),
      spikes(120, 1100, 240, 'up'),
      spikes(480, 920, 120, 'left'),
    ],
  },
  {
    id: 19,
    name: 'Tempestade',
    tip: 'Quatro colmeias. Aguente firme!',
    ink: 1300,
    stars: NORMAL,
    survive: 10,
    dog: { x: 360, y: FLOOR - 40 },
    hives: [
      { x: 90, y: 300, bees: 6 },
      { x: 630, y: 300, bees: 6 },
      { x: 90, y: 700, bees: 5 },
      { x: 630, y: 700, bees: 5 },
    ],
    bees: bees(7),
    terrain: [ground()],
  },
  {
    id: 20,
    name: 'Grande Final',
    tip: 'Tudo o que você aprendeu. Boa sorte!',
    ink: 1500,
    stars: NORMAL,
    survive: 10,
    dog: { x: 360, y: 720 },
    hives: [
      { x: 90, y: 300, bees: 6 },
      { x: 630, y: 300, bees: 6 },
      { x: 100, y: 1150, bees: 5 },
      { x: 620, y: 1150, bees: 5 },
    ],
    bees: bees(7),
    terrain: [rect(280, 760, 440, 820), rect(-40, 1240, 760, 1320), spikes(360, 1240, 800, 'up')],
  },
];

export const LEVEL_ORDER: readonly number[] = LEVELS.map((l) => l.id);

export const getLevel = (id: number): LevelDef | undefined => LEVELS.find((l) => l.id === id);

export function nextLevelId(id: number): number | undefined {
  const i = LEVEL_ORDER.indexOf(id);
  return i >= 0 ? LEVEL_ORDER[i + 1] : undefined;
}
