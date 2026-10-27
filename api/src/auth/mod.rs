//! Who is calling: session tokens (ours) and Google sign-in (verified against Google).

pub mod extract;
pub mod google;
pub mod token;

pub use extract::{AdminPlayer, AuthPlayer, GooglePlayer};
