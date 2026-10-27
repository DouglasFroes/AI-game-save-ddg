# Backend architecture (Rust API + PostgreSQL)

One Rust process (`api/`) holds everything the game needs from a server: rankings, play analytics,
chat, sign-in, the admin panel's data, and it also serves the built game (`web/dist`) and admin panel
(`admin/dist`). One container, one database.

```
api/
  migrations/        SQL schema, applied on startup (sqlx::migrate!)
  src/
    domain/          PURE rules: the game list, nickname, score, chat text, reactions, sessions
    auth/            token.rs (our JWT), google.rs (GoogleVerifier port + HTTP adapter), extract.rs (extractors)
    repo/            persistence, one module per aggregate: players, entries, sessions, chat, admin
    chat/hub.rs      in-memory fan-out of chat events + who is online
    http/            handlers per area (auth, boards, telemetry, chat, ws, admin), dto.rs, statics.rs
    import.rs        one-off Firestore import
  tests/             API tests against a real Postgres (api.rs) and the import (import.rs)
```

## Rules

1. **Parse, don't validate.** Inputs become types that only hold valid values (`PlayerName`, `NewEntry`,
   `ChatText`, `NewSession`) in `domain/`. Handlers call `parse`, get a value or an `Invalid`, and nothing
   below re-checks. The domain has no I/O, so it is tested without a database.
2. **Ports only where there is a boundary.** Google is the one outside service: `GoogleVerifier` is a
   trait, faked in the tests. The database is not hidden behind traits: the tests run against a real
   Postgres, which is the honest way to test SQL.
3. **Authentication is a type.** Handlers ask for `AuthPlayer`, `GooglePlayer` or `AdminPlayer`
   (`auth/extract.rs`); a handler that takes none is public. A forgotten check is a compile-time
   absence, not a runtime bug. Only Google players rank and chat; admins are `ADMIN_EMAILS`.
4. **One error type.** `AppError` maps every failure to a status once (`error.rs`). Database details
   are logged, never sent to the client.
5. **The database enforces what it can.** `CHECK` constraints, the unique index of campaign boards, the
   foreign keys, and single-statement races (`take_send_slot`: the chat's 2 s gap is one `UPDATE`).
6. **Real time is a side channel.** Writes are plain REST; after a write the handler publishes to the
   `Hub`, and WebSocket clients (`/api/chat/ws`) receive it. If a client falls behind it gets `resync`
   and reloads over REST, so a lost event is never a lost message.
7. **Identity.** Everybody starts anonymous (`POST /api/auth/anonymous`); Google sign-in upgrades the same
   player, or, when the Google account already exists, merges the device's runs into it (one
   transaction, campaign boards keep the better run). Tokens are HS256 JWTs signed with `JWT_SECRET`.
8. **Config from the environment**, validated at startup (`config.rs`); see `.env.example` files.

## Adding a game

Add its id to `GAME_IDS` in `api/src/domain/games.rs` (and to `CAMPAIGN_IDS` only for a running-total
game, plus the partial unique index in a new migration). The server refuses unknown ids.

## Changing the schema

Add a new `api/migrations/NNNN_name.sql`; never edit an applied one. Run
`TEST_DATABASE_URL=postgres://.../postgres cargo test` to exercise it.

## The web client

`web/src/platform/api/` implements the game's ports over this API (`ApiLeaderboard`, `ApiTelemetry`,
`ApiChat`, `ApiSession`). `ChatSocket` keeps one reconnecting WebSocket for all chat subscriptions.
The service worker never caches `/api` or `/admin`.
