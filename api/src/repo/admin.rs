//! Read models for the admin panel: aggregates and paginated queries computed by the database.

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::repo::sessions::SessionRow;

#[derive(Debug, Serialize)]
pub struct Page<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Totals {
    pub players: i64,
    pub google_players: i64,
    pub active_today: i64,
    pub active_7d: i64,
    pub active_30d: i64,
    pub sessions: i64,
    pub play_seconds: i64,
    pub entries: i64,
    pub messages: i64,
    pub open_reports: i64,
    pub games_played: i64,
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
           (SELECT count(DISTINCT player_id) FROM play_sessions
              WHERE created_at > now() - interval '30 days') AS active_30d,
           (SELECT count(*) FROM play_sessions) AS sessions,
           (SELECT COALESCE(sum(duration_sec), 0)::bigint FROM play_sessions) AS play_seconds,
           (SELECT count(*) FROM entries) AS entries,
           (SELECT count(*) FROM chat_messages WHERE NOT deleted) AS messages,
           (SELECT count(*) FROM chat_reports) AS open_reports,
           (SELECT count(DISTINCT game_id) FROM play_sessions) AS games_played",
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
    pub entries: i64,
    pub last_played_at: Option<DateTime<Utc>>,
}

pub async fn per_game(pool: &PgPool) -> sqlx::Result<Vec<GameStats>> {
    sqlx::query_as(
        "WITH s AS (
             SELECT game_id, count(*) AS sessions, COALESCE(sum(duration_sec), 0)::bigint AS play_seconds,
                    count(DISTINCT player_id) AS players, COALESCE(max(score), 0)::bigint AS best_score,
                    max(created_at) AS last_played_at
             FROM play_sessions GROUP BY game_id
         ),
         e AS (
             SELECT game_id, count(*) AS entries, COALESCE(max(score), 0)::bigint AS entry_best
             FROM entries GROUP BY game_id
         )
         SELECT COALESCE(s.game_id, e.game_id) AS game_id,
                COALESCE(s.sessions, 0) AS sessions,
                COALESCE(s.play_seconds, 0) AS play_seconds,
                COALESCE(s.players, 0) AS players,
                GREATEST(COALESCE(s.best_score, 0), COALESCE(e.entry_best, 0)) AS best_score,
                COALESCE(e.entries, 0) AS entries,
                s.last_played_at
         FROM s FULL OUTER JOIN e ON s.game_id = e.game_id
         ORDER BY play_seconds DESC, sessions DESC, entries DESC",
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

#[derive(Debug, FromRow)]
pub struct SessionsAggregate {
    pub total: i64,
    pub total_seconds: i64,
    pub unique_players: i64,
}

pub struct SessionsFilter<'a> {
    pub since: Option<DateTime<Utc>>,
    pub game: Option<&'a str>,
    pub player: Option<Uuid>,
    pub query: Option<&'a str>,
    pub sort: &'a str,
    pub page: i64,
    pub per_page: i64,
}

pub async fn sessions_page(
    pool: &PgPool,
    f: &SessionsFilter<'_>,
) -> sqlx::Result<(SessionsAggregate, Vec<SessionRow>)> {
    let where_clause = "WHERE ($1::timestamptz IS NULL OR created_at >= $1)
          AND ($2::text IS NULL OR game_id = $2)
          AND ($3::uuid IS NULL OR player_id = $3)
          AND ($4::text IS NULL OR name ILIKE '%' || $4 || '%'
               OR game_id ILIKE '%' || $4 || '%'
               OR player_id::text ILIKE '%' || $4 || '%')";

    let agg: SessionsAggregate = sqlx::query_as(&format!(
        "SELECT count(*) AS total,
                COALESCE(sum(duration_sec), 0)::bigint AS total_seconds,
                count(DISTINCT player_id) AS unique_players
         FROM play_sessions {where_clause}"
    ))
    .bind(f.since)
    .bind(f.game)
    .bind(f.player)
    .bind(f.query)
    .fetch_one(pool)
    .await?;

    let order = match f.sort {
        "duration" => "duration_sec DESC, created_at DESC",
        "score" => "score DESC, created_at DESC",
        _ => "created_at DESC",
    };
    let offset = (f.page - 1).max(0) * f.per_page;
    let rows: Vec<SessionRow> = sqlx::query_as(&format!(
        "SELECT id, player_id, name, game_id, duration_sec, score, started_at, created_at
         FROM play_sessions {where_clause}
         ORDER BY {order} LIMIT $5 OFFSET $6"
    ))
    .bind(f.since)
    .bind(f.game)
    .bind(f.player)
    .bind(f.query)
    .bind(f.per_page)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    Ok((agg, rows))
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
    pub messages: i64,
    pub favorite_game: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_seen_at: DateTime<Utc>,
}

