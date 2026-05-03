//! Persistent configuration system.
//!
//! Stores app settings as a JSON file in the platform-appropriate config directory:
//! - Linux:   ~/.config/typevoice/config.json
//! - Windows: C:\Users\<user>\AppData\Roaming\typevoice\config.json
//! - macOS:   ~/Library/Application Support/typevoice/config.json

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

const APP_DIR_NAME: &str = "typevoice";
const CONFIG_FILE_NAME: &str = "config.json";

/// Application configuration — serialized to/from JSON
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// Groq API key for Whisper transcription
    #[serde(default)]
    pub groq_api_key: String,

    /// Global hotkey combination (e.g., "Ctrl+Shift+Space")
    #[serde(default = "default_hotkey")]
    pub hotkey: String,

    /// Language for transcription (ISO 639-1 code)
    #[serde(default = "default_language")]
    pub language: String,

    /// Whether to auto-inject text after transcription
    #[serde(default = "default_true")]
    pub auto_type: bool,

    /// Whether to play a sound on recording start/stop
    #[serde(default)]
    pub sound_feedback: bool,

    /// Typing delay between characters in milliseconds (for xdotool/SendInput)
    #[serde(default = "default_typing_delay")]
    pub typing_delay_ms: u32,

    /// Whether the app should run on system startup
    #[serde(default)]
    pub run_on_startup: bool,

    /// Whether the app should continue running in the background when the main window is closed
    #[serde(default = "default_true")]
    pub run_in_background: bool,
}

fn default_hotkey() -> String {
    "Ctrl+Shift+Space".to_string()
}

fn default_language() -> String {
    "en".to_string()
}

fn default_true() -> bool {
    true
}

fn default_typing_delay() -> u32 {
    12
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            groq_api_key: String::new(),
            hotkey: default_hotkey(),
            language: default_language(),
            auto_type: true,
            sound_feedback: false,
            typing_delay_ms: default_typing_delay(),
            run_on_startup: false,
            run_in_background: true,
        }
    }
}

/// Thread-safe config manager that handles reading/writing to disk
pub struct ConfigManager {
    config: Mutex<AppConfig>,
    config_path: PathBuf,
}

impl ConfigManager {
    /// Create a new ConfigManager. Loads existing config from disk or creates defaults.
    pub fn new() -> Self {
        let config_dir = Self::config_dir();
        let config_path = config_dir.join(CONFIG_FILE_NAME);

        let config = Self::load_from_disk(&config_path);

        println!("[config] Config path: {}", config_path.display());
        println!("[config] Loaded config: hotkey={}, language={}, auto_type={}", 
            config.hotkey, config.language, config.auto_type);

        // Apply API key to process environment so transcriber picks it up
        if !config.groq_api_key.is_empty() {
            std::env::set_var("GROQ_API_KEY", &config.groq_api_key);
            println!("[config] API key loaded ({} chars)", config.groq_api_key.len());
        }

        Self {
            config: Mutex::new(config),
            config_path,
        }
    }

    /// Get the platform-appropriate config directory, creating it if needed
    fn config_dir() -> PathBuf {
        let dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(APP_DIR_NAME);

        if !dir.exists() {
            if let Err(e) = fs::create_dir_all(&dir) {
                eprintln!("[config] Failed to create config directory: {}", e);
            }
        }

        dir
    }

    /// Load config from disk, falling back to defaults if file doesn't exist or is invalid
    fn load_from_disk(path: &PathBuf) -> AppConfig {
        match fs::read_to_string(path) {
            Ok(contents) => {
                serde_json::from_str(&contents).unwrap_or_else(|e| {
                    eprintln!("[config] Failed to parse config file, using defaults: {}", e);
                    AppConfig::default()
                })
            }
            Err(_) => {
                println!("[config] No config file found, using defaults");
                AppConfig::default()
            }
        }
    }

    /// Save current config to disk
    fn save_to_disk(&self, config: &AppConfig) -> Result<(), String> {
        let json = serde_json::to_string_pretty(config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        // Ensure parent directory exists
        if let Some(parent) = self.config_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        fs::write(&self.config_path, json)
            .map_err(|e| format!("Failed to write config file: {}", e))?;

        println!("[config] Saved config to {}", self.config_path.display());
        Ok(())
    }

    /// Get a clone of the current config
    pub fn get(&self) -> AppConfig {
        self.config.lock().unwrap().clone()
    }

    /// Update the config with a modifier function and save to disk
    pub fn update<F>(&self, modifier: F) -> Result<AppConfig, String>
    where
        F: FnOnce(&mut AppConfig),
    {
        let mut config = self.config.lock().map_err(|e| format!("Config lock error: {}", e))?;
        modifier(&mut config);
        self.save_to_disk(&config)?;
        Ok(config.clone())
    }

    /// Get the config file path (for debugging)
    pub fn config_path(&self) -> &PathBuf {
        &self.config_path
    }
}
