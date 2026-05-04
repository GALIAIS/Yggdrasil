use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::storage::{
    db_dir, ensure_storage_ready, exports_dir, now_millis, open_connection, open_library_db,
    resolve_avatar_file_name, StorageResult,
};
use crate::WorkspaceCatalogEntry;

const PROJECTS_DB_FILE: &str = "projects.sqlite";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifestRecord {
    pub name: String,
    pub description: String,
    pub theme_name: String,
    pub character_avatars: Vec<String>,
    pub lorebook_names: Vec<String>,
    pub story_asset_names: Vec<String>,
    pub session_names: Vec<String>,
    pub plugin_bindings: Vec<String>,
    pub updated_at: u64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectManifestPayload {
    pub name: String,
    pub description: Option<String>,
    pub theme_name: Option<String>,
    pub character_avatars: Option<Vec<String>>,
    pub lorebook_names: Option<Vec<String>>,
    pub story_asset_names: Option<Vec<String>>,
    pub session_names: Option<Vec<String>>,
    pub plugin_bindings: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPluginBindingPayload {
    pub project_name: String,
    pub plugin_id: String,
    pub enabled: bool,
}

fn projects_db_path() -> std::path::PathBuf {
    db_dir().join(PROJECTS_DB_FILE)
}

fn open_projects_db() -> StorageResult<Connection> {
    open_connection(&projects_db_path())
}

pub fn initialize_project_database() -> StorageResult<()> {
    let connection = open_projects_db()?;
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS project_manifests (
                name TEXT PRIMARY KEY,
                description TEXT NOT NULL DEFAULT '',
                theme_name TEXT NOT NULL DEFAULT '',
                character_avatars_json TEXT NOT NULL DEFAULT '[]',
                lorebook_names_json TEXT NOT NULL DEFAULT '[]',
                story_asset_names_json TEXT NOT NULL DEFAULT '[]',
                session_names_json TEXT NOT NULL DEFAULT '[]',
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS project_plugin_bindings (
                project_name TEXT NOT NULL,
                plugin_id TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(project_name, plugin_id)
            );
            CREATE INDEX IF NOT EXISTS idx_project_manifests_updated
            ON project_manifests(updated_at DESC, name ASC);
            ",
        )
        .map_err(|error| error.to_string())?;

    migrate_legacy_project_documents(&connection)?;
    Ok(())
}

pub fn fetch_project_manifests() -> StorageResult<Vec<ProjectManifestRecord>> {
    ensure_storage_ready()?;
    let connection = open_projects_db()?;
    let mut statement = connection
        .prepare(
            "
            SELECT
                name,
                description,
                theme_name,
                character_avatars_json,
                lorebook_names_json,
                story_asset_names_json,
                session_names_json,
                updated_at
            FROM project_manifests
            ORDER BY updated_at DESC, name ASC
            ",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, i64>(7)? as u64,
            ))
        })
        .map_err(|error| error.to_string())?;
    let mut manifests = Vec::new();
    for row in rows {
        let (
            name,
            description,
            theme_name,
            character_avatars_json,
            lorebook_names_json,
            story_asset_names_json,
            session_names_json,
            updated_at,
        ) = row.map_err(|error| error.to_string())?;
        manifests.push(ProjectManifestRecord {
            plugin_bindings: read_plugin_bindings_from_db(&connection, &name)?,
            name,
            description,
            theme_name,
            character_avatars: parse_json_list(character_avatars_json),
            lorebook_names: parse_json_list(lorebook_names_json),
            story_asset_names: parse_json_list(story_asset_names_json),
            session_names: parse_json_list(session_names_json),
            updated_at,
        });
    }

    Ok(manifests)
}

pub fn save_project_manifest(
    payload: SaveProjectManifestPayload,
) -> StorageResult<ProjectManifestRecord> {
    ensure_storage_ready()?;
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("项目名称不能为空。".to_string());
    }

    let now = now_millis();
    let connection = open_projects_db()?;
    let tx = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let character_avatars = normalize_avatar_list(payload.character_avatars.unwrap_or_default());
    let lorebook_names = payload.lorebook_names.unwrap_or_default();
    let story_asset_names = payload.story_asset_names.unwrap_or_default();
    let session_names = payload.session_names.unwrap_or_default();
    tx.execute(
        "
        INSERT INTO project_manifests(
            name, description, theme_name, character_avatars_json, lorebook_names_json,
            story_asset_names_json, session_names_json, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(name) DO UPDATE SET
            description = excluded.description,
            theme_name = excluded.theme_name,
            character_avatars_json = excluded.character_avatars_json,
            lorebook_names_json = excluded.lorebook_names_json,
            story_asset_names_json = excluded.story_asset_names_json,
            session_names_json = excluded.session_names_json,
            updated_at = excluded.updated_at
        ",
        params![
            name,
            payload.description.unwrap_or_default(),
            payload.theme_name.unwrap_or_default(),
            to_json_list(character_avatars)?,
            to_json_list(lorebook_names)?,
            to_json_list(story_asset_names)?,
            to_json_list(session_names)?,
            now,
        ],
    )
    .map_err(|error| error.to_string())?;

    tx.execute(
        "DELETE FROM project_plugin_bindings WHERE project_name = ?1",
        params![name],
    )
    .map_err(|error| error.to_string())?;

    for plugin_id in payload.plugin_bindings.clone().unwrap_or_default() {
        let trimmed = plugin_id.trim();
        if trimmed.is_empty() {
            continue;
        }
        tx.execute(
            "
            INSERT INTO project_plugin_bindings(project_name, plugin_id, enabled, updated_at)
            VALUES (?1, ?2, 1, ?3)
            ",
            params![name, trimmed, now],
        )
        .map_err(|error| error.to_string())?;
    }

    tx.commit().map_err(|error| error.to_string())?;
    fetch_project_manifest(name)
}

