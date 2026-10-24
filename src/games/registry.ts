import type Phaser from 'phaser';
import { COLORS, SceneKeys, type SceneKey } from '@/config';
import { summarize } from '@/games/doguinho/core/progress';
import { FRUITS } from '@/games/fruitmerge/core';
import type { ScoreRecord } from '@/platform/bestScores';
import { formatPrize } from '@/games/milhao/art';
import { memoBest } from '@/games/memofases/best';
import { formatShare } from '@/games/territorio/art';
import { NO_REACTION } from '@/games/relampago/core';
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
  | 'turma'
  | 'corre'
  | 'crush'
  | 'lenha'
  | 'piano'
  | 'alvo'
  | 'pula'
  | 'atravessa'
  | 'hexa'
  | 'tijolos'
  | 'memoria'
  | 'cores'
  | 'milhao'
  | 'memofases'
  | 'bolha'
  | 'paciencia'
  | 'ultima'
  | 'territorio'
  | 'helix'
  | 'zigue'
  | 'ponte'
  | 'corcerta'
  | 'conta'
  | 'cesto'
  | 'sequencia'
  | 'relampago'
  | 'trio'
  | 'inverte'
  | 'balao'
  | 'toupeira'
  | 'corta'
  | 'gelo'
  | 'velha'
  | 'ligue4'
  | 'minas'
  | 'bolhas'
  | 'blocos'
  | 'comecome'
  | 'nave'
  | 'liquidos'
  | 'ricochete'
  | 'horda'
  | 'gancho'
  | 'orbita'
  | 'cadeia'
  | 'escorrega'
  | 'plinko'
  | 'tinta'
  | 'espelhos'
  | 'masmorra'
  | 'pinball'
  | 'dados'
  | 'selecao'
  | 'timesbr';

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
  /** Games without a hand-drawn icon get one made from this emoji (see BootScene). */
  readonly emoji?: string;
  readonly entryScene: SceneKey;
  /** Imports the game's scenes on demand, so each game is its own chunk. */
  load(): Promise<readonly SceneClass[]>;
  readonly columns: readonly RankColumn[];
  personalBest(services: Services): ScoreRecord | null;
}

