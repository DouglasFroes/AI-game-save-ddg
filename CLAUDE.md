# Fliper

Mobile-first arcade of web games (Salve o Doguinho, Block Blast, Sudoku, Road Fighter, 2048, Flappy Bee,
Snake, Stack, Fruit Merge, Grau 3D, Luta de Rua, Bombinhas, Turma da Luta, Corre Turma, Turma Crush, Lenhador,
Toque Rápido, Acerta o Alvo, Pula Pula, Atravessa, Hexa Pilhas, Quebra-Tijolos,
Memória da Turma, Pula Cor, Jogo do Milhão, Memória: Aventura, Bolha Gulosa, Paciência, Última Carta, Território,
Torre Helix, Zigue-Zague, Ponte Certa, Cor Certa, Conta Rápida, Cesto Maluco, Sequência, Relâmpago, Trio de Peças, Inverte, Balão, Toupeira, Corta Frutas, Gelo, Velha Infinita, Ligue 4, Campo Minado, Atira Bolhas, Blocos, Come-Come, Nave, Líquidos Mágicos, Ricochete Infinito, Sobrevivente da Horda, Gancho Elástico, Órbita, Reação em Cadeia, Escorrega, Chuva de Bolas, Mistura, Espelhos, Masmorra de Cartas, Pinball Neon, Dados Loucos, Seleção dos Sonhos, Time dos Sonhos BR, Brasileirão dos Sonhos, Disputa de Pênaltis, Mini Golfe, Tênis, Arremesso, Boliche, Curling, Skate na Rampa, Boxe, Ciclismo, Slalom, Arqueiro Infinito, Galeria de Tiro, Tiro de Precisão, Damas, Batalha Naval, Dominó, Hóquei de Mesa, Reversi, Nonograma, Mestre dos Canos, Caça Submarina,
Asteroides Neon, Estoura Cofre, Malabares, Vôlei de Praia, Vinte e Um, Hexágono, Palavra Secreta, Estacionamento,
Liga Pontos, Pescaria, Pouso Lunar, Defesa Antimísseis, Moto de Luz, Sinuca, Maior ou Menor, Biscoito Dalgona, Mahjong,
Apaga Luzes, Quebra-Cabeça Deslizante, Senha das Cores, Caça-Palavras, Anagrama, Binário, Soma Dez, Caça ao
Tesouro, Labirinto no Escuro, Círculos do Ritmo, Paraquedas, Chuva de Letras, Cubo Saltitante, Pássaro das
Colinas, Canhão, Equilíbrio, Desarme a Bomba, Controle de Tráfego, Torre de Controle, Lanchonete, Defesa da
Torre, Mina de Ouro, Pôquer, Dardos, Futebol de Botão, Salto de Esqui, Corrida de 100 m, Mancala, Hex, Trilha, Pontinhos, Resta Um, Raposa e Gansos, Velha Suprema, Captura, Muralha, Gravidade, Buraco Negro, Estilingue, Pêndulo, Ninja, Sumô, Esquiva, Escudo, Pular Corda, Fábrica de Biscoitos, Fazendinha, Bolsa, Reino, Cidade, Aquário, Poções, Usina, Bichinho, Empurra Caixas, Torre de Hanói, Fluxo, Pontes, Rainhas, Sapos, Balança, Travessia do Rio, Passeio do Cavalo, Torres, Quem Mente?, Moeda Falsa, Panquecas, Circuito, Encaixe, Dado Rolante, Jarros, Padrões), each with its own ranking. Vite + TypeScript (strict) + Phaser 3
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
- World coordinates are 720×1280 (`GAME_WIDTH`/`GAME_HEIGHT`). Only the hub uses `SCREEN_HEIGHT` (the phone's real
  height inside the safe area) and resets the canvas to 1280 when it closes; games keep 720×1280.
- Global ranking and chat are enabled by `VITE_GOOGLE_CLIENT_ID` (see `web/.env.example`); without it the
  ranking stays on the device. Add a new game id to `api/src/domain/games.rs` too.

## Board games vs CPU

Mancala, Hex, Trilha, Pontinhos, Raposa e Gansos, Velha Suprema, Captura and Muralha extend `BoardScene`
(`web/src/platform/ui/boardGame.ts`): a series against the CPU where each win raises its level and the first
loss ends the run. Each has a pure `core.ts` with a `cpuMove(state, level, rng)`; `web/tests/tabuleiro.test.ts`
proves a stronger bot beats a weaker one. Resta Um is a solo puzzle (`MiniScene`) with a DFS solver in its core.

## Action arcade batch

Gravidade, Buraco Negro, Estilingue, Pêndulo, Ninja, Sumô, Esquiva, Escudo and Pular Corda are solo
`MiniScene` games over a pure `core.ts` simulation (`step(dt)` + input methods). Each core ships a `botAct`/
`botTarget`/`bestPull` helper that `web/tests/acao9.test.ts` uses to prove the game is playable (a bot
survives, an idle player doesn't).

## Simulation & management batch

Fábrica de Biscoitos, Fazendinha, Bolsa, Reino, Cidade, Aquário, Poções, Usina and Bichinho are short
management sims (`MiniScene` + pure `core.ts` with a `step(dt)` and a `botAct`/`botChoose`/`bestPlacement`
policy). `web/tests/sim9.test.ts` proves each one is playable: the policy keeps going or scores well, an idle
player doesn't.

## Logic puzzle batch

Empurra Caixas, Torre de Hanói, Fluxo, Pontes, Rainhas, Sapos, Balança, Travessia do Rio and Passeio do Cavalo
extend `PuzzleScene` (`web/src/platform/ui/puzzleGame.ts`): an endless series of levels against one shared
clock, where each solved level scores and adds time. Each has a pure `core.ts` with a level `generate(level, rng)`
that builds solvable levels by construction; `web/tests/puzzle9.test.ts` solves them to prove it.

## Reasoning batch

Torres, Quem Mente?, Moeda Falsa, Panquecas, Circuito, Encaixe, Dado Rolante, Jarros and Padrões are also
`PuzzleScene` games, each built on a different mechanic (visibility clues, knights and knaves, weighing,
prefix flips, logic gates, polyomino tiling, rolling die, water jugs, number series). Their pure cores
(`web/tests/raciocinio9.test.ts`) prove every generated level can be solved.
