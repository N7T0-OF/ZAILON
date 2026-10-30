//! Steam-safe launcher wrapper.
//!
//! Portage Rust (zéro dépendance) du projet open-source
//! `chdonncha/steam-wrapper-launcher` (.NET), dans l'esprit du steam-wrapper
//! d'Aurora (Rust). Remplace l'exécutable attendu par Steam (ou est référencé
//! dans les Options de lancement avec `%command%`) et lance le VRAI launcher /
//! jeu moddé en ignorant tous les arguments injectés par Steam.
//!
//! Comportement :
//! - ignore TOUS les arguments de la ligne de commande ;
//! - lit le chemin cible dans `launch_path.txt` (même dossier que l'exe) ;
//! - démarre la cible SANS arguments, dossier de travail = dossier de la cible ;
//! - aucune console (WinExe en release) ;
//! - attend brièvement après le lancement pour que Steam ne croie pas à un
//!   crash instantané ;
//! - si `launch_path.txt` est absent/invalide ou la cible introuvable, écrit
//!   `wrapper_error.log` à côté de l'exe.
//!
//! Build :
//! ```text
//! cd tools/steam-wrapper
//! cargo build --release
//! ```
//! L'exe est dans `tools/steam-wrapper/target/release/steam-wrapper.exe`.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::Duration;

/// Fichier de configuration : contient le chemin complet du launcher réel.
const CONFIG_FILE: &str = "launch_path.txt";
/// Journal d'erreur écrit à côté de l'exécutable en cas de problème.
const ERROR_LOG: &str = "wrapper_error.log";
/// Délai avant la sortie du wrapper : Steam considère le jeu comme lancé tant
/// que le wrapper tourne ; il ne doit pas sembler avoir « crashé ».
const HOLD_SECONDS: u64 = 3;

fn main() {
    if let Err(message) = run() {
        // Jamais de console : l'erreur part dans un fichier journal local.
        let _ = fs::write(ERROR_LOG, message);
    }
}

fn run() -> Result<(), String> {
    // 1. Ignorer tous les arguments injectés par Steam (ex. chemin de l'exe
    //    d'origine ajouté via %command%).
    let config = PathBuf::from(CONFIG_FILE);

    let target = fs::read_to_string(&config)
        .map_err(|error| format!("Missing config file: {CONFIG_FILE} ({error})"))?
        .trim()
        .to_string();

    if target.is_empty() {
        return Err(format!("{CONFIG_FILE} is empty — write the full path of the real launcher."));
    }

    let target_path = PathBuf::from(&target);
    if !target_path.is_file() {
        return Err(format!("Target file not found: {target}"));
    }

    let working_dir = target_path
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));

    // 2. Démarrer la cible SANS arguments.
    let mut child = Command::new(&target_path)
        .current_dir(working_dir)
        .spawn()
        .map_err(|error| format!("Could not start {target}: {error}"))?;

    // 3. Attendre un court instant, puis laisser la main : Steam ne voit pas
    //    un wrapper qui « se ferme immédiatement » comme un crash.
    thread::sleep(Duration::from_secs(HOLD_SECONDS));
    let _ = child.try_wait();

    Ok(())
}
