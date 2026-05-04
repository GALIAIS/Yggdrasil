#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;
mod evals;
mod logs;
mod memory;
mod narrative;
mod project_store;
mod provider_protocols;
mod retrieval;
mod schemas;
mod storage;
mod world_state;

use evals::EvalRunEntry;
use futures_util::StreamExt;
use narrative::{resolve_task_route, NarrativeProviderKind, NarrativeTaskKind, NarrativeTaskRoute};
use project_store::{
    ProjectManifestRecord, ProjectPluginBindingPayload, SaveProjectManifestPayload,
};
use provider_protocols::{ProtocolRequest, ProviderProtocolConfig};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use retrieval::{RetrievalChunkRecord, RetrievalHitRecord};
use schemas::StructuredSchemaId;
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::collections::hash_map::DefaultHasher;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::thread::sleep;
use std::time::Duration;
use std::time::UNIX_EPOCH;
use storage::{ModelProviderRecord, SaveModelProviderPayload};
use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, WindowEvent};

const WINDOW_STATE_FILE_NAME: &str = "window-state.json";
const MIN_WINDOW_WIDTH: u32 = 1366;
const MIN_WINDOW_HEIGHT: u32 = 820;
static PROMPT_CACHE_REGISTRY: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendInfo {
    csrf_token: String,
    node_version: String,
    pkg_version: String,
    server_version: String,
}

#[derive(Serialize)]
struct PublicUser {
    avatar: Option<String>,
    created: u64,
    handle: String,
    name: String,
    password: bool,
}

