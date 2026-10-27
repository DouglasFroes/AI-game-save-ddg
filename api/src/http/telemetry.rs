use axum::{
    extract::State,
    http::{
        header::{AUTHORIZATION, USER_AGENT},
        HeaderMap, StatusCode,
    },
    Json,
};
use chrono::{Duration, Utc};
use serde::Deserialize;

use super::dto::SessionDto;
use crate::{
    auth::AuthPlayer,
    domain::session::{NewClientError, NewSession},
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientErrorBody {
    kind: String,
    message: String,
    #[serde(default)]
    stack: String,
    #[serde(default)]
    game_id: String,
    #[serde(default)]
    url: String,
}

/// Records a client-side exception, unhandled rejection or WebGL context loss.
pub async fn report_error(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(b): Json<ClientErrorBody>,
) -> AppResult<StatusCode> {
    let ua = headers.get(USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("");
    let err = NewClientError::parse(&b.kind, &b.message, &b.stack, &b.game_id, &b.url, ua)?;
    let player = headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .and_then(|t| state.tokens.verify(t))
        .map(|id| id.player);
    sessions::record_error(&state.db, player, &err).await?;
    Ok(StatusCode::NO_CONTENT)
}