const PLAYER_CTE: &str = "WITH p_stats AS (
    SELECT p.id,
           COALESCE(
               p.name,
               (SELECT s.name FROM play_sessions s WHERE s.player_id = p.id ORDER BY s.created_at DESC LIMIT 1)
           ) AS name,
           p.email,
           (p.google_sub IS NOT NULL) AS google,
           (SELECT count(*) FROM play_sessions s WHERE s.player_id = p.id) AS sessions,
           (SELECT COALESCE(sum(duration_sec), 0)::bigint FROM play_sessions s WHERE s.player_id = p.id) AS play_seconds,
           (SELECT count(*) FROM entries e WHERE e.player_id = p.id) AS entries,
           (SELECT count(*) FROM chat_messages m WHERE m.player_id = p.id AND NOT m.deleted) AS messages,
           (SELECT s.game_id FROM play_sessions s WHERE s.player_id = p.id
            GROUP BY s.game_id ORDER BY sum(s.duration_sec) DESC, count(*) DESC LIMIT 1) AS favorite_game,
           p.created_at,
           p.last_seen_at
    FROM players p
)";

pub struct PlayersFilter<'a> {
    pub query: Option<&'a str>,
    pub kind: &'a str,
    pub sort: &'a str,
    pub page: i64,
    pub per_page: i64,
}

pub async fn players_page(pool: &PgPool, f: &PlayersFilter<'_>) -> sqlx::Result<Page<PlayerSummary>> {
    let kind_filter = match f.kind {
        "google" => "AND google = true",
        "anon" => "AND google = false",
        "active" => "AND sessions > 0",
        _ => "",
    };
    let where_clause = format!(
        "WHERE ($1::text IS NULL OR name ILIKE '%' || $1 || '%'
                OR email ILIKE '%' || $1 || '%'
                OR id::text ILIKE '%' || $1 || '%'
                OR favorite_game ILIKE '%' || $1 || '%') {kind_filter}"
    );
    let order = match f.sort {
        "time" => "play_seconds DESC, sessions DESC, last_seen_at DESC",
        "sessions" => "sessions DESC, play_seconds DESC, last_seen_at DESC",
        "entries" => "entries DESC, play_seconds DESC, last_seen_at DESC",
        "created" => "created_at DESC",
        "name" => "COALESCE(name, 'zzzz') ASC, play_seconds DESC",
        _ => "last_seen_at DESC",
    };

    let total: i64 = sqlx::query_scalar(&format!("{PLAYER_CTE} SELECT count(*) FROM p_stats {where_clause}"))
        .bind(f.query)
        .fetch_one(pool)
        .await?;

    let offset = (f.page - 1).max(0) * f.per_page;
    let items: Vec<PlayerSummary> = sqlx::query_as(&format!(
        "{PLAYER_CTE}
         SELECT id, name, email, google, sessions, play_seconds, entries, messages,
                favorite_game, created_at, last_seen_at
         FROM p_stats {where_clause}
         ORDER BY {order} LIMIT $2 OFFSET $3"
    ))
    .bind(f.query)
    .bind(f.per_page)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    Ok(Page { items, total, page: f.page, per_page: f.per_page })
}

