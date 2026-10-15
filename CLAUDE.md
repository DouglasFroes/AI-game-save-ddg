# Fliperama

Mobile-first arcade of web games (Salve o Doguinho, Block Blast, Sudoku, Road Fighter, 2048, Flappy Bee,
Snake, Stack, Fruit Merge, Grau 3D, Luta de Rua, Bombinhas, Turma da Luta, Corre Turma, Turma Crush, Lenhador,
Toque Rápido, Acerta o Alvo, Pula Pula, Atravessa), each with its own ranking. Vite + TypeScript (strict) + Phaser 3
(+ Three.js, only in Grau 3D) + Firebase (anonymous auth + Firestore). Node 22.13+.

## Commands

- `npm run dev` — dev server (also on LAN, for testing on a real phone)
- `npm run check` — typecheck + lint + unit tests (run before committing)
- `npm run build` — production build into `dist/`

## Architecture

See [docs/patterns/game-architecture.md](docs/patterns/game-architecture.md): shared `src/platform`
(hub, profile, ranking, generic GameOver/Leaderboard scenes) + one folder per game in `src/games`, each
with a pure, unit-tested `core`. Games plug in via `src/games/registry.ts`.

## Conventions

- Comments and code in English; player-facing text in Portuguese (pt-BR).
- World coordinates are 720×1280 (`GAME_WIDTH`/`GAME_HEIGHT`).
- Global ranking is enabled by the `VITE_FIREBASE_*` variables (see `.env.example`); without them the
  ranking stays on the device. Keep `firestore.rules` in sync when adding a game id.
