use std::sync::Arc;

use anyhow::Context;
use fliper_api::{
    auth::{google::HttpGoogleVerifier, token::TokenService},
    chat::hub::Hub,
    config::Config,
    http, repo,
    state::AppState,
};
use tracing_subscriber::EnvFilter;

/// `fliper-api healthcheck`: for the container's health check (the image has no curl).
fn healthcheck() -> anyhow::Result<()> {
    use std::io::{Read, Write};
    let port = std::env::var("BIND").ok().and_then(|b| b.rsplit(':').next().map(str::to_owned));
    let mut tcp = std::net::TcpStream::connect(("127.0.0.1", port.unwrap_or("8080".into()).parse()?))?;
    tcp.set_read_timeout(Some(std::time::Duration::from_secs(3)))?;
    tcp.write_all(b"GET /api/health HTTP/1.0\r\n\r\n")?;
    let mut reply = String::new();
    tcp.read_to_string(&mut reply)?;
    anyhow::ensure!(reply.starts_with("HTTP/1.0 200") || reply.starts_with("HTTP/1.1 200"), "unhealthy");
    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("healthcheck") {
        return healthcheck();
    }
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let config = Config::from_env()?;
    let db = repo::connect(&config.database_url).await.context("database")?;
    if args.first().map(String::as_str) == Some("import") {
        let path = args.get(1).context("usage: fliper-api import <firestore-export.json>")?;
        let report = fliper_api::import::run_file(&db, std::path::Path::new(path)).await?;
        println!("{report:?}");
        return Ok(());
    }
    let hub = Arc::new(Hub::default());
    hub.spawn_presence_pusher();

    let state = AppState {
        db,
        tokens: TokenService::new(&config.jwt_secret),
        google: Arc::new(HttpGoogleVerifier::new(config.google_client_id.clone())),
        hub,
        config: Arc::new(config.clone()),
    };

    let listener = tokio::net::TcpListener::bind(config.bind).await?;
    tracing::info!(addr = %config.bind, "listening");
    axum::serve(listener, http::router(state))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
