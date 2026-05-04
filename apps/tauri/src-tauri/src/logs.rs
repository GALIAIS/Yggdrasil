use crate::{LogDocumentPayload, SaveChatResult, WorkspaceCatalogEntry};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::fs;
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use zip::write::SimpleFileOptions;

const LOGS_DIR_NAME: &str = "logs";
const LOG_ARCHIVES_DIR_NAME: &str = "archives";
const LOG_EXPORTS_DIR_NAME: &str = "log-exports";
const DEFAULT_LOG_LEVEL: &str = "info";
const DEFAULT_LOG_MAX_FILE_SIZE_MB: u64 = 8;
const DEFAULT_LOG_MAX_ARCHIVES: usize = 6;
const LEGACY_CONTENT_LOG_NAME: &str = "content.log";
const LEGACY_TAURI_LOG_NAME: &str = "tauri-dev.log";
const VALID_CATEGORIES: &[&str] = &["runtime", "ui", "network", "trace", "storage"];
const REDACTED_MARKER: &str = "[redacted]";

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

impl LogLevel {
    fn as_str(self) -> &'static str {
        match self {
            Self::Error => "ERROR",
            Self::Warn => "WARN",
            Self::Info => "INFO",
            Self::Debug => "DEBUG",
            Self::Trace => "TRACE",
        }
    }

    fn from_str(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "error" => Self::Error,
            "warn" | "warning" => Self::Warn,
            "debug" => Self::Debug,
            "trace" => Self::Trace,
            _ => Self::Info,
        }
    }
}

#[derive(Clone)]
struct LogConfig {
    level: LogLevel,
    categories: Vec<String>,
    capture_payloads: bool,
    capture_network_bodies: bool,
    max_file_size_mb: u64,
    max_archives: usize,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            level: LogLevel::from_str(DEFAULT_LOG_LEVEL),
            categories: VALID_CATEGORIES.iter().map(|value| (*value).to_string()).collect(),
            capture_payloads: true,
            capture_network_bodies: false,
            max_file_size_mb: DEFAULT_LOG_MAX_FILE_SIZE_MB,
            max_archives: DEFAULT_LOG_MAX_ARCHIVES,
        }
    }
}

impl LogConfig {
    fn should_log(&self, level: LogLevel, category: &str) -> bool {
        level <= self.level
            && self
                .categories
                .iter()
                .any(|value| value.eq_ignore_ascii_case(category))
    }

    fn max_file_size_bytes(&self) -> u64 {
        self.max_file_size_mb.max(1) * 1024 * 1024
    }
}

#[derive(Serialize)]
struct LogBundleManifest {
    created_at: u64,
    export_kind: String,
    files: Vec<String>,
    settings: Value,
}

pub(crate) fn append_bootstrap_log(message: &str) {
    let event = message
        .split(':')
        .next()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("bootstrap");
    let _ = append_runtime_log("info", "runtime", event, message, None);
}

pub(crate) fn append_runtime_log(
    level: &str,
    category: &str,
    event: &str,
    message: &str,
    payload: Option<Value>,
) -> Result<(), String> {
    let normalized_category = normalize_category(category);
    let config = load_config().unwrap_or_default();
    let level = LogLevel::from_str(level);
    if !config.should_log(level, &normalized_category) {
        return Ok(());
    }

    fs::create_dir_all(logs_root()).map_err(to_string_error)?;
    let log_path = active_log_path(&normalized_category);
    rotate_if_needed(&log_path, &normalized_category, &config)?;

    let payload = sanitize_payload(payload, &config, &normalized_category);
    let line = format_log_line(level, &normalized_category, event, message, payload);
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(to_string_error)?;
    writeln!(file, "{line}").map_err(to_string_error)?;
    Ok(())
}

