-- Client-side error telemetry (runtime exceptions, unhandled rejections, WebGL context loss).

CREATE TABLE client_errors (
    id         bigserial PRIMARY KEY,
    player_id  uuid,
    kind       text NOT NULL,
    message    text NOT NULL,
    stack      text NOT NULL DEFAULT '',
    game_id    text NOT NULL DEFAULT '',
    url        text NOT NULL DEFAULT '',
    user_agent text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_errors_recent ON client_errors (created_at DESC);
