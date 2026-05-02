import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import "./App.css";

type PipelineStage = "idle" | "recording" | "transcribing" | "typing" | "done";

interface PipelineStatus {
  stage: string;
  message: string;
  error: boolean;
}

interface AppConfig {
  groq_api_key: string;
  hotkey: string;
  language: string;
  auto_type: boolean;
  sound_feedback: boolean;
  typing_delay_ms: number;
  run_on_startup: boolean;
}

function App() {
  const [stage, setStage] = useState<PipelineStage>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [lastText, setLastText] = useState<string | null>(null);

  // Settings
  const [apiKey, setApiKey] = useState("");
  const [maskedKey, setMaskedKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [micStatus, setMicStatus] = useState<string | null>(null);
  const [micTesting, setMicTesting] = useState(false);

  // Config-backed preferences
  const [hotkey, setHotkey] = useState("Ctrl+Shift+Space");
  const [language, setLanguage] = useState("en");
  const [autoType, setAutoType] = useState(true);
  const [typingDelay, setTypingDelay] = useState(12);
  const [runOnStartup, setRunOnStartup] = useState(false);

  // Load config on mount
  useEffect(() => {
    invoke<AppConfig>("get_config").then(async (cfg) => {
      setHotkey(cfg.hotkey);
      setLanguage(cfg.language);
      setAutoType(cfg.auto_type);
      setTypingDelay(cfg.typing_delay_ms);
      
      // Sync autostart state with the actual system state via the plugin
      try {
        const isStartupEnabled = await isEnabled();
        setRunOnStartup(isStartupEnabled);
        
        // If config differs from actual system state, fix the config silently
        if (cfg.run_on_startup !== isStartupEnabled) {
          invoke("save_preferences", {
            language: cfg.language,
            autoType: cfg.auto_type,
            soundFeedback: false,
            typingDelayMs: cfg.typing_delay_ms,
            runOnStartup: isStartupEnabled,
          });
        }
      } catch (e) {
        console.error("Failed to check autostart status:", e);
      }
    });
    invoke<string>("get_api_key").then((masked) => {
      if (masked) setMaskedKey(masked);
    });
  }, []);

  // Pipeline event listeners
  useEffect(() => {
    const unlistenState = listen<{ is_recording: boolean }>(
      "recording-state-changed",
      (event) => {
        if (event.payload.is_recording) {
          setStage("recording");
          setIsError(false);
        }
      }
    );

    const unlistenPipeline = listen<PipelineStatus>(
      "pipeline-status",
      (event) => {
        const { stage: s, message, error } = event.payload;
        setStage(s as PipelineStage);
        setStatusMessage(message);
        setIsError(error);

        if (s === "done" && !error) {
          const match = message.match(/^(?:Typed|Transcribed): "(.+)"$/);
          if (match) setLastText(match[1]);
        }

        if (s === "done" || error) {
          setTimeout(() => {
            setStage("idle");
            setStatusMessage("");
            setIsError(false);
          }, 3000);
        }
      }
    );

    return () => {
      unlistenState.then((fn) => fn());
      unlistenPipeline.then((fn) => fn());
    };
  }, []);

  async function handleTestMic() {
    setMicTesting(true);
    setMicStatus(null);
    try {
      const result = await invoke<string>("test_microphone");
      setMicStatus(result);
    } catch (e) {
      setMicStatus(`Error: ${e}`);
    }
    setMicTesting(false);
  }

  async function handleSaveApiKey() {
    if (!apiKey.trim()) return;
    try {
      await invoke("save_api_key", { key: apiKey.trim() });
      const masked = await invoke<string>("get_api_key");
      setMaskedKey(masked);
      setApiKey("");
      setApiKeySaved(true);
      setTimeout(() => setApiKeySaved(false), 2000);
    } catch (e) {
      console.error("Failed to save API key:", e);
    }
  }

  const stageLabel = {
    idle: "Idle",
    recording: "Recording",
    transcribing: "Processing",
    typing: "Processing",
    done: "Done",
  }[stage];

  const stageColor = {
    idle: "var(--muted)",
    recording: "var(--red)",
    transcribing: "var(--orange)",
    typing: "var(--blue)",
    done: "var(--green)",
  }[stage];

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <h1>Voice Type AI</h1>
        <p className="subtitle">Hold hotkey → speak → release → text appears</p>
      </header>

      {/* ── Status Section ── */}
      <section className="section">
        <label className="section-label">Status</label>
        <div
          className={`status-badge ${stage === "recording" ? "pulse" : ""}`}
          style={{ background: isError ? "var(--red)" : stageColor }}
        >
          <span className="status-dot" />
          {isError ? "Error" : stageLabel}
        </div>
        {statusMessage && (
          <p className={`status-msg ${isError ? "error" : ""}`}>
            {statusMessage}
          </p>
        )}
      </section>

      {/* ── Last Transcription ── */}
      <section className="section">
        <label className="section-label">Last Transcription</label>
        <div className="transcript-box">
          {lastText ? `"${lastText}"` : "No transcriptions yet"}
        </div>
      </section>

      {/* ── Settings ── */}
      <section className="section">
        <label className="section-label">Settings</label>

        {/* API Key */}
        <div className="setting-row">
          <label className="setting-label">Groq API Key</label>
          {maskedKey && !apiKeySaved && (
            <span className="masked-key">{maskedKey}</span>
          )}
          {apiKeySaved && <span className="saved-msg">✓ Saved</span>}
        </div>
        <div className="input-row">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="gsk_..."
            className="input"
            onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
          />
          <button onClick={handleSaveApiKey} className="btn btn-primary" disabled={!apiKey.trim()}>
            Save
          </button>
        </div>

        {/* Hotkey */}
        <div className="setting-row" style={{ marginTop: "12px" }}>
          <label className="setting-label">Global Hotkey</label>
        </div>
        <div className="input-row">
          <input
            type="text"
            value={hotkey}
            className="input"
            readOnly
            title="Hotkey configuration coming soon"
          />
          <button className="btn" disabled title="Coming soon">
            Change
          </button>
        </div>

        {/* Language */}
        <div className="setting-row" style={{ marginTop: "12px" }}>
          <label className="setting-label">Language</label>
        </div>
        <div className="input-row">
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              invoke("save_preferences", {
                language: e.target.value,
                autoType,
                soundFeedback: false,
                typingDelayMs: typingDelay,
              });
            }}
            className="input"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="nl">Dutch</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="zh">Chinese</option>
            <option value="ar">Arabic</option>
            <option value="hi">Hindi</option>
            <option value="ur">Urdu</option>
            <option value="ru">Russian</option>
          </select>
        </div>

        {/* Auto-Type Toggle */}
        <div className="setting-row" style={{ marginTop: "12px" }}>
          <label className="setting-label">Auto-type after transcription</label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoType}
              onChange={(e) => {
                setAutoType(e.target.checked);
                invoke("save_preferences", {
                  language,
                  autoType: e.target.checked,
                  soundFeedback: false,
                  typingDelayMs: typingDelay,
                  runOnStartup,
                });
              }}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {/* Run on Startup Toggle */}
        <div className="setting-row" style={{ marginTop: "12px" }}>
          <label className="setting-label">Run on System Startup</label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={runOnStartup}
              onChange={async (e) => {
                const checked = e.target.checked;
                setRunOnStartup(checked);
                try {
                  if (checked) {
                    await enable();
                  } else {
                    await disable();
                  }
                  invoke("save_preferences", {
                    language,
                    autoType,
                    soundFeedback: false,
                    typingDelayMs: typingDelay,
                    runOnStartup: checked,
                  });
                } catch (err) {
                  console.error("Failed to toggle autostart:", err);
                  // Revert if failed
                  setRunOnStartup(!checked);
                }
              }}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {/* Mic Test */}
        <div className="setting-row" style={{ marginTop: "12px" }}>
          <label className="setting-label">Microphone</label>
          {micStatus && (
            <span className={micStatus.startsWith("Error") ? "error-msg" : "saved-msg"}>
              {micStatus}
            </span>
          )}
        </div>
        <button
          onClick={handleTestMic}
          className="btn btn-secondary"
          disabled={micTesting}
          style={{ width: "100%" }}
        >
          {micTesting ? "Testing..." : "🎤 Test Microphone"}
        </button>
      </section>
    </div>
  );
}

export default App;
