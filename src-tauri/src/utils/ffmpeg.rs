use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const LINUX_RELATIVE_PATH: &str = "ffmpeg/linux/ffmpeg";
const MACOS_RELATIVE_PATH: &str = "ffmpeg/macos/ffmpeg";
const WINDOWS_RELATIVE_PATH: &str = "ffmpeg/windows/ffmpeg.exe";
const APP_FFMPEG_RELATIVE_PATH: &str = "tools/ffmpeg";

pub fn ensure_ffmpeg_installed(app: &AppHandle) -> Result<PathBuf, String> {
    let install_path = app_install_path(app)?;
    if install_path.is_file() {
        ensure_executable_permissions(&install_path);
        return Ok(install_path);
    }

    let source_path = bundled_ffmpeg_path(app)
        .or_else(find_ffmpeg_on_path)
        .ok_or_else(|| {
            "Unable to provision ffmpeg automatically. Reinstall Knowte or install ffmpeg on your system PATH.".to_string()
        })?;

    if let Some(parent) = install_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|_| "Unable to create app ffmpeg directory.".to_string())?;
    }

    let temp_path = install_path.with_extension("tmp");
    std::fs::copy(&source_path, &temp_path)
        .map_err(|_| "Unable to copy ffmpeg into app data.".to_string())?;
    std::fs::rename(&temp_path, &install_path)
        .map_err(|_| "Unable to finalize ffmpeg installation.".to_string())?;

    ensure_executable_permissions(&install_path);
    Ok(install_path)
}

pub fn resolve_ffmpeg_path(app: Option<&AppHandle>) -> PathBuf {
    if let Some(app_handle) = app {
        if let Ok(path) = app_install_path(app_handle) {
            if path.is_file() {
                ensure_executable_permissions(&path);
                return path;
            }
        }

        if let Some(path) = bundled_ffmpeg_path(app_handle) {
            ensure_executable_permissions(&path);
            return path;
        }
    }

    PathBuf::from(platform_binary_name())
}

fn app_install_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Unable to resolve app data directory.".to_string())?;
    Ok(app_data_dir
        .join(APP_FFMPEG_RELATIVE_PATH)
        .join(platform_binary_name()))
}

fn find_ffmpeg_on_path() -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for directory in std::env::split_paths(&path_var) {
        let candidate = directory.join(platform_binary_name());
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn bundled_ffmpeg_path(app: &AppHandle) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;

    let candidates = [
        resource_dir.join(platform_relative_path()),
        resource_dir
            .join("resources")
            .join(platform_relative_path()),
        resource_dir.join(platform_binary_name()),
    ];

    for candidate in candidates {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

fn platform_relative_path() -> &'static str {
    if cfg!(target_os = "windows") {
        WINDOWS_RELATIVE_PATH
    } else if cfg!(target_os = "macos") {
        MACOS_RELATIVE_PATH
    } else {
        LINUX_RELATIVE_PATH
    }
}

fn platform_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    }
}

#[cfg(unix)]
fn ensure_executable_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;

    if let Ok(metadata) = std::fs::metadata(path) {
        let mut permissions = metadata.permissions();
        let mode = permissions.mode();
        if mode & 0o111 == 0 {
            permissions.set_mode(mode | 0o755);
            let _ = std::fs::set_permissions(path, permissions);
        }
    }
}

#[cfg(not(unix))]
fn ensure_executable_permissions(_path: &Path) {}
