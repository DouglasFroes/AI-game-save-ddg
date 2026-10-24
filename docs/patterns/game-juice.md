# Game juice: shared feedback helpers

New mini-games get their "feel" from `src/platform/ui/juice.ts` and the synthesized sounds in
`src/platform/audio/Sfx.ts`, so every game reacts the same way and nothing needs image/audio assets.

## Helpers (`juice.ts`)

| Helper | Use it for |
| --- | --- |
| `burst(scene, x, y, color, count, opts)` | Particle puff on a pop, hit, pickup (`speed`, `size`, `life`, `gravity`). |
| `shockwave(scene, x, y, color, radius)` | Expanding ring on captures, bumper hits, big wins. |
| `flash(scene, color, alpha)` | Full-screen flash for milestones (jackpot, perfect, chain 10). |
| `ambient(scene, color, count)` | Slow drifting dust behind the playfield. |
| `hint(scene, lines, y, ms)` | First-play tutorial text. Returns `{ dismiss }`; call it on the first input. |
| `banner(scene, label, color, y)` | Big centered announcement ("FASE COMPLETA!"). |

`MiniScene.pop(x, y, label, color, size)` gives floating score text; `MiniScene.finish(...)` ends the run
and opens the shared GameOver + ranking.

## Sounds (`sfx.play(name, index?)`)

`coin` (the `index` raises the pitch, so combos and chains climb a scale), `boom`, `zap`, `bounce`, `tick`,
`level`, plus the older `click`, `pop`, `hit`, `win`, `star`, `locked`. `sfx.vibrate(pattern)` for haptics.

## Rules of thumb

- Every scoring event gets three things at once: a particle burst, a sound and a score pop.
- Reserve `flash` + `banner` + a long vibration for rare milestones, or they stop meaning anything.
- Clamp the frame delta (`Math.min(deltaMs, 50) / 1000`) before stepping a sim.
- Keep the sim in `core.ts` (no Phaser), return events from `step()`/actions, and let the scene turn
  those events into juice. That keeps the effects out of the unit tests.
- Roguelite-style games (Chuva de Bolas, Dados Loucos) keep their shop/choices in the sim as plain state
  (`shopChoices`/`offer` + `choose`/`pick`) and only draw the cards in the scene.