#[derive(Serialize)]
struct CurrentUser {
    avatar: Option<String>,
    created: u64,
    handle: String,
    name: String,
    password: bool,
    admin: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthBootstrap {
    available_users: Vec<PublicUser>,
    backend: BackendInfo,
    csrf_token: String,
    current_user: Option<CurrentUser>,
    discreet_login: bool,
}

#[derive(Serialize)]
struct SettingsPayload {
    context: Vec<String>,
    enable_accounts: bool,
    enable_extensions: bool,
    enable_extensions_auto_update: bool,
    instruct: Vec<String>,
    koboldai_setting_names: Vec<String>,
    novelai_setting_names: Vec<String>,
    openai_setting_names: Vec<String>,
    #[serde(rename = "quickReplyPresets")]
    quick_reply_presets: Vec<String>,
    #[serde(rename = "rawSettings")]
    raw_settings: String,
    reasoning: Vec<String>,
    settings: Value,
    sysprompt: Vec<String>,
    textgenerationwebui_preset_names: Vec<String>,
    themes: Vec<String>,
    world_names: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCatalogEntry {
    disabled: Option<bool>,
    item_count: Option<usize>,
    kind: String,
    name: String,
    note: Option<String>,
    source_avatar: Option<String>,
    source_file_name: Option<String>,
    size_bytes: Option<u64>,
    tags: Vec<String>,
    updated_at: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCatalogPayload {
    counts: BTreeMap<String, usize>,
    disabled_extensions: Vec<String>,
    entries: BTreeMap<String, Vec<WorkspaceCatalogEntry>>,
    total_chats: usize,
    total_messages: usize,
    warning_lines: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryDocument {
    content_text: Option<String>,
    disabled: bool,
    domain: String,
    kind: String,
    name: String,
    tags: Vec<String>,
    updated_at: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TraceEntryRecord {
    avatar_url: Option<String>,
    character_name: String,
    created_at: u64,
    duration_ms: Option<u64>,
    error_text: Option<String>,
    file_name: Option<String>,
    id: String,
    model: Option<String>,
    prompt_text: Option<String>,
    provider: String,
    request_payload: Option<String>,
    response_text: Option<String>,
    session_id: Option<String>,
    token_count: Option<u64>,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionSummaryRecord {
    avatar_url: Option<String>,
    content: String,
    file_name: Option<String>,
    id: String,
    source_signature: Option<String>,
    source_message_end: Option<i64>,
    source_message_start: Option<i64>,
    summary_kind: String,
    updated_at: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatStreamEventPayload {
    stream_id: String,
    delta: String,
    done: bool,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatStreamStartResult {
    started: bool,
}

#[derive(Serialize, serde::Deserialize, Clone)]
struct NarrativeMemoryRecord {
    content: String,
    importance: f64,
    kind: String,
    tags: Vec<String>,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NarrativeMemoryEntry {
    id: String,
    character_name: String,
    content: String,
    created_at: u64,
    file_name: Option<String>,
    importance: f64,
    kind: String,
    summary: String,
    tags: Vec<String>,
    updated_at: u64,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NarrativeMemoryCandidateEntry {
    id: String,
    character_name: String,
    content: String,
    created_at: u64,
    domain: String,
    file_name: Option<String>,
    importance: f64,
    kind: String,
    source_session_id: Option<String>,
    status: String,
    summary: String,
    tags: Vec<String>,
    updated_at: u64,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NarrativeMemoryHitEntry {
    created_at: u64,
    hit_score: f64,
    id: i64,
    memory_id: String,
    query_text: String,
    session_id: Option<String>,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WorldStateItemEntry {
    detail: String,
    id: String,
    name: String,
    status: String,
    tags: Vec<String>,
    updated_at: u64,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WorldStateSnapshotEntry {
    avatar_url: Option<String>,
    factions: Vec<WorldStateItemEntry>,
    file_name: Option<String>,
    inventory_items: Vec<WorldStateItemEntry>,
    locations: Vec<WorldStateItemEntry>,
    lorebook_name: Option<String>,
    quests: Vec<WorldStateItemEntry>,
    relationships: Vec<WorldStateItemEntry>,
    scene_states: Vec<WorldStateItemEntry>,
    session_id: String,
    summary: String,
    updated_at: u64,
}

#[derive(Serialize)]
struct NarrativeMemoryExtractionResult {
    candidate_memories: Vec<NarrativeMemoryRecord>,
    open_threads: Vec<String>,
    stored_count: usize,
    summary: String,
}

#[derive(Clone)]
struct NarrativeEmbeddingRoute {
    endpoint: String,
    headers: HeaderMap,
    model: String,
    protocol: String,
}

struct ResolvedOpenAiChatRoute {
    provider_label: String,
    protocol: String,
    route: NarrativeTaskRoute,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LorebookSnippet {
    book_name: String,
    content: String,
    keys: Vec<String>,
    score: f64,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CharacterSnippet {
    character_name: String,
    content: String,
    score: f64,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionSnippet {
    content: String,
    ordinal: usize,
    role: String,
    score: f64,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RetrievalHitSummary {
    domain: String,
    hit_id: String,
    score: f64,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WorldStateSnippet {
    category: String,
    detail: String,
    entity: String,
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RetrievalJobEntry {
    created_at: u64,
    detail_json: String,
    id: String,
    source_id: String,
    source_type: String,
    status: String,
    updated_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RetrievalHitEntry {
    created_at: u64,
    hit_domain: String,
    hit_id: String,
    id: i64,
    query_text: String,
    score: f64,
}

struct RerankedGenerationContext {
    character_snippets: Vec<CharacterSnippet>,
    lorebook_snippets: Vec<LorebookSnippet>,
    narrative_memories: Vec<NarrativeMemoryEntry>,
    retrieval_hits: Vec<RetrievalHitSummary>,
    session_snippets: Vec<SessionSnippet>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerationContextPayload {
    character_snippets: Vec<CharacterSnippet>,
    directive_snippets: Vec<DirectiveSnippet>,
    lorebook_snippets: Vec<LorebookSnippet>,
    narrative_memories: Vec<NarrativeMemoryEntry>,
    retrieval_hits: Vec<RetrievalHitSummary>,
    session_snippets: Vec<SessionSnippet>,
    world_state_snippets: Vec<WorldStateSnippet>,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DirectiveSnippet {
    content: String,
    label: String,
    source_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LogDocumentPayload {
    content: String,
    name: String,
    size_bytes: u64,
    updated_at: Option<u64>,
}

#[derive(Serialize)]
struct CharacterSummary {
    alternate_greetings: Vec<String>,
    avatar: String,
    chat_size: usize,
    date_last_chat: Option<u64>,
    description: String,
    first_mes: String,
    mes_example: String,
    name: String,
    personality: String,
    post_history_instructions: String,
    scenario: String,
    system_prompt: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CharacterChatSummary {
    chat_items: usize,
    file_id: String,
    file_name: String,
    file_size: String,
    last_mes: Option<u64>,
    mes: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveChatResult {
    ok: bool,
}

#[derive(serde::Deserialize)]
struct SaveCharacterPayload {
    alternate_greetings: Option<Vec<String>>,
    avatar: Option<String>,
    avatar_data_url: Option<String>,
    description: Option<String>,
    first_mes: Option<String>,
    mes_example: Option<String>,
    name: String,
    personality: Option<String>,
    post_history_instructions: Option<String>,
    scenario: Option<String>,
    system_prompt: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveLibraryDocumentPayload {
    content_text: Option<String>,
    domain: String,
    kind: String,
    name: String,
    tags: Option<Vec<String>>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveSessionSummaryPayload {
    avatar_url: Option<String>,
    content: String,
    file_name: Option<String>,
    id: Option<String>,
    source_signature: Option<String>,
    source_message_end: Option<i64>,
    source_message_start: Option<i64>,
    summary_kind: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteSessionSummaryPayload {
    avatar_url: Option<String>,
    file_name: Option<String>,
    id: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RebuildWorldStatePayload {
    avatar_url: Option<String>,
    file_name: Option<String>,
    lorebook_name: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorldStateUpdateRecord {
    entity: String,
    field: String,
    next_value: Value,
    reason: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApplyWorldStateUpdatesPayload {
    avatar_url: Option<String>,
    file_name: Option<String>,
    updates: Vec<WorldStateUpdateRecord>,
}

#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TraceContextPayload {
    avatar_url: Option<String>,
    character_name: Option<String>,
    file_name: Option<String>,
    generation_context: Option<TraceGenerationContextPayload>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewNarrativeMemoryCandidatePayload {
    action: String,
    candidate_id: String,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TraceGenerationContextPayload {
    character_snippets: Vec<CharacterSnippet>,
    context_budget: Option<TraceContextBudgetPayload>,
    directive_snippets: Vec<DirectiveSnippet>,
    lorebook_snippets: Vec<LorebookSnippet>,
    narrative_memories: Vec<NarrativeMemoryEntry>,
    query: String,
    retrieval_hits: Vec<RetrievalHitSummary>,
    session_snippets: Vec<SessionSnippet>,
    world_state_snippets: Vec<WorldStateSnippet>,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TraceContextBudgetPayload {
    dropped: Vec<TraceContextBudgetEntryPayload>,
    kept: Vec<TraceContextBudgetEntryPayload>,
    recent_messages_kept: Option<usize>,
    reserved_output: usize,
    summary_kinds_used: Option<Vec<String>>,
    usable_input_budget: usize,
    used_tokens: usize,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TraceContextBudgetEntryPayload {
    estimated_tokens: usize,
    layer: String,
    preview: String,
    reason: Option<String>,
    source: String,
}

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PromptCacheTraceMetadata {
    fingerprint: String,
    schema_id: Option<String>,
    stable_prefix_chars: usize,
    stable_prefix_messages: usize,
    stable_prefix_sections: Vec<String>,
    status: String,
}

#[derive(Serialize)]
struct BackendConnectionStatus {
    message: String,
    ok: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelProviderModelsPayload {
    models: Vec<String>,
}

#[derive(Serialize, serde::Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct StoredWindowState {
    width: Option<u32>,
    height: Option<u32>,
    x: Option<i32>,
    y: Option<i32>,
    maximized: bool,
}

#[tauri::command]
fn tauri_backend_info() -> BackendInfo {
    backend_info()
}

#[tauri::command]
fn tauri_auth_bootstrap() -> AuthBootstrap {
    let backend = backend_info();
    let (handle, name) = local_identity();
    let created = current_timestamp_secs();
    let current_user = CurrentUser {
        avatar: None,
        created,
        handle: handle.clone(),
        name: name.clone(),
        password: false,
        admin: true,
    };
    let public_user = PublicUser {
        avatar: None,
        created,
        handle,
        name,
        password: false,
    };

    AuthBootstrap {
        available_users: vec![public_user],
        csrf_token: backend.csrf_token.clone(),
        backend,
        current_user: Some(current_user),
        discreet_login: false,
    }
}

#[tauri::command]
fn tauri_login(handle: String) -> Result<Value, String> {
    Ok(serde_json::json!({ "handle": handle }))
}

#[tauri::command]
fn tauri_logout() -> Result<Value, String> {
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
fn tauri_fetch_settings() -> Result<SettingsPayload, String> {
    storage::fetch_settings_payload()
}

#[tauri::command]
fn tauri_fetch_workspace_catalog() -> Result<WorkspaceCatalogPayload, String> {
    let (log_entries, warning_lines) = collect_log_entries()?;
    storage::fetch_workspace_catalog(log_entries, warning_lines)
}

#[tauri::command]
fn tauri_fetch_characters() -> Result<Vec<CharacterSummary>, String> {
    storage::fetch_characters()
}

#[tauri::command]
fn tauri_fetch_character_chats(avatar_url: String) -> Result<Vec<CharacterChatSummary>, String> {
    storage::fetch_character_chats(&avatar_url)
}

#[tauri::command]
fn tauri_fetch_chat(avatar_url: String, file_name: String) -> Result<Vec<Value>, String> {
    storage::fetch_chat(&avatar_url, &file_name)
}

#[tauri::command]
fn tauri_fetch_session_summaries(
    avatar_url: Option<String>,
    file_name: Option<String>,
) -> Result<Vec<SessionSummaryRecord>, String> {
    storage::fetch_session_summaries(avatar_url.as_deref(), file_name.as_deref())
}

#[tauri::command]
fn tauri_save_chat(
    avatar_url: String,
    file_name: String,
    chat: Vec<Value>,
) -> Result<SaveChatResult, String> {
    storage::save_chat(&avatar_url, &file_name, &chat).map_err(|error| {
        format!(
            "保存聊天失败: avatar={}, file={}, messages={}, cause={}",
            avatar_url,
            file_name,
            chat.len(),
            error
        )
    })?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_resolve_avatar_path(avatar_url: String) -> Result<String, String> {
    storage::resolve_avatar_path(&avatar_url)
}

#[tauri::command]
fn tauri_read_avatar_data_url(avatar_url: String) -> Result<String, String> {
    let path = storage::resolve_avatar_path(&avatar_url)?;
    let bytes = fs::read(&path).map_err(to_string_error)?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:image/png;base64,{encoded}"))
}

#[tauri::command]
fn tauri_save_settings(settings: Value) -> Result<SaveChatResult, String> {
    storage::save_settings(&settings)?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_save_settings_with_secret(
    settings: Value,
    secret_key: String,
    secret_value: String,
) -> Result<SaveChatResult, String> {
    storage::save_settings_with_secret(&settings, &secret_key, &secret_value)?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_fetch_model_providers() -> Result<Vec<ModelProviderRecord>, String> {
    storage::fetch_model_providers()
}

#[tauri::command]
fn tauri_save_model_provider(
    payload: SaveModelProviderPayload,
) -> Result<ModelProviderRecord, String> {
    storage::save_model_provider(payload)
}

#[tauri::command]
fn tauri_delete_model_provider(id: String) -> Result<SaveChatResult, String> {
    storage::delete_model_provider(&id)?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_save_character(payload: SaveCharacterPayload) -> Result<CharacterSummary, String> {
    storage::save_character(payload)
}

#[tauri::command]
fn tauri_delete_character(avatar: String) -> Result<SaveChatResult, String> {
    storage::delete_character(&avatar)?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_fetch_library_documents(domain: String) -> Result<Vec<LibraryDocument>, String> {
    storage::fetch_library_documents(&domain)
}

#[tauri::command]
fn tauri_save_library_document(
    payload: SaveLibraryDocumentPayload,
) -> Result<LibraryDocument, String> {
    storage::save_library_document(payload)
}

#[tauri::command]
fn tauri_save_session_summary(
    payload: SaveSessionSummaryPayload,
) -> Result<SessionSummaryRecord, String> {
    storage::save_session_summary(payload)
}

#[tauri::command]
fn tauri_delete_session_summary(payload: DeleteSessionSummaryPayload) -> Result<usize, String> {
    storage::delete_session_summary(payload)
}

#[tauri::command]
fn tauri_fetch_project_manifests() -> Result<Vec<ProjectManifestRecord>, String> {
    project_store::fetch_project_manifests()
}

#[tauri::command]
fn tauri_save_project_manifest(
    payload: SaveProjectManifestPayload,
) -> Result<ProjectManifestRecord, String> {
    project_store::save_project_manifest(payload)
}

#[tauri::command]
fn tauri_fetch_world_state_snapshot(
    avatar_url: Option<String>,
    file_name: Option<String>,
) -> Result<Option<WorldStateSnapshotEntry>, String> {
    storage::fetch_world_state_snapshot(avatar_url.as_deref(), file_name.as_deref())
}

#[tauri::command]
fn tauri_rebuild_world_state_snapshot(
    payload: RebuildWorldStatePayload,
) -> Result<WorldStateSnapshotEntry, String> {
    storage::rebuild_world_state_snapshot(
        payload.avatar_url.as_deref(),
        payload.file_name.as_deref(),
        payload.lorebook_name.as_deref(),
    )
}

#[tauri::command]
fn tauri_apply_world_state_updates(
    payload: ApplyWorldStateUpdatesPayload,
) -> Result<WorldStateSnapshotEntry, String> {
    storage::apply_world_state_updates(
        payload.avatar_url.as_deref(),
        payload.file_name.as_deref(),
        &payload.updates,
    )
}

#[tauri::command]
fn tauri_delete_library_document(domain: String, name: String) -> Result<SaveChatResult, String> {
    storage::delete_library_document(&domain, &name)?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_delete_project_manifest(name: String) -> Result<SaveChatResult, String> {
    project_store::delete_project_manifest(&name)?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_create_backup() -> Result<LibraryDocument, String> {
    storage::create_backup()
}

#[tauri::command]
fn tauri_restore_backup(name: String) -> Result<SaveChatResult, String> {
    storage::restore_backup(&name)?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_fetch_trace_entries(
    avatar_url: Option<String>,
    file_name: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<TraceEntryRecord>, String> {
    storage::fetch_trace_entries(
        avatar_url.as_deref(),
        file_name.as_deref(),
        limit.unwrap_or(24),
    )
}

#[tauri::command]
fn tauri_fetch_narrative_memories(
    avatar_url: Option<String>,
    file_name: Option<String>,
    query: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<NarrativeMemoryEntry>, String> {
    storage::fetch_narrative_memories(
        avatar_url.as_deref(),
        file_name.as_deref(),
        query.as_deref(),
        limit.unwrap_or(8),
    )
}

#[tauri::command]
fn tauri_fetch_narrative_memory_candidates(
    avatar_url: Option<String>,
    file_name: Option<String>,
    query: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<NarrativeMemoryCandidateEntry>, String> {
    storage::fetch_narrative_memory_candidates(
        avatar_url.as_deref(),
        file_name.as_deref(),
        query.as_deref(),
        limit.unwrap_or(8),
    )
}

#[tauri::command]
fn tauri_review_narrative_memory_candidate(
    payload: ReviewNarrativeMemoryCandidatePayload,
) -> Result<SaveChatResult, String> {
    storage::review_narrative_memory_candidate(&payload.candidate_id, &payload.action)?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_delete_narrative_memory(memory_id: String) -> Result<SaveChatResult, String> {
    storage::delete_narrative_memory(&memory_id)?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_delete_narrative_memory_candidate(candidate_id: String) -> Result<SaveChatResult, String> {
    storage::delete_narrative_memory_candidate(&candidate_id)?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_fetch_retrieval_jobs(
    file_name: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<RetrievalJobEntry>, String> {
    retrieval::fetch_retrieval_jobs(file_name.as_deref(), limit.unwrap_or(10))
}

#[tauri::command]
fn tauri_fetch_retrieval_hits(
    query_text: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<RetrievalHitEntry>, String> {
    retrieval::fetch_retrieval_hits(query_text.as_deref(), limit.unwrap_or(20))
}

#[tauri::command]
fn tauri_fetch_memory_hits(
    avatar_url: Option<String>,
    file_name: Option<String>,
    query: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<NarrativeMemoryHitEntry>, String> {
    storage::fetch_memory_hits(
        avatar_url.as_deref(),
        file_name.as_deref(),
        query.as_deref(),
        limit.unwrap_or(16),
    )
}

#[tauri::command]
fn tauri_clear_memory_hits(
    avatar_url: Option<String>,
    file_name: Option<String>,
    query: Option<String>,
) -> Result<SaveChatResult, String> {
    storage::clear_memory_hits(
        avatar_url.as_deref(),
        file_name.as_deref(),
        query.as_deref(),
    )?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
async fn tauri_retrieve_narrative_memories(
    avatar_url: Option<String>,
    file_name: Option<String>,
    query: Option<String>,
    limit: Option<usize>,
    settings: Value,
) -> Result<Vec<NarrativeMemoryEntry>, String> {
    let requested_limit = limit.unwrap_or(8).clamp(1, 12);
    let lexical_limit = requested_limit.max(48);
    let trimmed_query = query.unwrap_or_default();
    let lexical_candidates = storage::fetch_narrative_memories(
        avatar_url.as_deref(),
        file_name.as_deref(),
        Some(trimmed_query.as_str()),
        lexical_limit,
    )?;

    if lexical_candidates.is_empty() {
        return Ok(vec![]);
    }

    let mut lexical_fallback = lexical_candidates.clone();
    lexical_fallback.truncate(requested_limit);
    if trimmed_query.trim().is_empty() {
        return Ok(lexical_fallback);
    }

    let Some(route) = build_narrative_embedding_route(&settings)? else {
        let _ = storage::save_memory_hits(
            avatar_url.as_deref(),
            file_name.as_deref(),
            trimmed_query.as_str(),
            &lexical_fallback,
        );
        return Ok(lexical_fallback);
    };

    let query_vectors = match request_openai_embeddings(&route, &[trimmed_query.clone()]).await {
        Ok(vectors) if vectors.len() == 1 => vectors,
        Ok(_) => {
            let _ = storage::save_memory_hits(
                avatar_url.as_deref(),
                file_name.as_deref(),
                trimmed_query.as_str(),
                &lexical_fallback,
            );
            return Ok(lexical_fallback);
        }
        Err(_) => {
            let _ = storage::save_memory_hits(
                avatar_url.as_deref(),
                file_name.as_deref(),
                trimmed_query.as_str(),
                &lexical_fallback,
            );
            return Ok(lexical_fallback);
        }
    };
    let query_vector = &query_vectors[0];

    let mut ranked = Vec::new();
    let mut missing_entries = Vec::new();
    let mut missing_inputs = Vec::new();

    for (index, entry) in lexical_candidates.iter().cloned().enumerate() {
        match storage::read_narrative_memory_embedding(&entry.id, &route.model, entry.updated_at)? {
            Some(vector) => ranked.push((entry, vector, index)),
            None => {
                missing_inputs.push(build_narrative_memory_embedding_input(&entry));
                missing_entries.push((entry, index));
            }
        }
    }

    if !missing_entries.is_empty() {
        match request_openai_embeddings(&route, &missing_inputs).await {
            Ok(vectors) if vectors.len() == missing_entries.len() => {
                for ((entry, index), vector) in missing_entries.into_iter().zip(vectors.into_iter())
                {
                    let _ = storage::upsert_narrative_memory_embedding(
                        &entry.id,
                        &route.model,
                        &vector,
                        entry.updated_at,
                    );
                    ranked.push((entry, vector, index));
                }
            }
            _ => {
                let _ = storage::save_memory_hits(
                    avatar_url.as_deref(),
                    file_name.as_deref(),
                    trimmed_query.as_str(),
                    &lexical_fallback,
                );
                return Ok(lexical_fallback);
            }
        }
    }

    ranked.sort_by(
        |(left_entry, left_vector, left_index), (right_entry, right_vector, right_index)| {
            let left_score = score_hybrid_narrative_memory(
                query_vector,
                left_vector,
                *left_index,
                lexical_candidates.len(),
                left_entry.importance,
            );
            let right_score = score_hybrid_narrative_memory(
                query_vector,
                right_vector,
                *right_index,
                lexical_candidates.len(),
                right_entry.importance,
            );

            right_score
                .partial_cmp(&left_score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| right_entry.updated_at.cmp(&left_entry.updated_at))
        },
    );

    let ranked_entries = ranked
        .into_iter()
        .map(|(entry, _, _)| entry)
        .take(requested_limit)
        .collect::<Vec<_>>();
    let _ = storage::save_memory_hits(
        avatar_url.as_deref(),
        file_name.as_deref(),
        trimmed_query.as_str(),
        &ranked_entries,
    );
    Ok(ranked_entries)
}

#[tauri::command]
async fn tauri_retrieve_generation_context(
    avatar_url: Option<String>,
    file_name: Option<String>,
    query: Option<String>,
    active_world_names: Option<Vec<String>>,
    settings: Value,
) -> Result<GenerationContextPayload, String> {
    let normalized_query = query.unwrap_or_default();
    let avatar_ref = avatar_url.as_deref();
    let file_ref = file_name.as_deref();
    let active_world_names = active_world_names.unwrap_or_default();
    let retrieval_query = match rewrite_retrieval_query(&settings, &normalized_query).await {
        Ok(Some(rewritten)) if !rewritten.trim().is_empty() => {
            if rewritten.trim() == normalized_query.trim() {
                normalized_query.clone()
            } else {
                format!("{}\n{}", normalized_query.trim(), rewritten.trim())
                    .trim()
                    .to_string()
            }
        }
        _ => normalized_query.clone(),
    };
    let narrative_memories = tauri_retrieve_narrative_memories(
        avatar_url.clone(),
        file_name.clone(),
        Some(retrieval_query.clone()),
        Some(6),
        settings.clone(),
    )
    .await?;
    if avatar_ref
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
        && file_ref
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_some()
    {
        storage::rebuild_world_state_snapshot(avatar_ref, file_ref, None)?;
    }
    let lorebook_snippets = retrieve_lorebook_snippets(active_world_names, &retrieval_query)?;
    let session_snippets = retrieve_session_snippets(file_ref, avatar_ref, &retrieval_query)?;
    let character_snippets = retrieve_character_snippets(avatar_ref, &retrieval_query)?;
    let directive_snippets = retrieve_directive_snippets(&settings)?;
    let world_state_snippets = storage::fetch_world_state_snapshot(avatar_ref, file_ref)?
        .map(build_world_state_snippets)
        .unwrap_or_default();
    let retrieval_hits = build_retrieval_hit_summaries(
        &character_snippets,
        &session_snippets,
        &lorebook_snippets,
        &narrative_memories,
    );
    let candidate_counts = json!({
        "character": character_snippets.len(),
        "session": session_snippets.len(),
        "world": lorebook_snippets.len(),
        "worldState": world_state_snippets.len(),
        "memory": narrative_memories.len(),
        "retrievalHits": retrieval_hits.len(),
    });
    let reranked = rerank_generation_context(
        &retrieval_query,
        character_snippets,
        session_snippets,
        lorebook_snippets,
        narrative_memories,
        retrieval_hits,
    );
    let raw_hits = reranked
        .retrieval_hits
        .iter()
        .map(|item| RetrievalHitRecord {
            domain: item.domain.clone(),
            hit_id: item.hit_id.clone(),
            score: item.score,
        })
        .collect::<Vec<_>>();
    let raw_chunks = build_retrieval_chunk_records(
        avatar_ref,
        file_ref,
        &reranked.character_snippets,
        &reranked.session_snippets,
        &reranked.lorebook_snippets,
        &reranked.narrative_memories,
    );
    let _ = retrieval::upsert_retrieval_chunks(&raw_chunks);
    let _ = retrieval::save_retrieval_hits(&retrieval_query, &raw_hits);
    let retrieval_job_payload = serde_json::to_string(&json!({
        "originalQuery": normalized_query,
        "query": retrieval_query,
        "counts": candidate_counts,
        "weights": retrieval_domain_weights(),
        "hits": reranked.retrieval_hits,
    }))
    .unwrap_or_else(|_| "{}".to_string());
    let retrieval_job_id = format!("ctx::{}::{}", current_timestamp_millis(), raw_hits.len());
    let _ = retrieval::save_retrieval_job(
        &retrieval_job_id,
        "generation_context",
        file_ref.unwrap_or("global"),
        "completed",
        &retrieval_job_payload,
    );

    Ok(GenerationContextPayload {
        character_snippets: reranked.character_snippets,
        directive_snippets,
        lorebook_snippets: reranked.lorebook_snippets,
        narrative_memories: reranked.narrative_memories,
        retrieval_hits: reranked.retrieval_hits,
        session_snippets: reranked.session_snippets,
        world_state_snippets,
    })
}

async fn rewrite_retrieval_query(settings: &Value, query: &str) -> Result<Option<String>, String> {
    if query.trim().is_empty() {
        return Ok(None);
    }

    let route = resolve_task_route(settings, NarrativeTaskKind::RetrievalQueryRewrite, None)?;
    if route.provider != NarrativeProviderKind::OpenAi || route.model.trim().is_empty() {
        return Ok(None);
    }

    let messages = vec![
        json!({
            "role": "system",
            "content": "Rewrite the user request into a short retrieval query for narrative memory and lorebook lookup. Return plain text only. Prefer concrete names, locations, factions, items, goals, unresolved events, and scene keywords. Keep it under 24 words."
        }),
        json!({
            "role": "user",
            "content": query.trim(),
        }),
    ];

    let (_, _, _, payload, _) = execute_openai_chat_task(&messages, settings, &route).await?;
    let rewritten = extract_chat_completion_reply(&payload)
        .replace('\r', " ")
        .replace('\n', " ")
        .trim()
        .trim_matches('"')
        .trim()
        .to_string();

    if rewritten.is_empty() {
        Ok(None)
    } else {
        Ok(Some(rewritten))
    }
}

#[tauri::command]
fn tauri_clear_trace_entries(
    avatar_url: Option<String>,
    file_name: Option<String>,
) -> Result<SaveChatResult, String> {
    storage::clear_trace_entries(avatar_url.as_deref(), file_name.as_deref())?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_export_trace_entries(
    avatar_url: Option<String>,
    file_name: Option<String>,
) -> Result<String, String> {
    storage::export_trace_entries(avatar_url.as_deref(), file_name.as_deref())
}

#[tauri::command]
fn tauri_fetch_eval_runs(
    avatar_url: Option<String>,
    file_name: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<EvalRunEntry>, String> {
    storage::fetch_eval_runs(
        avatar_url.as_deref(),
        file_name.as_deref(),
        limit.unwrap_or(12),
    )
}

#[tauri::command]
fn tauri_run_local_eval(
    avatar_url: Option<String>,
    file_name: Option<String>,
) -> Result<EvalRunEntry, String> {
    storage::run_local_eval(avatar_url.as_deref(), file_name.as_deref())
}

#[tauri::command]
fn tauri_delete_chat(avatar_url: String, file_name: String) -> Result<SaveChatResult, String> {
    storage::delete_chat(&avatar_url, &file_name).map_err(|error| {
        format!(
            "删除聊天失败: avatar={}, file={}, cause={}",
            avatar_url, file_name, error
        )
    })?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_rename_chat(
    avatar_url: String,
    file_name: String,
    next_file_name: String,
) -> Result<SaveChatResult, String> {
    storage::rename_chat(&avatar_url, &file_name, &next_file_name).map_err(|error| {
        format!(
            "重命名聊天失败: avatar={}, file={}, next={}, cause={}",
            avatar_url, file_name, next_file_name, error
        )
    })?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_duplicate_chat(
    avatar_url: String,
    file_name: String,
    next_file_name: String,
) -> Result<SaveChatResult, String> {
    storage::duplicate_chat(&avatar_url, &file_name, &next_file_name).map_err(|error| {
        format!(
            "复制聊天失败: avatar={}, file={}, next={}, cause={}",
            avatar_url, file_name, next_file_name, error
        )
    })?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_export_chat(
    avatar_url: String,
    file_name: String,
    format: Option<String>,
) -> Result<String, String> {
    storage::export_chat(
        &avatar_url,
        &file_name,
        format.as_deref().unwrap_or("jsonl"),
    )
    .map_err(|error| {
        format!(
            "导出聊天失败: avatar={}, file={}, format={}, cause={}",
            avatar_url,
            file_name,
            format.as_deref().unwrap_or("jsonl"),
            error
        )
    })
}

#[tauri::command]
fn tauri_export_library_document(
    domain: String,
    name: String,
    format: Option<String>,
) -> Result<String, String> {
    storage::export_library_document(&domain, &name, format.as_deref().unwrap_or("json")).map_err(
        |error| {
            format!(
                "导出资源失败: domain={}, name={}, format={}, cause={}",
                domain,
                name,
                format.as_deref().unwrap_or("json"),
                error
            )
        },
    )
}

#[tauri::command]
fn tauri_export_project_manifest(name: String) -> Result<String, String> {
    project_store::export_project_manifest(&name)
}

#[tauri::command]
fn tauri_import_project_manifest(raw_json: String) -> Result<ProjectManifestRecord, String> {
    project_store::import_project_manifest(&raw_json)
}

#[tauri::command]
fn tauri_set_project_plugin_binding(
    payload: ProjectPluginBindingPayload,
) -> Result<ProjectManifestRecord, String> {
    project_store::set_project_plugin_binding(payload)
}

#[tauri::command]
fn tauri_read_secret(secret_key: String) -> Result<String, String> {
    storage::read_secret(&secret_key)
}

#[tauri::command]
fn tauri_fetch_log_document(name: String) -> Result<LogDocumentPayload, String> {
    logs::fetch_log_document(&name)
}

#[tauri::command]
fn tauri_export_log_document(name: String) -> Result<String, String> {
    logs::export_log_document(&name)
}

#[tauri::command]
fn tauri_clear_log_document(name: String) -> Result<SaveChatResult, String> {
    logs::clear_log_document(&name)
}

#[tauri::command]
fn tauri_export_logs_bundle() -> Result<String, String> {
    logs::export_logs_bundle()
}

#[tauri::command]
fn tauri_append_runtime_log(
    level: String,
    category: String,
    event: String,
    message: String,
    payload: Option<Value>,
) -> Result<SaveChatResult, String> {
    logs::append_runtime_log(&level, &category, &event, &message, payload)?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
fn tauri_write_secret(secret_key: String, secret_value: String) -> Result<SaveChatResult, String> {
    storage::write_secret(&secret_key, &secret_value)?;
    Ok(SaveChatResult { ok: true })
}

#[tauri::command]
async fn tauri_check_chat_completion_status(
    source: String,
    base_url: String,
    model: String,
    api_key: String,
    protocol: Option<String>,
    api_version: Option<String>,
    deployment_name: Option<String>,
) -> Result<BackendConnectionStatus, String> {
    let trimmed_model = model.trim();
    if trimmed_model.is_empty() {
        return Err("当前缺少可测试的模型名称。".to_string());
    }

    let protocol =
        provider_protocols::normalize_provider_protocol(protocol.as_deref(), source.trim());
    let request = provider_protocols::build_chat_probe_request(
        &ProviderProtocolConfig {
            api_key: api_key.trim(),
            api_version: api_version.as_deref(),
            base_url: base_url.trim(),
            deployment_name: deployment_name.as_deref(),
            provider_type: source.trim(),
            protocol: &protocol,
        },
        trimmed_model,
    );
    let request = request?;

    let client = reqwest::Client::new();
    let response = client
        .post(request.endpoint)
        .headers(request.headers)
        .json(&request.body)
        .send()
        .await
        .map_err(to_string_error)?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("连接测试失败 ({}): {}", status, text.trim()));
    }

    Ok(BackendConnectionStatus {
        ok: true,
        message: format!("{} 已可用", trimmed_model),
    })
}

#[tauri::command]
async fn tauri_fetch_chat_completion_models(
    source: String,
    base_url: String,
    api_key: String,
    protocol: Option<String>,
    api_version: Option<String>,
    deployment_name: Option<String>,
) -> Result<Vec<String>, String> {
    let protocol =
        provider_protocols::normalize_provider_protocol(protocol.as_deref(), source.trim());
    let (endpoint, headers) = provider_protocols::build_models_endpoint_and_headers(
        &ProviderProtocolConfig {
            api_key: api_key.trim(),
            api_version: api_version.as_deref(),
            base_url: base_url.trim(),
            deployment_name: deployment_name.as_deref(),
            provider_type: source.trim(),
            protocol: &protocol,
        },
        "chat",
    )?;

    let client = reqwest::Client::new();
    let response = client
        .get(endpoint)
        .headers(headers)
        .send()
        .await
        .map_err(to_string_error)?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("模型列表请求失败 ({}): {}", status, text.trim()));
    }

    let payload: Value = response.json().await.map_err(to_string_error)?;
    let models = extract_model_ids_from_payload(&payload);

    if models.is_empty() {
        return Err("模型列表为空，接口未返回可用模型。".to_string());
    }

    Ok(models)
}

#[tauri::command]
async fn tauri_fetch_model_provider_models(
    provider_type: String,
    base_url: String,
    api_key: String,
    capability: String,
    protocol: Option<String>,
    api_version: Option<String>,
    deployment_name: Option<String>,
) -> Result<ModelProviderModelsPayload, String> {
    let capability = capability.trim().to_ascii_lowercase();
    let protocol =
        provider_protocols::normalize_provider_protocol(protocol.as_deref(), provider_type.trim());
    if !provider_protocols::protocol_supports_capability(&protocol, &capability) {
        return Err(format!("协议 {protocol} 不支持 {capability} 能力。"));
    }
    let (endpoint, headers) = provider_protocols::build_models_endpoint_and_headers(
        &ProviderProtocolConfig {
            api_key: api_key.trim(),
            api_version: api_version.as_deref(),
            base_url: base_url.trim(),
            deployment_name: deployment_name.as_deref(),
            provider_type: provider_type.trim(),
            protocol: &protocol,
        },
        &capability,
    )?;

    let response = reqwest::Client::new()
        .get(endpoint)
        .headers(headers)
        .send()
        .await
        .map_err(to_string_error)?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("模型列表请求失败 ({}): {}", status, text.trim()));
    }

    let payload: Value = response.json().await.map_err(to_string_error)?;
    let models = extract_model_ids_from_payload(&payload);
    if models.is_empty() {
        return Err("模型列表为空，接口未返回可用模型。".to_string());
    }

    Ok(ModelProviderModelsPayload { models })
}

#[tauri::command]
async fn tauri_check_text_generation_status(
    api_server: String,
    api_type: String,
) -> Result<BackendConnectionStatus, String> {
    let base_url = trim_v1(&normalize_localhost(api_server));
    let url = match api_type.as_str() {
        "generic" | "ooba" | "vllm" | "aphrodite" | "koboldcpp" | "llamacpp" | "infermaticai"
        | "openrouter" | "featherless" => format!("{base_url}/v1/models"),
        "dreamgen" => format!("{base_url}/api/openai/v1/models"),
        "mancer" => format!("{base_url}/oai/v1/models"),
        "tabby" => format!("{base_url}/v1/model/list"),
        "togetherai" => format!("{base_url}/api/models?&info"),
        "ollama" => format!("{base_url}/api/tags"),
        "huggingface" => format!("{base_url}/info"),
        other => return Err(format!("暂不支持的 TextGen 类型: {other}")),
    };

    let client = reqwest::Client::new();
    let response = client.get(url).send().await.map_err(to_string_error)?;

    if !response.status().is_success() {
        return Err(format!(
            "TextGen 状态检查失败：{} {}",
            response.status(),
            response.status().canonical_reason().unwrap_or("Unknown")
        ));
    }

    let payload: Value = response.json().await.map_err(to_string_error)?;
    let model_ids = extract_textgen_model_ids(&payload, &api_type);
    let result = model_ids
        .first()
        .cloned()
        .unwrap_or_else(|| "Valid".to_string());

    Ok(BackendConnectionStatus {
        ok: true,
        message: result,
    })
}

#[tauri::command]
async fn tauri_check_novel_status() -> Result<BackendConnectionStatus, String> {
    let api_key = read_secret("api_key_novel")?;
    if api_key.trim().is_empty() {
        return Err(
            "NovelAI 状态检查失败：当前桌面内嵌后端未配置可用的 Novel Access Token。".to_string(),
        );
    }

    let client = reqwest::Client::new();
    let response = client
        .get("https://api.novelai.net/user/subscription")
        .header(CONTENT_TYPE, "application/json")
        .header(AUTHORIZATION, bearer_header(&api_key)?)
        .send()
        .await
        .map_err(to_string_error)?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("NovelAI 鉴权失败，请检查桌面内嵌后端中的 Novel 密钥配置。".to_string());
    }

    if !response.status().is_success() {
        return Err(format!(
            "NovelAI 状态检查失败：{} {}",
            response.status(),
            response.status().canonical_reason().unwrap_or("Unknown")
        ));
    }

    let payload: Value = response.json().await.map_err(to_string_error)?;
    let tier = payload
        .get("tier")
        .and_then(Value::as_i64)
        .map(|value| value.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let anlas = payload
        .get("trainingStepsLeft")
        .and_then(|value| value.get("fixedTrainingStepsLeft"))
        .and_then(Value::as_i64)
        .map(|value| value.to_string())
        .unwrap_or_else(|| "unknown".to_string());

    Ok(BackendConnectionStatus {
        ok: true,
        message: format!("NovelAI 已连接（tier={tier}, anlas={anlas}）"),
    })
}

#[tauri::command]
async fn tauri_generate_openai_chat(
    messages: Vec<Value>,
    settings: Value,
    task_kind: Option<String>,
    trace_context: Option<TraceContextPayload>,
) -> Result<String, String> {
    let started_at = current_timestamp_millis();
    let route = resolve_task_route(
        &settings,
        match task_kind.as_deref() {
            Some("draft_assist") => NarrativeTaskKind::DraftAssist,
            Some("summarize_memory") => NarrativeTaskKind::SummarizeMemory,
            _ => NarrativeTaskKind::ChatReply,
        },
        None,
    )?;
    let (source, model, body, payload, prompt_text) =
        execute_openai_chat_task(&messages, &settings, &route).await?;
    let prompt_cache_metadata =
        build_prompt_cache_trace_metadata(&source, &model, &messages, &route);
    let reply = extract_chat_completion_reply(&payload);

    if reply.trim().is_empty() {
        let error = "后端已返回结果，但没有解析出可显示的回复内容。".to_string();
        record_trace_error(
            &source,
            Some(&model),
            &body,
            None,
            &error,
            prompt_cache_metadata.as_ref(),
            trace_context.as_ref(),
            started_at,
        );
        return Err(error);
    }

    record_trace_success(
        &source,
        Some(&model),
        &body,
        prompt_text,
        &payload,
        &reply,
        prompt_cache_metadata.as_ref(),
        trace_context.as_ref(),
        started_at,
    );

    Ok(reply)
}

#[tauri::command]
async fn tauri_generate_openai_chat_stream(
    window: tauri::Window,
    stream_id: String,
    messages: Vec<Value>,
    settings: Value,
    task_kind: Option<String>,
    trace_context: Option<TraceContextPayload>,
) -> Result<ChatStreamStartResult, String> {
    let started_at = current_timestamp_millis();
    let route = resolve_task_route(
        &settings,
        match task_kind.as_deref() {
            Some("draft_assist") => NarrativeTaskKind::DraftAssist,
            Some("summarize_memory") => NarrativeTaskKind::SummarizeMemory,
            _ => NarrativeTaskKind::ChatReply,
        },
        None,
    )?;
    let stream_window = window.clone();
    tauri::async_runtime::spawn(async move {
        let source = route
            .chat_completion_source
            .clone()
            .unwrap_or_else(|| "openai".to_string());
        let model = route.model.clone();
        let body = json!({
            "messages": messages,
            "model": model,
            "stream": true,
        });
        let prompt_text = stringify_messages(&messages);
        let prompt_cache_metadata =
            build_prompt_cache_trace_metadata(&source, &model, &messages, &route);

        match execute_openai_chat_stream_task(
            &stream_window,
            &stream_id,
            &messages,
            &settings,
            &route,
        )
        .await
        {
            Ok((_, _, _, payload, _, reply)) => {
                if reply.trim().is_empty() {
                    let error = "后端已返回流式结果，但没有解析出可显示的回复内容。".to_string();
                    record_trace_error(
                        &source,
                        Some(&model),
                        &body,
                        prompt_text,
                        &error,
                        prompt_cache_metadata.as_ref(),
                        trace_context.as_ref(),
                        started_at,
                    );
                    emit_chat_stream_event(
                        &stream_window,
                        &stream_id,
                        String::new(),
                        true,
                        Some(error),
                    );
                    return;
                }

                record_trace_success(
                    &source,
                    Some(&model),
                    &body,
                    prompt_text,
                    &payload,
                    &reply,
                    prompt_cache_metadata.as_ref(),
                    trace_context.as_ref(),
                    started_at,
                );

                emit_chat_stream_event(&stream_window, &stream_id, String::new(), true, None);
            }
            Err(error) => {
                record_trace_error(
                    &source,
                    Some(&model),
                    &body,
                    prompt_text,
                    &error,
                    prompt_cache_metadata.as_ref(),
                    trace_context.as_ref(),
                    started_at,
                );
                emit_chat_stream_event(
                    &stream_window,
                    &stream_id,
                    String::new(),
                    true,
                    Some(error),
                );
            }
        }
    });

    Ok(ChatStreamStartResult { started: true })
}

#[tauri::command]
async fn tauri_generate_structured_output(
    messages: Vec<Value>,
    settings: Value,
    schema_id: String,
    trace_context: Option<TraceContextPayload>,
) -> Result<String, String> {
    let started_at = current_timestamp_millis();
    let schema_id = match schema_id.trim() {
        "relationship_delta" => StructuredSchemaId::RelationshipDelta,
        "story_suggestion" => StructuredSchemaId::StorySuggestion,
        "world_state_update" => StructuredSchemaId::WorldStateUpdate,
        other => {
            return Err(format!("不支持的结构化 schema_id: {other}"));
        }
    };
    let route = resolve_task_route(
        &settings,
        NarrativeTaskKind::StructuredStateUpdate,
        Some(schema_id),
    )?;
    if route.provider != NarrativeProviderKind::OpenAi {
        return Err("当前结构化状态更新仅支持 OpenAI 兼容聊天链路。".to_string());
    }
    let (source, model, body, payload, prompt_text) =
        execute_openai_chat_task(&messages, &settings, &route).await?;
    let raw_response = extract_chat_completion_reply(&payload);

    #[cfg(test)]
    eprintln!(
        "structured_output_raw[{}]={raw_response}",
        schema_id.as_str()
    );

    let parsed = parse_structured_json_response(&raw_response)?;
    let parsed = normalize_structured_output_payload(schema_id, parsed)?;

    let prompt_cache_metadata =
        build_prompt_cache_trace_metadata(&source, &model, &messages, &route);

    record_trace_success(
        &source,
        Some(&model),
        &body,
        prompt_text,
        &payload,
        &raw_response,
        prompt_cache_metadata.as_ref(),
        trace_context.as_ref(),
        started_at,
    );

    serde_json::to_string(&parsed).map_err(to_string_error)
}

#[tauri::command]
async fn tauri_extract_narrative_memory(
    messages: Vec<Value>,
    settings: Value,
    trace_context: Option<TraceContextPayload>,
) -> Result<NarrativeMemoryExtractionResult, String> {
    let started_at = current_timestamp_millis();
    let route = resolve_task_route(
        &settings,
        NarrativeTaskKind::SummarizeMemory,
        Some(StructuredSchemaId::MemoryExtraction),
    )?;
    if route.provider != NarrativeProviderKind::OpenAi {
        return Err("当前结构化记忆提取仅支持 OpenAI 兼容聊天链路。".to_string());
    }
    let (source, model, body, payload, prompt_text) =
        execute_openai_chat_task(&messages, &settings, &route).await?;
    let raw_response = extract_chat_completion_reply(&payload);

    let parsed = parse_narrative_memory_extraction(&raw_response)?;
    let stored_count = storage::save_narrative_memories(
        trace_context
            .as_ref()
            .and_then(|context| context.avatar_url.as_deref()),
        trace_context
            .as_ref()
            .and_then(|context| context.file_name.as_deref()),
        trace_context
            .as_ref()
            .and_then(|context| context.character_name.as_deref()),
        &parsed.summary,
        &parsed.candidate_memories,
    )?;

    let prompt_cache_metadata =
        build_prompt_cache_trace_metadata(&source, &model, &messages, &route);

    record_trace_success(
        &source,
        Some(&model),
        &body,
        prompt_text,
        &payload,
        &raw_response,
        prompt_cache_metadata.as_ref(),
        trace_context.as_ref(),
        started_at,
    );

    Ok(NarrativeMemoryExtractionResult {
        candidate_memories: parsed.candidate_memories,
        open_threads: parsed.open_threads,
        stored_count,
        summary: parsed.summary,
    })
}

#[tauri::command]
async fn tauri_generate_kobold(
    payload: Value,
    trace_context: Option<TraceContextPayload>,
) -> Result<String, String> {
    let started_at = current_timestamp_millis();
    let api_server = payload
        .get("api_server")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    if api_server.trim().is_empty() {
        return Err("Kobold 生成请求缺少 api_server。".to_string());
    }

    let mut body = json!({
        "prompt": payload.get("prompt").cloned().unwrap_or(Value::String(String::new())),
        "use_story": false,
        "use_memory": false,
        "use_authors_note": false,
        "use_world_info": false,
        "max_context_length": payload.get("max_context_length").cloned().unwrap_or(json!(2048)),
        "max_length": payload.get("max_length").cloned().unwrap_or(json!(350)),
    });

    if payload
        .get("gui_settings")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        == false
    {
        body = json!({
            "prompt": payload.get("prompt").cloned().unwrap_or(Value::String(String::new())),
            "use_story": false,
            "use_memory": false,
            "use_authors_note": false,
            "use_world_info": false,
            "max_context_length": payload.get("max_context_length").cloned().unwrap_or(json!(2048)),
            "max_length": payload.get("max_length").cloned().unwrap_or(json!(350)),
            "rep_pen": payload.get("rep_pen").cloned().unwrap_or(json!(1.1)),
            "rep_pen_range": payload.get("rep_pen_range").cloned().unwrap_or(json!(600)),
            "rep_pen_slope": payload.get("rep_pen_slope").cloned().unwrap_or(json!(0)),
            "temperature": payload.get("temperature").cloned().unwrap_or(json!(1)),
            "tfs": payload.get("tfs").cloned().unwrap_or(json!(1)),
            "top_a": payload.get("top_a").cloned().unwrap_or(json!(0)),
            "top_k": payload.get("top_k").cloned().unwrap_or(json!(0)),
            "top_p": payload.get("top_p").cloned().unwrap_or(json!(0.95)),
            "min_p": payload.get("min_p").cloned().unwrap_or(json!(0.01)),
            "typical": payload.get("typical").cloned().unwrap_or(json!(1)),
            "sampler_order": payload.get("sampler_order").cloned().unwrap_or(Value::Null),
            "singleline": payload.get("singleline").cloned().unwrap_or(json!(false)),
            "use_default_badwordsids": payload.get("use_default_badwordsids").cloned().unwrap_or(json!(false)),
            "mirostat": payload.get("mirostat").cloned().unwrap_or(json!(0)),
            "mirostat_eta": payload.get("mirostat_eta").cloned().unwrap_or(json!(0.1)),
            "mirostat_tau": payload.get("mirostat_tau").cloned().unwrap_or(json!(5)),
            "grammar": payload.get("grammar").cloned().unwrap_or(Value::Null),
            "sampler_seed": payload.get("sampler_seed").cloned().unwrap_or(Value::Null),
            "stop_sequence": payload.get("stop_sequence").cloned().unwrap_or(Value::Null),
        });
    }

    let endpoint = format!(
        "{}/v1/generate",
        trim_trailing_slash(&normalize_localhost(api_server))
    );
    let client = reqwest::Client::new();
    let prompt_text = payload
        .get("prompt")
        .and_then(Value::as_str)
        .map(str::to_string);
    let response = client
        .post(endpoint)
        .header(CONTENT_TYPE, "application/json")
        .json(&body)
        .send()
        .await
        .map_err(to_string_error)?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let error = format!("Kobold 请求失败 ({}): {}", status, text.trim());
        record_trace_error(
            "kobold",
            None,
            &body,
            prompt_text.clone(),
            &error,
            None,
            trace_context.as_ref(),
            started_at,
        );
        return Err(error);
    }

    let response_payload: Value = response.json().await.map_err(to_string_error)?;
    let reply = extract_text_completion_reply(&response_payload);

    if reply.trim().is_empty() {
        let error = "Kobold 后端已返回结果，但没有解析出可显示的回复内容。".to_string();
        record_trace_error(
            "kobold",
            None,
            &body,
            prompt_text,
            &error,
            None,
            trace_context.as_ref(),
            started_at,
        );
        return Err(error);
    }

    record_trace_success(
        "kobold",
        None,
        &body,
        prompt_text,
        &response_payload,
        &reply,
        None,
        trace_context.as_ref(),
        started_at,
    );

    Ok(reply)
}

#[tauri::command]
async fn tauri_generate_text_completion(
    payload: Value,
    trace_context: Option<TraceContextPayload>,
) -> Result<String, String> {
    let started_at = current_timestamp_millis();
    let api_type = payload
        .get("api_type")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let api_server = payload
        .get("api_server")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    if api_type.trim().is_empty() || api_server.trim().is_empty() {
        return Err("TextGen 生成请求缺少 api_type 或 api_server。".to_string());
    }

    let base_url = trim_v1(&normalize_localhost(api_server));
    let endpoint = match api_type.as_str() {
        "generic" | "vllm" | "featherless" | "aphrodite" | "ooba" | "tabby" | "koboldcpp"
        | "ollama" | "togetherai" | "infermaticai" | "huggingface" => {
            format!("{base_url}/v1/completions")
        }
        "dreamgen" => format!("{base_url}/api/openai/v1/completions"),
        "mancer" => format!("{base_url}/oai/v1/completions"),
        "llamacpp" => format!("{base_url}/completion"),
        "openrouter" => format!("{base_url}/v1/chat/completions"),
        other => {
            return Err(format!(
                "Tauri 文本生成当前暂未支持该 TextGen 类型: {other}"
            ))
        }
    };

    let mut body = payload.clone();
    if let Some(body_object) = body.as_object_mut() {
        body_object.remove("api_server");
        body_object.remove("api_type");

        if api_type == "openrouter" {
            let providers = body_object.remove("provider");
            let quantizations = body_object.remove("quantizations");
            let allow_fallbacks = body_object.remove("allow_fallbacks");

            if let Some(Value::Array(provider_list)) = providers {
                if !provider_list.is_empty() {
                    let mut provider = Map::new();
                    provider.insert(
                        "allow_fallbacks".to_string(),
                        allow_fallbacks.unwrap_or(Value::Bool(true)),
                    );
                    provider.insert("order".to_string(), Value::Array(provider_list));

                    if let Some(Value::Array(values)) = quantizations {
                        if !values.is_empty() {
                            provider.insert("quantizations".to_string(), Value::Array(values));
                        }
                    }

                    body_object.insert("provider".to_string(), Value::Object(provider));
                }
            }
        }
    }

    let client = reqwest::Client::new();
    let mut request = client
        .post(endpoint)
        .header(CONTENT_TYPE, "application/json");

    if let Some(key) = textgen_api_key_for_type(&api_type)? {
        if !key.is_empty() {
            request = request.header(AUTHORIZATION, format!("Bearer {key}"));
        }
    }

    let prompt_text = payload
        .get("prompt")
        .and_then(Value::as_str)
        .map(str::to_string);
    let response = request.json(&body).send().await.map_err(to_string_error)?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let error = format!("TextGen 请求失败 ({}): {}", status, text.trim());
        record_trace_error(
            &api_type,
            None,
            &body,
            prompt_text.clone(),
            &error,
            None,
            trace_context.as_ref(),
            started_at,
        );
        return Err(error);
    }

    let response_payload: Value = response.json().await.map_err(to_string_error)?;
    let reply = extract_text_completion_reply(&response_payload);

    if reply.trim().is_empty() {
        let error = "TextGen 后端已返回结果，但没有解析出可显示的回复内容。".to_string();
        record_trace_error(
            &api_type,
            None,
            &body,
            prompt_text,
            &error,
            None,
            trace_context.as_ref(),
            started_at,
        );
        return Err(error);
    }

    record_trace_success(
        &api_type,
        None,
        &body,
        prompt_text,
        &response_payload,
        &reply,
        None,
        trace_context.as_ref(),
        started_at,
    );

    Ok(reply)
}

#[tauri::command]
async fn tauri_generate_horde_text(
    payload: Value,
    models: Vec<String>,
    trace_context: Option<TraceContextPayload>,
    trusted_workers: bool,
) -> Result<String, String> {
    let started_at = current_timestamp_millis();
    let api_key = {
        let key = read_secret("api_key_horde")?;
        if key.trim().is_empty() {
            "0000000000".to_string()
        } else {
            key
        }
    };
    let prompt = payload
        .get("prompt")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    if prompt.trim().is_empty() {
        return Err("Horde 生成请求缺少 prompt。".to_string());
    }

    if models.is_empty() {
        return Err("Horde 生成请求至少需要一个模型。".to_string());
    }
    let model_label = models.join(", ");
    let prompt_text = Some(prompt.clone());

    let mut params = payload.clone();
    if let Some(params_object) = params.as_object_mut() {
        params_object.remove("prompt");
        params_object.remove("api_server");
        params_object.insert("n".to_string(), json!(1));
        params_object.insert("frmtadsnsp".to_string(), Value::Bool(false));
        params_object.insert("frmtrmblln".to_string(), Value::Bool(false));
        params_object.insert("frmtrmspch".to_string(), Value::Bool(false));
        params_object.insert("frmttriminc".to_string(), Value::Bool(false));
    }

    let body = json!({
        "prompt": prompt,
        "params": params,
        "trusted_workers": trusted_workers,
        "models": models,
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://aihorde.net/api/v2/generate/text/async")
        .header(CONTENT_TYPE, "application/json")
        .header("apikey", api_key)
        .header(
            "Client-Agent",
            "Yggdrasil-Tauri:0.1.0:https://github.com/Yggdrasil/Yggdrasil",
        )
        .json(&body)
        .send()
        .await
        .map_err(to_string_error)?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let error = format!("Horde 请求失败 ({}): {}", status, text.trim());
        record_trace_error(
            "koboldhorde",
            Some(&model_label),
            &body,
            prompt_text.clone(),
            &error,
            None,
            trace_context.as_ref(),
            started_at,
        );
        return Err(error);
    }

    let submit_payload: Value = response.json().await.map_err(to_string_error)?;
    if submit_payload.get("error").is_some() {
        let message = submit_payload
            .get("error")
            .and_then(|value| value.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("Horde generation failed");
        let error = message.to_string();
        record_trace_error(
            "koboldhorde",
            Some(&model_label),
            &body,
            prompt_text.clone(),
            &error,
            None,
            trace_context.as_ref(),
            started_at,
        );
        return Err(error);
    }

    let task_id = submit_payload
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if task_id.trim().is_empty() {
        return Err("Horde 请求已发出，但没有返回任务 ID。".to_string());
    }

    for _ in 0..120 {
        let status_response = client
            .get(format!(
                "https://aihorde.net/api/v2/generate/text/status/{}",
                task_id
            ))
            .header(
                "Client-Agent",
                "Yggdrasil-Tauri:0.1.0:https://github.com/Yggdrasil/Yggdrasil",
            )
            .send()
            .await
            .map_err(to_string_error)?;

        if !status_response.status().is_success() {
            let status = status_response.status();
            let text = status_response.text().await.unwrap_or_default();
            return Err(format!("Horde 状态查询失败 ({}): {}", status, text.trim()));
        }

        let status_payload: Value = status_response.json().await.map_err(to_string_error)?;
        if status_payload
            .get("faulted")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            let error = "Horde 请求失败，请稍后重试。".to_string();
            record_trace_error(
                "koboldhorde",
                Some(&model_label),
                &body,
                prompt_text.clone(),
                &error,
                None,
                trace_context.as_ref(),
                started_at,
            );
            return Err(error);
        }

        if status_payload.get("is_possible").and_then(Value::as_bool) == Some(false) {
            let error = "当前 Horde 模型无法满足这次生成请求，请更换模型或参数。".to_string();
            record_trace_error(
                "koboldhorde",
                Some(&model_label),
                &body,
                prompt_text.clone(),
                &error,
                None,
                trace_context.as_ref(),
                started_at,
            );
            return Err(error);
        }

        let reply = extract_text_completion_reply(&status_payload);
        if status_payload.get("done").and_then(Value::as_bool) == Some(true) && !reply.is_empty() {
            record_trace_success(
                "koboldhorde",
                Some(&model_label),
                &body,
                prompt_text.clone(),
                &status_payload,
                &reply,
                None,
                trace_context.as_ref(),
                started_at,
            );
            return Ok(reply);
        }

        if status_payload.get("done").and_then(Value::as_bool) == Some(true) {
            let error = "Horde 后端已返回结果，但没有解析出可显示的回复内容。".to_string();
            record_trace_error(
                "koboldhorde",
                Some(&model_label),
                &body,
                prompt_text.clone(),
                &error,
                None,
                trace_context.as_ref(),
                started_at,
            );
            return Err(error);
        }

        sleep(Duration::from_millis(2500));
    }

    let error = "Horde 生成超时，请稍后重试。".to_string();
    record_trace_error(
        "koboldhorde",
        Some(&model_label),
        &body,
        prompt_text,
        &error,
        None,
        trace_context.as_ref(),
        started_at,
    );
    Err(error)
}

#[tauri::command]
async fn tauri_generate_novel(
    payload: Value,
    trace_context: Option<TraceContextPayload>,
) -> Result<String, String> {
    let started_at = current_timestamp_millis();
    let api_key = read_secret("api_key_novel")?;
    if api_key.trim().is_empty() {
        return Err("当前桌面内嵌后端未配置可用的 Novel Access Token。".to_string());
    }

    let model = payload
        .get("model")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if model.trim().is_empty() {
        return Err("当前 NovelAI 尚未配置模型。".to_string());
    }

    let base_url = if model.contains("kayra") || model.contains("erato") {
        "https://text.novelai.net"
    } else {
        "https://api.novelai.net"
    };

    let client = reqwest::Client::new();
    let request_payload = payload.clone();
    let response = client
        .post(format!("{base_url}/ai/generate"))
        .header(CONTENT_TYPE, "application/json")
        .header(AUTHORIZATION, bearer_header(&api_key)?)
        .json(&payload)
        .send()
        .await
        .map_err(to_string_error)?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let error = format!("NovelAI 请求失败 ({}): {}", status, text.trim());
        record_trace_error(
            "novel",
            Some(&model),
            &request_payload,
            request_payload
                .get("input")
                .and_then(Value::as_str)
                .map(str::to_string),
            &error,
            None,
            trace_context.as_ref(),
            started_at,
        );
        return Err(error);
    }

    let response_payload: Value = response.json().await.map_err(to_string_error)?;
    let reply = extract_text_completion_reply(&response_payload);

    if reply.trim().is_empty() {
        let error = "NovelAI 后端已返回结果，但没有解析出可显示的回复内容。".to_string();
        record_trace_error(
            "novel",
            Some(&model),
            &request_payload,
            request_payload
                .get("input")
                .and_then(Value::as_str)
                .map(str::to_string),
            &error,
            None,
            trace_context.as_ref(),
            started_at,
        );
        return Err(error);
    }

    record_trace_success(
        "novel",
        Some(&model),
        &request_payload,
        request_payload
            .get("input")
            .and_then(Value::as_str)
            .map(str::to_string),
        &response_payload,
        &reply,
        None,
        trace_context.as_ref(),
        started_at,
    );

    Ok(reply)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            logs::append_bootstrap_log("setup:start");
            storage::ensure_storage_ready()?;
            let menu = MenuBuilder::new(app)
                .item(
                    &SubmenuBuilder::new(app, "文件")
                        .text("menu_new_chat", "新建聊天")
                        .text("menu_import_character", "导入角色卡")
                        .text("menu_export_chat", "导出聊天")
                        .separator()
                        .text("menu_refresh_workspace", "刷新工作区")
                        .separator()
                        .text("menu_quit_app", "退出")
                        .build()?,
                )
                .item(
                    &SubmenuBuilder::new(app, "会话")
                        .text("menu_new_session", "新建会话")
                        .text("menu_duplicate_session", "复制会话")
                        .text("menu_branch_from_here", "从此处分支")
                        .separator()
                        .text("menu_switch_workspace", "切换工作区")
                        .build()?,
                )
                .item(
                    &SubmenuBuilder::new(app, "资源库")
                        .text("menu_open_library", "打开资源库")
                        .text("menu_refresh_library", "刷新资源库")
                        .separator()
                        .text("menu_show_characters", "角色")
                        .text("menu_show_lorebooks", "世界书")
                        .text("menu_show_presets", "预设")
                        .build()?,
                )
                .item(
                    &SubmenuBuilder::new(app, "引擎")
                        .text("menu_reload_settings", "重新载入设置")
                        .text("menu_test_connection", "测试连接")
                        .separator()
                        .text("menu_switch_provider", "切换服务商")
                        .build()?,
                )
                .item(
                    &SubmenuBuilder::new(app, "工具")
                        .text("menu_token_counter", "Token 计数器")
                        .text("menu_prompt_inspector", "Prompt 检视器")
                        .text("menu_open_logs", "日志")
                        .separator()
                        .text("menu_go_settings", "设置")
                        .build()?,
                )
                .item(
                    &SubmenuBuilder::new(app, "帮助")
                        .text("menu_about", "关于 Yggdrasil")
                        .text("menu_open_docs", "文档")
                        .text("menu_report_issue", "反馈问题")
                        .build()?,
                )
                .build()?;

            app.set_menu(menu)?;
            if let Some(window) = app.get_webview_window("main") {
                restore_main_webview_window_state(&window);
            }
            logs::append_bootstrap_log("setup:ready");
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            match event {
                WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
                    persist_main_window_state(window);
                }
                WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
                    persist_main_window_state(window);
                }
                _ => {}
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "menu_new_chat" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "new-chat" }));
            }
            "menu_import_character" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "import-character" }));
            }
            "menu_export_chat" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "export-chat" }));
            }
            "menu_refresh_workspace" => {
                let _ = app.emit(
                    "tauri-menu-action",
                    json!({ "action": "refresh-workspace" }),
                );
            }
            "menu_quit_app" => app.exit(0),
            "menu_new_session" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "new-session" }));
            }
            "menu_duplicate_session" => {
                let _ = app.emit(
                    "tauri-menu-action",
                    json!({ "action": "duplicate-session" }),
                );
            }
            "menu_branch_from_here" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "branch-from-here" }));
            }
            "menu_switch_workspace" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "switch-workspace" }));
            }
            "menu_open_library" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "open-library" }));
            }
            "menu_refresh_library" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "refresh-library" }));
            }
            "menu_show_characters" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "show-characters" }));
            }
            "menu_show_lorebooks" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "show-lorebooks" }));
            }
            "menu_show_presets" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "show-presets" }));
            }
            "menu_reload_settings" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "reload-settings" }));
            }
            "menu_test_connection" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "test-connection" }));
            }
            "menu_switch_provider" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "switch-provider" }));
            }
            "menu_token_counter" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "token-counter" }));
            }
            "menu_prompt_inspector" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "prompt-inspector" }));
            }
            "menu_open_logs" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "open-logs" }));
            }
            "menu_go_settings" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "go-settings" }));
            }
            "menu_about" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "about" }));
            }
            "menu_open_docs" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "open-docs" }));
            }
            "menu_report_issue" => {
                let _ = app.emit("tauri-menu-action", json!({ "action": "report-issue" }));
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            tauri_auth_bootstrap,
            tauri_backend_info,
            tauri_check_novel_status,
            tauri_check_text_generation_status,
            tauri_fetch_character_chats,
            tauri_fetch_characters,
            tauri_fetch_chat,
            tauri_fetch_session_summaries,
            tauri_delete_character,
            tauri_delete_chat,
            tauri_duplicate_chat,
            tauri_export_chat,
            tauri_export_library_document,
            tauri_export_log_document,
            tauri_export_logs_bundle,
            tauri_export_project_manifest,
            tauri_export_trace_entries,
            tauri_fetch_eval_runs,
            tauri_fetch_log_document,
            tauri_fetch_project_manifests,
            tauri_fetch_trace_entries,
            tauri_create_backup,
            tauri_clear_trace_entries,
            tauri_delete_library_document,
            tauri_fetch_library_documents,
            tauri_save_session_summary,
            tauri_delete_session_summary,
            tauri_fetch_workspace_catalog,
            tauri_fetch_settings,
            tauri_fetch_model_providers,
            tauri_fetch_narrative_memory_candidates,
            tauri_fetch_narrative_memories,
            tauri_fetch_memory_hits,
            tauri_clear_memory_hits,
            tauri_fetch_world_state_snapshot,
            tauri_fetch_retrieval_hits,
            tauri_fetch_retrieval_jobs,
            tauri_retrieve_narrative_memories,
            tauri_retrieve_generation_context,
            tauri_review_narrative_memory_candidate,
            tauri_delete_narrative_memory,
            tauri_delete_narrative_memory_candidate,
            tauri_check_chat_completion_status,
            tauri_fetch_chat_completion_models,
            tauri_fetch_model_provider_models,
            tauri_generate_horde_text,
            tauri_generate_kobold,
            tauri_extract_narrative_memory,
            tauri_generate_novel,
            tauri_generate_openai_chat,
            tauri_generate_openai_chat_stream,
            tauri_generate_structured_output,
            tauri_generate_text_completion,
            tauri_import_project_manifest,
            tauri_login,
            tauri_logout,
            tauri_read_secret,
            tauri_clear_log_document,
            tauri_append_runtime_log,
            tauri_restore_backup,
            tauri_read_avatar_data_url,
            tauri_resolve_avatar_path,
            tauri_run_local_eval,
            tauri_rename_chat,
            tauri_save_chat,
            tauri_save_character,
            tauri_save_model_provider,
            tauri_save_project_manifest,
            tauri_save_library_document,
            tauri_set_project_plugin_binding,
            tauri_apply_world_state_updates,
            tauri_rebuild_world_state_snapshot,
            tauri_write_secret,
            tauri_delete_model_provider,
            tauri_delete_project_manifest,
            tauri_save_settings,
            tauri_save_settings_with_secret
        ])
        .plugin(tauri_plugin_updater::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn backend_info() -> BackendInfo {
    BackendInfo {
        csrf_token: "tauri-local".into(),
        node_version: "embedded-runtime".into(),
        pkg_version: env!("CARGO_PKG_VERSION").into(),
        server_version: format!("desktop-{}", env!("CARGO_PKG_VERSION")),
    }
}

fn local_identity() -> (String, String) {
    let raw_name = std::env::var("ST_DESKTOP_USER_NAME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| std::env::var("USERNAME").ok())
        .or_else(|| std::env::var("USER").ok())
        .unwrap_or_else(|| "Desktop".to_string());
    let name = raw_name.trim().to_string();
    let handle = sanitize_user_handle(&name);
    (handle, name)
}

fn sanitize_user_handle(value: &str) -> String {
    let normalized = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else if ch.is_whitespace() {
                '-'
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches(['-', '_', '.'])
        .to_ascii_lowercase();

    if normalized.is_empty() {
        "desktop".to_string()
    } else {
        normalized
    }
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

fn tauri_dev_state_dir() -> PathBuf {
    if let Ok(value) = std::env::var("ST_TAURI_STATE_DIR") {
        return PathBuf::from(value);
    }

    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(".tauri-dev")
}

fn window_state_path() -> PathBuf {
    tauri_dev_state_dir().join(WINDOW_STATE_FILE_NAME)
}

fn read_stored_window_state() -> Option<StoredWindowState> {
    let path = window_state_path();
    let payload = fs::read_to_string(path).ok()?;
    serde_json::from_str::<StoredWindowState>(&payload).ok()
}

fn write_stored_window_state(state: &StoredWindowState) {
    let state_dir = tauri_dev_state_dir();
    let _ = fs::create_dir_all(&state_dir);
    if let Ok(payload) = serde_json::to_string_pretty(state) {
        let _ = fs::write(window_state_path(), payload);
    }
}

fn restore_main_webview_window_state(window: &tauri::WebviewWindow) {
    let Some(state) = read_stored_window_state() else {
        logs::append_bootstrap_log("window-state:restore:miss");
        return;
    };

    if let (Some(width), Some(height)) = (state.width, state.height) {
        let clamped_width = width.max(MIN_WINDOW_WIDTH);
        let clamped_height = height.max(MIN_WINDOW_HEIGHT);
        let _ = window.set_size(tauri::Size::Physical(PhysicalSize {
            width: clamped_width,
            height: clamped_height,
        }));
    }

    if let (Some(x), Some(y)) = (state.x, state.y) {
        if x > -10_000 && y > -10_000 {
            let _ = window.set_position(tauri::Position::Physical(PhysicalPosition { x, y }));
        }
    }

    if state.maximized {
        let _ = window.maximize();
    }

    logs::append_bootstrap_log("window-state:restore:ok");
}

fn persist_main_window_state(window: &tauri::Window) {
    let size = match window.outer_size() {
        Ok(value) => value,
        Err(_) => return,
    };
    let position = match window.outer_position() {
        Ok(value) => value,
        Err(_) => return,
    };
    let maximized = window.is_maximized().unwrap_or(false);

    if size.width < MIN_WINDOW_WIDTH || size.height < MIN_WINDOW_HEIGHT {
        return;
    }

    if position.x <= -10_000 || position.y <= -10_000 {
        return;
    }

    write_stored_window_state(&StoredWindowState {
        width: Some(size.width),
        height: Some(size.height),
        x: Some(position.x),
        y: Some(position.y),
        maximized,
    });
}

fn collect_log_entries() -> Result<(Vec<WorkspaceCatalogEntry>, usize), String> {
    logs::collect_log_entries()
}

fn stringify_value(value: &Value) -> Option<String> {
    serde_json::to_string_pretty(value)
        .ok()
        .filter(|text| !text.trim().is_empty())
}

fn stringify_messages(messages: &[Value]) -> Option<String> {
    let lines = messages
        .iter()
        .filter_map(|message| {
            let role = message
                .get("role")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let content = message
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if content.is_empty() {
                None
            } else {
                Some(format!("{role}: {content}"))
            }
        })
        .collect::<Vec<_>>();

    if lines.is_empty() {
        None
    } else {
        Some(lines.join("\n\n"))
    }
}

async fn execute_openai_chat_task(
    messages: &[Value],
    settings: &Value,
    route: &NarrativeTaskRoute,
) -> Result<(String, String, Value, Value, Option<String>), String> {
    let resolved = resolve_openai_chat_route(settings, route)?;
    let source = resolved.provider_label;
    let protocol = resolved.protocol;
    let route = resolved.route;
    let model = route.model.clone();

    if model.trim().is_empty() {
        return Err("当前未配置可用的 chat completion 模型。".to_string());
    }

    let request = build_openai_request(
        settings, &source, &protocol, &model, messages, &route, false,
    )?;
    let body = request.body.clone();
    let prompt_text = stringify_messages(messages);
    let client = reqwest::Client::new();
    let mut last_error = String::new();

    for attempt in 0..3 {
        let response = match client
            .post(request.endpoint.clone())
            .headers(request.headers.clone())
            .json(&request.body)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                last_error = error.to_string();
                if attempt < 2 && is_retryable_request_error(&error) {
                    sleep(Duration::from_millis(700 * (attempt + 1) as u64));
                    continue;
                }
                return Err(last_error);
            }
        };

        if response.status().is_success() {
            let payload: Value = response.json().await.map_err(to_string_error)?;
            return Ok((source, model, body, payload, prompt_text));
        }

        let status = response.status();
        let status_code = status.as_u16();
        let text = response.text().await.unwrap_or_default();
        last_error = format!("Chat Completion 请求失败 ({}): {}", status, text.trim());

        if is_retryable_gateway_status(status_code) && attempt < 2 {
            sleep(Duration::from_millis(700 * (attempt + 1) as u64));
            continue;
        }

        return Err(last_error);
    }

    Err(if last_error.is_empty() {
        "Chat Completion 请求失败：未知错误。".to_string()
    } else {
        last_error
    })
}

fn process_stream_line<F>(
    protocol: &str,
    raw_line: &str,
    last_payload: &mut Option<Value>,
    collected_reply: &mut String,
    chunk_count: &mut u64,
    mut emit_delta: F,
) -> Result<bool, String>
where
    F: FnMut(String),
{
    let uses_sse = provider_protocols::protocol_uses_sse(protocol);
    let line = raw_line.trim();
    if line.is_empty() || (uses_sse && line.starts_with(':')) {
        return Ok(false);
    }

    let data = if uses_sse {
        if !line.starts_with("data:") {
            return Ok(false);
        }
        line["data:".len()..].trim()
    } else {
        line
    };

    if data.is_empty() {
        return Ok(false);
    }
    if data == "[DONE]" {
        return Ok(true);
    }

    let payload: Value = serde_json::from_str(data).map_err(|error| {
        if uses_sse {
            format!("流式分片解析失败: {error}")
        } else {
            format!("流式 JSON 分片解析失败: {error}")
        }
    })?;
    *last_payload = Some(payload.clone());

    let delta = provider_protocols::extract_stream_delta(protocol, &payload);
    if !delta.is_empty() {
        collected_reply.push_str(&delta);
        *chunk_count += 1;
        emit_delta(delta);
    }

    if !uses_sse
        && payload
            .get("done")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        return Ok(true);
    }

    Ok(false)
}

async fn execute_openai_chat_stream_task(
    window: &tauri::Window,
    stream_id: &str,
    messages: &[Value],
    settings: &Value,
    route: &NarrativeTaskRoute,
) -> Result<(String, String, Value, Value, Option<String>, String), String> {
    let resolved = resolve_openai_chat_route(settings, route)?;
    let source = resolved.provider_label;
    let protocol = resolved.protocol;
    let route = resolved.route;
    let model = route.model.clone();

    if model.trim().is_empty() {
        return Err("当前未配置可用的 chat completion 模型。".to_string());
    }

    let mut request =
        build_openai_request(settings, &source, &protocol, &model, messages, &route, true)?;
    if provider_protocols::protocol_uses_sse(&protocol) {
        request
            .headers
            .insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
    }
    let body = request.body.clone();
    let prompt_text = stringify_messages(messages);
    let client = reqwest::Client::new();
    let mut last_error = String::new();

    for attempt in 0..3 {
        let response = match client
            .post(request.endpoint.clone())
            .headers(request.headers.clone())
            .json(&request.body)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                last_error = error.to_string();
                if attempt < 2 && is_retryable_request_error(&error) {
                    sleep(Duration::from_millis(700 * (attempt + 1) as u64));
                    continue;
                }
                return Err(last_error);
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let status_code = status.as_u16();
            let text = response.text().await.unwrap_or_default();
            last_error = format!("Chat Completion 请求失败 ({}): {}", status, text.trim());

            if is_retryable_gateway_status(status_code) && attempt < 2 {
                sleep(Duration::from_millis(700 * (attempt + 1) as u64));
                continue;
            }

            return Err(last_error);
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut collected_reply = String::new();
        let mut chunk_count = 0u64;
        let mut last_payload: Option<Value> = None;

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(to_string_error)?;
            let text = String::from_utf8_lossy(&chunk);
            buffer.push_str(&text);

            while let Some(newline_index) = buffer.find('\n') {
                let line = buffer[..newline_index].trim_end_matches('\r').to_string();
                buffer.drain(..=newline_index);

                if line.is_empty() {
                    continue;
                }

                let maybe_done = process_stream_line(
                    &protocol,
                    &line,
                    &mut last_payload,
                    &mut collected_reply,
                    &mut chunk_count,
                    |delta| emit_chat_stream_event(window, stream_id, delta, false, None),
                )?;
                if maybe_done {
                    let final_payload = last_payload.unwrap_or_else(|| {
                        json!({
                            "streamed": true,
                            "chunk_count": chunk_count,
                        })
                    });
                    return Ok((
                        source,
                        model,
                        body,
                        final_payload,
                        prompt_text,
                        collected_reply,
                    ));
                }
            }
        }

        if !buffer.trim().is_empty() {
            process_stream_line(
                &protocol,
                buffer.trim(),
                &mut last_payload,
                &mut collected_reply,
                &mut chunk_count,
                |delta| emit_chat_stream_event(window, stream_id, delta, false, None),
            )?;
        }

        if !collected_reply.trim().is_empty() {
            let final_payload = last_payload.unwrap_or_else(|| {
                json!({
                    "streamed": true,
                    "chunk_count": chunk_count,
                })
            });
            return Ok((
                source,
                model,
                body,
                final_payload,
                prompt_text,
                collected_reply,
            ));
        }

        last_error = "流式响应已结束，但没有收到可显示的内容。".to_string();
        break;
    }

    Err(if last_error.is_empty() {
        "流式 Chat Completion 请求失败：未知错误。".to_string()
    } else {
        last_error
    })
}

