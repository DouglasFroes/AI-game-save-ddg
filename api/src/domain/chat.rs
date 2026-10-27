use std::time::Duration;

use super::{name::PlayerName, Invalid};

pub const GENERAL_ROOM: &str = "geral";
pub const MAX_TEXT_CHARS: usize = 280;
pub const MAX_QUOTE_CHARS: usize = 80;
/// At most one message every 2 s per player.
pub const MIN_GAP: Duration = Duration::from_secs(2);
/// Reactions anyone can add to a message.
pub const REACTIONS: &[&str] = &["❤️", "🔥", "😂", "👏", "😮", "🏆"];

/// A room is the general one or one per game.
pub fn is_room(room: &str) -> bool {
    room == GENERAL_ROOM || super::games::is_game(room)
}

/// Message text: 1 to 280 characters, and no links (they are a spam vector).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatText(String);

impl ChatText {
    pub fn parse(raw: &str) -> Result<Self, Invalid> {
        let text = raw.trim();
        if text.is_empty() {
            return Err(Invalid("message is empty"));
        }
        if text.chars().count() > MAX_TEXT_CHARS {
            return Err(Invalid("message is too long"));
        }
        let lower = text.to_lowercase();
        if lower.contains("http://") || lower.contains("https://") || lower.contains("www.") {
            return Err(Invalid("links are not allowed"));
        }
        Ok(Self(text.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// The start of the message a reply answers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Quote {
    pub id: String,
    pub name: PlayerName,
    pub text: String,
}

impl Quote {
    pub fn parse(id: &str, name: &str, text: &str) -> Result<Self, Invalid> {
        if id.is_empty() || id.len() > 40 {
            return Err(Invalid("bad quote id"));
        }
        Ok(Self {
            id: id.to_owned(),
            name: PlayerName::parse(name)?,
            text: text.chars().take(MAX_QUOTE_CHARS).collect(),
        })
    }
}

/// One of the allowed emojis.
pub fn parse_reaction(emoji: &str) -> Result<&'static str, Invalid> {
    REACTIONS.iter().copied().find(|r| *r == emoji).ok_or(Invalid("reaction not allowed"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rooms() {
        assert!(is_room("geral") && is_room("stack"));
        assert!(!is_room("nope"));
    }

    #[test]
    fn text_rules() {
        assert!(ChatText::parse(" oi ").is_ok());
        assert!(ChatText::parse("   ").is_err());
        assert!(ChatText::parse(&"a".repeat(281)).is_err());
        assert!(ChatText::parse(&"a".repeat(280)).is_ok());
        assert!(ChatText::parse("veja https://x.com").is_err());
        assert!(ChatText::parse("entre em WWW.x.com").is_err());
    }

    #[test]
    fn quote_is_cut_to_80_chars() {
        let q = Quote::parse("id", "Ana", &"é".repeat(200)).unwrap();
        assert_eq!(q.text.chars().count(), 80);
    }

    #[test]
    fn only_listed_reactions() {
        assert!(parse_reaction("🔥").is_ok());
        assert!(parse_reaction("💩").is_err());
    }
}
