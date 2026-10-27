# Fliper

Mobile-first arcade of web games (Salve o Doguinho, Block Blast, Sudoku, Road Fighter, 2048, Flappy Bee,
Snake, Stack, Fruit Merge, Grau 3D, Luta de Rua, Bombinhas, Turma da Luta, Corre Turma, Turma Crush, Lenhador,
Toque Rápido, Acerta o Alvo, Pula Pula, Atravessa, Hexa Pilhas, Quebra-Tijolos,
Memória da Turma, Pula Cor, Jogo do Milhão, Memória: Aventura, Bolha Gulosa, Paciência, Última Carta, Território,
Torre Helix, Zigue-Zague, Ponte Certa, Cor Certa, Conta Rápida, Cesto Maluco, Sequência, Relâmpago, Trio de Peças, Inverte, Balão, Toupeira, Corta Frutas, Gelo, Velha Infinita, Ligue 4, Campo Minado, Atira Bolhas, Blocos, Come-Come, Nave, Líquidos Mágicos, Ricochete Infinito, Sobrevivente da Horda, Gancho Elástico, Órbita, Reação em Cadeia, Escorrega, Chuva de Bolas, Mistura, Espelhos, Masmorra de Cartas, Pinball Neon, Dados Loucos, Seleção dos Sonhos, Time dos Sonhos BR, Brasileirão dos Sonhos, Disputa de Pênaltis, Mini Golfe, Tênis, Arremesso, Boliche, Curling, Skate na Rampa, Boxe, Ciclismo, Slalom, Arqueiro Infinito, Galeria de Tiro, Tiro de Precisão), each with its own ranking. Vite + TypeScript (strict) + Phaser 3
(+ Three.js, only in Grau 3D). Backend: Rust (Axum + SQLx) + PostgreSQL, served from one Docker image
(Dokploy). Node 22.13+.

## Layout

- `web/` — the game (Vite + Phaser). Run npm commands from here.
- `api/` — Rust API: ranking, telemetry, chat (WebSocket), Google sign-in; serves `web/dist` and `admin/dist`.
- `admin/` — admin panel (Vite, vanilla TS), served at `/admin`; only `ADMIN_EMAILS` Google accounts.
- `legacy/` — the old Firebase code and admin dashboard, kept for reference only (not built).
- `tools/firestore-export/` — one-off export of the old Firebase data for `fliper-api import`.
- `Dockerfile`, `.env.example` — deployment (Dokploy).

## Commands

- `cd web && npm run dev` — dev server (also on LAN, for testing on a real phone); proxies `/api` to `localhost:8080`
- `cd web && npm run check` — typecheck + lint + unit tests (run before committing)
- `cd web && npm run build` — production build into `web/dist/`
- `cd api && cargo run` / `cargo test` — API (needs `DATABASE_URL`, see `api/.env.example`); set
  `TEST_DATABASE_URL` (a Postgres maintenance database) to run the integration tests too
- `cd admin && npm run dev` / `npm test` — admin panel

## Architecture

See [docs/patterns/game-architecture.md](docs/patterns/game-architecture.md): shared `web/src/platform`
(hub, profile, ranking, generic GameOver/Leaderboard scenes) + one folder per game in `web/src/games`, each
with a pure, unit-tested `core`. Games plug in via `web/src/games/registry.ts`.

## Backend

See [docs/patterns/backend-architecture.md](docs/patterns/backend-architecture.md): pure `domain`, typed
auth extractors, SQL in `repo`, WebSocket hub for the chat. Rules that used to live in `firestore.rules`
are now in `api/src/domain` and the migrations.

## Chat

Real-time chat in `web/src/platform/chat` (pure `core.ts`, `backend.ts` port, `service.ts` for
presence/unread, DOM `overlay.ts`); the API adapter is `web/src/platform/api/chat.ts` (REST + WebSocket).
Only players signed in with Google can read or write it — enforced by the API (`GooglePlayer`).

## Game feel

Shared effects for new games (particles, shockwave, flash, banner, tutorial hint, ambient dust) live in
`web/src/platform/ui/juice.ts`; see [docs/patterns/game-juice.md](docs/patterns/game-juice.md).

## Conventions

- Comments and code in English; player-facing text in Portuguese (pt-BR).
- World coordinates are 720×1280 (`GAME_WIDTH`/`GAME_HEIGHT`).
- Global ranking and chat are enabled by `VITE_GOOGLE_CLIENT_ID` (see `web/.env.example`); without it the
  ranking stays on the device. Add a new game id to `api/src/domain/games.rs` too.