fn emit_chat_stream_event(
    window: &tauri::Window,
    stream_id: &str,
    delta: String,
    done: bool,
    error: Option<String>,
) {
    let _ = window.emit(
        "st-chat-stream",
        ChatStreamEventPayload {
            stream_id: stream_id.to_string(),
            delta,
            done,
            error,
        },
    );
}

fn build_openai_request(
    settings: &Value,
    source: &str,
    protocol: &str,
    model: &str,
    messages: &[Value],
    route: &NarrativeTaskRoute,
    stream: bool,
) -> Result<ProtocolRequest, String> {
    let provider_id = setting_string(
        settings,
        &[
            &["chat_model_provider_id"],
            &["oai_settings", "chat_model_provider_id"],
        ],
    )
    .unwrap_or_default();
    if let Some(provider) = load_model_provider_for_capability(provider_id.as_str(), "chat")? {
        let key = storage::read_secret(&provider.secret_key).unwrap_or_default();
        return provider_protocols::build_chat_request(
            &ProviderProtocolConfig {
                api_key: key.trim(),
                api_version: provider.api_version.as_deref(),
                base_url: provider.base_url.trim(),
                deployment_name: provider.deployment_name.as_deref(),
                provider_type: provider.provider_type.trim(),
                protocol: provider.protocol.trim(),
            },
            model,
            messages,
            route,
            stream,
        );
    }

    let (base_url, api_key, api_version, deployment_name) =
        resolve_legacy_chat_protocol_config(settings, source)?;
    provider_protocols::build_chat_request(
        &ProviderProtocolConfig {
            api_key: api_key.trim(),
            api_version: api_version.as_deref(),
            base_url: base_url.trim(),
            deployment_name: deployment_name.as_deref(),
            provider_type: source,
            protocol,
        },
        model,
        messages,
        route,
        stream,
    )
}

