use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::dto::SessionDto;
use crate::{
    auth::AdminPlayer,
    domain::games,
    error::{AppError, AppResult},
    repo::{admin, chat, entries},
    state::AppState,
};

#[derive(Deserialize)]
pub struct OverviewQuery {
    days: Option<i32>,
}

#[derive(Serialize)]
pub struct Overview {
    totals: admin::Totals,
    games: Vec<admin::GameStats>,
    daily: Vec<admin::DayStats>,
    top_players: Vec<admin::PlayerSummary>,
}

pub async fn overview(
    State(s): State<AppState>,
    _: AdminPlayer,
    Query(q): Query<OverviewQuery>,
) -> AppResult<Json<Overview>> {
    let days = q.days.unwrap_or(30).clamp(7, 365);
    let top_players = admin::players_page(
        &s.db,
        &admin::PlayersFilter { query: None, kind: "active", sort: "time", page: 1, per_page: 10 },
    )
    .await?
    .items;
    Ok(Json(Overview {
        totals: admin::totals(&s.db).await?,
        games: admin::per_game(&s.db).await?,
        daily: admin::daily(&s.db, days).await?,
        top_players,
    }))
}

#[derive(Deserialize)]
pub struct SessionsQuery {
    game: Option<String>,
    player: Option<Uuid>,
    q: Option<String>,
    days: Option<i64>,
    sort: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Serialize)]
pub struct SessionsPage {
    items: Vec<SessionDto>,
    total: i64,
    page: i64,
    per_page: i64,
    total_seconds: i64,
    unique_players: i64,
}

pub async fn sessions(
    State(s): State<AppState>,
    _: AdminPlayer,
    Query(q): Query<SessionsQuery>,
) -> AppResult<Json<SessionsPage>> {
    let game = q.game.as_deref().map(str::trim).filter(|g| !g.is_empty() && *g != "all");
    if game.is_some_and(|g| !games::is_game(g)) {
        return Err(AppError::NotFound);
    }
    let days = q.days.unwrap_or(30);
    let since = (days > 0).then(|| Utc::now() - Duration::days(days.clamp(1, 3650)));
    let query = q.q.as_deref().map(str::trim).filter(|t| !t.is_empty());
    let sort = q.sort.as_deref().unwrap_or("recent");
    let page = q.page.unwrap_or(1).max(1);
    let per_page = q.per_page.or(q.limit).unwrap_or(25).clamp(1, 1000);

    let (agg, rows) = admin::sessions_page(
        &s.db,
        &admin::SessionsFilter { since, game, player: q.player, query, sort, page, per_page },
    )
    .await?;

    Ok(Json(SessionsPage {
        items: rows.into_iter().map(Into::into).collect(),
        total: agg.total,
        page,
        per_page,
        total_seconds: agg.total_seconds,
        unique_players: agg.unique_players,
    }))
}

#[derive(Deserialize)]
pub struct PlayersQuery {
    q: Option<String>,
    kind: Option<String>,
    sort: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
    limit: Option<i64>,
}

pub async fn players(
    State(s): State<AppState>,
    _: AdminPlayer,
    Query(q): Query<PlayersQuery>,
) -> AppResult<Json<admin::Page<admin::PlayerSummary>>> {
    let query = q.q.as_deref().map(str::trim).filter(|t| !t.is_empty());
    let kind = q.kind.as_deref().unwrap_or("all");
    let sort = q.sort.as_deref().unwrap_or("recent");
    let page = q.page.unwrap_or(1).max(1);
    let per_page = q.per_page.or(q.limit).unwrap_or(25).clamp(1, 500);
    Ok(Json(
        admin::players_page(&s.db, &admin::PlayersFilter { query, kind, sort, page, per_page }).await?,
    ))
}

#[derive(Serialize)]
pub struct PlayerDetail {
    player: admin::PlayerSummary,
    games: Vec<admin::PlayerGameStats>,
    recent_sessions: Vec<SessionDto>,
    entries: Vec<admin::AdminEntryRow>,
    recent_messages: Vec<admin::AdminMessageRow>,
}

