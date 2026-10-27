use axum::{
    extract::State,
    http::{header::AUTHORIZATION, HeaderMap},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::{
        google::GoogleError,
        token::Identity,
        AuthPlayer,
    },
    error::{AppError, AppResult},
    repo::players,
    state::AppState,
};

#[derive(Serialize)]
pub struct Account {
    email: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    token: String,
    player_id: Uuid,
    google: bool,
    account: Option<Account>,
    /// Runs brought over from this device's anonymous player (Google sign-in only).
    moved: u64,
}

impl Session {
    fn new(state: &AppState, player: &players::Player, moved: u64) -> Self {
        let google = player.google_sub.is_some();
        Self {
            token: state.tokens.issue(Identity { player: player.id, google }),
            player_id: player.id,
            google,
            account: google.then(|| Account {
                email: player.email.clone().unwrap_or_default(),
                name: player.name.clone().unwrap_or_default(),
            }),
            moved,
        }
    }
}

/// A fresh anonymous player: can play and be measured, but not rank or chat.
pub async fn anonymous(State(state): State<AppState>) -> AppResult<Json<Session>> {
    let player = players::create_anonymous(&state.db).await?;
    Ok(Json(Session::new(&state, &player, 0)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleLogin {
    access_token: String,
}

/// Signs in with a Google access token. Send the device's anonymous token in `Authorization`
/// to keep its runs: they are moved to the Google account.
pub async fn google(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<GoogleLogin>,
) -> AppResult<Json<Session>> {
    let identity = state.google.verify(&body.access_token).await.map_err(|e| match e {
        GoogleError::Refused => AppError::Unauthorized,
        GoogleError::Unavailable => AppError::BadGateway("could not reach Google"),
    })?;
    let device = headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .and_then(|t| state.tokens.verify(t))
        .filter(|id| !id.google)
        .map(|id| id.player);
    let signed = players::sign_in_with_google(&state.db, &identity, device).await?;
    Ok(Json(Session::new(&state, &signed.player, signed.moved)))
}

/// Who am I, with a renewed token: a player in use never has to sign in again.
pub async fn me(State(state): State<AppState>, who: AuthPlayer) -> AppResult<Json<Session>> {
    let player = players::get(&state.db, who.id).await?.ok_or(AppError::Unauthorized)?;
    players::touch(&state.db, player.id).await?;
    Ok(Json(Session::new(&state, &player, 0)))
}
