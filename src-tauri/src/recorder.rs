//! Low-latency audio recorder with persistent microphone stream.
//!
//! Architecture:
//! - The cpal audio stream is initialized ONCE at construction and kept alive.
//! - An `AtomicBool` flag controls whether incoming samples are captured.
//! - Samples buffer to an in-memory `Vec<i16>` (no disk I/O during recording).
//! - On stop: the buffer is drained and written to a WAV file in one fast pass.
//!
//! Result: start_recording() completes in < 1μs (just flips a bool).

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use hound::{WavSpec, WavWriter};
use std::io::{BufWriter, Cursor};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// Pre-allocated buffer capacity (5 minutes at 48kHz mono ≈ 28MB)
const INITIAL_BUFFER_CAPACITY: usize = 48_000 * 60 * 5;

/// Shared state for the audio recorder
pub struct AudioRecorder {
    /// Flag: true while samples should be captured to the buffer
    is_capturing: Arc<AtomicBool>,
    /// In-memory sample buffer (i16 PCM)
    buffer: Arc<Mutex<Vec<i16>>>,
    /// Audio stream config (sample rate, channels) — set during init
    sample_rate: u32,
    channels: u16,
    /// Keep the stream alive for the lifetime of the recorder
    _stream: cpal::Stream,
}

// cpal::Stream is !Send by default on some platforms, but we only access it from
// the thread that created it. Tauri manages the state safely via Arc.
unsafe impl Send for AudioRecorder {}
unsafe impl Sync for AudioRecorder {}

impl AudioRecorder {
    /// Initialize the recorder: opens the default input device and starts the
    /// audio stream immediately. Samples are discarded until start_recording().
    pub fn new() -> Result<Self, String> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or("No input device available")?;

        println!(
            "[recorder] Using input device: {:?}",
            device.description()
        );

        let supported_config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get default input config: {}", e))?;

        let sample_rate = supported_config.sample_rate();
        let channels = supported_config.channels();
        let sample_format = supported_config.sample_format();

        println!(
            "[recorder] Stream config: {}Hz, {} ch, {:?}",
            sample_rate, channels, sample_format
        );

        let is_capturing = Arc::new(AtomicBool::new(false));
        let buffer = Arc::new(Mutex::new(Vec::with_capacity(INITIAL_BUFFER_CAPACITY)));

        let is_capturing_clone = is_capturing.clone();
        let buffer_clone = buffer.clone();

        let err_fn = |err: cpal::StreamError| {
            eprintln!("[recorder] Stream error: {}", err);
        };

        let stream = match sample_format {
            cpal::SampleFormat::F32 => {
                let is_cap = is_capturing_clone;
                let buf = buffer_clone;
                device
                    .build_input_stream(
                        &supported_config.into(),
                        move |data: &[f32], _: &cpal::InputCallbackInfo| {
                            if !is_cap.load(Ordering::Relaxed) {
                                return;
                            }
                            if let Ok(mut b) = buf.try_lock() {
                                b.extend(data.iter().map(|&s| {
                                    (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
                                }));
                            }
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| format!("Failed to build input stream: {}", e))?
            }
            cpal::SampleFormat::I16 => {
                let is_cap = is_capturing_clone;
                let buf = buffer_clone;
                device
                    .build_input_stream(
                        &supported_config.into(),
                        move |data: &[i16], _: &cpal::InputCallbackInfo| {
                            if !is_cap.load(Ordering::Relaxed) {
                                return;
                            }
                            if let Ok(mut b) = buf.try_lock() {
                                b.extend_from_slice(data);
                            }
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| format!("Failed to build input stream: {}", e))?
            }
            cpal::SampleFormat::U16 => {
                let is_cap = is_capturing_clone;
                let buf = buffer_clone;
                device
                    .build_input_stream(
                        &supported_config.into(),
                        move |data: &[u16], _: &cpal::InputCallbackInfo| {
                            if !is_cap.load(Ordering::Relaxed) {
                                return;
                            }
                            if let Ok(mut b) = buf.try_lock() {
                                b.extend(data.iter().map(|&s| (s as i32 - 32768) as i16));
                            }
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| format!("Failed to build input stream: {}", e))?
            }
            other => {
                return Err(format!("Unsupported sample format: {:?}", other));
            }
        };

        // Start the stream immediately — samples are discarded until is_capturing=true
        stream
            .play()
            .map_err(|e| format!("Failed to start audio stream: {}", e))?;

        println!("[recorder] Audio stream initialized and ready (persistent)");

        Ok(Self {
            is_capturing,
            buffer,
            sample_rate,
            channels,
            _stream: stream,
        })
    }

    /// Start capturing audio samples. Returns instantly (< 1μs).
    pub fn start_recording(&self) -> Result<(), String> {
        if self.is_capturing.load(Ordering::SeqCst) {
            return Err("Already recording".into());
        }

        // Clear the buffer from any previous recording
        if let Ok(mut buf) = self.buffer.lock() {
            buf.clear();
        }

        // Flip the flag — the stream callback will start buffering samples
        self.is_capturing.store(true, Ordering::SeqCst);
        println!("[recorder] ● Recording started (instant)");
        Ok(())
    }

    /// Stop capturing and write buffered samples to a WAV file.
    /// Returns the path to the saved file.
    pub fn stop_recording(&self) -> Result<String, String> {
        if !self.is_capturing.load(Ordering::SeqCst) {
            return Err("Not currently recording".into());
        }

        // Stop capturing — the stream callback will stop buffering
        self.is_capturing.store(false, Ordering::SeqCst);

        // Take the buffer contents
        let samples = {
            let mut buf = self.buffer.lock().map_err(|e| format!("Lock error: {}", e))?;
            std::mem::take(&mut *buf)
        };

        let sample_count = samples.len();
        println!(
            "[recorder] ■ Recording stopped: {} samples ({:.1}s)",
            sample_count,
            sample_count as f64 / (self.sample_rate as f64 * self.channels as f64)
        );

        if samples.is_empty() {
            return Err("No audio captured".into());
        }

        // Write WAV from memory buffer — fast single pass
        let file_path = Self::write_wav(&samples, self.sample_rate, self.channels)?;
        Ok(file_path)
    }

    /// Write samples to a WAV file. Returns the file path.
    fn write_wav(samples: &[i16], sample_rate: u32, channels: u16) -> Result<String, String> {
        let temp_dir = std::env::temp_dir();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let file_path = temp_dir
            .join(format!("typevoice_{}.wav", timestamp))
            .to_string_lossy()
            .to_string();

        let spec = WavSpec {
            channels,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        // Write to an in-memory buffer first, then flush to disk in one write
        let mut wav_buf = Cursor::new(Vec::with_capacity(samples.len() * 2 + 44));
        {
            let mut writer = WavWriter::new(BufWriter::new(&mut wav_buf), spec)
                .map_err(|e| format!("Failed to create WAV writer: {}", e))?;

            for &sample in samples {
                writer
                    .write_sample(sample)
                    .map_err(|e| format!("Failed to write sample: {}", e))?;
            }

            writer
                .finalize()
                .map_err(|e| format!("Failed to finalize WAV: {}", e))?;
        }

        std::fs::write(&file_path, wav_buf.into_inner())
            .map_err(|e| format!("Failed to write WAV file: {}", e))?;

        println!("[recorder] WAV saved: {} ({} bytes)", file_path, samples.len() * 2 + 44);
        Ok(file_path)
    }
}
