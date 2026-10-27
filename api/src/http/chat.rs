use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, TimeZone, Utc};
use serde::Deserialize;
use uuid::Uuid;

use super::dto::MessageDto;
use crate::{
    auth::GooglePlayer,
    chat::hub::Presence,
    domain::{
        chat::{self, ChatText, Quote},
        name::PlayerName,
        Invalid,
    },
    error::{AppError, AppResult},
    repo::chat as repo,
    state::AppState,
};

const PAGE: i64 = 50;

fn room(room: &str) -> AppResult<&str> {
    if chat::is_room(room) {
        Ok(room)
    } else {
        Err(AppError::NotFound)
    }
}

fn from_ms(ms: i64) -> Option<DateTime<Utc>> {
    Utc.timestamp_millis_opt(ms).single()
}

#[derive(Deserialize)]
pub struct PageQuery {
    /// Only messages older than this (epoch ms).
    before: Option<i64>,
    /// Only messages newer than this (epoch ms).
    since: Option<i64>,
    limit: Option<i64>,
}

/// A page of a room, oldest first.
pub async fn messages(
    State(state): State<AppState>,
    _who: GooglePlayer,
    Path(r): Path<String>,
    Query(q): Query<PageQuery>,
) -> AppResult<Json<Vec<MessageDto>>> {
    let r = room(&r)?;
    let limit = q.limit.unwrap_or(PAGE).clamp(1, PAGE);
    let mut rows = repo::page(
        &state.db,
        r,
        q.before.and_then(from_ms),
        q.since.and_then(from_ms),
        limit,
    )
    .await?;
    rows.reverse();
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

#[derive(Deserialize)]
pub struct QuoteBody {
    id: String,
    name: String,
    text: String,
}

#[derive(Deserialize)]
pub struct SendBody {
    name: String,
    text: String,
    re: Option<QuoteBody>,
}

pub async fn send(
    State(state): State<AppState>,
    GooglePlayer(player): GooglePlayer,
    Path(r): Path<String>,
    Json(b): Json<SendBody>,
) -> AppResult<(StatusCode, Json<MessageDto>)> {
    let r = room(&r)?;
    let name = PlayerName::parse(&b.name)?;
    let text = ChatText::parse(&b.text)?;
    let quote = b.re.map(|q| Quote::parse(&q.id, &q.name, &q.text)).transpose()?;
    if !repo::take_send_slot(&state.db, player, chat::MIN_GAP.as_millis() as i64).await? {
        return Err(AppError::TooManyRequests("one message every 2 seconds"));
    }
    let message: MessageDto =
        repo::insert(&state.db, r, player, name.as_str(), &text, quote.as_ref()).await?.into();
    state.hub.publish_room(r, "message", &message);
    Ok((StatusCode::CREATED, Json(message)))
}

#[derive(Deserialize)]
pub struct ReactionBody {
    /// `null` removes the player's reaction.
    emoji: Option<String>,
}

pub async fn react(
    State(state): State<AppState>,
    GooglePlayer(player): GooglePlayer,
    Path((r, id)): Path<(String, Uuid)>,
    Json(b): Json<ReactionBody>,
) -> AppResult<Json<MessageDto>> {
    let r = room(&r)?;
    let emoji = b.emoji.as_deref().map(chat::parse_reaction).transpose()?;
    let row = repo::react(&state.db, r, id, player, emoji).await?.ok_or(AppError::NotFound)?;
    let message: MessageDto = row.into();
    state.hub.publish_room(r, "update", &message);
    Ok(Json(message))
}

/// Players may blank their own messages (nothing is ever really removed from the history).
pub async fn remove(
    State(state): State<AppState>,
    GooglePlayer(player): GooglePlayer,
    Path((r, id)): Path<(String, Uuid)>,
) -> AppResult<Json<MessageDto>> {
    let r = room(&r)?;
    let row = repo::blank(&state.db, Some(r), id, Some(player)).await?.ok_or(AppError::NotFound)?;
    let message: MessageDto = row.into();
    state.hub.publish_room(r, "update", &message);
    Ok(Json(message))
}

pub async fn report(
    State(state): State<AppState>,
    GooglePlayer(player): GooglePlayer,
    Path((r, id)): Path<(String, Uuid)>,
) -> AppResult<StatusCode> {
    repo::report(&state.db, player, room(&r)?, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct HeartbeatBody {
    name: String,
    /// Game being played, "" in the menus.
    g: String,
    /// Room being typed in, "" when idle.
    typing: String,
}

pub async fn heartbeat(
    State(state): State<AppState>,
    GooglePlayer(player): GooglePlayer,
    Json(b): Json<HeartbeatBody>,
) -> AppResult<StatusCode> {
    let name = PlayerName::parse(&b.name)?;
    let valid = |s: &str| s.is_empty() || chat::is_room(s);
    if !valid(&b.g) || !valid(&b.typing) {
        return Err(Invalid("bad room").into());
    }
    state
        .hub
        .heartbeat(player, name.as_str().to_owned(), b.g, b.typing, Utc::now().timestamp_millis())
        .await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn presence(
    State(state): State<AppState>,
    _who: GooglePlayer,
) -> AppResult<Json<Vec<Presence>>> {
    Ok(Json(state.hub.who_is_online(Utc::now().timestamp_millis()).await))
}
