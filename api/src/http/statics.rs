//! Serves the built game at `/` and the admin panel at `/admin`, from the same process.

use axum::{
    extract::Request,
    http::{header, HeaderValue},
    middleware::{self, Next},
    response::Response,
    Router,
};
use tower_http::services::{ServeDir, ServeFile};

use crate::{config::Config, state::AppState};

/// Hashed assets never change; everything else (index.html, sw.js, the manifest) must be
/// revalidated, or players would keep an old version after a deploy.
async fn cache_headers(req: Request, next: Next) -> Response {
    let hashed = req.uri().path().contains("/assets/");
    let mut res = next.run(req).await;
    if res.status().is_success() && !res.headers().contains_key(header::CACHE_CONTROL) {
        let value = if hashed { "public, max-age=31536000, immutable" } else { "no-cache" };
        res.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static(value));
    }
    res
}

fn spa(dir: &std::path::Path) -> ServeDir<ServeFile> {
    ServeDir::new(dir).fallback(ServeFile::new(dir.join("index.html")))
}

pub fn routes(config: &Config) -> Router<AppState> {
    Router::new()
        .nest_service("/admin", spa(&config.admin_dir))
        .fallback_service(spa(&config.web_dir))
        .layer(middleware::from_fn(cache_headers))
}
