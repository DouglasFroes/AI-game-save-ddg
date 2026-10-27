//! End-to-end tests of the HTTP API against a real Postgres.
//! Set `TEST_DATABASE_URL` to a server's maintenance database (e.g. `.../postgres`); every test
//! gets its own fresh database. Without it the tests are skipped.

use std::sync::Arc;

use async_trait::async_trait;
use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
    Router,
};
use fliper_api::{
    auth::{
        google::{GoogleError, GoogleIdentity, GoogleVerifier},
        token::TokenService,
    },
    chat::hub::Hub,
    config::Config,
    http, repo,
    state::AppState,
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::{Connection, PgConnection};
use tower::ServiceExt;
use uuid::Uuid;

/// Accepts tokens shaped `g:<sub>:<email>` so tests choose who signs in.
struct FakeGoogle;

#[async_trait]
impl GoogleVerifier for FakeGoogle {
    async fn verify(&self, token: &str) -> Result<GoogleIdentity, GoogleError> {
        let mut parts = token.splitn(3, ':');
        match (parts.next(), parts.next(), parts.next()) {
            (Some("g"), Some(sub), Some(email)) => Ok(GoogleIdentity {
                sub: sub.into(),
                email: email.into(),
                name: format!("User {sub}"),
            }),
            _ => Err(GoogleError::Refused),
        }
    }
}

struct App {
    router: Router,
    state: AppState,
}

async fn app() -> Option<App> {
    let admin_url = std::env::var("TEST_DATABASE_URL").ok()?;
    let name = format!("t_{}", Uuid::new_v4().simple());
    let mut conn = PgConnection::connect(&admin_url).await.unwrap();
    sqlx::query(&format!("CREATE DATABASE {name}")).execute(&mut conn).await.unwrap();
    let (base, query) = admin_url.split_once('?').unwrap_or((&admin_url, ""));
    let url = format!("{}/{name}{}", base.rsplit_once('/').unwrap().0, if query.is_empty() { String::new() } else { format!("?{query}") });
    let config = Config {
        database_url: url.clone(),
        bind: "127.0.0.1:0".parse().unwrap(),
        jwt_secret: "0123456789abcdef0123456789abcdef".into(),
        google_client_id: "client".into(),
        admin_emails: vec!["boss@example.com".into()],
        web_dir: "/nonexistent".into(),
        admin_dir: "/nonexistent".into(),
        cors_origins: vec![],
    };
    let state = AppState {
        db: repo::connect(&url).await.unwrap(),
        tokens: TokenService::new(&config.jwt_secret),
        google: Arc::new(FakeGoogle),
        hub: Arc::new(Hub::default()),
        config: Arc::new(config),
    };
    Some(App { router: http::router(state.clone()), state })
}

impl App {
    /// Builds the request now and returns a future that owns everything it needs.
    fn call(
        &self,
        method: Method,
        uri: &str,
        token: Option<&str>,
        body: Option<Value>,
    ) -> impl std::future::Future<Output = (StatusCode, Value)> + 'static {
        let mut req = Request::builder().method(method).uri(uri);
        if let Some(t) = token {
            req = req.header(header::AUTHORIZATION, format!("Bearer {t}"));
        }
        let req = match body {
            Some(b) => req.header(header::CONTENT_TYPE, "application/json").body(Body::from(b.to_string())),
            None => req.body(Body::empty()),
        }
        .unwrap();
        let router = self.router.clone();
        async move {
            let res = router.oneshot(req).await.unwrap();
            let status = res.status();
            let bytes = res.into_body().collect().await.unwrap().to_bytes();
            (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
        }
    }

    async fn anonymous(&self) -> String {
        let (s, v) = self.call(Method::POST, "/api/auth/anonymous", None, None).await;
        assert_eq!(s, StatusCode::OK);
        v["token"].as_str().unwrap().into()
    }

    /// Signs in with Google; `device` is the anonymous token of the same device, if any.
    async fn google(&self, sub: &str, email: &str, device: Option<&str>) -> Value {
        let (s, v) = self
            .call(Method::POST, "/api/auth/google", device, Some(json!({ "accessToken": format!("g:{sub}:{email}") })))
            .await;
        assert_eq!(s, StatusCode::OK, "{v}");
        v
    }
}

macro_rules! app_or_skip {
    () => {
        match app().await {
            Some(app) => app,
            None => return,
        }
    };
}

fn run(score: i64) -> Value {
    json!({ "name": "Ana", "score": score, "details": { "perfects": 2 } })
}

#[tokio::test]
async fn only_google_players_reach_the_ranking() {
    let app = app_or_skip!();
    let anon = app.anonymous().await;
    let path = "/api/boards/stack/entries";
    assert_eq!(app.call(Method::POST, path, Some(&anon), Some(run(10))).await.0, StatusCode::FORBIDDEN);
    assert_eq!(app.call(Method::POST, path, None, Some(run(10))).await.0, StatusCode::UNAUTHORIZED);

    let token = app.google("1", "ana@example.com", Some(&anon)).await["token"].as_str().unwrap().to_owned();
    assert_eq!(app.call(Method::POST, path, Some(&token), Some(run(10))).await.0, StatusCode::CREATED);
    assert_eq!(app.call(Method::POST, path, Some(&token), Some(run(30))).await.0, StatusCode::CREATED);

    let (s, board) = app.call(Method::GET, "/api/boards/stack?limit=5", None, None).await;
    assert_eq!(s, StatusCode::OK);
    let scores: Vec<i64> = board.as_array().unwrap().iter().map(|e| e["score"].as_i64().unwrap()).collect();
    assert_eq!(scores, [30, 10]);
    assert_eq!(board[0]["details"]["perfects"], 2);
}

#[tokio::test]
async fn refuses_bad_runs() {
    let app = app_or_skip!();
    let token = app.google("1", "ana@example.com", None).await["token"].as_str().unwrap().to_owned();
    let post = |game: &'static str, body: Value| {
        let (app, token) = (&app, token.clone());
        async move { app.call(Method::POST, &format!("/api/boards/{game}/entries"), Some(&token), Some(body)).await.0 }
    };
    assert_eq!(post("nope", run(1)).await, StatusCode::BAD_REQUEST);
    assert_eq!(post("stack", run(-5)).await, StatusCode::BAD_REQUEST);
    assert_eq!(post("stack", run(100_000_001)).await, StatusCode::BAD_REQUEST);
    assert_eq!(post("stack", json!({ "name": "", "score": 1 })).await, StatusCode::BAD_REQUEST);
    assert_eq!(app.call(Method::GET, "/api/boards/nope", None, None).await.0, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn campaign_boards_keep_one_row_per_player() {
    let app = app_or_skip!();
    let token = app.google("1", "ana@example.com", None).await["token"].as_str().unwrap().to_owned();
    for score in [100, 250] {
        let (s, _) = app.call(Method::POST, "/api/boards/doguinho/entries", Some(&token), Some(run(score))).await;
        assert_eq!(s, StatusCode::CREATED);
    }
    let (_, board) = app.call(Method::GET, "/api/boards/doguinho", None, None).await;
    assert_eq!(board.as_array().unwrap().len(), 1);
    assert_eq!(board[0]["score"], 250);
}

#[tokio::test]
async fn signing_in_on_a_second_device_merges_the_runs() {
    let app = app_or_skip!();
    // The account already exists, with a campaign score of 100 and a normal run.
    let first = app.google("1", "ana@example.com", None).await;
    let account: Uuid = first["playerId"].as_str().unwrap().parse().unwrap();
    let token = first["token"].as_str().unwrap();
    app.call(Method::POST, "/api/boards/doguinho/entries", Some(token), Some(run(100))).await;

    // Another device played anonymously (runs arrive e.g. from an import) and then signs in.
    let anon = app.anonymous().await;
    let device = app.state.tokens.verify(&anon).unwrap().player;
    let new_run = |game: &str, score: i64| fliper_api::domain::entry::NewEntry::parse(game, "Ana", score as f64, None).unwrap();
    repo::entries::submit(&app.state.db, device, &new_run("doguinho", 400)).await.unwrap();
    repo::entries::submit(&app.state.db, device, &new_run("stack", 7)).await.unwrap();

    let merged = app.google("1", "ana@example.com", Some(&anon)).await;
    assert_eq!(merged["playerId"].as_str().unwrap(), account.to_string());
    assert_eq!(merged["moved"], 2);

    let (_, camp) = app.call(Method::GET, "/api/boards/doguinho", None, None).await;
    assert_eq!((camp.as_array().unwrap().len(), camp[0]["score"].as_i64()), (1, Some(400)));
    let (_, stack) = app.call(Method::GET, "/api/boards/stack", None, None).await;
    assert_eq!(stack[0]["player"].as_str().unwrap(), account.to_string());
}

#[tokio::test]
async fn a_new_google_account_keeps_the_device_runs() {
    let app = app_or_skip!();
    let anon = app.anonymous().await;
    let device = app.state.tokens.verify(&anon).unwrap().player;
    let entry = fliper_api::domain::entry::NewEntry::parse("stack", "Ana", 9.0, None).unwrap();
    repo::entries::submit(&app.state.db, device, &entry).await.unwrap();
    let signed = app.google("2", "bia@example.com", Some(&anon)).await;
    assert_eq!(signed["playerId"].as_str().unwrap(), device.to_string());
    assert_eq!(signed["google"], true);
}

#[tokio::test]
async fn rejects_foreign_google_tokens() {
    let app = app_or_skip!();
    let (s, _) = app.call(Method::POST, "/api/auth/google", None, Some(json!({ "accessToken": "bogus" }))).await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn me_renews_the_session() {
    let app = app_or_skip!();
    let anon = app.anonymous().await;
    let (s, me) = app.call(Method::GET, "/api/me", Some(&anon), None).await;
    assert_eq!((s, me["google"].clone()), (StatusCode::OK, json!(false)));
    assert_eq!(app.call(Method::GET, "/api/me", Some("junk"), None).await.0, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn telemetry_is_recorded_and_served_without_identities() {
    let app = app_or_skip!();
    let anon = app.anonymous().await;
    let body = json!({ "id": "s1", "name": "Ana", "gameId": "stack", "durationSec": 42, "score": 5,
                       "startedAt": "2026-10-27T10:00:00.000Z" });
    let (s, _) = app.call(Method::POST, "/api/telemetry/sessions", Some(&anon), Some(body.clone())).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    // A retry of the same session is harmless.
    assert_eq!(app.call(Method::POST, "/api/telemetry/sessions", Some(&anon), Some(body)).await.0, StatusCode::NO_CONTENT);
    let (_, recent) = app.call(Method::GET, "/api/telemetry/recent", None, None).await;
    assert_eq!(recent.as_array().unwrap().len(), 1);
    assert_eq!(recent[0]["playerId"], "anon");
    assert_eq!(recent[0]["durationSec"], 42);
}

#[tokio::test]
async fn chat_flow() {
    let app = app_or_skip!();
    let anon = app.anonymous().await;
    assert_eq!(app.call(Method::GET, "/api/chat/rooms/geral/messages", Some(&anon), None).await.0, StatusCode::FORBIDDEN);

    let ana = app.google("1", "ana@example.com", None).await["token"].as_str().unwrap().to_owned();
    let bia = app.google("2", "bia@example.com", None).await["token"].as_str().unwrap().to_owned();
    let send = |t: &str, text: &str| app.call(Method::POST, "/api/chat/rooms/geral/messages", Some(t), Some(json!({ "name": "Ana", "text": text })));

    let mut events = app.state.hub.subscribe();
    let (s, msg) = send(&ana, "oi pessoal").await;
    assert_eq!(s, StatusCode::CREATED);
    assert!(events.try_recv().unwrap().json.contains("oi pessoal"));
    // Within 2 s the server refuses a second message.
    assert_eq!(send(&ana, "de novo").await.0, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(send(&bia, "https://spam.com").await.0, StatusCode::BAD_REQUEST);
    assert_eq!(app.call(Method::POST, "/api/chat/rooms/nope/messages", Some(&bia), Some(json!({"name":"B","text":"x"}))).await.0, StatusCode::NOT_FOUND);

    let id = msg["id"].as_str().unwrap();
    let react = |emoji: Value| app.call(Method::PUT, &format!("/api/chat/rooms/geral/messages/{id}/reaction"), Some(&bia), Some(json!({ "emoji": emoji })));
    let (s, reacted) = react(json!("🔥")).await;
    assert_eq!((s, reacted["r"].as_object().unwrap().len()), (StatusCode::OK, 1));
    assert_eq!(react(json!("💩")).await.0, StatusCode::BAD_REQUEST);
    assert!(react(Value::Null).await.1["r"].is_null());

    // Only the author may blank a message.
    let del = |t: &str| app.call(Method::DELETE, &format!("/api/chat/rooms/geral/messages/{id}"), Some(t), None);
    assert_eq!(del(&bia).await.0, StatusCode::NOT_FOUND);
    let (s, gone) = del(&ana).await;
    assert_eq!((s, gone["del"].clone(), gone["text"].clone()), (StatusCode::OK, json!(true), json!("")));

    let (_, page) = app.call(Method::GET, "/api/chat/rooms/geral/messages", Some(&bia), None).await;
    assert_eq!(page.as_array().unwrap().len(), 1);

    let beat = json!({ "name": "Bia", "g": "stack", "typing": "" });
    assert_eq!(app.call(Method::POST, "/api/chat/presence", Some(&bia), Some(beat)).await.0, StatusCode::NO_CONTENT);
    let (_, online) = app.call(Method::GET, "/api/chat/presence", Some(&ana), None).await;
    assert_eq!(online[0]["name"], "Bia");
}

#[tokio::test]
async fn admin_is_limited_to_listed_emails() {
    let app = app_or_skip!();
    let ana = app.google("1", "ana@example.com", None).await["token"].as_str().unwrap().to_owned();
    let boss = app.google("9", "boss@example.com", None).await["token"].as_str().unwrap().to_owned();
    assert_eq!(app.call(Method::GET, "/api/admin/overview", Some(&ana), None).await.0, StatusCode::FORBIDDEN);
    assert_eq!(app.call(Method::GET, "/api/admin/overview", None, None).await.0, StatusCode::UNAUTHORIZED);
    let (s, overview) = app.call(Method::GET, "/api/admin/overview", Some(&boss), None).await;
    assert_eq!(s, StatusCode::OK, "{overview}");
    assert_eq!(overview["totals"]["players"], 2);

    // Moderation: remove a run, blank a reported message.
    let (_, run) = app.call(Method::POST, "/api/boards/stack/entries", Some(&ana), Some(run(5))).await;
    let id = run["id"].as_str().unwrap();
    let (_, entries_page) = app.call(Method::GET, "/api/admin/entries?game=stack&page=1&per_page=10", Some(&boss), None).await;
    assert_eq!((entries_page["total"].as_i64(), entries_page["items"][0]["rank"].as_i64()), (Some(1), Some(1)));
    assert_eq!(app.call(Method::DELETE, &format!("/api/admin/entries/{id}"), Some(&boss), None).await.0, StatusCode::NO_CONTENT);
    assert_eq!(app.call(Method::DELETE, &format!("/api/admin/entries/{id}"), Some(&boss), None).await.0, StatusCode::NOT_FOUND);

    let (_, players_page) = app.call(Method::GET, "/api/admin/players?page=1&per_page=1", Some(&boss), None).await;
    assert_eq!((players_page["total"].as_i64(), players_page["items"].as_array().unwrap().len()), (Some(2), 1));
    let pid = players_page["items"][0]["id"].as_str().unwrap();
    let (s, detail) = app.call(Method::GET, &format!("/api/admin/players/{pid}"), Some(&boss), None).await;
    assert_eq!((s, detail["player"]["id"].as_str()), (StatusCode::OK, Some(pid)));

    let (_, sessions_page) = app.call(Method::GET, "/api/admin/sessions?page=1&per_page=10", Some(&boss), None).await;
    assert_eq!(sessions_page["total"].as_i64(), Some(0));

    let (_, msg) = app.call(Method::POST, "/api/chat/rooms/geral/messages", Some(&ana), Some(json!({"name":"Ana","text":"feio"}))).await;
    let mid = msg["id"].as_str().unwrap();
    app.call(Method::POST, &format!("/api/chat/rooms/geral/messages/{mid}/report"), Some(&boss), None).await;
    let (_, reports) = app.call(Method::GET, "/api/admin/reports", Some(&boss), None).await;
    assert_eq!((reports.as_array().unwrap().len(), reports[0]["text"].clone()), (1, json!("feio")));
    let (_, msgs_page) = app.call(Method::GET, "/api/admin/chat/messages?status=reported", Some(&boss), None).await;
    assert_eq!(msgs_page["total"].as_i64(), Some(1));
    assert_eq!(app.call(Method::DELETE, &format!("/api/admin/chat/messages/{mid}"), Some(&boss), None).await.0, StatusCode::NO_CONTENT);
    let (_, reports) = app.call(Method::GET, "/api/admin/reports", Some(&boss), None).await;
    assert!(reports.as_array().unwrap().is_empty());
}
