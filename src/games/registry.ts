import { COLORS, SceneKeys, type SceneKey } from '@/config';
import { summarize } from '@/games/doguinho/core/progress';
import type { ScoreRecord } from '@/platform/bestScores';
import { formatNumber, formatTime } from '@/platform/ranking';
import type { Services } from '@/services';

export type GameId = 'doguinho' | 'blockblast' | 'sudoku' | 'roadfighter';

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
    columns: [
      { key: 'score', label: 'Pontos', x: 480, format: formatNumber },
      { key: 'meters', label: 'Distância', x: 620, format: (v) => `${(v / 1000).toFixed(1)} km` },
    ],
    personalBest: storedBest('roadfighter'),
  },
];

export function getGame(id: string): GameDefinition {
  return GAMES.find((g) => g.id === id) ?? GAMES[0]!;
}