pub(crate) fn append_trace_summary(
    provider: &str,
    model: Option<&str>,
    duration_ms: Option<u64>,
    token_count: Option<u64>,
    character_name: Option<&str>,
    file_name: Option<&str>,
    request_payload: Option<String>,
    response_payload: Option<Value>,
    response_text: Option<&str>,
    error_text: Option<&str>,
) {
    let message = if let Some(error_text) = error_text {
        format!(
            "{provider} request failed{}",
            model
                .filter(|value| !value.trim().is_empty())
                .map(|value| format!(" ({value})"))
                .unwrap_or_default()
        )
        .to_string()
            + ": "
            + error_text
    } else {
        format!(
            "{provider} request completed{}",
            model
                .filter(|value| !value.trim().is_empty())
                .map(|value| format!(" ({value})"))
                .unwrap_or_default()
        )
    };

    let payload = json!({
        "provider": provider,
        "model": model.unwrap_or_default(),
        "duration_ms": duration_ms,
        "token_count": token_count,
        "character_name": character_name.unwrap_or_default(),
        "file_name": file_name.unwrap_or_default(),
        "request_payload": request_payload.unwrap_or_default(),
        "response_payload": response_payload,
        "response_text": response_text.unwrap_or_default(),
        "error_text": error_text.unwrap_or_default(),
    });

    let _ = append_runtime_log(
        if error_text.is_some() { "error" } else { "info" },
        if error_text.is_some() { "network" } else { "trace" },
        "chat-completion",
        &message,
        Some(payload),
    );
}

pub(crate) fn collect_log_entries() -> Result<(Vec<WorkspaceCatalogEntry>, usize), String> {
    let mut entries = Vec::new();
    let mut warning_lines = 0usize;

    for path in list_log_paths()? {
        let raw = fs::read_to_string(&path).unwrap_or_default();
        let line_count = raw.lines().filter(|line| !line.trim().is_empty()).count();
        let warn_count = raw
            .lines()
            .filter(|line| {
                let lower = line.to_ascii_lowercase();
                lower.contains("warn") || lower.contains("error")
            })
            .count();
        warning_lines += warn_count;

        let filename = file_name_string(&path)?;
        let tags = infer_tags(&path, &filename);
        entries.push(WorkspaceCatalogEntry {
            disabled: None,
            item_count: Some(line_count),
            kind: "log".to_string(),
            name: filename.clone(),
            note: Some(build_log_note(&filename, line_count, warn_count, &tags)),
            source_avatar: None,
            source_file_name: None,
            size_bytes: Some(fs::metadata(&path).map_err(to_string_error)?.len()),
            tags,
            updated_at: modified_timestamp(&path)?,
        });
    }

    entries.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| left.name.cmp(&right.name))
    });

    Ok((entries, warning_lines))
}

pub(crate) fn fetch_log_document(name: &str) -> Result<LogDocumentPayload, String> {
    let path = resolve_log_path(name)?;
    let content = fs::read_to_string(&path).map_err(to_string_error)?;
    let metadata = fs::metadata(&path).map_err(to_string_error)?;
    Ok(LogDocumentPayload {
        content,
        name: file_name_string(&path)?,
        size_bytes: metadata.len(),
        updated_at: modified_timestamp(&path)?,
    })
}

pub(crate) fn export_log_document(name: &str) -> Result<String, String> {
    let source_path = resolve_log_path(name)?;
    let export_root = logs_export_root();
    fs::create_dir_all(&export_root).map_err(to_string_error)?;
    let export_path = export_root.join(format!(
        "{}-{}.zip",
        Path::new(name)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("log"),
        current_timestamp_secs()
    ));
    let mut writer = zip::ZipWriter::new(
        fs::File::create(&export_path).map_err(to_string_error)?,
    );
    add_file_to_zip(&mut writer, &source_path, name)?;
    writer.finish().map_err(to_string_error)?;
    Ok(export_path.to_string_lossy().to_string())
}

