//! Cross-platform text injection module.
//!
//! Types text into the currently focused application system-wide.
//! - **Linux**: Uses `xdotool type` (X11 keyboard simulation)
//! - **Windows**: Uses WinAPI `SendInput` with `KEYEVENTF_UNICODE`

/// Type the given text into the currently focused application.
///
/// This works system-wide — browsers, VS Code, terminals, any text input field.
/// A small delay is added between keystrokes for reliability.
pub fn type_text(text: &str) -> Result<(), String> {
    if text.is_empty() {
        return Ok(());
    }

    println!("[typer] Injecting {} chars into focused app", text.len());
    platform::inject_text(text)
}

// ─────────────────────────────────────────────
// Linux implementation (xdotool)
// ─────────────────────────────────────────────
#[cfg(target_os = "linux")]
mod platform {
    use std::process::Command;
    use std::thread;
    use std::time::Duration;

    pub fn inject_text(text: &str) -> Result<(), String> {
        // Brief pause to let modifier keys (Ctrl+Shift from the hotkey) fully release
        // before we start typing, otherwise characters arrive with modifiers held.
        thread::sleep(Duration::from_millis(50));

        // xdotool type:
        //   --clearmodifiers  → temporarily release any held modifiers (Ctrl, Shift, etc.)
        //   --delay 12        → 12ms between keystrokes for reliability across apps
        //   --                → end of flags, so text starting with '-' won't break
        let output = Command::new("xdotool")
            .arg("type")
            .arg("--clearmodifiers")
            .arg("--delay")
            .arg("12")
            .arg("--")
            .arg(text)
            .output()
            .map_err(|e| {
                format!(
                    "Failed to run xdotool: {}. Install it with: sudo apt install xdotool",
                    e
                )
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("xdotool failed: {}", stderr));
        }

        println!("[typer] Text injected successfully via xdotool");
        Ok(())
    }
}

// ─────────────────────────────────────────────
// Windows implementation (WinAPI SendInput)
// ─────────────────────────────────────────────
#[cfg(target_os = "windows")]
mod platform {
    use std::mem;
    use std::thread;
    use std::time::Duration;
    use winapi::um::winuser::{
        SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
    };

    pub fn inject_text(text: &str) -> Result<(), String> {
        // Brief pause to let modifier keys fully release
        thread::sleep(Duration::from_millis(50));

        let mut inputs: Vec<INPUT> = Vec::new();

        for ch in text.chars() {
            if ch == '\n' || ch == '\r' {
                // Enter key: VK_RETURN (0x0D)
                push_vk_key(&mut inputs, 0x0D);
            } else if ch == '\t' {
                // Tab key: VK_TAB (0x09)
                push_vk_key(&mut inputs, 0x09);
            } else {
                // All other characters: use Unicode input (works for any language/symbol)
                let mut buf = [0u16; 2];
                for &code_unit in ch.encode_utf16(&mut buf) {
                    push_unicode_key(&mut inputs, code_unit);
                }
            }
        }

        if inputs.is_empty() {
            return Ok(());
        }

        let sent = unsafe {
            SendInput(
                inputs.len() as u32,
                inputs.as_mut_ptr(),
                mem::size_of::<INPUT>() as i32,
            )
        };

        if sent == 0 {
            return Err("SendInput failed: no events were sent".to_string());
        }

        if (sent as usize) != inputs.len() {
            eprintln!(
                "[typer] Warning: SendInput sent {} of {} events",
                sent,
                inputs.len()
            );
        }

        println!("[typer] Text injected successfully via SendInput");
        Ok(())
    }

    /// Push a virtual key press + release (for Enter, Tab, etc.)
    fn push_vk_key(inputs: &mut Vec<INPUT>, vk: u16) {
        // Key down
        let mut down: INPUT = unsafe { mem::zeroed() };
        down.type_ = INPUT_KEYBOARD;
        unsafe {
            let ki = down.u.ki_mut();
            ki.wVk = vk;
            ki.dwFlags = 0;
        }
        inputs.push(down);

        // Key up
        let mut up: INPUT = unsafe { mem::zeroed() };
        up.type_ = INPUT_KEYBOARD;
        unsafe {
            let ki = up.u.ki_mut();
            ki.wVk = vk;
            ki.dwFlags = KEYEVENTF_KEYUP;
        }
        inputs.push(up);
    }

    /// Push a Unicode character press + release (for any printable character)
    fn push_unicode_key(inputs: &mut Vec<INPUT>, scan_code: u16) {
        // Key down
        let mut down: INPUT = unsafe { mem::zeroed() };
        down.type_ = INPUT_KEYBOARD;
        unsafe {
            let ki = down.u.ki_mut();
            ki.wVk = 0; // No virtual key — pure Unicode
            ki.wScan = scan_code;
            ki.dwFlags = KEYEVENTF_UNICODE;
        }
        inputs.push(down);

        // Key up
        let mut up: INPUT = unsafe { mem::zeroed() };
        up.type_ = INPUT_KEYBOARD;
        unsafe {
            let ki = up.u.ki_mut();
            ki.wVk = 0;
            ki.wScan = scan_code;
            ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
        }
        inputs.push(up);
    }
}

// ─────────────────────────────────────────────
// macOS fallback (compile error for now)
// ─────────────────────────────────────────────
#[cfg(target_os = "macos")]
mod platform {
    pub fn inject_text(_text: &str) -> Result<(), String> {
        Err("macOS text injection not yet implemented".to_string())
    }
}