fn resolve_legacy_chat_protocol_config(
    settings: &Value,
    source: &str,
) -> Result<(String, String, Option<String>, Option<String>), String> {
    let reverse_proxy = setting_string(
        settings,
        &[&["reverse_proxy"], &["oai_settings", "reverse_proxy"]],
    )
    .unwrap_or_default();
    let proxy_password = setting_string(
        settings,
        &[&["proxy_password"], &["oai_settings", "proxy_password"]],
    )
    .unwrap_or_default();
    let custom_url = setting_string(
        settings,
        &[&["custom_url"], &["oai_settings", "custom_url"]],
    )
    .unwrap_or_default();
    let azure_base_url = setting_string(
        settings,
        &[&["azure_base_url"], &["oai_settings", "azure_base_url"]],
    )
    .unwrap_or_default();
    let azure_deployment_name = setting_string(
        settings,
        &[
            &["azure_deployment_name"],
            &["oai_settings", "azure_deployment_name"],
        ],
    )
    .unwrap_or_default();
    let azure_api_version = setting_string(
        settings,
        &[
            &["azure_api_version"],
            &["oai_settings", "azure_api_version"],
        ],
    )
    .unwrap_or_else(|| "2024-10-21".to_string());

    match source {
        "openai" => Ok((
            trim_trailing_slash_or_default(&reverse_proxy, "https://api.openai.com/v1"),
            resolve_api_key(&reverse_proxy, &proxy_password, "api_key_openai")?,
            None,
            None,
        )),
        "openrouter" => Ok((
            trim_trailing_slash_or_default(&reverse_proxy, "https://openrouter.ai/api/v1"),
            resolve_api_key(&reverse_proxy, &proxy_password, "api_key_openrouter")?,
            None,
            None,
        )),
        "custom" => Ok((
            custom_url,
            resolve_optional_api_key(&reverse_proxy, &proxy_password, "api_key_custom"),
            None,
            None,
        )),
        "azure_openai" => Ok((
            azure_base_url,
            resolve_api_key("", "", "api_key_azure_openai")?,
            Some(azure_api_version),
            Some(azure_deployment_name),
        )),
        other => Err(format!(
            "Tauri 生成链暂未支持 chat completion source: {other}"
        )),
    }
}

fn build_openai_endpoint_and_headers(
    settings: &Value,
    source: &str,
) -> Result<(String, HeaderMap), String> {
    let reverse_proxy = setting_string(
        settings,
        &[&["reverse_proxy"], &["oai_settings", "reverse_proxy"]],
    )
    .unwrap_or_default();
    let proxy_password = setting_string(
        settings,
        &[&["proxy_password"], &["oai_settings", "proxy_password"]],
    )
    .unwrap_or_default();
    let custom_url = setting_string(
        settings,
        &[&["custom_url"], &["oai_settings", "custom_url"]],
    )
    .unwrap_or_default();
    let azure_base_url = setting_string(
        settings,
        &[&["azure_base_url"], &["oai_settings", "azure_base_url"]],
    )
    .unwrap_or_default();
    let azure_deployment_name = setting_string(
        settings,
        &[
            &["azure_deployment_name"],
            &["oai_settings", "azure_deployment_name"],
        ],
    )
    .unwrap_or_default();
    let azure_api_version = setting_string(
        settings,
        &[
            &["azure_api_version"],
            &["oai_settings", "azure_api_version"],
        ],
    )
    .unwrap_or_else(|| "2024-10-21".to_string());

    let provider_id = setting_string(
        settings,
        &[
            &["chat_model_provider_id"],
            &["oai_settings", "chat_model_provider_id"],
        ],
    )
    .unwrap_or_default();
    if let Some(provider) = load_model_provider_for_capability(provider_id.as_str(), "chat")? {
        return build_chat_endpoint_and_headers_from_provider(&provider);
    }

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));

    let endpoint = match source {
        "openai" => {
            let key = resolve_api_key(&reverse_proxy, &proxy_password, "api_key_openai")?;
            headers.insert(AUTHORIZATION, bearer_header(&key)?);
            format!(
                "{}/chat/completions",
                trim_trailing_slash_or_default(&reverse_proxy, "https://api.openai.com/v1")
            )
        }
        "openrouter" => {
            let key = resolve_api_key(&reverse_proxy, &proxy_password, "api_key_openrouter")?;
            headers.insert(AUTHORIZATION, bearer_header(&key)?);
            headers.insert(
                "HTTP-Referer",
                HeaderValue::from_static("https://github.com/Yggdrasil/Yggdrasil"),
            );
            headers.insert("X-Title", HeaderValue::from_static("Yggdrasil"));
            format!(
                "{}/chat/completions",
                trim_trailing_slash_or_default(&reverse_proxy, "https://openrouter.ai/api/v1")
            )
        }
        "custom" => {
            let endpoint_root = normalize_openai_compatible_root(&custom_url);
            if endpoint_root.is_empty() {
                return Err("当前 Custom Chat Completion 尚未配置 URL。".to_string());
            }
            let key = resolve_optional_api_key(&reverse_proxy, &proxy_password, "api_key_custom");
            if !key.is_empty() {
                headers.insert(AUTHORIZATION, bearer_header(&key)?);
            }
            format!("{endpoint_root}/chat/completions")
        }
        "azure_openai" => {
            if azure_base_url.trim().is_empty() || azure_deployment_name.trim().is_empty() {
                return Err("当前 Azure OpenAI 缺少 base URL 或 deployment name。".to_string());
            }
            let key = resolve_api_key("", "", "api_key_azure_openai")?;
            headers.insert("api-key", header_value(&key)?);
            format!(
                "{}/openai/deployments/{}/chat/completions?api-version={}",
                trim_trailing_slash(&azure_base_url),
                azure_deployment_name,
                azure_api_version
            )
        }
        other => {
            return Err(format!(
                "Tauri 生成链暂未支持 chat completion source: {other}"
            ))
        }
    };

    Ok((endpoint, headers))
}

fn build_narrative_embedding_route(
    settings: &Value,
) -> Result<Option<NarrativeEmbeddingRoute>, String> {
    let enabled = setting_bool(
        settings,
        &[
            &["narrative_embedding_enabled"],
            &["oai_settings", "narrative_embedding_enabled"],
        ],
    )
    .unwrap_or(false);
    if !enabled {
        return Ok(None);
    }

    let model = setting_string(
        settings,
        &[
            &["narrative_embedding_model"],
            &["oai_settings", "narrative_embedding_model"],
        ],
    )
    .unwrap_or_default();
    if model.trim().is_empty() {
        return Ok(None);
    }

    let provider_id = setting_string(
        settings,
        &[
            &["narrative_embedding_provider_id"],
            &["oai_settings", "narrative_embedding_provider_id"],
        ],
    )
    .unwrap_or_default();
    let source = setting_string(
        settings,
        &[
            &["narrative_embedding_source"],
            &["oai_settings", "narrative_embedding_source"],
            &["chat_completion_source"],
            &["oai_settings", "chat_completion_source"],
        ],
    )
    .unwrap_or_else(|| "openai".to_string());
    let base_url_override = setting_string(
        settings,
        &[
            &["narrative_embedding_base_url"],
            &["oai_settings", "narrative_embedding_base_url"],
        ],
    )
    .unwrap_or_default();
    let reverse_proxy = setting_string(
        settings,
        &[&["reverse_proxy"], &["oai_settings", "reverse_proxy"]],
    )
    .unwrap_or_default();
    let proxy_password = setting_string(
        settings,
        &[&["proxy_password"], &["oai_settings", "proxy_password"]],
    )
    .unwrap_or_default();
    let custom_url = setting_string(
        settings,
        &[&["custom_url"], &["oai_settings", "custom_url"]],
    )
    .unwrap_or_default();

    if let Some(provider) = load_model_provider_for_capability(provider_id.as_str(), "embedding")? {
        if let Some(route) = build_embedding_route_from_provider(&provider) {
            return Ok(Some(route));
        }
    }

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));

    let endpoint = match source.trim() {
        "openai" => {
            let key = resolve_api_key(&reverse_proxy, &proxy_password, "api_key_openai")?;
            headers.insert(AUTHORIZATION, bearer_header(&key)?);
            format!(
                "{}/embeddings",
                trim_trailing_slash_or_default(
                    if base_url_override.trim().is_empty() {
                        &reverse_proxy
                    } else {
                        &base_url_override
                    },
                    "https://api.openai.com/v1",
                )
            )
        }
        "openrouter" => {
            let key = resolve_api_key(&reverse_proxy, &proxy_password, "api_key_openrouter")?;
            headers.insert(AUTHORIZATION, bearer_header(&key)?);
            headers.insert(
                "HTTP-Referer",
                HeaderValue::from_static("https://github.com/Yggdrasil/Yggdrasil"),
            );
            headers.insert("X-Title", HeaderValue::from_static("Yggdrasil"));
            format!(
                "{}/embeddings",
                trim_trailing_slash_or_default(
                    if base_url_override.trim().is_empty() {
                        &reverse_proxy
                    } else {
                        &base_url_override
                    },
                    "https://openrouter.ai/api/v1",
                )
            )
        }
        "custom" => {
            let root = normalize_openai_compatible_root(if base_url_override.trim().is_empty() {
                &custom_url
            } else {
                &base_url_override
            });
            if root.is_empty() {
                return Ok(None);
            }
            let key = resolve_optional_api_key(&reverse_proxy, &proxy_password, "api_key_custom");
            if !key.trim().is_empty() {
                headers.insert(AUTHORIZATION, bearer_header(&key)?);
            }
            format!("{root}/embeddings")
        }
        _ => return Ok(None),
    };

    Ok(Some(NarrativeEmbeddingRoute {
        endpoint,
        headers,
        model,
        protocol: provider_protocols::OPENAI_EMBEDDINGS.to_string(),
    }))
}

fn resolve_openai_chat_route(
    settings: &Value,
    route: &NarrativeTaskRoute,
) -> Result<ResolvedOpenAiChatRoute, String> {
    let provider_id = setting_string(
        settings,
        &[
            &["chat_model_provider_id"],
            &["oai_settings", "chat_model_provider_id"],
        ],
    )
    .unwrap_or_default();

    if let Some(provider) = load_model_provider_for_capability(provider_id.as_str(), "chat")? {
        if let Some(route) = build_chat_route_from_provider(route, &provider) {
            return Ok(ResolvedOpenAiChatRoute {
                provider_label: format!("{}:{}", provider.provider_type, provider.protocol),
                protocol: provider.protocol.clone(),
                route,
            });
        }
    }

    Ok(ResolvedOpenAiChatRoute {
        provider_label: route
            .chat_completion_source
            .clone()
            .unwrap_or_else(|| "openai".to_string()),
        protocol: provider_protocols::OPENAI_CHAT_COMPLETIONS.to_string(),
        route: route.clone(),
    })
}

fn load_model_provider_for_capability(
    provider_id: &str,
    capability_name: &str,
) -> Result<Option<ModelProviderRecord>, String> {
    if provider_id.trim().is_empty() {
        return Ok(None);
    }

    storage::fetch_enabled_model_provider_for_capability(provider_id, capability_name)?
        .map(Some)
        .ok_or_else(|| {
            format!("已选择的服务商 {provider_id} 不可用，或未启用 {capability_name} 能力。")
        })
}

fn build_chat_route_from_provider(
    base_route: &NarrativeTaskRoute,
    provider: &ModelProviderRecord,
) -> Option<NarrativeTaskRoute> {
    let capability = provider
        .capabilities
        .iter()
        .find(|item| item.capability == "chat" && item.enabled)?;
    let model = storage::provider_capability_primary_model(capability)?;
    let mut next_route = base_route.clone();
    next_route.chat_completion_source = Some(provider.provider_type.clone());
    next_route.model = model;
    Some(next_route)
}