pub fn fetch_project_manifest(name: &str) -> StorageResult<ProjectManifestRecord> {
    ensure_storage_ready()?;
    let connection = open_projects_db()?;
    let trimmed = name.trim();
    let row = connection
        .query_row(
            "
            SELECT
                name,
                description,
                theme_name,
                character_avatars_json,
                lorebook_names_json,
                story_asset_names_json,
                session_names_json,
                updated_at
            FROM project_manifests
            WHERE name = ?1
            ",
            params![trimmed],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, i64>(7)? as u64,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("找不到项目: {trimmed}"))?;
    let (
        project_name,
        description,
        theme_name,
        character_avatars_json,
        lorebook_names_json,
        story_asset_names_json,
        session_names_json,
        updated_at,
    ) = row;

    Ok(ProjectManifestRecord {
        plugin_bindings: read_plugin_bindings_from_db(&connection, &project_name)?,
        name: project_name,
        description,
        theme_name,
        character_avatars: parse_json_list(character_avatars_json),
        lorebook_names: parse_json_list(lorebook_names_json),
        story_asset_names: parse_json_list(story_asset_names_json),
        session_names: parse_json_list(session_names_json),
        updated_at,
    })
}

pub fn delete_project_manifest(name: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let connection = open_projects_db()?;
    let tx = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM project_plugin_bindings WHERE project_name = ?1",
        params![name.trim()],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM project_manifests WHERE name = ?1",
        params![name.trim()],
    )
    .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn export_project_manifest(name: &str) -> StorageResult<String> {
    ensure_storage_ready()?;
    let manifest = fetch_project_manifest(name)?;
    std::fs::create_dir_all(exports_dir()).map_err(|error| error.to_string())?;
    let export_path = exports_dir().join(format!(
        "project-{}-{}.json",
        sanitize_project_name(&manifest.name),
        now_millis()
    ));
    let payload = serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?;
    std::fs::write(&export_path, payload).map_err(|error| error.to_string())?;
    Ok(export_path.to_string_lossy().to_string())
}

pub fn import_project_manifest(raw_json: &str) -> StorageResult<ProjectManifestRecord> {
    let payload: SaveProjectManifestPayload =
        serde_json::from_str(raw_json).map_err(|error| error.to_string())?;
    save_project_manifest(payload)
}

pub fn set_project_plugin_binding(
    payload: ProjectPluginBindingPayload,
) -> StorageResult<ProjectManifestRecord> {
    ensure_storage_ready()?;
    let project_name = payload.project_name.trim();
    let plugin_id = payload.plugin_id.trim();
    if project_name.is_empty() || plugin_id.is_empty() {
        return Err("项目名和插件 ID 不能为空。".to_string());
    }

    let connection = open_projects_db()?;
    if payload.enabled {
        connection
            .execute(
                "
                INSERT INTO project_plugin_bindings(project_name, plugin_id, enabled, updated_at)
                VALUES (?1, ?2, 1, ?3)
                ON CONFLICT(project_name, plugin_id) DO UPDATE SET
                    enabled = 1,
                    updated_at = excluded.updated_at
                ",
                params![project_name, plugin_id, now_millis()],
            )
            .map_err(|error| error.to_string())?;
    } else {
        connection
            .execute(
                "DELETE FROM project_plugin_bindings WHERE project_name = ?1 AND plugin_id = ?2",
                params![project_name, plugin_id],
            )
            .map_err(|error| error.to_string())?;
    }

    fetch_project_manifest(project_name)
}

pub fn count_projects() -> StorageResult<usize> {
    ensure_storage_ready()?;
    let connection = open_projects_db()?;
    connection
        .query_row("SELECT COUNT(*) FROM project_manifests", [], |row| {
            row.get::<_, i64>(0)
        })
        .map(|value| value as usize)
        .map_err(|error| error.to_string())
}

