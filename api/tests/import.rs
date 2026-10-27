//! The Firestore import, against a real Postgres (see `tests/api.rs` for `TEST_DATABASE_URL`).

use fliper_api::{
    import::{self, Export},
    repo,
};
use serde_json::json;
use sqlx::{Connection, PgConnection};
use uuid::Uuid;

#[tokio::test]
async fn imports_records_once_and_links_google_accounts() {
    let Ok(admin_url) = std::env::var("TEST_DATABASE_URL") else { return };
    let name = format!("t_{}", Uuid::new_v4().simple());
    let mut conn = PgConnection::connect(&admin_url).await.unwrap();
    sqlx::query(&format!("CREATE DATABASE {name}")).execute(&mut conn).await.unwrap();
    let (base, query) = admin_url.split_once('?').unwrap_or((&admin_url, ""));
    let url = format!("{}/{name}?{query}", base.rsplit_once('/').unwrap().0);
    let pool = repo::connect(&url).await.unwrap();

    let export: Export = serde_json::from_value(json!({
        "users": [{ "uid": "fb1", "googleSub": "g-111", "email": "Ana@Example.com", "name": "Ana Silva" }],
        "entries": [
            { "game": "stack", "id": "d1", "player": "fb1", "name": "Ana", "score": 90, "details": {"perfects": 4}, "date": "2026-10-01T10:00:00Z" },
            { "game": "nope",  "id": "d2", "player": "fb1", "name": "Ana", "score": 1,  "details": {}, "date": "2026-10-01T10:00:00Z" }
        ],
        "sessions": [
            { "id": "s1", "player": "fb2", "name": "", "gameId": "stack", "durationSec": 30, "score": 5,
              "startedAt": "2026-10-01T10:00:00Z", "date": "2026-10-01T10:00:30Z" }
        ]
    }))
    .unwrap();

    let first = import::run(&pool, &export).await.unwrap();
    assert_eq!((first.players, first.entries, first.sessions, first.skipped), (1, 1, 1, 1));
    // Running it again changes nothing.
    let again = import::run(&pool, &export).await.unwrap();
    assert_eq!((again.players, again.entries, again.sessions), (0, 0, 0));

    // The record is attached to the Google id, so signing in with that account finds it.
    let owner: (Option<String>, Option<String>) =
        sqlx::query_as("SELECT p.google_sub, p.email FROM entries e JOIN players p ON p.id = e.player_id")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(owner, (Some("g-111".into()), Some("ana@example.com".into())));
}
