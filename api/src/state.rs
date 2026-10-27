use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    auth::{google::GoogleVerifier, token::TokenService},
    chat::hub::Hub,
    config::Config,
};

/// Shared by every handler. Cheap to clone: it is all handles.
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub tokens: TokenService,
    pub google: Arc<dyn GoogleVerifier>,
    pub hub: Arc<Hub>,
    pub config: Arc<Config>,
}
