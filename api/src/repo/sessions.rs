use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::domain::session::{NewClientError, NewSession};

#[derive(Debug, Clone, FromRow)]
pub struct SessionRow {
    pub id: String,
    pub player_id: Uuid,
    pub name: String,
    pub game_id: String,
    pub duration_sec: i32,
    pub score: i64,
    pub started_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

const COLUMNS: &str = "id, player_id, name, game_id, duration_sec, score, started_at, created_at";

/// Stores a session. Re-sending the same one (a retry) only updates it, and only its owner can.
pub async fn record(pool: &PgPool, player: Uuid, s: &NewSession) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO play_sessions (id, player_id, name, game_id, duration_sec, score, started_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, duration_sec = EXCLUDED.duration_sec,
             score = EXCLUDED.score
         WHERE play_sessions.player_id = EXCLUDED.player_id",
    )
    .bind(&s.id)
    .bind(player)
    .bind(s.name.as_str())
    .bind(&s.game_id)
    .bind(s.duration_sec)
    .bind(s.score)
    .bind(s.started_at)
    .execute(pool)
    .await?;
    Ok(())
}

/// The newest sessions, optionally of one game or one player.
pub async fn recent(
    pool: &PgPool,
    since: DateTime<Utc>,
    game: Option<&str>,
    limit: i64,
) -> sqlx::Result<Vec<SessionRow>> {
    sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM play_sessions
         WHERE created_at >= $1 AND ($2::text IS NULL OR game_id = $2)
         ORDER BY created_at DESC LIMIT $3"
    ))
    .bind(since)
    .bind(game)
    .bind(limit)
    .fetch_all(pool)
    .await
}

/// Records a client-side runtime error, rate-limited to avoid flooding the table.
pub async fn record_error(
    pool: &PgPool,
    player: Option<Uuid>,
    err: &NewClientError,
) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO client_errors (player_id, kind, message, stack, game_id, url, user_agent)
         SELECT $1, $2, $3, $4, $5, $6, $7
         WHERE (SELECT count(*) FROM client_errors WHERE created_at > now() - interval '1 minute') < 120",
    )
    .bind(player)
    .bind(&err.kind)
    .bind(&err.message)
    .bind(&err.stack)
    .bind(&err.game_id)
    .bind(&err.url)
    .bind(&err.user_agent)
    .execute(pool)
    .await?;
    Ok(())
}