fn build_embedding_route_from_provider(
    provider: &ModelProviderRecord,
) -> Option<NarrativeEmbeddingRoute> {
    let capability = provider
        .capabilities
        .iter()
        .find(|item| item.capability == "embedding" && item.enabled)?;
    let model = storage::provider_capability_primary_model(capability)?;
    let key = storage::read_secret(&provider.secret_key).unwrap_or_default();
    let (endpoint, headers) =
        provider_protocols::build_embeddings_endpoint_and_headers(&ProviderProtocolConfig {
            api_key: key.trim(),
            api_version: provider.api_version.as_deref(),
            base_url: provider.base_url.trim(),
            deployment_name: provider.deployment_name.as_deref(),
            provider_type: provider.provider_type.trim(),
            protocol: provider.protocol.trim(),
        })
        .ok()?;

    Some(NarrativeEmbeddingRoute {
        endpoint,
        headers,
        model,
        protocol: provider.protocol.clone(),
    })
}

fn build_chat_endpoint_and_headers_from_provider(
    provider: &ModelProviderRecord,
) -> Result<(String, HeaderMap), String> {
    let key = storage::read_secret(&provider.secret_key).unwrap_or_default();
    let request = provider_protocols::build_chat_request(
        &ProviderProtocolConfig {
            api_key: key.trim(),
            api_version: provider.api_version.as_deref(),
            base_url: provider.base_url.trim(),
            deployment_name: provider.deployment_name.as_deref(),
            provider_type: provider.provider_type.trim(),
            protocol: provider.protocol.trim(),
        },
        &provider
            .capabilities
            .iter()
            .find(|item| item.capability == "chat" && item.enabled)
            .and_then(storage::provider_capability_primary_model)
            .ok_or_else(|| "当前服务商缺少可用 chat 模型。".to_string())?,
        &[json!({"role":"user","content":"ping"})],
        &NarrativeTaskRoute {
            chat_completion_source: Some(provider.provider_type.clone()),
            frequency_penalty: None,
            max_tokens: 1,
            model: storage::provider_capability_primary_model(
                provider
                    .capabilities
                    .iter()
                    .find(|item| item.capability == "chat" && item.enabled)
                    .ok_or_else(|| "当前服务商缺少可用 chat 模型。".to_string())?,
            )
            .unwrap_or_default(),
            presence_penalty: None,
            provider: NarrativeProviderKind::OpenAi,
            reasoning_effort: None,
            repetition_penalty: None,
            structured_output_schema_id: None,
            temperature: 0.0,
            top_p: 1.0,
        },
        false,
    )?;

    Ok((request.endpoint, request.headers))
}

async fn request_openai_embeddings(
    route: &NarrativeEmbeddingRoute,
    inputs: &[String],
) -> Result<Vec<Vec<f64>>, String> {
    if inputs.is_empty() {
        return Ok(vec![]);
    }

    let payload = if provider_protocols::normalize_provider_protocol(Some(&route.protocol), "")
        == provider_protocols::OLLAMA_EMBEDDINGS
    {
        json!({
            "model": route.model,
            "input": inputs,
        })
    } else {
        json!({
            "model": route.model,
            "input": inputs,
            "encoding_format": "float",
        })
    };

    let response = reqwest::Client::new()
        .post(route.endpoint.clone())
        .headers(route.headers.clone())
        .json(&payload)
        .send()
        .await
        .map_err(to_string_error)?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Embedding 请求失败 ({}): {}", status, text.trim()));
    }

    let payload: Value = response.json().await.map_err(to_string_error)?;
    let normalized_protocol =
        provider_protocols::normalize_provider_protocol(Some(&route.protocol), "");
    let mut rows = if normalized_protocol == provider_protocols::OLLAMA_EMBEDDINGS {
        extract_ollama_embeddings(&payload)
    } else {
        payload
            .get("data")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| {
                        let index = item.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                        let vector = item
                            .get("embedding")
                            .and_then(Value::as_array)
                            .map(|values| values.iter().filter_map(Value::as_f64).collect::<Vec<_>>())
                            .filter(|values| !values.is_empty())?;
                        Some((index, vector))
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    };

    rows.sort_by_key(|(index, _)| *index);
    Ok(rows.into_iter().map(|(_, vector)| vector).collect())
}

fn extract_ollama_embeddings(payload: &Value) -> Vec<(usize, Vec<f64>)> {
    if let Some(items) = payload.get("embeddings").and_then(Value::as_array) {
        return items
            .iter()
            .enumerate()
            .filter_map(|(index, item)| {
                item.as_array()
                    .map(|values| values.iter().filter_map(Value::as_f64).collect::<Vec<_>>())
                    .filter(|values| !values.is_empty())
                    .map(|vector| (index, vector))
            })
            .collect();
    }

    payload
        .get("embedding")
        .and_then(Value::as_array)
        .map(|values| values.iter().filter_map(Value::as_f64).collect::<Vec<_>>())
        .filter(|values| !values.is_empty())
        .map(|vector| vec![(0, vector)])
        .unwrap_or_default()
}

fn build_narrative_memory_embedding_input(entry: &NarrativeMemoryEntry) -> String {
    let tags = if entry.tags.is_empty() {
        String::new()
    } else {
        format!("Tags: {}", entry.tags.join(", "))
    };

    [
        entry.kind.trim(),
        entry.summary.trim(),
        entry.content.trim(),
        tags.trim(),
    ]
    .into_iter()
    .filter(|segment| !segment.is_empty())
    .collect::<Vec<_>>()
    .join("\n")
}

fn retrieve_lorebook_snippets(
    active_world_names: Vec<String>,
    query: &str,
) -> Result<Vec<LorebookSnippet>, String> {
    if active_world_names.is_empty() {
        return Ok(vec![]);
    }

    let active_lookup = active_world_names
        .into_iter()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect::<Vec<_>>();
    if active_lookup.is_empty() {
        return Ok(vec![]);
    }

    let documents = storage::fetch_library_documents("worlds")?;
    let query_terms = tokenize_context_query(query);
    let mut snippets = Vec::new();

    for document in documents
        .into_iter()
        .filter(|document| active_lookup.iter().any(|name| name == &document.name))
    {
        let Some(content_text) = document.content_text.as_deref() else {
            continue;
        };
        let Ok(entries) = serde_json::from_str::<Vec<Value>>(content_text) else {
            continue;
        };

        for entry in entries {
            if entry.get("enabled").and_then(Value::as_bool) == Some(false) {
                continue;
            }

            let content = entry
                .get("content")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or("");
            if content.is_empty() {
                continue;
            }

            let comment = entry
                .get("comment")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or("");
            let keys = entry
                .get("keys")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(ToOwned::to_owned)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let score = score_lorebook_entry(&document.name, &keys, comment, content, &query_terms);
            if !query_terms.is_empty() && score <= 0.0 {
                continue;
            }

            snippets.push(LorebookSnippet {
                book_name: document.name.clone(),
                content: if keys.is_empty() {
                    content.to_string()
                } else {
                    format!("[{}] {}", keys.join(", "), content)
                },
                keys,
                score,
            });
        }
    }

    snippets.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.book_name.cmp(&right.book_name))
    });
    snippets.truncate(8);
    Ok(snippets)
}

fn retrieve_character_snippets(
    avatar_url: Option<&str>,
    query: &str,
) -> Result<Vec<CharacterSnippet>, String> {
    let Some(target_avatar) = avatar_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(storage::resolve_avatar_file_name)
    else {
        return Ok(vec![]);
    };

    let query_terms = tokenize_context_query(query);
    let characters = storage::fetch_characters()?;
    let Some(character) = characters
        .into_iter()
        .find(|item| item.avatar.trim() == target_avatar)
    else {
        return Ok(vec![]);
    };

    let fragments = [
        ("description", character.description.trim()),
        ("personality", character.personality.trim()),
        ("scenario", character.scenario.trim()),
        ("system_prompt", character.system_prompt.trim()),
        (
            "post_history_instructions",
            character.post_history_instructions.trim(),
        ),
        ("first_mes", character.first_mes.trim()),
    ];

    let mut snippets = fragments
        .into_iter()
        .filter(|(_, content)| !content.is_empty())
        .map(|(field, content)| CharacterSnippet {
            character_name: character.name.clone(),
            content: format!("[{field}] {content}"),
            score: score_character_fragment(content, &query_terms),
        })
        .collect::<Vec<_>>();

    snippets.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    snippets.truncate(3);
    Ok(snippets)
}

fn retrieve_session_snippets(
    file_name: Option<&str>,
    avatar_url: Option<&str>,
    query: &str,
) -> Result<Vec<SessionSnippet>, String> {
    let Some(file_name) = file_name.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(vec![]);
    };
    let Some(avatar_url) = avatar_url.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(vec![]);
    };

    let messages = storage::fetch_chat(avatar_url, file_name)?;
    let query_terms = tokenize_context_query(query);
    let mut snippets = messages
        .iter()
        .enumerate()
        .filter_map(|(index, message)| {
            let content = message
                .get("mes")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())?;
            let role = if message.get("is_user").and_then(Value::as_bool) == Some(true) {
                "user"
            } else if message.get("is_system").and_then(Value::as_bool) == Some(true) {
                "system"
            } else {
                "assistant"
            };

            Some(SessionSnippet {
                content: content.to_string(),
                ordinal: index,
                role: role.to_string(),
                score: score_session_fragment(content, &query_terms, index, messages.len()),
            })
        })
        .collect::<Vec<_>>();

    snippets.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| right.ordinal.cmp(&left.ordinal))
    });
    snippets.truncate(4);
    Ok(snippets)
}

fn build_retrieval_hit_summaries(
    character_snippets: &[CharacterSnippet],
    session_snippets: &[SessionSnippet],
    lorebook_snippets: &[LorebookSnippet],
    narrative_memories: &[NarrativeMemoryEntry],
) -> Vec<RetrievalHitSummary> {
    let mut hits = Vec::new();

    for snippet in character_snippets {
        hits.push(RetrievalHitSummary {
            domain: "character".to_string(),
            hit_id: snippet.character_name.clone(),
            score: snippet.score,
        });
    }

    for snippet in session_snippets {
        hits.push(RetrievalHitSummary {
            domain: "session".to_string(),
            hit_id: format!("message:{}", snippet.ordinal),
            score: snippet.score,
        });
    }

    for snippet in lorebook_snippets {
        hits.push(RetrievalHitSummary {
            domain: "world".to_string(),
            hit_id: snippet.book_name.clone(),
            score: snippet.score,
        });
    }

    for memory in narrative_memories {
        hits.push(RetrievalHitSummary {
            domain: "memory".to_string(),
            hit_id: memory.id.clone(),
            score: memory.importance,
        });
    }

    hits.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    hits.truncate(12);
    hits
}

fn build_world_state_snippets(snapshot: WorldStateSnapshotEntry) -> Vec<WorldStateSnippet> {
    let mut snippets = Vec::new();

    append_world_state_snippets(&mut snippets, "location", &snapshot.locations);
    append_world_state_snippets(&mut snippets, "faction", &snapshot.factions);
    append_world_state_snippets(&mut snippets, "relationship", &snapshot.relationships);
    append_world_state_snippets(&mut snippets, "quest", &snapshot.quests);
    append_world_state_snippets(&mut snippets, "inventory", &snapshot.inventory_items);
    append_world_state_snippets(&mut snippets, "scene", &snapshot.scene_states);

    snippets.truncate(10);
    snippets
}

fn append_world_state_snippets(
    snippets: &mut Vec<WorldStateSnippet>,
    category: &str,
    items: &[WorldStateItemEntry],
) {
    for item in items.iter().take(3) {
        snippets.push(WorldStateSnippet {
            category: category.to_string(),
            detail: item.detail.trim().to_string(),
            entity: item.name.trim().to_string(),
            status: item.status.trim().to_string(),
        });
    }
}

fn build_retrieval_chunk_records(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    character_snippets: &[CharacterSnippet],
    session_snippets: &[SessionSnippet],
    lorebook_snippets: &[LorebookSnippet],
    narrative_memories: &[NarrativeMemoryEntry],
) -> Vec<RetrievalChunkRecord> {
    let avatar = avatar_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(storage::resolve_avatar_file_name)
        .unwrap_or_default();
    let session_owner = match file_name.map(str::trim).filter(|value| !value.is_empty()) {
        Some(file) if !avatar.is_empty() => storage::session_id_for(&avatar, file),
        _ => String::new(),
    };

    let mut chunks = Vec::new();

    for (index, snippet) in character_snippets.iter().enumerate() {
        chunks.push(RetrievalChunkRecord {
            id: format!("character::{}::{}", snippet.character_name, index),
            source_type: "character".to_string(),
            source_id: snippet.character_name.clone(),
            owner_key: snippet.character_name.clone(),
            scene_tags: vec![],
            entity_tags: vec![snippet.character_name.clone()],
            time_tags: vec![],
            content_text: snippet.content.clone(),
        });
    }

    for snippet in session_snippets {
        chunks.push(RetrievalChunkRecord {
            id: format!("session::{}::{}", session_owner, snippet.ordinal),
            source_type: "session".to_string(),
            source_id: format!("{}", snippet.ordinal),
            owner_key: session_owner.clone(),
            scene_tags: vec![snippet.role.clone()],
            entity_tags: vec![],
            time_tags: vec![],
            content_text: snippet.content.clone(),
        });
    }

    for snippet in lorebook_snippets {
        chunks.push(RetrievalChunkRecord {
            id: format!("world::{}::{}", snippet.book_name, snippet.keys.join("|")),
            source_type: "world".to_string(),
            source_id: snippet.book_name.clone(),
            owner_key: snippet.book_name.clone(),
            scene_tags: snippet.keys.clone(),
            entity_tags: snippet.keys.clone(),
            time_tags: vec![],
            content_text: snippet.content.clone(),
        });
    }

    for memory in narrative_memories {
        chunks.push(RetrievalChunkRecord {
            id: format!("memory::{}", memory.id),
            source_type: "memory".to_string(),
            source_id: memory.id.clone(),
            owner_key: memory.character_name.clone(),
            scene_tags: vec![memory.kind.clone()],
            entity_tags: memory.tags.clone(),
            time_tags: vec![],
            content_text: memory.content.clone(),
        });
    }

    chunks
}

fn rerank_generation_context(
    query: &str,
    mut character_snippets: Vec<CharacterSnippet>,
    mut session_snippets: Vec<SessionSnippet>,
    mut lorebook_snippets: Vec<LorebookSnippet>,
    mut narrative_memories: Vec<NarrativeMemoryEntry>,
    retrieval_hits: Vec<RetrievalHitSummary>,
) -> RerankedGenerationContext {
    let query_terms = tokenize_context_query(query);
    let mut hit_scores = HashMap::new();
    for hit in retrieval_hits {
        let key = format!("{}::{}", hit.domain, hit.hit_id);
        hit_scores.insert(key, hit.score);
    }

    character_snippets.sort_by(|left, right| {
        blended_character_score(right, &query_terms, &hit_scores)
            .partial_cmp(&blended_character_score(left, &query_terms, &hit_scores))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    character_snippets.truncate(3);

    session_snippets.sort_by(|left, right| {
        blended_session_score(right, &query_terms, &hit_scores)
            .partial_cmp(&blended_session_score(left, &query_terms, &hit_scores))
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| right.ordinal.cmp(&left.ordinal))
    });
    session_snippets.truncate(4);

    lorebook_snippets.sort_by(|left, right| {
        blended_world_score(right, &query_terms, &hit_scores)
            .partial_cmp(&blended_world_score(left, &query_terms, &hit_scores))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    lorebook_snippets.truncate(8);

    narrative_memories.sort_by(|left, right| {
        blended_memory_score(right, &query_terms, &hit_scores)
            .partial_cmp(&blended_memory_score(left, &query_terms, &hit_scores))
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| right.updated_at.cmp(&left.updated_at))
    });
    narrative_memories.truncate(6);

    let retrieval_hits = build_retrieval_hit_summaries(
        &character_snippets,
        &session_snippets,
        &lorebook_snippets,
        &narrative_memories,
    );

    RerankedGenerationContext {
        character_snippets,
        lorebook_snippets,
        narrative_memories,
        retrieval_hits,
        session_snippets,
    }
}

fn retrieval_domain_weights() -> Value {
    json!({
        "character": {
            "prior": 0.75,
            "lexical": 0.25,
        },
        "session": {
            "prior": 0.68,
            "lexical": 0.20,
            "assistantRoleBonus": 0.22,
            "userRoleBonus": 0.14,
            "systemRoleBonus": 0.08,
        },
        "world": {
            "prior": 0.70,
            "lexical": 0.18,
            "keyBonus": 0.12,
        },
        "memory": {
            "prior": 0.62,
            "lexical": 0.20,
            "tagBonus": 0.08,
            "importanceBonus": 0.10,
        },
    })
}

fn blended_character_score(
    snippet: &CharacterSnippet,
    query_terms: &[String],
    hit_scores: &HashMap<String, f64>,
) -> f64 {
    let lexical = lexical_overlap_score(&snippet.content, query_terms);
    let prior = hit_scores
        .get(&format!("character::{}", snippet.character_name))
        .copied()
        .unwrap_or(snippet.score);
    prior * 0.75 + lexical * 0.25
}

fn blended_session_score(
    snippet: &SessionSnippet,
    query_terms: &[String],
    hit_scores: &HashMap<String, f64>,
) -> f64 {
    let lexical = lexical_overlap_score(&snippet.content, query_terms);
    let prior = hit_scores
        .get(&format!("session::message:{}", snippet.ordinal))
        .copied()
        .unwrap_or(snippet.score);
    let role_bonus = match snippet.role.as_str() {
        "assistant" => 0.22,
        "user" => 0.14,
        "system" => 0.08,
        _ => 0.0,
    };
    prior * 0.68 + lexical * 0.2 + role_bonus
}

fn blended_world_score(
    snippet: &LorebookSnippet,
    query_terms: &[String],
    hit_scores: &HashMap<String, f64>,
) -> f64 {
    let lexical = lexical_overlap_score(&snippet.content, query_terms);
    let key_bonus = snippet
        .keys
        .iter()
        .map(|key| lexical_overlap_score(key, query_terms))
        .sum::<f64>();
    let prior = hit_scores
        .get(&format!("world::{}", snippet.book_name))
        .copied()
        .unwrap_or(snippet.score);
    prior * 0.7 + lexical * 0.18 + key_bonus * 0.12
}

fn blended_memory_score(
    memory: &NarrativeMemoryEntry,
    query_terms: &[String],
    hit_scores: &HashMap<String, f64>,
) -> f64 {
    let lexical = lexical_overlap_score(&memory.content, query_terms);
    let tag_bonus = memory
        .tags
        .iter()
        .map(|tag| lexical_overlap_score(tag, query_terms))
        .sum::<f64>();
    let prior = hit_scores
        .get(&format!("memory::{}", memory.id))
        .copied()
        .unwrap_or(memory.importance);
    let importance_bonus = memory.importance.max(0.0).min(10.0) / 10.0;
    prior * 0.62 + lexical * 0.2 + tag_bonus * 0.08 + importance_bonus * 0.1
}

fn lexical_overlap_score(content: &str, query_terms: &[String]) -> f64 {
    if query_terms.is_empty() {
        return 1.0;
    }

    let lowered = content.to_lowercase();
    let mut score = 0.0;
    for term in query_terms {
        if lowered.contains(term) {
            score += 1.0;
        }
    }
    score
}

fn retrieve_directive_snippets(settings: &Value) -> Result<Vec<DirectiveSnippet>, String> {
    let mut snippets = Vec::new();

    if setting_bool(settings, &[&["sysprompt", "enabled"]]).unwrap_or(false) {
        let content = setting_string(settings, &[&["sysprompt", "content"]]).unwrap_or_default();
        let name = setting_string(settings, &[&["sysprompt", "name"]])
            .unwrap_or_else(|| "System Prompt".to_string());
        if !content.trim().is_empty() {
            snippets.push(DirectiveSnippet {
                content: content.trim().to_string(),
                label: "System prompt".to_string(),
                source_name: name,
            });
        } else if let Some(content) = resolve_library_document_content("sysprompts", &name)? {
            snippets.push(DirectiveSnippet {
                content,
                label: "System prompt".to_string(),
                source_name: name,
            });
        }
    }

    if let Some(name) = setting_string(settings, &[&["context", "preset"]]) {
        if let Some(content) = resolve_library_document_content("contexts", &name)? {
            snippets.push(DirectiveSnippet {
                content,
                label: "Context preset".to_string(),
                source_name: name,
            });
        }
    }

    if setting_bool(settings, &[&["instruct", "enabled"]]).unwrap_or(false) {
        if let Some(name) = setting_string(settings, &[&["instruct", "preset"]]) {
            if let Some(content) = resolve_library_document_content("instructs", &name)? {
                snippets.push(DirectiveSnippet {
                    content,
                    label: "Instruct preset".to_string(),
                    source_name: name,
                });
            }
        }
    }

    if setting_bool(settings, &[&["reasoning", "add_to_prompts"]]).unwrap_or(false) {
        if let Some(name) = setting_string(settings, &[&["reasoning", "name"]]) {
            if let Some(content) = resolve_library_document_content("reasonings", &name)? {
                snippets.push(DirectiveSnippet {
                    content,
                    label: "Reasoning guide".to_string(),
                    source_name: name,
                });
            }
        }
    }

    Ok(snippets)
}

fn resolve_library_document_content(domain: &str, name: &str) -> Result<Option<String>, String> {
    let documents = storage::fetch_library_documents(domain)?;
    let content = documents
        .into_iter()
        .find(|document| document.name == name)
        .and_then(|document| document.content_text)
        .map(|content| summarize_library_content(&content))
        .filter(|content| !content.trim().is_empty());
    Ok(content)
}

fn summarize_library_content(raw_content: &str) -> String {
    let trimmed = raw_content.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let Ok(parsed) = serde_json::from_str::<Value>(trimmed) else {
        return trimmed.to_string();
    };

    match parsed {
        Value::String(text) => text.trim().to_string(),
        Value::Array(items) => items
            .iter()
            .take(6)
            .filter_map(extract_useful_json_text)
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(_) => {
            extract_useful_json_text(&parsed).unwrap_or_else(|| trimmed.to_string())
        }
        _ => trimmed.to_string(),
    }
}

fn extract_useful_json_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.trim().to_string()).filter(|text| !text.is_empty()),
        Value::Object(map) => {
            let preferred_keys = [
                "content",
                "system_prompt",
                "prompt",
                "description",
                "instruction",
                "comment",
                "text",
            ];

            for key in preferred_keys {
                if let Some(text) = map.get(key).and_then(Value::as_str).map(str::trim) {
                    if !text.is_empty() {
                        return Some(text.to_string());
                    }
                }
            }

            let flattened = map
                .iter()
                .filter_map(|(key, value)| match value {
                    Value::String(text) if !text.trim().is_empty() => {
                        Some(format!("{key}: {}", text.trim()))
                    }
                    _ => None,
                })
                .take(4)
                .collect::<Vec<_>>()
                .join("\n");

            if flattened.is_empty() {
                None
            } else {
                Some(flattened)
            }
        }
        _ => None,
    }
}

fn tokenize_context_query(value: &str) -> Vec<String> {
    value
        .split(|character: char| !character.is_alphanumeric() && !is_cjk(character))
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .map(|segment| segment.to_lowercase())
        .filter(|segment| segment.chars().count() >= 2 || segment.chars().any(is_cjk))
        .collect()
}

fn is_cjk(character: char) -> bool {
    matches!(
        character,
        '\u{4E00}'..='\u{9FFF}'
            | '\u{3400}'..='\u{4DBF}'
            | '\u{3040}'..='\u{309F}'
            | '\u{30A0}'..='\u{30FF}'
            | '\u{AC00}'..='\u{D7AF}'
    )
}

