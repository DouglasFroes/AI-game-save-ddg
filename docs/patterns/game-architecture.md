# Arcade architecture (Phaser + TypeScript)

One Phaser game hosts several mini-games. A shared **platform** provides the hub, profile, ranking and
UI; each game lives in its own folder and only talks to the platform through small interfaces.

```
src/
  config.ts          resolution, shared palette, SceneKeys
  services.ts        composition root: builds services, injects them via game.registry
  main.ts            Phaser.Game config + scene list
  platform/          shared by every game
    storage.ts         KeyValueStore port (BrowserStore / MemoryStore)
    profile.ts         nickname + settings (one per device)
    bestScores.ts      personal best per game
    leaderboard.ts     LeaderboardRepository port, LocalLeaderboard, ResilientLeaderboard
    firebaseLeaderboard.ts  Firestore adapter (anonymous auth, lazy-loaded SDK)
    ranking.ts         submitScore + formatting helpers
    art/ ui/ audio/    procedural textures, widgets (Button, text, name dialog), synthesized SFX
    scenes/            Boot, Hub, Leaderboard (generic), GameOver (generic overlay)
  games/
    registry.ts        GameDefinition list: title, icon, entry scene, ranking columns, personal best
    doguinho/          core/ (pure) · data/ · world/ (Matter entities) · scenes/
    blockblast/        core.ts (pure rules) · art.ts · BlockBlastScene.ts
    sudoku/            core.ts (generator/solver) · SudokuMenuScene.ts · SudokuScene.ts
    roadfighter/       core.ts (pure simulation) · art.ts · RoadFighterScene.ts
    game2048/ flappy/ snake/ stack/ fruitmerge/   core.ts (pure) + <Name>Scene.ts (art inside)
tests/               Vitest for every core + the platform
firestore.rules      security rules for leaderboards/{gameId}/entries/{uid}
```

## Rules

1. **Game rules are pure.** Each game's `core` never imports Phaser and is unit-tested
   (board logic, puzzle generation, driving simulation, ink/score). Scenes only render and read input.
2. **Ports & adapters for I/O.** Storage and ranking are interfaces. The Firebase adapter is one
   implementation; `ResilientLeaderboard` falls back to the local board when it fails.
3. **Dependency injection via the registry.** `createServices()` builds everything once; scenes read it
   with `getServices(this)` and never instantiate repositories themselves.
4. **A game plugs in through `games/registry.ts`.** The hub, generic Leaderboard and GameOver scenes
   are driven by the `GameDefinition`; no platform code is game-specific.
5. **One ranking flow for all games.** At game over, a game launches `SceneKeys.GameOver` with a
   `ScoreRecord`; the overlay stores the personal best and submits it when it improves.
6. **Fixed timesteps where physics matter** (Doguinho steps Matter manually; Road Fighter clamps dt).
7. **Untrusted data is validated** on load (`parseProgress`, `parseEntry`) and on the server
   (`firestore.rules`).

## Adding a new game

1. Create `src/games/<id>/` with a pure `core.ts` (+ tests) and a scene.
2. Add its scene key to `SceneKeys`, register the scene in `main.ts`, generate textures in `BootScene`.
3. Add a `GameDefinition` to `GAMES` (icon, entry scene, ranking columns, personal best).
4. Add the id to the allowed list in `firestore.rules`.
5. At game over: `this.scene.launch(SceneKeys.GameOver, { gameId, record, … })`.