pub async fn player_detail(
    State(s): State<AppState>,
    _: AdminPlayer,
    Path(id): Path<Uuid>,
) -> AppResult<Json<PlayerDetail>> {
    let player = admin::player_by_id(&s.db, id).await?.ok_or(AppError::NotFound)?;
    let games = admin::player_games(&s.db, id).await?;
    let (_, sessions) = admin::sessions_page(
        &s.db,
        &admin::SessionsFilter {
            since: None,
            game: None,
            player: Some(id),
            query: None,
            sort: "recent",
            page: 1,
            per_page: 50,
        },
    )
    .await?;
    let entries = admin::entries_page(
        &s.db,
        &admin::EntriesFilter {
            game: None,
            player: Some(id),
            query: None,
            sort: "recent",
            page: 1,
            per_page: 100,
        },
    )
    .await?
    .items;
    let recent_messages = admin::messages_page(
        &s.db,
        &admin::MessagesFilter {
            room: None,
            player: Some(id),
            query: None,
            status: "all",
            page: 1,
            per_page: 30,
        },
    )
    .await?
    .items;

    Ok(Json(PlayerDetail {
        player,
        games,
        recent_sessions: sessions.into_iter().map(Into::into).collect(),
        entries,
        recent_messages,
    }))
}

#[derive(Deserialize)]
pub struct EntriesQuery {
    game: Option<String>,
    player: Option<Uuid>,
    q: Option<String>,
    sort: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
}

pub async fn entries_list(
    State(s): State<AppState>,
    _: AdminPlayer,
    Query(q): Query<EntriesQuery>,
) -> AppResult<Json<admin::Page<admin::AdminEntryRow>>> {
    let game = q.game.as_deref().map(str::trim).filter(|g| !g.is_empty() && *g != "all");
    if game.is_some_and(|g| !games::is_game(g)) {
        return Err(AppError::NotFound);
    }
    let query = q.q.as_deref().map(str::trim).filter(|t| !t.is_empty());
    let sort = q.sort.as_deref().unwrap_or("score");
    let page = q.page.unwrap_or(1).max(1);
    let per_page = q.per_page.unwrap_or(25).clamp(1, 200);
    Ok(Json(
        admin::entries_page(
            &s.db,
            &admin::EntriesFilter { game, player: q.player, query, sort, page, per_page },
        )
        .await?,
    ))
}

/// Removes a run from a ranking (cheating, offensive nickname...).
pub async fn delete_entry(
    State(s): State<AppState>,
    _: AdminPlayer,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    if entries::delete(&s.db, id).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound)
    }
}

pub async fn reports(State(s): State<AppState>, _: AdminPlayer) -> AppResult<Json<Vec<admin::ReportRow>>> {
    Ok(Json(admin::reports(&s.db).await?))
}

#[derive(Deserialize)]
pub struct MessagesQuery {
    room: Option<String>,
    player: Option<Uuid>,
    q: Option<String>,
    status: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
}

pub async fn messages_list(
    State(s): State<AppState>,
    _: AdminPlayer,
    Query(q): Query<MessagesQuery>,
) -> AppResult<Json<admin::Page<admin::AdminMessageRow>>> {
    let room = q.room.as_deref().map(str::trim).filter(|r| !r.is_empty() && *r != "all");
    let query = q.q.as_deref().map(str::trim).filter(|t| !t.is_empty());
    let status = q.status.as_deref().unwrap_or("all");
    let page = q.page.unwrap_or(1).max(1);
    let per_page = q.per_page.unwrap_or(25).clamp(1, 200);
    Ok(Json(
        admin::messages_page(
            &s.db,
            &admin::MessagesFilter { room, player: q.player, query, status, page, per_page },
        )
        .await?,
    ))
}

/// Closes the reports on a message without touching it.
pub async fn dismiss_reports(
    State(s): State<AppState>,
    _: AdminPlayer,
    Path(message): Path<Uuid>,
) -> AppResult<StatusCode> {
    admin::dismiss_reports(&s.db, message).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Blanks a message for everyone, live, and closes its reports.
pub async fn moderate_message(
    State(s): State<AppState>,
    _: AdminPlayer,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let row = chat::blank(&s.db, None, id, None).await?.ok_or(AppError::NotFound)?;
    admin::dismiss_reports(&s.db, id).await?;
    let room = row.room.clone();
    s.hub.publish_room(&room, "update", &super::dto::MessageDto::from(row));
    Ok(StatusCode::NO_CONTENT)
}
