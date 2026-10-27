use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::Value;

use super::dto::EntryDto;
use crate::{
    auth::GooglePlayer,
    domain::{entry::NewEntry, games},
    error::{AppError, AppResult},
    repo::entries,
    state::AppState,
};

const MAX_LIMIT: i64 = 100;
/// A player can send at most this many runs in 10 s (a game can end a few times in a row).
const BURST: i64 = 10;

/// The ids of every game that has a board.
pub async fn games() -> Json<&'static [&'static str]> {
    Json(games::GAME_IDS)
}

#[derive(Deserialize)]
pub struct ListQuery {
    limit: Option<i64>,
}

/// A board's best runs. Public.
pub async fn list(
    State(state): State<AppState>,
    Path(game): Path<String>,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Vec<EntryDto>>> {
    if !games::is_game(&game) {
        return Err(AppError::NotFound);
    }
    let limit = q.limit.unwrap_or(20).clamp(1, MAX_LIMIT);
    let rows = entries::top(&state.db, &game, limit).await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

#[derive(Deserialize)]
pub struct NewRun {
    name: String,
    score: f64,
    details: Option<Value>,
}

/// Sends a run. Only Google players may, and always in their own name.
pub async fn submit(
    State(state): State<AppState>,
    GooglePlayer(player): GooglePlayer,
    Path(game): Path<String>,
    Json(run): Json<NewRun>,
) -> AppResult<(StatusCode, Json<EntryDto>)> {
    let entry = NewEntry::parse(&game, &run.name, run.score, run.details)?;
    if entries::recent_by(&state.db, player, 10).await? >= BURST {
        return Err(AppError::TooManyRequests("too many runs, slow down"));
    }
    let row = entries::submit(&state.db, player, &entry).await?;
    Ok((StatusCode::CREATED, Json(row.into())))
}
