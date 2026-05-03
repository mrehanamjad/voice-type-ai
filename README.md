# TypeVoice

**TypeVoice** is a blazing-fast, system-wide voice-to-text desktop application built with Tauri, Rust, and React. Powered by the Groq Whisper API, it allows you to hold a global hotkey, speak naturally, and instantly inject the transcribed text into any application you are currently focused on.

---

## ⚡ Features

- **Global Hotkey Integration**: Press and hold `Ctrl+Shift+Space` from anywhere on your system to start recording. Release to automatically transcribe and type.
- **Lightning Fast Transcription**: Utilizes the Groq Whisper API for near-instant, highly accurate speech-to-text conversion.
- **Auto-Typing (Text Injection)**: Automatically simulates keystrokes to inject the transcribed text directly into your currently active window, editor, or browser.
- **Floating Status Overlay**: A sleek, non-intrusive, always-on-top overlay shows your current pipeline status (Recording → Transcribing → Typing) so you always know what the app is doing without opening the main window.
- **Background Mode & System Tray**: Seamlessly runs in the background. Closing the main window minimizes TypeVoice to the system tray, keeping your hotkeys active.
- **Launch on Startup**: Configure the app to start automatically when you log into your computer.
- **Multi-Language Support**: Choose from over a dozen supported transcription languages in the settings.
- **OS-Level Notifications**: If something goes wrong (e.g., microphone disconnected or invalid API key), you'll receive a native system notification.
- **Premium UI/UX**: Beautifully designed dashboard with dynamic color schemes, dark/light mode toggles, and smooth micro-animations.

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Vite, Vanilla CSS
- **Backend**: Rust, Tauri v2
- **Audio Processing**: `cpal` (Cross-Platform Audio Library), `hound` (WAV encoding)
- **Transcription**: Groq Cloud API (Whisper model)
- **OS Integration**: `rdev` (Global Hotkeys), `xdotool` / WinAPI / `enigo` (Text Injection), Tauri Plugins (Autostart, Tray, Notification)

## 🚀 Getting Started

### Prerequisites
1. **Node.js** (v18+)
2. **Rust** and **Cargo**
3. **System Dependencies** (Linux only):
   ```bash
   sudo apt update
   sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
   sudo apt install xdotool notify-osd libasound2-dev
   ```

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd typevoice
   ```

2. Install JavaScript dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npx tauri dev
   ```

### Setup
When you first launch the app, go to the **Settings** tab:
1. Enter your **Groq API Key** (Get one for free at [console.groq.com](https://console.groq.com/)).
2. Adjust your preferred language and background settings.
3. Test your microphone using the built-in mic tester.

## 🎙️ How to Use

1. Focus on any text input field in any application (e.g., your browser, code editor, or messaging app).
2. Press and **hold** `Ctrl + Shift + Space`.
3. Speak into your microphone.
4. **Release** the keys.
5. Watch as the floating overlay indicates the transcription progress and magically types your words!

## 📦 Building for Production

To build the standalone executable installer for your operating system:

```bash
npx tauri build
```

The compiled binaries will be located in `src-tauri/target/release/bundle/`.

## 📄 License
This project is licensed under the MIT License.
