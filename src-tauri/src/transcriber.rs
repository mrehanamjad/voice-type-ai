//! Groq Whisper API transcription with persistent HTTP client.
//!
//! The reqwest::Client is created once and reused across all requests,
//! avoiding repeated TLS handshake setup (~50ms saved per call).

use reqwest::multipart;
use serde::Deserialize;
use std::path::Path;
use std::sync::OnceLock;

/// Groq Whisper API endpoint
const GROQ_TRANSCRIPTION_URL: &str = "https://api.groq.com/openai/v1/audio/transcriptions";

/// Model to use for transcription
const WHISPER_MODEL: &str = "whisper-large-v3-turbo";

/// Persistent HTTP client — initialized once, reused forever.
/// Keeps TCP connections alive and TLS sessions cached.
static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .pool_max_idle_per_host(2)
            .tcp_keepalive(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client")
    })
}

/// Response from the Groq transcription API
#[derive(Debug, Deserialize)]
struct TranscriptionResponse {
    text: String,
}

/// Transcribe a WAV audio file using the Groq Whisper API.
///
/// # Arguments
/// * `file_path` - Absolute path to the WAV file to transcribe
///
/// # Returns
/// The transcribed text, or an error message.
pub async fn transcribe_audio(file_path: &str) -> Result<String, String> {
    let api_key = std::env::var("GROQ_API_KEY")
        .map_err(|_| "GROQ_API_KEY not set. Add it in Settings.".to_string())?;

    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("Audio file not found: {}", file_path));
    }

    // Read file bytes (this is fast for small voice recordings)
    let file_bytes = std::fs::read(path)
        .map_err(|e| format!("Failed to read audio file: {}", e))?;

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("recording.wav")
        .to_string();

    let byte_count = file_bytes.len();
    println!(
        "[transcriber] Sending {} ({} bytes) to Groq API...",
        file_name, byte_count
    );

    let file_part = multipart::Part::bytes(file_bytes)
        .file_name(file_name)
        .mime_str("audio/wav")
        .map_err(|e| format!("Failed to set MIME type: {}", e))?;

    let form = multipart::Form::new()
        .text("model", WHISPER_MODEL.to_string())
        .text("response_format", "json".to_string())
        .text("language", "en".to_string())
        .part("file", file_part);

    // Use the persistent client (connection pooling + TLS session reuse)
    let client = get_client();
    let response = client
        .post(GROQ_TRANSCRIPTION_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Groq API error ({}): {}", status, body));
    }

    let transcription: TranscriptionResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse response: {} — body: {}", e, body))?;

    println!(
        "[transcriber] Result: \"{}\" ({} bytes → {} chars)",
        transcription.text, byte_count, transcription.text.len()
    );

    Ok(transcription.text)
}
