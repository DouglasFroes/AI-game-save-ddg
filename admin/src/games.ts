export type GameCategory = 'acao' | 'puzzle' | 'mesa' | 'reflexo' | 'esporte';

export interface GameMeta {
  readonly id: string;
  readonly title: string;
  readonly emoji: string;
  readonly color: string;
  readonly category: GameCategory;
  readonly campaign?: boolean;
}

export const CATEGORY_LABELS: Readonly<Record<GameCategory, string>> = {
  acao: 'Ação',
  puzzle: 'Puzzle',
  mesa: 'Mesa',
  reflexo: 'Reflexo',
  esporte: 'Esportes',
};

export const GAMES_CATALOG: readonly GameMeta[] = [
  { id: 'doguinho', title: 'Salve o Doguinho', emoji: '🐶', color: '#ffb703', category: 'puzzle', campaign: true },
  { id: 'blockblast', title: 'Block Blast', emoji: '🟦', color: '#9b5de5', category: 'puzzle' },
  { id: 'sudoku', title: 'Sudoku', emoji: '🔢', color: '#4da3ff', category: 'puzzle' },
  { id: 'roadfighter', title: 'Road Fighter', emoji: '🏎️', color: '#ff5d5d', category: 'acao' },
  { id: 'game2048', title: '2048', emoji: '🟨', color: '#edc22e', category: 'puzzle' },
  { id: 'flappybee', title: 'Flappy Bee', emoji: '🐝', color: '#2ec4b6', category: 'reflexo' },
  { id: 'snake', title: 'Snake', emoji: '🐍', color: '#40916c', category: 'acao' },
  { id: 'stack', title: 'Stack', emoji: '🏗️', color: '#f15bb5', category: 'reflexo' },
  { id: 'fruitmerge', title: 'Fruit Merge', emoji: '🍊', color: '#ff7b25', category: 'puzzle' },
  { id: 'grau', title: 'Grau 3D', emoji: '🏍️', color: '#ff5400', category: 'acao' },
  { id: 'luta', title: 'Luta de Rua', emoji: '🥋', color: '#7209b7', category: 'acao' },
  { id: 'bomba', title: 'Bombinhas', emoji: '💣', color: '#ff4f8b', category: 'acao' },
  { id: 'turma', title: 'Turma da Luta', emoji: '👊', color: '#00b4d8', category: 'acao' },
  { id: 'corre', title: 'Corre Turma', emoji: '🏃', color: '#2ec4b6', category: 'acao' },
  { id: 'crush', title: 'Turma Crush', emoji: '🍬', color: '#ff4f8b', category: 'puzzle' },
  { id: 'lenha', title: 'Lenhador', emoji: '🪓', color: '#6d4c41', category: 'reflexo' },
  { id: 'piano', title: 'Toque Rápido', emoji: '🎹', color: '#7209b7', category: 'reflexo' },
  { id: 'alvo', title: 'Acerta o Alvo', emoji: '🎯', color: '#3a0ca3', category: 'reflexo' },
  { id: 'pula', title: 'Pula Pula', emoji: '🐸', color: '#5bd46f', category: 'reflexo' },
  { id: 'atravessa', title: 'Atravessa', emoji: '🐔', color: '#06d6a0', category: 'acao' },
  { id: 'hexa', title: 'Hexa Pilhas', emoji: '🍯', color: '#7209b7', category: 'puzzle' },
  { id: 'tijolos', title: 'Quebra-Tijolos', emoji: '🧱', color: '#3a86ff', category: 'acao' },
  { id: 'memoria', title: 'Memória da Turma', emoji: '🃏', color: '#b5179e', category: 'mesa' },
  { id: 'cores', title: 'Pula Cor', emoji: '🌈', color: '#8c52ff', category: 'reflexo' },
  { id: 'milhao', title: 'Jogo do Milhão', emoji: '💰', color: '#1d3fa8', category: 'mesa' },
  { id: 'memofases', title: 'Memória: Aventura', emoji: '🗺️', color: '#d63384', category: 'mesa', campaign: true },
  { id: 'bolha', title: 'Bolha Gulosa', emoji: '🫧', color: '#00a6c7', category: 'acao' },
  { id: 'paciencia', title: 'Paciência', emoji: '♠️', color: '#1f8a4c', category: 'mesa' },
  { id: 'ultima', title: 'Última Carta', emoji: '🎴', color: '#7b2cbf', category: 'mesa' },
  { id: 'territorio', title: 'Território', emoji: '🗺️', color: '#ff4f8b', category: 'acao' },
  { id: 'helix', title: 'Torre Helix', emoji: '🌀', color: '#4361ee', category: 'reflexo' },
  { id: 'zigue', title: 'Zigue-Zague', emoji: '🔴', color: '#1b998b', category: 'reflexo' },
  { id: 'ponte', title: 'Ponte Certa', emoji: '🌉', color: '#fb8b24', category: 'reflexo' },
  { id: 'corcerta', title: 'Cor Certa', emoji: '🎨', color: '#8338ec', category: 'reflexo' },
  { id: 'conta', title: 'Conta Rápida', emoji: '🧮', color: '#e5383b', category: 'mesa' },
  { id: 'cesto', title: 'Cesto Maluco', emoji: '🧺', color: '#2a9d8f', category: 'reflexo' },
  { id: 'sequencia', title: 'Sequência', emoji: '🧠', color: '#9d4edd', category: 'mesa' },
  { id: 'relampago', title: 'Relâmpago', emoji: '⚡', color: '#2ecc71', category: 'reflexo' },
  { id: 'trio', title: 'Trio de Peças', emoji: '🀄', color: '#2d6a4f', category: 'puzzle' },
  { id: 'inverte', title: 'Inverte', emoji: '🙃', color: '#0077b6', category: 'reflexo' },
  { id: 'balao', title: 'Balão', emoji: '🎈', color: '#e5383b', category: 'reflexo' },
  { id: 'toupeira', title: 'Toupeira', emoji: '🐹', color: '#8d5524', category: 'reflexo' },
  { id: 'corta', title: 'Corta Frutas', emoji: '🍉', color: '#f72585', category: 'reflexo' },
  { id: 'gelo', title: 'Gelo', emoji: '🐧', color: '#48cae4', category: 'puzzle' },
  { id: 'velha', title: 'Velha Infinita', emoji: '❌', color: '#8d99ae', category: 'mesa' },
  { id: 'ligue4', title: 'Ligue 4', emoji: '🔵', color: '#1d4ed8', category: 'mesa' },
  { id: 'minas', title: 'Campo Minado', emoji: '💣', color: '#588157', category: 'puzzle' },
  { id: 'bolhas', title: 'Atira Bolhas', emoji: '🫧', color: '#b5179e', category: 'puzzle' },
  { id: 'blocos', title: 'Blocos', emoji: '🧱', color: '#3a506b', category: 'puzzle' },
  { id: 'comecome', title: 'Come-Come', emoji: '👻', color: '#2540ff', category: 'acao' },
  { id: 'nave', title: 'Nave', emoji: '🚀', color: '#e11d48', category: 'acao' },
  { id: 'liquidos', title: 'Líquidos Mágicos', emoji: '🧪', color: '#00b4d8', category: 'puzzle' },
  { id: 'ricochete', title: 'Ricochete Infinito', emoji: '🎱', color: '#f72585', category: 'acao' },
  { id: 'horda', title: 'Sobrevivente da Horda', emoji: '🧙‍♂️', color: '#7209b7', category: 'acao' },
  { id: 'gancho', title: 'Gancho Elástico', emoji: '🕸️', color: '#f97316', category: 'acao' },
  { id: 'orbita', title: 'Órbita', emoji: '🪐', color: '#6366f1', category: 'reflexo' },
  { id: 'cadeia', title: 'Reação em Cadeia', emoji: '💥', color: '#f43f5e', category: 'puzzle' },
  { id: 'escorrega', title: 'Escorrega', emoji: '🧊', color: '#38bdf8', category: 'puzzle' },
  { id: 'plinko', title: 'Chuva de Bolas', emoji: '🎱', color: '#a855f7', category: 'mesa' },
  { id: 'tinta', title: 'Mistura', emoji: '🎨', color: '#ec4899', category: 'reflexo' },
  { id: 'espelhos', title: 'Espelhos', emoji: '🔦', color: '#22d3ee', category: 'puzzle' },
  { id: 'masmorra', title: 'Masmorra de Cartas', emoji: '🃏', color: '#84cc16', category: 'mesa' },
  { id: 'pinball', title: 'Pinball Neon', emoji: '🕹️', color: '#facc15', category: 'acao' },
  { id: 'dados', title: 'Dados Loucos', emoji: '🎲', color: '#f59e0b', category: 'mesa' },
  { id: 'selecao', title: 'Seleção dos Sonhos', emoji: '🏆', color: '#16a34a', category: 'esporte' },
  { id: 'timesbr', title: 'Time dos Sonhos BR', emoji: '🇧🇷', color: '#eab308', category: 'esporte' },
  { id: 'brasileirao', title: 'Brasileirão dos Sonhos', emoji: '⚽', color: '#1d4ed8', category: 'esporte' },
  { id: 'penalti', title: 'Disputa de Pênaltis', emoji: '🥅', color: '#16a34a', category: 'esporte' },
  { id: 'golfe', title: 'Mini Golfe', emoji: '⛳', color: '#22c55e', category: 'esporte' },
  { id: 'tenis', title: 'Tênis', emoji: '🎾', color: '#0ea5e9', category: 'esporte' },
  { id: 'basquete', title: 'Arremesso', emoji: '🏀', color: '#f97316', category: 'esporte' },
  { id: 'boliche', title: 'Boliche', emoji: '🎳', color: '#6366f1', category: 'esporte' },
  { id: 'curling', title: 'Curling', emoji: '🥌', color: '#38bdf8', category: 'esporte' },
  { id: 'skate', title: 'Skate na Rampa', emoji: '🛹', color: '#f97316', category: 'esporte' },
  { id: 'boxe', title: 'Boxe', emoji: '🥊', color: '#dc2626', category: 'esporte' },
  { id: 'ciclismo', title: 'Ciclismo', emoji: '🚴', color: '#3b82f6', category: 'esporte' },
  { id: 'esqui', title: 'Slalom', emoji: '⛷️', color: '#0ea5e9', category: 'esporte' },
  { id: 'arqueiro', title: 'Arqueiro Infinito', emoji: '🏹', color: '#16a34a', category: 'esporte' },
  { id: 'galeria', title: 'Galeria de Tiro', emoji: '🦆', color: '#9333ea', category: 'reflexo' },
  { id: 'sniper', title: 'Tiro de Precisão', emoji: '🎯', color: '#64748b', category: 'esporte' },
  { id: 'damas', title: 'Damas', emoji: '⚫', color: '#b45309', category: 'mesa' },
  { id: 'naval', title: 'Batalha Naval', emoji: '🚢', color: '#0ea5e9', category: 'mesa' },
  { id: 'domino', title: 'Dominó', emoji: '🁣', color: '#15803d', category: 'mesa' },
  { id: 'hoquei', title: 'Hóquei de Mesa', emoji: '🏒', color: '#22d3ee', category: 'esporte' },
  { id: 'sudoku2', title: 'Sudoku II', emoji: '🔢', color: '#4da3ff', category: 'puzzle' },
  { id: 'milhao2', title: 'Jogo do Milhão II', emoji: '💰', color: '#1d3fa8', category: 'mesa' },
];

const BY_ID = new Map<string, GameMeta>(GAMES_CATALOG.map((g) => [g.id, g]));

export function getGameMeta(id: string): GameMeta {
  const found = BY_ID.get(id);
  if (found) return found;
  return {
    id,
    title: id.charAt(0).toUpperCase() + id.slice(1),
    emoji: '🎮',
    color: '#7c5cff',
    category: 'acao',
  };
}
