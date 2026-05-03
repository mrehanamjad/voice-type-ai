mod config;
mod recorder;
mod transcriber;
mod typer;

use config::{AppConfig, ConfigManager};
use recorder::AudioRecorder;
use serde::Serialize;
use std::sync::Arc;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton};
use tauri::menu::{Menu, MenuItem};
use tauri_plugin_notification::NotificationExt;

/// Payload emitted to the frontend when recording state changes
#[derive(Clone, Serialize)]
struct RecordingStatePayload {
    is_recording: bool,
}

/// Pipeline status event payload — tracks each stage of the voice→text flow
#[derive(Clone, Serialize)]
struct PipelineStatusPayload {
    stage: String,
    message: String,
    /// true if this stage represents an error
    error: bool,
}

/// Simple greet command to verify the Tauri IPC bridge works
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Start audio recording from the system microphone
#[tauri::command]
fn start_recording(recorder: tauri::State<'_, Arc<AudioRecorder>>) -> Result<(), String> {
    recorder.start_recording()
}

/// Stop audio recording and return the WAV file path
#[tauri::command]
fn stop_recording(recorder: tauri::State<'_, Arc<AudioRecorder>>) -> Result<String, String> {
    recorder.stop_recording()
}

/// Transcribe a WAV file using Groq Whisper API
#[tauri::command]
async fn transcribe_audio(file_path: String) -> Result<String, String> {
    transcriber::transcribe_audio(&file_path).await
}

/// Type text into the currently focused application (system-wide)
#[tauri::command]
fn type_text(text: String) -> Result<(), String> {
    typer::type_text(&text)
}

/// Test microphone: records for ~2 seconds and returns success or error
#[tauri::command]
fn test_microphone(recorder: tauri::State<'_, Arc<AudioRecorder>>) -> Result<String, String> {
    recorder.start_recording()?;
    std::thread::sleep(std::time::Duration::from_secs(2));
    let path = recorder.stop_recording()?;
    let _ = std::fs::remove_file(&path);
    Ok("Microphone is working!".to_string())
}

// ─── Config commands ────────────────────────────────────────

/// Get the full config (returned as JSON to the frontend)
#[tauri::command]
fn get_config(config: tauri::State<'_, Arc<ConfigManager>>) -> AppConfig {
    config.get()
}

/// Save API key to persistent config
#[tauri::command]
fn save_api_key(key: String, config: tauri::State<'_, Arc<ConfigManager>>) -> Result<(), String> {
    config.update(|c| {
        c.groq_api_key = key.clone();
    })?;
    // Also set in process env so transcriber picks it up immediately
    std::env::set_var("GROQ_API_KEY", &key);
    println!("[config] API key saved ({} chars)", key.len());
    Ok(())
}

/// Get masked API key for display in UI
#[tauri::command]
fn get_api_key(config: tauri::State<'_, Arc<ConfigManager>>) -> String {
    let cfg = config.get();
    if cfg.groq_api_key.is_empty() {
        String::new()
    } else {
        let visible: String = cfg.groq_api_key.chars().take(8).collect();
        format!("{}****", visible)
    }
}

/// Update the hotkey combination in config
#[tauri::command]
fn save_hotkey(hotkey: String, config: tauri::State<'_, Arc<ConfigManager>>) -> Result<(), String> {
    config.update(|c| {
        c.hotkey = hotkey.clone();
    })?;
    println!("[config] Hotkey saved: {}", hotkey);
    Ok(())
}

/// Update user preferences in config
#[tauri::command]
fn save_preferences(
    language: Option<String>,
    auto_type: Option<bool>,
    sound_feedback: Option<bool>,
    typing_delay_ms: Option<u32>,
    run_on_startup: Option<bool>,
    run_in_background: Option<bool>,
    config: tauri::State<'_, Arc<ConfigManager>>,
) -> Result<(), String> {
    config.update(|c| {
        if let Some(lang) = language {
            c.language = lang;
        }
        if let Some(at) = auto_type {
            c.auto_type = at;
        }
        if let Some(sf) = sound_feedback {
            c.sound_feedback = sf;
        }
        if let Some(td) = typing_delay_ms {
            c.typing_delay_ms = td;
        }
        if let Some(ros) = run_on_startup {
            c.run_on_startup = ros;
        }
        if let Some(rib) = run_in_background {
            c.run_in_background = rib;
        }
    })?;
    println!("[config] Preferences updated");
    Ok(())
}

// ─── Pipeline helper ────────────────────────────────────────