fn score_lorebook_entry(
    book_name: &str,
    keys: &[String],
    comment: &str,
    content: &str,
    query_terms: &[String],
) -> f64 {
    if query_terms.is_empty() {
        return (keys.len() as f64 * 0.25) + if comment.is_empty() { 0.0 } else { 0.1 };
    }

    let book_name = book_name.to_lowercase();
    let keys = keys
        .iter()
        .map(|value| value.to_lowercase())
        .collect::<Vec<_>>();
    let comment = comment.to_lowercase();
    let content = content.to_lowercase();
    let mut score = 0.0;

    for term in query_terms {
        if keys.iter().any(|key| key.contains(term)) {
            score += 4.0;
        }
        if comment.contains(term) {
            score += 2.5;
        }
        if content.contains(term) {
            score += 2.0;
        }
        if book_name.contains(term) {
            score += 1.0;
        }
    }

    score
}

fn score_character_fragment(content: &str, query_terms: &[String]) -> f64 {
    if query_terms.is_empty() {
        return 1.0;
    }

    let lowered = content.to_lowercase();
    let mut score = 0.0;
    for term in query_terms {
        if lowered.contains(term) {
            score += 3.0;
        }
    }
    score
}

fn score_session_fragment(
    content: &str,
    query_terms: &[String],
    ordinal: usize,
    total: usize,
) -> f64 {
    let lowered = content.to_lowercase();
    let mut score = if query_terms.is_empty() { 1.0 } else { 0.0 };

    for term in query_terms {
        if lowered.contains(term) {
            score += 3.5;
        }
    }

    let recency_bonus = if total == 0 {
        0.0
    } else {
        ordinal as f64 / total as f64
    };

    score + recency_bonus
}

fn score_hybrid_narrative_memory(
    query_vector: &[f64],
    memory_vector: &[f64],
    lexical_rank: usize,
    pool_size: usize,
    importance: f64,
) -> f64 {
    let cosine = cosine_similarity(query_vector, memory_vector);
    let lexical_rank_score = if pool_size <= 1 {
        1.0
    } else {
        1.0 - (lexical_rank as f64 / (pool_size - 1) as f64)
    };
    let importance_bonus = importance.max(0.0).min(10.0) / 10.0;

    cosine * 0.74 + lexical_rank_score * 0.2 + importance_bonus * 0.06
}

fn cosine_similarity(left: &[f64], right: &[f64]) -> f64 {
    let mut dot = 0.0;
    let mut left_norm = 0.0;
    let mut right_norm = 0.0;

    for (left_value, right_value) in left.iter().zip(right.iter()) {
        dot += left_value * right_value;
        left_norm += left_value * left_value;
        right_norm += right_value * right_value;
    }

    if left_norm <= f64::EPSILON || right_norm <= f64::EPSILON {
        return 0.0;
    }

    dot / (left_norm.sqrt() * right_norm.sqrt())
}

pub(crate) fn parse_narrative_memory_extraction(
    raw_response: &str,
) -> Result<NarrativeMemoryExtractionResult, String> {
    let parsed: Value = serde_json::from_str(raw_response)
        .map_err(|error| format!("结构化记忆提取结果无法解析为 JSON: {error}"))?;
    let candidate_memories = parsed
        .get("candidate_memories")
        .and_then(Value::as_array)
        .map(|items| normalize_narrative_memory_records(items))
        .filter(|items| !items.is_empty())
        .or_else(|| {
            parsed
                .get("narrative_memories")
                .and_then(Value::as_array)
                .map(|items| normalize_narrative_memory_records(items))
                .filter(|items| !items.is_empty())
        })
        .or_else(|| {
            parsed
                .get("memories")
                .and_then(Value::as_array)
                .map(|items| normalize_narrative_memory_records(items))
                .filter(|items| !items.is_empty())
        })
        .or_else(|| {
            parsed
                .as_object()
                .and_then(find_narrative_memory_like_array)
                .map(|items| normalize_narrative_memory_records(items))
                .filter(|items| !items.is_empty())
        })
        .unwrap_or_default();
    let summary = parsed
        .get("summary")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            parsed
                .get("narrative_summary")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
        })
        .or_else(|| {
            if candidate_memories.is_empty() {
                None
            } else {
                Some(format!("Extracted {} narrative memories.", candidate_memories.len()))
            }
        })
        .unwrap_or_default();
    let open_threads = parsed
        .get("open_threads")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(NarrativeMemoryExtractionResult {
        candidate_memories,
        open_threads,
        stored_count: 0,
        summary,
    })
}

fn normalize_narrative_memory_records(items: &[Value]) -> Vec<NarrativeMemoryRecord> {
    items
        .iter()
        .filter_map(|item| {
            let content = item
                .get("content")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .or_else(|| {
                    item.get("summary")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                })
                .or_else(|| {
                    item.get("memory")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                })
                .or_else(|| {
                    item.get("detail")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                })?
                .to_string();

            let importance = normalize_narrative_memory_importance(item.get("importance"));
            let kind = item
                .get("kind")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .or_else(|| {
                    item.get("category")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(|value| {
                            value
                                .to_ascii_lowercase()
                                .replace([' ', '-'], "_")
                        })
                })
                .or_else(|| {
                    item.get("type")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(|value| {
                            value
                                .to_ascii_lowercase()
                                .replace([' ', '-'], "_")
                        })
                })
                .or_else(|| {
                    item.get("memory_type")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(|value| {
                            value
                                .to_ascii_lowercase()
                                .replace([' ', '-'], "_")
                        })
                })
                .unwrap_or_else(|| "fact".to_string());
            let mut tags = item
                .get("tags")
                .and_then(Value::as_array)
                .map(|values| {
                    values
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(ToOwned::to_owned)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            if tags.is_empty() {
                if let Some(category) = item
                    .get("category")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                {
                    tags.push(category.to_string());
                }
            }

            Some(NarrativeMemoryRecord {
                content,
                importance,
                kind,
                tags,
            })
        })
        .collect()
}

fn normalize_narrative_memory_importance(value: Option<&Value>) -> f64 {
    if let Some(number) = value.and_then(Value::as_f64) {
        return number;
    }

    match value.and_then(Value::as_str).map(str::trim) {
        Some("high") | Some("HIGH") => 0.9,
        Some("medium") | Some("MEDIUM") => 0.6,
        Some("low") | Some("LOW") => 0.3,
        _ => 0.0,
    }
}

fn find_narrative_memory_like_array<'a>(
    root: &'a serde_json::Map<String, Value>,
) -> Option<&'a Vec<Value>> {
    root.values().find_map(|value| {
        let items = value.as_array()?;
        let looks_like_memory_list = items.iter().any(|item| {
            item.get("content")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .is_some()
                || item
                    .get("summary")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|text| !text.is_empty())
                    .is_some()
        });

        if looks_like_memory_list {
            Some(items)
        } else {
            None
        }
    })
}

fn extract_usage_total_tokens(payload: &Value) -> Option<u64> {
    payload
        .get("usage")
        .and_then(Value::as_object)
        .and_then(|usage| {
            usage
                .get("total_tokens")
                .and_then(Value::as_u64)
                .or_else(|| usage.get("completion_tokens").and_then(Value::as_u64))
                .or_else(|| usage.get("generated_tokens").and_then(Value::as_u64))
                .or_else(|| usage.get("output_tokens").and_then(Value::as_u64))
                .or_else(|| usage.get("prompt_tokens").and_then(Value::as_u64))
        })
        .or_else(|| payload.get("token_count").and_then(Value::as_u64))
        .or_else(|| payload.get("tokens").and_then(Value::as_u64))
}

fn trace_duration_ms(started_at: u64) -> u64 {
    current_timestamp_millis().saturating_sub(started_at)
}

fn record_trace_success(
    provider: &str,
    model: Option<&str>,
    request_payload: &Value,
    prompt_text: Option<String>,
    response_payload: &Value,
    response_text: &str,
    prompt_cache_metadata: Option<&PromptCacheTraceMetadata>,
    trace_context: Option<&TraceContextPayload>,
    started_at: u64,
) {
    let request_payload =
        stringify_trace_request_payload(request_payload, trace_context, prompt_cache_metadata);
    let token_count = extract_usage_total_tokens(response_payload);
    let avatar_url = trace_context.and_then(|context| context.avatar_url.clone());
    let file_name = trace_context.and_then(|context| context.file_name.clone());
    let character_name = trace_context
        .and_then(|context| context.character_name.clone())
        .unwrap_or_default();

    let _ = storage::save_trace_entry(
        avatar_url.as_deref(),
        file_name.as_deref(),
        if character_name.trim().is_empty() {
            None
        } else {
            Some(character_name.as_str())
        },
        provider,
        model,
        prompt_text.as_deref(),
        request_payload.as_deref(),
        Some(response_text),
        None,
        token_count,
        Some(trace_duration_ms(started_at)),
    );
    logs::append_trace_summary(
        provider,
        model,
        Some(trace_duration_ms(started_at)),
        token_count,
        if character_name.trim().is_empty() {
            None
        } else {
            Some(character_name.as_str())
        },
        file_name.as_deref(),
        request_payload.clone(),
        Some(response_payload.clone()),
        Some(response_text),
        None,
    );
}

fn record_trace_error(
    provider: &str,
    model: Option<&str>,
    request_payload: &Value,
    prompt_text: Option<String>,
    error_text: &str,
    prompt_cache_metadata: Option<&PromptCacheTraceMetadata>,
    trace_context: Option<&TraceContextPayload>,
    started_at: u64,
) {
    let request_payload =
        stringify_trace_request_payload(request_payload, trace_context, prompt_cache_metadata);
    let avatar_url = trace_context.and_then(|context| context.avatar_url.clone());
    let file_name = trace_context.and_then(|context| context.file_name.clone());
    let character_name = trace_context
        .and_then(|context| context.character_name.clone())
        .unwrap_or_default();

    let _ = storage::save_trace_entry(
        avatar_url.as_deref(),
        file_name.as_deref(),
        if character_name.trim().is_empty() {
            None
        } else {
            Some(character_name.as_str())
        },
        provider,
        model,
        prompt_text.as_deref(),
        request_payload.as_deref(),
        None,
        Some(error_text),
        None,
        Some(trace_duration_ms(started_at)),
    );
    logs::append_trace_summary(
        provider,
        model,
        Some(trace_duration_ms(started_at)),
        None,
        if character_name.trim().is_empty() {
            None
        } else {
            Some(character_name.as_str())
        },
        file_name.as_deref(),
        request_payload.clone(),
        None,
        None,
        Some(error_text),
    );
}

fn stringify_trace_request_payload(
    request_payload: &Value,
    trace_context: Option<&TraceContextPayload>,
    prompt_cache_metadata: Option<&PromptCacheTraceMetadata>,
) -> Option<String> {
    let has_trace_payload = trace_context
        .and_then(|context| context.generation_context.clone())
        .is_some()
        || prompt_cache_metadata.is_some();

    if !has_trace_payload {
        return stringify_value(request_payload);
    }

    let mut payload = match request_payload {
        Value::Object(map) => Value::Object(map.clone()),
        other => json!({ "payload": other }),
    };

    if let Some(payload_object) = payload.as_object_mut() {
        let generation_context =
            trace_context.and_then(|context| context.generation_context.clone());
        payload_object.insert(
            "_trace_context".to_string(),
            json!({
                "generationContext": generation_context,
                "promptCache": prompt_cache_metadata,
            }),
        );
    }

    stringify_value(&payload)
}

fn build_prompt_cache_trace_metadata(
    source: &str,
    model: &str,
    messages: &[Value],
    route: &NarrativeTaskRoute,
) -> Option<PromptCacheTraceMetadata> {
    let mut stable_prefix_messages = 0usize;
    let mut stable_prefix_chars = 0usize;
    let mut fingerprint_parts: Vec<String> = Vec::new();
    let mut stable_prefix_sections: Vec<String> = Vec::new();

    for message in messages {
        let role = message
            .get("role")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if role != "system" {
            break;
        }

        let content = extract_message_content_text(message);
        if content.trim().is_empty() {
            continue;
        }

        stable_prefix_messages += 1;
        stable_prefix_chars += content.chars().count();
        fingerprint_parts.push(format!("system::{content}"));
    }

    if stable_prefix_messages > 0 {
        stable_prefix_sections.push("system".to_string());
    }

    let schema_id = route
        .structured_output_schema_id
        .map(structured_schema_id_key);

    if let Some(schema_key) = schema_id.as_ref() {
        stable_prefix_sections.push("schema".to_string());
        fingerprint_parts.push(format!("schema::{schema_key}"));
    }

    if fingerprint_parts.is_empty() {
        return None;
    }

    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    model.hash(&mut hasher);
    fingerprint_parts.hash(&mut hasher);
    let fingerprint = format!("{:016x}", hasher.finish());

    let registry_key = format!("{source}::{model}::{fingerprint}");
    let status = {
        let registry = PROMPT_CACHE_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()));
        let mut entries = match registry.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };

        if entries.contains_key(&registry_key) {
            "hit"
        } else {
            entries.insert(registry_key, current_timestamp_millis());
            "miss"
        }
    };

    Some(PromptCacheTraceMetadata {
        fingerprint,
        schema_id,
        stable_prefix_chars,
        stable_prefix_messages,
        stable_prefix_sections,
        status: status.to_string(),
    })
}

fn structured_schema_id_key(schema_id: StructuredSchemaId) -> String {
    match schema_id {
        StructuredSchemaId::MemoryExtraction => "memory_extraction".to_string(),
        StructuredSchemaId::RelationshipDelta => "relationship_delta".to_string(),
        StructuredSchemaId::StorySuggestion => "story_suggestion".to_string(),
        StructuredSchemaId::WorldStateUpdate => "world_state_update".to_string(),
    }
}

fn extract_message_content_text(message: &Value) -> String {
    match message.get("content") {
        Some(Value::String(text)) => text.trim().to_string(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|part| {
                if let Some(text) = part.get("text").and_then(Value::as_str) {
                    return Some(text.trim().to_string());
                }
                if let Some(text) = part.get("content").and_then(Value::as_str) {
                    return Some(text.trim().to_string());
                }
                None
            })
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn value_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    Some(current)
}

fn setting_string(value: &Value, paths: &[&[&str]]) -> Option<String> {
    for path in paths {
        if let Some(result) = value_at_path(value, path).and_then(Value::as_str) {
            if !result.trim().is_empty() {
                return Some(result.to_string());
            }
        }
    }
    None
}

fn setting_bool(value: &Value, paths: &[&[&str]]) -> Option<bool> {
    for path in paths {
        if let Some(result) = value_at_path(value, path) {
            match result {
                Value::Bool(flag) => return Some(*flag),
                Value::String(text) => match text.trim().to_ascii_lowercase().as_str() {
                    "true" | "1" | "yes" | "on" => return Some(true),
                    "false" | "0" | "no" | "off" => return Some(false),
                    _ => {}
                },
                _ => {}
            }
        }
    }

    None
}

fn trim_trailing_slash(value: &str) -> String {
    value.trim_end_matches('/').to_string()
}

fn trim_trailing_slash_or_default(value: &str, default: &str) -> String {
    if value.trim().is_empty() {
        trim_trailing_slash(default)
    } else {
        trim_trailing_slash(value)
    }
}

fn is_retryable_gateway_status(status_code: u16) -> bool {
    matches!(
        status_code,
        408 | 409 | 429 | 500 | 502 | 503 | 504 | 520 | 521 | 522 | 523 | 524
    )
}

fn is_retryable_request_error(error: &reqwest::Error) -> bool {
    error.is_timeout() || error.is_connect() || error.is_request() || error.is_body()
}

fn normalize_openai_compatible_root(value: &str) -> String {
    let trimmed = trim_trailing_slash(value);
    if trimmed.is_empty() {
        return trimmed;
    }

    if trimmed.ends_with("/v1") {
        trimmed
    } else {
        format!("{trimmed}/v1")
    }
}

fn build_model_provider_models_endpoint(
    provider_type: &str,
    base_url: &str,
    capability: &str,
    api_version: Option<&str>,
    deployment_name: Option<&str>,
) -> Result<String, String> {
    let provider_type = provider_type.trim();
    if provider_type == "azure_openai" {
        if capability != "embedding" {
            return Err("Azure OpenAI 暂不支持自动枚举该能力模型，请手动填写模型。".to_string());
        }
        let deployment_name = deployment_name
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "当前 Azure OpenAI 缺少 deployment name。".to_string())?;
        let api_version = api_version
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("2024-10-21");
        let root = trim_trailing_slash(base_url);
        if root.is_empty() {
            return Err("当前 Azure OpenAI 缺少 Base URL。".to_string());
        }
        return Ok(format!(
            "{root}/openai/deployments/{deployment_name}/models?api-version={api_version}"
        ));
    }

    match provider_type {
        "openai" => Ok(format!(
            "{}/models",
            trim_trailing_slash_or_default(base_url, "https://api.openai.com/v1")
        )),
        "openrouter" => Ok(format!(
            "{}/models",
            trim_trailing_slash_or_default(base_url, "https://openrouter.ai/api/v1")
        )),
        "custom" => {
            let root = normalize_openai_compatible_root(base_url);
            if root.is_empty() {
                return Err("当前自定义服务商缺少 Base URL。".to_string());
            }
            Ok(format!("{root}/models"))
        }
        other => {
            let root = trim_trailing_slash(base_url);
            if root.is_empty() {
                return Err(format!("服务商 {other} 缺少 Base URL。"));
            }
            Ok(format!("{root}/models"))
        }
    }
}

fn extract_model_ids_from_payload(payload: &Value) -> Vec<String> {
    let mut models = payload
        .get("data")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    item.get("id")
                        .or_else(|| item.get("name"))
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(ToOwned::to_owned)
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if models.is_empty() {
        models = payload
            .get("models")
            .or_else(|| payload.get("model_names"))
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| {
                        item.as_str()
                            .map(str::trim)
                            .or_else(|| item.get("name").and_then(Value::as_str).map(str::trim))
                            .or_else(|| item.get("model").and_then(Value::as_str).map(str::trim))
                    })
                    .filter(|value| !value.is_empty())
                    .map(ToOwned::to_owned)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
    }

    models.sort();
    models.dedup();
    models
}

fn trim_v1(value: &str) -> String {
    let trimmed = trim_trailing_slash(value);
    trimmed.strip_suffix("/v1").unwrap_or(&trimmed).to_string()
}

fn normalize_localhost(value: String) -> String {
    value.replace("localhost", "127.0.0.1")
}

fn read_secret(secret_key: &str) -> Result<String, String> {
    storage::read_secret(secret_key)
}

fn resolve_api_key(
    reverse_proxy: &str,
    proxy_password: &str,
    secret_key: &str,
) -> Result<String, String> {
    if !reverse_proxy.trim().is_empty() {
        if proxy_password.trim().is_empty() {
            return Err("当前已设置 reverse proxy，但 proxy_password 为空。".to_string());
        }
        return Ok(proxy_password.to_string());
    }

    let key = read_secret(secret_key)?;
    if key.trim().is_empty() {
        return Err(format!("缺少可用密钥：{secret_key}"));
    }

    Ok(key)
}

fn resolve_optional_api_key(reverse_proxy: &str, proxy_password: &str, secret_key: &str) -> String {
    if !reverse_proxy.trim().is_empty() {
        return proxy_password.to_string();
    }

    read_secret(secret_key).unwrap_or_default()
}

fn textgen_api_key_for_type(api_type: &str) -> Result<Option<String>, String> {
    let secret_key = match api_type {
        "mancer" => Some("api_key_mancer"),
        "vllm" => Some("api_key_vllm"),
        "aphrodite" => Some("api_key_aphrodite"),
        "tabby" => Some("api_key_tabby"),
        "togetherai" => Some("api_key_togetherai"),
        "llamacpp" => Some("api_key_llamacpp"),
        "infermaticai" => Some("api_key_infermaticai"),
        "dreamgen" => Some("api_key_dreamgen"),
        "openrouter" => Some("api_key_openrouter"),
        "featherless" => Some("api_key_featherless"),
        "generic" => Some("api_key_generic"),
        _ => None,
    };

    match secret_key {
        Some(key) => Ok(Some(read_secret(key)?)),
        None => Ok(None),
    }
}

fn extract_textgen_model_ids(payload: &Value, api_type: &str) -> Vec<String> {
    match api_type {
        "togetherai" => payload
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|item| item.get("name").and_then(Value::as_str))
            .map(str::to_string)
            .collect(),
        "ollama" => payload
            .get("models")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|item| item.get("name").and_then(Value::as_str))
            .map(str::to_string)
            .collect(),
        "huggingface" => vec![],
        _ => payload
            .get("data")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|item| item.get("id").and_then(Value::as_str))
            .map(str::to_string)
            .collect(),
    }
}

fn extract_chat_completion_reply(payload: &Value) -> String {
    if let Some(content) = payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
    {
        return content.to_string();
    }

    if let Some(text) = payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("text"))
        .and_then(Value::as_str)
    {
        return text.to_string();
    }

    if let Some(content) = payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("delta"))
        .and_then(|delta| delta.get("content"))
        .and_then(Value::as_str)
    {
        return content.to_string();
    }

    if let Some(content) = payload
        .get("message")
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
    {
        return content.to_string();
    }

    if let Some(text) = payload.get("response").and_then(Value::as_str) {
        return text.to_string();
    }

    String::new()
}

fn extract_text_completion_reply(payload: &Value) -> String {
    if let Some(text) = payload
        .get("generations")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|item| item.get("text"))
        .and_then(Value::as_str)
    {
        return text.trim().to_string();
    }

    if let Some(text) = payload.get("text").and_then(Value::as_str) {
        return text.trim().to_string();
    }

    if let Some(text) = payload.get("output").and_then(Value::as_str) {
        return text.trim().to_string();
    }

    if let Some(text) = payload.get("content").and_then(Value::as_str) {
        return text.trim().to_string();
    }

    if let Some(text) = payload.get("response").and_then(Value::as_str) {
        return text.trim().to_string();
    }

    if let Some(text) = payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("text"))
        .and_then(Value::as_str)
    {
        return text.trim().to_string();
    }

    if let Some(text) = payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
    {
        return text.trim().to_string();
    }

    if let Some(text) = payload
        .get("results")
        .and_then(Value::as_array)
        .and_then(|results| results.first())
        .and_then(|result| result.get("text"))
        .and_then(Value::as_str)
    {
        return text.trim().to_string();
    }

    String::new()
}

fn header_value(value: &str) -> Result<HeaderValue, String> {
    HeaderValue::from_str(value).map_err(to_string_error)
}

fn bearer_header(value: &str) -> Result<HeaderValue, String> {
    header_value(&format!("Bearer {value}"))
}

fn to_string_error(error: impl ToString) -> String {
    error.to_string()
}

fn normalize_structured_output_payload(
    schema_id: StructuredSchemaId,
    payload: Value,
) -> Result<Value, String> {
    match schema_id {
        StructuredSchemaId::StorySuggestion => normalize_story_suggestion_payload(payload),
        StructuredSchemaId::RelationshipDelta => normalize_relationship_delta_payload(payload),
        StructuredSchemaId::WorldStateUpdate => normalize_world_state_update_payload(payload),
        StructuredSchemaId::MemoryExtraction => Ok(payload),
    }
}

fn parse_structured_json_response(raw_response: &str) -> Result<Value, String> {
    let trimmed = raw_response.trim();
    if trimmed.is_empty() {
        return Err("结构化输出为空。".to_string());
    }

    if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
        return Ok(parsed);
    }

    if let Some(parsed) = parse_first_json_value(trimmed) {
        return Ok(parsed);
    }

    Err("结构化输出无法解析为 JSON。模型返回了非 JSON 内容。".to_string())
}

fn parse_first_json_value(text: &str) -> Option<Value> {
    for start in text
        .char_indices()
        .filter_map(|(index, character)| matches!(character, '{' | '[').then_some(index))
    {
        let candidate = text.get(start..)?;
        let mut stream = serde_json::Deserializer::from_str(candidate).into_iter::<Value>();
        if let Some(Ok(value)) = stream.next() {
            return Some(value);
        }
    }

    None
}

