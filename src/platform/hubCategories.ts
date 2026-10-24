import type { GameId } from '@/games/registry';

export type CategoryId = 'acao' | 'puzzle' | 'mesa' | 'reflexo';

/** Hub filters: "all" and "favorites" are views over every game, the rest group games by feel. */
export type HubFilter = 'todos' | 'favoritos' | CategoryId;

export const CATEGORY_LABELS: Readonly<Record<HubFilter, string>> = {
  todos: 'Todos',
  favoritos: 'Favoritos',
  acao: 'Ação',
  puzzle: 'Puzzle',
  mesa: 'Mesa',
  reflexo: 'Reflexo',
};

/** Every game sits in exactly one category (the type forces new games to pick one). */
export const GAME_CATEGORY: Readonly<Record<GameId, CategoryId>> = {
  doguinho: 'puzzle',
  blockblast: 'puzzle',
  sudoku: 'puzzle',
  roadfighter: 'acao',
  game2048: 'puzzle',
  flappybee: 'reflexo',
  snake: 'acao',
  stack: 'reflexo',
  fruitmerge: 'puzzle',
  grau: 'acao',
  luta: 'acao',
  bomba: 'acao',
  turma: 'acao',
  corre: 'acao',
  crush: 'puzzle',
  lenha: 'reflexo',
  piano: 'reflexo',
  alvo: 'reflexo',
  pula: 'reflexo',
  atravessa: 'acao',
  hexa: 'puzzle',
  tijolos: 'acao',
  memoria: 'mesa',
  cores: 'reflexo',
  milhao: 'mesa',
  memofases: 'mesa',
  bolha: 'acao',
  paciencia: 'mesa',
  ultima: 'mesa',
  territorio: 'acao',
  helix: 'reflexo',
  zigue: 'reflexo',
  ponte: 'reflexo',
  corcerta: 'reflexo',
  conta: 'mesa',
  cesto: 'reflexo',
  sequencia: 'mesa',
  relampago: 'reflexo',
  trio: 'puzzle',
  inverte: 'reflexo',
  balao: 'reflexo',
  toupeira: 'reflexo',
  corta: 'reflexo',
  gelo: 'puzzle',
  velha: 'mesa',
  ligue4: 'mesa',
  minas: 'puzzle',
  bolhas: 'puzzle',
  blocos: 'puzzle',
  comecome: 'acao',
  nave: 'acao',
  liquidos: 'puzzle',
  ricochete: 'acao',
  horda: 'acao',
};

/** Games shown under a filter. `favorites` is the starred ids (the order given is kept). */
export function filterGames<T extends { readonly id: GameId }>(
  games: readonly T[],
  filter: HubFilter,
  favorites: readonly string[],
): T[] {
  if (filter === 'todos') return [...games];
  if (filter === 'favoritos') return games.filter((g) => favorites.includes(g.id));
  return games.filter((g) => GAME_CATEGORY[g.id] === filter);
}

/** A stable pick for the day, so "continue playing" has something to suggest on a first visit. */
export function gameOfTheDay<T>(games: readonly T[], date: Date): T | undefined {
  const day = Math.floor(date.getTime() / 86_400_000);
  return games[day % games.length];
}
