# Game architecture (Phaser + TypeScript)

Layered structure that keeps the game logic testable and the Phaser code thin.

```
src/
  config.ts        constants: resolution, colors, scene keys, body labels
  services.ts      composition root: creates the services and injects them via game.registry
  main.ts          Phaser.Game config (Scale.FIT 9:16, Matter, scene list)
  core/            PURE logic — no Phaser imports, covered by Vitest
    geometry.ts      vectors, polyline length, sampling
    inkStroke.ts     the stroke being drawn + ink budget (guard injected)
    scoring.ts       stars and ranking score
    progress.ts      immutable progress + ProgressRepository (persistence)
    leaderboard.ts   LeaderboardRepository port + Local/Remote/Resilient adapters
    storage.ts       KeyValueStore port (BrowserStore / MemoryStore)
  data/            static, typed data (levels, seed ranking)
  game/
    art/           procedural textures (no image files)
    audio/         synthesized SFX (Web Audio)
    ui/            reusable widgets (Button, text, panels)
    world/         game entities: Terrain, Dog, InkLine, Swarm
    scenes/        Boot → Menu → LevelSelect → Game (+ Result overlay) / Ranking
tests/             Vitest for core/ and data/
```

## Rules

1. **`core/` never imports Phaser.** Anything that can be computed without a renderer (rules, scoring,
   validation, persistence) lives there and gets a unit test.
2. **Ports & adapters for I/O.** Storage and the ranking are interfaces (`KeyValueStore`,
   `LeaderboardRepository`). Swapping localStorage for a backend is a new adapter, not a rewrite.
3. **Dependency injection via the registry.** `createServices()` builds everything once; scenes read it
   with `getServices(this)`. Scenes never instantiate repositories themselves.
4. **Immutable state + repository.** `Progress` is never mutated; use `repo.update(fn)` with the pure
   functions (`recordWin`, `recordDeath`…). Saved data is validated with `parseProgress` on load.
5. **Scenes orchestrate, entities encapsulate.** A scene wires input, flow and HUD; physics bodies and
   their visuals belong to `world/` classes.
6. **Fixed physics timestep.** Matter runs with `autoUpdate: false` and `GameScene.update` steps it in
   `PHYSICS_STEP_MS` chunks, so 60 Hz and 120 Hz phones behave the same.
7. **Visual tweens never touch physics bodies.** Physics objects that animate (the dog) keep a separate
   sprite synced to the body.
8. **Levels are data.** Add a level by appending to `data/levels.ts`; `tests/levels.test.ts` validates it.

## Adding things

- New level: add to `LEVELS`, run `npm test`, then play it with `npm run dev`.
- New ranking backend: implement `LeaderboardRepository`, wire it in `createServices()`.
- New scene: add the key to `SceneKeys`, the class to `scenes/`, and register it in `main.ts`.