pub(crate) fn export_logs_bundle() -> Result<String, String> {
    let export_root = logs_export_root();
    fs::create_dir_all(&export_root).map_err(to_string_error)?;
    let export_path = export_root.join(format!("logs-bundle-{}.zip", current_timestamp_secs()));
    let mut writer = zip::ZipWriter::new(
        fs::File::create(&export_path).map_err(to_string_error)?,
    );

    let mut files = Vec::new();
    for path in list_log_paths()? {
        let name = file_name_string(&path)?;
        add_file_to_zip(&mut writer, &path, &format!("logs/{name}"))?;
        files.push(format!("logs/{name}"));
    }

    let traces = crate::storage::fetch_trace_entries(None, None, 1000)?;
    let traces_payload = serde_json::to_vec_pretty(&traces).map_err(to_string_error)?;
    writer
        .start_file("traces/latest-traces.json", SimpleFileOptions::default())
        .map_err(to_string_error)?;
    writer.write_all(&traces_payload).map_err(to_string_error)?;
    files.push("traces/latest-traces.json".to_string());

    let manifest = LogBundleManifest {
        created_at: current_timestamp_millis(),
        export_kind: "bundle".to_string(),
        files: files.clone(),
        settings: current_settings_snapshot(),
    };
    let manifest_payload = serde_json::to_vec_pretty(&manifest).map_err(to_string_error)?;
    writer
        .start_file("manifest.json", SimpleFileOptions::default())
        .map_err(to_string_error)?;
    writer
        .write_all(&manifest_payload)
        .map_err(to_string_error)?;
    writer.finish().map_err(to_string_error)?;
    Ok(export_path.to_string_lossy().to_string())
}

pub(crate) fn clear_log_document(name: &str) -> Result<SaveChatResult, String> {
    let path = resolve_log_path(name)?;
    if is_archive_path(&path) {
        fs::remove_file(path).map_err(to_string_error)?;
    } else {
        fs::write(path, "").map_err(to_string_error)?;
    }
    Ok(SaveChatResult { ok: true })
}

fn build_log_note(name: &str, line_count: usize, warning_count: usize, tags: &[String]) -> String {
    let scope = if tags.iter().any(|value| value == "archive") {
        "archive"
    } else if tags.iter().any(|value| value == "legacy") {
        "legacy"
    } else {
        "current"
    };
    format!("{scope} | {line_count} lines | {warning_count} warn/error | {name}")
}

fn infer_tags(path: &Path, name: &str) -> Vec<String> {
    let mut tags = vec!["log".to_string()];
    if is_archive_path(path) {
        tags.push("archive".to_string());
    } else {
        tags.push("current".to_string());
    }
    if is_legacy_log_name(name) {
        tags.push("legacy".to_string());
    }
    let category = name
        .split('.')
        .next()
        .map(normalize_category)
        .unwrap_or_else(|| "runtime".to_string());
    tags.push(category);
    tags
}

fn add_file_to_zip(
    writer: &mut zip::ZipWriter<fs::File>,
    source_path: &Path,
    entry_name: &str,
) -> Result<(), String> {
    let mut file = fs::File::open(source_path).map_err(to_string_error)?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).map_err(to_string_error)?;
    writer
        .start_file(entry_name.replace('\\', "/"), SimpleFileOptions::default())
        .map_err(to_string_error)?;
    writer.write_all(&bytes).map_err(to_string_error)?;
    Ok(())
}

fn format_log_line(
    level: LogLevel,
    category: &str,
    event: &str,
    message: &str,
    payload: Option<Value>,
) -> String {
    let payload_suffix = payload
        .and_then(|value| serde_json::to_string(&value).ok())
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!(" | {value}"))
        .unwrap_or_default();
    format!(
        "[{}] [{}] [{}] [{}] {}{}",
        current_timestamp_millis(),
        level.as_str(),
        category,
        event.trim(),
        message.trim(),
        payload_suffix
    )
}

fn sanitize_payload(payload: Option<Value>, config: &LogConfig, category: &str) -> Option<Value> {
    let payload = payload?;
    if !config.capture_payloads {
        return None;
    }
    let mut payload = redact_sensitive_value(payload);
    if category.eq_ignore_ascii_case("network") && !config.capture_network_bodies {
        remove_body_fields(&mut payload);
    }
    Some(payload)
}

fn redact_sensitive_value(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut next = Map::new();
            for (key, value) in map {
                if is_sensitive_key(&key) {
                    next.insert(key, Value::String(REDACTED_MARKER.to_string()));
                } else {
                    next.insert(key, redact_sensitive_value(value));
                }
            }
            Value::Object(next)
        }
        Value::Array(items) => Value::Array(items.into_iter().map(redact_sensitive_value).collect()),
        other => other,
    }
}

