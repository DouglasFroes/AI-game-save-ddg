use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::domain::{entry::NewEntry, games};

#[derive(Debug, Clone, FromRow)]
pub struct EntryRow {
    pub id: Uuid,
    pub player_id: Uuid,
    pub game_id: String,
    pub name: String,
    pub score: i64,
    pub details: Value,
    pub created_at: DateTime<Utc>,
}

const COLUMNS: &str = "id, player_id, game_id, name, score, details, created_at";

/// The best runs of a board: higher score first, the older run wins a tie.
pub async fn top(pool: &PgPool, game: &str, limit: i64) -> sqlx::Result<Vec<EntryRow>> {
    sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM entries WHERE game_id = $1 ORDER BY score DESC, created_at ASC LIMIT $2"
    ))
    .bind(game)
    .bind(limit)
    .fetch_all(pool)
    .await
}

/// Stores a run. Campaign boards keep one row per player, which this run replaces.
pub async fn submit(pool: &PgPool, player: Uuid, entry: &NewEntry) -> sqlx::Result<EntryRow> {
    let details = Value::Object(entry.details.clone());
    let sql = if games::is_campaign(&entry.game_id) {
        format!(
            "INSERT INTO entries (id, game_id, player_id, name, score, details)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (game_id, player_id) WHERE game_id IN ('doguinho', 'memofases')
             DO UPDATE SET name = EXCLUDED.name, score = EXCLUDED.score,
                           details = EXCLUDED.details, created_at = now()
             RETURNING {COLUMNS}"
        )
    } else {
        format!(
            "INSERT INTO entries (id, game_id, player_id, name, score, details)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING {COLUMNS}"
        )
    };
    sqlx::query_as(&sql)
        .bind(Uuid::new_v4())
        .bind(&entry.game_id)
        .bind(player)
        .bind(entry.name.as_str())
        .bind(entry.score)
        .bind(details)
        .fetch_one(pool)
        .await
}

/// Runs a player stored in the last `secs` seconds, to keep a script from flooding a board.
pub async fn recent_by(pool: &PgPool, player: Uuid, secs: i32) -> sqlx::Result<i64> {
    sqlx::query_scalar(
        "SELECT count(*) FROM entries
         WHERE player_id = $1 AND created_at > now() - make_interval(secs => $2)",
    )
    .bind(player)
    .bind(secs)
    .fetch_one(pool)
    .await
}

pub async fn delete(pool: &PgPool, id: Uuid) -> sqlx::Result<bool> {
    Ok(sqlx::query("DELETE FROM entries WHERE id = $1").bind(id).execute(pool).await?.rows_affected() > 0)
}
