use base64::Engine;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::evals::{self, EvalRunEntry, LocalEvalInput};
use crate::memory;
use crate::project_store;
use crate::provider_protocols;
use crate::retrieval;
use crate::world_state;
use crate::{
    CharacterChatSummary, CharacterSummary, DeleteSessionSummaryPayload, LibraryDocument,
    NarrativeMemoryCandidateEntry, NarrativeMemoryEntry, NarrativeMemoryHitEntry,
    NarrativeMemoryRecord, SaveCharacterPayload, SaveLibraryDocumentPayload,
    SaveSessionSummaryPayload, SessionSummaryRecord, SettingsPayload, TraceEntryRecord,
    WorkspaceCatalogEntry, WorkspaceCatalogPayload, WorldStateSnapshotEntry,
    WorldStateUpdateRecord,
};

const STORAGE_READY_FILE: &str = ".storage-ready";
const SETTINGS_DB_FILE: &str = "settings.sqlite";
const LIBRARY_DB_FILE: &str = "library.sqlite";
const CHATS_DB_FILE: &str = "chats.sqlite";
const SECRETS_DB_FILE: &str = "secrets.sqlite";
const EVALS_DB_FILE: &str = "evals.sqlite";
const DEFAULT_CHAT_SOURCE: &str = "";
const DEFAULT_CHAT_BASE_URL: &str = "";
const DEFAULT_CHAT_MODEL: &str = "";
const LEGACY_DEFAULT_PROVIDER_ID: &str = "default-custom";
const LEGACY_DEFAULT_PROVIDER_SECRET_KEY: &str = "model_provider_default-custom";
const LEGACY_CUSTOM_SECRET_KEY: &str = "api_key_custom";
const LEGACY_EMBEDDING_MODEL: &str = "nvidia/nv-embed-v1";
const LEGACY_DEFAULT_BASE_URL: &str = "https://shiroapi.galiais.com";
const LEGACY_DEFAULT_SOURCE: &str = "custom";
const DEFAULT_RETRIEVAL_JOBS_RETENTION_PER_SOURCE: i64 = 24;
const DEFAULT_SESSION_SUMMARY_MIN_MESSAGES: i64 = 24;
const DEFAULT_SESSION_SUMMARY_REFRESH_INTERVAL_MS: i64 = 30_000;
const DEFAULT_SESSION_SUMMARY_SOURCE_WINDOW: i64 = 24;
const DEFAULT_CHARACTER_SEED_JSON: &str = include_str!("../resources/seeds/default-character.json");
const DEFAULT_WORLD_SEED_JSON: &str = include_str!("../resources/seeds/default-world.json");

