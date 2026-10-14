# Salve o Doguinho

Mobile-first "Draw to Save" web game: Vite + TypeScript (strict) + Phaser 3 (Matter physics).

## Commands

- `npm run dev` — dev server (also on LAN, for testing on a real phone)
- `npm run check` — typecheck + lint + unit tests (run before committing)
- `npm run build` — production build into `dist/`

## Architecture

See [docs/patterns/game-architecture.md](docs/patterns/game-architecture.md): pure logic in `src/core`
(no Phaser, unit-tested), I/O behind ports (`KeyValueStore`, `LeaderboardRepository`), services injected
via `game.registry`, fixed physics timestep, levels as typed data in `src/data/levels.ts`.

## Conventions

- Comments and code in English; player-facing text in Portuguese (pt-BR).
- World coordinates are 720×1280; the HUD occupies `y < HUD_HEIGHT`.
- Global ranking is enabled by setting `VITE_LEADERBOARD_URL` (see `.env.example`).
