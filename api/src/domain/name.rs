use super::Invalid;

pub const MAX_NAME_CHARS: usize = 16;

/// A player's nickname: 1 to 16 characters, no surrounding spaces.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlayerName(String);

impl PlayerName {
    pub fn parse(raw: &str) -> Result<Self, Invalid> {
        let name = raw.trim();
        match name.chars().count() {
            0 => Err(Invalid("name is empty")),
            n if n > MAX_NAME_CHARS => Err(Invalid("name is too long")),
            _ if name.chars().any(char::is_control) => Err(Invalid("name has control characters")),
            _ => Ok(Self(name.to_owned())),
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_and_accepts() {
        assert_eq!(PlayerName::parse("  Douglas ").unwrap().as_str(), "Douglas");
    }

    #[test]
    fn counts_characters_not_bytes() {
        assert!(PlayerName::parse("ãããããããããããããããã").is_ok()); // 16 chars, 32 bytes
        assert!(PlayerName::parse("ããããããããããããããããã").is_err()); // 17 chars
    }

    #[test]
    fn rejects_empty_and_control() {
        assert!(PlayerName::parse("   ").is_err());
        assert!(PlayerName::parse("a\nb").is_err());
    }
}
