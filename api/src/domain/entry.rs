use serde_json::{Map, Value};

use super::{games, name::PlayerName, Invalid};

pub const MAX_SCORE: i64 = 100_000_000;
const MAX_DETAILS: usize = 6;

/// A run ready to be stored on a board.
#[derive(Debug, Clone)]
pub struct NewEntry {
    pub game_id: String,
    pub name: PlayerName,
    pub score: i64,
    /// Game-specific numbers shown as extra columns (stars, time, distance...).
    pub details: Map<String, Value>,
}

impl NewEntry {
    pub fn parse(
        game_id: &str,
        name: &str,
        score: f64,
        details: Option<Value>,
    ) -> Result<Self, Invalid> {
        if !games::is_game(game_id) {
            return Err(Invalid("unknown game"));
        }
        if !score.is_finite() {
            return Err(Invalid("score is not a number"));
        }
        let score = score.round() as i64;
        if !(0..=MAX_SCORE).contains(&score) {
            return Err(Invalid("score out of range"));
        }
        Ok(Self {
            game_id: game_id.to_owned(),
            name: PlayerName::parse(name)?,
            score,
            details: parse_details(details)?,
        })
    }
}

fn parse_details(raw: Option<Value>) -> Result<Map<String, Value>, Invalid> {
    let map = match raw {
        None | Some(Value::Null) => return Ok(Map::new()),
        Some(Value::Object(map)) => map,
        Some(_) => return Err(Invalid("details must be an object")),
    };
    if map.len() > MAX_DETAILS {
        return Err(Invalid("too many details"));
    }
    if map.iter().any(|(k, v)| k.len() > 32 || !v.as_f64().is_some_and(f64::is_finite)) {
        return Err(Invalid("details must map short names to numbers"));
    }
    Ok(map)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn accepts_a_valid_run() {
        let e = NewEntry::parse("stack", "Ana", 120.4, Some(json!({"perfects": 3}))).unwrap();
        assert_eq!((e.score, e.details.len()), (120, 1));
    }

    #[test]
    fn rejects_unknown_games_and_bad_scores() {
        assert!(NewEntry::parse("nope", "Ana", 1.0, None).is_err());
        assert!(NewEntry::parse("stack", "Ana", -1.0, None).is_err());
        assert!(NewEntry::parse("stack", "Ana", f64::NAN, None).is_err());
        assert!(NewEntry::parse("stack", "Ana", 100_000_001.0, None).is_err());
        assert!(NewEntry::parse("stack", "Ana", 100_000_000.0, None).is_ok());
    }

    #[test]
    fn limits_details() {
        let seven: Value = (0..7).map(|i| (format!("k{i}"), json!(i))).collect();
        assert!(NewEntry::parse("stack", "Ana", 1.0, Some(seven)).is_err());
        assert!(NewEntry::parse("stack", "Ana", 1.0, Some(json!({"a": "x"}))).is_err());
        assert!(NewEntry::parse("stack", "Ana", 1.0, Some(json!([1]))).is_err());
    }
}
