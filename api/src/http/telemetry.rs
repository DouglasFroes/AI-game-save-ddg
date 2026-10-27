use axum::{extract::State, http::StatusCode, Json};
use chrono::{Duration, Utc};
use serde::Deserialize;

use super::dto::SessionDto;
use crate::{
    auth::AuthPlayer,
    domain::session::NewSession,
    error::{AppError, AppResult},
    repo::sessions,
    state::AppState,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSessionBody {
    id: String,
    name: String,
    game_id: String,
    duration_sec: f64,
    score: f64,
    started_at: String,
}

/// Records a stretch of play. Any player, anonymous included.
pub async fn record(
    State(state): State<AppState>,
    who: AuthPlayer,
    Json(b): Json<NewSessionBody>,
) -> AppResult<StatusCode> {
    let s = NewSession::parse(&b.id, &b.name, &b.game_id, b.duration_sec, b.score, &b.started_at)?;
    sessions::record(&state.db, who.id, &s).await.map_err(|e| match e {
        // The player was removed (an old token): sign in again.
        sqlx::Error::Database(d) if d.is_foreign_key_violation() => AppError::Unauthorized,
        other => other.into(),
    })?;
    Ok(StatusCode::NO_CONTENT)
}

/// The last week of play, without anyone's identity: it only feeds the "most played" shelf.
pub async fn recent(State(state): State<AppState>) -> AppResult<Json<Vec<SessionDto>>> {
    let since = Utc::now() - Duration::days(7);
    let rows = sessions::recent(&state.db, since, None, 2000).await?;
    Ok(Json(rows.into_iter().map(SessionDto::anonymous).collect()))
}
