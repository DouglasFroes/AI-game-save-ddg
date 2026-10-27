//! The HTTP surface: JSON API under `/api`, the game at `/` and the admin panel at `/admin`.

mod admin;
mod auth;
mod boards;
mod chat;
mod dto;
mod statics;
mod telemetry;
mod ws;

use std::{sync::Arc, time::Instant};

use axum::{
    extract::Request,
    http::{header, HeaderValue, Method},
    middleware::{self, Next},
    response::Response,
    routing::{delete, get, post, put},
    Json, Router,
};
use serde_json::json;
use tower_http::{
    compression::CompressionLayer, cors::CorsLayer, limit::RequestBodyLimitLayer, trace::TraceLayer,
};

use crate::{chat::hub::Hub, state::AppState};

/// Bodies are tiny JSON documents; anything bigger is abuse.
const MAX_BODY: usize = 16 * 1024;

async fn record_metrics(hub: Arc<Hub>, req: Request, next: Next) -> Response {
    let is_api = req.uri().path().starts_with("/api");
    let started = Instant::now();
    let res = next.run(req).await;
    hub.record_http(is_api, res.status().as_u16(), started.elapsed().as_micros() as u64);
    res
}

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
        .route("/telemetry/errors", post(telemetry::report_error))
        .route("/chat/ws", get(ws::connect))
        .route("/chat/presence", get(chat::presence).post(chat::heartbeat))
        .route("/chat/rooms/{room}/messages", get(chat::messages).post(chat::send))
        .route("/chat/rooms/{room}/messages/{id}", delete(chat::remove))
        .route("/chat/rooms/{room}/messages/{id}/reaction", put(chat::react))
        .route("/chat/rooms/{room}/messages/{id}/report", post(chat::report))
        .route("/admin/overview", get(admin::overview))
        .route("/admin/monitoring", get(admin::monitoring))
        .route("/admin/sessions", get(admin::sessions))
        .route("/admin/players", get(admin::players))
        .route("/admin/players/{id}", get(admin::player_detail))
        .route("/admin/entries", get(admin::entries_list))
        .route("/admin/entries/{id}", delete(admin::delete_entry))
        .route("/admin/reports", get(admin::reports))
        .route("/admin/reports/{message}", delete(admin::dismiss_reports))
        .route("/admin/chat/messages", get(admin::messages_list))
        .route("/admin/chat/messages/{id}", delete(admin::moderate_message))
        .route("/admin/errors", get(admin::errors_list).delete(admin::clear_errors))
        .route("/admin/errors/{id}", delete(admin::delete_error))
        .layer(RequestBodyLimitLayer::new(MAX_BODY));

    let cors = state.config.cors_origins.iter().filter_map(|o| o.parse::<HeaderValue>().ok());
    let hub = Arc::clone(&state.hub);
    Router::new()
        .nest("/api", api)
        .merge(statics::routes(&state.config))
        .layer(middleware::from_fn(move |req, next| record_metrics(Arc::clone(&hub), req, next)))
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
