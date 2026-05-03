use tauri::{AppHandle, Manager};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton};
use tauri::menu::{Menu, MenuItem};
fn test(app: &AppHandle) {
    let _ = TrayIconBuilder::new().on_tray_icon_event(|_, e| {
        if let TrayIconEvent::Click { button, .. } = e {
            if button == MouseButton::Left {}
        }
    });
}
