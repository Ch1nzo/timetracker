// TimeTracker — Tauri backend.
//
// Responsibilities:
//   * Own the SQLite schema (migrations run on first DB load).
//   * Provide a system-tray presence so closing the window keeps the app
//     (and its in-webview timer) running in the background.
//   * Register a global start/stop shortcut that works from any app.
//   * Expose a few commands the frontend calls when settings change.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// SQLite schema. `app_state` holds JSON blobs for the live working set,
/// settings, routines and categories; `time_entries` is the real measured-
/// session log that powers the calendar and stats screens.
const SCHEMA_V1: &str = r#"
CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS time_entries (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  name       TEXT NOT NULL,
  cat        TEXT NOT NULL,
  color      TEXT NOT NULL,
  sec        INTEGER NOT NULL,
  source     TEXT NOT NULL DEFAULT 'timer',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);
"#;

/// Bring the main window back to the foreground.
fn focus_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    focus_main(&app);
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Re-register the global start/stop shortcut from the current settings.
/// Called by the frontend whenever the user changes the combo or toggles it.
#[cfg(desktop)]
#[tauri::command]
fn update_global_shortcut(
    app: tauri::AppHandle,
    accelerator: String,
    enabled: bool,
) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    if enabled && !accelerator.is_empty() {
        gs.register(accelerator.as_str()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
fn update_global_shortcut(_accelerator: String, _enabled: bool) -> Result<(), String> {
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![tauri_plugin_sql::Migration {
        version: 1,
        description: "create app_state and time_entries",
        sql: SCHEMA_V1,
        kind: tauri_plugin_sql::MigrationKind::Up,
    }];

    let mut builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:timetracker.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_notification::init());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, _shortcut, event| {
                        // Fire once per press (ignore the key-up event).
                        if event.state == ShortcutState::Pressed {
                            let _ = app.emit("toggle-timer", ());
                        }
                    })
                    .build(),
            )
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec![]),
            ));
    }

    builder
        .invoke_handler(tauri::generate_handler![
            show_main_window,
            quit_app,
            update_global_shortcut
        ])
        .setup(|app| {
            // --- System tray ---------------------------------------------
            let show_i = MenuItem::with_id(app, "show", "TimeTracker を表示", true, None::<&str>)?;
            let toggle_i =
                MenuItem::with_id(app, "toggle", "計測 開始 / 停止", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &toggle_i, &quit_i])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("TimeTracker")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => focus_main(app),
                    "toggle" => {
                        let _ = app.emit("toggle-timer", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        focus_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // --- Default global shortcut ---------------------------------
            // The frontend reconciles this with the saved setting on startup.
            #[cfg(desktop)]
            {
                let _ = app.global_shortcut().register("Ctrl+Alt+S");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window hides it to the tray; the webview (and the
            // running timer) stays alive so measurement continues in the
            // background. A real quit goes through the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
