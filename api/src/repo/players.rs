use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{auth::google::GoogleIdentity, domain::games::CAMPAIGN_IDS};

#[derive(Debug, Clone, FromRow)]
pub struct Player {
    pub id: Uuid,
    pub google_sub: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_seen_at: DateTime<Utc>,
}

const COLUMNS: &str = "id, google_sub, email, name, created_at, last_seen_at";

pub async fn create_anonymous(pool: &PgPool) -> sqlx::Result<Player> {
    sqlx::query_as(&format!("INSERT INTO players (id) VALUES ($1) RETURNING {COLUMNS}"))
        .bind(Uuid::new_v4())
        .fetch_one(pool)
        .await
}

pub async fn get(pool: &PgPool, id: Uuid) -> sqlx::Result<Option<Player>> {
    sqlx::query_as(&format!("SELECT {COLUMNS} FROM players WHERE id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn touch(pool: &PgPool, id: Uuid) -> sqlx::Result<()> {
    sqlx::query("UPDATE players SET last_seen_at = now() WHERE id = $1").bind(id).execute(pool).await?;
    Ok(())
}

/// What happened when a player signed in with Google.
#[derive(Debug)]
pub struct SignIn {
    pub player: Player,
    /// Runs brought over from the anonymous player this device was using.
    pub moved: u64,
}

/// Signs `anonymous` (the player of this device, if any) into the Google account `google`:
/// - the Google account already plays here: the device's runs are merged into it;
/// - it is new: the device's player is simply upgraded, keeping every run it owns.
pub async fn sign_in_with_google(
    pool: &PgPool,
    google: &GoogleIdentity,
    anonymous: Option<Uuid>,
) -> sqlx::Result<SignIn> {
    let mut tx = pool.begin().await?;
    let existing: Option<Player> = sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM players WHERE google_sub = $1 FOR UPDATE"
    ))
    .bind(&google.sub)
    .fetch_optional(&mut *tx)
    .await?;

    // The device's player, only if it is still anonymous.
    let device: Option<Player> = match anonymous {
        Some(id) => {
            sqlx::query_as(&format!(
                "SELECT {COLUMNS} FROM players WHERE id = $1 AND google_sub IS NULL FOR UPDATE"
            ))
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?
        }
        None => None,
    };

    let (target, moved) = match (existing, device) {
        (Some(target), Some(device)) if target.id != device.id => {
            let moved = merge(&mut tx, device.id, target.id).await?;
            (target.id, moved)
        }
        (Some(target), _) => (target.id, 0),
        (None, Some(device)) => (device.id, 0),
        (None, None) => {
            let id: Uuid = sqlx::query_scalar("INSERT INTO players (id) VALUES ($1) RETURNING id")
                .bind(Uuid::new_v4())
                .fetch_one(&mut *tx)
                .await?;
            (id, 0)
        }
    };

    let player = sqlx::query_as(&format!(
        "UPDATE players SET google_sub = $2, email = $3, name = $4, last_seen_at = now()
         WHERE id = $1 RETURNING {COLUMNS}"
    ))
    .bind(target)
    .bind(&google.sub)
    .bind(&google.email)
    .bind(&google.name)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(SignIn { player, moved })
}

/// Moves everything `from` owns to `into`, then removes `from`. Returns how many runs moved.
/// Campaign boards keep a single row per player: the better one wins.
async fn merge(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    from: Uuid,
    into: Uuid,
) -> sqlx::Result<u64> {
    let campaigns: Vec<&str> = CAMPAIGN_IDS.to_vec();
    // The device's campaign row loses to an equal or better one already on the account...
    sqlx::query(
        "DELETE FROM entries a WHERE a.player_id = $1 AND a.game_id = ANY($3)
           AND EXISTS (SELECT 1 FROM entries b
                       WHERE b.player_id = $2 AND b.game_id = a.game_id AND b.score >= a.score)",
    )
    .bind(from)
    .bind(into)
    .bind(&campaigns)
    .execute(&mut **tx)
    .await?;
    // ...and otherwise replaces the account's worse one.
    sqlx::query(
        "DELETE FROM entries b WHERE b.player_id = $2 AND b.game_id = ANY($3)
           AND EXISTS (SELECT 1 FROM entries a WHERE a.player_id = $1 AND a.game_id = b.game_id)",
    )
    .bind(from)
    .bind(into)
    .bind(&campaigns)
    .execute(&mut **tx)
    .await?;
    let moved = sqlx::query("UPDATE entries SET player_id = $2 WHERE player_id = $1")
        .bind(from)
        .bind(into)
        .execute(&mut **tx)
        .await?
        .rows_affected();
    for table in ["play_sessions", "chat_messages", "chat_reports"] {
        let column = if table == "chat_reports" { "reporter_id" } else { "player_id" };
        sqlx::query(&format!("UPDATE {table} SET {column} = $2 WHERE {column} = $1"))
            .bind(from)
            .bind(into)
            .execute(&mut **tx)
            .await?;
    }
    sqlx::query("DELETE FROM players WHERE id = $1").bind(from).execute(&mut **tx).await?;
    Ok(moved)
}