pub fn query_project_catalog_entries(limit: usize) -> StorageResult<Vec<WorkspaceCatalogEntry>> {
    let manifests = fetch_project_manifests()?;
    Ok(manifests
        .into_iter()
        .take(limit)
        .map(|manifest| WorkspaceCatalogEntry {
            disabled: None,
            item_count: Some(
                manifest.character_avatars.len()
                    + manifest.lorebook_names.len()
                    + manifest.story_asset_names.len()
                    + manifest.session_names.len(),
            ),
            kind: "project".to_string(),
            name: manifest.name,
            note: Some(manifest.description),
            source_avatar: manifest.character_avatars.first().cloned(),
            source_file_name: manifest.session_names.first().cloned(),
            size_bytes: None,
            tags: {
                let mut tags = vec!["project".to_string()];
                if !manifest.theme_name.trim().is_empty() {
                    tags.push(manifest.theme_name);
                }
                tags.extend(manifest.plugin_bindings.into_iter().take(3));
                tags
            },
            updated_at: Some(manifest.updated_at),
        })
        .collect())
}

fn migrate_legacy_project_documents(connection: &Connection) -> StorageResult<()> {
    let existing_count = connection
        .query_row("SELECT COUNT(*) FROM project_manifests", [], |row| {
            row.get::<_, i64>(0)
        })
        .map(|value| value as usize)
        .map_err(|error| error.to_string())?;
    if existing_count > 0 {
        return Ok(());
    }

    let legacy_documents = query_legacy_project_documents()?;
    for document in legacy_documents {
        let parsed =
            parse_legacy_project_document(&document.name, document.content_text.as_deref());
        connection
            .execute(
                "
                INSERT OR IGNORE INTO project_manifests(
                    name, description, theme_name, character_avatars_json, lorebook_names_json,
                    story_asset_names_json, session_names_json, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                ",
                params![
                    document.name,
                    parsed.description,
                    parsed.theme_name,
                    to_json_list(parsed.character_avatars)?,
                    to_json_list(parsed.lorebook_names)?,
                    to_json_list(parsed.story_asset_names)?,
                    to_json_list(parsed.session_names)?,
                    document.updated_at.unwrap_or(now_millis() as u64) as i64,
                ],
            )
            .map_err(|error| error.to_string())?;
        for plugin_id in parsed.plugin_bindings {
            connection
                .execute(
                    "
                    INSERT OR IGNORE INTO project_plugin_bindings(project_name, plugin_id, enabled, updated_at)
                    VALUES (?1, ?2, 1, ?3)
                    ",
                    params![document.name, plugin_id, now_millis()],
                )
                .map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn parse_legacy_project_document(name: &str, content_text: Option<&str>) -> ProjectManifestRecord {
    let parsed = content_text
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok())
        .unwrap_or(serde_json::Value::Null);
    let object = parsed.as_object().cloned().unwrap_or_default();
    ProjectManifestRecord {
        name: name.to_string(),
        description: string_field(&object, "description"),
        theme_name: string_field(&object, "themeName"),
        character_avatars: normalize_avatar_list(list_field(&object, "characterAvatars")),
        lorebook_names: list_field(&object, "lorebookNames"),
        story_asset_names: list_field(&object, "storyAssetNames"),
        session_names: list_field(&object, "sessionNames"),
        plugin_bindings: list_field(&object, "pluginBindings"),
        updated_at: now_millis() as u64,
    }
}

fn read_plugin_bindings_from_db(
    connection: &Connection,
    project_name: &str,
) -> StorageResult<Vec<String>> {
    let mut statement = connection
        .prepare(
            "
            SELECT plugin_id
            FROM project_plugin_bindings
            WHERE project_name = ?1 AND enabled = 1
            ORDER BY plugin_id ASC
            ",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![project_name], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn list_field(object: &serde_json::Map<String, serde_json::Value>, key: &str) -> Vec<String> {
    object
        .get(key)
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn string_field(object: &serde_json::Map<String, serde_json::Value>, key: &str) -> String {
    object
        .get(key)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .unwrap_or_default()
        .to_string()
}

fn parse_json_list(raw: String) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default()
}

fn query_legacy_project_documents() -> StorageResult<Vec<LegacyProjectDocument>> {
    let connection = open_library_db()?;
    let mut statement = connection
        .prepare(
            "
            SELECT name, content_text, updated_at
            FROM library_entries
            WHERE domain = 'projects'
            ORDER BY COALESCE(updated_at, 0) DESC, name ASC
            ",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(LegacyProjectDocument {
                name: row.get(0)?,
                content_text: row.get(1)?,
                updated_at: row.get::<_, Option<i64>>(2)?.map(|value| value as u64),
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

struct LegacyProjectDocument {
    name: String,
    content_text: Option<String>,
    updated_at: Option<u64>,
}

fn to_json_list(values: Vec<String>) -> StorageResult<String> {
    serde_json::to_string(
        &values
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>(),
    )
    .map_err(|error| error.to_string())
}

fn normalize_avatar_list(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .map(|value| resolve_avatar_file_name(&value))
        .filter(|value| !value.trim().is_empty())
        .collect()
}

fn sanitize_project_name(value: &str) -> String {
    let candidate: String = value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect();
    candidate.trim_matches('-').to_lowercase()
}
