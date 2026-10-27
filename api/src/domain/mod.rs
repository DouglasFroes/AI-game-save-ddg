//! Pure business rules. No I/O: everything here is unit-tested without a database.
//!
//! Inputs are parsed into types that can only hold valid values ("parse, don't validate"), so the
//! rest of the program never re-checks them. These are the rules `firestore.rules` used to hold.

pub mod chat;
pub mod entry;
pub mod games;
pub mod name;
pub mod session;

use thiserror::Error;

/// Why an input was refused. The message is shown to the client as is.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[error("{0}")]
pub struct Invalid(pub &'static str);
