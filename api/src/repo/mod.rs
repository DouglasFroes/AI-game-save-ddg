//! Persistence: one module per aggregate, all plain SQL over a shared pool.

pub mod admin;
pub mod chat;
pub mod entries;
pub mod players;
pub mod sessions;

use sqlx::{postgres::PgPoolOptions, PgPool};

/// Opens the pool and brings the schema up to date.
pub async fn connect(url: &str) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new().max_connections(10).connect(url).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}
