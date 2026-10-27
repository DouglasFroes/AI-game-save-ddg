# Fliper

Mobile-first arcade of web games (Salve o Doguinho, Block Blast, Sudoku, Road Fighter, 2048, Flappy Bee,
Snake, Stack, Fruit Merge, Grau 3D, Luta de Rua, Bombinhas, Turma da Luta, Corre Turma, Turma Crush, Lenhador,
Toque Rápido, Acerta o Alvo, Pula Pula, Atravessa, Hexa Pilhas, Quebra-Tijolos,
Memória da Turma, Pula Cor, Jogo do Milhão, Memória: Aventura, Bolha Gulosa, Paciência, Última Carta, Território,
Torre Helix, Zigue-Zague, Ponte Certa, Cor Certa, Conta Rápida, Cesto Maluco, Sequência, Relâmpago, Trio de Peças, Inverte, Balão, Toupeira, Corta Frutas, Gelo, Velha Infinita, Ligue 4, Campo Minado, Atira Bolhas, Blocos, Come-Come, Nave, Líquidos Mágicos, Ricochete Infinito, Sobrevivente da Horda, Gancho Elástico, Órbita, Reação em Cadeia, Escorrega, Chuva de Bolas, Mistura, Espelhos, Masmorra de Cartas, Pinball Neon, Dados Loucos, Seleção dos Sonhos, Time dos Sonhos BR, Brasileirão dos Sonhos, Disputa de Pênaltis, Mini Golfe, Tênis, Arremesso, Boliche, Curling, Skate na Rampa, Boxe, Ciclismo, Slalom, Arqueiro Infinito, Galeria de Tiro, Tiro de Precisão), each with its own ranking. Vite + TypeScript (strict) + Phaser 3
(+ Three.js, only in Grau 3D) + Firebase (anonymous auth + Firestore). Node 22.13+.

## Commands

- `npm run dev` — dev server (also on LAN, for testing on a real phone)
- `npm run check` — typecheck + lint + unit tests (run before committing)
- `npm run build` — production build into `dist/`

## Architecture

See [docs/patterns/game-architecture.md](docs/patterns/game-architecture.md): shared `src/platform`
(hub, profile, ranking, generic GameOver/Leaderboard scenes) + one folder per game in `src/games`, each
with a pure, unit-tested `core`. Games plug in via `src/games/registry.ts`.

## Chat

Real-time chat in `src/platform/chat` (pure `core.ts`, Firestore `backend.ts`, `service.ts` for
presence/unread, DOM `overlay.ts`). Only players signed in with Google can read or write it — enforced
in `firestore.rules` (`chat_rooms`, `chat_users`, `presence`, `chat_reports`).

## Game feel

Shared effects for new games (particles, shockwave, flash, banner, tutorial hint, ambient dust) live in
`src/platform/ui/juice.ts`; see [docs/patterns/game-juice.md](docs/patterns/game-juice.md).

## Conventions

- Comments and code in English; player-facing text in Portuguese (pt-BR).
- World coordinates are 720×1280 (`GAME_WIDTH`/`GAME_HEIGHT`).
- Global ranking is enabled by the `VITE_FIREBASE_*` variables (see `.env.example`); without them the
  ranking stays on the device. Keep `firestore.rules` in sync when adding a game id.
