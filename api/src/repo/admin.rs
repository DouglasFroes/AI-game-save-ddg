//! Read models for the admin panel: aggregates computed by the database.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow)]
pub struct Totals {
    pub players: i64,
    pub google_players: i64,
    pub active_today: i64,
    pub active_7d: i64,
    pub sessions: i64,
    pub play_seconds: i64,
    pub entries: i64,
    pub messages: i64,
    pub open_reports: i64,
}

pub async fn totals(pool: &PgPool) -> sqlx::Result<Totals> {
    sqlx::query_as(
        "SELECT
           (SELECT count(*) FROM players) AS players,
           (SELECT count(*) FROM players WHERE google_sub IS NOT NULL) AS google_players,
           (SELECT count(DISTINCT player_id) FROM play_sessions
              WHERE created_at > now() - interval '1 day') AS active_today,
           (SELECT count(DISTINCT player_id) FROM play_sessions
              WHERE created_at > now() - interval '7 days') AS active_7d,
           (SELECT count(*) FROM play_sessions) AS sessions,
           (SELECT COALESCE(sum(duration_sec), 0)::bigint FROM play_sessions) AS play_seconds,
           (SELECT count(*) FROM entries) AS entries,
           (SELECT count(*) FROM chat_messages WHERE NOT deleted) AS messages,
           (SELECT count(*) FROM chat_reports) AS open_reports",
    )
    .fetch_one(pool)
    .await
}

#[derive(Debug, Serialize, FromRow)]
pub struct GameStats {
    pub game_id: String,
    pub sessions: i64,
    pub play_seconds: i64,
    pub players: i64,
    pub best_score: i64,
    pub last_played_at: Option<DateTime<Utc>>,
}

pub async fn per_game(pool: &PgPool) -> sqlx::Result<Vec<GameStats>> {
    sqlx::query_as(
        "SELECT game_id, count(*) AS sessions, COALESCE(sum(duration_sec), 0)::bigint AS play_seconds,
                count(DISTINCT player_id) AS players, COALESCE(max(score), 0)::bigint AS best_score,
                max(created_at) AS last_played_at
         FROM play_sessions GROUP BY game_id ORDER BY play_seconds DESC",
    )
    .fetch_all(pool)
    .await
}

#[derive(Debug, Serialize, FromRow)]
pub struct DayStats {
    pub day: chrono::NaiveDate,
    pub sessions: i64,
    pub play_seconds: i64,
    pub players: i64,
}

/// The last `days` days (UTC), oldest first; days without play are simply absent.
pub async fn daily(pool: &PgPool, days: i32) -> sqlx::Result<Vec<DayStats>> {
    sqlx::query_as(
        "SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS sessions,
                COALESCE(sum(duration_sec), 0)::bigint AS play_seconds,
                count(DISTINCT player_id) AS players
         FROM play_sessions WHERE created_at > now() - make_interval(days => $1)
         GROUP BY day ORDER BY day",
    )
    .bind(days)
    .fetch_all(pool)
    .await
}

#[derive(Debug, Serialize, FromRow)]
pub struct PlayerSummary {
    pub id: Uuid,
    pub name: Option<String>,
    pub email: Option<String>,
    pub google: bool,
    pub sessions: i64,
    pub play_seconds: i64,
    pub entries: i64,
    pub created_at: DateTime<Utc>,
    pub last_seen_at: DateTime<Utc>,
}

/// Players, most recently seen first; `query` matches a nickname or an e-mail.
pub async fn players(pool: &PgPool, query: Option<&str>, limit: i64) -> sqlx::Result<Vec<PlayerSummary>> {
    sqlx::query_as(
        "SELECT p.id, p.name, p.email, (p.google_sub IS NOT NULL) AS google,
                (SELECT count(*) FROM play_sessions s WHERE s.player_id = p.id) AS sessions,
                (SELECT COALESCE(sum(duration_sec), 0)::bigint FROM play_sessions s WHERE s.player_id = p.id) AS play_seconds,
                (SELECT count(*) FROM entries e WHERE e.player_id = p.id) AS entries,
                p.created_at, p.last_seen_at
         FROM players p
         WHERE $1::text IS NULL OR p.name ILIKE '%' || $1 || '%' OR p.email ILIKE '%' || $1 || '%'
         ORDER BY p.last_seen_at DESC LIMIT $2",
    )
    .bind(query)
    .bind(limit)
    .fetch_all(pool)
    .await
}

#[derive(Debug, Serialize, FromRow)]
pub struct ReportRow {
    pub id: i64,
    pub room: String,
    pub message_id: Uuid,
    pub author_id: Uuid,
    pub author_name: String,
    pub text: String,
    pub deleted: bool,
    pub reports: i64,
    pub last_reported_at: DateTime<Utc>,
}

/// Reported messages, grouped: one row per message with how many players reported it.
pub async fn reports(pool: &PgPool) -> sqlx::Result<Vec<ReportRow>> {
    sqlx::query_as(
        "SELECT min(r.id) AS id, r.room, r.message_id, r.author_id,
                COALESCE(m.name, '?') AS author_name, COALESCE(m.text, '') AS text,
                COALESCE(m.deleted, true) AS deleted, count(*) AS reports,
                max(r.created_at) AS last_reported_at
         FROM chat_reports r LEFT JOIN chat_messages m ON m.id = r.message_id
         GROUP BY r.room, r.message_id, r.author_id, m.name, m.text, m.deleted
         ORDER BY last_reported_at DESC LIMIT 200",
    )
    .fetch_all(pool)
    .await
}

/// Closes the reports on a message (after moderating it or deciding it is fine).
pub async fn dismiss_reports(pool: &PgPool, message: Uuid) -> sqlx::Result<u64> {
    Ok(sqlx::query("DELETE FROM chat_reports WHERE message_id = $1")
        .bind(message)
        .execute(pool)
        .await?
        .rows_affected())
}