fn normalize_story_suggestion_payload(payload: Value) -> Result<Value, String> {
    let Some(root) = payload.as_object() else {
        return Err("结构化故事建议输出不是对象。".to_string());
    };

    let next_scene =
        find_story_next_scene(&payload).unwrap_or_else(|| "继续当前场景推进".to_string());

    let tension =
        find_story_tension(&payload).unwrap_or_else(|| "场景保持高张力并持续推进".to_string());

    let mut goals = find_story_string_list(&payload, &["goals"]);
    if goals.is_empty() {
        goals = find_story_string_list(&payload, &["key_elements"]);
    }
    if goals.is_empty() {
        goals = find_story_string_list(&payload, &["purpose"]);
    }
    if goals.is_empty() {
        goals.push("继续推进当前剧情目标".to_string());
    }

    let mut risks = find_story_string_list(&payload, &["risks"]);
    if risks.is_empty() {
        risks = find_story_string_list(&payload, &["unresolved_hooks"]);
    }
    if risks.is_empty() {
        risks = find_story_string_list(&payload, &["danger"]);
    }
    if risks.is_empty() {
        risks.push("局势存在未知风险".to_string());
    }

    let mut unresolved_conflicts = find_story_string_list(
        &payload,
        &[
            "unresolved_conflicts",
            "unresolved_hooks",
            "unresolved_conflicts_to_carry",
        ],
    );
    if unresolved_conflicts.is_empty() {
        unresolved_conflicts.push("当前场景仍有未解决冲突".to_string());
    }

    let mut normalized = Map::new();
    normalized.insert("next_scene".to_string(), Value::String(next_scene));
    normalized.insert("tension".to_string(), Value::String(tension));
    normalized.insert(
        "goals".to_string(),
        Value::Array(goals.into_iter().map(Value::String).collect()),
    );
    normalized.insert(
        "risks".to_string(),
        Value::Array(risks.into_iter().map(Value::String).collect()),
    );
    normalized.insert(
        "unresolved_conflicts".to_string(),
        Value::Array(
            unresolved_conflicts
                .into_iter()
                .map(Value::String)
                .collect(),
        ),
    );

    if let Some(title) = root
        .get("proposed_next_scene")
        .or_else(|| root.get("proposal"))
        .and_then(|value| value.get("scene_title").or_else(|| value.get("title")))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        normalized.insert("title".to_string(), Value::String(title.to_string()));
    }

    Ok(Value::Object(normalized))
}

fn normalize_relationship_delta_payload(payload: Value) -> Result<Value, String> {
    let Some(root) = payload.as_object() else {
        return Err("结构化关系变化输出不是对象。".to_string());
    };

    let mut changes = collect_relationship_changes(
        value_at_path(&payload, &["changes"])
            .or_else(|| value_at_path(&payload, &["relationship_changes"])),
    );

    if changes.is_empty() {
        return Err("结构化关系变化输出缺少可用 changes。".to_string());
    }

    let mut normalized = Map::new();
    normalized.insert(
        "changes".to_string(),
        Value::Array(changes.drain(..).map(Value::Object).collect()),
    );

    if let Some(summary) = root
        .get("summary")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        normalized.insert("summary".to_string(), Value::String(summary.to_string()));
    }

    Ok(Value::Object(normalized))
}

fn normalize_world_state_update_payload(payload: Value) -> Result<Value, String> {
    let Some(root) = payload.as_object() else {
        return Err("结构化世界状态输出不是对象。".to_string());
    };

    let mut updates = collect_world_state_updates_from_payload(&payload);

    if updates.is_empty() {
        return Err("结构化世界状态输出缺少可用 state_updates。".to_string());
    }

    let mut normalized = Map::new();
    normalized.insert(
        "state_updates".to_string(),
        Value::Array(updates.drain(..).map(Value::Object).collect()),
    );

    if let Some(summary) = root
        .get("summary")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        normalized.insert("summary".to_string(), Value::String(summary.to_string()));
    }

    Ok(Value::Object(normalized))
}

fn collect_world_state_updates_from_payload(payload: &Value) -> Vec<Map<String, Value>> {
    for path in [
        &["state_updates"][..],
        &["updates"][..],
        &["world_state_updates"][..],
        &["world_updates"][..],
        &["state_changes"][..],
        &["changes"][..],
        &["facts"][..],
        &["observations"][..],
        &["world_state"][..],
        &["world_state", "state_updates"][..],
        &["world_state", "updates"][..],
        &["world_state", "changes"][..],
        &["payload", "state_updates"][..],
        &["payload", "updates"][..],
    ] {
        let updates = collect_world_state_updates(value_at_path(payload, path));
        if !updates.is_empty() {
            return updates;
        }
    }

    collect_world_state_updates(Some(payload))
}

fn find_story_next_scene(payload: &Value) -> Option<String> {
    if let Some(text) = string_at_path(payload, &["next_scene"]) {
        return Some(text);
    }

    for key in [
        "proposed_next_scene",
        "proposal",
        "proposed_scene",
        "next_scene_proposal",
    ] {
        if let Some(value) = value_at_path(payload, &[key]) {
            if let Some(text) = object_text_from_fields(
                value,
                &[
                    "scene_title",
                    "title",
                    "action",
                    "description",
                    "summary",
                    "setting",
                    "purpose",
                    "key_dialogue",
                    "cliffhanger",
                ],
            ) {
                return Some(text);
            }
        }
    }

    object_text_from_fields(
        payload,
        &[
            "next_scene",
            "scene_title",
            "title",
            "action",
            "description",
            "summary",
            "purpose",
            "key_dialogue",
        ],
    )
}

fn find_story_tension(payload: &Value) -> Option<String> {
    for key in ["tension", "analysis", "scene_analysis"] {
        if let Some(value) = value_at_path(payload, &[key]) {
            if let Some(text) = object_text_from_fields(
                value,
                &[
                    "tension",
                    "momentum",
                    "current_momentum",
                    "conflict_escalation",
                ],
            ) {
                return Some(text);
            }
        }
    }

    object_text_from_fields(
        payload,
        &[
            "tension",
            "momentum",
            "current_momentum",
            "conflict_escalation",
        ],
    )
}

fn find_story_string_list(payload: &Value, keys: &[&str]) -> Vec<String> {
    for key in keys {
        if let Some(value) = value_at_path(payload, &[key]) {
            let items = collect_string_list_from_value(Some(value));
            if !items.is_empty() {
                return items;
            }
        }
    }

    for parent_key in [
        "analysis",
        "scene_analysis",
        "proposed_next_scene",
        "proposal",
        "proposed_scene",
        "next_scene_proposal",
    ] {
        if let Some(value) = value_at_path(payload, &[parent_key]) {
            for key in keys {
                if let Some(child) = value.get(*key) {
                    let items = collect_string_list_from_value(Some(child));
                    if !items.is_empty() {
                        return items;
                    }
                }
            }
        }
    }

    vec![]
}

fn collect_relationship_changes(value: Option<&Value>) -> Vec<Map<String, Value>> {
    let Some(Value::Array(items)) = value else {
        return vec![];
    };

    items
        .iter()
        .filter_map(|item| {
            let Value::Object(map) = item else {
                return None;
            };

            let left_actor = first_non_empty_text(&[
                map.get("left_actor")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("actor_a")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("from").and_then(Value::as_str).map(str::to_string),
                map.get("from_character")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("subject")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("between")
                    .and_then(Value::as_array)
                    .and_then(|actors| actors.first())
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("actors")
                    .and_then(Value::as_array)
                    .and_then(|actors| actors.first())
                    .and_then(Value::as_str)
                    .map(str::to_string),
            ])
            .unwrap_or_default();

            let right_actor = first_non_empty_text(&[
                map.get("right_actor")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("actor_b")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("to").and_then(Value::as_str).map(str::to_string),
                map.get("to_character")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("target")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("between")
                    .and_then(Value::as_array)
                    .and_then(|actors| actors.get(1))
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("actors")
                    .and_then(Value::as_array)
                    .and_then(|actors| actors.get(1))
                    .and_then(Value::as_str)
                    .map(str::to_string),
            ])
            .unwrap_or_default();

            let reason = first_non_empty_text(&[
                map.get("reason")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("justification")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("change")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("evidence")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("description")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            ])
            .unwrap_or_else(|| "关系变化已被确认".to_string());

            let next_implication = first_non_empty_text(&[
                map.get("next_implication")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("implication")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                map.get("next_step")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            ])
            .unwrap_or_else(|| {
                if left_actor.is_empty() && right_actor.is_empty() {
                    "继续观察关系变化".to_string()
                } else {
                    format!("继续观察{}与{}的关系变化", left_actor, right_actor)
                        .trim()
                        .trim_matches('与')
                        .to_string()
                }
            });

            let delta = map
                .get("delta")
                .and_then(Value::as_f64)
                .or_else(|| {
                    map.get("intensity")
                        .and_then(Value::as_str)
                        .map(infer_relationship_delta_from_intensity)
                })
                .or_else(|| {
                    map.get("change_type")
                        .and_then(Value::as_str)
                        .map(infer_relationship_delta_from_change_type)
                })
                .unwrap_or_else(|| infer_relationship_delta(&reason));

            if left_actor.is_empty() || right_actor.is_empty() {
                return None;
            }

            let mut normalized = Map::new();
            normalized.insert("left_actor".to_string(), Value::String(left_actor));
            normalized.insert("right_actor".to_string(), Value::String(right_actor));
            normalized.insert("delta".to_string(), Value::from(delta));
            normalized.insert("reason".to_string(), Value::String(reason));
            normalized.insert(
                "next_implication".to_string(),
                Value::String(next_implication),
            );
            Some(normalized)
        })
        .collect()
}

fn collect_world_state_updates(value: Option<&Value>) -> Vec<Map<String, Value>> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(normalize_world_state_update_item)
            .collect(),
        Some(Value::Object(map)) => {
            if let Some(update) = normalize_world_state_update_map(map) {
                return vec![update];
            }

            map.iter()
                .filter_map(|(key, value)| normalize_world_state_map_entry(key, value))
                .collect()
        }
        _ => vec![],
    }
}

fn normalize_world_state_update_item(item: &Value) -> Option<Map<String, Value>> {
    match item {
        Value::Object(map) => normalize_world_state_update_map(map),
        _ => None,
    }
}

fn normalize_world_state_map_entry(key: &str, value: &Value) -> Option<Map<String, Value>> {
    match value {
        Value::Object(map) => {
            let update = normalize_world_state_update_map(map);
            update.or_else(|| normalize_world_state_keyed_object(key, map))
        }
        Value::String(text) => {
            let text = text.trim();
            if key.trim().is_empty() || text.is_empty() {
                return None;
            }
            Some(build_world_state_update_map(
                key.trim().to_string(),
                "status".to_string(),
                Value::String(text.to_string()),
                "状态更新已记录".to_string(),
                "session".to_string(),
            ))
        }
        _ => None,
    }
}

fn normalize_world_state_keyed_object(
    key: &str,
    map: &Map<String, Value>,
) -> Option<Map<String, Value>> {
    let entity = key.trim();
    if entity.is_empty() {
        return None;
    }

    let field = first_non_empty_text(&[
        map.get("field").and_then(Value::as_str).map(str::to_string),
        map.get("attribute")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("property")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("key").and_then(Value::as_str).map(str::to_string),
        map.get("type").and_then(Value::as_str).map(str::to_string),
        map.get("category")
            .and_then(Value::as_str)
            .map(str::to_string),
    ])
    .unwrap_or_else(|| "status".to_string());

    let next_value = map
        .get("next_value")
        .or_else(|| map.get("value"))
        .or_else(|| map.get("new_value"))
        .or_else(|| map.get("state"))
        .or_else(|| map.get("status"))
        .or_else(|| map.get("condition"))
        .or_else(|| map.get("summary"))
        .or_else(|| map.get("description"))
        .cloned()
        .unwrap_or_else(|| Value::Object(map.clone()));

    let reason = first_non_empty_text(&[
        map.get("reason")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("evidence")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("justification")
            .and_then(Value::as_str)
            .map(str::to_string),
    ])
    .unwrap_or_else(|| "状态更新已记录".to_string());

    let scope = first_non_empty_text(&[
        map.get("scope").and_then(Value::as_str).map(str::to_string),
        map.get("category")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("type").and_then(Value::as_str).map(str::to_string),
    ])
    .unwrap_or_else(|| infer_world_state_scope(&field, entity));

    Some(build_world_state_update_map(
        entity.to_string(),
        field,
        next_value,
        reason,
        scope,
    ))
}

fn normalize_world_state_update_map(map: &Map<String, Value>) -> Option<Map<String, Value>> {
    let entity = first_non_empty_text(&[
        map.get("entity")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("name").and_then(Value::as_str).map(str::to_string),
        map.get("target")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("subject")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("actor").and_then(Value::as_str).map(str::to_string),
        map.get("location")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("faction")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("item").and_then(Value::as_str).map(str::to_string),
        map.get("quest").and_then(Value::as_str).map(str::to_string),
    ])?;

    let field = first_non_empty_text(&[
        map.get("field").and_then(Value::as_str).map(str::to_string),
        map.get("attribute")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("property")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("key").and_then(Value::as_str).map(str::to_string),
        map.get("type").and_then(Value::as_str).map(str::to_string),
        map.get("category")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("status")
            .and_then(Value::as_str)
            .map(|_| "status".to_string()),
        map.get("state")
            .and_then(Value::as_str)
            .map(|_| "state".to_string()),
        map.get("condition")
            .and_then(Value::as_str)
            .map(|_| "condition".to_string()),
        map.get("summary")
            .and_then(Value::as_str)
            .map(|_| "summary".to_string()),
        map.get("description")
            .and_then(Value::as_str)
            .map(|_| "description".to_string()),
    ])
    .unwrap_or_else(|| "status".to_string());

    let next_value = map
        .get("next_value")
        .or_else(|| map.get("value"))
        .or_else(|| map.get("new_value"))
        .or_else(|| map.get("state"))
        .or_else(|| map.get("status"))
        .or_else(|| map.get("condition"))
        .or_else(|| map.get("summary"))
        .or_else(|| map.get("description"))
        .or_else(|| map.get("change"))
        .cloned()
        .unwrap_or_else(|| Value::String("已更新".to_string()));

    let reason = first_non_empty_text(&[
        map.get("reason")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("evidence")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("justification")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("rationale")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("source")
            .and_then(Value::as_str)
            .map(str::to_string),
    ])
    .unwrap_or_else(|| "状态更新已记录".to_string());

    let scope = first_non_empty_text(&[
        map.get("scope").and_then(Value::as_str).map(str::to_string),
        map.get("category")
            .and_then(Value::as_str)
            .map(str::to_string),
        map.get("type").and_then(Value::as_str).map(str::to_string),
    ])
    .unwrap_or_else(|| infer_world_state_scope(&field, &entity));

    Some(build_world_state_update_map(
        entity, field, next_value, reason, scope,
    ))
}

fn build_world_state_update_map(
    entity: String,
    field: String,
    next_value: Value,
    reason: String,
    scope: String,
) -> Map<String, Value> {
    let mut normalized = Map::new();
    normalized.insert("entity".to_string(), Value::String(entity));
    normalized.insert("field".to_string(), Value::String(field));
    normalized.insert("next_value".to_string(), next_value);
    normalized.insert("reason".to_string(), Value::String(reason));
    normalized.insert("scope".to_string(), Value::String(scope));
    normalized
}

fn infer_world_state_scope(field: &str, entity: &str) -> String {
    let normalized = format!("{} {}", field, entity).to_lowercase();
    if normalized.contains("relationship")
        || normalized.contains("trust")
        || normalized.contains("relation")
        || normalized.contains("关系")
    {
        return "relationship".to_string();
    }
    if normalized.contains("location")
        || normalized.contains("place")
        || normalized.contains("区域")
        || normalized.contains("地点")
        || normalized.contains("位置")
    {
        return "location".to_string();
    }
    if normalized.contains("faction")
        || normalized.contains("organization")
        || normalized.contains("势力")
        || normalized.contains("组织")
    {
        return "faction".to_string();
    }
    if normalized.contains("quest")
        || normalized.contains("goal")
        || normalized.contains("任务")
        || normalized.contains("目标")
    {
        return "quest".to_string();
    }
    if normalized.contains("item")
        || normalized.contains("inventory")
        || normalized.contains("物品")
        || normalized.contains("道具")
    {
        return "inventory_item".to_string();
    }
    "scene_state".to_string()
}

fn string_at_path(value: &Value, path: &[&str]) -> Option<String> {
    value_at_path(value, path)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn collect_string_list_from_value(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect(),
        Some(Value::Object(map)) => map
            .iter()
            .filter_map(|(key, item)| {
                let text = item.as_str()?.trim();
                if text.is_empty() {
                    None
                } else {
                    Some(format!("{key}: {text}"))
                }
            })
            .collect(),
        Some(Value::String(text)) => {
            let text = text.trim();
            if text.is_empty() {
                vec![]
            } else {
                vec![text.to_string()]
            }
        }
        _ => vec![],
    }
}

fn object_text_from_fields(value: &Value, fields: &[&str]) -> Option<String> {
    let Value::Object(map) = value else {
        return None;
    };

    let mut pieces = Vec::new();
    for field in fields {
        if let Some(text) = map
            .get(*field)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
        {
            pieces.push(text.to_string());
        }
    }

    if pieces.is_empty() {
        None
    } else {
        Some(pieces.join(" "))
    }
}

fn first_non_empty_text(values: &[Option<String>]) -> Option<String> {
    values
        .iter()
        .flatten()
        .map(|value| value.trim())
        .find(|value| !value.is_empty())
        .map(str::to_string)
}

fn infer_relationship_delta(text: &str) -> f64 {
    let normalized = text.to_lowercase();
    let positive_terms = [
        "信任",
        "合作",
        "同盟",
        "亲近",
        "认可",
        "依赖",
        "同行",
        "建立",
        "缓和",
        "升温",
        "友好",
        "支持",
        "理解",
        "trust",
        "cooperation",
        "ally",
        "friendly",
        "close",
        "bond",
        "together",
        "alliance",
    ];
    let negative_terms = [
        "冲突",
        "敌意",
        "怀疑",
        "疏远",
        "紧张",
        "拒绝",
        "背叛",
        "矛盾",
        "失控",
        "攻击",
        "警惕",
        "hostile",
        "conflict",
        "distant",
        "suspicious",
        "distance",
        "fear",
        "fight",
    ];

    let positive_hits = positive_terms
        .iter()
        .filter(|term| normalized.contains(*term))
        .count();
    let negative_hits = negative_terms
        .iter()
        .filter(|term| normalized.contains(*term))
        .count();

    match positive_hits.cmp(&negative_hits) {
        std::cmp::Ordering::Greater => 0.35,
        std::cmp::Ordering::Less => -0.35,
        std::cmp::Ordering::Equal => 0.10,
    }
}

fn infer_relationship_delta_from_intensity(text: &str) -> f64 {
    match text.trim().to_ascii_lowercase().as_str() {
        "high" | "strong" | "significant" | "positive" => 0.35,
        "low" | "minor" | "slight" | "neutral" => 0.10,
        "negative" | "hostile" | "strong_negative" => -0.35,
        _ => 0.10,
    }
}

