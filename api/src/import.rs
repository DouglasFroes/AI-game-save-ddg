//! One-off migration from Firestore: `fliper-api import firestore-export.json`.
//!
//! The file comes from `tools/firestore-export` (rankings, play sessions and the Firebase users).
//! Firebase accounts that signed in with Google carry their Google id (`sub`), so when the same
//! person signs in with Google on the new server they find their records waiting. Importing is
//! idempotent: running it twice changes nothing.

use std::path::Path;

use anyhow::Context;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{Map, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::{entry::NewEntry, games, name::PlayerName};

/// Fixed namespace, so a Firebase uid always maps to the same player id.
const NAMESPACE: Uuid = Uuid::from_u128(0x6f1b_7a52_3c04_4d71_9e0a_b2c8_55d1_0e47);

#[derive(Debug, Deserialize)]
pub struct Export {
    #[serde(default)]
    pub users: Vec<User>,
    #[serde(default)]
    pub entries: Vec<EntryDoc>,
    #[serde(default)]
    pub sessions: Vec<SessionDoc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub uid: String,
    pub google_sub: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct EntryDoc {
    pub game: String,
    pub id: String,
    pub player: String,
    pub name: String,
    pub score: f64,
    #[serde(default)]
    pub details: Value,
    pub date: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDoc {
    pub id: String,
    pub player: String,
    pub name: String,
    pub game_id: String,
    pub duration_sec: f64,
    pub score: f64,
    pub started_at: DateTime<Utc>,
    pub date: DateTime<Utc>,
}

pub fn player_id(firebase_uid: &str) -> Uuid {
    Uuid::new_v5(&NAMESPACE, firebase_uid.as_bytes())
}

fn entry_id(game: &str, doc: &str) -> Uuid {
    Uuid::new_v5(&NAMESPACE, format!("entry/{game}/{doc}").as_bytes())
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Report {
    pub players: u64,
    pub entries: u64,
    pub sessions: u64,
    pub skipped: u64,
}

/// A name the rules would accept, or a placeholder for records whose name is unusable.
fn name_or(raw: &str, fallback: &str) -> String {
    PlayerName::parse(raw).map(|n| n.as_str().to_owned()).unwrap_or_else(|_| fallback.to_owned())
}

pub async fn run_file(pool: &PgPool, path: &Path) -> anyhow::Result<Report> {
    let raw = std::fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
    let export: Export = serde_json::from_str(&raw).context("parsing the export")?;
    run(pool, &export).await
}

pub async fn run(pool: &PgPool, export: &Export) -> anyhow::Result<Report> {
    let mut report = Report::default();
    let mut tx = pool.begin().await?;

    for u in &export.users {
        let done = sqlx::query(
            "INSERT INTO players (id, google_sub, email, name) VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING",
        )
        .bind(player_id(&u.uid))
        .bind(&u.google_sub)
        .bind(u.email.as_deref().map(str::to_lowercase))
        .bind(&u.name)
        .execute(&mut *tx)
        .await?;
        report.players += done.rows_affected();
    }

    for e in &export.entries {
        let details = match &e.details {
            Value::Object(m) => Some(Value::Object(m.clone())),
            _ => Some(Value::Object(Map::new())),
        };
        let parsed = NewEntry::parse(&e.game, &name_or(&e.name, "Jogador"), e.score, details);
        let Ok(entry) = parsed else {
            report.skipped += 1;
            continue;
        };
        // The player may be a Firebase account that was never listed: create it quietly.
        let player = player_id(&e.player);
        sqlx::query("INSERT INTO players (id) VALUES ($1) ON CONFLICT DO NOTHING")
            .bind(player)
            .execute(&mut *tx)
            .await?;
        let done = sqlx::query(
            "INSERT INTO entries (id, game_id, player_id, name, score, details, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
        )
        .bind(entry_id(&e.game, &e.id))
        .bind(&entry.game_id)
        .bind(player)
        .bind(entry.name.as_str())
        .bind(entry.score)
        .bind(Value::Object(entry.details))
        .bind(e.date)
        .execute(&mut *tx)
        .await?;
        report.entries += done.rows_affected();
    }

    for s in &export.sessions {
        if !games::is_game(&s.game_id) || !(1.0..=43_200.0).contains(&s.duration_sec) {
            report.skipped += 1;
            continue;
        }
        let player = player_id(&s.player);
        sqlx::query("INSERT INTO players (id) VALUES ($1) ON CONFLICT DO NOTHING")
            .bind(player)
            .execute(&mut *tx)
            .await?;
        let done = sqlx::query(
            "INSERT INTO play_sessions (id, player_id, name, game_id, duration_sec, score, started_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING",
        )
        .bind(&s.id)
        .bind(player)
        .bind(name_or(&s.name, "Anônimo"))
        .bind(&s.game_id)
        .bind(s.duration_sec.round() as i32)
        .bind((s.score.max(0.0).round() as i64).min(100_000_000))
        .bind(s.started_at)
        .bind(s.date)
        .execute(&mut *tx)
        .await?;
        report.sessions += done.rows_affected();
    }

    tx.commit().await?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn firebase_uids_map_to_stable_player_ids() {
        assert_eq!(player_id("abc"), player_id("abc"));
        assert_ne!(player_id("abc"), player_id("abd"));
        assert_ne!(entry_id("stack", "x"), entry_id("snake", "x"));
    }

    #[test]
    fn unusable_names_get_a_placeholder() {
        assert_eq!(name_or("  Ana ", "?"), "Ana");
        assert_eq!(name_or("", "Jogador"), "Jogador");
        assert_eq!(name_or(&"x".repeat(40), "Jogador"), "Jogador");
    }
}
