use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::domain::chat::{ChatText, Quote};

#[derive(Debug, Clone, FromRow)]
pub struct MessageRow {
    pub id: Uuid,
    pub room: String,
    pub player_id: Uuid,
    pub name: String,
    pub text: String,
    pub reply: Option<Value>,
    pub reactions: Value,
    pub deleted: bool,
    pub created_at: DateTime<Utc>,
}

const COLUMNS: &str = "id, room, player_id, name, text, reply, reactions, deleted, created_at";

/// Claims the player's "last message" slot: false while their previous message is under 2 s old.
/// Done in one statement, so two simultaneous requests cannot both pass.
pub async fn take_send_slot(pool: &PgPool, player: Uuid, gap_ms: i64) -> sqlx::Result<bool> {
    let rows = sqlx::query(
        "UPDATE players SET chat_last_at = now()
         WHERE id = $1 AND (chat_last_at IS NULL
                            OR chat_last_at < now() - make_interval(secs => $2::float8 / 1000))",
    )
    .bind(player)
    .bind(gap_ms as f64)
    .execute(pool)
    .await?
    .rows_affected();
    Ok(rows == 1)
}

pub async fn insert(
    pool: &PgPool,
    room: &str,
    player: Uuid,
    name: &str,
    text: &ChatText,
    reply: Option<&Quote>,
) -> sqlx::Result<MessageRow> {
    let reply = reply.map(|q| serde_json::json!({ "id": q.id, "name": q.name.as_str(), "text": q.text }));
    sqlx::query_as(&format!(
        "INSERT INTO chat_messages (id, room, player_id, name, text, reply)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING {COLUMNS}"
    ))
    .bind(Uuid::new_v4())
    .bind(room)
    .bind(player)
    .bind(name)
    .bind(text.as_str())
    .bind(reply)
    .fetch_one(pool)
    .await
}

/// A page of a room, newest first, optionally only older (`before`) or newer (`since`) than a time.
pub async fn page(
    pool: &PgPool,
    room: &str,
    before: Option<DateTime<Utc>>,
    since: Option<DateTime<Utc>>,
    limit: i64,
) -> sqlx::Result<Vec<MessageRow>> {
    sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM chat_messages
         WHERE room = $1 AND ($2::timestamptz IS NULL OR created_at < $2)
           AND ($3::timestamptz IS NULL OR created_at > $3)
         ORDER BY created_at DESC LIMIT $4"
    ))
    .bind(room)
    .bind(before)
    .bind(since)
    .bind(limit)
    .fetch_all(pool)
    .await
}

/// Sets (or with `None` removes) a player's reaction on a message.
pub async fn react(
    pool: &PgPool,
    room: &str,
    id: Uuid,
    player: Uuid,
    emoji: Option<&str>,
) -> sqlx::Result<Option<MessageRow>> {
    sqlx::query_as(&format!(
        "UPDATE chat_messages SET reactions = CASE
             WHEN $4::text IS NULL THEN reactions - $3
             ELSE jsonb_set(reactions, ARRAY[$3], to_jsonb($4::text)) END
         WHERE id = $1 AND room = $2 AND NOT deleted RETURNING {COLUMNS}"
    ))
    .bind(id)
    .bind(room)
    .bind(player.to_string())
    .bind(emoji)
    .fetch_optional(pool)
    .await
}

/// Blanks a message. `author` limits it to the player's own; `None` is a moderator.
pub async fn blank(
    pool: &PgPool,
    room: Option<&str>,
    id: Uuid,
    author: Option<Uuid>,
) -> sqlx::Result<Option<MessageRow>> {
    sqlx::query_as(&format!(
        "UPDATE chat_messages SET text = '', deleted = true
         WHERE id = $1 AND ($2::text IS NULL OR room = $2) AND ($3::uuid IS NULL OR player_id = $3)
         RETURNING {COLUMNS}"
    ))
    .bind(id)
    .bind(room)
    .bind(author)
    .fetch_optional(pool)
    .await
}

pub async fn report(pool: &PgPool, reporter: Uuid, room: &str, id: Uuid) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO chat_reports (reporter_id, room, message_id, author_id)
         SELECT $1, room, id, player_id FROM chat_messages WHERE id = $2 AND room = $3
         ON CONFLICT (reporter_id, message_id) DO NOTHING",
    )
    .bind(reporter)
    .bind(id)
    .bind(room)
    .execute(pool)
    .await?;
    Ok(())
}
