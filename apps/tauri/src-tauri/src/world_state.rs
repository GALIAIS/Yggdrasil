use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Deserialize;
use serde_json::Value;

use crate::storage::{
    db_dir, ensure_storage_ready, now_millis, open_connection, resolve_avatar_file_name,
    session_id_for, StorageResult,
};
use crate::{
    LibraryDocument, WorldStateItemEntry, WorldStateSnapshotEntry, WorldStateUpdateRecord,
};

const WORLD_STATE_DB_FILE: &str = "world_state.sqlite";

#[derive(Deserialize)]
struct LorebookEntryRecord {
    comment: String,
    content: String,
    enabled: bool,
    keys: Vec<String>,
}

#[derive(Clone, Copy)]
enum WorldStateKind {
    Location,
    Faction,
    Relationship,
    Quest,
    InventoryItem,
    SceneState,
}

impl WorldStateKind {
    fn table_name(self) -> &'static str {
        match self {
            Self::Location => "locations",
            Self::Faction => "factions",
            Self::Relationship => "relationships",
            Self::Quest => "quests",
            Self::InventoryItem => "inventory_items",
            Self::SceneState => "scene_states",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Location => "location",
            Self::Faction => "faction",
            Self::Relationship => "relationship",
            Self::Quest => "quest",
            Self::InventoryItem => "inventory_item",
            Self::SceneState => "scene_state",
        }
    }
}

fn world_state_db_path() -> std::path::PathBuf {
    db_dir().join(WORLD_STATE_DB_FILE)
}

fn open_world_state_db() -> StorageResult<Connection> {
    open_connection(&world_state_db_path())
}