pub async fn player_by_id(pool: &PgPool, id: Uuid) -> sqlx::Result<Option<PlayerSummary>> {
    sqlx::query_as(&format!(
        "{PLAYER_CTE}
         SELECT id, name, email, google, sessions, play_seconds, entries, messages,
                favorite_game, created_at, last_seen_at
         FROM p_stats WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
}

#[derive(Debug, Serialize, FromRow)]
pub struct PlayerGameStats {
    pub game_id: String,
    pub sessions: i64,
    pub play_seconds: i64,
    pub best_score: i64,
    pub last_played_at: DateTime<Utc>,
}

pub async fn player_games(pool: &PgPool, player: Uuid) -> sqlx::Result<Vec<PlayerGameStats>> {
    sqlx::query_as(
        "SELECT game_id, count(*) AS sessions, COALESCE(sum(duration_sec), 0)::bigint AS play_seconds,
                COALESCE(max(score), 0)::bigint AS best_score, max(created_at) AS last_played_at
         FROM play_sessions WHERE player_id = $1
         GROUP BY game_id ORDER BY play_seconds DESC, sessions DESC",
    )
    .bind(player)
    .fetch_all(pool)
    .await
}

#[derive(Debug, Serialize, FromRow)]
pub struct AdminEntryRow {
    pub id: Uuid,
    pub game_id: String,
    pub player: Uuid,
    pub name: String,
    pub score: i64,
    pub details: Value,
    pub date: DateTime<Utc>,
    pub rank: i64,
}

pub struct EntriesFilter<'a> {
    pub game: Option<&'a str>,
    pub player: Option<Uuid>,
    pub query: Option<&'a str>,
    pub sort: &'a str,
    pub page: i64,
    pub per_page: i64,
}

pub async fn entries_page(pool: &PgPool, f: &EntriesFilter<'_>) -> sqlx::Result<Page<AdminEntryRow>> {
    let cte = "WITH ranked AS (
        SELECT id, game_id, player_id AS player, name, score, details, created_at AS date,
               row_number() OVER (PARTITION BY game_id ORDER BY score DESC, created_at ASC) AS rank
        FROM entries
        WHERE ($1::text IS NULL OR game_id = $1)
    )";
    let where_clause = "WHERE ($2::uuid IS NULL OR player = $2)
          AND ($3::text IS NULL OR name ILIKE '%' || $3 || '%'
               OR player::text ILIKE '%' || $3 || '%'
               OR game_id ILIKE '%' || $3 || '%')";

    let total: i64 = sqlx::query_scalar(&format!("{cte} SELECT count(*) FROM ranked {where_clause}"))
        .bind(f.game)
        .bind(f.player)
        .bind(f.query)
        .fetch_one(pool)
        .await?;

    let order = match f.sort {
        "recent" => "date DESC",
        _ => "score DESC, date ASC",
    };
    let offset = (f.page - 1).max(0) * f.per_page;
    let items: Vec<AdminEntryRow> = sqlx::query_as(&format!(
        "{cte}
         SELECT id, game_id, player, name, score, details, date, rank
         FROM ranked {where_clause}
         ORDER BY {order} LIMIT $4 OFFSET $5"
    ))
    .bind(f.game)
    .bind(f.player)
    .bind(f.query)
    .bind(f.per_page)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    Ok(Page { items, total, page: f.page, per_page: f.per_page })
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

#[derive(Debug, Serialize, FromRow)]
pub struct AdminMessageRow {
    pub id: Uuid,
    pub room: String,
    pub player_id: Uuid,
    pub name: String,
    pub text: String,
    pub deleted: bool,
    pub reports: i64,
    pub created_at: DateTime<Utc>,
}

pub struct MessagesFilter<'a> {
    pub room: Option<&'a str>,
    pub player: Option<Uuid>,
    pub query: Option<&'a str>,
    pub status: &'a str,
    pub page: i64,
    pub per_page: i64,
}

