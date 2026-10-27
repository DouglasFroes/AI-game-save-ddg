use std::{env, net::SocketAddr, path::PathBuf};

use anyhow::{bail, Context};

/// Everything the server reads from its environment (see `.env.example`).
#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub bind: SocketAddr,
    /// Signs the players' session tokens. At least 32 characters.
    pub jwt_secret: String,
    /// OAuth client id of the Google sign-in; a token issued for another app is refused.
    pub google_client_id: String,
    /// Google accounts allowed into the admin panel.
    pub admin_emails: Vec<String>,
    /// Built game (`web/dist`) and admin panel (`admin/dist`).
    pub web_dir: PathBuf,
    pub admin_dir: PathBuf,
    /// Extra origins allowed to call the API (only needed when the game runs on another host).
    pub cors_origins: Vec<String>,
}

fn list(raw: &str) -> Vec<String> {
    raw.split(',').map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()).collect()
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let var = |k: &str| env::var(k).ok().filter(|v| !v.trim().is_empty());
        let required = |k: &str| var(k).with_context(|| format!("{k} is not set"));

        let jwt_secret = required("JWT_SECRET")?;
        if jwt_secret.len() < 32 {
            bail!("JWT_SECRET must have at least 32 characters");
        }
        Ok(Self {
            database_url: required("DATABASE_URL")?,
            bind: var("BIND").unwrap_or_else(|| "0.0.0.0:8080".into()).parse().context("BIND")?,
            jwt_secret,
            google_client_id: required("GOOGLE_CLIENT_ID")?,
            admin_emails: var("ADMIN_EMAILS").map(|v| list(&v)).unwrap_or_default(),
            web_dir: var("WEB_DIR").unwrap_or_else(|| "web".into()).into(),
            admin_dir: var("ADMIN_DIR").unwrap_or_else(|| "admin".into()).into(),
            cors_origins: var("CORS_ORIGINS").map(|v| list(&v)).unwrap_or_default(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::list;

    #[test]
    fn splits_and_normalises_lists() {
        assert_eq!(list(" A@x.com, ,b@Y.com "), ["a@x.com", "b@y.com"]);
    }
}
