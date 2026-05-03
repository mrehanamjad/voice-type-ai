import { useState, useEffect, useCallback, JSX } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import "./App.css";

/* ─────────── Types ─────────── */
type PipelineStage = "idle" | "recording" | "transcribing" | "typing" | "done" | "error";
type NavPage = "dashboard" | "settings" | "about";

interface PipelineStatus { stage: string; message: string; error: boolean; }
interface AppConfig {
  groq_api_key: string; hotkey: string; language: string;
  auto_type: boolean; sound_feedback: boolean;
  typing_delay_ms: number; run_on_startup: boolean;
  run_in_background: boolean;
}

/* ─────────── Icons ─────────── */
const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const TypeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" />
  </svg>
);

const KeyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l2.09 5.26L20 10l-5.91 1.74L12 17l-2.09-5.26L4 10l5.91-1.74L12 3z" />
  </svg>
);

/* ─────────── Toggle ─────────── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div className="toggle-track" />
      <div className="toggle-thumb" />
    </label>
  );
}

/* ─────────── Status Chip ─────────── */
function StatusChip({ stage, isError }: { stage: PipelineStage; isError: boolean }) {
  const effective = isError ? "error" : stage;
  const labels: Record<string, string> = {
    idle: "Ready", recording: "Recording", transcribing: "Transcribing",
    typing: "Typing", done: "Done", error: "Error",
  };
  return (
    <div className={`status-chip ${effective}`}>
      <div className="dot" />
      {labels[effective]}
    </div>
  );
}

/* ─────────── Live Animation ─────────── */
function LiveAnimation({ stage, isError }: { stage: PipelineStage; isError: boolean }) {
  const effective = isError ? "error" : stage;

  const anim = () => {
    if (effective === "recording") {
      return (
        <div className="wave-bars">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="wave-bar" />)}
        </div>
      );
    }
    if (effective === "transcribing") {
      return <div className="dot-loader orange"><div className="d" /><div className="d" /><div className="d" /></div>;
    }
    if (effective === "typing") {
      return <div className="dot-loader blue"><div className="d" /><div className="d" /><div className="d" /></div>;
    }
    if (effective === "done") {
      return <div className="state-badge done"><CheckIcon /></div>;
    }
    if (effective === "error") {
      return <div className="state-badge error"><XIcon /></div>;
    }
    return <div className="idle-icon"><MicIcon /></div>;
  };

  const info: Record<string, [string, string]> = {
    idle: ["Ready to record", "Hold your hotkey and speak"],
    recording: ["Recording…", "Release the hotkey when done speaking"],
    transcribing: ["Transcribing…", "Converting your speech to text"],
    typing: ["Typing…", "Inserting text into the focused field"],
    done: ["Done", "Text has been inserted successfully"],
    error: ["Something went wrong", "Check your API key and mic connection"],
  };

  const [name, desc] = info[effective] ?? info.idle;

  return (
    <div className={`live-panel ${effective}`}>
      <div className={`live-anim-wrap ${effective}`}>{anim()}</div>
      <div className="live-info">
        <div className="live-stage-name">{name}</div>
        <div className="live-stage-desc">{desc}</div>
      </div>
      <div className={`live-pulse ${effective}`} aria-hidden />
    </div>
  );
}