pub async fn messages_page(pool: &PgPool, f: &MessagesFilter<'_>) -> sqlx::Result<Page<AdminMessageRow>> {
    let status_clause = match f.status {
        "active" => "AND NOT m.deleted",
        "deleted" => "AND m.deleted",
        "reported" => "AND EXISTS (SELECT 1 FROM chat_reports r WHERE r.message_id = m.id)",
        _ => "",
    };
    let where_clause = format!(
        "WHERE ($1::text IS NULL OR m.room = $1)
           AND ($2::uuid IS NULL OR m.player_id = $2)
           AND ($3::text IS NULL OR m.name ILIKE '%' || $3 || '%'
                OR m.text ILIKE '%' || $3 || '%'
                OR m.player_id::text ILIKE '%' || $3 || '%')
           {status_clause}"
    );

    let total: i64 = sqlx::query_scalar(&format!("SELECT count(*) FROM chat_messages m {where_clause}"))
        .bind(f.room)
        .bind(f.player)
        .bind(f.query)
        .fetch_one(pool)
        .await?;

    let offset = (f.page - 1).max(0) * f.per_page;
    let items: Vec<AdminMessageRow> = sqlx::query_as(&format!(
        "SELECT m.id, m.room, m.player_id, m.name, m.text, m.deleted,
                (SELECT count(*) FROM chat_reports r WHERE r.message_id = m.id) AS reports,
                m.created_at
         FROM chat_messages m {where_clause}
         ORDER BY m.created_at DESC LIMIT $4 OFFSET $5"
    ))
    .bind(f.room)
    .bind(f.player)
    .bind(f.query)
    .bind(f.per_page)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    Ok(Page { items, total, page: f.page, per_page: f.per_page })
}

/// Closes the reports on a message (after moderating it or deciding it is fine).
pub async fn dismiss_reports(pool: &PgPool, message: Uuid) -> sqlx::Result<u64> {
    Ok(sqlx::query("DELETE FROM chat_reports WHERE message_id = $1")
        .bind(message)
        .execute(pool)
        .await?
        .rows_affected())
}

#[derive(Debug, Serialize, FromRow)]
pub struct LivePulse {
    pub sessions_5m: i64,
    pub sessions_15m: i64,
    pub sessions_60m: i64,
    pub active_players_15m: i64,
    pub active_players_60m: i64,
    pub entries_60m: i64,
    pub messages_60m: i64,
    pub errors_24h: i64,
}

pub async fn live_pulse(pool: &PgPool) -> sqlx::Result<LivePulse> {
    sqlx::query_as(
        "SELECT
           (SELECT count(*) FROM play_sessions WHERE created_at > now() - interval '5 minutes') AS sessions_5m,
           (SELECT count(*) FROM play_sessions WHERE created_at > now() - interval '15 minutes') AS sessions_15m,
           (SELECT count(*) FROM play_sessions WHERE created_at > now() - interval '60 minutes') AS sessions_60m,
           (SELECT count(DISTINCT player_id) FROM play_sessions WHERE created_at > now() - interval '15 minutes') AS active_players_15m,
           (SELECT count(DISTINCT player_id) FROM play_sessions WHERE created_at > now() - interval '60 minutes') AS active_players_60m,
           (SELECT count(*) FROM entries WHERE created_at > now() - interval '60 minutes') AS entries_60m,
           (SELECT count(*) FROM chat_messages WHERE NOT deleted AND created_at > now() - interval '60 minutes') AS messages_60m,
           (SELECT count(*) FROM client_errors WHERE created_at > now() - interval '24 hours') AS errors_24h",
    )
    .fetch_one(pool)
    .await
}

#[derive(Debug, Serialize, FromRow)]
pub struct FunnelStats {
    pub total_players: i64,
    pub played_1: i64,
    pub played_5: i64,
    pub google_linked: i64,
    pub ranked: i64,
    pub chatted: i64,
}

