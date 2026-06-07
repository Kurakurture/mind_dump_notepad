use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, RunEvent, State, WebviewWindow, Window,
    WindowEvent,
};

struct FullscreenState(AtomicBool);

#[derive(Clone, Default, Deserialize, Serialize)]
struct NoteMetadata {
    created: Option<f64>,
    pinned: Option<bool>,
    pinned_at: Option<f64>,
    secret: Option<bool>,
    secret_title_index: Option<usize>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
struct SavedWindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppStateData {
    window: Option<SavedWindowState>,
    open_note: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteListItem {
    name: String,
    modified: f64,
    created: f64,
    pinned: bool,
    pinned_at: f64,
    secret: bool,
    secret_title_index: Option<usize>,
}

fn hash_text(value: &str) -> u32 {
    let mut hash = 2_166_136_261_u32;

    for byte in value.bytes() {
        hash ^= u32::from(byte);
        hash = hash.wrapping_mul(16_777_619);
    }

    hash
}

fn rotate_left_32(value: u32, shift: u32) -> u32 {
    value.rotate_left(shift)
}

fn mix_secret_seed(value: u32) -> u32 {
    let mut seed = value;
    seed ^= seed >> 16;
    seed = seed.wrapping_mul(0x7feb_352d);
    seed ^= seed >> 15;
    seed = seed.wrapping_mul(0x846c_a68b);
    seed ^= seed >> 16;
    seed
}

fn make_secret_title_index(file_name: &str, created: f64) -> usize {
    let created = created.floor() as u32;
    let day = (created / 86_400_000).wrapping_mul(2_654_435_761);
    let name_hash = hash_text(file_name);
    let seed = mix_secret_seed(created)
        ^ rotate_left_32(mix_secret_seed(day), 17)
        ^ rotate_left_32(name_hash, 23);

    (mix_secret_seed(seed) % 300) as usize
}

fn time_to_ms(time: SystemTime) -> f64 {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

fn now_ms() -> f64 {
    time_to_ms(SystemTime::now())
}

fn safe_file_name(name: &str) -> String {
    name.chars()
        .filter(|character| {
            !matches!(
                character,
                '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            )
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|error| error.to_string())?
        .join("MindDump");

    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn metadata_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(notes_dir(app)?.join("metadata.json"))
}

fn app_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(notes_dir(app)?.join("app-state.json"))
}

fn read_metadata(app: &AppHandle) -> Result<HashMap<String, NoteMetadata>, String> {
    let path = metadata_path(app)?;

    if !path.exists() {
        return Ok(HashMap::new());
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    Ok(serde_json::from_str(&content).unwrap_or_default())
}

fn write_metadata(app: &AppHandle, metadata: &HashMap<String, NoteMetadata>) -> Result<(), String> {
    let path = metadata_path(app)?;
    let content = serde_json::to_string_pretty(metadata).map_err(|error| error.to_string())?;

    fs::write(path, content).map_err(|error| error.to_string())
}

fn read_app_state(app: &AppHandle) -> Result<AppStateData, String> {
    let path = app_state_path(app)?;

    if !path.exists() {
        return Ok(AppStateData::default());
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    Ok(serde_json::from_str(&content).unwrap_or_default())
}

fn write_app_state(app: &AppHandle, state: &AppStateData) -> Result<(), String> {
    let path = app_state_path(app)?;
    let content = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;

    fs::write(path, content).map_err(|error| error.to_string())
}

fn update_app_state(app: &AppHandle, update: impl FnOnce(&mut AppStateData)) -> Result<(), String> {
    let mut state = read_app_state(app)?;
    update(&mut state);
    write_app_state(app, &state)
}

fn save_window_state(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    if window.is_fullscreen().map_err(|error| error.to_string())? {
        return Ok(());
    }

    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;

    update_app_state(app, |state| {
        state.window = Some(SavedWindowState {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        });
    })
}

fn restore_window_state(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let Some(state) = read_app_state(app)?.window else {
        return Ok(());
    };

    if state.width < 400 || state.height < 300 {
        return Ok(());
    }

    window
        .set_size(PhysicalSize::new(state.width, state.height))
        .map_err(|error| error.to_string())?;
    window
        .set_position(PhysicalPosition::new(state.x, state.y))
        .map_err(|error| error.to_string())
}

fn make_note_name() -> String {
    let stamp = now_ms().round() as u128;
    let random = stamp % 1_000_000;

    format!("note-{stamp}-{random}.html")
}

fn make_unique_note_name(app: &AppHandle) -> Result<String, String> {
    let dir = notes_dir(app)?;
    let mut file_name = make_note_name();

    while dir.join(&file_name).exists() {
        file_name = make_note_name();
    }

    Ok(file_name)
}

fn file_time_ms(time: std::io::Result<SystemTime>) -> f64 {
    time.map(time_to_ms).unwrap_or_else(|_| now_ms())
}

#[tauri::command]
fn list_notes(app: AppHandle) -> Result<Vec<NoteListItem>, String> {
    let dir = notes_dir(&app)?;
    let mut metadata = read_metadata(&app)?;
    let mut notes = Vec::new();

    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_name = entry.file_name().to_string_lossy().to_string();

        if !file_name.ends_with(".html") || file_name.ends_with(".backup-before-conversion.html") {
            continue;
        }

        let stat = entry.metadata().map_err(|error| error.to_string())?;
        let existing = metadata.get(&file_name).cloned().unwrap_or_default();
        let created = existing
            .created
            .unwrap_or_else(|| file_time_ms(stat.created().or_else(|_| stat.modified())));
        let pinned = existing.pinned.unwrap_or(false);
        let secret = existing.secret.unwrap_or(false);
        let secret_title_index = existing
            .secret_title_index
            .or_else(|| secret.then(|| make_secret_title_index(&file_name, created)));
        let pinned_at = if pinned {
            existing.pinned_at.unwrap_or(created)
        } else {
            0.0
        };

        metadata.insert(
            file_name.clone(),
            NoteMetadata {
                created: Some(created),
                pinned: Some(pinned),
                pinned_at: if pinned { Some(pinned_at) } else { None },
                secret: Some(secret),
                secret_title_index,
            },
        );

        notes.push(NoteListItem {
            name: file_name,
            modified: file_time_ms(stat.modified()),
            created,
            pinned,
            pinned_at,
            secret,
            secret_title_index,
        });
    }

    write_metadata(&app, &metadata)?;

    notes.sort_by(|a, b| {
        b.pinned.cmp(&a.pinned).then_with(|| {
            let left = if b.pinned { b.pinned_at } else { b.created };
            let right = if a.pinned { a.pinned_at } else { a.created };

            left.partial_cmp(&right)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
    });

    Ok(notes)
}

#[tauri::command]
fn create_note(app: AppHandle) -> Result<String, String> {
    let file_name = make_unique_note_name(&app)?;
    let dir = notes_dir(&app)?;
    let mut metadata = read_metadata(&app)?;

    fs::write(dir.join(&file_name), "").map_err(|error| error.to_string())?;
    metadata.insert(
        file_name.clone(),
        NoteMetadata {
            created: Some(now_ms()),
            pinned: Some(false),
            pinned_at: None,
            secret: Some(false),
            secret_title_index: None,
        },
    );
    write_metadata(&app, &metadata)?;

    Ok(file_name)
}

#[tauri::command]
fn load_note(app: AppHandle, file_name: String) -> Result<String, String> {
    let safe_name = safe_file_name(&file_name);

    if safe_name.is_empty() {
        return Ok(String::new());
    }

    let path = notes_dir(&app)?.join(safe_name);

    if !path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_note(
    app: AppHandle,
    file_name: Option<String>,
    html: Option<String>,
) -> Result<String, String> {
    let mut safe_name = file_name.as_deref().map(safe_file_name).unwrap_or_default();

    if safe_name.is_empty() {
        safe_name = make_unique_note_name(&app)?;
    }

    let dir = notes_dir(&app)?;
    let path = dir.join(&safe_name);
    let is_new = !path.exists();
    let mut metadata = read_metadata(&app)?;

    fs::write(&path, html.unwrap_or_default()).map_err(|error| error.to_string())?;

    if is_new || !metadata.contains_key(&safe_name) {
        let existing = metadata.get(&safe_name).cloned().unwrap_or_default();

        metadata.insert(
            safe_name.clone(),
            NoteMetadata {
                created: Some(now_ms()),
                pinned: Some(false),
                pinned_at: None,
                secret: Some(existing.secret.unwrap_or(false)),
                secret_title_index: existing.secret_title_index,
            },
        );
        write_metadata(&app, &metadata)?;
    }

    Ok(safe_name)
}

#[tauri::command]
fn backup_note(app: AppHandle, file_name: String, html: Option<String>) -> Result<String, String> {
    let safe_name = safe_file_name(&file_name);

    if safe_name.is_empty() {
        return Ok(String::new());
    }

    let backup_name = format!("{safe_name}.backup-before-conversion.html");
    let backup_path = notes_dir(&app)?.join(&backup_name);

    if !backup_path.exists() {
        fs::write(backup_path, html.unwrap_or_default()).map_err(|error| error.to_string())?;
    }

    Ok(backup_name)
}

#[tauri::command]
fn delete_note(app: AppHandle, file_name: String) -> Result<(), String> {
    let safe_name = safe_file_name(&file_name);

    if safe_name.is_empty() {
        return Ok(());
    }

    let path = notes_dir(&app)?.join(&safe_name);

    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }

    let mut metadata = read_metadata(&app)?;
    metadata.remove(&safe_name);
    write_metadata(&app, &metadata)
}

#[tauri::command]
fn pin_note(app: AppHandle, file_name: String, pinned: bool) -> Result<(), String> {
    let safe_name = safe_file_name(&file_name);

    if safe_name.is_empty() {
        return Ok(());
    }

    let path = notes_dir(&app)?.join(&safe_name);

    if !path.exists() {
        return Ok(());
    }

    let stat = fs::metadata(path).map_err(|error| error.to_string())?;
    let mut metadata = read_metadata(&app)?;
    let existing = metadata.get(&safe_name).cloned().unwrap_or_default();
    let created = existing
        .created
        .unwrap_or_else(|| file_time_ms(stat.created().or_else(|_| stat.modified())));

    metadata.insert(
        safe_name,
        NoteMetadata {
            created: Some(created),
            pinned: Some(pinned),
            pinned_at: if pinned { Some(now_ms()) } else { None },
            secret: Some(existing.secret.unwrap_or(false)),
            secret_title_index: existing.secret_title_index,
        },
    );

    write_metadata(&app, &metadata)
}

#[tauri::command]
fn secret_note(app: AppHandle, file_name: String, secret: bool) -> Result<(), String> {
    let safe_name = safe_file_name(&file_name);

    if safe_name.is_empty() {
        return Ok(());
    }

    let path = notes_dir(&app)?.join(&safe_name);

    if !path.exists() {
        return Ok(());
    }

    let stat = fs::metadata(path).map_err(|error| error.to_string())?;
    let mut metadata = read_metadata(&app)?;
    let existing = metadata.get(&safe_name).cloned().unwrap_or_default();
    let created = existing
        .created
        .unwrap_or_else(|| file_time_ms(stat.created().or_else(|_| stat.modified())));
    let pinned = existing.pinned.unwrap_or(false);
    let pinned_at = if pinned {
        existing.pinned_at.unwrap_or(created)
    } else {
        0.0
    };
    let secret_title_index = existing
        .secret_title_index
        .or_else(|| secret.then(|| make_secret_title_index(&safe_name, created)));

    metadata.insert(
        safe_name,
        NoteMetadata {
            created: Some(created),
            pinned: Some(pinned),
            pinned_at: if pinned { Some(pinned_at) } else { None },
            secret: Some(secret),
            secret_title_index,
        },
    );

    write_metadata(&app, &metadata)
}

#[tauri::command]
fn notes_path(app: AppHandle) -> Result<String, String> {
    Ok(notes_dir(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn set_open_note(app: AppHandle, file_name: Option<String>) -> Result<(), String> {
    let safe_name = file_name
        .as_deref()
        .map(safe_file_name)
        .filter(|name| !name.is_empty());

    update_app_state(&app, |state| {
        state.open_note = safe_name;
    })
}

#[tauri::command]
fn get_open_note(app: AppHandle) -> Result<Option<String>, String> {
    Ok(read_app_state(&app)?.open_note)
}

#[tauri::command]
fn close_app(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        save_window_state(&app, &window)?;
    }

    app.exit(0);
    Ok(())
}

#[tauri::command]
fn set_window_pinned(window: Window, pinned: bool) -> Result<bool, String> {
    window
        .set_always_on_top(pinned)
        .map_err(|error| error.to_string())?;

    Ok(pinned)
}

#[tauri::command]
fn start_window_drag(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
fn toggle_fullscreen(window: Window, state: State<FullscreenState>) -> Result<bool, String> {
    let should_fullscreen = !state.0.load(Ordering::SeqCst);

    if should_fullscreen {
        window
            .set_always_on_top(false)
            .map_err(|error| error.to_string())?;
    }

    #[cfg(target_os = "macos")]
    window
        .set_simple_fullscreen(should_fullscreen)
        .map_err(|error| error.to_string())?;

    #[cfg(not(target_os = "macos"))]
    window
        .set_fullscreen(should_fullscreen)
        .map_err(|error| error.to_string())?;

    state.0.store(should_fullscreen, Ordering::SeqCst);

    Ok(should_fullscreen)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(FullscreenState(AtomicBool::new(false)))
        .invoke_handler(tauri::generate_handler![
            list_notes,
            create_note,
            load_note,
            save_note,
            backup_note,
            delete_note,
            pin_note,
            secret_note,
            notes_path,
            set_open_note,
            get_open_note,
            close_app,
            set_window_pinned,
            start_window_drag,
            toggle_fullscreen
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            if let Some(window) = app.get_webview_window("main") {
                restore_window_state(app.handle(), &window)?;
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { .. },
                ..
            } if label == "main" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = save_window_state(app, &window);
                }
            }
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::Moved(_) | WindowEvent::Resized(_),
                ..
            } if label == "main" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = save_window_state(app, &window);
                }
            }
            RunEvent::ExitRequested { .. } => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = save_window_state(app, &window);
                }
            }
            _ => {}
        });
}
