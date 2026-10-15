import type Phaser from 'phaser';
import { COLORS, SceneKeys, type SceneKey } from '@/config';
import { summarize } from '@/games/doguinho/core/progress';
import { FRUITS } from '@/games/fruitmerge/core';
import type { ScoreRecord } from '@/platform/bestScores';
import { formatNumber, formatTime } from '@/platform/ranking';
import type { Services } from '@/services';

export type GameId =
  | 'doguinho'
  | 'blockblast'
  | 'sudoku'
  | 'roadfighter'
  | 'game2048'
  | 'flappybee'
  | 'snake'
  | 'stack'
  | 'fruitmerge'
  | 'grau'
  | 'luta'
  | 'bomba'
  | 'turma';

export type SceneClass = new () => Phaser.Scene;

/** A ranking column: 'score' or a key of the entry's details. */
export interface RankColumn {
  readonly key: string;
  readonly label: string;
  readonly x: number;
  readonly format?: (value: number) => string;
}

export interface GameDefinition {
  readonly id: GameId;
  readonly title: string;
  readonly tagline: string;
  /** Texture key for the hub card. */
  readonly icon: string;
  readonly color: number;
  readonly shade: number;
  readonly entryScene: SceneKey;
  /** Imports the game's scenes on demand, so each game is its own chunk. */
  load(): Promise<readonly SceneClass[]>;
  readonly columns: readonly RankColumn[];
  personalBest(services: Services): ScoreRecord | null;
}

const LEVEL_NAMES = ['', 'Fácil', 'Médio', 'Difícil'];

const storedBest = (id: GameId) => (s: Services) => s.best.get(id);

