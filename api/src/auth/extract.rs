use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use uuid::Uuid;

use crate::{error::AppError, repo::players, state::AppState};

fn bearer(parts: &Parts) -> Option<&str> {
    parts.headers.get(AUTHORIZATION)?.to_str().ok()?.strip_prefix("Bearer ")
}

/// Any signed-in player, anonymous or not.
#[derive(Debug, Clone, Copy)]
pub struct AuthPlayer {
    pub id: Uuid,
    pub google: bool,
}

impl FromRequestParts<AppState> for AuthPlayer {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let identity =
            bearer(parts).and_then(|t| state.tokens.verify(t)).ok_or(AppError::Unauthorized)?;
        Ok(Self { id: identity.player, google: identity.google })
    }
}

/// A player signed in with Google: the only kind that reaches the global ranking and the chat.
#[derive(Debug, Clone, Copy)]
pub struct GooglePlayer(pub Uuid);

impl FromRequestParts<AppState> for GooglePlayer {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let player = AuthPlayer::from_request_parts(parts, state).await?;
        if player.google {
            Ok(Self(player.id))
        } else {
            Err(AppError::Forbidden("sign in with Google first"))
        }
    }
}

/// A Google account listed in `ADMIN_EMAILS`.
#[derive(Debug, Clone, Copy)]
pub struct AdminPlayer(pub Uuid);

impl FromRequestParts<AppState> for AdminPlayer {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let GooglePlayer(id) = GooglePlayer::from_request_parts(parts, state).await?;
        let player = players::get(&state.db, id).await?.ok_or(AppError::Unauthorized)?;
        let email = player.email.unwrap_or_default().to_lowercase();
        if !email.is_empty() && state.config.admin_emails.contains(&email) {
            Ok(Self(id))
        } else {
            Err(AppError::Forbidden("not an administrator"))
        }
    }
}
