use tauri::{AppHandle, Manager};

fn test(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id("main_tray") {
        if let Some(menu) = tray.menu() {
            if let Some(item) = menu.get("toggle_record") {
                let _ = item.as_menuitem().unwrap().set_text("test");
            }
            if let Some(item) = menu.get("toggle_bg") {
                let _ = item.as_check_menuitem().unwrap().set_checked(true);
            }
        }
    }
}
