/**
 * Where a game's scores are stored, when that differs from its id. Pointing a game at a fresh
 * board resets its ranking (global, local top 10 and personal best) without deleting anything:
 * the old board stays where it was, simply no longer read.
 */
const BOARD_ALIAS: Readonly<Record<string, string>> = {
  // Sudoku hints were unlimited, which let runs reach scores the game never meant to allow.
  sudoku: 'sudoku2',
  // Jogo do Milhão: harder, much bigger question bank and a fresh start for everyone.
  milhao: 'milhao2',
  // Both got much faster difficulty curves: the old scores came from far easier runs.
  misseis: 'misseis2',
  ligapontos: 'ligapontos2',
  // Pouso Lunar: gravity, wind and pad sizes now ramp up much faster.
  lunar: 'lunar2',
  // Pôquer became Poker Squares: the old scores were chips left in video poker.
  poquer: 'poquer2',
};

export const boardId = (gameId: string): string => BOARD_ALIAS[gameId] ?? gameId;