const LEVEL_NAMES = ['', 'Fácil', 'Médio', 'Difícil', 'Extremo'];

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
    load: () => import('./turma/TurmaScene').then((m) => [m.TurmaScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 470, format: formatNumber },
      { key: 'wins', label: 'Vitórias', x: 580 },
      { key: 'maxCombo', label: 'Combo', x: 660 },
    ],
    personalBest: storedBest('turma'),
  },
  {
    id: 'corre',
    title: 'Corre Turma',
    tagline: 'Corra, pule e desvie',
    icon: 'corre-icon',
    color: 0x2ec4b6,
    shade: 0x1b8a80,
    entryScene: SceneKeys.Corre,
    load: () => import('./corre/CorreScene').then((m) => [m.CorreScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 470, format: formatNumber },
      { key: 'meters', label: 'Metros', x: 580, format: formatNumber },
      { key: 'coins', label: 'Moedas', x: 660 },
    ],
    personalBest: storedBest('corre'),
  },
  {
    id: 'crush',
    title: 'Turma Crush',
    tagline: 'Junte 3 iguais',
    icon: 'crush-icon',
    color: 0xff4f8b,
    shade: 0xc22d63,
    entryScene: SceneKeys.Crush,
    load: () => import('./crush/CrushScene').then((m) => [m.CrushScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'level', label: 'Fase', x: 650 },
    ],
    personalBest: storedBest('crush'),
  },
  {
    id: 'lenha',
    title: 'Lenhador',
    tagline: 'Corte sem levar galhada',
    icon: 'lenha-icon',
    color: 0x6d4c41,
    shade: 0x4e342e,
    entryScene: SceneKeys.Lenha,
    load: () => import('./lenha/LenhaScene').then((m) => [m.LenhaScene]),
    columns: [{ key: 'score', label: 'Cortes', x: 600, format: formatNumber }],
    personalBest: storedBest('lenha'),
  },
  {
    id: 'piano',
    title: 'Toque Rápido',
    tagline: 'Não erre a peça',
    icon: 'piano-icon',
    color: 0x7209b7,
    shade: 0x4a0080,
    entryScene: SceneKeys.Piano,
    load: () => import('./piano/PianoScene').then((m) => [m.PianoScene]),
    columns: [{ key: 'score', label: 'Peças', x: 600, format: formatNumber }],
    personalBest: storedBest('piano'),
  },
  {
    id: 'alvo',
    title: 'Acerta o Alvo',
    tagline: 'Lápis no biscoito',
    icon: 'alvo-icon',
    color: 0x3a0ca3,
    shade: 0x240873,
    entryScene: SceneKeys.Alvo,
    load: () => import('./alvo/AlvoScene').then((m) => [m.AlvoScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'level', label: 'Fase', x: 650 },
    ],
    personalBest: storedBest('alvo'),
  },
  {
    id: 'pula',
    title: 'Pula Pula',
    tagline: 'Suba cada vez mais',
    icon: 'pula-icon',
    color: 0x5bd46f,
    shade: 0x35a249,
    entryScene: SceneKeys.Pula,
    load: () => import('./pula/PulaScene').then((m) => [m.PulaScene]),
    columns: [{ key: 'score', label: 'Altura', x: 600, format: formatNumber }],
    personalBest: storedBest('pula'),
  },
  {
    id: 'atravessa',
    title: 'Atravessa',
    tagline: 'Rua, rio e águia',
    icon: 'atravessa-icon',
    color: 0x06d6a0,
    shade: 0x04976f,
    entryScene: SceneKeys.Atravessa,
    load: () => import('./atravessa/AtravessaScene').then((m) => [m.AtravessaScene]),
    columns: [{ key: 'score', label: 'Pulos', x: 600, format: formatNumber }],
    personalBest: storedBest('atravessa'),
  },
  {
    id: 'hexa',
    title: 'Hexa Pilhas',
    tagline: 'Junte 10 da mesma cor',
    icon: 'hexa-icon',
    emoji: '🍯',
    color: 0x7209b7,
    shade: 0x240873,
    entryScene: SceneKeys.Hexa,
    load: () => import('./hexa/HexaScene').then((m) => [m.HexaScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'chain', label: 'Combo', x: 650 },
    ],
    personalBest: storedBest('hexa'),
  },
  {
    id: 'tijolos',
    title: 'Quebra-Tijolos',
    tagline: 'Rebata e quebre tudo',
    icon: 'tijolos-icon',
    color: 0x3a86ff,
    shade: 0x1f5fc2,
    entryScene: SceneKeys.Tijolos,
    load: () => import('./tijolos/TijolosScene').then((m) => [m.TijolosScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'level', label: 'Fase', x: 650 },
    ],
    personalBest: storedBest('tijolos'),
  },
  {
    id: 'memoria',
    title: 'Memória da Turma',
    tagline: 'Ache os pares',
    icon: 'memoria-icon',
    color: 0xb5179e,
    shade: 0x7a0f6b,
    entryScene: SceneKeys.Memoria,
    load: () => import('./memoria/MemoriaScene').then((m) => [m.MemoriaScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'level', label: 'Fase', x: 650 },
    ],
    personalBest: storedBest('memoria'),
  },
  {
    id: 'cores',
    title: 'Pula Cor',
    tagline: 'Passe pela sua cor',
    icon: 'cores-icon',
    color: 0x8c52ff,
    shade: 0x5a2fc2,
    entryScene: SceneKeys.Cores,
    load: () => import('./cores/CoresScene').then((m) => [m.CoresScene]),
    columns: [{ key: 'score', label: 'Estrelas', x: 600, format: formatNumber }],
    personalBest: storedBest('cores'),
  },
  {
    id: 'milhao',
    title: 'Jogo do Milhão',
    tagline: 'Rumo ao milhão!',
    icon: 'milhao-icon',
    color: 0x1d3fa8,
    shade: 0x0b1a4a,
    entryScene: SceneKeys.Milhao,
    load: () => import('./milhao/MilhaoScene').then((m) => [m.MilhaoScene]),
    columns: [
      { key: 'score', label: 'Prêmio', x: 450, format: formatPrize },
      { key: 'helps', label: 'Ajudas', x: 565 },
      { key: 'time', label: 'Tempo', x: 650, format: formatTime },
    ],
    personalBest: storedBest('milhao'),
  },
  {
    id: 'memofases',
    title: 'Memória: Aventura',
    tagline: '30 fases com estrelas',
    icon: 'memoria-icon',
    color: 0xd63384,
    shade: 0x9c1f5e,
    entryScene: SceneKeys.MemoLevels,
    load: () => import('./memofases/scenes').then((m) => m.scenes),
    columns: [
      { key: 'score', label: 'Pontos', x: 470, format: formatNumber },
      { key: 'stars', label: '★', x: 575 },
      { key: 'levels', label: 'Fases', x: 655 },
    ],
    personalBest: (s) => memoBest(s),
  },
  {
    id: 'bolha',
    title: 'Bolha Gulosa',
    tagline: 'Coma e cresça',
    icon: 'bolha-icon',
    color: 0x00a6c7,
    shade: 0x00708a,
    entryScene: SceneKeys.Bolha,
    load: () => import('./bolha/BolhaScene').then((m) => [m.BolhaScene]),
    columns: [
      { key: 'score', label: 'Tamanho', x: 470, format: formatNumber },
      { key: 'kills', label: 'Abates', x: 575 },
      { key: 'rank', label: 'Posição', x: 660, format: (v) => `${v}º` },
    ],
    personalBest: storedBest('bolha'),
  },
  {
    id: 'paciencia',
    title: 'Paciência',
    tagline: 'O clássico das cartas',
    icon: 'paciencia-icon',
    color: 0x1f8a4c,
    shade: 0x135e33,
    entryScene: SceneKeys.Paciencia,
    load: () => import('./paciencia/PacienciaScene').then((m) => [m.PacienciaScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 470, format: formatNumber },
      { key: 'cards', label: 'Cartas', x: 570 },
      { key: 'time', label: 'Tempo', x: 655, format: formatTime },
    ],
    personalBest: storedBest('paciencia'),
  },
  {
    id: 'ultima',
    title: 'Última Carta',
    tagline: 'Cores, +2 e coringas',
    icon: 'ultima-icon',
    color: 0x7b2cbf,
    shade: 0x4a1a78,
    entryScene: SceneKeys.Ultima,
    load: () => import('./ultima/UltimaScene').then((m) => [m.UltimaScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'wins', label: 'Rodadas', x: 650 },
    ],
    personalBest: storedBest('ultima'),
  },
  {
    id: 'territorio',
    title: 'Território',
    tagline: 'Feche a volta e conquiste',
    icon: 'territorio-icon',
    color: 0xff4f8b,
    shade: 0xc2185b,
    entryScene: SceneKeys.Territorio,
    load: () => import('./territorio/TerritorioScene').then((m) => [m.TerritorioScene]),
    columns: [
      { key: 'score', label: 'Área', x: 520, format: formatShare },
      { key: 'kills', label: 'Cortes', x: 650 },
    ],
    personalBest: storedBest('territorio'),
  },
  {
    id: 'helix',
    title: 'Torre Helix',
    tagline: 'Gire a torre e desça',
    icon: 'helix-icon',
    emoji: '🌀',
    color: 0x4361ee,
    shade: 0x03045e,
    entryScene: SceneKeys.Helix,
    load: () => import('./helix/HelixScene').then((m) => [m.HelixScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'floors', label: 'Andares', x: 650 },
    ],
    personalBest: storedBest('helix'),
  },
  {
    id: 'zigue',
    title: 'Zigue-Zague',
    tagline: 'Vire na hora certa',
    icon: 'zigue-icon',
    emoji: '🔴',
    color: 0x1b998b,
    shade: 0x0b3d5c,
    entryScene: SceneKeys.Zigue,
    load: () => import('./zigue/ZigueScene').then((m) => [m.ZigueScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'gems', label: 'Gemas', x: 650 },
    ],
    personalBest: storedBest('zigue'),
  },
  {
    id: 'ponte',
    title: 'Ponte Certa',
    tagline: 'Segure e solte',
    icon: 'ponte-icon',
    emoji: '🌉',
    color: 0xfb8b24,
    shade: 0x9a4a05,
    entryScene: SceneKeys.Ponte,
    load: () => import('./ponte/PonteScene').then((m) => [m.PonteScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'perfects', label: 'Perfeitas', x: 650 },
    ],
    personalBest: storedBest('ponte'),
  },
  {
    id: 'corcerta',
    title: 'Cor Certa',
    tagline: 'A cor bate com a palavra?',
    icon: 'corcerta-icon',
    emoji: '🎨',
    color: 0x8338ec,
    shade: 0x432371,
    entryScene: SceneKeys.CorCerta,
    load: () => import('./corcerta/CorCertaScene').then((m) => [m.CorCertaScene]),
    columns: [
      { key: 'score', label: 'Acertos', x: 520, format: formatNumber },
      { key: 'streak', label: 'Seq.', x: 650 },
    ],
    personalBest: storedBest('corcerta'),
  },
  {
    id: 'conta',
    title: 'Conta Rápida',
    tagline: 'Resolva antes do tempo',
    icon: 'conta-icon',
    emoji: '🧮',
    color: 0xe5383b,
    shade: 0x5f0f40,
    entryScene: SceneKeys.Conta,
    load: () => import('./conta/ContaScene').then((m) => [m.ContaScene]),
    columns: [
      { key: 'score', label: 'Acertos', x: 520, format: formatNumber },
      { key: 'streak', label: 'Seq.', x: 650 },
    ],
    personalBest: storedBest('conta'),
  },
  {
    id: 'cesto',
    title: 'Cesto Maluco',
    tagline: 'Pegue as frutas, fuja das bombas',
    icon: 'cesto-icon',
    emoji: '🧺',
    color: 0x2a9d8f,
    shade: 0x264653,
    entryScene: SceneKeys.Cesto,
    load: () => import('./cesto/CestoScene').then((m) => [m.CestoScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'caught', label: 'Frutas', x: 650 },
    ],
    personalBest: storedBest('cesto'),
  },
  {
    id: 'sequencia',
    title: 'Sequência',
    tagline: 'Repita a ordem das luzes',
    icon: 'sequencia-icon',
    emoji: '🧠',
    color: 0x9d4edd,
    shade: 0x3c096c,
    entryScene: SceneKeys.Sequencia,
    load: () => import('./sequencia/SequenciaScene').then((m) => [m.SequenciaScene]),
    columns: [{ key: 'score', label: 'Rodadas', x: 600, format: formatNumber }],
    personalBest: storedBest('sequencia'),
  },
  {
    id: 'relampago',
    title: 'Relâmpago',
    tagline: 'Toque no verde, rápido!',
    icon: 'relampago-icon',
    emoji: '⚡',
    color: 0x2ecc71,
    shade: 0x1b7a43,
    entryScene: SceneKeys.Relampago,
    load: () => import('./relampago/RelampagoScene').then((m) => [m.RelampagoScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 500, format: formatNumber },
      { key: 'best', label: 'Reação', x: 640, format: (v) => (v >= NO_REACTION ? '–' : `${v} ms`) },
    ],
    personalBest: storedBest('relampago'),
  },
  {
    id: 'trio',
    title: 'Trio de Peças',
    tagline: 'Junte 3 iguais, não lote a bandeja',
    icon: 'trio-icon',
    emoji: '🎴',
    color: 0x2d6a4f,
    shade: 0x081c15,
    entryScene: SceneKeys.Trio,
    load: () => import('./trio/TrioScene').then((m) => [m.TrioScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'trios', label: 'Trios', x: 650 },
    ],
    personalBest: storedBest('trio'),
  },
  {
    id: 'inverte',
    title: 'Inverte',
    tagline: 'Vire a gravidade',
    icon: 'inverte-icon',
    emoji: '🙃',
    color: 0x0077b6,
    shade: 0x03045e,
    entryScene: SceneKeys.Inverte,
    load: () => import('./inverte/InverteScene').then((m) => [m.InverteScene]),
    columns: [
      { key: 'score', label: 'Metros', x: 520, format: formatNumber },
      { key: 'seconds', label: 'Tempo', x: 650, format: formatTime },
    ],
    personalBest: storedBest('inverte'),
  },
  {
    id: 'balao',
    title: 'Balão',
    tagline: 'Segure para subir',
    icon: 'balao-icon',
    emoji: '🎈',
    color: 0xe5383b,
    shade: 0x6a040f,
    entryScene: SceneKeys.Balao,
    load: () => import('./balao/BalaoScene').then((m) => [m.BalaoScene]),
    columns: [
      { key: 'score', label: 'Metros', x: 520, format: formatNumber },
      { key: 'seconds', label: 'Tempo', x: 650, format: formatTime },
    ],
    personalBest: storedBest('balao'),
  },
  {
    id: 'toupeira',
    title: 'Toupeira',
    tagline: 'Acerte, mas não a bomba',
    icon: 'toupeira-icon',
    emoji: '🐹',
    color: 0x8d5524,
    shade: 0x5a3e2b,
    entryScene: SceneKeys.Toupeira,
    load: () => import('./toupeira/ToupeiraScene').then((m) => [m.ToupeiraScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'combo', label: 'Combo', x: 650 },
    ],
    personalBest: storedBest('toupeira'),
  },
  {
    id: 'corta',
    title: 'Corta Frutas',
    tagline: 'Deslize e fatie',
    icon: 'corta-icon',
    emoji: '🍉',
    color: 0xf72585,
    shade: 0x7209b7,
    entryScene: SceneKeys.Corta,
    load: () => import('./corta/CortaScene').then((m) => [m.CortaScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 470, format: formatNumber },
      { key: 'fruits', label: 'Frutas', x: 575 },
      { key: 'combo', label: 'Combo', x: 655 },
    ],
    personalBest: storedBest('corta'),
  },
  {
    id: 'gelo',
    title: 'Gelo',
    tagline: 'Deslize até a bandeira',
    icon: 'gelo-icon',
    emoji: '🐧',
    color: 0x48cae4,
    shade: 0x0077b6,
    entryScene: SceneKeys.Gelo,
    load: () => import('./gelo/GeloScene').then((m) => [m.GeloScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'boards', label: 'Fases', x: 650 },
    ],
    personalBest: storedBest('gelo'),
  },
  {
    id: 'velha',
    title: 'Velha Infinita',
    tagline: 'Só 3 peças por vez',
    icon: 'velha-icon',
    emoji: '❌',
    color: 0x8d99ae,
    shade: 0x2b2d42,
    entryScene: SceneKeys.Velha,
    load: () => import('./velha/VelhaScene').then((m) => [m.VelhaScene]),
    columns: [
      { key: 'score', label: 'Vitórias', x: 520, format: formatNumber },
      { key: 'rounds', label: 'Rodadas', x: 650 },
    ],
    personalBest: storedBest('velha'),
  },
  {
    id: 'ligue4',
    title: 'Ligue 4',
    tagline: 'Alinhe 4 contra o robô',
    icon: 'ligue4-icon',
    emoji: '🔵',
    color: 0x1d4ed8,
    shade: 0x03045e,
    entryScene: SceneKeys.Ligue4,
    load: () => import('./ligue4/Ligue4Scene').then((m) => [m.Ligue4Scene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'wins', label: 'Vitórias', x: 650 },
    ],
    personalBest: storedBest('ligue4'),
  },
  {
    id: 'minas',
    title: 'Campo Minado',
    tagline: 'Limpe sem explodir',
    icon: 'minas-icon',
    emoji: '💣',
    color: 0x588157,
    shade: 0x344e41,
    entryScene: SceneKeys.Minas,
    load: () => import('./minas/MinasScene').then((m) => [m.MinasScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'boards', label: 'Campos', x: 650 },
    ],
    personalBest: storedBest('minas'),
  },
  {
    id: 'bolhas',
    title: 'Atira Bolhas',
    tagline: 'Estoure por cor',
    icon: 'bolhas-icon',
    emoji: '🫧',
    color: 0xb5179e,
    shade: 0x3c096c,
    entryScene: SceneKeys.Bolhas,
    load: () => import('./bolhas/BolhasScene').then((m) => [m.BolhasScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'popped', label: 'Bolhas', x: 650 },
    ],
    personalBest: storedBest('bolhas'),
  },
  {
    id: 'blocos',
    title: 'Blocos',
    tagline: 'O clássico que não para',
    icon: 'blocos-icon',
    emoji: '🧱',
    color: 0x3a506b,
    shade: 0x0b132b,
    entryScene: SceneKeys.Blocos,
    load: () => import('./blocos/BlocosScene').then((m) => [m.BlocosScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 470, format: formatNumber },
      { key: 'lines', label: 'Linhas', x: 575 },
      { key: 'level', label: 'Nível', x: 655 },
    ],
    personalBest: storedBest('blocos'),
  },
  {
    id: 'comecome',
    title: 'Come-Come',
    tagline: 'Fuja dos fantasmas',
    icon: 'comecome-icon',
    emoji: '👻',
    color: 0x2540ff,
    shade: 0x050a30,
    entryScene: SceneKeys.ComeCome,
    load: () => import('./comecome/ComeComeScene').then((m) => [m.ComeComeScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 520, format: formatNumber },
      { key: 'level', label: 'Fase', x: 650 },
    ],
    personalBest: storedBest('comecome'),
  },
  {
    id: 'nave',
    title: 'Nave',
    tagline: 'Atire em tudo',
    icon: 'nave-icon',
    emoji: '🚀',
    color: 0x370617,
    shade: 0x03071e,
    entryScene: SceneKeys.Nave,
    load: () => import('./nave/NaveScene').then((m) => [m.NaveScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 470, format: formatNumber },
      { key: 'wave', label: 'Onda', x: 575 },
      { key: 'kills', label: 'Abates', x: 655 },
    ],
    personalBest: storedBest('nave'),
  },
  {
    id: 'liquidos',
    title: 'Líquidos Mágicos',
    tagline: 'Separe as cores nos tubos',
    icon: 'liquidos-icon',
    emoji: '🧪',
    color: 0x00b4d8,
    shade: 0x141e30,
    entryScene: SceneKeys.Liquidos,
    load: () => import('./liquidos/LiquidosScene').then((m) => [m.LiquidosScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 470, format: formatNumber },
      { key: 'level', label: 'Fase', x: 575 },
      { key: 'moves', label: 'Mov.', x: 655 },
    ],
    personalBest: storedBest('liquidos'),
  },
  {
    id: 'ricochete',
    title: 'Ricochete Infinito',
    tagline: 'Mire e quebre os números',
    icon: 'ricochete-icon',
    emoji: '🎱',
    color: 0xf72585,
    shade: 0x1b263b,
    entryScene: SceneKeys.Ricochete,
    load: () => import('./ricochete/RicocheteScene').then((m) => [m.RicocheteScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 470, format: formatNumber },
      { key: 'turns', label: 'Rodadas', x: 575 },
      { key: 'balls', label: 'Bolas', x: 655 },
    ],
    personalBest: storedBest('ricochete'),
  },
  {
    id: 'horda',
    title: 'Sobrevivente da Horda',
    tagline: 'Evolua magias contra todos',
    icon: 'horda-icon',
    emoji: '🧙‍♂️',
    color: 0x7209b7,
    shade: 0x111827,
    entryScene: SceneKeys.Horda,
    load: () => import('./horda/HordaScene').then((m) => [m.HordaScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 455, format: formatNumber },
      { key: 'kills', label: 'Abates', x: 560 },
      { key: 'time', label: 'Tempo', x: 650, format: formatTime },
    ],
    personalBest: storedBest('horda'),
  },
  {
    id: 'gancho',
    title: 'Gancho Elástico',
    tagline: 'Balance sobre a lava',
    icon: 'gancho-icon',
    emoji: '🕸️',
    color: 0xf97316,
    shade: 0x431407,
    entryScene: SceneKeys.Gancho,
    load: () => import('./gancho/GanchoScene').then((m) => [m.GanchoScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 455, format: formatNumber },
      { key: 'meters', label: 'Metros', x: 560, format: formatNumber },
      { key: 'stars', label: 'Estrelas', x: 650 },
    ],
    personalBest: storedBest('gancho'),
  },
  {
    id: 'orbita',
    title: 'Órbita',
    tagline: 'Salte de planeta em planeta',
    icon: 'orbita-icon',
    emoji: '🪐',
    color: 0x6366f1,
    shade: 0x1e1b4b,
    entryScene: SceneKeys.Orbita,
    load: () => import('./orbita/OrbitaScene').then((m) => [m.OrbitaScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 480, format: formatNumber },
      { key: 'planets', label: 'Planetas', x: 625 },
    ],
    personalBest: storedBest('orbita'),
  },
  {
    id: 'cadeia',
    title: 'Reação em Cadeia',
    tagline: 'Um toque, mil explosões',
    icon: 'cadeia-icon',
    emoji: '💥',
    color: 0xf43f5e,
    shade: 0x4c0519,
    entryScene: SceneKeys.Cadeia,
    load: () => import('./cadeia/CadeiaScene').then((m) => [m.CadeiaScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 455, format: formatNumber },
      { key: 'level', label: 'Fase', x: 560 },
      { key: 'chain', label: 'Cadeia', x: 650 },
    ],
    personalBest: storedBest('cadeia'),
  },
  {
    id: 'escorrega',
    title: 'Escorrega',
    tagline: 'Deslize no gelo até a saída',
    icon: 'escorrega-icon',
    emoji: '🧊',
    color: 0x38bdf8,
    shade: 0x0c4a6e,
    entryScene: SceneKeys.Escorrega,
    load: () => import('./escorrega/EscorregaScene').then((m) => [m.EscorregaScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 480, format: formatNumber },
      { key: 'levels', label: 'Fases', x: 625 },
    ],
    personalBest: storedBest('escorrega'),
  },
  {
    id: 'plinko',
    title: 'Chuva de Bolas',
    tagline: 'Plinko com upgrades',
    icon: 'plinko-icon',
    emoji: '🎱',
    color: 0xa855f7,
    shade: 0x3b0764,
    entryScene: SceneKeys.Plinko,
    load: () => import('./plinko/PlinkoScene').then((m) => [m.PlinkoScene]),
    columns: [
      { key: 'score', label: 'Moedas', x: 480, format: formatNumber },
      { key: 'round', label: 'Rodada', x: 625 },
    ],
    personalBest: storedBest('plinko'),
  },
  {
    id: 'tinta',
    title: 'Mistura',
    tagline: 'Acerte a cor do pedido',
    icon: 'tinta-icon',
    emoji: '🎨',
    color: 0xec4899,
    shade: 0x500724,
    entryScene: SceneKeys.Tinta,
    load: () => import('./tinta/TintaScene').then((m) => [m.TintaScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 455, format: formatNumber },
      { key: 'orders', label: 'Pedidos', x: 560 },
      { key: 'perfect', label: 'Perfeitos', x: 650 },
    ],
    personalBest: storedBest('tinta'),
  },
  {
    id: 'espelhos',
    title: 'Espelhos',
    tagline: 'Guie o laser até os cristais',
    icon: 'espelhos-icon',
    emoji: '🔦',
    color: 0x22d3ee,
    shade: 0x083344,
    entryScene: SceneKeys.Espelhos,
    load: () => import('./espelhos/EspelhosScene').then((m) => [m.EspelhosScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 480, format: formatNumber },
      { key: 'levels', label: 'Fases', x: 625 },
    ],
    personalBest: storedBest('espelhos'),
  },
  {
    id: 'masmorra',
    title: 'Masmorra de Cartas',
    tagline: 'Escolha bem cada carta',
    icon: 'masmorra-icon',
    emoji: '🃏',
    color: 0x84cc16,
    shade: 0x1a2e05,
    entryScene: SceneKeys.Masmorra,
    load: () => import('./masmorra/MasmorraScene').then((m) => [m.MasmorraScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 455, format: formatNumber },
      { key: 'depth', label: 'Andar', x: 560 },
      { key: 'kills', label: 'Abates', x: 650 },
    ],
    personalBest: storedBest('masmorra'),
  },
  {
    id: 'pinball',
    title: 'Pinball Neon',
    tagline: 'Flippers, bumpers e combos',
    icon: 'pinball-icon',
    emoji: '🕹️',
    color: 0xfacc15,
    shade: 0x422006,
    entryScene: SceneKeys.Pinball,
    load: () => import('./pinball/PinballScene').then((m) => [m.PinballScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 480, format: formatNumber },
      { key: 'multi', label: 'Multi', x: 625 },
    ],
    personalBest: storedBest('pinball'),
  },
  {
    id: 'dados',
    title: 'Dados Loucos',
    tagline: 'Combos, mult e coringas',
    icon: 'dados-icon',
    emoji: '🎲',
    color: 0xf59e0b,
    shade: 0x451a03,
    entryScene: SceneKeys.Dados,
    load: () => import('./dados/DadosScene').then((m) => [m.DadosScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 480, format: formatNumber },
      { key: 'rounds', label: 'Rodadas', x: 625 },
    ],
    personalBest: storedBest('dados'),
  },
  {
    id: 'selecao',
    title: 'Seleção dos Sonhos',
    tagline: 'Monte o time e vença 7 jogos',
    icon: 'selecao-icon',
    emoji: '🏆',
    color: 0x16a34a,
    shade: 0x052e16,
    entryScene: SceneKeys.Selecao,
    load: () => import('./selecao/SelecaoScene').then((m) => [m.SelecaoScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 450, format: formatNumber },
      { key: 'wins', label: 'Vitórias', x: 565 },
      { key: 'rerolls', label: 'Sorteios', x: 655 },
    ],
    personalBest: storedBest('selecao'),
  },
  {
    id: 'timesbr',
    title: 'Time dos Sonhos BR',
    tagline: 'Craques dos clubes do Brasil',
    icon: 'timesbr-icon',
    emoji: '⚽',
    color: 0xeab308,
    shade: 0x14532d,
    entryScene: SceneKeys.TimesBr,
    load: () => import('./timesbr/TimesBrScene').then((m) => [m.TimesBrScene]),
    columns: [
      { key: 'score', label: 'Pontos', x: 450, format: formatNumber },
      { key: 'wins', label: 'Vitórias', x: 565 },
      { key: 'rerolls', label: 'Sorteios', x: 655 },
    ],
    personalBest: storedBest('timesbr'),
  },
];

export function getGame(id: string): GameDefinition {
  return GAMES.find((g) => g.id === id) ?? GAMES[0]!;
}
