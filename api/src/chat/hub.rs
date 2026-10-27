//! Real-time fan-out of chat events, and who is online. In memory: both are rebuilt by clients
//! after a restart (they re-subscribe and send a heartbeat), so nothing here needs the database.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use serde::Serialize;
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

/// Players count as online while their last heartbeat is this recent.
const ONLINE_WINDOW_MS: i64 = 10 * 60_000;
const PRESENCE_PUSH_EVERY: Duration = Duration::from_secs(3);
const MAX_PRESENCE: usize = 60;

#[derive(Debug, Clone, Serialize)]
pub struct Presence {
    pub uid: Uuid,
    pub name: String,
    /// Epoch ms of the last heartbeat.
    pub at: i64,
    /// Game being played ("" in the menus).
    pub g: String,
    /// Room the player is typing in ("" when not typing).
    pub typing: String,
}

/// Where an event goes: the subscribers of a room, or those following who is online.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Scope {
    Room(String),
    Presence,
}

/// A serialized event, built once and shared with every connection.
#[derive(Debug, Clone)]
pub struct Event {
    pub scope: Scope,
    pub json: Arc<str>,
}

pub struct Hub {
    tx: broadcast::Sender<Event>,
    online: RwLock<HashMap<Uuid, Presence>>,
    dirty: AtomicBool,
}

impl Default for Hub {
    fn default() -> Self {
        Self {
            tx: broadcast::channel(512).0,
            online: RwLock::default(),
            dirty: AtomicBool::new(false),
        }
    }
}

impl Hub {
    pub fn subscribe(&self) -> broadcast::Receiver<Event> {
        self.tx.subscribe()
    }

    /// Announces a message (or a change to one) to everybody following the room.
    pub fn publish_room(&self, room: &str, kind: &str, message: &impl Serialize) {
        let json =
            serde_json::json!({ "type": kind, "room": room, "message": message }).to_string();
        // No subscribers is fine: nobody is listening right now.
        let _ = self.tx.send(Event { scope: Scope::Room(room.to_owned()), json: json.into() });
    }

    pub async fn heartbeat(&self, uid: Uuid, name: String, game: String, typing: String, now_ms: i64) {
        self.online.write().await.insert(uid, Presence { uid, name, at: now_ms, g: game, typing });
        self.dirty.store(true, Ordering::Relaxed);
    }

    /// Players seen recently, most recent first.
    pub async fn who_is_online(&self, now_ms: i64) -> Vec<Presence> {
        let mut list: Vec<Presence> = self
            .online
            .read()
            .await
            .values()
            .filter(|p| now_ms - p.at <= ONLINE_WINDOW_MS)
            .cloned()
            .collect();
        list.sort_by(|a, b| b.at.cmp(&a.at));
        list.truncate(MAX_PRESENCE);
        list
    }

    pub fn presence_json(list: &[Presence]) -> Arc<str> {
        serde_json::json!({ "type": "presence", "players": list }).to_string().into()
    }

    /// Pushes the online list to followers when it changed. A heartbeat from every player would
    /// otherwise fan out to every player, so this batches them.
    pub fn spawn_presence_pusher(self: &Arc<Self>) {
        let hub = Arc::clone(self);
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(PRESENCE_PUSH_EVERY);
            loop {
                tick.tick().await;
                let now = chrono::Utc::now().timestamp_millis();
                hub.online.write().await.retain(|_, p| now - p.at <= ONLINE_WINDOW_MS);
                if hub.dirty.swap(false, Ordering::Relaxed) {
                    let list = hub.who_is_online(now).await;
                    let _ = hub
                        .tx
                        .send(Event { scope: Scope::Presence, json: Self::presence_json(&list) });
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn lists_recent_players_newest_first() {
        let hub = Hub::default();
        let (a, b, old) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        hub.heartbeat(a, "A".into(), "".into(), "".into(), 1_000).await;
        hub.heartbeat(b, "B".into(), "stack".into(), "".into(), 2_000).await;
        hub.heartbeat(old, "Old".into(), "".into(), "".into(), 0).await;
        let list = hub.who_is_online(ONLINE_WINDOW_MS + 500).await;
        assert_eq!(list.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), ["B", "A"]);
    }

    #[tokio::test]
    async fn room_events_reach_subscribers() {
        let hub = Hub::default();
        let mut rx = hub.subscribe();
        hub.publish_room("geral", "message", &serde_json::json!({"id": 1}));
        let event = rx.recv().await.unwrap();
        assert_eq!(event.scope, Scope::Room("geral".into()));
        assert!(event.json.contains("\"type\":\"message\""));
    }
}