export const GAMES: readonly GameDefinition[] = [
  {
    id: 'doguinho',
    title: 'Salve o Doguinho',
    tagline: 'Desenhe e proteja',
    icon: 'dog-happy',
    color: COLORS.primary,
    shade: COLORS.primaryDark,
    entryScene: SceneKeys.DogLevels,
    load: () => import('./doguinho/scenes').then((m) => m.scenes),
    columns: [
      { key: 'stars', label: '★', x: 450 },
      { key: 'deaths', label: 'Mortes', x: 545 },
      { key: 'inkSaved', label: 'Tinta', x: 640, format: (v) => `${v}%` },
    ],
    personalBest: (s) => {
      const sum = summarize(s.dogProgress.get());
      if (sum.completed === 0) return null;
      return {
        score: sum.score,
        details: { stars: sum.stars, deaths: sum.deaths, inkSaved: sum.inkSaved },
      };
    },
  },
  {
    id: 'blockblast',
    title: 'Block Blast',
    tagline: 'Encaixe e limpe linhas',
    icon: 'bb-icon',
    color: 0x9b5de5,
    shade: 0x7038b8,
    entryScene: SceneKeys.BlockBlast,
    load: () => import('./blockblast/BlockBlastScene').then((m) => [m.BlockBlastScene]),
    columns: [{ key: 'score', label: 'Pontos', x: 600, format: formatNumber }],
    personalBest: storedBest('blockblast'),
  },
  {
    id: 'sudoku',
    title: 'Sudoku',
    tagline: 'Lógica com números',
    icon: 'sudoku-icon',
    color: COLORS.secondary,
    shade: COLORS.secondaryDark,
    entryScene: SceneKeys.SudokuMenu,
    load: () => import('./sudoku/scenes').then((m) => m.scenes),
    columns: [
      { key: 'score', label: 'Pontos', x: 460, format: formatNumber },
      { key: 'level', label: 'Nível', x: 565, format: (v) => LEVEL_NAMES[v] ?? '-' },
      { key: 'time', label: 'Tempo', x: 650, format: formatTime },
    ],
    personalBest: storedBest('sudoku'),
  },
  {
    id: 'roadfighter',
    title: 'Road Fighter',
    tagline: 'Corrida sem fim',
    icon: 'rf-player',
    color: COLORS.danger,
    shade: COLORS.dangerDark,
    entryScene: SceneKeys.RoadFighter,
    load: () => import('./roadfighter/RoadFighterScene').then((m) => [m.RoadFighterScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 480, format: formatNumber },
      { key: 'meters', label: 'Distância', x: 620, format: (v) => `${(v / 1000).toFixed(1)} km` },
    ],
    personalBest: storedBest('roadfighter'),
  },
  {
    id: 'game2048',
    title: '2048',
    tagline: 'Junte os números',
    icon: 'g2048-icon',
    color: 0xedc22e,
    shade: 0xb8941c,
    entryScene: SceneKeys.Game2048,
    load: () => import('./game2048/Game2048Scene').then((m) => [m.Game2048Scene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 480, format: formatNumber },
      { key: 'maxTile', label: 'Maior', x: 630 },
    ],
    personalBest: storedBest('game2048'),
  },
  {
    id: 'flappybee',
    title: 'Flappy Bee',
    tagline: 'Toque para voar',
    icon: 'bee',
    color: 0x2ec4b6,
    shade: 0x1f8a80,
    entryScene: SceneKeys.FlappyBee,
    load: () => import('./flappy/FlappyScene').then((m) => [m.FlappyScene]),
    columns: [{ key: 'score', label: 'Colmeias', x: 600, format: formatNumber }],
    personalBest: storedBest('flappybee'),
  },
  {
    id: 'snake',
    title: 'Snake',
    tagline: 'Coma e cresça',
    icon: 'snake-icon',
    color: 0x40916c,
    shade: 0x1b4332,
    entryScene: SceneKeys.Snake,
    load: () => import('./snake/SnakeScene').then((m) => [m.SnakeScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 480, format: formatNumber },
      { key: 'length', label: 'Tamanho', x: 630 },
    ],
    personalBest: storedBest('snake'),
  },
  {
    id: 'stack',
    title: 'Stack',
    tagline: 'Empilhe sem errar',
    icon: 'stack-icon',
    color: 0xf15bb5,
    shade: 0xb23a85,
    entryScene: SceneKeys.Stack,
    load: () => import('./stack/StackScene').then((m) => [m.StackScene]),
    columns: [
      { key: 'score', label: 'Andares', x: 480, format: formatNumber },
      { key: 'perfects', label: 'Perfeitos', x: 630 },
    ],
    personalBest: storedBest('stack'),
  },
  {
    id: 'fruitmerge',
    title: 'Fruit Merge',
    tagline: 'Junte as frutas',
    icon: 'fruit-5',
    color: 0xff7b25,
    shade: 0xc4561a,
    entryScene: SceneKeys.FruitMerge,
    load: () => import('./fruitmerge/FruitMergeScene').then((m) => [m.FruitMergeScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 470, format: formatNumber },
      { key: 'biggest', label: 'Maior fruta', x: 625, format: (v) => FRUITS[v]?.name ?? '-' },
    ],
    personalBest: storedBest('fruitmerge'),
  },
  {
    id: 'grau',
    title: 'Grau 3D',
    tagline: 'Empine e não caia',
    icon: 'grau-icon',
    color: 0xff5400,
    shade: 0xc23f00,
    entryScene: SceneKeys.Grau,
    load: () => import('./grau/GrauScene').then((m) => [m.GrauScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 455, format: formatNumber },
      { key: 'meters', label: 'Dist.', x: 562, format: (v) => `${(v / 1000).toFixed(1)} km` },
      { key: 'bestWheelie', label: 'Grau', x: 655, format: (v) => `${v} m` },
    ],
    personalBest: storedBest('grau'),
  },
  {
    id: 'luta',
    title: 'Luta de Rua',
    tagline: 'Vença todos os rivais',
    icon: 'luta-icon',
    color: 0x7209b7,
    shade: 0x4a0080,
    entryScene: SceneKeys.Luta,
    load: () => import('./luta/LutaScene').then((m) => [m.LutaScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 470, format: formatNumber },
      { key: 'wins', label: 'Vitórias', x: 580 },
      { key: 'maxCombo', label: 'Combo', x: 660 },
    ],
    personalBest: storedBest('luta'),
  },
  {
    id: 'bomba',
    title: 'Bombinhas',
    tagline: 'Exploda e ache a saída',
    icon: 'bomba-icon',
    color: 0xff4f8b,
    shade: 0xc22d63,
    entryScene: SceneKeys.Bomba,
    load: () => import('./bomba/BombaScene').then((m) => [m.BombaScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 470, format: formatNumber },
      { key: 'level', label: 'Fase', x: 575 },
      { key: 'monsters', label: 'Monstros', x: 660 },
    ],
    personalBest: storedBest('bomba'),
  },
  {
    id: 'turma',
    title: 'Turma da Luta',
    tagline: 'Cada um com seu poder',
    icon: 'turma-icon',
    color: 0x00b4d8,
    shade: 0x0077b6,
    entryScene: SceneKeys.Turma,
    load: () => import('./luta/TurmaScene').then((m) => [m.TurmaScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 470, format: formatNumber },
      { key: 'wins', label: 'Vitórias', x: 580 },
      { key: 'maxCombo', label: 'Combo', x: 660 },
    ],
    personalBest: storedBest('turma'),
  },
];

export function getGame(id: string): GameDefinition {
  return GAMES.find((g) => g.id === id) ?? GAMES[0]!;
}
