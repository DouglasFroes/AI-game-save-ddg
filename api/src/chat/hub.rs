//! Real-time fan-out of chat events, who is online, and in-memory server telemetry counters.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use chrono::{DateTime, Utc};
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

#[derive(Debug, Clone, Serialize)]
pub struct ServerMetrics {
    pub started_at: DateTime<Utc>,
    pub uptime_sec: u64,
    pub ws_subscribers: usize,
    pub online_players: usize,
    pub requests_total: u64,
    pub requests_api: u64,
    pub status_2xx: u64,
    pub status_4xx: u64,
    pub status_429: u64,
    pub status_5xx: u64,
    pub avg_latency_ms: f64,
    pub max_latency_ms: f64,
}

pub struct Hub {
    tx: broadcast::Sender<Event>,
    online: RwLock<HashMap<Uuid, Presence>>,
    dirty: AtomicBool,
    started_instant: Instant,
    started_wall: DateTime<Utc>,
    requests_total: AtomicU64,
    requests_api: AtomicU64,
    status_2xx: AtomicU64,
    status_4xx: AtomicU64,
    status_429: AtomicU64,
    status_5xx: AtomicU64,
    latency_sum_us: AtomicU64,
    latency_max_us: AtomicU64,
}

impl Default for Hub {
    fn default() -> Self {
        Self {
            tx: broadcast::channel(512).0,
            online: RwLock::default(),
            dirty: AtomicBool::new(false),
            started_instant: Instant::now(),
            started_wall: Utc::now(),
            requests_total: AtomicU64::new(0),
            requests_api: AtomicU64::new(0),
            status_2xx: AtomicU64::new(0),
            status_4xx: AtomicU64::new(0),
            status_429: AtomicU64::new(0),
            status_5xx: AtomicU64::new(0),
            latency_sum_us: AtomicU64::new(0),
            latency_max_us: AtomicU64::new(0),
        }
    }
}

impl Hub {
    pub fn subscribe(&self) -> broadcast::Receiver<Event> {
        self.tx.subscribe()
    }

    pub fn ws_subscribers(&self) -> usize {
        self.tx.receiver_count()
    }

    pub fn record_http(&self, is_api: bool, status: u16, elapsed_us: u64) {
        self.requests_total.fetch_add(1, Ordering::Relaxed);
        if is_api {
            self.requests_api.fetch_add(1, Ordering::Relaxed);
        }
        if (200..400).contains(&status) {
            self.status_2xx.fetch_add(1, Ordering::Relaxed);
        } else if (400..500).contains(&status) {
            self.status_4xx.fetch_add(1, Ordering::Relaxed);
            if status == 429 {
                self.status_429.fetch_add(1, Ordering::Relaxed);
            }
        } else if status >= 500 {
            self.status_5xx.fetch_add(1, Ordering::Relaxed);
        }
        self.latency_sum_us.fetch_add(elapsed_us, Ordering::Relaxed);
        self.latency_max_us.fetch_max(elapsed_us, Ordering::Relaxed);
    }

    pub async fn snapshot_metrics(&self, now_ms: i64) -> ServerMetrics {
        let online_count = self
            .online
            .read()
            .await
            .values()
            .filter(|p| now_ms - p.at <= ONLINE_WINDOW_MS)
            .count();
        let total = self.requests_total.load(Ordering::Relaxed);
        let sum_us = self.latency_sum_us.load(Ordering::Relaxed);
        let max_us = self.latency_max_us.load(Ordering::Relaxed);
        let avg_ms = if total > 0 { (sum_us as f64 / total as f64) / 1000.0 } else { 0.0 };
        ServerMetrics {
            started_at: self.started_wall,
            uptime_sec: self.started_instant.elapsed().as_secs(),
            ws_subscribers: self.tx.receiver_count(),
            online_players: online_count,
            requests_total: total,
            requests_api: self.requests_api.load(Ordering::Relaxed),
            status_2xx: self.status_2xx.load(Ordering::Relaxed),
            status_4xx: self.status_4xx.load(Ordering::Relaxed),
            status_429: self.status_429.load(Ordering::Relaxed),
            status_5xx: self.status_5xx.load(Ordering::Relaxed),
            avg_latency_ms: (avg_ms * 100.0).round() / 100.0,
            max_latency_ms: ((max_us as f64 / 1000.0) * 100.0).round() / 100.0,
        }
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

    #[tokio::test]
    async fn tracks_http_counters() {
        let hub = Hub::default();
        hub.record_http(true, 200, 1_500);
        hub.record_http(true, 429, 500);
        let m = hub.snapshot_metrics(0).await;
        assert_eq!((m.requests_total, m.requests_api, m.status_2xx, m.status_429), (2, 2, 1, 1));
    }
}