pub async fn funnel(pool: &PgPool) -> sqlx::Result<FunnelStats> {
    sqlx::query_as(
        "SELECT
           (SELECT count(*) FROM players) AS total_players,
           (SELECT count(DISTINCT player_id) FROM play_sessions) AS played_1,
           (SELECT count(*) FROM (SELECT player_id FROM play_sessions GROUP BY player_id HAVING count(*) >= 5) t) AS played_5,
           (SELECT count(*) FROM players WHERE google_sub IS NOT NULL) AS google_linked,
           (SELECT count(DISTINCT player_id) FROM entries) AS ranked,
           (SELECT count(DISTINCT player_id) FROM chat_messages WHERE NOT deleted) AS chatted",
    )
    .fetch_one(pool)
    .await
}

#[derive(Debug, Serialize, FromRow)]
pub struct RetentionStats {
    pub returning_players: i64,
    pub multi_session_players: i64,
    pub d1_eligible: i64,
    pub d1_retained: i64,
    pub d7_eligible: i64,
    pub d7_retained: i64,
    pub d30_eligible: i64,
    pub d30_retained: i64,
}

pub async fn retention(pool: &PgPool) -> sqlx::Result<RetentionStats> {
    sqlx::query_as(
        "SELECT
           (SELECT count(*) FROM (
              SELECT player_id FROM play_sessions
              GROUP BY player_id HAVING count(DISTINCT (created_at AT TIME ZONE 'UTC')::date) >= 2
           ) r) AS returning_players,
           (SELECT count(*) FROM (
              SELECT player_id FROM play_sessions GROUP BY player_id HAVING count(*) >= 2
           ) m) AS multi_session_players,
           (SELECT count(*) FROM players WHERE created_at <= now() - interval '1 day') AS d1_eligible,
           (SELECT count(*) FROM players p
              WHERE p.created_at <= now() - interval '1 day'
                AND EXISTS (
                  SELECT 1 FROM play_sessions s
                  WHERE s.player_id = p.id AND s.created_at >= p.created_at + interval '1 day'
                )) AS d1_retained,
           (SELECT count(*) FROM players WHERE created_at <= now() - interval '7 days') AS d7_eligible,
           (SELECT count(*) FROM players p
              WHERE p.created_at <= now() - interval '7 days'
                AND EXISTS (
                  SELECT 1 FROM play_sessions s
                  WHERE s.player_id = p.id AND s.created_at >= p.created_at + interval '7 days'
                )) AS d7_retained,
           (SELECT count(*) FROM players WHERE created_at <= now() - interval '30 days') AS d30_eligible,
           (SELECT count(*) FROM players p
              WHERE p.created_at <= now() - interval '30 days'
                AND EXISTS (
                  SELECT 1 FROM play_sessions s
                  WHERE s.player_id = p.id AND s.created_at >= p.created_at + interval '30 days'
                )) AS d30_retained",
    )
    .fetch_one(pool)
    .await
}

#[derive(Debug, Serialize, FromRow)]
pub struct HourlyCell {
    /// 0 = Sunday .. 6 = Saturday (in BRT, UTC-3).
    pub dow: i32,
    /// 0..=23 (in BRT, UTC-3).
    pub hour: i32,
    pub sessions: i64,
    pub players: i64,
}

pub async fn hourly_heatmap(pool: &PgPool, days: i32) -> sqlx::Result<Vec<HourlyCell>> {
    sqlx::query_as(
        "SELECT EXTRACT(DOW FROM (created_at - interval '3 hours'))::int AS dow,
                EXTRACT(HOUR FROM (created_at - interval '3 hours'))::int AS hour,
                count(*) AS sessions,
                count(DISTINCT player_id) AS players
         FROM play_sessions
         WHERE created_at > now() - make_interval(days => $1)
         GROUP BY dow, hour
         ORDER BY dow, hour",
    )
    .bind(days)
    .fetch_all(pool)
    .await
}

#[derive(Debug, Serialize, FromRow)]
pub struct GameHealthRow {
    pub game_id: String,
    pub sessions: i64,
    pub short_sessions: i64,
    pub avg_duration_sec: i64,
    pub max_duration_sec: i64,
    pub avg_score: i64,
    pub max_score: i64,
}

