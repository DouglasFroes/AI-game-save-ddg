use chrono::{DateTime, Utc};

use super::{games, name::PlayerName, Invalid};

const MAX_DURATION_SEC: i64 = 43_200;
const MAX_SCORE: i64 = 100_000_000;

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
}