pub(crate) fn initialize_world_state_database() -> StorageResult<()> {
    let connection = open_world_state_db()?;
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS world_state_snapshots (
                session_id TEXT PRIMARY KEY,
                avatar TEXT,
                file_name TEXT,
                lorebook_name TEXT,
                summary TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS locations (
                id TEXT PRIMARY KEY,
                snapshot_session_id TEXT NOT NULL,
                name TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS factions (
                id TEXT PRIMARY KEY,
                snapshot_session_id TEXT NOT NULL,
                name TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS relationships (
                id TEXT PRIMARY KEY,
                snapshot_session_id TEXT NOT NULL,
                name TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS quests (
                id TEXT PRIMARY KEY,
                snapshot_session_id TEXT NOT NULL,
                name TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS inventory_items (
                id TEXT PRIMARY KEY,
                snapshot_session_id TEXT NOT NULL,
                name TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS scene_states (
                id TEXT PRIMARY KEY,
                snapshot_session_id TEXT NOT NULL,
                name TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            );
            ",
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn fetch_world_state_snapshot(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
) -> StorageResult<Option<WorldStateSnapshotEntry>> {
    ensure_storage_ready()?;
    let Some(session_id) = resolve_session_id(avatar_url, file_name) else {
        return Ok(None);
    };

    let connection = open_world_state_db()?;
    let snapshot = connection
        .query_row(
            "
            SELECT session_id, avatar, file_name, lorebook_name, summary, updated_at
            FROM world_state_snapshots
            WHERE session_id = ?1
            ",
            params![session_id],
            |row| {
                Ok(WorldStateSnapshotEntry {
                    avatar_url: row.get(1)?,
                    file_name: row.get(2)?,
                    inventory_items: Vec::new(),
                    locations: Vec::new(),
                    lorebook_name: row.get(3)?,
                    quests: Vec::new(),
                    relationships: Vec::new(),
                    scene_states: Vec::new(),
                    session_id: row.get(0)?,
                    summary: row.get(4)?,
                    updated_at: row.get::<_, i64>(5)? as u64,
                    factions: Vec::new(),
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;

    let Some(mut snapshot) = snapshot else {
        return Ok(None);
    };

    snapshot.locations =
        fetch_snapshot_items(&connection, &snapshot.session_id, WorldStateKind::Location)?;
    snapshot.factions =
        fetch_snapshot_items(&connection, &snapshot.session_id, WorldStateKind::Faction)?;
    snapshot.relationships = fetch_snapshot_items(
        &connection,
        &snapshot.session_id,
        WorldStateKind::Relationship,
    )?;
    snapshot.quests =
        fetch_snapshot_items(&connection, &snapshot.session_id, WorldStateKind::Quest)?;
    snapshot.inventory_items = fetch_snapshot_items(
        &connection,
        &snapshot.session_id,
        WorldStateKind::InventoryItem,
    )?;
    snapshot.scene_states = fetch_snapshot_items(
        &connection,
        &snapshot.session_id,
        WorldStateKind::SceneState,
    )?;

    Ok(Some(snapshot))
}

pub fn rebuild_world_state_snapshot(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    lorebook_name: Option<&str>,
    world_documents: &[LibraryDocument],
) -> StorageResult<WorldStateSnapshotEntry> {
    ensure_storage_ready()?;
    let Some(session_id) = resolve_session_id(avatar_url, file_name) else {
        return Err("World state snapshot requires an active session.".to_string());
    };

    let filtered_documents = filter_world_documents(world_documents, lorebook_name);
    let snapshot_name = lorebook_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    let mut locations = Vec::new();
    let mut factions = Vec::new();
    let mut relationships = Vec::new();
    let mut quests = Vec::new();
    let mut inventory_items = Vec::new();
    let mut scene_states = Vec::new();

    for document in filtered_documents {
        for entry in parse_lorebook_entries(document.content_text.as_deref()) {
            if !entry.enabled {
                continue;
            }

            let item = classify_world_state_item(&document.name, &entry);
            match item.0 {
                WorldStateKind::Location => locations.push(item.1),
                WorldStateKind::Faction => factions.push(item.1),
                WorldStateKind::Relationship => relationships.push(item.1),
                WorldStateKind::Quest => quests.push(item.1),
                WorldStateKind::InventoryItem => inventory_items.push(item.1),
                WorldStateKind::SceneState => scene_states.push(item.1),
            }
        }
    }

    let now = now_millis() as u64;
    let summary = format!(
        "locations {}  factions {}  relationships {}  quests {}  inventory {}  scenes {}",
        locations.len(),
        factions.len(),
        relationships.len(),
        quests.len(),
        inventory_items.len(),
        scene_states.len()
    );

    let connection = open_world_state_db()?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "
            INSERT INTO world_state_snapshots(
                session_id, avatar, file_name, lorebook_name, summary, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(session_id) DO UPDATE SET
                avatar = excluded.avatar,
                file_name = excluded.file_name,
                lorebook_name = excluded.lorebook_name,
                summary = excluded.summary,
                updated_at = excluded.updated_at
            ",
            params![
                session_id,
                avatar_url.map(resolve_avatar_file_name),
                file_name.map(str::trim),
                snapshot_name,
                summary,
                now as i64,
                now as i64
            ],
        )
        .map_err(|error| error.to_string())?;

    clear_snapshot_items(&transaction, &session_id)?;
    insert_snapshot_items(
        &transaction,
        &session_id,
        WorldStateKind::Location,
        &locations,
        now,
    )?;
    insert_snapshot_items(
        &transaction,
        &session_id,
        WorldStateKind::Faction,
        &factions,
        now,
    )?;
    insert_snapshot_items(
        &transaction,
        &session_id,
        WorldStateKind::Relationship,
        &relationships,
        now,
    )?;
    insert_snapshot_items(
        &transaction,
        &session_id,
        WorldStateKind::Quest,
        &quests,
        now,
    )?;
    insert_snapshot_items(
        &transaction,
        &session_id,
        WorldStateKind::InventoryItem,
        &inventory_items,
        now,
    )?;
    insert_snapshot_items(
        &transaction,
        &session_id,
        WorldStateKind::SceneState,
        &scene_states,
        now,
    )?;
    transaction.commit().map_err(|error| error.to_string())?;

    Ok(WorldStateSnapshotEntry {
        avatar_url: avatar_url.map(str::to_string),
        factions,
        file_name: file_name.map(str::to_string),
        inventory_items,
        locations,
        lorebook_name: snapshot_name,
        quests,
        relationships,
        scene_states,
        session_id,
        summary,
        updated_at: now,
    })
}

pub fn apply_world_state_updates(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    updates: &[WorldStateUpdateRecord],
) -> StorageResult<WorldStateSnapshotEntry> {
    ensure_storage_ready()?;
    let Some(session_id) = resolve_session_id(avatar_url, file_name) else {
        return Err("World state updates require an active session.".to_string());
    };
    if updates.is_empty() {
        return fetch_world_state_snapshot(avatar_url, file_name)?
            .ok_or_else(|| "No world-state snapshot is available for this session.".to_string());
    }

    let connection = open_world_state_db()?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let now = now_millis() as u64;
    transaction
        .execute(
            "
            INSERT INTO world_state_snapshots(session_id, avatar, file_name, lorebook_name, summary, created_at, updated_at)
            VALUES (?1, ?2, ?3, NULL, '', ?4, ?5)
            ON CONFLICT(session_id) DO UPDATE SET
                avatar = excluded.avatar,
                file_name = excluded.file_name,
                updated_at = excluded.updated_at
            ",
            params![
                session_id,
                avatar_url.map(resolve_avatar_file_name),
                file_name.map(str::trim),
                now as i64,
                now as i64
            ],
        )
        .map_err(|error| error.to_string())?;

    for update in updates {
        let kind = classify_update_kind(&update.field, &update.entity);
        let item_id = format!("{}::{:x}", kind.label(), simple_hash(update.entity.trim()));
        let next_value = stringify_json_value(&update.next_value);
        let detail = format!(
            "{}: {}\nreason: {}",
            update.field.trim(),
            next_value,
            update.reason.trim()
        );
        let tags_json = serde_json::to_string(&vec![update.field.trim().to_string()])
            .map_err(|error| error.to_string())?;
        let sql = format!(
            "
            INSERT INTO {}(id, snapshot_session_id, name, detail, tags_json, status, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(id) DO UPDATE SET
                detail = excluded.detail,
                tags_json = excluded.tags_json,
                status = excluded.status,
                updated_at = excluded.updated_at
            ",
            kind.table_name()
        );
        transaction
            .execute(
                &sql,
                params![
                    item_id,
                    session_id,
                    update.entity.trim(),
                    detail,
                    tags_json,
                    next_value,
                    now as i64
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    let summary = format!("applied {} state updates", updates.len());
    transaction
        .execute(
            "UPDATE world_state_snapshots SET summary = ?2, updated_at = ?3 WHERE session_id = ?1",
            params![session_id, summary, now as i64],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;

    fetch_world_state_snapshot(avatar_url, file_name)?.ok_or_else(|| {
        "World-state snapshot could not be reloaded after applying updates.".to_string()
    })
}

pub fn delete_world_state_snapshots_for_lorebook(lorebook_name: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let normalized_name = lorebook_name.trim();
    if normalized_name.is_empty() {
        return Err("Lorebook name is required.".to_string());
    }

    let connection = open_world_state_db()?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let mut statement = transaction
        .prepare(
            "
            SELECT session_id
            FROM world_state_snapshots
            WHERE lorebook_name = ?1
            ",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![normalized_name], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    let mut session_ids = Vec::new();
    for row in rows {
        session_ids.push(row.map_err(|error| error.to_string())?);
    }
    drop(statement);

    for session_id in &session_ids {
        clear_snapshot_items(&transaction, session_id)?;
    }

    transaction
        .execute(
            "DELETE FROM world_state_snapshots WHERE lorebook_name = ?1",
            params![normalized_name],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

fn resolve_session_id(avatar_url: Option<&str>, file_name: Option<&str>) -> Option<String> {
    let avatar = avatar_url
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let file = file_name.map(str::trim).filter(|value| !value.is_empty())?;
    Some(session_id_for(&resolve_avatar_file_name(avatar), file))
}

fn parse_lorebook_entries(content_text: Option<&str>) -> Vec<LorebookEntryRecord> {
    let Some(content_text) = content_text
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Vec::new();
    };

    serde_json::from_str::<Vec<LorebookEntryRecord>>(content_text).unwrap_or_default()
}

fn filter_world_documents<'a>(
    world_documents: &'a [LibraryDocument],
    lorebook_name: Option<&str>,
) -> Vec<&'a LibraryDocument> {
    if let Some(name) = lorebook_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        world_documents
            .iter()
            .filter(|document| document.name == name)
            .collect()
    } else {
        world_documents.iter().collect()
    }
}

fn classify_world_state_item(
    document_name: &str,
    entry: &LorebookEntryRecord,
) -> (WorldStateKind, WorldStateItemEntry) {
    let joined_keys = entry.keys.join(" ").to_lowercase();
    let comment = entry.comment.trim().to_lowercase();
    let content = entry.content.trim();
    let name = entry
        .keys
        .first()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .unwrap_or(document_name)
        .to_string();

    let status = if comment.contains("resolved") || comment.contains("完成") {
        "resolved"
    } else if comment.contains("active") || comment.contains("进行") {
        "active"
    } else {
        ""
    }
    .to_string();

    let tags = entry
        .keys
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    let kind = if contains_any(
        &joined_keys,
        &comment,
        &["location", "place", "region", "地点", "位置", "城市"],
    ) {
        WorldStateKind::Location
    } else if contains_any(
        &joined_keys,
        &comment,
        &["faction", "guild", "clan", "派系", "阵营", "公会"],
    ) {
        WorldStateKind::Faction
    } else if contains_any(
        &joined_keys,
        &comment,
        &["relationship", "bond", "trust", "关系", "好感", "立场"],
    ) {
        WorldStateKind::Relationship
    } else if contains_any(
        &joined_keys,
        &comment,
        &["quest", "mission", "objective", "任务", "目标", "委托"],
    ) {
        WorldStateKind::Quest
    } else if contains_any(
        &joined_keys,
        &comment,
        &["item", "inventory", "artifact", "物品", "道具", "装备"],
    ) {
        WorldStateKind::InventoryItem
    } else {
        WorldStateKind::SceneState
    };

    (
        kind,
        WorldStateItemEntry {
            detail: content.to_string(),
            id: format!(
                "{}::{:x}",
                kind.label(),
                simple_hash(&format!("{name}::{content}"))
            ),
            name,
            status,
            tags,
            updated_at: 0,
        },
    )
}

fn contains_any(keys: &str, comment: &str, needles: &[&str]) -> bool {
    needles
        .iter()
        .any(|needle| keys.contains(needle) || comment.contains(needle))
}

fn classify_update_kind(field: &str, entity: &str) -> WorldStateKind {
    let field = field.trim().to_lowercase();
    let entity = entity.trim().to_lowercase();
    if contains_any(
        &field,
        &entity,
        &["location", "place", "region", "地点", "城市"],
    ) {
        WorldStateKind::Location
    } else if contains_any(
        &field,
        &entity,
        &["faction", "guild", "clan", "派系", "阵营"],
    ) {
        WorldStateKind::Faction
    } else if contains_any(&field, &entity, &["relationship", "trust", "关系", "好感"]) {
        WorldStateKind::Relationship
    } else if contains_any(&field, &entity, &["quest", "mission", "任务", "委托"]) {
        WorldStateKind::Quest
    } else if contains_any(
        &field,
        &entity,
        &["item", "inventory", "artifact", "物品", "装备"],
    ) {
        WorldStateKind::InventoryItem
    } else {
        WorldStateKind::SceneState
    }
}

fn fetch_snapshot_items(
    connection: &Connection,
    session_id: &str,
    kind: WorldStateKind,
) -> StorageResult<Vec<WorldStateItemEntry>> {
    let sql = format!(
        "
        SELECT id, name, detail, tags_json, status, updated_at
        FROM {}
        WHERE snapshot_session_id = ?1
        ORDER BY updated_at DESC, name ASC
        ",
        kind.table_name()
    );
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![session_id], |row| {
            let tags_json: String = row.get(3)?;
            Ok(WorldStateItemEntry {
                detail: row.get(2)?,
                id: row.get(0)?,
                name: row.get(1)?,
                status: row.get(4)?,
                tags: serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default(),
                updated_at: row.get::<_, i64>(5)? as u64,
            })
        })
        .map_err(|error| error.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|error| error.to_string())?);
    }
    Ok(items)
}

fn clear_snapshot_items(transaction: &Transaction<'_>, session_id: &str) -> StorageResult<()> {
    for kind in [
        WorldStateKind::Location,
        WorldStateKind::Faction,
        WorldStateKind::Relationship,
        WorldStateKind::Quest,
        WorldStateKind::InventoryItem,
        WorldStateKind::SceneState,
    ] {
        let sql = format!(
            "DELETE FROM {} WHERE snapshot_session_id = ?1",
            kind.table_name()
        );
        transaction
            .execute(&sql, params![session_id])
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn insert_snapshot_items(
    transaction: &Transaction<'_>,
    session_id: &str,
    kind: WorldStateKind,
    items: &[WorldStateItemEntry],
    now: u64,
) -> StorageResult<()> {
    let sql = format!(
        "
        INSERT INTO {}(id, snapshot_session_id, name, detail, tags_json, status, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ",
        kind.table_name()
    );
    for item in items {
        let tags_json = serde_json::to_string(&item.tags).map_err(|error| error.to_string())?;
        transaction
            .execute(
                &sql,
                params![
                    item.id,
                    session_id,
                    item.name,
                    item.detail,
                    tags_json,
                    item.status,
                    now as i64
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn simple_hash(value: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in value.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn stringify_json_value(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(inner) => inner.to_string(),
        Value::Number(inner) => inner.to_string(),
        Value::String(inner) => inner.clone(),
        other => serde_json::to_string(other).unwrap_or_else(|_| String::new()),
    }
}