/// Helper: emit a pipeline status event to the frontend
fn emit_status(app: &tauri::AppHandle, stage: &str, message: &str, error: bool) {
    println!(
        "[pipeline] {} → {}{}",
        stage,
        message,
        if error { " ❌" } else { "" }
    );
    let _ = app.emit(
        "pipeline-status",
        PipelineStatusPayload {
            stage: stage.to_string(),
            message: message.to_string(),
            error,
        },
    );
    // Also fire OS system notification on error
    if error {
        send_notification(app, "Voice Typing Error", message);
    }
}


fn send_notification(app: &tauri::AppHandle, title: &str, body: &str) {
    println!("[notification] {} — {}", title, body);

    let mut success = false;

    // ─────────────────────────────────────────────
    // Windows + macOS (Tauri native notifications)
    // ─────────────────────────────────────────────
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        let result = app
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show();

        match result {
            Ok(_) => {
                println!("[notification] Tauri notification sent");
                success = true;
            }
            Err(e) => {
                eprintln!("[notification] Tauri failed: {}", e);
            }
        }
    }

    // ─────────────────────────────────────────────
    // Linux fallback (most reliable layer)
    // ─────────────────────────────────────────────
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;

        let result = Command::new("notify-send")
            .arg(title)
            .arg(body)
            .arg("-u")
            .arg("critical")
            .spawn();

        match result {
            Ok(_) => {
                println!("[notification] Linux notify-send executed");
                success = true;
            }
            Err(e) => {
                eprintln!("[notification] notify-send failed: {}", e);
            }
        }
    }

    // ─────────────────────────────────────────────
    // Final fallback log (useful for debugging)
    // ─────────────────────────────────────────────
    if !success {
        eprintln!(
            "[notification] ALL METHODS FAILED → {}: {}",
            title, body
        );
    }
}

/// Show the overlay window (creates it if it doesn't exist)
fn show_overlay(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.show();
    } else {
        // Create overlay on-the-fly if config-defined window isn't found
        match WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
            .title("Overlay")
            .inner_size(120.0, 48.0)
            .always_on_top(true)
            .decorations(false)
            .skip_taskbar(true)
            .resizable(false)
            .focused(false)
            .build()
        {
            Ok(_) => {
                println!("[overlay] Created and shown");
            }
            Err(e) => eprintln!("[overlay] Failed to create: {}", e),
        }
    }
}

/// Hide the overlay window
fn hide_overlay(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.hide();
    }
}

