//! Fliper API: rankings, play analytics and chat for the arcade, plus the admin panel's data.
//! It also serves the built game and admin panel, so one container runs the whole product.

pub mod auth;
pub mod chat;
pub mod config;
pub mod domain;
pub mod error;
pub mod http;
pub mod import;
pub mod repo;
pub mod state;
