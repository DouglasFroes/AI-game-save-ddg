-- Fliper: players, rankings, play telemetry and chat.

CREATE TABLE players (
    id           uuid PRIMARY KEY,
    -- Google account id (`sub`); NULL while the player is anonymous.
    google_sub   text UNIQUE,
    email        text,
    name         text,
    -- Time of the last chat message: the server refuses floods.
    chat_last_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- One row per run, so a player can hold several places. Campaign boards keep one row per player.
CREATE TABLE entries (
    id         uuid PRIMARY KEY,
    game_id    text   NOT NULL,
    player_id  uuid   NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    name       text   NOT NULL CHECK (char_length(name) BETWEEN 1 AND 16),
    score      bigint NOT NULL CHECK (score BETWEEN 0 AND 100000000),
    details    jsonb  NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entries_board ON entries (game_id, score DESC, created_at);
CREATE INDEX entries_player ON entries (player_id);
CREATE UNIQUE INDEX entries_campaign_one_per_player
    ON entries (game_id, player_id) WHERE game_id IN ('doguinho', 'memofases');

CREATE TABLE play_sessions (
    id           text PRIMARY KEY,
    player_id    uuid   NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    name         text   NOT NULL,
    game_id      text   NOT NULL,
    duration_sec integer NOT NULL CHECK (duration_sec BETWEEN 1 AND 43200),
    score        bigint NOT NULL CHECK (score BETWEEN 0 AND 100000000),
    started_at   timestamptz NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX play_sessions_recent ON play_sessions (created_at DESC);
CREATE INDEX play_sessions_player ON play_sessions (player_id);

CREATE TABLE chat_messages (
    id         uuid PRIMARY KEY,
    room       text NOT NULL,
    -- No foreign key: messages outlive a merged or removed account.
    player_id  uuid NOT NULL,
    name       text NOT NULL,
    text       text NOT NULL,
    reply      jsonb,
    -- Reactions: player id -> emoji.
    reactions  jsonb NOT NULL DEFAULT '{}'::jsonb,
    deleted    boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_room ON chat_messages (room, created_at DESC);

CREATE TABLE chat_reports (
    id          bigserial PRIMARY KEY,
    reporter_id uuid NOT NULL,
    room        text NOT NULL,
    message_id  uuid NOT NULL,
    author_id   uuid NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (reporter_id, message_id)
);
