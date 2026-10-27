//! The JSON the clients see. Field names match what the game's TypeScript already reads.

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::{Map, Value};
use uuid::Uuid;

use crate::repo::{chat::MessageRow, entries::EntryRow, sessions::SessionRow};

fn iso(t: DateTime<Utc>) -> String {
    t.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[derive(Serialize)]
pub struct EntryDto {
    id: Uuid,
    player: Uuid,
    name: String,
    score: i64,
    details: Value,
    date: String,
}

impl From<EntryRow> for EntryDto {
    fn from(e: EntryRow) -> Self {
        Self {
            id: e.id,
            player: e.player_id,
            name: e.name,
            score: e.score,
            details: e.details,
            date: iso(e.created_at),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDto {
    id: String,
    player_id: String,
    player_name: String,
    game_id: String,
    duration_sec: i32,
    score: i64,
    started_at: String,
    ended_at: String,
}

impl SessionDto {
    /// Sessions shown to everybody (the "most played" shelf): nobody is identifiable.
    pub fn anonymous(s: SessionRow) -> Self {
        Self { player_id: "anon".into(), player_name: "Jogador".into(), ..Self::from(s) }
    }
}

impl From<SessionRow> for SessionDto {
    fn from(s: SessionRow) -> Self {
        Self {
            id: s.id,
            player_id: s.player_id.to_string(),
            player_name: s.name,
            game_id: s.game_id,
            duration_sec: s.duration_sec,
            score: s.score,
            started_at: iso(s.started_at),
            ended_at: iso(s.created_at),
        }
    }
}

#[derive(Serialize, Clone)]
pub struct MessageDto {
    id: Uuid,
    uid: Uuid,
    name: String,
    text: String,
    /// Epoch ms.
    at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    re: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    r: Option<Map<String, Value>>,
    del: bool,
}

impl From<MessageRow> for MessageDto {
    fn from(m: MessageRow) -> Self {
        let reactions = match m.reactions {
            Value::Object(map) if !map.is_empty() => Some(map),
            _ => None,
        };
        Self {
            id: m.id,
            uid: m.player_id,
            name: m.name,
            text: m.text,
            at: m.created_at.timestamp_millis(),
            re: m.reply,
            r: reactions,
            del: m.deleted,
        }
    }
}