// ─── App entry ──────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env file (fallback for dev, config.json takes priority)
    dotenvy::dotenv().ok();

    // Initialize persistent config
    let config_manager = Arc::new(ConfigManager::new());
    let config_manager_clone = Arc::clone(&config_manager);

    // Initialize audio recorder with persistent microphone stream.
    // This pre-warms the audio pipeline so hotkey response is instant.
    let audio_recorder = Arc::new(
        AudioRecorder::new().expect("Failed to initialize audio recorder — is a microphone connected?")
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]), // pass minimized flag so it can start silently
        ))
        .plugin(tauri_plugin_opener::init())
        .manage(audio_recorder)
        .manage(config_manager)
        .setup(move |app| {
            // Setup System Tray
            if let Ok(quit_i) = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>) {
                if let Ok(show_i) = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>) {
                    if let Ok(menu) = Menu::with_items(app, &[&show_i, &quit_i]) {
                        let _ = TrayIconBuilder::new()
                            .icon(app.default_window_icon().unwrap().clone())
                            .menu(&menu)
                            .on_menu_event(|app_handle: &tauri::AppHandle, event| match event.id().as_ref() {
                                "quit" => {
                                    app_handle.exit(0);
                                }
                                "show" => {
                                    if let Some(win) = app_handle.get_webview_window("main") {
                                        let _ = win.show();
                                        let _ = win.set_focus();
                                    }
                                }
                                _ => {}
                            })
                            .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| {
                                if let TrayIconEvent::Click { button, .. } = event {
                                    if button == MouseButton::Left {
                                        if let Some(win) = tray.app_handle().get_webview_window("main") {
                                            let _ = win.show();
                                            let _ = win.set_focus();
                                        }
                                    }
                                }
                            })
                            .build(app);
                    }
                }
            }

            // Intercept main window close event for background mode
            if let Some(main_window) = app.get_webview_window("main") {
                let win_clone = main_window.clone();
                let cfg_clone = Arc::clone(&config_manager_clone);
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        if cfg_clone.get().run_in_background {
                            api.prevent_close();
                            let _ = win_clone.hide();
                        }
                    }
                });
            }

            // Position the overlay at top-center of the screen
            if let Some(overlay) = app.get_webview_window("overlay") {
                if let Some(monitor) = overlay.primary_monitor().ok().flatten() {
                    let screen_width = monitor.size().width as f64 / monitor.scale_factor();
                    let overlay_width = 120.0;
                    let x = ((screen_width - overlay_width) / 2.0) as i32;
                    let _ = overlay.set_position(tauri::Position::Logical(
                        tauri::LogicalPosition::new(x as f64, 10.0),
                    ));
                    println!("[overlay] Positioned at ({}, 10), screen width: {}", x, screen_width);
                }
            }

            // Register global hotkey: Ctrl + Shift + Space
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                let hotkey = Shortcut::new(
                    Some(Modifiers::CONTROL | Modifiers::SHIFT),
                    Code::Space,
                );

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            if shortcut != &hotkey {
                                return;
                            }

                            let recorder = app.state::<Arc<AudioRecorder>>();

                            match event.state() {
                                // ── STEP 1: Hotkey pressed → Start recording ──
                                ShortcutState::Pressed => {
                                    emit_status(app, "recording", "Listening...", false);
                                    show_overlay(app);

                                    if let Err(e) = recorder.start_recording() {
                                        emit_status(app, "recording", &format!("Failed to start: {}", e), true);
                                        hide_overlay(app);
                                        return;
                                    }

                                    let _ = app.emit(
                                        "recording-state-changed",
                                        RecordingStatePayload { is_recording: true },
                                    );
                                }

                                // ── STEP 2–5: Hotkey released → Stop, Transcribe, Type ──
                                ShortcutState::Released => {
                                    let _ = app.emit(
                                        "recording-state-changed",
                                        RecordingStatePayload { is_recording: false },
                                    );

                                    let wav_path = match recorder.stop_recording() {
                                        Ok(path) => {
                                            emit_status(app, "recording", &format!("Saved: {}", path), false);
                                            path
                                        }
                                        Err(e) => {
                                            emit_status(app, "recording", &format!("Failed to stop: {}", e), true);
                                            hide_overlay(app);
                                            return;
                                        }
                                    };

                                    let app_handle = app.clone();
                                    tauri::async_runtime::spawn(async move {
                                        // Step 3: Transcribe via Groq API
                                        emit_status(&app_handle, "transcribing", "Sending to Groq Whisper API...", false);

                                        let text = match transcriber::transcribe_audio(&wav_path).await {
                                            Ok(t) => {
                                                if t.trim().is_empty() {
                                                    emit_status(&app_handle, "transcribing", "No speech detected", true);
                                                    hide_overlay(&app_handle);
                                                    return;
                                                }
                                                emit_status(
                                                    &app_handle,
                                                    "transcribing",
                                                    &format!("\"{}\"", t),
                                                    false,
                                                );
                                                t
                                            }
                                            Err(e) => {
                                                emit_status(&app_handle, "transcribing", &format!("API error: {}", e), true);
                                                hide_overlay(&app_handle);
                                                return;
                                            }
                                        };

                                        // Step 4: Inject text (check auto_type preference)
                                        let cfg = app_handle.state::<Arc<ConfigManager>>();
                                        if cfg.get().auto_type {
                                            emit_status(&app_handle, "typing", "Injecting text...", false);

                                            match typer::type_text(&text) {
                                                Ok(()) => {
                                                    emit_status(&app_handle, "done", &format!("Typed: \"{}\"", text), false);
                                                }
                                                Err(e) => {
                                                    emit_status(&app_handle, "typing", &format!("Injection failed: {}", e), true);
                                                }
                                            }
                                        } else {
                                            emit_status(&app_handle, "done", &format!("Transcribed: \"{}\"", text), false);
                                        }

                                        // Hide overlay after a short delay so "done" animation plays
                                        let overlay_handle = app_handle.clone();
                                        tauri::async_runtime::spawn(async move {
                                            tokio::time::sleep(std::time::Duration::from_millis(800)).await;
                                            hide_overlay(&overlay_handle);
                                        });

                                        // Cleanup
                                        if let Err(e) = std::fs::remove_file(&wav_path) {
                                            eprintln!("[pipeline] Failed to cleanup WAV file: {}", e);
                                        } else {
                                            println!("[pipeline] Cleaned up: {}", wav_path);
                                        }
                                    });
                                }
                            }
                        })
                        .build(),
                )?;

                app.global_shortcut().register(hotkey)?;
                println!("[pipeline] Ready — Press Ctrl+Shift+Space to record and transcribe");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            start_recording,
            stop_recording,
            transcribe_audio,
            type_text,
            test_microphone,
            get_config,
            save_api_key,
            get_api_key,
            save_hotkey,
            save_preferences,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
