use chrono::{DateTime, Utc};

use super::{games, name::PlayerName, Invalid};

const MAX_DURATION_SEC: i64 = 43_200;
const MAX_SCORE: i64 = 100_000_000;
const ERROR_KINDS: &[&str] = &["error", "unhandledrejection", "webgl", "chunk"];

/// One stretch of play of one game, for the analytics.
#[derive(Debug, Clone)]
pub struct NewSession {
    pub id: String,
    pub name: PlayerName,
    pub game_id: String,
    pub duration_sec: i32,
    pub score: i64,
    pub started_at: DateTime<Utc>,
}

impl NewSession {
    pub fn parse(
        id: &str,
        name: &str,
        game_id: &str,
        duration_sec: f64,
        score: f64,
        started_at: &str,
    ) -> Result<Self, Invalid> {
        if id.is_empty() || id.len() > 64 {
            return Err(Invalid("bad session id"));
        }
        if !games::is_game(game_id) {
            return Err(Invalid("unknown game"));
        }
        let duration = if duration_sec.is_finite() { duration_sec.round() as i64 } else { 0 };
        if !(1..=MAX_DURATION_SEC).contains(&duration) {
            return Err(Invalid("duration out of range"));
        }
        let score = if score.is_finite() { (score.round() as i64).clamp(0, MAX_SCORE) } else { 0 };
        let started_at = DateTime::parse_from_rfc3339(started_at)
            .map_err(|_| Invalid("bad start time"))?
            .with_timezone(&Utc);
        Ok(Self {
            id: id.to_owned(),
            name: PlayerName::parse(name)?,
            game_id: game_id.to_owned(),
            duration_sec: duration as i32,
            score,
            started_at,
        })
    }
}

fn clean_trunc(s: &str, max_chars: usize, allow_newlines: bool) -> String {
    s.trim()
        .chars()
        .filter(|&c| !c.is_control() || (allow_newlines && (c == '\n' || c == '\t')))
        .take(max_chars)
        .collect()
}

/// A sanitized client-side error report (uncaught exception, unhandled rejection, WebGL loss).
#[derive(Debug, Clone)]
pub struct NewClientError {
    pub kind: String,
    pub message: String,
    pub stack: String,
    pub game_id: String,
    pub url: String,
    pub user_agent: String,
}

impl NewClientError {
    pub fn parse(
        kind: &str,
        message: &str,
        stack: &str,
        game_id: &str,
        url: &str,
        user_agent: &str,
    ) -> Result<Self, Invalid> {
        let k = kind.trim();
        if !ERROR_KINDS.contains(&k) {
            return Err(Invalid("bad error kind"));
        }
        let msg = clean_trunc(message, 300, false);
        if msg.is_empty() {
            return Err(Invalid("empty error message"));
        }
        let g = game_id.trim();
        let valid_game = if g.is_empty() || !games::is_game(g) { "" } else { g };
        Ok(Self {
            kind: k.to_owned(),
            message: msg,
            stack: clean_trunc(stack, 1500, true),
            game_id: valid_game.to_owned(),
            url: clean_trunc(url, 300, false),
            user_agent: clean_trunc(user_agent, 250, false),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const T: &str = "2026-10-26T10:00:00.000Z";

    #[test]
    fn accepts_a_session() {
        let s = NewSession::parse("abc", "Ana", "stack", 61.6, 10.0, T).unwrap();
        assert_eq!((s.duration_sec, s.score), (62, 10));
    }

    #[test]
    fn rejects_bad_input() {
        assert!(NewSession::parse("", "Ana", "stack", 5.0, 1.0, T).is_err());
        assert!(NewSession::parse("a", "Ana", "nope", 5.0, 1.0, T).is_err());
        assert!(NewSession::parse("a", "Ana", "stack", 0.0, 1.0, T).is_err());
        assert!(NewSession::parse("a", "Ana", "stack", 43_201.0, 1.0, T).is_err());
        assert!(NewSession::parse("a", "Ana", "stack", 5.0, 1.0, "yesterday").is_err());
    }

    #[test]
    fn parses_and_truncates_client_errors() {
        let err = NewClientError::parse(
            "webgl",
            "Context lost",
            "at GrauScene.ts:10\nat main.ts:20",
            "grau",
            "https://example.com/?jogo=grau",
            "Mozilla/5.0",
        )
        .unwrap();
        assert_eq!((err.kind.as_str(), err.game_id.as_str()), ("webgl", "grau"));
        assert!(NewClientError::parse("bogus", "x", "", "", "", "").is_err());
        assert!(NewClientError::parse("error", "   ", "", "", "", "").is_err());
    }
}
