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
    repo::{admin, chat, entries, sessions},
    state::AppState,
};

#[derive(Serialize)]
pub struct Overview {
    totals: admin::Totals,
    games: Vec<admin::GameStats>,
    daily: Vec<admin::DayStats>,
}

pub async fn overview(State(s): State<AppState>, _: AdminPlayer) -> AppResult<Json<Overview>> {
    Ok(Json(Overview {
        totals: admin::totals(&s.db).await?,
        games: admin::per_game(&s.db).await?,
        daily: admin::daily(&s.db, 14).await?,
    }))
}

#[derive(Deserialize)]
pub struct SessionsQuery {
    game: Option<String>,
    days: Option<i64>,
    limit: Option<i64>,
}

pub async fn sessions(
    State(s): State<AppState>,
    _: AdminPlayer,
    Query(q): Query<SessionsQuery>,
) -> AppResult<Json<Vec<SessionDto>>> {
    if q.game.as_deref().is_some_and(|g| !games::is_game(g)) {
        return Err(AppError::NotFound);
    }
    let since = Utc::now() - Duration::days(q.days.unwrap_or(30).clamp(1, 3650));
    let rows = sessions::recent(&s.db, since, q.game.as_deref(), q.limit.unwrap_or(200).clamp(1, 1000)).await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

#[derive(Deserialize)]
pub struct PlayersQuery {
    q: Option<String>,
    limit: Option<i64>,
}

pub async fn players(
    State(s): State<AppState>,
    _: AdminPlayer,
    Query(q): Query<PlayersQuery>,
) -> AppResult<Json<Vec<admin::PlayerSummary>>> {
    let term = q.q.as_deref().map(str::trim).filter(|t| !t.is_empty());
    Ok(Json(admin::players(&s.db, term, q.limit.unwrap_or(100).clamp(1, 500)).await?))
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
