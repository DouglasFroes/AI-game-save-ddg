//! `GET /api/chat/ws?token=...`: pushes new messages and the online list in real time.
//! The client says what it follows with `{"op":"sub","rooms":["geral"],"presence":true}`.

use std::{collections::HashSet, time::Duration};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::Response,
};
use serde::Deserialize;
use tokio::sync::broadcast::error::RecvError;

use crate::{
    chat::hub::{Hub, Scope},
    error::AppError,
    state::AppState,
};

const PING_EVERY: Duration = Duration::from_secs(25);

#[derive(Deserialize)]
pub struct WsQuery {
    token: String,
}

#[derive(Deserialize)]
struct Command {
    op: String,
    #[serde(default)]
    rooms: Vec<String>,
    #[serde(default)]
    presence: bool,
}

pub async fn connect(
    State(state): State<AppState>,
    Query(q): Query<WsQuery>,
    upgrade: WebSocketUpgrade,
) -> Result<Response, AppError> {
    // Browsers cannot set headers on a WebSocket, so the token travels in the URL.
    let identity = state.tokens.verify(&q.token).ok_or(AppError::Unauthorized)?;
    if !identity.google {
        return Err(AppError::Forbidden("sign in with Google first"));
    }
    Ok(upgrade.on_upgrade(move |socket| serve(socket, state)))
}

async fn serve(mut socket: WebSocket, state: AppState) {
    let mut events = state.hub.subscribe();
    let mut rooms: HashSet<String> = HashSet::new();
    let mut presence = false;
    let mut ping = tokio::time::interval(PING_EVERY);

    loop {
        tokio::select! {
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    let Ok(cmd) = serde_json::from_str::<Command>(&text) else { continue };
                    if cmd.op != "sub" {
                        continue;
                    }
                    rooms = cmd.rooms.into_iter().filter(|r| crate::domain::chat::is_room(r)).collect();
                    presence = cmd.presence;
                    if presence {
                        let list = state.hub.who_is_online(chrono::Utc::now().timestamp_millis()).await;
                        if socket.send(Message::Text(Hub::presence_json(&list).to_string().into())).await.is_err() {
                            break;
                        }
                    }
                }
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                Some(Ok(_)) => {}
            },
            event = events.recv() => match event {
                Ok(event) => {
                    let wanted = match &event.scope {
                        Scope::Room(r) => rooms.contains(r),
                        Scope::Presence => presence,
                    };
                    if wanted && socket.send(Message::Text(event.json.to_string().into())).await.is_err() {
                        break;
                    }
                }
                // Too slow to keep up: tell the client to reload what it shows.
                Err(RecvError::Lagged(_)) => {
                    if socket.send(Message::Text(r#"{"type":"resync"}"#.into())).await.is_err() {
                        break;
                    }
                }
                Err(RecvError::Closed) => break,
            },
            // Keeps proxies from closing a quiet connection.
            _ = ping.tick() => {
                if socket.send(Message::Ping(Vec::new().into())).await.is_err() {
                    break;
                }
            }
        }
    }
}
