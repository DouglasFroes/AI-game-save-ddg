import type { GameId } from '@/games/registry';

export type CategoryId = 'acao' | 'puzzle' | 'mesa' | 'reflexo' | 'esporte';

/** Hub filters: "all" and "favorites" are views over every game, the rest group games by feel. */
export type HubFilter = 'todos' | 'favoritos' | CategoryId;

export const CATEGORY_LABELS: Readonly<Record<HubFilter, string>> = {
  todos: 'Todos',
  favoritos: 'Favoritos',
  acao: 'Ação',
  puzzle: 'Puzzle',
  mesa: 'Mesa',
  reflexo: 'Reflexo',
  esporte: 'Esportes',
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
  gancho: 'acao',
  orbita: 'reflexo',
  cadeia: 'puzzle',
  escorrega: 'puzzle',
  plinko: 'mesa',
  tinta: 'reflexo',
  espelhos: 'puzzle',
  masmorra: 'mesa',
  pinball: 'acao',
  dados: 'mesa',
  selecao: 'esporte',
  timesbr: 'esporte',
  brasileirao: 'esporte',
  penalti: 'esporte',
  golfe: 'esporte',
  tenis: 'esporte',
  basquete: 'esporte',
  boliche: 'esporte',
  curling: 'esporte',
  skate: 'esporte',
  boxe: 'esporte',
  ciclismo: 'esporte',
  esqui: 'esporte',
  arqueiro: 'esporte',
  galeria: 'reflexo',
  sniper: 'esporte',
  damas: 'mesa',
  naval: 'mesa',
  domino: 'mesa',
  hoquei: 'esporte',
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

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Games whose title or tagline contains every word of `query` (accents and case ignored), in the
 * order given. A blank query matches everything.
 */
export function searchGames<T extends { readonly title: string; readonly tagline: string }>(
  games: readonly T[],
  query: string,
): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...games];
  return games.filter((g) => {
    const hay = fold(`${g.title} ${g.tagline}`);
    return words.every((w) => hay.includes(w));
  });
}

/** "Bom dia" until noon, "Boa tarde" until 6 pm, "Boa noite" after that (and through the night). */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** A stable pick for the day, so "continue playing" has something to suggest on a first visit. */
export function gameOfTheDay<T>(games: readonly T[], date: Date): T | undefined {
  const day = Math.floor(date.getTime() / 86_400_000);
  return games[day % games.length];
}