fn remove_body_fields(value: &mut Value) {
    match value {
        Value::Object(map) => {
            let keys = map.keys().cloned().collect::<Vec<_>>();
            for key in keys {
                if key.to_ascii_lowercase().contains("body")
                    || key.eq_ignore_ascii_case("request_payload")
                    || key.eq_ignore_ascii_case("response_payload")
                    || key.eq_ignore_ascii_case("response_text")
                {
                    map.insert(key, Value::String("[omitted]".to_string()));
                } else if let Some(child) = map.get_mut(&key) {
                    remove_body_fields(child);
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                remove_body_fields(item);
            }
        }
        _ => {}
    }
}

fn is_sensitive_key(key: &str) -> bool {
    let normalized = key.trim().to_ascii_lowercase();
    matches!(
        normalized.as_str(),
        "api_key"
            | "apikey"
            | "authorization"
            | "auth"
            | "secret"
            | "secret_key"
            | "secretvalue"
            | "password"
            | "token"
            | "access_token"
            | "refresh_token"
    )
}

fn load_config() -> Result<LogConfig, String> {
    let settings = crate::storage::read_stored_settings_value()?;
    let categories = settings
        .get("app_log_categories")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(normalize_category)
                .filter(|value| VALID_CATEGORIES.iter().any(|item| item == value))
                .collect::<Vec<_>>()
        })
        .filter(|items| !items.is_empty())
        .unwrap_or_else(|| VALID_CATEGORIES.iter().map(|value| (*value).to_string()).collect());

    let max_archives = settings
        .get("app_log_max_archives")
        .and_then(value_to_u64)
        .unwrap_or(DEFAULT_LOG_MAX_ARCHIVES as u64)
        .clamp(1, 32) as usize;
    let max_file_size_mb = settings
        .get("app_log_max_file_size_mb")
        .and_then(value_to_u64)
        .unwrap_or(DEFAULT_LOG_MAX_FILE_SIZE_MB)
        .clamp(1, 256);

    Ok(LogConfig {
        level: settings
            .get("app_log_level")
            .and_then(Value::as_str)
            .map(LogLevel::from_str)
            .unwrap_or_else(|| LogLevel::from_str(DEFAULT_LOG_LEVEL)),
        categories,
        capture_payloads: settings
            .get("app_log_capture_payloads")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        capture_network_bodies: settings
            .get("app_log_capture_network_bodies")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        max_file_size_mb,
        max_archives,
    })
}

fn current_settings_snapshot() -> Value {
    let settings = crate::storage::read_stored_settings_value().unwrap_or_else(|_| json!({}));
    json!({
        "app_log_level": settings.get("app_log_level").cloned().unwrap_or(Value::String(DEFAULT_LOG_LEVEL.to_string())),
        "app_log_categories": settings.get("app_log_categories").cloned().unwrap_or(json!(VALID_CATEGORIES)),
        "app_log_capture_payloads": settings.get("app_log_capture_payloads").cloned().unwrap_or(Value::Bool(true)),
        "app_log_capture_network_bodies": settings.get("app_log_capture_network_bodies").cloned().unwrap_or(Value::Bool(false)),
        "app_log_max_file_size_mb": settings.get("app_log_max_file_size_mb").cloned().unwrap_or(json!(DEFAULT_LOG_MAX_FILE_SIZE_MB)),
        "app_log_max_archives": settings.get("app_log_max_archives").cloned().unwrap_or(json!(DEFAULT_LOG_MAX_ARCHIVES)),
    })
}

fn rotate_if_needed(path: &Path, category: &str, config: &LogConfig) -> Result<(), String> {
    let Ok(metadata) = fs::metadata(path) else {
        return Ok(());
    };
    if metadata.len() < config.max_file_size_bytes() {
        return Ok(());
    }

    let archive_dir = log_archives_root();
    fs::create_dir_all(&archive_dir).map_err(to_string_error)?;
    let archive_path = archive_dir.join(format!("{category}-{}.log", current_timestamp_secs()));
    fs::rename(path, &archive_path).map_err(to_string_error)?;
    prune_archives(category, config.max_archives)?;
    Ok(())
}