pub(crate) type StorageResult<T> = Result<T, String>;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderCapability {
    pub capability: String,
    pub enabled: bool,
    pub default_model: String,
    pub models: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderRecord {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub protocol: String,
    pub base_url: String,
    pub api_version: Option<String>,
    pub deployment_name: Option<String>,
    pub enabled: bool,
    pub secret_key: String,
    pub has_secret: bool,
    pub capabilities: Vec<ModelProviderCapability>,
    pub notes: Option<String>,
    pub updated_at: u64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveModelProviderPayload {
    pub id: Option<String>,
    pub name: String,
    pub provider_type: String,
    pub protocol: Option<String>,
    pub base_url: String,
    pub api_version: Option<String>,
    pub deployment_name: Option<String>,
    pub enabled: bool,
    pub secret_value: Option<String>,
    pub capabilities: Vec<ModelProviderCapability>,
    pub notes: Option<String>,
}

#[derive(Deserialize)]
struct DefaultCharacterSeed {
    alternate_greetings: Vec<String>,
    avatar_file_name: String,
    description: String,
    first_mes: String,
    mes_example: String,
    name: String,
    personality: String,
    post_history_instructions: String,
    scenario: String,
    system_prompt: String,
}

#[derive(Deserialize)]
struct DefaultWorldSeed {
    entries: Vec<Value>,
    name: String,
    tags: Vec<String>,
}

pub(crate) fn data_root() -> PathBuf {
    if let Ok(value) = std::env::var("ST_TAURI_DATA_ROOT") {
        return PathBuf::from(value);
    }

    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
        .join("data")
        .join("local-user")
}

pub(crate) fn db_dir() -> PathBuf {
    data_root().join("db")
}

fn settings_db_path() -> PathBuf {
    db_dir().join(SETTINGS_DB_FILE)
}

fn library_db_path() -> PathBuf {
    db_dir().join(LIBRARY_DB_FILE)
}

pub(crate) fn chats_db_path() -> PathBuf {
    db_dir().join(CHATS_DB_FILE)
}

fn secrets_db_path() -> PathBuf {
    db_dir().join(SECRETS_DB_FILE)
}

fn evals_db_path() -> PathBuf {
    db_dir().join(EVALS_DB_FILE)
}

fn storage_ready_path() -> PathBuf {
    data_root().join(STORAGE_READY_FILE)
}

pub(crate) fn exports_dir() -> PathBuf {
    data_root().join("exports")
}

fn backups_dir() -> PathBuf {
    data_root().join("backups")
}

pub(crate) fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or_default()
}

fn bool_to_i64(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

pub(crate) fn open_connection(path: &Path) -> StorageResult<Connection> {
    Connection::open(path).map_err(|error| error.to_string())
}

fn open_settings_db() -> StorageResult<Connection> {
    open_connection(&settings_db_path())
}

pub(crate) fn open_library_db() -> StorageResult<Connection> {
    open_connection(&library_db_path())
}

pub(crate) fn open_chats_db() -> StorageResult<Connection> {
    open_connection(&chats_db_path())
}

fn open_secrets_db() -> StorageResult<Connection> {
    open_connection(&secrets_db_path())
}

fn open_evals_db() -> StorageResult<Connection> {
    open_connection(&evals_db_path())
}

fn default_character_avatar_path(file_name: &str) -> String {
    data_root()
        .join("characters")
        .join(file_name)
        .to_string_lossy()
        .to_string()
}

fn load_default_character_seed() -> StorageResult<DefaultCharacterSeed> {
    serde_json::from_str(DEFAULT_CHARACTER_SEED_JSON).map_err(|error| error.to_string())
}

fn load_default_world_seed() -> StorageResult<DefaultWorldSeed> {
    serde_json::from_str(DEFAULT_WORLD_SEED_JSON).map_err(|error| error.to_string())
}

fn serialize_default_world_seed() -> StorageResult<(String, String, String)> {
    let seed = load_default_world_seed()?;
    let content = serde_json::to_string(&seed.entries).map_err(|error| error.to_string())?;
    let tags_json = serde_json::to_string(&seed.tags).map_err(|error| error.to_string())?;
    Ok((seed.name, content, tags_json))
}

pub fn ensure_storage_ready() -> StorageResult<()> {
    fs::create_dir_all(db_dir()).map_err(|error| error.to_string())?;
    fs::create_dir_all(data_root().join("characters")).map_err(|error| error.to_string())?;
    fs::create_dir_all(backups_dir()).map_err(|error| error.to_string())?;
    initialize_databases()?;
    memory::initialize_memory_database()?;
    retrieval::initialize_retrieval_database()?;
    world_state::initialize_world_state_database()?;
    initialize_evals_database()?;
    project_store::initialize_project_database()?;
    memory::migrate_legacy_narrative_memories()?;
    retrieval::migrate_legacy_narrative_memory_embeddings()?;
    ensure_default_settings()?;
    cleanup_legacy_default_model_provider_state()?;
    ensure_default_workspace_content()?;

    if !storage_ready_path().exists() {
        fs::write(storage_ready_path(), b"sqlite-ready").map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn initialize_databases() -> StorageResult<()> {
    {
        let connection = open_settings_db()?;
        connection
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS app_settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    settings_json TEXT NOT NULL,
                    raw_settings TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS model_providers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    provider_type TEXT NOT NULL,
                    protocol TEXT NOT NULL DEFAULT 'openai_chat_completions',
                    base_url TEXT NOT NULL,
                    api_version TEXT,
                    deployment_name TEXT,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    secret_key TEXT NOT NULL,
                    capabilities_json TEXT NOT NULL,
                    notes TEXT,
                    updated_at INTEGER NOT NULL
                );
                ",
            )
            .map_err(|error| error.to_string())?;
        ensure_settings_schema_updates(&connection)?;
    }

    {
        let connection = open_library_db()?;
        connection
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS library_entries (
                    domain TEXT NOT NULL,
                    name TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    content_text TEXT,
                    disabled INTEGER NOT NULL DEFAULT 0,
                    item_count INTEGER,
                    note TEXT,
                    size_bytes INTEGER,
                    updated_at INTEGER,
                    source_path TEXT,
                    tags_json TEXT NOT NULL DEFAULT '[]',
                    PRIMARY KEY (domain, name)
                );
                CREATE INDEX IF NOT EXISTS idx_library_domain_updated
                ON library_entries(domain, updated_at DESC, name ASC);
                ",
            )
            .map_err(|error| error.to_string())?;
    }

    {
        let connection = open_chats_db()?;
        connection
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS characters (
                    avatar TEXT PRIMARY KEY,
                    avatar_path TEXT,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    personality TEXT NOT NULL DEFAULT '',
                    scenario TEXT NOT NULL DEFAULT '',
                    first_mes TEXT NOT NULL DEFAULT '',
                    mes_example TEXT NOT NULL DEFAULT '',
                    system_prompt TEXT NOT NULL DEFAULT '',
                    post_history_instructions TEXT NOT NULL DEFAULT '',
                    alternate_greetings_json TEXT NOT NULL DEFAULT '[]',
                    chat TEXT,
                    create_date TEXT,
                    data_size INTEGER,
                    date_added INTEGER,
                    date_last_chat INTEGER
                );
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    session_id TEXT PRIMARY KEY,
                    avatar TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    display_name TEXT,
                    file_size INTEGER NOT NULL DEFAULT 0,
                    last_mes INTEGER,
                    preview TEXT NOT NULL DEFAULT '',
                    message_count INTEGER NOT NULL DEFAULT 0,
                    chat_metadata_json TEXT NOT NULL DEFAULT '{}',
                    UNIQUE (avatar, file_name)
                );
                CREATE INDEX IF NOT EXISTS idx_chat_sessions_avatar_updated
                ON chat_sessions(avatar, last_mes DESC, file_name ASC);
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    ordinal INTEGER NOT NULL,
                    payload_json TEXT NOT NULL,
                    mes_text TEXT,
                    send_date TEXT,
                    is_user INTEGER NOT NULL DEFAULT 0,
                    is_system INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_chat_messages_session_ordinal
                ON chat_messages(session_id, ordinal ASC);
                CREATE TABLE IF NOT EXISTS session_summaries (
                    id TEXT PRIMARY KEY,
                    avatar_url TEXT,
                    file_name TEXT,
                    summary_kind TEXT NOT NULL,
                    content TEXT NOT NULL,
                    source_signature TEXT,
                    source_message_start INTEGER,
                    source_message_end INTEGER,
                    version INTEGER NOT NULL DEFAULT 1,
                    updated_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_session_summaries_scope
                ON session_summaries(avatar_url, file_name, summary_kind, updated_at DESC);
                CREATE TABLE IF NOT EXISTS trace_entries (
                    id TEXT PRIMARY KEY,
                    session_id TEXT,
                    avatar TEXT,
                    file_name TEXT,
                    character_name TEXT NOT NULL DEFAULT '',
                    provider TEXT NOT NULL,
                    model TEXT,
                    prompt_text TEXT,
                    request_payload TEXT,
                    response_text TEXT,
                    error_text TEXT,
                    token_count INTEGER,
                    duration_ms INTEGER,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_trace_entries_created
                ON trace_entries(created_at DESC, id ASC);
                CREATE INDEX IF NOT EXISTS idx_trace_entries_session_created
                ON trace_entries(session_id, created_at DESC, id ASC);
                ",
            )
            .map_err(|error| error.to_string())?;
        ensure_chats_schema_updates(&connection)?;
    }

    {
        let connection = open_secrets_db()?;
        connection
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS secrets (
                    secret_key TEXT PRIMARY KEY,
                    secret_value TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                ",
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn ensure_settings_schema_updates(connection: &Connection) -> StorageResult<()> {
    ensure_column(
        connection,
        "model_providers",
        "protocol",
        "ALTER TABLE model_providers ADD COLUMN protocol TEXT NOT NULL DEFAULT 'openai_chat_completions'",
    )?;
    connection
        .execute(
            "
            UPDATE model_providers
            SET protocol = CASE
                WHEN lower(provider_type) = 'anthropic' THEN 'anthropic_messages'
                WHEN lower(provider_type) IN ('gemini', 'google_gemini') THEN 'gemini_generate_content'
                WHEN lower(provider_type) = 'jina' THEN 'jina_rerank'
                WHEN protocol IS NULL OR trim(protocol) = '' THEN 'openai_chat_completions'
                ELSE protocol
            END
            ",
            [],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn initialize_evals_database() -> StorageResult<()> {
    let connection = open_evals_db()?;
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS eval_runs (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                avatar TEXT,
                file_name TEXT,
                character_name TEXT NOT NULL DEFAULT '',
                overall_score REAL NOT NULL,
                setting_consistency REAL NOT NULL,
                memory_hit_rate REAL NOT NULL,
                state_update_correctness REAL NOT NULL,
                reply_continuity REAL NOT NULL,
                notes_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_eval_runs_created
            ON eval_runs(created_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_eval_runs_session_created
            ON eval_runs(session_id, created_at DESC, id DESC);
            ",
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn ensure_chats_schema_updates(connection: &Connection) -> StorageResult<()> {
    ensure_column(
        connection,
        "session_summaries",
        "source_signature",
        "ALTER TABLE session_summaries ADD COLUMN source_signature TEXT",
    )?;
    ensure_column(
        connection,
        "characters",
        "system_prompt",
        "ALTER TABLE characters ADD COLUMN system_prompt TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_column(
        connection,
        "characters",
        "post_history_instructions",
        "ALTER TABLE characters ADD COLUMN post_history_instructions TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_column(
        connection,
        "characters",
        "alternate_greetings_json",
        "ALTER TABLE characters ADD COLUMN alternate_greetings_json TEXT NOT NULL DEFAULT '[]'",
    )?;
    Ok(())
}

fn ensure_column(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
    alter_sql: &str,
) -> StorageResult<()> {
    if has_column(connection, table_name, column_name)? {
        return Ok(());
    }

    connection
        .execute(alter_sql, [])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn has_column(connection: &Connection, table_name: &str, column_name: &str) -> StorageResult<bool> {
    let pragma = format!("PRAGMA table_info({table_name})");
    let mut statement = connection
        .prepare(&pragma)
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?;

    for row in rows {
        if row.map_err(|error| error.to_string())? == column_name {
            return Ok(true);
        }
    }

    Ok(false)
}

pub(crate) fn has_table(connection: &Connection, table_name: &str) -> StorageResult<bool> {
    connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
            params![table_name],
            |_| Ok(()),
        )
        .optional()
        .map(|row| row.is_some())
        .map_err(|error| error.to_string())
}

fn ensure_default_settings() -> StorageResult<()> {
    let connection = open_settings_db()?;
    let settings = connection
        .query_row(
            "SELECT settings_json FROM app_settings WHERE id = 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    let next_settings = merge_default_settings(
        settings
            .as_deref()
            .and_then(|value| serde_json::from_str::<Value>(value).ok())
            .unwrap_or_else(|| Value::Object(Map::new())),
    );
    let settings_json = serde_json::to_string(&next_settings).map_err(|error| error.to_string())?;
    let raw_settings =
        serde_json::to_string_pretty(&next_settings).map_err(|error| error.to_string())?;

    connection
        .execute(
            "
            INSERT INTO app_settings(id, settings_json, raw_settings, updated_at)
            VALUES (1, ?1, ?2, ?3)
            ON CONFLICT(id) DO UPDATE SET
                settings_json = excluded.settings_json,
                raw_settings = excluded.raw_settings,
                updated_at = excluded.updated_at
            ",
            params![settings_json, raw_settings, now_millis()],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn merge_default_settings(existing: Value) -> Value {
    let mut settings = match existing {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    let mut oai_settings = match settings.remove("oai_settings") {
        Some(Value::Object(map)) => map,
        _ => Map::new(),
    };
    let empty_models: Vec<String> = Vec::new();

    ensure_string_value(&mut settings, "username", "User");
    ensure_string_value(&mut settings, "main_api", "openai");
    ensure_string_value(&mut settings, "chat_model_provider_id", "");
    ensure_string_value(&mut settings, "rerank_model_provider_id", "");
    ensure_string_value(&mut settings, "image_model_provider_id", "");
    ensure_string_value(&mut settings, "speech_model_provider_id", "");
    ensure_string_value(&mut settings, "chat_completion_source", DEFAULT_CHAT_SOURCE);
    ensure_string_value(&mut settings, "custom_url", DEFAULT_CHAT_BASE_URL);
    ensure_string_value(&mut settings, "openai_model", DEFAULT_CHAT_MODEL);
    ensure_string_array_value(&mut settings, "chat_completion_model_names", &empty_models);
    ensure_number_value(&mut settings, "max_context", 8192.0);
    ensure_number_value(&mut settings, "amount_gen", 768.0);
    ensure_number_value(&mut settings, "openai_max_tokens", 768.0);
    ensure_number_value(&mut settings, "temp_openai", 0.7);
    ensure_number_value(&mut settings, "top_p_openai", 1.0);
    ensure_number_value(&mut settings, "freq_pen_openai", 0.0);
    ensure_number_value(&mut settings, "pres_pen_openai", 0.0);
    ensure_number_value(
        &mut settings,
        "retrieval_jobs_retention_per_source",
        DEFAULT_RETRIEVAL_JOBS_RETENTION_PER_SOURCE as f64,
    );
    ensure_number_value(
        &mut settings,
        "session_summary_min_messages",
        DEFAULT_SESSION_SUMMARY_MIN_MESSAGES as f64,
    );
    ensure_number_value(
        &mut settings,
        "session_summary_refresh_interval_ms",
        DEFAULT_SESSION_SUMMARY_REFRESH_INTERVAL_MS as f64,
    );
    ensure_number_value(
        &mut settings,
        "session_summary_source_window",
        DEFAULT_SESSION_SUMMARY_SOURCE_WINDOW as f64,
    );
    ensure_bool_value(&mut settings, "narrative_embedding_enabled", false);
    ensure_string_value(&mut settings, "narrative_embedding_provider_id", "");
    ensure_string_value(&mut settings, "narrative_embedding_source", "");
    ensure_string_value(&mut settings, "narrative_embedding_base_url", "");
    ensure_string_value(&mut settings, "narrative_embedding_model", "");
    ensure_bool_value(&mut settings, "swipes", true);
    ensure_message_rendering_defaults(&mut settings);

    ensure_string_value(
        &mut oai_settings,
        "chat_completion_source",
        DEFAULT_CHAT_SOURCE,
    );
    ensure_string_value(&mut oai_settings, "chat_model_provider_id", "");
    ensure_string_value(&mut oai_settings, "rerank_model_provider_id", "");
    ensure_string_value(&mut oai_settings, "image_model_provider_id", "");
    ensure_string_value(&mut oai_settings, "speech_model_provider_id", "");
    ensure_string_array_value(
        &mut oai_settings,
        "chat_completion_model_names",
        &empty_models,
    );
    ensure_string_value(&mut oai_settings, "custom_url", DEFAULT_CHAT_BASE_URL);
    ensure_string_value(&mut oai_settings, "openai_model", DEFAULT_CHAT_MODEL);
    ensure_number_value(&mut oai_settings, "openai_max_tokens", 768.0);
    ensure_number_value(&mut oai_settings, "temp_openai", 0.7);
    ensure_number_value(&mut oai_settings, "top_p_openai", 1.0);
    ensure_number_value(&mut oai_settings, "freq_pen_openai", 0.0);
    ensure_number_value(&mut oai_settings, "pres_pen_openai", 0.0);
    ensure_bool_value(&mut oai_settings, "narrative_embedding_enabled", false);
    ensure_string_value(&mut oai_settings, "narrative_embedding_provider_id", "");
    ensure_string_value(&mut oai_settings, "narrative_embedding_source", "");
    ensure_string_value(&mut oai_settings, "narrative_embedding_base_url", "");
    ensure_string_value(&mut oai_settings, "narrative_embedding_model", "");

    settings.insert("oai_settings".to_string(), Value::Object(oai_settings));
    Value::Object(settings)
}

fn ensure_message_rendering_defaults(settings: &mut Map<String, Value>) {
    let mut message_rendering = match settings.remove("message_rendering") {
        Some(Value::Object(map)) => map,
        _ => Map::new(),
    };

    ensure_string_value(&mut message_rendering, "activeTemplateId", "classic-novel");
    ensure_string_value(&mut message_rendering, "sampleText", "“别靠近那扇门。”");

    let mut format_guide = match message_rendering.remove("formatGuide") {
        Some(Value::Object(map)) => map,
        _ => Map::new(),
    };
    ensure_bool_value(&mut format_guide, "enabled", true);
    ensure_string_value(&mut format_guide, "mode", "strict");
    if !format_guide.contains_key("customInstruction") {
        format_guide.insert(
            "customInstruction".to_string(),
            Value::String(String::new()),
        );
    }
    message_rendering.insert("formatGuide".to_string(), Value::Object(format_guide));

    if !message_rendering.contains_key("overrides") {
        message_rendering.insert("overrides".to_string(), Value::Object(Map::new()));
    }

    settings.insert(
        "message_rendering".to_string(),
        Value::Object(message_rendering),
    );
}

fn ensure_string_value(target: &mut Map<String, Value>, key: &str, fallback: &str) {
    let needs_value = target
        .get(key)
        .and_then(Value::as_str)
        .map(|value| value.trim().is_empty())
        .unwrap_or(true);

    if needs_value {
        target.insert(key.to_string(), Value::String(fallback.to_string()));
    }
}

fn ensure_string_array_value(target: &mut Map<String, Value>, key: &str, fallback: &[String]) {
    let has_values = target
        .get(key)
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .any(|value| !value.trim().is_empty())
        })
        .unwrap_or(false);

    if !has_values {
        target.insert(
            key.to_string(),
            Value::Array(
                fallback
                    .iter()
                    .cloned()
                    .map(Value::String)
                    .collect::<Vec<_>>(),
            ),
        );
    }
}

fn ensure_number_value(target: &mut Map<String, Value>, key: &str, fallback: f64) {
    let has_number = target.get(key).is_some_and(|value| match value {
        Value::Number(_) => true,
        Value::String(text) => text.parse::<f64>().is_ok(),
        _ => false,
    });

    if !has_number {
        target.insert(
            key.to_string(),
            serde_json::Number::from_f64(fallback)
                .map(Value::Number)
                .unwrap_or_else(|| Value::Number(0.into())),
        );
    }
}

fn ensure_bool_value(target: &mut Map<String, Value>, key: &str, fallback: bool) {
    if !target.get(key).is_some_and(Value::is_boolean) {
        target.insert(key.to_string(), Value::Bool(fallback));
    }
}

fn ensure_default_workspace_content() -> StorageResult<()> {
    ensure_default_character_seed()?;
    ensure_default_world_seed()?;
    ensure_default_active_world_selection()?;
    Ok(())
}

fn ensure_default_character_seed() -> StorageResult<()> {
    let connection = open_chats_db()?;
    let character_count = connection
        .query_row("SELECT COUNT(*) FROM characters", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| error.to_string())?;

    if character_count > 0 {
        return Ok(());
    }

    let seed = load_default_character_seed()?;
    let alternate_greetings_json =
        serde_json::to_string(&seed.alternate_greetings).map_err(|error| error.to_string())?;
    let now = now_millis();

    connection
        .execute(
            "
            INSERT INTO characters(
                avatar, avatar_path, name, description, personality, scenario,
                first_mes, mes_example, system_prompt, post_history_instructions,
                alternate_greetings_json, chat, create_date, data_size, date_added, date_last_chat
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, NULL, NULL, ?12, NULL)
            ",
            params![
                seed.avatar_file_name,
                default_character_avatar_path(&seed.avatar_file_name),
                seed.name,
                seed.description,
                seed.personality,
                seed.scenario,
                seed.first_mes,
                seed.mes_example,
                seed.system_prompt,
                seed.post_history_instructions,
                alternate_greetings_json,
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn ensure_default_world_seed() -> StorageResult<()> {
    let connection = open_library_db()?;
    let world_count = connection
        .query_row(
            "SELECT COUNT(*) FROM library_entries WHERE domain = 'worlds'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?;

    if world_count > 0 {
        return Ok(());
    }

    let (world_name, content, tags_json) = serialize_default_world_seed()?;
    let updated_at = now_millis();
    let (item_count, note) = derive_library_metadata("world", &content);

    connection
        .execute(
            "
            INSERT INTO library_entries(
                domain, name, kind, content_text, disabled, item_count, note,
                size_bytes, updated_at, source_path, tags_json
            ) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8, NULL, ?9)
            ",
            params![
                "worlds",
                world_name,
                "world",
                content,
                item_count,
                note,
                content.len() as i64,
                updated_at,
                tags_json
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn ensure_default_active_world_selection() -> StorageResult<()> {
    let connection = open_settings_db()?;
    let stored = connection
        .query_row(
            "SELECT settings_json FROM app_settings WHERE id = 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    let mut next_settings = stored
        .as_deref()
        .and_then(|value| serde_json::from_str::<Value>(value).ok())
        .and_then(|value| match value {
            Value::Object(map) => Some(map),
            _ => None,
        })
        .unwrap_or_default();

    let mut world_names = next_settings
        .get("world_names")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| item.as_str().map(str::trim).map(str::to_string))
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();

    if world_names.is_empty() {
        world_names.push(load_default_world_seed()?.name);
    }

    next_settings.insert(
        "world_names".to_string(),
        Value::Array(world_names.into_iter().map(Value::String).collect()),
    );

    let normalized = merge_default_settings(Value::Object(next_settings));
    let next_settings_json =
        serde_json::to_string(&normalized).map_err(|error| error.to_string())?;
    let raw_settings =
        serde_json::to_string_pretty(&normalized).map_err(|error| error.to_string())?;

    connection
        .execute(
            "
            INSERT INTO app_settings(id, settings_json, raw_settings, updated_at)
            VALUES (1, ?1, ?2, ?3)
            ON CONFLICT(id) DO UPDATE SET
                settings_json = excluded.settings_json,
                raw_settings = excluded.raw_settings,
                updated_at = excluded.updated_at
            ",
            params![next_settings_json, raw_settings, now_millis()],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn read_stored_settings_row() -> StorageResult<(String, String)> {
    ensure_storage_ready()?;
    let connection = open_settings_db()?;
    let row = connection
        .query_row(
            "SELECT settings_json, raw_settings FROM app_settings WHERE id = 1",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    Ok(row.unwrap_or_else(|| ("{}".to_string(), "{}".to_string())))
}

pub(crate) fn read_stored_settings_value() -> StorageResult<Value> {
    let (settings_json, _) = read_stored_settings_row()?;
    let parsed =
        serde_json::from_str::<Value>(&settings_json).unwrap_or_else(|_| Value::Object(Map::new()));
    if parsed.is_object() {
        Ok(parsed)
    } else {
        Ok(Value::Object(Map::new()))
    }
}

pub(crate) fn read_app_setting_i64(key: &str, fallback: i64) -> i64 {
    read_stored_settings_value()
        .ok()
        .and_then(|settings| settings.get(key).cloned())
        .and_then(|value| match value {
            Value::Number(number) => number.as_i64(),
            Value::String(text) => text.trim().parse::<i64>().ok(),
            _ => None,
        })
        .filter(|value| *value > 0)
        .unwrap_or(fallback)
}

fn read_active_world_names() -> StorageResult<Vec<String>> {
    let settings = read_stored_settings_value()?;
    Ok(settings
        .get("world_names")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default())
}

fn library_names(domain: &str) -> StorageResult<Vec<String>> {
    ensure_storage_ready()?;
    let connection = open_library_db()?;
    let mut statement = connection
        .prepare("SELECT name FROM library_entries WHERE domain = ?1 ORDER BY name ASC")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![domain], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    let mut names = Vec::new();
    for row in rows {
        names.push(row.map_err(|error| error.to_string())?);
    }
    Ok(names)
}

pub fn fetch_settings_payload() -> StorageResult<SettingsPayload> {
    let settings = read_stored_settings_value()?;
    let (_, raw_settings) = read_stored_settings_row()?;
    let active_world_names = read_active_world_names()?;

    Ok(SettingsPayload {
        context: library_names("contexts")?,
        enable_accounts: settings
            .get("enable_accounts")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        enable_extensions: settings
            .get("enable_extensions")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        enable_extensions_auto_update: settings
            .get("enable_extensions_auto_update")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        instruct: library_names("instructs")?,
        koboldai_setting_names: library_names("koboldPresets")?,
        novelai_setting_names: library_names("novelPresets")?,
        openai_setting_names: library_names("openaiPresets")?,
        quick_reply_presets: library_names("quickReplies")?,
        raw_settings,
        reasoning: library_names("reasonings")?,
        settings,
        sysprompt: library_names("sysprompts")?,
        textgenerationwebui_preset_names: library_names("textgenPresets")?,
        themes: library_names("themes")?,
        world_names: active_world_names,
    })
}

pub fn save_settings(settings: &Value) -> StorageResult<()> {
    ensure_storage_ready()?;
    let connection = open_settings_db()?;
    save_settings_in_connection(&connection, settings)
}

pub fn save_settings_with_secret(
    settings: &Value,
    secret_key: &str,
    secret_value: &str,
) -> StorageResult<()> {
    ensure_storage_ready()?;
    let mut connection = open_settings_db()?;
    let secrets_path = secrets_db_path().to_string_lossy().to_string();
    connection
        .execute("ATTACH DATABASE ?1 AS secrets_db", params![secrets_path])
        .map_err(|error| error.to_string())?;

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    save_settings_in_transaction(&transaction, settings)?;
    transaction
        .execute(
            "
            INSERT INTO secrets_db.secrets(secret_key, secret_value, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(secret_key) DO UPDATE SET
                secret_value = excluded.secret_value,
                updated_at = excluded.updated_at
            ",
            params![secret_key.trim(), secret_value, now_millis()],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

fn save_settings_in_connection(connection: &Connection, settings: &Value) -> StorageResult<()> {
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    save_settings_in_transaction(&transaction, settings)?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

fn save_settings_in_transaction(
    transaction: &rusqlite::Transaction<'_>,
    settings: &Value,
) -> StorageResult<()> {
    let settings_json = serde_json::to_string(settings).map_err(|error| error.to_string())?;
    let raw_settings = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;

    transaction
        .execute(
            "
            INSERT INTO app_settings(id, settings_json, raw_settings, updated_at)
            VALUES (1, ?1, ?2, ?3)
            ON CONFLICT(id) DO UPDATE SET
                settings_json = excluded.settings_json,
                raw_settings = excluded.raw_settings,
                updated_at = excluded.updated_at
            ",
            params![settings_json, raw_settings, now_millis()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn fetch_model_providers() -> StorageResult<Vec<ModelProviderRecord>> {
    ensure_storage_ready()?;
    let connection = open_settings_db()?;
    let secrets_path = secrets_db_path().to_string_lossy().to_string();
    connection
        .execute("ATTACH DATABASE ?1 AS secrets_db", params![secrets_path])
        .map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            "
            SELECT
                p.id, p.name, p.provider_type, p.protocol, p.base_url, p.api_version,
                p.deployment_name, p.enabled, p.secret_key, p.capabilities_json,
                p.notes, p.updated_at,
                CASE WHEN s.secret_value IS NULL OR trim(s.secret_value) = '' THEN 0 ELSE 1 END AS has_secret
            FROM model_providers p
            LEFT JOIN secrets_db.secrets s ON s.secret_key = p.secret_key
            ORDER BY p.enabled DESC, p.updated_at DESC, p.name COLLATE NOCASE ASC
            ",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            let capabilities_json: String = row.get(9)?;
            let capabilities =
                serde_json::from_str::<Vec<ModelProviderCapability>>(&capabilities_json)
                    .unwrap_or_else(|_| default_provider_capabilities());
            let provider_type: String = row.get(2)?;
            let protocol: String = row.get(3)?;
            Ok(ModelProviderRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                protocol: provider_protocols::normalize_provider_protocol(
                    Some(&protocol),
                    &provider_type,
                ),
                provider_type,
                base_url: row.get(4)?,
                api_version: row.get(5)?,
                deployment_name: row.get(6)?,
                enabled: row.get::<_, i64>(7)? != 0,
                secret_key: row.get(8)?,
                capabilities,
                notes: row.get(10)?,
                updated_at: row.get::<_, i64>(11)? as u64,
                has_secret: row.get::<_, i64>(12)? != 0,
            })
        })
        .map_err(|error| error.to_string())?;

    let mut providers = Vec::new();
    for row in rows {
        providers.push(row.map_err(|error| error.to_string())?);
    }
    Ok(providers)
}

pub fn save_model_provider(
    payload: SaveModelProviderPayload,
) -> StorageResult<ModelProviderRecord> {
    ensure_storage_ready()?;
    let id = normalize_provider_id(payload.id.as_deref(), &payload.name);
    let name = payload.name.trim();
    let provider_type = normalize_provider_type(&payload.provider_type);
    let protocol = provider_protocols::normalize_provider_protocol(
        payload.protocol.as_deref(),
        &provider_type,
    );
    let base_url = payload.base_url.trim();

    if name.is_empty() {
        return Err("服务商名称不能为空。".to_string());
    }
    if provider_type.is_empty() {
        return Err("服务商类型不能为空。".to_string());
    }

    let capabilities = normalize_provider_capabilities(payload.capabilities);
    let capabilities_json =
        serde_json::to_string(&capabilities).map_err(|error| error.to_string())?;
    let secret_key = format!("model_provider_{id}");
    let api_version = payload
        .api_version
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let deployment_name = payload
        .deployment_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let notes = payload
        .notes
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let now = now_millis();

    let mut connection = open_settings_db()?;
    let secrets_path = secrets_db_path().to_string_lossy().to_string();
    connection
        .execute("ATTACH DATABASE ?1 AS secrets_db", params![secrets_path])
        .map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "
            INSERT INTO model_providers(
                id, name, provider_type, protocol, base_url, api_version, deployment_name,
                enabled, secret_key, capabilities_json, notes, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                provider_type = excluded.provider_type,
                protocol = excluded.protocol,
                base_url = excluded.base_url,
                api_version = excluded.api_version,
                deployment_name = excluded.deployment_name,
                enabled = excluded.enabled,
                secret_key = excluded.secret_key,
                capabilities_json = excluded.capabilities_json,
                notes = excluded.notes,
                updated_at = excluded.updated_at
            ",
            params![
                &id,
                name,
                &provider_type,
                &protocol,
                base_url,
                api_version,
                deployment_name,
                if payload.enabled { 1 } else { 0 },
                &secret_key,
                capabilities_json,
                notes,
                now,
            ],
        )
        .map_err(|error| error.to_string())?;

    if let Some(secret_value) = payload
        .secret_value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        transaction
            .execute(
                "
                INSERT INTO secrets_db.secrets(secret_key, secret_value, updated_at)
                VALUES (?1, ?2, ?3)
                ON CONFLICT(secret_key) DO UPDATE SET
                    secret_value = excluded.secret_value,
                    updated_at = excluded.updated_at
                ",
                params![secret_key, secret_value, now],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction.commit().map_err(|error| error.to_string())?;
    fetch_model_provider(&id)?.ok_or_else(|| "服务商保存后未找到。".to_string())
}

pub fn delete_model_provider(id: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let normalized_id = id.trim();
    if normalized_id.is_empty() {
        return Err("服务商 ID 不能为空。".to_string());
    }

    let mut connection = open_settings_db()?;
    let secrets_path = secrets_db_path().to_string_lossy().to_string();
    connection
        .execute("ATTACH DATABASE ?1 AS secrets_db", params![secrets_path])
        .map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let secret_key = transaction
        .query_row(
            "SELECT secret_key FROM model_providers WHERE id = ?1",
            params![normalized_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "DELETE FROM model_providers WHERE id = ?1",
            params![normalized_id],
        )
        .map_err(|error| error.to_string())?;

    if let Some(secret_key) = secret_key {
        transaction
            .execute(
                "DELETE FROM secrets_db.secrets WHERE secret_key = ?1",
                params![secret_key],
            )
            .map_err(|error| error.to_string())?;
    }

    clear_provider_references_in_transaction(&transaction, normalized_id)?;

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

fn fetch_model_provider(id: &str) -> StorageResult<Option<ModelProviderRecord>> {
    Ok(fetch_model_providers()?
        .into_iter()
        .find(|provider| provider.id == id))
}

pub fn fetch_enabled_model_provider_for_capability(
    id: &str,
    capability_name: &str,
) -> StorageResult<Option<ModelProviderRecord>> {
    let normalized_id = id.trim();
    let normalized_capability = capability_name.trim().to_ascii_lowercase();
    if normalized_id.is_empty() || normalized_capability.is_empty() {
        return Ok(None);
    }

    Ok(fetch_model_provider(normalized_id)?.filter(|provider| {
        provider.enabled
            && provider.capabilities.iter().any(|capability| {
                capability.enabled
                    && capability.capability == normalized_capability
                    && provider_capability_primary_model(capability).is_some()
            })
    }))
}

pub fn provider_capability_primary_model(capability: &ModelProviderCapability) -> Option<String> {
    let default_model = capability.default_model.trim();
    if !default_model.is_empty() {
        return Some(default_model.to_string());
    }

    capability
        .models
        .iter()
        .map(|model| model.trim())
        .find(|model| !model.is_empty())
        .map(ToOwned::to_owned)
}

fn default_provider_capabilities() -> Vec<ModelProviderCapability> {
    vec![
        ModelProviderCapability {
            capability: "chat".to_string(),
            enabled: true,
            default_model: String::new(),
            models: Vec::new(),
        },
        ModelProviderCapability {
            capability: "embedding".to_string(),
            enabled: false,
            default_model: String::new(),
            models: Vec::new(),
        },
        ModelProviderCapability {
            capability: "rerank".to_string(),
            enabled: false,
            default_model: String::new(),
            models: Vec::new(),
        },
        ModelProviderCapability {
            capability: "image".to_string(),
            enabled: false,
            default_model: String::new(),
            models: Vec::new(),
        },
        ModelProviderCapability {
            capability: "speech".to_string(),
            enabled: false,
            default_model: String::new(),
            models: Vec::new(),
        },
    ]
}

fn normalize_provider_capabilities(
    capabilities: Vec<ModelProviderCapability>,
) -> Vec<ModelProviderCapability> {
    let mut normalized = BTreeMap::<String, ModelProviderCapability>::new();
    for capability in capabilities {
        let key = capability.capability.trim().to_ascii_lowercase();
        if key.is_empty() {
            continue;
        }
        let mut models = capability
            .models
            .into_iter()
            .map(|model| model.trim().to_string())
            .filter(|model| !model.is_empty())
            .collect::<Vec<_>>();
        models.sort();
        models.dedup();
        let default_model = capability.default_model.trim().to_string();
        if !default_model.is_empty() && !models.iter().any(|model| model == &default_model) {
            models.insert(0, default_model.clone());
        }
        normalized.insert(
            key.clone(),
            ModelProviderCapability {
                capability: key,
                enabled: capability.enabled,
                default_model,
                models,
            },
        );
    }

    for capability in default_provider_capabilities() {
        normalized
            .entry(capability.capability.clone())
            .or_insert(capability);
    }

    normalized.into_values().collect()
}

fn cleanup_legacy_default_model_provider_state() -> StorageResult<()> {
    let mut connection = open_settings_db()?;
    let secrets_path = secrets_db_path().to_string_lossy().to_string();
    connection
        .execute("ATTACH DATABASE ?1 AS secrets_db", params![secrets_path])
        .map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "DELETE FROM model_providers WHERE id = ?1",
            params![LEGACY_DEFAULT_PROVIDER_ID],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM secrets_db.secrets WHERE secret_key IN (?1, ?2)",
            params![LEGACY_DEFAULT_PROVIDER_SECRET_KEY, LEGACY_CUSTOM_SECRET_KEY],
        )
        .map_err(|error| error.to_string())?;

    clear_provider_references_in_transaction(&transaction, LEGACY_DEFAULT_PROVIDER_ID)?;
    cleanup_legacy_embedding_defaults_in_transaction(&transaction)?;

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

fn clear_provider_references_in_transaction(
    transaction: &rusqlite::Transaction<'_>,
    provider_id: &str,
) -> StorageResult<()> {
    let stored = transaction
        .query_row(
            "SELECT settings_json FROM app_settings WHERE id = 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some(stored) = stored else {
        return Ok(());
    };
    let mut settings = serde_json::from_str::<Value>(&stored).unwrap_or_else(|_| Value::Object(Map::new()));
    let Some(root) = settings.as_object_mut() else {
        return Ok(());
    };

    clear_provider_reference_key(root, "chat_model_provider_id", provider_id);
    clear_provider_reference_key(root, "rerank_model_provider_id", provider_id);
    clear_provider_reference_key(root, "image_model_provider_id", provider_id);
    clear_provider_reference_key(root, "speech_model_provider_id", provider_id);
    clear_provider_reference_key(root, "narrative_embedding_provider_id", provider_id);

    if let Some(nested) = root.get_mut("oai_settings").and_then(Value::as_object_mut) {
        clear_provider_reference_key(nested, "chat_model_provider_id", provider_id);
        clear_provider_reference_key(nested, "rerank_model_provider_id", provider_id);
        clear_provider_reference_key(nested, "image_model_provider_id", provider_id);
        clear_provider_reference_key(nested, "speech_model_provider_id", provider_id);
        clear_provider_reference_key(nested, "narrative_embedding_provider_id", provider_id);
    }

    save_settings_in_transaction(transaction, &settings)
}

fn clear_provider_reference_key(
    settings: &mut Map<String, Value>,
    key: &str,
    provider_id: &str,
) {
    let matches = settings
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .map(|value| value == provider_id)
        .unwrap_or(false);
    if matches {
        settings.insert(key.to_string(), Value::String(String::new()));
    }
}

fn cleanup_legacy_embedding_defaults_in_transaction(
    transaction: &rusqlite::Transaction<'_>,
) -> StorageResult<()> {
    let stored = transaction
        .query_row(
            "SELECT settings_json FROM app_settings WHERE id = 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some(stored) = stored else {
        return Ok(());
    };
    let mut settings = serde_json::from_str::<Value>(&stored).unwrap_or_else(|_| Value::Object(Map::new()));
    let Some(root) = settings.as_object_mut() else {
        return Ok(());
    };

    let root_changed = clear_legacy_embedding_defaults_map(root);
    let nested_changed = root
        .get_mut("oai_settings")
        .and_then(Value::as_object_mut)
        .map(clear_legacy_embedding_defaults_map)
        .unwrap_or(false);

    if root_changed || nested_changed {
        save_settings_in_transaction(transaction, &settings)?;
    }

    Ok(())
}

fn clear_legacy_embedding_defaults_map(settings: &mut Map<String, Value>) -> bool {
    let provider_id = settings
        .get("narrative_embedding_provider_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    let source = settings
        .get("narrative_embedding_source")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    let base_url = settings
        .get("narrative_embedding_base_url")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    let model = settings
        .get("narrative_embedding_model")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();

    let matches_legacy_defaults = provider_id.is_empty()
        && source == LEGACY_DEFAULT_SOURCE
        && base_url == LEGACY_DEFAULT_BASE_URL
        && model == LEGACY_EMBEDDING_MODEL;
    if !matches_legacy_defaults {
        return false;
    }

    settings.insert(
        "narrative_embedding_source".to_string(),
        Value::String(String::new()),
    );
    settings.insert(
        "narrative_embedding_base_url".to_string(),
        Value::String(String::new()),
    );
    settings.insert(
        "narrative_embedding_model".to_string(),
        Value::String(String::new()),
    );
    settings.insert(
        "narrative_embedding_enabled".to_string(),
        Value::Bool(false),
    );
    true
}

fn normalize_provider_type(value: &str) -> String {
    match value.trim() {
        "openai" | "openrouter" | "custom" | "azure_openai" => value.trim().to_string(),
        other => other.trim().to_ascii_lowercase(),
    }
}

fn normalize_provider_id(value: Option<&str>, fallback_name: &str) -> String {
    let source = value
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .unwrap_or(fallback_name);
    let normalized = source
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if normalized.is_empty() {
        format!("provider-{}", now_millis())
    } else {
        normalized
    }
}

pub(crate) fn resolve_avatar_file_name(avatar_url: &str) -> String {
    Path::new(avatar_url)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(avatar_url)
        .to_string()
}

pub fn resolve_avatar_path(avatar_url: &str) -> StorageResult<String> {
    ensure_storage_ready()?;
    let avatar = resolve_avatar_file_name(avatar_url);
    let connection = open_chats_db()?;
    let stored_path = connection
        .query_row(
            "SELECT avatar_path FROM characters WHERE avatar = ?1",
            params![avatar],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    if let Some(path) = stored_path {
        let resolved = PathBuf::from(path);
        if resolved.exists() {
            return resolved
                .canonicalize()
                .map_err(|error| error.to_string())
                .map(|path| path.to_string_lossy().to_string());
        }
    }

    let fallback = data_root()
        .join("characters")
        .join(resolve_avatar_file_name(avatar_url));
    if !fallback.exists() {
        return Err(format!("Avatar not found: {}", fallback.display()));
    }

    fallback
        .canonicalize()
        .map_err(|error| error.to_string())
        .map(|path| path.to_string_lossy().to_string())
}

pub fn fetch_characters() -> StorageResult<Vec<CharacterSummary>> {
    ensure_storage_ready()?;
    let connection = open_chats_db()?;
    let mut statement = connection
        .prepare(
            "
            SELECT
                c.avatar,
                c.name,
                c.description,
                c.personality,
                c.scenario,
                c.first_mes,
                c.mes_example,
                c.system_prompt,
                c.post_history_instructions,
                c.alternate_greetings_json,
                c.date_last_chat,
                COALESCE((SELECT COUNT(*) FROM chat_sessions s WHERE s.avatar = c.avatar), 0) AS chat_size
            FROM characters c
            ORDER BY COALESCE(c.date_last_chat, 0) DESC, c.name ASC
            ",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            let alternate_greetings_json: String = row.get(9)?;
            let alternate_greetings =
                serde_json::from_str::<Vec<String>>(&alternate_greetings_json).unwrap_or_default();
            Ok(CharacterSummary {
                avatar: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                personality: row.get(3)?,
                scenario: row.get(4)?,
                first_mes: row.get(5)?,
                mes_example: row.get(6)?,
                system_prompt: row.get(7)?,
                post_history_instructions: row.get(8)?,
                alternate_greetings,
                date_last_chat: row.get(10)?,
                chat_size: row.get::<_, i64>(11)? as usize,
            })
        })
        .map_err(|error| error.to_string())?;

    let mut characters = Vec::new();
    for row in rows {
        characters.push(row.map_err(|error| error.to_string())?);
    }
    Ok(characters)
}

pub fn fetch_character_chats(avatar_url: &str) -> StorageResult<Vec<CharacterChatSummary>> {
    ensure_storage_ready()?;
    let avatar = resolve_avatar_file_name(avatar_url);
    let connection = open_chats_db()?;
    let mut statement = connection
        .prepare(
            "
            SELECT file_name, file_size, last_mes, preview, message_count, session_id
            FROM chat_sessions
            WHERE avatar = ?1
            ORDER BY COALESCE(last_mes, 0) DESC, file_name ASC
            ",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![avatar], |row| {
            Ok(CharacterChatSummary {
                file_id: row.get(5)?,
                file_name: row.get(0)?,
                file_size: row.get::<_, i64>(1)?.to_string(),
                last_mes: row.get(2)?,
                mes: row.get(3)?,
                chat_items: row.get::<_, i64>(4)? as usize,
            })
        })
        .map_err(|error| error.to_string())?;

    let mut chats = Vec::new();
    for row in rows {
        chats.push(row.map_err(|error| error.to_string())?);
    }
    Ok(chats)
}

pub fn fetch_session_summaries(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
) -> StorageResult<Vec<SessionSummaryRecord>> {
    let connection = open_chats_db()?;
    let raw_avatar = avatar_url.map(str::trim).filter(|value| !value.is_empty());
    let resolved_avatar = raw_avatar.map(resolve_avatar_file_name);
    let mut statement = connection
        .prepare(
            "
            SELECT id, avatar_url, file_name, summary_kind, content, source_signature, source_message_start, source_message_end, updated_at
            FROM session_summaries
            WHERE (?1 IS NULL OR avatar_url = ?1 OR avatar_url = ?2)
              AND (?3 IS NULL OR file_name = ?3)
            ORDER BY updated_at DESC, summary_kind ASC
            ",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![raw_avatar, resolved_avatar, file_name], |row| {
            Ok(SessionSummaryRecord {
                avatar_url: row.get(1)?,
                content: row.get(4)?,
                file_name: row.get(2)?,
                id: row.get(0)?,
                source_signature: row.get(5)?,
                source_message_end: row.get(7)?,
                source_message_start: row.get(6)?,
                summary_kind: row.get(3)?,
                updated_at: row.get::<_, i64>(8)?.max(0) as u64,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

pub fn save_session_summary(
    payload: SaveSessionSummaryPayload,
) -> StorageResult<SessionSummaryRecord> {
    let connection = open_chats_db()?;
    let now = now_millis();
    let summary_id = payload
        .id
        .unwrap_or_else(|| format!("summary::{}::{}", payload.summary_kind.trim(), now));

    connection
        .execute(
            "
            INSERT INTO session_summaries (
                id, avatar_url, file_name, summary_kind, content, source_signature, source_message_start, source_message_end, updated_at, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
            ON CONFLICT(id) DO UPDATE SET
                avatar_url = excluded.avatar_url,
                file_name = excluded.file_name,
                summary_kind = excluded.summary_kind,
                content = excluded.content,
                source_signature = excluded.source_signature,
                source_message_start = excluded.source_message_start,
                source_message_end = excluded.source_message_end,
                updated_at = excluded.updated_at
            ",
            params![
                summary_id,
                payload.avatar_url,
                payload.file_name,
                payload.summary_kind,
                payload.content,
                payload.source_signature,
                payload.source_message_start,
                payload.source_message_end,
                now,
            ],
        )
        .map_err(|error| error.to_string())?;

    connection
        .query_row(
            "
            SELECT id, avatar_url, file_name, summary_kind, content, source_signature, source_message_start, source_message_end, updated_at
            FROM session_summaries
            WHERE id = ?1
            ",
            params![summary_id],
            |row| {
                Ok(SessionSummaryRecord {
                    avatar_url: row.get(1)?,
                    content: row.get(4)?,
                    file_name: row.get(2)?,
                    id: row.get(0)?,
                    source_signature: row.get(5)?,
                    source_message_end: row.get(7)?,
                    source_message_start: row.get(6)?,
                    summary_kind: row.get(3)?,
                    updated_at: row.get::<_, i64>(8)?.max(0) as u64,
                })
            },
        )
        .map_err(|error| error.to_string())
}

pub fn delete_session_summary(payload: DeleteSessionSummaryPayload) -> StorageResult<usize> {
    let connection = open_chats_db()?;

    if let Some(id) = payload
        .id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return connection
            .execute(
                "
                DELETE FROM session_summaries
                WHERE id = ?1
                ",
                params![id],
            )
            .map_err(|error| error.to_string());
    }

    let raw_avatar = payload
        .avatar_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let resolved_avatar = raw_avatar.map(resolve_avatar_file_name);
    connection
        .execute(
            "
            DELETE FROM session_summaries
            WHERE (?1 IS NULL OR avatar_url = ?1 OR avatar_url = ?2)
              AND (?3 IS NULL OR file_name = ?3)
            ",
            params![raw_avatar, resolved_avatar, payload.file_name],
        )
        .map_err(|error| error.to_string())
}

pub fn save_character(payload: SaveCharacterPayload) -> StorageResult<CharacterSummary> {
    ensure_storage_ready()?;
    let connection = open_chats_db()?;
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("Character name is required.".to_string());
    }

    let avatar = match payload.avatar {
        Some(existing) if !existing.trim().is_empty() => existing.trim().to_string(),
        _ => generate_character_avatar_id(&connection, name)?,
    };
    if let Some(avatar_data_url) = payload.avatar_data_url.as_deref() {
        write_avatar_png(&avatar, avatar_data_url)?;
    }
    let alternate_greetings_json =
        serde_json::to_string(&payload.alternate_greetings.unwrap_or_default())
            .map_err(|error| error.to_string())?;
    let now = now_millis();
    let existing_date_added = connection
        .query_row(
            "SELECT date_added FROM characters WHERE avatar = ?1",
            params![avatar.clone()],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .flatten();

    connection
        .execute(
            "
            INSERT INTO characters(
                avatar, avatar_path, name, description, personality, scenario,
                first_mes, mes_example, system_prompt, post_history_instructions,
                alternate_greetings_json, chat, create_date, data_size, date_added, date_last_chat
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, NULL, NULL, ?12, NULL)
            ON CONFLICT(avatar) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                personality = excluded.personality,
                scenario = excluded.scenario,
                first_mes = excluded.first_mes,
                mes_example = excluded.mes_example,
                system_prompt = excluded.system_prompt,
                post_history_instructions = excluded.post_history_instructions,
                alternate_greetings_json = excluded.alternate_greetings_json
            ",
            params![
                avatar.clone(),
                data_root()
                    .join("characters")
                    .join(&avatar)
                    .to_string_lossy()
                    .to_string(),
                name,
                payload.description.unwrap_or_default(),
                payload.personality.unwrap_or_default(),
                payload.scenario.unwrap_or_default(),
                payload.first_mes.unwrap_or_default(),
                payload.mes_example.unwrap_or_default(),
                payload.system_prompt.unwrap_or_default(),
                payload.post_history_instructions.unwrap_or_default(),
                alternate_greetings_json,
                existing_date_added.unwrap_or(now)
            ],
        )
        .map_err(|error| error.to_string())?;

    connection
        .query_row(
            "
            SELECT
                c.avatar,
                c.name,
                c.description,
                c.personality,
                c.scenario,
                c.first_mes,
                c.mes_example,
                c.system_prompt,
                c.post_history_instructions,
                c.alternate_greetings_json,
                c.date_last_chat,
                COALESCE((SELECT COUNT(*) FROM chat_sessions s WHERE s.avatar = c.avatar), 0) AS chat_size
            FROM characters c
            WHERE c.avatar = ?1
            ",
            params![avatar],
            |row| {
                let alternate_greetings_json: String = row.get(9)?;
                let alternate_greetings =
                    serde_json::from_str::<Vec<String>>(&alternate_greetings_json).unwrap_or_default();
                Ok(CharacterSummary {
                    avatar: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    personality: row.get(3)?,
                    scenario: row.get(4)?,
                    first_mes: row.get(5)?,
                    mes_example: row.get(6)?,
                    system_prompt: row.get(7)?,
                    post_history_instructions: row.get(8)?,
                    alternate_greetings,
                    date_last_chat: row.get(10)?,
                    chat_size: row.get::<_, i64>(11)? as usize,
                })
            },
        )
        .map_err(|error| error.to_string())
}

pub(crate) fn session_id_for(avatar: &str, file_name: &str) -> String {
    format!("{avatar}::{file_name}")
}

fn generate_character_avatar_id(connection: &Connection, name: &str) -> StorageResult<String> {
    let base = sanitize_character_slug(name);
    let mut candidate = format!("{base}.png");
    let mut index = 2;

    loop {
        let exists = connection
            .query_row(
                "SELECT 1 FROM characters WHERE avatar = ?1 LIMIT 1",
                params![candidate.clone()],
                |_| Ok(()),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .is_some();

        if !exists {
            return Ok(candidate);
        }

        candidate = format!("{base}-{index}.png");
        index += 1;
    }
}

fn sanitize_character_slug(name: &str) -> String {
    let mut value = String::with_capacity(name.len());
    for character in name.chars() {
        if character.is_ascii_alphanumeric() {
            value.push(character.to_ascii_lowercase());
        } else if !value.ends_with('-') {
            value.push('-');
        }
    }

    let trimmed = value.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "character".to_string()
    } else {
        trimmed
    }
}

fn write_avatar_png(avatar: &str, data_url: &str) -> StorageResult<()> {
    let (header, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "Invalid avatar data URL.".to_string())?;
    if !header.starts_with("data:image/png;base64") {
        return Err("Avatar upload currently expects PNG data.".to_string());
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .map_err(|error| error.to_string())?;
    let avatar_path = data_root().join("characters").join(avatar);
    if let Some(parent) = avatar_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(avatar_path, bytes).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn fetch_chat(avatar_url: &str, file_name: &str) -> StorageResult<Vec<Value>> {
    ensure_storage_ready()?;
    let avatar = resolve_avatar_file_name(avatar_url);
    let session_id = session_id_for(&avatar, file_name);
    let connection = open_chats_db()?;
    let mut statement = connection
        .prepare(
            "
            SELECT payload_json
            FROM chat_messages
            WHERE session_id = ?1
            ORDER BY ordinal ASC
            ",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![session_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    let mut messages = Vec::new();
    for row in rows {
        let payload = row.map_err(|error| error.to_string())?;
        messages.push(serde_json::from_str::<Value>(&payload).map_err(|error| error.to_string())?);
    }
    Ok(messages)
}

pub fn save_chat(avatar_url: &str, file_name: &str, chat: &[Value]) -> StorageResult<()> {
    ensure_storage_ready()?;
    let avatar = resolve_avatar_file_name(avatar_url);
    let connection = open_chats_db()?;

    connection
        .execute(
            "
            INSERT OR IGNORE INTO characters(
                avatar, avatar_path, name, description, personality, scenario,
                first_mes, mes_example, system_prompt, post_history_instructions,
                alternate_greetings_json, chat, create_date, data_size, date_added, date_last_chat
            ) VALUES (?1, ?2, ?3, '', '', '', '', '', '', '', '[]', NULL, NULL, NULL, ?4, ?4)
            ",
            params![
                avatar,
                data_root()
                    .join("characters")
                    .join(resolve_avatar_file_name(avatar_url))
                    .to_string_lossy()
                    .to_string(),
                normalize_character_name(
                    Path::new(avatar_url)
                        .file_stem()
                        .and_then(|value| value.to_str())
                        .unwrap_or("Character")
                ),
                now_millis()
            ],
        )
        .map_err(|error| error.to_string())?;

    save_chat_internal(
        &connection,
        &resolve_avatar_file_name(avatar_url),
        file_name,
        chat,
        Some(now_millis()),
    )?;
    Ok(())
}

pub fn delete_chat(avatar_url: &str, file_name: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let avatar = resolve_avatar_file_name(avatar_url);
    let session_id = session_id_for(&avatar, file_name);
    let connection = open_chats_db()?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "DELETE FROM chat_messages WHERE session_id = ?1",
            params![session_id.clone()],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM chat_sessions WHERE session_id = ?1",
            params![session_id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM trace_entries WHERE session_id = ?1",
            params![session_id_for(&avatar, file_name)],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "
            DELETE FROM session_summaries
            WHERE (avatar_url = ?1 OR avatar_url = ?2) AND file_name = ?3
            ",
            params![avatar_url, avatar.clone(), file_name],
        )
        .map_err(|error| error.to_string())?;
    retrieval::delete_retrieval_jobs_for_source("generation_context", file_name)?;

    let latest_remaining = transaction
        .query_row(
            "SELECT MAX(last_mes) FROM chat_sessions WHERE avatar = ?1",
            params![avatar.clone()],
            |row| row.get::<_, Option<i64>>(0),
        )
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "UPDATE characters SET date_last_chat = ?2 WHERE avatar = ?1",
            params![avatar, latest_remaining],
        )
        .map_err(|error| error.to_string())?;

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn rename_chat(avatar_url: &str, file_name: &str, next_file_name: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let avatar = resolve_avatar_file_name(avatar_url);
    let next_name = next_file_name.trim();
    if next_name.is_empty() {
        return Err("新的会话名称不能为空。".to_string());
    }

    let current_session_id = session_id_for(&avatar, file_name);
    let next_session_id = session_id_for(&avatar, next_name);
    let connection = open_chats_db()?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;

    let exists = transaction
        .query_row(
            "SELECT 1 FROM chat_sessions WHERE session_id = ?1 LIMIT 1",
            params![next_session_id.clone()],
            |_| Ok(()),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .is_some();
    if exists {
        return Err("已存在同名会话。".to_string());
    }

    transaction
        .execute(
            "
            UPDATE chat_sessions
            SET session_id = ?1, file_name = ?2, display_name = ?3
            WHERE session_id = ?4
            ",
            params![
                next_session_id.clone(),
                next_name,
                strip_chat_suffix(next_name),
                current_session_id.clone()
            ],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE chat_messages SET session_id = ?1 WHERE session_id = ?2",
            params![next_session_id, current_session_id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "
            UPDATE trace_entries
            SET session_id = ?1, file_name = ?2
            WHERE session_id = ?3
            ",
            params![
                session_id_for(&avatar, next_name),
                next_name,
                session_id_for(&avatar, file_name)
            ],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "
            UPDATE session_summaries
            SET file_name = ?1
            WHERE (avatar_url = ?2 OR avatar_url = ?3) AND file_name = ?4
            ",
            params![next_name, avatar_url, avatar, file_name],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    retrieval::rename_retrieval_jobs_source("generation_context", file_name, next_name)?;
    Ok(())
}

pub fn duplicate_chat(
    avatar_url: &str,
    file_name: &str,
    next_file_name: &str,
) -> StorageResult<()> {
    ensure_storage_ready()?;
    let messages = fetch_chat(avatar_url, file_name)?;
    save_chat(avatar_url, next_file_name, &messages)?;
    let summaries = fetch_session_summaries(Some(avatar_url), Some(file_name))?;
    for summary in summaries {
        save_session_summary(SaveSessionSummaryPayload {
            avatar_url: Some(avatar_url.to_string()),
            content: summary.content,
            file_name: Some(next_file_name.to_string()),
            id: None,
            source_signature: summary.source_signature,
            source_message_end: summary.source_message_end,
            source_message_start: summary.source_message_start,
            summary_kind: summary.summary_kind,
        })?;
    }
    Ok(())
}

pub fn export_chat(avatar_url: &str, file_name: &str, format: &str) -> StorageResult<String> {
    ensure_storage_ready()?;
    let messages = fetch_chat(avatar_url, file_name)?;
    if messages.is_empty() {
        return Err("当前会话没有可导出的消息。".to_string());
    }

    let normalized_format = match format.trim().to_ascii_lowercase().as_str() {
        "json" => "json",
        _ => "jsonl",
    };
    let export_root = exports_dir();
    fs::create_dir_all(&export_root).map_err(|error| error.to_string())?;

    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("chat");
    let export_name = format!("{stem}-export-{}.{}", now_millis(), normalized_format);
    let export_path = export_root.join(export_name);

    let payload = if normalized_format == "json" {
        serde_json::to_string_pretty(&messages).map_err(|error| error.to_string())?
    } else {
        let mut lines = Vec::with_capacity(messages.len());
        for message in &messages {
            lines.push(serde_json::to_string(message).map_err(|error| error.to_string())?);
        }
        format!("{}\n", lines.join("\n"))
    };

    fs::write(&export_path, payload).map_err(|error| error.to_string())?;
    Ok(export_path.to_string_lossy().to_string())
}

pub fn save_trace_entry(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    character_name: Option<&str>,
    provider: &str,
    model: Option<&str>,
    prompt_text: Option<&str>,
    request_payload: Option<&str>,
    response_text: Option<&str>,
    error_text: Option<&str>,
    token_count: Option<u64>,
    duration_ms: Option<u64>,
) -> StorageResult<()> {
    ensure_storage_ready()?;
    let connection = open_chats_db()?;
    let avatar = avatar_url
        .map(resolve_avatar_file_name)
        .filter(|value| !value.trim().is_empty());
    let session_id = match (&avatar, file_name) {
        (Some(avatar), Some(file_name)) if !file_name.trim().is_empty() => {
            Some(session_id_for(avatar, file_name))
        }
        _ => None,
    };
    let created_at = now_millis();
    let id = format!(
        "{}-{}",
        created_at,
        provider
            .chars()
            .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_')
            .collect::<String>()
    );

    connection
        .execute(
            "
            INSERT INTO trace_entries(
                id, session_id, avatar, file_name, character_name, provider, model,
                prompt_text, request_payload, response_text, error_text, token_count,
                duration_ms, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ",
            params![
                id,
                session_id,
                avatar,
                file_name.map(str::trim).filter(|value| !value.is_empty()),
                character_name.unwrap_or("").trim(),
                provider.trim(),
                model.map(str::trim).filter(|value| !value.is_empty()),
                prompt_text.map(str::to_string),
                request_payload.map(str::to_string),
                response_text.map(str::to_string),
                error_text.map(str::to_string),
                token_count.map(|value| value as i64),
                duration_ms.map(|value| value as i64),
                created_at
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn save_narrative_memories(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    character_name: Option<&str>,
    summary: &str,
    candidate_memories: &[NarrativeMemoryRecord],
) -> StorageResult<usize> {
    memory::save_narrative_memories(
        avatar_url,
        file_name,
        character_name,
        summary,
        candidate_memories,
    )
}

pub fn fetch_narrative_memory_candidates(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    query: Option<&str>,
    limit: usize,
) -> StorageResult<Vec<NarrativeMemoryCandidateEntry>> {
    memory::fetch_narrative_memory_candidates(avatar_url, file_name, query, limit)
}

pub fn review_narrative_memory_candidate(candidate_id: &str, action: &str) -> StorageResult<()> {
    memory::review_narrative_memory_candidate(candidate_id, action)
}

pub fn delete_narrative_memory(memory_id: &str) -> StorageResult<()> {
    memory::delete_narrative_memory(memory_id)?;
    retrieval::delete_narrative_memory_artifacts(memory_id)?;
    Ok(())
}

pub fn delete_narrative_memory_candidate(candidate_id: &str) -> StorageResult<()> {
    memory::delete_narrative_memory_candidate(candidate_id)
}

pub fn save_memory_hits(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    query_text: &str,
    hits: &[NarrativeMemoryEntry],
) -> StorageResult<()> {
    memory::save_memory_hits(avatar_url, file_name, query_text, hits)
}

pub fn fetch_memory_hits(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    query: Option<&str>,
    limit: usize,
) -> StorageResult<Vec<NarrativeMemoryHitEntry>> {
    memory::fetch_memory_hits(avatar_url, file_name, query, limit)
}

pub fn clear_memory_hits(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    query: Option<&str>,
) -> StorageResult<()> {
    memory::clear_memory_hits(avatar_url, file_name, query)
}

pub fn fetch_narrative_memories(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    query: Option<&str>,
    limit: usize,
) -> StorageResult<Vec<NarrativeMemoryEntry>> {
    memory::fetch_narrative_memories(avatar_url, file_name, query, limit)
}

pub fn fetch_world_state_snapshot(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
) -> StorageResult<Option<WorldStateSnapshotEntry>> {
    world_state::fetch_world_state_snapshot(avatar_url, file_name)
}

pub fn rebuild_world_state_snapshot(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    lorebook_name: Option<&str>,
) -> StorageResult<WorldStateSnapshotEntry> {
    let documents = fetch_library_documents("worlds")?;
    let active_world_names = if lorebook_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_none()
    {
        Some(read_active_world_names()?)
    } else {
        None
    };
    let documents = if let Some(active_world_names) = active_world_names {
        if active_world_names.is_empty() {
            Vec::new()
        } else {
            let active_lookup = active_world_names
                .iter()
                .collect::<std::collections::HashSet<_>>();
            documents
                .into_iter()
                .filter(|document| active_lookup.contains(&document.name))
                .collect()
        }
    } else {
        documents
    };
    world_state::rebuild_world_state_snapshot(avatar_url, file_name, lorebook_name, &documents)
}

pub fn apply_world_state_updates(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    updates: &[WorldStateUpdateRecord],
) -> StorageResult<WorldStateSnapshotEntry> {
    world_state::apply_world_state_updates(avatar_url, file_name, updates)
}

pub fn read_narrative_memory_embedding(
    memory_id: &str,
    model: &str,
    source_updated_at: u64,
) -> StorageResult<Option<Vec<f64>>> {
    retrieval::read_narrative_memory_embedding(memory_id, model, source_updated_at)
}

pub fn upsert_narrative_memory_embedding(
    memory_id: &str,
    model: &str,
    vector: &[f64],
    source_updated_at: u64,
) -> StorageResult<()> {
    retrieval::upsert_narrative_memory_embedding(memory_id, model, vector, source_updated_at)
}

pub(crate) fn is_cjk(character: char) -> bool {
    matches!(
        character,
        '\u{4E00}'..='\u{9FFF}'
            | '\u{3400}'..='\u{4DBF}'
            | '\u{3040}'..='\u{309F}'
            | '\u{30A0}'..='\u{30FF}'
            | '\u{AC00}'..='\u{D7AF}'
    )
}

pub fn fetch_trace_entries(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    limit: usize,
) -> StorageResult<Vec<TraceEntryRecord>> {
    ensure_storage_ready()?;
    let connection = open_chats_db()?;
    let session_id = match (avatar_url, file_name) {
        (Some(avatar_url), Some(file_name)) if !file_name.trim().is_empty() => Some(
            session_id_for(&resolve_avatar_file_name(avatar_url), file_name),
        ),
        _ => None,
    };

    let query = if session_id.is_some() {
        "
        SELECT id, session_id, avatar, file_name, character_name, provider, model,
               prompt_text, request_payload, response_text, error_text, token_count,
               duration_ms, created_at
        FROM trace_entries
        WHERE session_id = ?1
        ORDER BY created_at DESC, id DESC
        LIMIT ?2
        "
    } else {
        "
        SELECT id, session_id, avatar, file_name, character_name, provider, model,
               prompt_text, request_payload, response_text, error_text, token_count,
               duration_ms, created_at
        FROM trace_entries
        ORDER BY created_at DESC, id DESC
        LIMIT ?1
        "
    };

    let mut statement = connection
        .prepare(query)
        .map_err(|error| error.to_string())?;
    let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<TraceEntryRecord> {
        Ok(TraceEntryRecord {
            avatar_url: row.get::<_, Option<String>>(2)?,
            character_name: row.get(4)?,
            created_at: row.get::<_, i64>(13)? as u64,
            duration_ms: row.get::<_, Option<i64>>(12)?.map(|value| value as u64),
            error_text: row.get(10)?,
            file_name: row.get(3)?,
            id: row.get(0)?,
            model: row.get(6)?,
            prompt_text: row.get(7)?,
            provider: row.get(5)?,
            request_payload: row.get(8)?,
            response_text: row.get(9)?,
            session_id: row.get(1)?,
            token_count: row.get::<_, Option<i64>>(11)?.map(|value| value as u64),
        })
    };

    let rows = if let Some(session_id) = session_id {
        statement
            .query_map(params![session_id, limit as i64], map_row)
            .map_err(|error| error.to_string())?
    } else {
        statement
            .query_map(params![limit as i64], map_row)
            .map_err(|error| error.to_string())?
    };

    let mut traces = Vec::new();
    for row in rows {
        traces.push(row.map_err(|error| error.to_string())?);
    }
    Ok(traces)
}

pub fn clear_trace_entries(avatar_url: Option<&str>, file_name: Option<&str>) -> StorageResult<()> {
    ensure_storage_ready()?;
    let connection = open_chats_db()?;
    match (avatar_url, file_name) {
        (Some(avatar_url), Some(file_name)) if !file_name.trim().is_empty() => {
            let session_id = session_id_for(&resolve_avatar_file_name(avatar_url), file_name);
            connection
                .execute(
                    "DELETE FROM trace_entries WHERE session_id = ?1",
                    params![session_id],
                )
                .map_err(|error| error.to_string())?;
        }
        _ => {
            connection
                .execute("DELETE FROM trace_entries", [])
                .map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

pub fn export_trace_entries(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
) -> StorageResult<String> {
    let traces = fetch_trace_entries(avatar_url, file_name, 200)?;
    let export_root = exports_dir();
    fs::create_dir_all(&export_root).map_err(|error| error.to_string())?;
    let export_name = format!("trace-export-{}.json", now_millis());
    let export_path = export_root.join(export_name);
    let payload = serde_json::to_string_pretty(&traces).map_err(|error| error.to_string())?;
    fs::write(&export_path, payload).map_err(|error| error.to_string())?;
    Ok(export_path.to_string_lossy().to_string())
}

pub fn fetch_eval_runs(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    limit: usize,
) -> StorageResult<Vec<EvalRunEntry>> {
    ensure_storage_ready()?;
    let connection = open_evals_db()?;
    let session_id = match (avatar_url, file_name) {
        (Some(avatar_url), Some(file_name)) if !file_name.trim().is_empty() => Some(
            session_id_for(&resolve_avatar_file_name(avatar_url), file_name),
        ),
        _ => None,
    };

    let query = if session_id.is_some() {
        "
        SELECT id, avatar, file_name, character_name, overall_score, setting_consistency,
               memory_hit_rate, state_update_correctness, reply_continuity, notes_json,
               created_at, updated_at
        FROM eval_runs
        WHERE session_id = ?1
        ORDER BY created_at DESC, id DESC
        LIMIT ?2
        "
    } else {
        "
        SELECT id, avatar, file_name, character_name, overall_score, setting_consistency,
               memory_hit_rate, state_update_correctness, reply_continuity, notes_json,
               created_at, updated_at
        FROM eval_runs
        ORDER BY created_at DESC, id DESC
        LIMIT ?1
        "
    };

    let mut statement = connection
        .prepare(query)
        .map_err(|error| error.to_string())?;
    let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<EvalRunEntry> {
        let notes_json: String = row.get(9)?;
        let notes = serde_json::from_str::<Vec<String>>(&notes_json).unwrap_or_default();
        Ok(EvalRunEntry {
            id: row.get(0)?,
            avatar_url: row.get(1)?,
            file_name: row.get(2)?,
            character_name: row.get(3)?,
            overall_score: row.get(4)?,
            setting_consistency: row.get(5)?,
            memory_hit_rate: row.get(6)?,
            state_update_correctness: row.get(7)?,
            reply_continuity: row.get(8)?,
            notes,
            created_at: row.get::<_, i64>(10)? as u64,
            updated_at: row.get::<_, i64>(11)? as u64,
        })
    };

    let rows = if let Some(session_id) = session_id {
        statement
            .query_map(params![session_id, limit as i64], map_row)
            .map_err(|error| error.to_string())?
    } else {
        statement
            .query_map(params![limit as i64], map_row)
            .map_err(|error| error.to_string())?
    };

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn run_local_eval(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
) -> StorageResult<EvalRunEntry> {
    ensure_storage_ready()?;
    let (avatar, file_name) = match (avatar_url, file_name) {
        (Some(avatar_url), Some(file_name)) if !file_name.trim().is_empty() => (
            Some(resolve_avatar_file_name(avatar_url)),
            Some(file_name.trim().to_string()),
        ),
        _ => (None, None),
    };

    let character_name = avatar
        .as_deref()
        .map(fetch_character_name_by_avatar)
        .transpose()?;
    let messages = match (&avatar, &file_name) {
        (Some(avatar), Some(file_name)) => fetch_chat(avatar, file_name)?,
        _ => Vec::new(),
    };
    let traces = fetch_trace_entries(avatar.as_deref(), file_name.as_deref(), 8)?;
    let has_world_state =
        fetch_world_state_snapshot(avatar.as_deref(), file_name.as_deref())?.is_some();
    let now_ms = now_millis() as u64;
    let eval_run = evals::evaluate_local_session(
        LocalEvalInput {
            avatar_url: avatar.clone(),
            file_name: file_name.clone(),
            character_name,
            messages,
            traces,
            has_world_state,
        },
        now_ms,
    );
    save_eval_run(&eval_run, avatar.as_deref(), file_name.as_deref())?;
    Ok(eval_run)
}

fn save_eval_run(
    eval_run: &EvalRunEntry,
    avatar: Option<&str>,
    file_name: Option<&str>,
) -> StorageResult<()> {
    let connection = open_evals_db()?;
    let session_id = match (avatar, file_name) {
        (Some(avatar), Some(file_name)) if !file_name.trim().is_empty() => {
            Some(session_id_for(avatar, file_name))
        }
        _ => None,
    };
    let notes_json = serde_json::to_string(&eval_run.notes).map_err(|error| error.to_string())?;
    connection
        .execute(
            "
            INSERT OR REPLACE INTO eval_runs(
                id, session_id, avatar, file_name, character_name, overall_score,
                setting_consistency, memory_hit_rate, state_update_correctness,
                reply_continuity, notes_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            ",
            params![
                eval_run.id,
                session_id,
                avatar,
                file_name,
                eval_run.character_name,
                eval_run.overall_score,
                eval_run.setting_consistency,
                eval_run.memory_hit_rate,
                eval_run.state_update_correctness,
                eval_run.reply_continuity,
                notes_json,
                eval_run.created_at as i64,
                eval_run.updated_at as i64,
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn fetch_character_name_by_avatar(avatar: &str) -> StorageResult<String> {
    let connection = open_chats_db()?;
    connection
        .query_row(
            "SELECT name FROM characters WHERE avatar = ?1",
            params![avatar],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("找不到对应角色: {avatar}"))
}

pub fn export_library_document(domain: &str, name: &str, format: &str) -> StorageResult<String> {
    ensure_storage_ready()?;
    let connection = open_library_db()?;
    let normalized_domain = domain.trim();
    let normalized_name = name.trim();

    let record = connection
        .query_row(
            "
            SELECT kind, content_text, disabled, tags_json, updated_at
            FROM library_entries
            WHERE domain = ?1 AND name = ?2
            ",
            params![normalized_domain, normalized_name],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, i64>(2)? != 0,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<i64>>(4)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;

    let Some((kind, content_text, disabled, tags_json, updated_at)) = record else {
        return Err("未找到可导出的资源。".to_string());
    };

    let normalized_format = match format.trim().to_ascii_lowercase().as_str() {
        "json" => "json",
        _ => "json",
    };
    let export_root = exports_dir();
    fs::create_dir_all(&export_root).map_err(|error| error.to_string())?;

    let safe_stem = normalized_name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    let export_name = format!(
        "{}-{}-export-{}.{}",
        normalized_domain,
        if safe_stem.trim().is_empty() {
            "document"
        } else {
            safe_stem.trim()
        },
        now_millis(),
        normalized_format
    );
    let export_path = export_root.join(export_name);

    let payload = serde_json::to_string_pretty(&serde_json::json!({
        "domain": normalized_domain,
        "name": normalized_name,
        "kind": kind,
        "disabled": disabled,
        "tags": serde_json::from_str::<Value>(&tags_json).unwrap_or_else(|_| Value::Array(vec![])),
        "updated_at": updated_at,
        "content": content_text.as_deref().and_then(|value| serde_json::from_str::<Value>(value).ok()).unwrap_or_else(|| {
            content_text.map(Value::String).unwrap_or(Value::Null)
        })
    }))
    .map_err(|error| error.to_string())?;

    fs::write(&export_path, payload).map_err(|error| error.to_string())?;
    Ok(export_path.to_string_lossy().to_string())
}

pub fn create_backup() -> StorageResult<LibraryDocument> {
    ensure_storage_ready()?;
    let timestamp = now_millis();
    let backup_name = format!("backup-{timestamp}");
    let backup_root = backups_dir().join(&backup_name);
    let backup_db_dir = backup_root.join("db");
    let backup_characters_dir = backup_root.join("characters");
    fs::create_dir_all(&backup_db_dir).map_err(|error| error.to_string())?;

    let db_files = vec![
        settings_db_path(),
        library_db_path(),
        chats_db_path(),
        secrets_db_path(),
    ];
    let mut copied_files = Vec::new();
    let mut total_size = 0u64;
    for path in db_files {
        if path.exists() {
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| "Invalid backup file name".to_string())?;
            let target_path = backup_db_dir.join(file_name);
            fs::copy(&path, &target_path).map_err(|error| error.to_string())?;
            total_size += fs::metadata(&target_path)
                .map_err(|error| error.to_string())?
                .len();
            copied_files.push(file_name.to_string());
        }
    }

    let source_characters_dir = data_root().join("characters");
    let character_files = if source_characters_dir.exists() {
        copy_dir_recursive(&source_characters_dir, &backup_characters_dir)?
    } else {
        0usize
    };
    let copied_file_count = copied_files.len();

    let manifest = serde_json::json!({
        "created_at": timestamp,
        "db_files": copied_files.clone(),
        "character_files": character_files,
        "backup_root": backup_root.to_string_lossy(),
    });
    let manifest_text =
        serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?;
    fs::write(backup_root.join("manifest.json"), &manifest_text)
        .map_err(|error| error.to_string())?;

    let connection = open_library_db()?;
    connection
        .execute(
            "
            INSERT INTO library_entries(
                domain, name, kind, content_text, disabled, item_count, note,
                size_bytes, updated_at, source_path, tags_json
            ) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(domain, name) DO UPDATE SET
                kind = excluded.kind,
                content_text = excluded.content_text,
                disabled = 0,
                item_count = excluded.item_count,
                note = excluded.note,
                size_bytes = excluded.size_bytes,
                updated_at = excluded.updated_at,
                source_path = excluded.source_path,
                tags_json = excluded.tags_json
            ",
            params![
                "backups",
                backup_name,
                "backup",
                manifest_text,
                copied_file_count as i64,
                format!(
                    "{} db files · {} avatars",
                    copied_file_count, character_files
                ),
                total_size as i64,
                timestamp,
                backup_root.to_string_lossy().to_string(),
                serde_json::to_string(&vec!["backup", "snapshot"])
                    .map_err(|error| error.to_string())?
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(LibraryDocument {
        content_text: Some(manifest.to_string()),
        disabled: false,
        domain: "backups".to_string(),
        kind: "backup".to_string(),
        name: format!("backup-{timestamp}"),
        tags: vec!["backup".to_string(), "snapshot".to_string()],
        updated_at: Some(timestamp as u64),
    })
}

pub fn restore_backup(name: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let source_path = {
        let connection = open_library_db()?;
        connection
            .query_row(
                "SELECT source_path FROM library_entries WHERE domain = 'backups' AND name = ?1",
                params![name.trim()],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .flatten()
            .ok_or_else(|| "未找到可恢复的备份。".to_string())?
    };

    let backup_root = PathBuf::from(source_path);
    if !backup_root.exists() {
        return Err("备份目录已不存在。".to_string());
    }

    let backup_db_dir = backup_root.join("db");
    if !backup_db_dir.exists() {
        return Err("备份缺少数据库目录。".to_string());
    }

    let target_db_dir = db_dir();
    fs::create_dir_all(&target_db_dir).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(&backup_db_dir).map_err(|error| error.to_string())? {
        let item = entry.map_err(|error| error.to_string())?;
        let source = item.path();
        if source.is_file() {
            let target = target_db_dir.join(
                source
                    .file_name()
                    .ok_or_else(|| "Invalid backup database file".to_string())?,
            );
            fs::copy(&source, &target).map_err(|error| error.to_string())?;
        }
    }

    let backup_characters_dir = backup_root.join("characters");
    let target_characters_dir = data_root().join("characters");
    if target_characters_dir.exists() {
        fs::remove_dir_all(&target_characters_dir).map_err(|error| error.to_string())?;
    }
    if backup_characters_dir.exists() {
        copy_dir_recursive(&backup_characters_dir, &target_characters_dir)?;
    } else {
        fs::create_dir_all(&target_characters_dir).map_err(|error| error.to_string())?;
    }

    Ok(())
}

pub fn delete_character(avatar_url: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let avatar = resolve_avatar_file_name(avatar_url);
    let connection = open_chats_db()?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;

    let mut statement = transaction
        .prepare("SELECT session_id FROM chat_sessions WHERE avatar = ?1")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![avatar.clone()], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    let mut session_ids = Vec::new();
    for row in rows {
        session_ids.push(row.map_err(|error| error.to_string())?);
    }
    drop(statement);

    for session_id in session_ids {
        transaction
            .execute(
                "DELETE FROM chat_messages WHERE session_id = ?1",
                params![session_id],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction
        .execute(
            "DELETE FROM chat_sessions WHERE avatar = ?1",
            params![avatar.clone()],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM characters WHERE avatar = ?1",
            params![avatar.clone()],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;

    let avatar_path = data_root().join("characters").join(&avatar);
    if avatar_path.exists() {
        fs::remove_file(avatar_path).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn save_chat_internal(
    connection: &Connection,
    avatar: &str,
    file_name: &str,
    chat: &[Value],
    last_mes_override: Option<i64>,
) -> StorageResult<()> {
    let session_id = session_id_for(avatar, file_name);
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM chat_messages WHERE session_id = ?1",
            params![session_id.clone()],
        )
        .map_err(|error| error.to_string())?;

    let preview = chat
        .iter()
        .rev()
        .find_map(|message| message.get("mes").and_then(Value::as_str))
        .unwrap_or("")
        .trim()
        .to_string();
    let chat_metadata = chat
        .first()
        .and_then(|message| message.get("chat_metadata"))
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));
    let chat_metadata_json =
        serde_json::to_string(&chat_metadata).map_err(|error| error.to_string())?;
    let serialized_messages = chat
        .iter()
        .map(serde_json::to_string)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let computed_size = serialized_messages
        .iter()
        .map(|line| line.len() + 1)
        .sum::<usize>() as i64;

    for (index, message) in chat.iter().enumerate() {
        let payload_json = serde_json::to_string(message).map_err(|error| error.to_string())?;
        transaction
            .execute(
                "
                INSERT INTO chat_messages(session_id, ordinal, payload_json, mes_text, send_date, is_user, is_system)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                ",
                params![
                    session_id.clone(),
                    index as i64,
                    payload_json,
                    message.get("mes").and_then(Value::as_str).map(str::to_string),
                    message.get("send_date").and_then(Value::as_str).map(str::to_string),
                    bool_to_i64(message.get("is_user").and_then(Value::as_bool).unwrap_or(false)),
                    bool_to_i64(message.get("is_system").and_then(Value::as_bool).unwrap_or(false))
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    let last_mes = last_mes_override.unwrap_or_else(now_millis);
    transaction
        .execute(
            "
            INSERT INTO chat_sessions(
                session_id, avatar, file_name, display_name, file_size,
                last_mes, preview, message_count, chat_metadata_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(session_id) DO UPDATE SET
                file_name = excluded.file_name,
                display_name = excluded.display_name,
                file_size = excluded.file_size,
                last_mes = excluded.last_mes,
                preview = excluded.preview,
                message_count = excluded.message_count,
                chat_metadata_json = excluded.chat_metadata_json
            ",
            params![
                session_id,
                avatar,
                file_name,
                strip_chat_suffix(file_name),
                computed_size,
                last_mes,
                preview,
                chat.len() as i64,
                chat_metadata_json
            ],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE characters SET date_last_chat = ?2 WHERE avatar = ?1",
            params![avatar, last_mes],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

fn strip_chat_suffix(file_name: &str) -> String {
    let without_extension = file_name
        .strip_suffix(".jsonl")
        .unwrap_or(file_name)
        .trim()
        .to_string();

    let trimmed = without_extension
        .trim_end_matches(|character: char| character.is_ascii_whitespace())
        .to_string();
    let parts = trimmed.rsplitn(2, " - ").collect::<Vec<_>>();
    if parts.len() == 2 && parts[0].len() == 19 {
        return parts[1].to_string();
    }

    without_extension
}

fn normalize_character_name(stem: &str) -> String {
    stem.split_once('_')
        .map(|(_, suffix)| suffix)
        .unwrap_or(stem)
        .replace('_', " ")
}

fn query_library_entries(domain: &str, limit: usize) -> StorageResult<Vec<WorkspaceCatalogEntry>> {
    ensure_storage_ready()?;
    let connection = open_library_db()?;
    let mut statement = connection
        .prepare(
            "
            SELECT name, kind, disabled, item_count, note, size_bytes, updated_at, tags_json
            FROM library_entries
            WHERE domain = ?1
            ORDER BY COALESCE(updated_at, 0) DESC, name ASC
            LIMIT ?2
            ",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![domain, limit as i64], |row| {
            let tags_json: String = row.get(7)?;
            let tags = serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default();
            Ok(WorkspaceCatalogEntry {
                disabled: Some(row.get::<_, i64>(2)? != 0).filter(|value| *value),
                item_count: row.get::<_, Option<i64>>(3)?.map(|value| value as usize),
                kind: row.get(1)?,
                name: row.get(0)?,
                note: row.get(4)?,
                source_avatar: None,
                source_file_name: None,
                size_bytes: row.get::<_, Option<i64>>(5)?.map(|value| value as u64),
                tags,
                updated_at: row.get::<_, Option<i64>>(6)?.map(|value| value as u64),
            })
        })
        .map_err(|error| error.to_string())?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|error| error.to_string())?);
    }
    Ok(entries)
}

fn query_session_entries(limit: usize) -> StorageResult<Vec<WorkspaceCatalogEntry>> {
    ensure_storage_ready()?;
    let connection = open_chats_db()?;
    let mut statement = connection
        .prepare(
            "
            SELECT
                s.file_name,
                s.message_count,
                s.preview,
                s.file_size,
                s.last_mes,
                s.avatar,
                c.name
            FROM chat_sessions s
            LEFT JOIN characters c ON c.avatar = s.avatar
            ORDER BY COALESCE(s.last_mes, 0) DESC, s.file_name ASC
            LIMIT ?1
            ",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![limit as i64], |row| {
            let character_name: Option<String> = row.get(6)?;
            Ok(WorkspaceCatalogEntry {
                disabled: None,
                item_count: Some(row.get::<_, i64>(1)? as usize),
                kind: "chat".to_string(),
                name: row.get(0)?,
                note: row.get(2)?,
                source_avatar: row.get(5)?,
                source_file_name: row.get(0)?,
                size_bytes: Some(row.get::<_, i64>(3)? as u64),
                tags: character_name.into_iter().collect(),
                updated_at: row.get::<_, Option<i64>>(4)?.map(|value| value as u64),
            })
        })
        .map_err(|error| error.to_string())?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|error| error.to_string())?);
    }
    Ok(entries)
}

fn query_count(connection: &Connection, sql: &str) -> StorageResult<usize> {
    connection
        .query_row(sql, [], |row| row.get::<_, i64>(0))
        .map(|value| value as usize)
        .map_err(|error| error.to_string())
}

pub fn fetch_workspace_catalog(
    log_entries: Vec<WorkspaceCatalogEntry>,
    warning_lines: usize,
) -> StorageResult<WorkspaceCatalogPayload> {
    let settings = read_stored_settings_value()?;
    let disabled_extensions = settings
        .get("extension_settings")
        .and_then(|value| value.get("disabledExtensions"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let library = open_library_db()?;
    let chats = open_chats_db()?;

    let session_entries = query_session_entries(16)?;
    let total_chats = query_count(&chats, "SELECT COUNT(*) FROM chat_sessions")?;
    let total_messages = query_count(
        &chats,
        "SELECT COALESCE(SUM(message_count), 0) FROM chat_sessions",
    )?;
    let total_characters = query_count(&chats, "SELECT COUNT(*) FROM characters")?;

    let mut counts = BTreeMap::new();
    counts.insert("characters".into(), total_characters);
    counts.insert("chatFiles".into(), total_chats);
    counts.insert("messages".into(), total_messages);
    counts.insert("worlds".into(), count_domain(&library, "worlds")?);
    counts.insert("contexts".into(), count_domain(&library, "contexts")?);
    counts.insert("instructs".into(), count_domain(&library, "instructs")?);
    counts.insert("sysprompts".into(), count_domain(&library, "sysprompts")?);
    counts.insert("reasonings".into(), count_domain(&library, "reasonings")?);
    counts.insert(
        "openaiPresets".into(),
        count_domain(&library, "openaiPresets")?,
    );
    counts.insert(
        "novelPresets".into(),
        count_domain(&library, "novelPresets")?,
    );
    counts.insert(
        "textgenPresets".into(),
        count_domain(&library, "textgenPresets")?,
    );
    counts.insert(
        "koboldPresets".into(),
        count_domain(&library, "koboldPresets")?,
    );
    counts.insert(
        "quickReplies".into(),
        count_domain(&library, "quickReplies")?,
    );
    counts.insert("themes".into(), count_domain(&library, "themes")?);
    counts.insert("story".into(), count_domain(&library, "story")?);
    counts.insert("projects".into(), project_store::count_projects()?);
    counts.insert("assets".into(), count_domain(&library, "assets")?);
    counts.insert("backgrounds".into(), count_domain(&library, "backgrounds")?);
    counts.insert("groups".into(), count_domain(&library, "groups")?);
    counts.insert("groupChats".into(), count_domain(&library, "groupChats")?);
    counts.insert("extensions".into(), count_domain(&library, "extensions")?);
    counts.insert("backups".into(), count_domain(&library, "backups")?);
    counts.insert("logs".into(), log_entries.len());

    let mut entries = BTreeMap::new();
    entries.insert("sessions".into(), session_entries);
    entries.insert("worlds".into(), query_library_entries("worlds", 12)?);
    entries.insert("contexts".into(), query_library_entries("contexts", 12)?);
    entries.insert("instructs".into(), query_library_entries("instructs", 12)?);
    entries.insert(
        "sysprompts".into(),
        query_library_entries("sysprompts", 12)?,
    );
    entries.insert(
        "reasonings".into(),
        query_library_entries("reasonings", 12)?,
    );
    entries.insert(
        "openaiPresets".into(),
        query_library_entries("openaiPresets", 12)?,
    );
    entries.insert(
        "novelPresets".into(),
        query_library_entries("novelPresets", 12)?,
    );
    entries.insert(
        "textgenPresets".into(),
        query_library_entries("textgenPresets", 12)?,
    );
    entries.insert(
        "koboldPresets".into(),
        query_library_entries("koboldPresets", 12)?,
    );
    entries.insert(
        "quickReplies".into(),
        query_library_entries("quickReplies", 12)?,
    );
    entries.insert("themes".into(), query_library_entries("themes", 12)?);
    entries.insert("story".into(), query_library_entries("story", 12)?);
    entries.insert(
        "projects".into(),
        project_store::query_project_catalog_entries(12)?,
    );
    entries.insert("assets".into(), query_library_entries("assets", 16)?);
    entries.insert(
        "backgrounds".into(),
        query_library_entries("backgrounds", 16)?,
    );
    entries.insert("groups".into(), query_library_entries("groups", 12)?);
    entries.insert(
        "groupChats".into(),
        query_library_entries("groupChats", 12)?,
    );
    entries.insert(
        "extensions".into(),
        query_library_entries("extensions", 12)?,
    );
    entries.insert("backups".into(), query_library_entries("backups", 16)?);
    entries.insert("logs".into(), log_entries);

    Ok(WorkspaceCatalogPayload {
        counts,
        disabled_extensions,
        entries,
        total_chats,
        total_messages,
        warning_lines,
    })
}

fn count_domain(connection: &Connection, domain: &str) -> StorageResult<usize> {
    connection
        .query_row(
            "SELECT COUNT(*) FROM library_entries WHERE domain = ?1",
            params![domain],
            |row| row.get::<_, i64>(0),
        )
        .map(|value| value as usize)
        .map_err(|error| error.to_string())
}

pub fn read_secret(secret_key: &str) -> StorageResult<String> {
    ensure_storage_ready()?;
    let connection = open_secrets_db()?;
    let value = connection
        .query_row(
            "SELECT secret_value FROM secrets WHERE secret_key = ?1",
            params![secret_key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    Ok(value.unwrap_or_default())
}

pub fn write_secret(secret_key: &str, secret_value: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let connection = open_secrets_db()?;
    connection
        .execute(
            "
            INSERT INTO secrets(secret_key, secret_value, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(secret_key) DO UPDATE SET
                secret_value = excluded.secret_value,
                updated_at = excluded.updated_at
            ",
            params![secret_key.trim(), secret_value, now_millis()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn fetch_library_documents(domain: &str) -> StorageResult<Vec<LibraryDocument>> {
    ensure_storage_ready()?;
    let connection = open_library_db()?;
    let mut statement = connection
        .prepare(
            "
            SELECT domain, name, kind, content_text, disabled, tags_json, updated_at
            FROM library_entries
            WHERE domain = ?1
            ORDER BY COALESCE(updated_at, 0) DESC, name ASC
            ",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![domain], |row| {
            let tags_json: String = row.get(5)?;
            let tags = serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default();
            Ok(LibraryDocument {
                domain: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                content_text: row.get(3)?,
                disabled: row.get::<_, i64>(4)? != 0,
                tags,
                updated_at: row.get::<_, Option<i64>>(6)?.map(|value| value as u64),
            })
        })
        .map_err(|error| error.to_string())?;

    let mut documents = Vec::new();
    for row in rows {
        documents.push(row.map_err(|error| error.to_string())?);
    }
    Ok(documents)
}

pub fn save_library_document(
    payload: SaveLibraryDocumentPayload,
) -> StorageResult<LibraryDocument> {
    ensure_storage_ready()?;
    let connection = open_library_db()?;
    let name = payload.name.trim();
    let domain = payload.domain.trim();
    let kind = payload.kind.trim();

    if name.is_empty() || domain.is_empty() || kind.is_empty() {
        return Err("Library document requires domain, kind, and name.".to_string());
    }

    let tags = payload.tags.unwrap_or_default();
    let tags_json = serde_json::to_string(&tags).map_err(|error| error.to_string())?;
    let content_text = payload.content_text.unwrap_or_default();
    let updated_at = now_millis();
    let size_bytes = content_text.len() as i64;
    let (item_count, note) = derive_library_metadata(kind, &content_text);

    connection
        .execute(
            "
            INSERT INTO library_entries(
                domain, name, kind, content_text, disabled, item_count, note,
                size_bytes, updated_at, source_path, tags_json
            ) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8, NULL, ?9)
            ON CONFLICT(domain, name) DO UPDATE SET
                kind = excluded.kind,
                content_text = excluded.content_text,
                disabled = 0,
                item_count = excluded.item_count,
                note = excluded.note,
                size_bytes = excluded.size_bytes,
                updated_at = excluded.updated_at,
                source_path = NULL,
                tags_json = excluded.tags_json
            ",
            params![
                domain,
                name,
                kind,
                content_text,
                item_count,
                note,
                size_bytes,
                updated_at,
                tags_json
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(LibraryDocument {
        domain: domain.to_string(),
        name: name.to_string(),
        kind: kind.to_string(),
        content_text: Some(content_text),
        disabled: false,
        tags,
        updated_at: Some(updated_at as u64),
    })
}

pub fn delete_library_document(domain: &str, name: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let normalized_domain = domain.trim();
    let normalized_name = name.trim();
    let connection = open_library_db()?;
    let source_path = connection
        .query_row(
            "SELECT source_path FROM library_entries WHERE domain = ?1 AND name = ?2",
            params![normalized_domain, normalized_name],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .flatten();
    connection
        .execute(
            "DELETE FROM library_entries WHERE domain = ?1 AND name = ?2",
            params![normalized_domain, normalized_name],
        )
        .map_err(|error| error.to_string())?;
    if normalized_domain == "worlds" {
        cleanup_deleted_world_selection(normalized_name)?;
        world_state::delete_world_state_snapshots_for_lorebook(normalized_name)?;
        retrieval::delete_library_source_artifacts("world", normalized_name)?;
    }
    if normalized_domain == "backups" {
        if let Some(path) = source_path {
            let backup_root = PathBuf::from(path);
            if backup_root.exists() {
                fs::remove_dir_all(backup_root).map_err(|error| error.to_string())?;
            }
        }
    }
    Ok(())
}

fn cleanup_deleted_world_selection(name: &str) -> StorageResult<()> {
    let normalized_name = name.trim();
    if normalized_name.is_empty() {
        return Ok(());
    }

    let mut settings = read_stored_settings_value()?;
    let Some(world_names) = settings
        .get_mut("world_names")
        .and_then(Value::as_array_mut)
    else {
        return Ok(());
    };

    let original_len = world_names.len();
    world_names.retain(|item| item.as_str().map(str::trim) != Some(normalized_name));
    if world_names.len() == original_len {
        return Ok(());
    }

    let connection = open_settings_db()?;
    save_settings_in_connection(&connection, &settings)
}

fn copy_dir_recursive(source: &Path, target: &Path) -> StorageResult<usize> {
    fs::create_dir_all(target).map_err(|error| error.to_string())?;
    let mut copied_files = 0usize;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let item = entry.map_err(|error| error.to_string())?;
        let source_path = item.path();
        let target_path = target.join(item.file_name());
        if source_path.is_dir() {
            copied_files += copy_dir_recursive(&source_path, &target_path)?;
        } else if source_path.is_file() {
            fs::copy(&source_path, &target_path).map_err(|error| error.to_string())?;
            copied_files += 1;
        }
    }
    Ok(copied_files)
}

fn derive_library_metadata(kind: &str, content_text: &str) -> (Option<i64>, Option<String>) {
    if content_text.trim().is_empty() {
        return (Some(0), None);
    }

    match kind {
        "world" => {
            if let Ok(parsed) = serde_json::from_str::<Value>(content_text) {
                if let Some(entries) = parsed.as_array() {
                    let preview = entries
                        .iter()
                        .find_map(|item| item.get("comment").and_then(Value::as_str))
                        .or_else(|| {
                            entries
                                .iter()
                                .find_map(|item| item.get("content").and_then(Value::as_str))
                        })
                        .map(|text| text.trim().chars().take(80).collect::<String>())
                        .filter(|text| !text.is_empty());
                    return (Some(entries.len() as i64), preview);
                }
            }
            (Some(0), None)
        }
        "textgen-preset" | "openai-preset" | "novel-preset" | "kobold-preset" => {
            if let Ok(parsed) = serde_json::from_str::<Value>(content_text) {
                let temperature = parsed.get("temperature").and_then(Value::as_f64);
                let top_p = parsed.get("top_p").and_then(Value::as_f64);
                let summary = match (temperature, top_p) {
                    (Some(temp), Some(top_p)) => Some(format!("T={temp:.2} · P={top_p:.2}")),
                    (Some(temp), None) => Some(format!("T={temp:.2}")),
                    _ => None,
                };
                return (None, summary);
            }
            (None, None)
        }
        _ => (None, None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::SaveCharacterPayload;
    use serde_json::json;
    use std::sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    };

    const PNG_DATA_URL: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnR0eQAAAAASUVORK5CYII=";
    const PNG_DATA_URL_ALT: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR42mNkAAIAAAoAASsJTYQAAAAASUVORK5CYII=";

    fn test_env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn with_temp_data_root<T>(test_fn: impl FnOnce(PathBuf) -> T) -> T {
        static NEXT_ID: AtomicU64 = AtomicU64::new(1);

        let _guard = test_env_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let temp_root = std::env::temp_dir().join(format!(
            "st-storage-test-{}-{}",
            now_millis(),
            NEXT_ID.fetch_add(1, Ordering::Relaxed),
        ));
        let previous = std::env::var("ST_TAURI_DATA_ROOT").ok();
        unsafe {
            std::env::set_var("ST_TAURI_DATA_ROOT", &temp_root);
        }

        let result = test_fn(temp_root.clone());

        if let Some(previous_value) = previous {
            unsafe {
                std::env::set_var("ST_TAURI_DATA_ROOT", previous_value);
            }
        } else {
            unsafe {
                std::env::remove_var("ST_TAURI_DATA_ROOT");
            }
        }

        let _ = fs::remove_dir_all(temp_root);
        result
    }

    #[test]
    fn save_settings_with_secret_persists_both_records() {
        with_temp_data_root(|_| {
            let settings = serde_json::json!({
                "main_api": "openai",
                "openai_model": "unit-test-model",
                "chat_completion_source": "custom",
                "custom_url": "https://example.invalid/v1",
                "amount_gen": 321
            });

            save_settings_with_secret(&settings, "api_key_custom", "unit-test-secret")
                .expect("atomic settings save should succeed");

            let payload = fetch_settings_payload().expect("settings payload should load");
            assert_eq!(
                payload.settings.get("openai_model").and_then(Value::as_str),
                Some("unit-test-model")
            );
            assert_eq!(
                payload.settings.get("amount_gen").and_then(Value::as_f64),
                Some(321.0)
            );
            assert_eq!(
                read_secret("api_key_custom").expect("secret should load"),
                "unit-test-secret"
            );
        });
    }

    #[test]
    fn save_and_fetch_session_summaries_round_trip() {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            let saved = save_session_summary(SaveSessionSummaryPayload {
                avatar_url: Some("assets/arcueid.png".to_string()),
                content: "他们已经在高架桥附近被逼入死角。".to_string(),
                file_name: Some("summary-test.jsonl".to_string()),
                id: None,
                source_signature: Some("sig-1".to_string()),
                source_message_end: Some(24),
                source_message_start: Some(1),
                summary_kind: "scene".to_string(),
            })
            .expect("session summary should save");

            let fetched =
                fetch_session_summaries(Some("assets/arcueid.png"), Some("summary-test.jsonl"))
                    .expect("session summaries should load");

            assert_eq!(fetched.len(), 1);
            assert_eq!(fetched[0].id, saved.id);
            assert_eq!(fetched[0].summary_kind, "scene");
            assert_eq!(fetched[0].source_signature.as_deref(), Some("sig-1"));
            assert_eq!(fetched[0].source_message_start, Some(1));
            assert_eq!(fetched[0].source_message_end, Some(24));
            assert!(fetched[0].content.contains("高架桥"));
        });
    }

    #[test]
    fn delete_session_summary_supports_single_and_scoped_clear() {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            let first = save_session_summary(SaveSessionSummaryPayload {
                avatar_url: Some("assets/arcueid.png".to_string()),
                content: "场景摘要".to_string(),
                file_name: Some("summary-delete.jsonl".to_string()),
                id: None,
                source_signature: None,
                source_message_end: None,
                source_message_start: None,
                summary_kind: "scene".to_string(),
            })
            .expect("first summary should save");

            let second = save_session_summary(SaveSessionSummaryPayload {
                avatar_url: Some("assets/arcueid.png".to_string()),
                content: "关系摘要".to_string(),
                file_name: Some("summary-delete.jsonl".to_string()),
                id: None,
                source_signature: None,
                source_message_end: None,
                source_message_start: None,
                summary_kind: "relationship".to_string(),
            })
            .expect("second summary should save");

            let deleted_one = delete_session_summary(DeleteSessionSummaryPayload {
                avatar_url: None,
                file_name: None,
                id: Some(first.id.clone()),
            })
            .expect("single summary should delete");
            assert_eq!(deleted_one, 1);

            let after_single =
                fetch_session_summaries(Some("assets/arcueid.png"), Some("summary-delete.jsonl"))
                    .expect("summaries should still load");
            assert_eq!(after_single.len(), 1);
            assert_eq!(after_single[0].id, second.id);

            let deleted_scope = delete_session_summary(DeleteSessionSummaryPayload {
                avatar_url: Some("assets/arcueid.png".to_string()),
                file_name: Some("summary-delete.jsonl".to_string()),
                id: None,
            })
            .expect("scoped clear should delete");
            assert_eq!(deleted_scope, 1);

            let after_scope =
                fetch_session_summaries(Some("assets/arcueid.png"), Some("summary-delete.jsonl"))
                    .expect("summaries should still load");
            assert!(after_scope.is_empty());
        });
    }

    #[test]
    fn chat_lifecycle_keeps_session_summaries_in_sync() {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            let avatar = "assets/arcueid.png";
            let source_file = "lifecycle-source.jsonl";
            let renamed_file = "lifecycle-renamed.jsonl";
            let duplicate_file = "lifecycle-duplicate.jsonl";

            save_chat(
                avatar,
                source_file,
                &[json!({
                    "name": "Shiki",
                    "is_user": true,
                    "mes": "今晚别走散。",
                    "send_date": "2026-05-02T22:00:00.000Z",
                    "user_name": "Shiki",
                    "character_name": "爱尔奎特·布伦史塔德"
                })],
            )
            .expect("chat should save");

            save_session_summary(SaveSessionSummaryPayload {
                avatar_url: Some(avatar.to_string()),
                content: "原始会话摘要".to_string(),
                file_name: Some(source_file.to_string()),
                id: None,
                source_signature: Some("life-sig".to_string()),
                source_message_end: Some(1),
                source_message_start: Some(1),
                summary_kind: "session".to_string(),
            })
            .expect("summary should save");
            retrieval::save_retrieval_job(
                "ctx::lifecycle::1",
                "generation_context",
                source_file,
                "completed",
                r#"{"query":"今晚别走散"}"#,
            )
            .expect("retrieval job should save");

            rename_chat(avatar, source_file, renamed_file).expect("chat should rename");
            let renamed_summaries = fetch_session_summaries(Some(avatar), Some(renamed_file))
                .expect("renamed summaries should load");
            assert_eq!(renamed_summaries.len(), 1);
            assert_eq!(renamed_summaries[0].content, "原始会话摘要");
            let renamed_jobs = retrieval::fetch_retrieval_jobs(Some(renamed_file), 8)
                .expect("renamed retrieval jobs should load");
            assert_eq!(renamed_jobs.len(), 1);
            assert_eq!(renamed_jobs[0].source_id, renamed_file);

            duplicate_chat(avatar, renamed_file, duplicate_file).expect("chat should duplicate");
            let duplicated_summaries = fetch_session_summaries(Some(avatar), Some(duplicate_file))
                .expect("duplicated summaries should load");
            assert_eq!(duplicated_summaries.len(), 1);
            assert_eq!(duplicated_summaries[0].summary_kind, "session");
            assert_eq!(
                duplicated_summaries[0].source_signature.as_deref(),
                Some("life-sig")
            );

            delete_chat(avatar, renamed_file).expect("chat should delete");
            let deleted_scope = fetch_session_summaries(Some(avatar), Some(renamed_file))
                .expect("deleted scope summaries should load");
            assert!(deleted_scope.is_empty());
            let deleted_jobs = retrieval::fetch_retrieval_jobs(Some(renamed_file), 8)
                .expect("deleted retrieval jobs should load");
            assert!(deleted_jobs.is_empty());
            let duplicate_scope = fetch_session_summaries(Some(avatar), Some(duplicate_file))
                .expect("duplicate scope summaries should remain");
            assert_eq!(duplicate_scope.len(), 1);
        });
    }

    #[test]
    fn save_narrative_memories_stage_pending_candidates_before_approval() {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            let memories = vec![NarrativeMemoryRecord {
                content: "主角已经向爱尔奎特透露了真实姓名".to_string(),
                importance: 0.92,
                kind: "profile".to_string(),
                tags: vec!["identity".to_string(), "trust".to_string()],
            }];

            let first_count = save_narrative_memories(
                Some("arcueid-brunestud.png"),
                Some("Test Chat.jsonl"),
                Some("爱尔奎特·布伦史塔德"),
                "关系迈入更信任的阶段。",
                &memories,
            )
            .expect("first memory save should succeed");
            assert_eq!(first_count, 1);

            let second_count = save_narrative_memories(
                Some("arcueid-brunestud.png"),
                Some("Test Chat.jsonl"),
                Some("爱尔奎特·布伦史塔德"),
                "角色关系继续升温。",
                &memories,
            )
            .expect("second memory save should succeed");
            assert_eq!(second_count, 1);

            let connection = crate::memory::open_memory_db().expect("memory db should open");
            let candidate_count = connection
                .query_row("SELECT COUNT(*) FROM memory_candidates", [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("candidate row count should load");
            assert_eq!(candidate_count, 1);

            let active_count = connection
                .query_row("SELECT COUNT(*) FROM narrative_memories", [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("memory row count should load");
            assert_eq!(active_count, 0);

            let candidate_id = connection
                .query_row(
                    "SELECT id FROM memory_candidates WHERE status = 'pending' LIMIT 1",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .expect("candidate id should load");

            review_narrative_memory_candidate(&candidate_id, "approve")
                .expect("candidate approval should succeed");

            let approved_count = connection
                .query_row("SELECT COUNT(*) FROM narrative_memories", [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("approved memory row count should load");
            assert_eq!(approved_count, 1);
        });
    }

    #[test]
    fn fetch_narrative_memory_candidates_returns_pending_entries() {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            let memories = vec![NarrativeMemoryRecord {
                content: "希耶尔已经察觉主角与爱尔奎特私下接触".to_string(),
                importance: 0.74,
                kind: "relationship".to_string(),
                tags: vec!["ciel".to_string(), "arcueid".to_string()],
            }];

            save_narrative_memories(
                Some("arcueid-brunestud.png"),
                Some("Pending Chat.jsonl"),
                Some("爱尔奎特·布伦史塔德"),
                "局势开始变得敏感。",
                &memories,
            )
            .expect("memory extraction candidates should save");

            let pending = fetch_narrative_memory_candidates(
                Some("arcueid-brunestud.png"),
                Some("Pending Chat.jsonl"),
                Some("希耶尔 爱尔奎特"),
                8,
            )
            .expect("pending candidates should load");

            assert_eq!(pending.len(), 1);
            assert_eq!(pending[0].status, "pending");
            assert!(pending[0].content.contains("希耶尔"));
        });
    }

    #[test]
    fn apply_world_state_updates_persists_snapshot_and_entity_detail() {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            let snapshot = apply_world_state_updates(
                Some("assets/arcueid.png"),
                Some("world-updates.jsonl"),
                &[WorldStateUpdateRecord {
                    entity: "千年城大厅".to_string(),
                    field: "scene_state".to_string(),
                    next_value: json!("blood_mist_rising"),
                    reason: "爱尔奎特察觉到罗亚的残留气息重新聚集".to_string(),
                }],
            )
            .expect("world state update should create a snapshot");

            assert_eq!(snapshot.summary, "applied 1 state updates");
            assert!(
                snapshot
                    .scene_states
                    .iter()
                    .any(|item| item.name == "千年城大厅" && item.status == "blood_mist_rising"),
                "applied world-state updates should be visible in the reloaded snapshot"
            );
        });
    }

    #[test]
    fn rejecting_candidate_removes_active_memory_projection() {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            let memories = vec![NarrativeMemoryRecord {
                content: "主角答应帮助爱尔奎特追查罗亚踪迹".to_string(),
                importance: 0.88,
                kind: "quest".to_string(),
                tags: vec!["roa".to_string(), "promise".to_string()],
            }];

            save_narrative_memories(
                Some("arcueid-brunestud.png"),
                Some("Reject Chat.jsonl"),
                Some("爱尔奎特·布伦史塔德"),
                "共同目标已经建立。",
                &memories,
            )
            .expect("pending candidate save should succeed");

            let candidate_id = fetch_narrative_memory_candidates(
                Some("arcueid-brunestud.png"),
                Some("Reject Chat.jsonl"),
                None,
                8,
            )
            .expect("pending candidates should load")[0]
                .id
                .clone();

            review_narrative_memory_candidate(&candidate_id, "approve")
                .expect("approval should succeed");
            review_narrative_memory_candidate(&candidate_id, "reject")
                .expect("rejection should succeed");

            let connection = crate::memory::open_memory_db().expect("memory db should open");
            let active_count = connection
                .query_row("SELECT COUNT(*) FROM narrative_memories", [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("active memory count should load");
            assert_eq!(active_count, 0);
        });
    }

    #[test]
    fn delete_narrative_memory_removes_memory_and_hits() {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            let memories = vec![NarrativeMemoryRecord {
                content: "主角已经记住远野家的地下通路入口".to_string(),
                importance: 0.83,
                kind: "location".to_string(),
                tags: vec!["route".to_string(), "mansion".to_string()],
            }];

            save_narrative_memories(
                Some("assets/arcueid.png"),
                Some("memory-delete.jsonl"),
                Some("爱尔奎特"),
                "记录了地下通路的关键信息。",
                &memories,
            )
            .expect("memory candidates should save");

            let candidate_id = fetch_narrative_memory_candidates(
                Some("assets/arcueid.png"),
                Some("memory-delete.jsonl"),
                None,
                8,
            )
            .expect("candidates should load")
            .first()
            .expect("candidate should exist")
            .id
            .clone();

            review_narrative_memory_candidate(&candidate_id, "approve")
                .expect("approval should succeed");

            let stored = fetch_narrative_memories(
                Some("assets/arcueid.png"),
                Some("memory-delete.jsonl"),
                None,
                8,
            )
            .expect("stored memories should load");
            let memory = stored.first().expect("memory should exist").clone();
            let memory_id = memory.id.clone();
            upsert_narrative_memory_embedding(
                &memory_id,
                "text-embedding-3-small",
                &[0.12, 0.34, 0.56],
                memory.updated_at,
            )
            .expect("memory embedding should save");
            retrieval::upsert_retrieval_chunks(&[retrieval::RetrievalChunkRecord {
                id: format!("memory::{memory_id}"),
                source_type: "memory".to_string(),
                source_id: memory_id.clone(),
                owner_key: "爱尔奎特".to_string(),
                scene_tags: vec!["route".to_string()],
                entity_tags: vec!["地下通路".to_string()],
                time_tags: vec![],
                content_text: memory.content.clone(),
            }])
            .expect("memory retrieval chunk should save");
            retrieval::save_retrieval_hits(
                "地下通路",
                &[retrieval::RetrievalHitRecord {
                    domain: "memory".to_string(),
                    hit_id: memory_id.clone(),
                    score: 0.91,
                }],
            )
            .expect("retrieval hit should save");

            save_memory_hits(
                Some("assets/arcueid.png"),
                Some("memory-delete.jsonl"),
                "地下通路",
                &stored,
            )
            .expect("memory hits should save");

            delete_narrative_memory(&memory_id).expect("memory deletion should succeed");

            let remaining_memories = fetch_narrative_memories(
                Some("assets/arcueid.png"),
                Some("memory-delete.jsonl"),
                None,
                8,
            )
            .expect("remaining memories should load");
            assert!(remaining_memories.is_empty());

            let remaining_hits = fetch_memory_hits(
                Some("assets/arcueid.png"),
                Some("memory-delete.jsonl"),
                Some("地下通路"),
                8,
            )
            .expect("remaining hits should load");
            assert!(remaining_hits.is_empty());

            let remaining_embedding = read_narrative_memory_embedding(
                &memory_id,
                "text-embedding-3-small",
                memory.updated_at,
            )
            .expect("embedding lookup should succeed");
            assert!(remaining_embedding.is_none());

            let remaining_retrieval_hits = retrieval::fetch_retrieval_hits(Some("地下通路"), 8)
                .expect("retrieval hits should load");
            assert!(
                remaining_retrieval_hits
                    .iter()
                    .all(|item| item.hit_id != memory_id),
                "retrieval hits referencing deleted memory should be removed"
            );

            let retrieval_connection =
                retrieval::open_retrieval_db().expect("retrieval db should open");
            let retrieval_chunk_count = retrieval_connection
                .query_row(
                    "SELECT COUNT(*) FROM retrieval_chunks WHERE source_type = 'memory' AND source_id = ?1",
                    params![memory_id],
                    |row| row.get::<_, i64>(0),
                )
                .expect("retrieval chunk count should load");
            assert_eq!(retrieval_chunk_count, 0);
        });
    }

    #[test]
    fn clear_memory_hits_respects_session_scope() {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            let memories = vec![NarrativeMemoryRecord {
                content: "希耶尔正在追查学院附近的异常使魔反应".to_string(),
                importance: 0.69,
                kind: "investigation".to_string(),
                tags: vec!["ciel".to_string()],
            }];

            save_narrative_memories(
                Some("assets/ciel.png"),
                Some("memory-hits-a.jsonl"),
                Some("希耶尔"),
                "第一条调查线索。",
                &memories,
            )
            .expect("session A candidates should save");
            save_narrative_memories(
                Some("assets/ciel.png"),
                Some("memory-hits-b.jsonl"),
                Some("希耶尔"),
                "第二条调查线索。",
                &memories,
            )
            .expect("session B candidates should save");

            for file_name in ["memory-hits-a.jsonl", "memory-hits-b.jsonl"] {
                let candidate_id = fetch_narrative_memory_candidates(
                    Some("assets/ciel.png"),
                    Some(file_name),
                    None,
                    8,
                )
                .expect("candidates should load")
                .first()
                .expect("candidate should exist")
                .id
                .clone();
                review_narrative_memory_candidate(&candidate_id, "approve")
                    .expect("approval should succeed");
                let stored =
                    fetch_narrative_memories(Some("assets/ciel.png"), Some(file_name), None, 8)
                        .expect("stored memories should load");
                save_memory_hits(
                    Some("assets/ciel.png"),
                    Some(file_name),
                    "异常使魔",
                    &stored,
                )
                .expect("memory hits should save");
            }

            clear_memory_hits(
                Some("assets/ciel.png"),
                Some("memory-hits-a.jsonl"),
                Some("异常使魔"),
            )
            .expect("scoped hit clear should succeed");

            let session_a_hits = fetch_memory_hits(
                Some("assets/ciel.png"),
                Some("memory-hits-a.jsonl"),
                Some("异常使魔"),
                8,
            )
            .expect("session A hits should load");
            let session_b_hits = fetch_memory_hits(
                Some("assets/ciel.png"),
                Some("memory-hits-b.jsonl"),
                Some("异常使魔"),
                8,
            )
            .expect("session B hits should load");

            assert!(session_a_hits.is_empty());
            assert_eq!(session_b_hits.len(), 1);
        });
    }

    #[test]
    fn save_memory_hits_replaces_existing_query_hits_for_same_session() {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            let memories = vec![NarrativeMemoryRecord {
                content: "爱尔奎特记得主角昨晚答应同行".to_string(),
                importance: 0.77,
                kind: "promise".to_string(),
                tags: vec!["agreement".to_string()],
            }];

            save_narrative_memories(
                Some("assets/arcueid.png"),
                Some("memory-replace.jsonl"),
                Some("爱尔奎特·布伦史塔德"),
                "昨夜的约定已经被确认。",
                &memories,
            )
            .expect("memories should save");

            let candidate_id = fetch_narrative_memory_candidates(
                Some("assets/arcueid.png"),
                Some("memory-replace.jsonl"),
                None,
                8,
            )
            .expect("candidates should load")
            .first()
            .expect("candidate should exist")
            .id
            .clone();

            review_narrative_memory_candidate(&candidate_id, "approve")
                .expect("candidate should approve");

            let stored = fetch_narrative_memories(
                Some("assets/arcueid.png"),
                Some("memory-replace.jsonl"),
                None,
                8,
            )
            .expect("stored memories should load");

            save_memory_hits(
                Some("assets/arcueid.png"),
                Some("memory-replace.jsonl"),
                "昨夜约定",
                &stored,
            )
            .expect("first hit save should succeed");
            save_memory_hits(
                Some("assets/arcueid.png"),
                Some("memory-replace.jsonl"),
                "昨夜约定",
                &stored,
            )
            .expect("second hit save should succeed");

            let hits = fetch_memory_hits(
                Some("assets/arcueid.png"),
                Some("memory-replace.jsonl"),
                Some("昨夜约定"),
                8,
            )
            .expect("hits should load");

            assert_eq!(hits.len(), 1);
        });
    }

    #[test]
    fn invalid_memory_extraction_payload_does_not_persist_candidates() {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            let before = fetch_narrative_memory_candidates(None, None, None, 10)
                .expect("candidate query should succeed");
            let before_count = before.len();

            let result = crate::parse_narrative_memory_extraction("not valid json");
            assert!(result.is_err(), "invalid payload should fail");
            let error = result.err().unwrap_or_default();
            assert!(
                error.contains("JSON"),
                "error should explain json parsing failure"
            );

            let after = fetch_narrative_memory_candidates(None, None, None, 10)
                .expect("candidate query should still succeed");
            assert_eq!(
                after.len(),
                before_count,
                "failed parsing must not leave candidate records behind"
            );
        });
    }

    #[test]
    fn deleting_world_document_cleans_selection_snapshot_and_retrieval_artifacts() {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            save_library_document(SaveLibraryDocumentPayload {
                content_text: Some(
                    serde_json::to_string(&vec![json!({
                        "comment": "location",
                        "content": "千年城的大厅仍残留昨夜舞会的痕迹",
                        "enabled": true,
                        "keys": ["千年城", "大厅"]
                    })])
                    .expect("lorebook content should serialize"),
                ),
                domain: "worlds".to_string(),
                kind: "world".to_string(),
                name: "删除测试世界书".to_string(),
                tags: Some(vec!["lorebook".to_string()]),
            })
            .expect("world document should save");

            let mut settings = read_stored_settings_value().expect("settings should load");
            settings["world_names"] =
                Value::Array(vec![Value::String("删除测试世界书".to_string())]);
            save_settings(&settings).expect("settings should save");

            let snapshot = rebuild_world_state_snapshot(
                Some("assets/arcueid.png"),
                Some("world-delete.jsonl"),
                Some("删除测试世界书"),
            )
            .expect("world state snapshot should rebuild");
            assert_eq!(snapshot.lorebook_name.as_deref(), Some("删除测试世界书"));

            retrieval::upsert_retrieval_chunks(&[retrieval::RetrievalChunkRecord {
                id: "world::删除测试世界书::千年城|大厅".to_string(),
                source_type: "world".to_string(),
                source_id: "删除测试世界书".to_string(),
                owner_key: "删除测试世界书".to_string(),
                scene_tags: vec!["千年城".to_string()],
                entity_tags: vec!["大厅".to_string()],
                time_tags: vec![],
                content_text: "千年城的大厅仍残留昨夜舞会的痕迹".to_string(),
            }])
            .expect("world retrieval chunk should save");
            retrieval::save_retrieval_hits(
                "千年城大厅",
                &[retrieval::RetrievalHitRecord {
                    domain: "world".to_string(),
                    hit_id: "删除测试世界书".to_string(),
                    score: 0.88,
                }],
            )
            .expect("world retrieval hit should save");

            delete_library_document("worlds", "删除测试世界书")
                .expect("world document deletion should succeed");

            let updated_settings =
                read_stored_settings_value().expect("updated settings should load");
            let active_worlds = updated_settings
                .get("world_names")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            assert!(
                active_worlds
                    .iter()
                    .all(|item| item.as_str() != Some("删除测试世界书")),
                "deleted world should be removed from active world selection"
            );

            let snapshot_after_delete =
                fetch_world_state_snapshot(Some("assets/arcueid.png"), Some("world-delete.jsonl"))
                    .expect("snapshot fetch should succeed");
            assert!(
                snapshot_after_delete.is_none(),
                "snapshot bound to deleted lorebook should be removed"
            );

            let retrieval_hits = retrieval::fetch_retrieval_hits(Some("千年城大厅"), 8)
                .expect("retrieval hits should load");
            assert!(
                retrieval_hits
                    .iter()
                    .all(|item| !(item.hit_domain == "world" && item.hit_id == "删除测试世界书")),
                "retrieval hits for deleted world should be removed"
            );

            let retrieval_connection =
                retrieval::open_retrieval_db().expect("retrieval db should open");
            let retrieval_chunk_count = retrieval_connection
                .query_row(
                    "SELECT COUNT(*) FROM retrieval_chunks WHERE source_type = 'world' AND source_id = ?1",
                    params!["删除测试世界书"],
                    |row| row.get::<_, i64>(0),
                )
                .expect("retrieval chunk count should load");
            assert_eq!(retrieval_chunk_count, 0);
        });
    }

    #[test]
    fn rebuilding_world_state_snapshot_without_name_only_uses_active_worlds() {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            save_library_document(SaveLibraryDocumentPayload {
                content_text: Some(
                    serde_json::to_string(&vec![json!({
                        "comment": "location",
                        "content": "千年城宴会厅的月光洒在银杯上",
                        "enabled": true,
                        "keys": ["千年城宴会厅"]
                    })])
                    .expect("active lorebook should serialize"),
                ),
                domain: "worlds".to_string(),
                kind: "world".to_string(),
                name: "激活世界书".to_string(),
                tags: Some(vec!["lorebook".to_string()]),
            })
            .expect("active world should save");

            save_library_document(SaveLibraryDocumentPayload {
                content_text: Some(
                    serde_json::to_string(&vec![json!({
                        "comment": "location",
                        "content": "废都钟楼仍然停在灾变前的一刻",
                        "enabled": true,
                        "keys": ["废都钟楼"]
                    })])
                    .expect("inactive lorebook should serialize"),
                ),
                domain: "worlds".to_string(),
                kind: "world".to_string(),
                name: "未激活世界书".to_string(),
                tags: Some(vec!["lorebook".to_string()]),
            })
            .expect("inactive world should save");

            let mut settings = read_stored_settings_value().expect("settings should load");
            settings["world_names"] = Value::Array(vec![Value::String("激活世界书".to_string())]);
            save_settings(&settings).expect("settings should save");

            let snapshot = rebuild_world_state_snapshot(
                Some("assets/arcueid.png"),
                Some("active-world-filter.jsonl"),
                None,
            )
            .expect("snapshot should rebuild from active worlds");

            assert_eq!(snapshot.lorebook_name, None);
            assert_eq!(snapshot.locations.len(), 1);
            assert_eq!(snapshot.locations[0].name, "千年城宴会厅");
            assert!(
                snapshot
                    .locations
                    .iter()
                    .all(|item| item.name != "废都钟楼"),
                "inactive lorebooks must not leak into world-state snapshot"
            );
        });
    }

    #[test]
    fn default_seed_names_are_loaded_from_resource_files() {
        let character_seed = load_default_character_seed().expect("character seed should parse");
        let world_seed = load_default_world_seed().expect("world seed should parse");

        assert_eq!(character_seed.name, "爱尔奎特·布伦史塔德");
        assert_eq!(character_seed.avatar_file_name, "arcueid-brunestud.png");
        assert_eq!(world_seed.name, "月姬世界观设定");
        assert!(
            !world_seed.entries.is_empty(),
            "world seed entries should not be empty"
        );
    }

    #[test]
    fn default_settings_include_strict_message_rendering_contract() {
        let merged = merge_default_settings(Value::Object(Map::new()));
        let message_rendering = merged
            .get("message_rendering")
            .and_then(Value::as_object)
            .expect("message_rendering should exist");
        let format_guide = message_rendering
            .get("formatGuide")
            .and_then(Value::as_object)
            .expect("formatGuide should exist");

        assert_eq!(
            message_rendering
                .get("activeTemplateId")
                .and_then(Value::as_str),
            Some("classic-novel")
        );
        assert_eq!(
            format_guide.get("enabled").and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            format_guide.get("mode").and_then(Value::as_str),
            Some("strict")
        );
    }

    #[test]
    fn save_character_persists_avatar_and_first_message() {
        with_temp_data_root(|temp_root| {
            let payload = SaveCharacterPayload {
                alternate_greetings: Some(vec!["备用问候".to_string()]),
                avatar: None,
                avatar_data_url: Some(PNG_DATA_URL.to_string()),
                description: Some("测试描述".to_string()),
                first_mes: Some("这是首条问候消息".to_string()),
                mes_example: Some("示例消息".to_string()),
                name: "Avatar Upload Test".to_string(),
                personality: Some("冷静".to_string()),
                post_history_instructions: Some("保持冒险语气".to_string()),
                scenario: Some("异世界营地".to_string()),
                system_prompt: Some("你是测试角色".to_string()),
            };

            let saved = save_character(payload).expect("character should save");
            let avatar = saved.avatar.clone();
            let expected_path = temp_root.join("characters").join(&avatar);

            assert!(expected_path.exists(), "avatar file should exist on disk");
            assert_eq!(saved.first_mes, "这是首条问候消息");

            let resolved_path = resolve_avatar_path(&avatar).expect("avatar path should resolve");
            assert_eq!(
                PathBuf::from(resolved_path),
                expected_path.canonicalize().expect("canonical avatar path"),
            );

            let characters = fetch_characters().expect("characters should load");
            let saved_character = characters
                .into_iter()
                .find(|character| character.avatar == avatar)
                .expect("saved character should be queryable");

            assert_eq!(saved_character.first_mes, "这是首条问候消息");
            assert_eq!(saved_character.name, "Avatar Upload Test");
        });
    }

    #[test]
    fn save_character_overwrites_existing_avatar_file() {
        with_temp_data_root(|temp_root| {
            let first_saved = save_character(SaveCharacterPayload {
                alternate_greetings: None,
                avatar: None,
                avatar_data_url: Some(PNG_DATA_URL.to_string()),
                description: None,
                first_mes: Some("第一次".to_string()),
                mes_example: None,
                name: "Overwrite Avatar Test".to_string(),
                personality: None,
                post_history_instructions: None,
                scenario: None,
                system_prompt: None,
            })
            .expect("first save should succeed");

            let avatar_path = temp_root.join("characters").join(&first_saved.avatar);
            let original_bytes =
                fs::read(&avatar_path).expect("original avatar bytes should exist");

            save_character(SaveCharacterPayload {
                alternate_greetings: None,
                avatar: Some(first_saved.avatar.clone()),
                avatar_data_url: Some(PNG_DATA_URL_ALT.to_string()),
                description: None,
                first_mes: Some("第二次".to_string()),
                mes_example: None,
                name: "Overwrite Avatar Test".to_string(),
                personality: None,
                post_history_instructions: None,
                scenario: None,
                system_prompt: None,
            })
            .expect("second save should succeed");

            let updated_bytes = fs::read(&avatar_path).expect("updated avatar bytes should exist");
            assert_ne!(
                original_bytes, updated_bytes,
                "avatar file should be overwritten"
            );

            let saved_character = fetch_characters()
                .expect("characters should load")
                .into_iter()
                .find(|character| character.avatar == first_saved.avatar)
                .expect("updated character should exist");
            assert_eq!(saved_character.first_mes, "第二次");
        });
    }

    #[test]
    fn delete_model_provider_clears_settings_references() {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            let saved = save_model_provider(SaveModelProviderPayload {
                id: Some("test-provider".to_string()),
                name: "Test Provider".to_string(),
                provider_type: "custom".to_string(),
                protocol: Some("openai_chat_completions".to_string()),
                base_url: "http://127.0.0.1:11434/v1".to_string(),
                api_version: None,
                deployment_name: None,
                enabled: true,
                secret_value: Some("test-key".to_string()),
                capabilities: vec![
                    ModelProviderCapability {
                        capability: "chat".to_string(),
                        enabled: true,
                        default_model: "chat-model".to_string(),
                        models: vec!["chat-model".to_string()],
                    },
                    ModelProviderCapability {
                        capability: "embedding".to_string(),
                        enabled: true,
                        default_model: "embed-model".to_string(),
                        models: vec!["embed-model".to_string()],
                    },
                ],
                notes: None,
            })
            .expect("provider should save");

            let mut settings = read_stored_settings_value().expect("settings should load");
            let root = settings
                .as_object_mut()
                .expect("settings should be an object");
            root.insert(
                "chat_model_provider_id".to_string(),
                Value::String(saved.id.clone()),
            );
            root.insert(
                "narrative_embedding_provider_id".to_string(),
                Value::String(saved.id.clone()),
            );
            let nested = root
                .get_mut("oai_settings")
                .and_then(Value::as_object_mut)
                .expect("nested settings should be an object");
            nested.insert(
                "chat_model_provider_id".to_string(),
                Value::String(saved.id.clone()),
            );
            nested.insert(
                "narrative_embedding_provider_id".to_string(),
                Value::String(saved.id.clone()),
            );
            save_settings(&settings).expect("settings should save");

            delete_model_provider(&saved.id).expect("provider should delete");

            let settings = read_stored_settings_value().expect("settings should reload");
            let root = settings.as_object().expect("settings should be an object");
            assert_eq!(
                root.get("chat_model_provider_id").and_then(Value::as_str),
                Some("")
            );
            assert_eq!(
                root.get("narrative_embedding_provider_id")
                    .and_then(Value::as_str),
                Some("")
            );
            let nested = root
                .get("oai_settings")
                .and_then(Value::as_object)
                .expect("nested settings should exist");
            assert_eq!(
                nested.get("chat_model_provider_id").and_then(Value::as_str),
                Some("")
            );
            assert_eq!(
                nested
                    .get("narrative_embedding_provider_id")
                    .and_then(Value::as_str),
                Some("")
            );
            assert!(
                fetch_model_provider(&saved.id)
                    .expect("provider list should load")
                    .is_none()
            );
        });
    }

    #[test]
    fn cleanup_legacy_default_model_provider_state_removes_seeded_provider_and_embedding_defaults(
    ) {
        with_temp_data_root(|_| {
            ensure_storage_ready().expect("storage should initialize");

            let mut connection = open_settings_db().expect("settings db should open");
            let secrets_path = secrets_db_path().to_string_lossy().to_string();
            connection
                .execute("ATTACH DATABASE ?1 AS secrets_db", params![secrets_path])
                .expect("secrets db should attach");
            let transaction = connection.transaction().expect("transaction should open");
            transaction
                .execute(
                    "
                    INSERT INTO model_providers(
                        id, name, provider_type, protocol, base_url, api_version, deployment_name,
                        enabled, secret_key, capabilities_json, notes, updated_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, 1, ?6, ?7, NULL, ?8)
                    ",
                    params![
                        LEGACY_DEFAULT_PROVIDER_ID,
                        "Default OpenAI Compatible",
                        "custom",
                        "openai_chat_completions",
                        LEGACY_DEFAULT_BASE_URL,
                        LEGACY_DEFAULT_PROVIDER_SECRET_KEY,
                        serde_json::to_string(&default_provider_capabilities())
                            .expect("capabilities should serialize"),
                        now_millis(),
                    ],
                )
                .expect("legacy provider should insert");
            transaction
                .execute(
                    "
                    INSERT INTO secrets_db.secrets(secret_key, secret_value, updated_at)
                    VALUES (?1, ?2, ?3), (?4, ?5, ?6)
                    ",
                    params![
                        LEGACY_DEFAULT_PROVIDER_SECRET_KEY,
                        "secret-a",
                        now_millis(),
                        LEGACY_CUSTOM_SECRET_KEY,
                        "secret-b",
                        now_millis(),
                    ],
                )
                .expect("legacy secrets should insert");

            let stored_settings = transaction
                .query_row(
                    "SELECT settings_json FROM app_settings WHERE id = 1",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .expect("settings row should load");
            let mut settings = serde_json::from_str::<Value>(&stored_settings)
                .expect("settings should deserialize");
            let root = settings.as_object_mut().expect("settings should be an object");
            root.insert(
                "chat_model_provider_id".to_string(),
                Value::String(LEGACY_DEFAULT_PROVIDER_ID.to_string()),
            );
            root.insert(
                "narrative_embedding_source".to_string(),
                Value::String(LEGACY_DEFAULT_SOURCE.to_string()),
            );
            root.insert(
                "narrative_embedding_base_url".to_string(),
                Value::String(LEGACY_DEFAULT_BASE_URL.to_string()),
            );
            root.insert(
                "narrative_embedding_model".to_string(),
                Value::String(LEGACY_EMBEDDING_MODEL.to_string()),
            );
            root.insert(
                "narrative_embedding_enabled".to_string(),
                Value::Bool(true),
            );
            let nested = root
                .get_mut("oai_settings")
                .and_then(Value::as_object_mut)
                .expect("nested settings should be an object");
            nested.insert(
                "chat_model_provider_id".to_string(),
                Value::String(LEGACY_DEFAULT_PROVIDER_ID.to_string()),
            );
            nested.insert(
                "narrative_embedding_source".to_string(),
                Value::String(LEGACY_DEFAULT_SOURCE.to_string()),
            );
            nested.insert(
                "narrative_embedding_base_url".to_string(),
                Value::String(LEGACY_DEFAULT_BASE_URL.to_string()),
            );
            nested.insert(
                "narrative_embedding_model".to_string(),
                Value::String(LEGACY_EMBEDDING_MODEL.to_string()),
            );
            nested.insert(
                "narrative_embedding_enabled".to_string(),
                Value::Bool(true),
            );
            save_settings_in_transaction(&transaction, &settings)
                .expect("legacy settings should save");
            transaction.commit().expect("transaction should commit");

            cleanup_legacy_default_model_provider_state()
                .expect("legacy cleanup should succeed");

            let connection = open_settings_db().expect("settings db should reopen");
            let provider_exists = connection
                .query_row(
                    "SELECT 1 FROM model_providers WHERE id = ?1 LIMIT 1",
                    params![LEGACY_DEFAULT_PROVIDER_ID],
                    |_| Ok(()),
                )
                .optional()
                .expect("provider lookup should succeed")
                .is_some();
            assert!(!provider_exists, "legacy default provider should be removed");

            let secrets = open_secrets_db().expect("secrets db should reopen");
            let secret_count = secrets
                .query_row(
                    "SELECT COUNT(*) FROM secrets WHERE secret_key IN (?1, ?2)",
                    params![
                        LEGACY_DEFAULT_PROVIDER_SECRET_KEY,
                        LEGACY_CUSTOM_SECRET_KEY
                    ],
                    |row| row.get::<_, i64>(0),
                )
                .expect("secret count should load");
            assert_eq!(secret_count, 0);

            let settings = read_stored_settings_value().expect("settings should reload");
            let root = settings.as_object().expect("settings should be an object");
            assert_eq!(
                root.get("chat_model_provider_id").and_then(Value::as_str),
                Some("")
            );
            assert_eq!(
                root.get("narrative_embedding_source").and_then(Value::as_str),
                Some("")
            );
            assert_eq!(
                root.get("narrative_embedding_base_url")
                    .and_then(Value::as_str),
                Some("")
            );
            assert_eq!(
                root.get("narrative_embedding_model").and_then(Value::as_str),
                Some("")
            );
            assert_eq!(
                root.get("narrative_embedding_enabled").and_then(Value::as_bool),
                Some(false)
            );
        });
    }
}
