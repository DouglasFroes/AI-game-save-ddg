//! The HTTP surface: JSON API under `/api`, the game at `/` and the admin panel at `/admin`.

mod admin;
mod auth;
mod boards;
mod chat;
mod dto;
mod statics;
mod telemetry;
mod ws;

use axum::{
    http::{header, HeaderValue, Method},
    routing::{delete, get, post, put},
    Json, Router,
};
use serde_json::json;
use tower_http::{
    compression::CompressionLayer, cors::CorsLayer, limit::RequestBodyLimitLayer, trace::TraceLayer,
};

use crate::state::AppState;

/// Bodies are tiny JSON documents; anything bigger is abuse.
const MAX_BODY: usize = 16 * 1024;

pub fn router(state: AppState) -> Router {
    let api = Router::new()
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .route("/auth/anonymous", post(auth::anonymous))
        .route("/auth/google", post(auth::google))
        .route("/me", get(auth::me))
        .route("/games", get(boards::games))
        .route("/boards/{game}", get(boards::list))
        .route("/boards/{game}/entries", post(boards::submit))
        .route("/telemetry/sessions", post(telemetry::record))
        .route("/telemetry/recent", get(telemetry::recent))
        .route("/chat/ws", get(ws::connect))
        .route("/chat/presence", get(chat::presence).post(chat::heartbeat))
        .route("/chat/rooms/{room}/messages", get(chat::messages).post(chat::send))
        .route("/chat/rooms/{room}/messages/{id}", delete(chat::remove))
        .route("/chat/rooms/{room}/messages/{id}/reaction", put(chat::react))
        .route("/chat/rooms/{room}/messages/{id}/report", post(chat::report))
        .route("/admin/overview", get(admin::overview))
        .route("/admin/sessions", get(admin::sessions))
        .route("/admin/players", get(admin::players))
        .route("/admin/entries/{id}", delete(admin::delete_entry))
        .route("/admin/reports", get(admin::reports))
        .route("/admin/reports/{message}", delete(admin::dismiss_reports))
        .route("/admin/chat/messages/{id}", delete(admin::moderate_message))
        .layer(RequestBodyLimitLayer::new(MAX_BODY));

    let cors = state.config.cors_origins.iter().filter_map(|o| o.parse::<HeaderValue>().ok());
    Router::new()
        .nest("/api", api)
        .merge(statics::routes(&state.config))
        .layer(
            CorsLayer::new()
                .allow_origin(cors.collect::<Vec<_>>())
                .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
                .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]),
        )
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
