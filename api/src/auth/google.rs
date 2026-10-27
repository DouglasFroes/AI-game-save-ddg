use async_trait::async_trait;
use serde::Deserialize;

/// The Google account behind a sign-in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoogleIdentity {
    /// Stable Google account id.
    pub sub: String,
    pub email: String,
    pub name: String,
}

#[derive(Debug, thiserror::Error)]
pub enum GoogleError {
    /// The token is not valid, expired, or was issued to another application.
    #[error("google token refused")]
    Refused,
    /// Google could not be reached.
    #[error("google unavailable")]
    Unavailable,
}

/// Port: proves who a Google access token belongs to. Faked in the tests.
#[async_trait]
pub trait GoogleVerifier: Send + Sync {
    async fn verify(&self, access_token: &str) -> Result<GoogleIdentity, GoogleError>;
}

/// Asks Google itself: `tokeninfo` says which app the token was issued to, `userinfo` who it is.
pub struct HttpGoogleVerifier {
    client: reqwest::Client,
    client_id: String,
}

#[derive(Deserialize)]
struct TokenInfo {
    aud: String,
}

#[derive(Deserialize)]
struct UserInfo {
    sub: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    email_verified: bool,
    #[serde(default)]
    name: String,
}

impl HttpGoogleVerifier {
    pub fn new(client_id: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .expect("http client");
        Self { client, client_id }
    }

    async fn get<T: for<'de> Deserialize<'de>>(
        &self,
        request: reqwest::RequestBuilder,
    ) -> Result<T, GoogleError> {
        let response = request.send().await.map_err(|_| GoogleError::Unavailable)?;
        match response.status() {
            s if s.is_success() => response.json().await.map_err(|_| GoogleError::Unavailable),
            s if s.is_client_error() => Err(GoogleError::Refused),
            _ => Err(GoogleError::Unavailable),
        }
    }
}

#[async_trait]
impl GoogleVerifier for HttpGoogleVerifier {
    async fn verify(&self, access_token: &str) -> Result<GoogleIdentity, GoogleError> {
        let info: TokenInfo = self
            .get(
                self.client
                    .get("https://oauth2.googleapis.com/tokeninfo")
                    .query(&[("access_token", access_token)]),
            )
            .await?;
        if info.aud != self.client_id {
            return Err(GoogleError::Refused);
        }
        let user: UserInfo = self
            .get(
                self.client
                    .get("https://www.googleapis.com/oauth2/v3/userinfo")
                    .bearer_auth(access_token),
            )
            .await?;
        Ok(GoogleIdentity {
            sub: user.sub,
            // An unverified address must never grant admin access.
            email: if user.email_verified { user.email.to_lowercase() } else { String::new() },
            name: user.name,
        })
    }
}
