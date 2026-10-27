use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A session lasts about six months; `/api/me` hands out a fresh one while it is in use.
pub const TOKEN_TTL_SECS: i64 = 180 * 24 * 3600;

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: Uuid,
    /// The player is signed in with Google (only they reach the global ranking and the chat).
    g: bool,
    iat: i64,
    exp: i64,
}

/// The verified content of a session token.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Identity {
    pub player: Uuid,
    pub google: bool,
}

#[derive(Clone)]
pub struct TokenService {
    encoding: EncodingKey,
    decoding: DecodingKey,
}

impl TokenService {
    pub fn new(secret: &str) -> Self {
        Self {
            encoding: EncodingKey::from_secret(secret.as_bytes()),
            decoding: DecodingKey::from_secret(secret.as_bytes()),
        }
    }

    pub fn issue(&self, identity: Identity) -> String {
        let now = Utc::now().timestamp();
        let claims =
            Claims { sub: identity.player, g: identity.google, iat: now, exp: now + TOKEN_TTL_SECS };
        encode(&Header::default(), &claims, &self.encoding).expect("HS256 signing cannot fail")
    }

    pub fn verify(&self, token: &str) -> Option<Identity> {
        let data = decode::<Claims>(token, &self.decoding, &Validation::default()).ok()?;
        Some(Identity { player: data.claims.sub, google: data.claims.g })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips() {
        let svc = TokenService::new("0123456789abcdef0123456789abcdef");
        let id = Identity { player: Uuid::new_v4(), google: true };
        assert_eq!(svc.verify(&svc.issue(id)), Some(id));
    }

    #[test]
    fn refuses_foreign_and_garbage_tokens() {
        let a = TokenService::new("0123456789abcdef0123456789abcdef");
        let b = TokenService::new("ffffffffffffffffffffffffffffffff");
        let token = a.issue(Identity { player: Uuid::new_v4(), google: false });
        assert_eq!(b.verify(&token), None);
        assert_eq!(a.verify("not.a.token"), None);
    }

    #[test]
    fn refuses_expired_tokens() {
        let svc = TokenService::new("0123456789abcdef0123456789abcdef");
        let claims = Claims { sub: Uuid::new_v4(), g: false, iat: 0, exp: 1 };
        let token = encode(&Header::default(), &claims, &svc.encoding).unwrap();
        assert_eq!(svc.verify(&token), None);
    }
}