pub async fn game_health(pool: &PgPool) -> sqlx::Result<Vec<GameHealthRow>> {
    sqlx::query_as(
        "SELECT game_id,
                count(*) AS sessions,
                count(*) FILTER (WHERE duration_sec < 10) AS short_sessions,
                COALESCE(round(avg(duration_sec)), 0)::bigint AS avg_duration_sec,
                COALESCE(max(duration_sec), 0)::bigint AS max_duration_sec,
                COALESCE(round(avg(score)), 0)::bigint AS avg_score,
                COALESCE(max(score), 0)::bigint AS max_score
         FROM play_sessions
         GROUP BY game_id
         ORDER BY sessions DESC",
    )
    .fetch_all(pool)
    .await
}

#[derive(Debug, Serialize, FromRow)]
pub struct AnomalyRow {
    pub entry_id: Uuid,
    pub game_id: String,
    pub player_id: Uuid,
    pub player_name: String,
    pub score: i64,
    pub max_session_score: Option<i64>,
    pub session_count: i64,
    pub min_duration_sec: Option<i32>,
    pub reason: String,
    pub severity: String,
    pub created_at: DateTime<Utc>,
}

pub async fn anomalies(pool: &PgPool) -> sqlx::Result<Vec<AnomalyRow>> {
    sqlx::query_as(
        "SELECT e.id AS entry_id, e.game_id, e.player_id, e.name AS player_name, e.score,
                s_agg.max_score AS max_session_score,
                COALESCE(s_agg.cnt, 0) AS session_count,
                s_agg.min_dur AS min_duration_sec,
                CASE
                  WHEN COALESCE(s_agg.cnt, 0) = 0 THEN 'no_session'
                  WHEN e.score > COALESCE(s_agg.max_score, 0) AND COALESCE(s_agg.max_score, 0) > 0 THEN 'score_mismatch'
                  ELSE 'short_high_score'
                END AS reason,
                CASE
                  WHEN COALESCE(s_agg.cnt, 0) = 0 OR e.score > COALESCE(s_agg.max_score, 0) THEN 'high'
                  ELSE 'medium'
                END AS severity,
                e.created_at
         FROM entries e
         LEFT JOIN (
             SELECT player_id, game_id, count(*) AS cnt, max(score) AS max_score, min(duration_sec) AS min_dur
             FROM play_sessions
             GROUP BY player_id, game_id
         ) s_agg ON s_agg.player_id = e.player_id AND s_agg.game_id = e.game_id
         WHERE COALESCE(s_agg.cnt, 0) = 0
            OR (e.score > COALESCE(s_agg.max_score, 0) AND COALESCE(s_agg.max_score, 0) > 0)
            OR (COALESCE(s_agg.min_dur, 999) <= 4 AND e.score >= 500)
         ORDER BY
            CASE WHEN COALESCE(s_agg.cnt, 0) = 0 THEN 0 ELSE 1 END,
            e.score DESC,
            e.created_at DESC
         LIMIT 100",
    )
    .fetch_all(pool)
    .await
}

#[derive(Debug, Serialize, FromRow)]
pub struct TableStat {
    pub table_name: String,
    pub rows: i64,
    pub size_bytes: i64,
}

#[derive(Debug, Serialize)]
pub struct DbHealth {
    pub database_size_bytes: i64,
    pub pool_size: u32,
    pub pool_idle: usize,
    pub tables: Vec<TableStat>,
}

