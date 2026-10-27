//! The games that have a ranking. Keep in sync with `web/src/games/registry.ts`.

pub const GAME_IDS: &[&str] = &["doguinho", "blockblast", "sudoku", "roadfighter", "game2048", "flappybee", "snake", "stack", "fruitmerge", "grau", "luta", "bomba", "turma", "corre", "crush", "lenha", "piano", "alvo", "pula", "atravessa", "hexa", "tijolos", "memoria", "cores", "milhao", "memofases", "bolha", "paciencia", "ultima", "territorio", "helix", "zigue", "ponte", "corcerta", "conta", "cesto", "sequencia", "relampago", "trio", "inverte", "balao", "toupeira", "corta", "gelo", "velha", "ligue4", "minas", "bolhas", "blocos", "comecome", "nave", "liquidos", "ricochete", "horda", "gancho", "orbita", "cadeia", "escorrega", "plinko", "tinta", "espelhos", "masmorra", "pinball", "dados", "selecao", "timesbr", "brasileirao", "sudoku2", "milhao2", "penalti", "golfe", "tenis", "basquete", "boliche", "curling", "skate", "boxe", "ciclismo", "esqui", "arqueiro", "galeria", "sniper", "damas", "naval", "domino", "hoquei"];

/// Campaign games rank a running total: each player keeps a single, growing entry.
pub const CAMPAIGN_IDS: &[&str] = &["doguinho", "memofases"];

pub fn is_game(id: &str) -> bool {
    GAME_IDS.contains(&id)
}

pub fn is_campaign(id: &str) -> bool {
    CAMPAIGN_IDS.contains(&id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn knows_games_and_campaigns() {
        assert!(is_game("stack"));
        assert!(!is_game("nope"));
        assert!(is_campaign("doguinho") && !is_campaign("stack"));
        assert!(CAMPAIGN_IDS.iter().all(|c| is_game(c)));
    }

    #[test]
    fn ids_are_unique() {
        let mut ids = GAME_IDS.to_vec();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), GAME_IDS.len());
    }
}