fn infer_relationship_delta_from_change_type(text: &str) -> f64 {
    match text.trim().to_ascii_lowercase().as_str() {
        "trust_established" | "development" | "trust" | "cooperation" | "ally" => 0.35,
        "suspicion_to_cautious_cooperation" | "neutral" | "unknown" => 0.10,
        "conflict" | "hostile" | "estrangement" | "breakdown" => -0.35,
        _ => 0.10,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn stringify_trace_request_payload_embeds_generation_context_and_prompt_cache() {
        let request_payload = json!({
            "model": "model-a",
            "temperature": 0.72
        });
        let trace_context = TraceContextPayload {
            avatar_url: Some("arcueid.png".to_string()),
            character_name: Some("爱尔奎特·布伦史塔德".to_string()),
            file_name: Some("moonlit-chat.jsonl".to_string()),
            generation_context: Some(TraceGenerationContextPayload {
                character_snippets: vec![CharacterSnippet {
                    character_name: "爱尔奎特·布伦史塔德".to_string(),
                    content: "她对月夜的异样气息非常敏锐。".to_string(),
                    score: 0.81,
                }],
                context_budget: Some(TraceContextBudgetPayload {
                    dropped: vec![TraceContextBudgetEntryPayload {
                        estimated_tokens: 96,
                        layer: "recent".to_string(),
                        preview: "A longer prior exchange".to_string(),
                        reason: Some("budget_exceeded".to_string()),
                        source: "recent:soft".to_string(),
                    }],
                    kept: vec![TraceContextBudgetEntryPayload {
                        estimated_tokens: 48,
                        layer: "summary".to_string(),
                        preview: "Session summary".to_string(),
                        reason: None,
                        source: "summary:session".to_string(),
                    }],
                    recent_messages_kept: Some(8),
                    reserved_output: 512,
                    summary_kinds_used: Some(vec!["session".to_string(), "scene".to_string()]),
                    usable_input_budget: 3584,
                    used_tokens: 1904,
                }),
                directive_snippets: vec![DirectiveSnippet {
                    content: "保持月姬式的冷冽与亲密张力。".to_string(),
                    label: "style".to_string(),
                    source_name: "global".to_string(),
                }],
                lorebook_snippets: vec![LorebookSnippet {
                    book_name: "月姬世界观".to_string(),
                    content: "死徒与真祖的对立贯穿整座城市。".to_string(),
                    keys: vec!["真祖".to_string()],
                    score: 0.9,
                }],
                narrative_memories: vec![NarrativeMemoryEntry {
                    id: "m1".to_string(),
                    character_name: "爱尔奎特·布伦史塔德".to_string(),
                    content: "志贵已经承诺今晚会与爱尔奎特同行。".to_string(),
                    created_at: 1,
                    file_name: Some("moonlit-chat.jsonl".to_string()),
                    importance: 0.95,
                    kind: "relationship".to_string(),
                    summary: "同行约定".to_string(),
                    tags: vec!["志贵".to_string()],
                    updated_at: 1,
                }],
                query: "下一句该怎么接".to_string(),
                retrieval_hits: vec![RetrievalHitSummary {
                    domain: "world".to_string(),
                    hit_id: "月姬世界观".to_string(),
                    score: 0.9,
                }],
                session_snippets: vec![SessionSnippet {
                    content: "别松手。".to_string(),
                    ordinal: 7,
                    role: "assistant".to_string(),
                    score: 0.77,
                }],
                world_state_snippets: vec![WorldStateSnippet {
                    category: "scene".to_string(),
                    detail: "千年城大厅的空气再次染上血雾。".to_string(),
                    entity: "千年城大厅".to_string(),
                    status: "dangerous".to_string(),
                }],
            }),
        };
        let prompt_cache = PromptCacheTraceMetadata {
            fingerprint: "abc123".to_string(),
            schema_id: Some("story_suggestion".to_string()),
            stable_prefix_chars: 128,
            stable_prefix_messages: 1,
            stable_prefix_sections: vec!["system".to_string(), "schema".to_string()],
            status: "miss".to_string(),
        };

        let payload = stringify_trace_request_payload(
            &request_payload,
            Some(&trace_context),
            Some(&prompt_cache),
        )
        .expect("trace payload should serialize");
        let parsed: Value =
            serde_json::from_str(&payload).expect("trace payload should be valid json");

        assert_eq!(parsed.get("model").and_then(Value::as_str), Some("model-a"));
        let trace_payload = parsed
            .get("_trace_context")
            .expect("trace metadata should be embedded");
        assert_eq!(
            trace_payload
                .get("generationContext")
                .and_then(|value| value.get("query"))
                .and_then(Value::as_str),
            Some("下一句该怎么接")
        );
        assert_eq!(
            trace_payload
                .get("generationContext")
                .and_then(|value| value.get("worldStateSnippets"))
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(1)
        );
        assert_eq!(
            trace_payload
                .get("generationContext")
                .and_then(|value| value.get("contextBudget"))
                .and_then(|value| value.get("recentMessagesKept"))
                .and_then(Value::as_u64),
            Some(8)
        );
        assert_eq!(
            trace_payload
                .get("generationContext")
                .and_then(|value| value.get("contextBudget"))
                .and_then(|value| value.get("summaryKindsUsed"))
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(2)
        );
        assert_eq!(
            trace_payload
                .get("promptCache")
                .and_then(|value| value.get("fingerprint"))
                .and_then(Value::as_str),
            Some("abc123")
        );
    }

    #[test]
    fn build_retrieval_hit_summaries_keeps_best_hits_first_and_explains_domains() {
        let character_hits = vec![
            CharacterSnippet {
                character_name: "爱尔奎特".to_string(),
                content: "角色设定".to_string(),
                score: 0.42,
            },
            CharacterSnippet {
                character_name: "志贵".to_string(),
                content: "角色设定".to_string(),
                score: 0.97,
            },
        ];
        let session_hits = (0..4)
            .map(|index| SessionSnippet {
                content: format!("session-{index}"),
                ordinal: index,
                role: "assistant".to_string(),
                score: 0.7 - index as f64 * 0.05,
            })
            .collect::<Vec<_>>();
        let world_hits = (0..4)
            .map(|index| LorebookSnippet {
                book_name: format!("world-{index}"),
                content: format!("world-content-{index}"),
                keys: vec![format!("tag-{index}")],
                score: 0.8 - index as f64 * 0.03,
            })
            .collect::<Vec<_>>();
        let memory_hits = (0..5)
            .map(|index| NarrativeMemoryEntry {
                id: format!("memory-{index}"),
                character_name: "爱尔奎特".to_string(),
                content: format!("memory-content-{index}"),
                created_at: index as u64,
                file_name: Some("session.jsonl".to_string()),
                importance: 0.99 - index as f64 * 0.02,
                kind: "event".to_string(),
                summary: format!("memory-summary-{index}"),
                tags: vec!["moon".to_string()],
                updated_at: index as u64,
            })
            .collect::<Vec<_>>();

        let hits = build_retrieval_hit_summaries(
            &character_hits,
            &session_hits,
            &world_hits,
            &memory_hits,
        );

        assert_eq!(
            hits.len(),
            12,
            "hit list should be truncated to the UI trace budget"
        );
        assert_eq!(hits[0].domain, "memory");
        assert_eq!(hits[0].hit_id, "memory-0");
        assert!(hits
            .iter()
            .any(|item| item.domain == "character" && item.hit_id == "志贵"));
        assert!(hits
            .iter()
            .any(|item| item.domain == "world" && item.hit_id == "world-0"));
        assert!(hits
            .iter()
            .any(|item| item.domain == "session" && item.hit_id == "message:0"));
    }

    #[test]
    fn build_world_state_snippets_carries_multiple_categories_into_generation_context() {
        let snippets = build_world_state_snippets(WorldStateSnapshotEntry {
            avatar_url: Some("arcueid.png".to_string()),
            factions: vec![WorldStateItemEntry {
                detail: "圣堂教会正在扩大夜间搜索范围".to_string(),
                id: "f1".to_string(),
                name: "圣堂教会".to_string(),
                status: "alert".to_string(),
                tags: vec!["church".to_string()],
                updated_at: 1,
            }],
            file_name: Some("moonlit-chat.jsonl".to_string()),
            inventory_items: vec![],
            locations: vec![WorldStateItemEntry {
                detail: "封锁线已经延伸到车站外侧".to_string(),
                id: "l1".to_string(),
                name: "车站外侧".to_string(),
                status: "blocked".to_string(),
                tags: vec!["station".to_string()],
                updated_at: 1,
            }],
            lorebook_name: Some("月姬世界观".to_string()),
            quests: vec![],
            relationships: vec![WorldStateItemEntry {
                detail: "志贵与爱尔奎特暂时建立了互信".to_string(),
                id: "r1".to_string(),
                name: "志贵 / 爱尔奎特".to_string(),
                status: "trusted".to_string(),
                tags: vec!["trust".to_string()],
                updated_at: 1,
            }],
            scene_states: vec![WorldStateItemEntry {
                detail: "血雾正在重新聚集".to_string(),
                id: "s1".to_string(),
                name: "千年城大厅".to_string(),
                status: "dangerous".to_string(),
                tags: vec!["mist".to_string()],
                updated_at: 1,
            }],
            session_id: "session-1".to_string(),
            summary: "applied 3 state updates".to_string(),
            updated_at: 1,
        });

        assert!(snippets
            .iter()
            .any(|item| item.category == "location" && item.entity == "车站外侧"));
        assert!(snippets
            .iter()
            .any(|item| item.category == "relationship" && item.status == "trusted"));
        assert!(snippets
            .iter()
            .any(|item| item.category == "scene" && item.detail.contains("血雾")));
    }

    #[test]
    fn normalizes_live_story_director_shapes_into_frontend_contract() {
        let payload = json!({
            "scene_analysis": {
                "momentum": "场景正从对话铺垫转向行动冲突。",
                "conflict_escalation": "从城市探索升级到直面死徒猎食现场。",
                "goals": {
                    "immediate": "确定血腥味源头",
                    "player": "保全自身并理解真相"
                },
                "risks": "遭遇罗亚或其眷属导致物理伤害",
                "unresolved_hooks": ["罗亚的具体位置", "午时体质的本质"]
            },
            "next_scene_proposal": {
                "title": "巷弄深处的血色",
                "setting": "老旧住宅区边缘的狭窄巷道",
                "beats": ["爱尔奎特示意午时停步"],
                "unresolved_conflicts_to_carry": ["罗亚为何执着于爱尔奎特"]
            }
        });

        let normalized =
            normalize_structured_output_payload(StructuredSchemaId::StorySuggestion, payload)
                .expect("story shape should normalize");

        assert!(normalized
            .get("next_scene")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .contains("巷弄深处的血色"));
        assert!(normalized
            .get("tension")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .contains("行动冲突"));
        assert_eq!(
            normalized
                .get("goals")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(2)
        );
        assert_eq!(
            normalized
                .get("risks")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(1)
        );
        assert_eq!(
            normalized
                .get("unresolved_conflicts")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(2)
        );
    }

    #[test]
    fn normalizes_live_relationship_director_shapes_into_changes() {
        let payload = json!({
            "relationship_changes": [
                {
                    "from_character": "午时",
                    "to_character": "爱尔奎特·布伦史塔德",
                    "change_type": "suspicion_to_cautious_cooperation",
                    "evidence": "午时从初始警惕转为接受合作。",
                    "intensity": "low"
                },
                {
                    "between": ["爱尔奎特·布伦史塔德", "午时"],
                    "change": "建立初步信任与好奇",
                    "justification": "爱尔奎特主动分享罗亚的背景。"
                }
            ]
        });

        let normalized =
            normalize_structured_output_payload(StructuredSchemaId::RelationshipDelta, payload)
                .expect("relationship shape should normalize");
        let changes = normalized
            .get("changes")
            .and_then(Value::as_array)
            .expect("changes should exist");

        assert_eq!(changes.len(), 2);
        assert_eq!(
            changes[0].get("left_actor").and_then(Value::as_str),
            Some("午时")
        );
        assert_eq!(
            changes[0].get("right_actor").and_then(Value::as_str),
            Some("爱尔奎特·布伦史塔德")
        );
        assert_eq!(changes[0].get("delta").and_then(Value::as_f64), Some(0.10));
        assert_eq!(
            changes[1].get("left_actor").and_then(Value::as_str),
            Some("爱尔奎特·布伦史塔德")
        );
        assert_eq!(
            changes[1].get("right_actor").and_then(Value::as_str),
            Some("午时")
        );
    }

    #[test]
    fn normalizes_live_world_state_update_aliases() {
        let payload = json!({
            "updates": [
                {
                    "entity": "罗亚",
                    "field": "location_hint",
                    "next_value": "tokyo_residential_area",
                    "reason": "当前追踪至老旧住宅区。",
                    "scope": "plot_progression"
                }
            ]
        });

        let normalized =
            normalize_structured_output_payload(StructuredSchemaId::WorldStateUpdate, payload)
                .expect("world state shape should normalize");

        let updates = normalized
            .get("state_updates")
            .and_then(Value::as_array)
            .expect("state updates should exist");

        assert_eq!(updates.len(), 1);
        assert_eq!(
            updates[0].get("entity").and_then(Value::as_str),
            Some("罗亚")
        );
        assert_eq!(
            updates[0].get("field").and_then(Value::as_str),
            Some("location_hint")
        );
    }

    #[test]
    fn parses_structured_json_with_trailing_model_text() {
        let parsed = parse_structured_json_response(
            "下一幕建议:\n{\"next_scene\":\"进入巷道\",\"tension\":\"升高\",\"goals\":[\"追踪\"],\"risks\":[\"伏击\"],\"unresolved_conflicts\":[\"罗亚行踪\"]}\n额外说明",
        )
        .expect("first json object should parse despite trailing text");

        assert_eq!(
            parsed.get("next_scene").and_then(Value::as_str),
            Some("进入巷道")
        );
    }

    #[test]
    fn normalizes_world_state_keyed_object_payload() {
        let payload = json!({
            "world_state": {
                "爱尔奎特·布伦史塔德": {
                    "status": "正在追踪罗亚",
                    "reason": "对话中确认她已锁定罗亚气息。",
                    "scope": "scene_state"
                }
            }
        });

        let normalized =
            normalize_structured_output_payload(StructuredSchemaId::WorldStateUpdate, payload)
                .expect("keyed world state shape should normalize");
        let updates = normalized
            .get("state_updates")
            .and_then(Value::as_array)
            .expect("state updates should exist");

        assert_eq!(updates.len(), 1);
        assert_eq!(
            updates[0].get("entity").and_then(Value::as_str),
            Some("爱尔奎特·布伦史塔德")
        );
        assert_eq!(
            updates[0].get("field").and_then(Value::as_str),
            Some("status")
        );
    }

    #[test]
    #[ignore = "Live smoke test against the locally saved custom OpenAI-compatible model"]
    fn narrative_director_live_smoke_test_against_saved_custom_model() {
        tauri::async_runtime::block_on(async {
            let mut failures = Vec::new();
            storage::ensure_storage_ready().expect("storage should initialize");

            let settings_payload = storage::fetch_settings_payload().expect("settings should load");
            let settings = settings_payload.settings;
            assert_eq!(
                settings.get("main_api").and_then(Value::as_str),
                Some("openai"),
                "narrative director structured output only supports the OpenAI-compatible path",
            );
            assert_eq!(
                settings
                    .get("chat_completion_source")
                    .and_then(Value::as_str),
                Some("custom"),
                "this smoke test expects the saved custom provider route",
            );

            let api_key = read_secret("api_key_custom").expect("custom api key should be readable");
            assert!(
                !api_key.trim().is_empty(),
                "custom api key must be configured before running the live smoke test",
            );

            let character = storage::fetch_characters()
                .expect("characters should load")
                .into_iter()
                .max_by_key(|item| item.date_last_chat.unwrap_or_default())
                .expect("at least one character should exist");
            let chat = storage::fetch_character_chats(&character.avatar)
                .expect("character chats should load")
                .into_iter()
                .max_by_key(|item| item.last_mes.unwrap_or_default())
                .expect("at least one chat session should exist");
            let messages = storage::fetch_chat(&character.avatar, &chat.file_name)
                .expect("chat messages should load");
            assert!(
                !messages.is_empty(),
                "a non-empty chat session is required for the live narrative test",
            );

            let transcript = build_live_test_transcript(&messages, &character.name, &settings);
            assert!(
                !transcript.trim().is_empty(),
                "chat transcript should not be empty after normalization",
            );

            let story_raw = tauri_generate_structured_output(
                build_live_test_messages(
                    "Analyze the current roleplay session and propose the strongest next scene.\nFocus on momentum, unresolved hooks, conflict escalation, goals, and risks.\nExplicitly list unresolved conflicts that should carry into the next scene.\nReturn structured output only.",
                    &character.name,
                    &transcript,
                ),
                settings.clone(),
                "story_suggestion".to_string(),
                None,
            )
            .await
            .expect("story suggestion should succeed");
            let story_value: Value =
                serde_json::from_str(&story_raw).expect("story suggestion should be valid json");
            eprintln!("story_suggestion={story_raw}");
            if story_value
                .get("next_scene")
                .and_then(Value::as_str)
                .is_none()
            {
                failures.push("story_suggestion missing next_scene".to_string());
            }
            if story_value.get("tension").and_then(Value::as_str).is_none() {
                failures.push("story_suggestion missing tension".to_string());
            }
            if story_value.get("goals").and_then(Value::as_array).is_none() {
                failures.push("story_suggestion missing goals".to_string());
            }

            let relationship_raw = tauri_generate_structured_output(
                build_live_test_messages(
                    "Analyze the current roleplay session and detect meaningful relationship changes between actors.\nOnly include changes justified by explicit dialogue, decisions, or revealed intentions.\nReturn structured output only.",
                    &character.name,
                    &transcript,
                ),
                settings.clone(),
                "relationship_delta".to_string(),
                None,
            )
            .await
            .expect("relationship delta should succeed");
            let relationship_value: Value = serde_json::from_str(&relationship_raw)
                .expect("relationship delta should be valid json");
            eprintln!("relationship_delta={relationship_raw}");
            if relationship_value
                .get("changes")
                .and_then(Value::as_array)
                .is_none()
            {
                failures.push("relationship_delta missing changes".to_string());
            }

            let world_raw = tauri_generate_structured_output(
                build_live_test_messages(
                    "Analyze the current roleplay session and extract durable world-state updates.\nOnly include state changes that should persist beyond the current turn.\nEach update must name the entity, field, next_value, reason, and scope.\nReturn structured output only.",
                    &character.name,
                    &transcript,
                ),
                settings.clone(),
                "world_state_update".to_string(),
                None,
            )
            .await
            .expect("world state update should succeed");
            let world_value: Value =
                serde_json::from_str(&world_raw).expect("world state update should be valid json");
            let updates = world_value
                .get("state_updates")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(build_world_state_update_record)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            eprintln!("world_state_update={world_raw}");
            if updates.is_empty() {
                failures
                    .push("world_state_update returned no applicable state_updates".to_string());
            }

            if updates.is_empty() {
                eprintln!("world_state_apply=skipped");
            } else {
                let snapshot_before = storage::fetch_world_state_snapshot(
                    Some(&character.avatar),
                    Some(&chat.file_name),
                )
                .expect("existing world state snapshot should load");
                let applied_snapshot =
                    tauri_apply_world_state_updates(ApplyWorldStateUpdatesPayload {
                        avatar_url: Some(character.avatar.clone()),
                        file_name: Some(chat.file_name.clone()),
                        updates,
                    })
                    .expect("world state updates should apply");
                let total_items = applied_snapshot.factions.len()
                    + applied_snapshot.inventory_items.len()
                    + applied_snapshot.locations.len()
                    + applied_snapshot.quests.len()
                    + applied_snapshot.relationships.len()
                    + applied_snapshot.scene_states.len();
                if total_items == 0 {
                    failures.push("world_state_apply produced an empty snapshot".to_string());
                }
                if let Some(previous) = snapshot_before {
                    if applied_snapshot.updated_at < previous.updated_at {
                        failures.push(
                            "world_state_apply did not advance snapshot updated_at".to_string(),
                        );
                    }
                }
                eprintln!(
                    "world_state_apply={{\"summary\":{:?},\"updatedAt\":{},\"items\":{}}}",
                    applied_snapshot.summary, applied_snapshot.updated_at, total_items
                );
            }

            if !failures.is_empty() {
                panic!("live smoke failures: {}", failures.join(" | "));
            }
        });
    }

    #[test]
    #[ignore = "Live smoke test for narrative memory extraction and embedding retrieval against current sqlite data"]
    fn narrative_memory_embedding_live_smoke_test_against_saved_session() {
        tauri::async_runtime::block_on(async {
            storage::ensure_storage_ready().expect("storage should initialize");

            let settings_payload = storage::fetch_settings_payload().expect("settings should load");
            let mut settings = settings_payload.settings;
            assert_eq!(
                settings.get("main_api").and_then(Value::as_str),
                Some("openai"),
                "narrative memory extraction only supports the OpenAI-compatible path",
            );

            let character = storage::fetch_characters()
                .expect("characters should load")
                .into_iter()
                .max_by_key(|item| item.date_last_chat.unwrap_or_default())
                .expect("at least one character should exist");
            let chat = storage::fetch_character_chats(&character.avatar)
                .expect("character chats should load")
                .into_iter()
                .max_by_key(|item| item.last_mes.unwrap_or_default())
                .expect("at least one chat session should exist");
            let messages = storage::fetch_chat(&character.avatar, &chat.file_name)
                .expect("chat messages should load");
            assert!(
                !messages.is_empty(),
                "a non-empty chat session is required for the live memory test",
            );

            let transcript = build_live_test_transcript(&messages, &character.name, &settings);
            assert!(
                !transcript.trim().is_empty(),
                "chat transcript should not be empty after normalization",
            );

            let extraction = tauri_extract_narrative_memory(
                build_live_memory_extraction_messages(&character.name, &transcript),
                settings.clone(),
                Some(TraceContextPayload {
                    avatar_url: Some(character.avatar.clone()),
                    character_name: Some(character.name.clone()),
                    file_name: Some(chat.file_name.clone()),
                    generation_context: None,
                }),
            )
            .await
            .expect("memory extraction should succeed");

            assert!(
                !extraction.candidate_memories.is_empty(),
                "memory extraction should return at least one candidate"
            );
            assert!(
                extraction.stored_count > 0,
                "memory extraction should persist at least one memory"
            );

            let pending_candidates = storage::fetch_narrative_memory_candidates(
                Some(&character.avatar),
                Some(&chat.file_name),
                None,
                12,
            )
            .expect("pending candidates should load");
            assert!(
                !pending_candidates.is_empty(),
                "memory extraction should create pending candidates"
            );

            for candidate in &pending_candidates {
                storage::review_narrative_memory_candidate(&candidate.id, "approve")
                    .expect("candidate approval should succeed");
            }

            let approved_memories = storage::fetch_narrative_memories(
                Some(&character.avatar),
                Some(&chat.file_name),
                None,
                12,
            )
            .expect("approved memories should load");
            assert!(
                !approved_memories.is_empty(),
                "approved narrative memories should be queryable"
            );

            enable_live_test_embedding_route(&mut settings);
            let query = extract_live_test_message_content(
                messages
                    .iter()
                    .rev()
                    .find(|message| {
                        message
                            .get("is_user")
                            .and_then(Value::as_bool)
                            .unwrap_or(false)
                            && !extract_live_test_message_content(message).trim().is_empty()
                    })
                    .expect("chat should contain at least one user message"),
            );

            let retrieved = tauri_retrieve_narrative_memories(
                Some(character.avatar.clone()),
                Some(chat.file_name.clone()),
                Some(query.clone()),
                Some(6),
                settings.clone(),
            )
            .await
            .expect("embedding retrieval should succeed");

            assert!(
                !retrieved.is_empty(),
                "embedding retrieval should return at least one memory hit"
            );

            let embedding_model = settings
                .get("narrative_embedding_model")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .expect("embedding model should be configured")
                .to_string();

            let first_hit = &retrieved[0];
            let cached_embedding = storage::read_narrative_memory_embedding(
                &first_hit.id,
                &embedding_model,
                first_hit.updated_at,
            )
            .expect("embedding lookup should succeed");

            assert!(
                cached_embedding.is_some(),
                "retrieval should cache narrative memory embeddings for the active model"
            );

            eprintln!(
                "memory_extraction={{\"stored\":{},\"summary\":{:?},\"candidates\":{}}}",
                extraction.stored_count,
                extraction.summary,
                extraction.candidate_memories.len()
            );
            eprintln!(
                "memory_retrieval={{\"query\":{:?},\"hits\":{},\"topHit\":{:?}}}",
                query,
                retrieved.len(),
                retrieved.first().map(|item| item.summary.as_str())
            );
        });
    }

    fn build_live_test_messages(
        instruction: &str,
        character_name: &str,
        transcript: &str,
    ) -> Vec<Value> {
        vec![
            json!({
                "role": "system",
                "content": "You are a narrative director for an interactive fiction workspace. Obey the response_format exactly and return JSON only."
            }),
            json!({
                "role": "user",
                "content": format!(
                    "Character: {character_name}\n\n{instruction}\n\nConversation snapshot:\n{transcript}"
                )
            }),
        ]
    }

    fn build_live_memory_extraction_messages(character_name: &str, transcript: &str) -> Vec<Value> {
        vec![
            json!({
                "role": "system",
                "content": "You are a narrative memory distiller for an interactive fiction workspace. Obey the response_format exactly and return JSON only."
            }),
            json!({
                "role": "user",
                "content": format!(
                    "Character: {character_name}\n\nAnalyze the following roleplay transcript and extract durable narrative memories that should survive beyond the current turn. Focus on stable facts, important relationship shifts, revealed motivations, persistent risks, and commitments worth retrieving later. Return structured output only.\n\nConversation snapshot:\n{transcript}"
                )
            }),
        ]
    }

    fn build_live_test_transcript(
        messages: &[Value],
        character_name: &str,
        settings: &Value,
    ) -> String {
        let user_name = settings
            .get("username")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("User");
        messages
            .iter()
            .rev()
            .take(10)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .filter_map(|message| {
                let content = extract_live_test_message_content(message);
                if content.trim().is_empty() {
                    return None;
                }
                let speaker = if message
                    .get("is_user")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                {
                    user_name.to_string()
                } else {
                    message
                        .get("name")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .unwrap_or(character_name)
                        .to_string()
                };
                Some(format!("{speaker}: {content}"))
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn extract_live_test_message_content(message: &Value) -> String {
        let extracted = extract_message_content_text(message);
        if !extracted.trim().is_empty() {
            return extracted;
        }

        message
            .get("mes")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or_default()
            .to_string()
    }

    fn enable_live_test_embedding_route(settings: &mut Value) {
        let Some(root) = settings.as_object_mut() else {
            panic!("settings should be an object");
        };

        root.insert(
            "narrative_embedding_enabled".to_string(),
            Value::Bool(true),
        );

        let model = root
            .get("narrative_embedding_model")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("text-embedding-bge-m3")
            .to_string();
        root.insert(
            "narrative_embedding_model".to_string(),
            Value::String(model.clone()),
        );

        let provider_id = root
            .get("narrative_embedding_provider_id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("lm-studio")
            .to_string();
        root.insert(
            "narrative_embedding_provider_id".to_string(),
            Value::String(provider_id.clone()),
        );

        let source = root
            .get("narrative_embedding_source")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("lm_studio")
            .to_string();
        root.insert(
            "narrative_embedding_source".to_string(),
            Value::String(source.clone()),
        );

        if let Some(oai_settings) = root
            .get_mut("oai_settings")
            .and_then(Value::as_object_mut)
        {
            oai_settings.insert(
                "narrative_embedding_enabled".to_string(),
                Value::Bool(true),
            );
            oai_settings.insert(
                "narrative_embedding_model".to_string(),
                Value::String(model),
            );
            oai_settings.insert(
                "narrative_embedding_provider_id".to_string(),
                Value::String(provider_id),
            );
            oai_settings.insert(
                "narrative_embedding_source".to_string(),
                Value::String(source),
            );
        }
    }

    fn build_world_state_update_record(value: &Value) -> Option<WorldStateUpdateRecord> {
        Some(WorldStateUpdateRecord {
            entity: value.get("entity")?.as_str()?.trim().to_string(),
            field: value.get("field")?.as_str()?.trim().to_string(),
            next_value: value.get("next_value")?.clone(),
            reason: value.get("reason")?.as_str()?.trim().to_string(),
        })
        .filter(|item| !item.entity.is_empty() && !item.field.is_empty() && !item.reason.is_empty())
    }
}
