//! Serves the built game at `/` and the admin panel at `/admin`, from the same process.

use axum::{
    body::{to_bytes, Body},
    extract::Request,
    http::{header, HeaderValue},
    middleware::{self, Next},
    response::Response,
    Router,
};
use tower_http::services::{ServeDir, ServeFile};

use crate::{config::Config, state::AppState};

/// HTML pages are small; anything bigger is left as it is.
const MAX_PAGE: usize = 1024 * 1024;

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

/// The script that hands the page its runtime settings. `<` is escaped so no value can end the tag.
pub fn config_script(google_client_id: &str) -> String {
    let json = serde_json::json!({ "googleClientId": google_client_id }).to_string();
    format!("<script>window.__FLIPER__={};</script>", json.replace('<', "\\u003c"))
}

/// Puts the runtime settings into an HTML page, so the Google client id comes from the server's
/// environment instead of having to be baked into the build.
pub fn inject_config(html: &str, google_client_id: &str) -> String {
    html.replacen("<head>", &format!("<head>{}", config_script(google_client_id)), 1)
}

async fn inject_runtime_config(google_client_id: String, req: Request, next: Next) -> Response {
    let res = next.run(req).await;
    let is_html = res.status().is_success()
        && res
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.starts_with("text/html"));
    if !is_html {
        return res;
    }
    let (mut parts, body) = res.into_parts();
    let Ok(bytes) = to_bytes(body, MAX_PAGE).await else {
        return Response::builder().status(500).body(Body::empty()).expect("static response");
    };
    let html = inject_config(&String::from_utf8_lossy(&bytes), &google_client_id);
    // The length changed, and the original validators no longer describe this body.
    parts.headers.remove(header::CONTENT_LENGTH);
    parts.headers.remove(header::LAST_MODIFIED);
    parts.headers.remove(header::ETAG);
    Response::from_parts(parts, Body::from(html))
}

fn spa(dir: &std::path::Path) -> ServeDir<ServeFile> {
    ServeDir::new(dir).fallback(ServeFile::new(dir.join("index.html")))
}

pub fn routes(config: &Config) -> Router<AppState> {
    let client_id = config.google_client_id.clone();
    Router::new()
        .nest_service("/admin", spa(&config.admin_dir))
        .fallback_service(spa(&config.web_dir))
        .layer(middleware::from_fn(move |req, next| {
            inject_runtime_config(client_id.clone(), req, next)
        }))
        .layer(middleware::from_fn(cache_headers))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn injects_the_settings_right_after_head() {
        let html = inject_config("<html><head><title>x</title></head></html>", "abc.apps");
        assert!(html.starts_with(r#"<html><head><script>window.__FLIPER__={"googleClientId":"abc.apps"};</script><title>"#));
    }

    #[test]
    fn cannot_break_out_of_the_script_tag() {
        let script = config_script("</script><script>alert(1)");
        assert!(!script[8..script.len() - 9].contains("</script>"));
    }

    #[test]
    fn leaves_pages_without_a_head_alone() {
        assert_eq!(inject_config("plain", "x"), "plain");
    }
}