/* ─────────── Main App ─────────── */
function App() {
  const [page, setPage] = useState<NavPage>("dashboard");
  const [stage, setStage] = useState<PipelineStage>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [lastText, setLastText] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(() => {
    const s = localStorage.getItem("theme");
    return s ? s === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  /* settings */
  const [apiKey, setApiKey] = useState("");
  const [maskedKey, setMaskedKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [micStatus, setMicStatus] = useState<string | null>(null);
  const [micTesting, setMicTesting] = useState(false);
  const [hotkey, setHotkey] = useState("Ctrl+Shift+Space");
  const [language, setLanguage] = useState("en");
  const [autoType, setAutoType] = useState(true);
  const [typingDelay, setTypingDelay] = useState(12);
  const [runOnStartup, setRunOnStartup] = useState(false);
  const [runInBackground, setRunInBackground] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    invoke<AppConfig>("get_config").then(async (cfg) => {
      setHotkey(cfg.hotkey);
      setLanguage(cfg.language);
      setAutoType(cfg.auto_type);
      setTypingDelay(cfg.typing_delay_ms);
      setRunInBackground(cfg.run_in_background);
      try {
        const enabled = await isEnabled();
        setRunOnStartup(enabled);
        if (cfg.run_on_startup !== enabled) {
          invoke("save_preferences", { language: cfg.language, autoType: cfg.auto_type, soundFeedback: false, typingDelayMs: cfg.typing_delay_ms, runOnStartup: enabled, runInBackground: cfg.run_in_background });
        }
      } catch { }
    });
    invoke<string>("get_api_key").then(m => { if (m) setMaskedKey(m); });
  }, []);

  useEffect(() => {
    const unState = listen<{ is_recording: boolean }>("recording-state-changed", e => {
      if (e.payload.is_recording) { setStage("recording"); setIsError(false); }
    });
    const unPipeline = listen<PipelineStatus>("pipeline-status", e => {
      const { stage: s, message, error } = e.payload;
      setStage(s as PipelineStage);
      setStatusMessage(message);
      setIsError(error);
      if (s === "done" && !error) {
        const m = message.match(/^(?:Typed|Transcribed): "(.+)"$/);
        if (m) { setLastText(m[1]); setLastError(null); }
      }
      if (error) {
        setLastError(message);
        setLastText(null);
      }
      if (s === "done" || error) {
        setTimeout(() => { setStage("idle"); setStatusMessage(""); setIsError(false); }, 3000);
      }
    });
    return () => { unState.then(f => f()); unPipeline.then(f => f()); };
  }, []);

  const savePrefs = useCallback((overrides: object = {}) => {
    invoke("save_preferences", { language, autoType, soundFeedback: false, typingDelayMs: typingDelay, runOnStartup, runInBackground, ...overrides });
  }, [language, autoType, typingDelay, runOnStartup, runInBackground]);

  async function handleSaveApiKey() {
    if (!apiKey.trim()) return;
    try {
      await invoke("save_api_key", { key: apiKey.trim() });
      const masked = await invoke<string>("get_api_key");
      setMaskedKey(masked); setApiKey(""); setApiKeySaved(true);
      setTimeout(() => setApiKeySaved(false), 2000);
    } catch { }
  }

  async function handleTestMic() {
    setMicTesting(true); setMicStatus(null);
    try { setMicStatus(await invoke<string>("test_microphone")); }
    catch (e) { setMicStatus(`Error: ${e}`); }
    setMicTesting(false);
  }

  const hotkeyParts = hotkey.split("+");

  const navItems: { id: NavPage; label: string; icon: JSX.Element }[] = [
    { id: "dashboard", label: "Dashboard", icon: <MicIcon /> },
    { id: "settings", label: "Settings", icon: <SettingsIcon /> },
    { id: "about", label: "About", icon: <InfoIcon /> },
  ];

  return (
    <div className="shell">


      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="app-logo-mark">
            <MicIcon />
          </div>
          <span className="app-name">TypeVoice</span>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-label">Menu</span>
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-item-icon">{item.icon}</span>
              <span className="nav-item-label">{item.label}</span>
              {page === item.id && <span className="nav-item-indicator" aria-hidden />}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-version">v1.0.0</div>
        </div>
      </aside>

      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">
            {page === "dashboard" ? "Dashboard" : page === "settings" ? "Settings" : "About"}
          </span>
        </div>
        <div className="topbar-right">
          <StatusChip stage={stage} isError={isError} />
          <button className="theme-btn" onClick={() => setIsDark(d => !d)} title="Toggle theme">
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="main">

        {/* ══ DASHBOARD ══ */}
        {page === "dashboard" && (
          <>
            {/* Live state panel */}
            <div className="anim">
              <LiveAnimation stage={stage} isError={isError} />
            </div>

            {/* Hotkey */}
            <div className="card anim2">
              <div className="card-head">
                <div className="card-head-left">
                  <div className="card-icon brand"><KeyIcon /></div>
                  <span className="card-title">Global Hotkey</span>
                </div>
              </div>
              <div className="card-body-sm">
                <div className="hotkey-card-row">
                  <div className="hotkey-row">
                    {hotkeyParts.map((part, i) => (
                      <span key={i} style={{ display: "contents" }}>
                        <span className="kbd">{part}</span>
                        {i < hotkeyParts.length - 1 && <span className="kbd-plus">+</span>}
                      </span>
                    ))}
                  </div>
                  <span className="hotkey-hint">Hold to record · Release to transcribe</span>
                </div>
              </div>
            </div>

            {/* Steps */}
            <div className="card anim4">
              <div className="card-head">
                <div className="card-head-left">
                  <div className="card-icon muted"><InfoIcon /></div>
                  <span className="card-title">How it works</span>
                </div>
              </div>
              <div className="card-body">
                <div className="steps-list">
                  {[
                    { n: "1", t: "Hold the hotkey", d: "Press and hold your configured keyboard shortcut." },
                    { n: "2", t: "Speak clearly", d: "Talk into your microphone — any length works." },
                    { n: "3", t: "Release & type", d: "Release the hotkey. Text is inserted at your cursor." },
                  ].map(({ n, t, d }) => (
                    <div key={n} className="step-row">
                      <div className="step-num">{n}</div>
                      <div className="step-body">
                        <div className="step-title">{t}</div>
                        <div className="step-desc">{d}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Last transcription — moved to last */}
            <div className="card anim5">
              <div className="card-head">
                <div className="card-head-left">
                  <div className={`card-icon ${lastError && !lastText ? "red" : "blue"}`}>
                    {lastError && !lastText ? <XIcon /> : <TypeIcon />}
                  </div>
                  <span className="card-title">Last Transcription</span>
                </div>
                {(lastText || lastError) && (
                  <button className="btn btn-ghost btn-sm" onClick={() => { setLastText(null); setLastError(null); }}>
                    Clear
                  </button>
                )}
              </div>
              <div className="card-body">
                {lastText ? (
                  <div className="transcript-content">"{lastText}"</div>
                ) : lastError ? (
                  <div className="transcript-error">
                    <div className="t-err-badge">Error</div>
                    <span className="t-err-message">{lastError}</span>
                  </div>
                ) : (
                  <div className="transcript-empty">
                    <div className="t-empty-icon"><TypeIcon /></div>
                    <span className="t-empty-label">No transcriptions yet — use your hotkey to start</span>
                  </div>
                )}
                {statusMessage && !lastText && !lastError && (
                  <p className={`transcript-status ${isError ? "err" : ""}`}>{statusMessage}</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* ══ SETTINGS ══ */}
        {page === "settings" && (
          <>
            {/* API Key */}
            <div className="card anim">
              <div className="card-head">
                <div className="card-head-left">
                  <div className="card-icon brand"><KeyIcon /></div>
                  <span className="card-title">API Key</span>
                </div>
                <div>
                  {maskedKey && !apiKeySaved && <span className="badge badge-mono">{maskedKey}</span>}
                  {apiKeySaved && <span className="badge badge-green"><CheckIcon />Saved</span>}
                </div>
              </div>
              <div className="card-body">
                <p className="card-blurb">
                  Your Groq API key is stored locally on this device and only used to call the Groq Whisper API.
                </p>
                <div className="input-row">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="gsk_..."
                    className="input"
                    onKeyDown={e => e.key === "Enter" && handleSaveApiKey()}
                  />
                  <button className="btn btn-primary" onClick={handleSaveApiKey} disabled={!apiKey.trim()}>
                    Save
                  </button>
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div className="card anim2">
              <div className="card-head">
                <div className="card-head-left">
                  <div className="card-icon muted"><SettingsIcon /></div>
                  <span className="card-title">Preferences</span>
                </div>
              </div>
              <div className="card-body">
                {/* Language */}
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Language</div>
                    <div className="setting-desc">Speech recognition language</div>
                  </div>
                  <div className="setting-control">
                    <select
                      value={language}
                      onChange={e => { setLanguage(e.target.value); savePrefs({ language: e.target.value }); }}
                      className="input"
                      style={{ width: 144, flex: "none" }}
                    >
                      {[["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"],
                      ["it", "Italian"], ["pt", "Portuguese"], ["nl", "Dutch"], ["ja", "Japanese"],
                      ["ko", "Korean"], ["zh", "Chinese"], ["ar", "Arabic"], ["hi", "Hindi"],
                      ["ur", "Urdu"], ["ru", "Russian"]].map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Auto-type */}
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Auto-type</div>
                    <div className="setting-desc">Automatically type text into the focused field</div>
                  </div>
                  <div className="setting-control">
                    <Toggle checked={autoType} onChange={v => { setAutoType(v); savePrefs({ autoType: v }); }} />
                  </div>
                </div>

                {/* Run on startup */}
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Launch on startup</div>
                    <div className="setting-desc">Start automatically when you log in</div>
                  </div>
                  <div className="setting-control">
                    <Toggle
                      checked={runOnStartup}
                      onChange={async v => {
                        setRunOnStartup(v);
                        try { v ? await enable() : await disable(); savePrefs({ runOnStartup: v }); }
                        catch { setRunOnStartup(!v); }
                      }}
                    />
                  </div>
                </div>

                {/* Run in background */}
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Run in background</div>
                    <div className="setting-desc">Minimize to system tray when window is closed</div>
                  </div>
                  <div className="setting-control">
                    <Toggle
                      checked={runInBackground}
                      onChange={v => {
                        setRunInBackground(v);
                        savePrefs({ runInBackground: v });
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Hotkey */}
            <div className="card anim3">
              <div className="card-head">
                <div className="card-head-left">
                  <div className="card-icon muted"><KeyIcon /></div>
                  <span className="card-title">Hotkey</span>
                </div>
              </div>
              <div className="card-body">
                <div className="setting-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
                  <div className="setting-info">
                    <div className="setting-label">Global shortcut</div>
                    <div className="setting-desc">Hotkey customization coming in a future update</div>
                  </div>
                  <div className="hotkey-row">
                    {hotkeyParts.map((part, i) => (
                      <span key={i} style={{ display: "contents" }}>
                        <span className="kbd">{part}</span>
                        {i < hotkeyParts.length - 1 && <span className="kbd-plus">+</span>}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Microphone */}
            <div className="card anim4">
              <div className="card-head">
                <div className="card-head-left">
                  <div className="card-icon red"><MicIcon /></div>
                  <span className="card-title">Microphone</span>
                </div>
              </div>
              <div className="card-body">
                <p className="card-blurb">
                  Verify your microphone is detected and working correctly.
                </p>
                <button className="btn btn-full" onClick={handleTestMic} disabled={micTesting}>
                  <MicIcon />
                  {micTesting ? "Testing…" : "Test microphone"}
                </button>
                {micStatus && (
                  <div className={`mic-feedback ${micStatus.startsWith("Error") ? "err" : "ok"}`}>
                    {micStatus}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ══ ABOUT ══ */}
        {page === "about" && (
          <div className="card anim">
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-icon brand"><InfoIcon /></div>
                <span className="card-title">About TypeVoice</span>
              </div>
            </div>
            <div className="card-body">
              <div className="about-hero">
                <div className="about-hero-mark">
                  <div style={{ width: 22, height: 22 }}><MicIcon /></div>
                </div>
                <div>
                  <div className="about-hero-title">TypeVoice</div>
                  <div className="about-hero-sub">Voice-to-text for your desktop</div>
                </div>
              </div>

              <div className="about-meta-list">
                {[
                  ["Version", "1.0.0"],
                  ["Speech engine", "Groq Whisper"],
                  ["License", "MIT"],
                ].map(([k, v]) => (
                  <div key={k} className="about-meta-row">
                    <span className="about-meta-key">{k}</span>
                    <span className="about-meta-val">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

export default App;