pub async fn db_health(pool: &PgPool) -> sqlx::Result<DbHealth> {
    let database_size_bytes: i64 =
        sqlx::query_scalar("SELECT pg_database_size(current_database())::bigint")
            .fetch_one(pool)
            .await?;
    let tables: Vec<TableStat> = sqlx::query_as(
        "SELECT 'players' AS table_name, (SELECT count(*) FROM players) AS rows, pg_total_relation_size('players')::bigint AS size_bytes
         UNION ALL
         SELECT 'play_sessions', (SELECT count(*) FROM play_sessions), pg_total_relation_size('play_sessions')::bigint
         UNION ALL
         SELECT 'entries', (SELECT count(*) FROM entries), pg_total_relation_size('entries')::bigint
         UNION ALL
         SELECT 'chat_messages', (SELECT count(*) FROM chat_messages), pg_total_relation_size('chat_messages')::bigint
         UNION ALL
         SELECT 'chat_reports', (SELECT count(*) FROM chat_reports), pg_total_relation_size('chat_reports')::bigint
         UNION ALL
         SELECT 'client_errors', (SELECT count(*) FROM client_errors), pg_total_relation_size('client_errors')::bigint",
    )
    .fetch_all(pool)
    .await?;

    Ok(DbHealth {
        database_size_bytes,
        pool_size: pool.size(),
        pool_idle: pool.num_idle(),
        tables,
    })
}

#[derive(Debug, Serialize, FromRow)]
pub struct ErrorGroupRow {
    pub kind: String,
    pub message: String,
    pub game_id: String,
    pub occurrences: i64,
    pub affected_players: i64,
    pub last_seen_at: DateTime<Utc>,
}

pub async fn error_groups(pool: &PgPool) -> sqlx::Result<Vec<ErrorGroupRow>> {
    sqlx::query_as(
        "SELECT kind, message, game_id, count(*) AS occurrences,
                count(DISTINCT player_id) AS affected_players,
                max(created_at) AS last_seen_at
         FROM client_errors
         GROUP BY kind, message, game_id
         ORDER BY occurrences DESC, last_seen_at DESC
         LIMIT 25",
    )
    .fetch_all(pool)
    .await
}

#[derive(Debug, Serialize, FromRow)]
pub struct ClientErrorRow {
    pub id: i64,
    pub player_id: Option<Uuid>,
    pub kind: String,
    pub message: String,
    pub stack: String,
    pub game_id: String,
    pub url: String,
    pub user_agent: String,
    pub created_at: DateTime<Utc>,
}

pub struct ErrorsFilter<'a> {
    pub kind: Option<&'a str>,
    pub game: Option<&'a str>,
    pub query: Option<&'a str>,
    pub page: i64,
    pub per_page: i64,
}

pub async fn errors_page(pool: &PgPool, f: &ErrorsFilter<'_>) -> sqlx::Result<Page<ClientErrorRow>> {
    let where_clause = "WHERE ($1::text IS NULL OR kind = $1)
          AND ($2::text IS NULL OR game_id = $2)
          AND ($3::text IS NULL OR message ILIKE '%' || $3 || '%'
               OR stack ILIKE '%' || $3 || '%'
               OR url ILIKE '%' || $3 || '%'
               OR user_agent ILIKE '%' || $3 || '%')";

    let total: i64 = sqlx::query_scalar(&format!("SELECT count(*) FROM client_errors {where_clause}"))
        .bind(f.kind)
        .bind(f.game)
        .bind(f.query)
        .fetch_one(pool)
        .await?;

    let offset = (f.page - 1).max(0) * f.per_page;
    let items: Vec<ClientErrorRow> = sqlx::query_as(&format!(
        "SELECT id, player_id, kind, message, stack, game_id, url, user_agent, created_at
         FROM client_errors {where_clause}
         ORDER BY created_at DESC LIMIT $4 OFFSET $5"
    ))
    .bind(f.kind)
    .bind(f.game)
    .bind(f.query)
    .bind(f.per_page)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    Ok(Page { items, total, page: f.page, per_page: f.per_page })
}

pub async fn clear_client_errors(pool: &PgPool) -> sqlx::Result<u64> {
    Ok(sqlx::query("DELETE FROM client_errors").execute(pool).await?.rows_affected())
}

pub async fn delete_client_error(pool: &PgPool, id: i64) -> sqlx::Result<bool> {
    Ok(sqlx::query("DELETE FROM client_errors WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected()
        > 0)
}