fn prune_archives(category: &str, max_archives: usize) -> Result<(), String> {
    let archive_dir = log_archives_root();
    if !archive_dir.exists() {
        return Ok(());
    }
    let mut entries = fs::read_dir(&archive_dir)
        .map_err(to_string_error)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .map(|value| value.starts_with(&format!("{category}-")) && value.ends_with(".log"))
                    .unwrap_or(false)
        })
        .collect::<Vec<_>>();

    entries.sort_by(|left, right| {
        modified_timestamp(left)
            .unwrap_or(None)
            .cmp(&modified_timestamp(right).unwrap_or(None))
            .then_with(|| left.cmp(right))
    });

    let remove_count = entries.len().saturating_sub(max_archives);
    for path in entries.into_iter().take(remove_count) {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

fn list_log_paths() -> Result<Vec<PathBuf>, String> {
    let mut paths = Vec::new();

    let current_dir = logs_root();
    if current_dir.exists() {
        paths.extend(read_log_files_from_dir(&current_dir)?);
    }

    let archives_dir = log_archives_root();
    if archives_dir.exists() {
        paths.extend(read_log_files_from_dir(&archives_dir)?);
    }

    for path in legacy_log_paths() {
        if path.exists() {
            paths.push(path);
        }
    }

    paths.sort_by(|left, right| {
        modified_timestamp(right)
            .unwrap_or(None)
            .cmp(&modified_timestamp(left).unwrap_or(None))
            .then_with(|| left.cmp(right))
    });
    Ok(paths)
}

fn read_log_files_from_dir(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut paths = Vec::new();
    for entry in fs::read_dir(dir).map_err(to_string_error)? {
        let path = entry.map_err(to_string_error)?.path();
        if path.is_file()
            && path
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| value.eq_ignore_ascii_case("log"))
                .unwrap_or(false)
        {
            paths.push(path);
        }
    }
    Ok(paths)
}

fn resolve_log_path(name: &str) -> Result<PathBuf, String> {
    let requested = name.trim();
    if requested.is_empty() {
        return Err("缺少日志文件名。".to_string());
    }
    for path in list_log_paths()? {
        if file_name_string(&path)?.eq(requested) {
            return Ok(path);
        }
    }
    Err(format!("未找到日志文件: {requested}"))
}

fn normalize_category(value: &str) -> String {
    let normalized = value.trim().to_ascii_lowercase();
    if VALID_CATEGORIES.iter().any(|item| item == &normalized) {
        normalized
    } else {
        "runtime".to_string()
    }
}

fn active_log_path(category: &str) -> PathBuf {
    logs_root().join(format!("{category}.log"))
}

fn logs_root() -> PathBuf {
    crate::storage::data_root().join(LOGS_DIR_NAME)
}

fn log_archives_root() -> PathBuf {
    logs_root().join(LOG_ARCHIVES_DIR_NAME)
}

fn logs_export_root() -> PathBuf {
    crate::storage::data_root().join("exports").join(LOG_EXPORTS_DIR_NAME)
}

fn legacy_log_paths() -> Vec<PathBuf> {
    vec![
        crate::storage::data_root().join(LEGACY_CONTENT_LOG_NAME),
        std::env::var("ST_TAURI_STATE_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("..")
                    .join(".tauri-dev")
            })
            .join(LEGACY_TAURI_LOG_NAME),
    ]
}

fn is_legacy_log_name(name: &str) -> bool {
    name.eq_ignore_ascii_case(LEGACY_CONTENT_LOG_NAME) || name.eq_ignore_ascii_case(LEGACY_TAURI_LOG_NAME)
}

fn is_archive_path(path: &Path) -> bool {
    path.components()
        .any(|component| component.as_os_str().to_string_lossy().eq_ignore_ascii_case(LOG_ARCHIVES_DIR_NAME))
}

fn file_name_string(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .ok_or_else(|| "Invalid filename".to_string())
}

fn modified_timestamp(path: &Path) -> Result<Option<u64>, String> {
    let metadata = fs::metadata(path).map_err(to_string_error)?;
    let modified = metadata.modified().map_err(to_string_error)?;
    let since_epoch = modified.duration_since(UNIX_EPOCH).map_err(to_string_error)?;
    Ok(Some(since_epoch.as_secs() * 1000))
}

fn current_timestamp_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default()
}

fn current_timestamp_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or_default()
}

fn value_to_u64(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64().or_else(|| number.as_i64().and_then(|value| u64::try_from(value).ok())),
        Value::String(text) => text.trim().parse::<u64>().ok(),
        _ => None,
    }
}

fn to_string_error(error: impl ToString) -> String {
    error.to_string()
}
