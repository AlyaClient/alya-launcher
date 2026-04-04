use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tokio::process::Child;

type SharedChild = Arc<Mutex<Option<Child>>>;

#[derive(serde::Serialize, serde::Deserialize, Default, Clone)]
struct LauncherStats {
    times_launched: u64,
    total_playtime_seconds: u64,
}

#[tauri::command]
async fn read_stats(app: tauri::AppHandle) -> Result<LauncherStats, String> {
    use tauri::Manager;
    let stats_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("stats.json");
    if !stats_path.exists() {
        return Ok(LauncherStats::default());
    }
    let contents = std::fs::read_to_string(&stats_path).map_err(|error| error.to_string())?;
    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

#[tauri::command]
async fn write_stats(app: tauri::AppHandle, stats: LauncherStats) -> Result<(), String> {
    use tauri::Manager;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    let contents = serde_json::to_string(&stats).map_err(|error| error.to_string())?;
    std::fs::write(data_dir.join("stats.json"), contents).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let child: SharedChild = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(child)
        .invoke_handler(tauri::generate_handler![launch, kill_game, read_stats, write_stats])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn kill_game(shared: tauri::State<'_, SharedChild>) -> Result<(), String> {
    let child = shared.lock().unwrap().take();
    if let Some(mut c) = child {
        c.kill().await.map_err(|e| format!("Kill error: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
async fn launch(
    window: tauri::Window,
    shared: tauri::State<'_, SharedChild>,
    program: String,
    args: Vec<String>,
    cwd: String,
) -> Result<i32, String> {
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    let abs_cwd = if !cwd.is_empty() && std::path::Path::new(&cwd).is_absolute() {
        std::path::PathBuf::from(&cwd)
    } else if !cwd.is_empty() {
        std::fs::canonicalize(&cwd).unwrap_or_else(|_| std::path::PathBuf::from(&cwd))
    } else {
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| std::path::PathBuf::from("."))
    };

    if !abs_cwd.exists() {
        if let Err(error) = std::fs::create_dir_all(&abs_cwd) {
            return Err(format!("Failed to create working directory: {}", error));
        }
    }

    let _ = window.emit("launch-stdout", format!("[alya] resolved cwd: {}", abs_cwd.display()));

    let mut child = Command::new(&program)
        .args(&args)
        .current_dir(&abs_cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn: {e}"))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let win1 = window.clone();
    let win2 = window.clone();

    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = win1.emit("launch-stdout", line);
        }
    });

    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = win2.emit("launch-stderr", line);
        }
    });

    *shared.lock().unwrap() = Some(child);

    loop {
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        let mut guard = shared.lock().unwrap();
        match guard.as_mut() {
            None => return Ok(-1),
            Some(child) => {
                match child.try_wait().map_err(|error| format!("Wait error: {error}"))? {
                    Some(status) => {
                        *guard = None;
                        return Ok(status.code().unwrap_or(-1));
                    }
                    None => continue,
                }
            }
        }
    }
}
