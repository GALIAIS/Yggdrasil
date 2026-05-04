use rusqlite::{params, Connection, OptionalExtension};

use crate::storage::{
    chats_db_path, db_dir, ensure_storage_ready, has_table, now_millis, open_chats_db,
    open_connection, read_app_setting_i64, StorageResult,
};

const RETRIEVAL_DB_FILE: &str = "retrieval.sqlite";
const DEFAULT_RETRIEVAL_JOBS_PER_SOURCE: i64 = 24;

#[derive(Clone, Debug)]
pub struct RetrievalHitRecord {
    pub domain: String,
    pub hit_id: String,
    pub score: f64,
}

#[derive(Clone, Debug)]
pub struct RetrievalChunkRecord {
    pub id: String,
    pub source_type: String,
    pub source_id: String,
    pub owner_key: String,
    pub scene_tags: Vec<String>,
    pub entity_tags: Vec<String>,
    pub time_tags: Vec<String>,
    pub content_text: String,
}

use crate::{RetrievalHitEntry, RetrievalJobEntry};

fn retrieval_db_path() -> std::path::PathBuf {
    db_dir().join(RETRIEVAL_DB_FILE)
}

pub(crate) fn open_retrieval_db() -> StorageResult<Connection> {
    open_connection(&retrieval_db_path())
}

pub(crate) fn initialize_retrieval_database() -> StorageResult<()> {
    let connection = open_retrieval_db()?;
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS retrieval_chunks (
                id TEXT PRIMARY KEY,
                source_type TEXT NOT NULL,
                source_id TEXT NOT NULL,
                owner_key TEXT NOT NULL,
                scene_tags TEXT NOT NULL DEFAULT '[]',
                entity_tags TEXT NOT NULL DEFAULT '[]',
                time_tags TEXT NOT NULL DEFAULT '[]',
                content_text TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS retrieval_embeddings (
                chunk_id TEXT NOT NULL,
                model TEXT NOT NULL,
                vector_json TEXT NOT NULL,
                dims INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (chunk_id, model)
            );
            CREATE TABLE IF NOT EXISTS retrieval_jobs (
                id TEXT PRIMARY KEY,
                source_type TEXT NOT NULL,
                source_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                detail_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS retrieval_hits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query_text TEXT NOT NULL DEFAULT '',
                hit_domain TEXT NOT NULL DEFAULT '',
                hit_id TEXT NOT NULL DEFAULT '',
                score REAL NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS narrative_memory_embeddings (
                memory_id TEXT PRIMARY KEY,
                model TEXT NOT NULL,
                vector_json TEXT NOT NULL,
                dims INTEGER NOT NULL,
                source_updated_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_narrative_memory_embeddings_model_updated
            ON narrative_memory_embeddings(model, updated_at DESC, memory_id ASC);
            ",
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub(crate) fn migrate_legacy_narrative_memory_embeddings() -> StorageResult<()> {
    let legacy_path = chats_db_path();
    if !legacy_path.exists() {
        return Ok(());
    }

    let legacy = open_chats_db()?;
    if !has_table(&legacy, "narrative_memory_embeddings")? {
        return Ok(());
    }

    let connection = open_retrieval_db()?;
    let existing_count = connection
        .query_row(
            "SELECT COUNT(*) FROM narrative_memory_embeddings",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?;
    if existing_count > 0 {
        return Ok(());
    }

    let legacy_path = legacy_path.to_string_lossy().replace('\'', "''");
    connection
        .execute_batch(&format!(
            "
            ATTACH DATABASE '{legacy_path}' AS legacy_chats;
            INSERT INTO narrative_memory_embeddings(
                memory_id, model, vector_json, dims, source_updated_at, updated_at
            )
            SELECT memory_id, model, vector_json, dims, source_updated_at, updated_at
            FROM legacy_chats.narrative_memory_embeddings;
            DETACH DATABASE legacy_chats;
            "
        ))
        .map_err(|error| error.to_string())
}

pub fn read_narrative_memory_embedding(
    memory_id: &str,
    model: &str,
    source_updated_at: u64,
) -> StorageResult<Option<Vec<f64>>> {
    ensure_storage_ready()?;
    let connection = open_retrieval_db()?;
    let row = connection
        .query_row(
            "
            SELECT vector_json
            FROM narrative_memory_embeddings
            WHERE memory_id = ?1
              AND model = ?2
              AND source_updated_at = ?3
            ",
            params![memory_id, model, source_updated_at as i64],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    row.map(|vector_json| {
        serde_json::from_str::<Vec<f64>>(&vector_json).map_err(|error| error.to_string())
    })
    .transpose()
}

pub fn upsert_narrative_memory_embedding(
    memory_id: &str,
    model: &str,
    vector: &[f64],
    source_updated_at: u64,
) -> StorageResult<()> {
    ensure_storage_ready()?;
    let connection = open_retrieval_db()?;
    let vector_json = serde_json::to_string(vector).map_err(|error| error.to_string())?;
    connection
        .execute(
            "
            INSERT INTO narrative_memory_embeddings(
                memory_id, model, vector_json, dims, source_updated_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(memory_id) DO UPDATE SET
                model = excluded.model,
                vector_json = excluded.vector_json,
                dims = excluded.dims,
                source_updated_at = excluded.source_updated_at,
                updated_at = excluded.updated_at
            ",
            params![
                memory_id,
                model,
                vector_json,
                vector.len() as i64,
                source_updated_at as i64,
                now_millis()
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn delete_narrative_memory_artifacts(memory_id: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let normalized_id = memory_id.trim();
    if normalized_id.is_empty() {
        return Err("Memory id is required.".to_string());
    }

    let connection = open_retrieval_db()?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "DELETE FROM narrative_memory_embeddings WHERE memory_id = ?1",
            params![normalized_id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM retrieval_chunks WHERE source_type = 'memory' AND source_id = ?1",
            params![normalized_id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM retrieval_hits WHERE hit_domain = 'memory' AND hit_id = ?1",
            params![normalized_id],
        )
        .map_err(|error| error.to_string())?;

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn delete_library_source_artifacts(source_type: &str, source_id: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let normalized_type = source_type.trim();
    let normalized_id = source_id.trim();
    if normalized_type.is_empty() || normalized_id.is_empty() {
        return Err("Source type and source id are required.".to_string());
    }

    let connection = open_retrieval_db()?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "DELETE FROM retrieval_chunks WHERE source_type = ?1 AND source_id = ?2",
            params![normalized_type, normalized_id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM retrieval_hits WHERE hit_domain = ?1 AND hit_id = ?2",
            params![normalized_type, normalized_id],
        )
        .map_err(|error| error.to_string())?;

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn save_retrieval_hits(query_text: &str, hits: &[RetrievalHitRecord]) -> StorageResult<()> {
    ensure_storage_ready()?;
    if hits.is_empty() {
        return Ok(());
    }

    let connection = open_retrieval_db()?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let created_at = now_millis();
    let normalized_query = query_text.trim();

    transaction
        .execute(
            "DELETE FROM retrieval_hits WHERE query_text = ?1",
            params![normalized_query],
        )
        .map_err(|error| error.to_string())?;

    for hit in hits {
        if hit.domain.trim().is_empty() || hit.hit_id.trim().is_empty() {
            continue;
        }

        transaction
            .execute(
                "
                INSERT INTO retrieval_hits(query_text, hit_domain, hit_id, score, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5)
                ",
                params![
                    normalized_query,
                    hit.domain.trim(),
                    hit.hit_id.trim(),
                    hit.score,
                    created_at
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn upsert_retrieval_chunks(chunks: &[RetrievalChunkRecord]) -> StorageResult<()> {
    ensure_storage_ready()?;
    if chunks.is_empty() {
        return Ok(());
    }

    let connection = open_retrieval_db()?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let now = now_millis();

    for chunk in chunks {
        if chunk.id.trim().is_empty()
            || chunk.source_type.trim().is_empty()
            || chunk.source_id.trim().is_empty()
            || chunk.owner_key.trim().is_empty()
            || chunk.content_text.trim().is_empty()
        {
            continue;
        }

        let scene_tags =
            serde_json::to_string(&chunk.scene_tags).map_err(|error| error.to_string())?;
        let entity_tags =
            serde_json::to_string(&chunk.entity_tags).map_err(|error| error.to_string())?;
        let time_tags =
            serde_json::to_string(&chunk.time_tags).map_err(|error| error.to_string())?;

        transaction
            .execute(
                "
                INSERT INTO retrieval_chunks(
                    id, source_type, source_id, owner_key, scene_tags, entity_tags, time_tags,
                    content_text, created_at, updated_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                ON CONFLICT(id) DO UPDATE SET
                    source_type = excluded.source_type,
                    source_id = excluded.source_id,
                    owner_key = excluded.owner_key,
                    scene_tags = excluded.scene_tags,
                    entity_tags = excluded.entity_tags,
                    time_tags = excluded.time_tags,
                    content_text = excluded.content_text,
                    updated_at = excluded.updated_at
                ",
                params![
                    chunk.id.trim(),
                    chunk.source_type.trim(),
                    chunk.source_id.trim(),
                    chunk.owner_key.trim(),
                    scene_tags,
                    entity_tags,
                    time_tags,
                    chunk.content_text.trim(),
                    now,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn save_retrieval_job(
    id: &str,
    source_type: &str,
    source_id: &str,
    status: &str,
    detail_json: &str,
) -> StorageResult<()> {
    ensure_storage_ready()?;
    let connection = open_retrieval_db()?;
    let now = now_millis();
    connection
        .execute(
            "
            INSERT INTO retrieval_jobs(id, source_type, source_id, status, detail_json, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                detail_json = excluded.detail_json,
                updated_at = excluded.updated_at
            ",
            params![id, source_type, source_id, status, detail_json, now, now],
        )
        .map_err(|error| error.to_string())?;
    prune_retrieval_jobs_for_source(
        source_type,
        source_id,
        read_app_setting_i64(
            "retrieval_jobs_retention_per_source",
            DEFAULT_RETRIEVAL_JOBS_PER_SOURCE,
        ),
    )?;
    Ok(())
}

pub fn delete_retrieval_jobs_for_source(source_type: &str, source_id: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let normalized_type = source_type.trim();
    let normalized_id = source_id.trim();
    if normalized_type.is_empty() || normalized_id.is_empty() {
        return Ok(());
    }

    let connection = open_retrieval_db()?;
    connection
        .execute(
            "DELETE FROM retrieval_jobs WHERE source_type = ?1 AND source_id = ?2",
            params![normalized_type, normalized_id],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn rename_retrieval_jobs_source(
    source_type: &str,
    source_id: &str,
    next_source_id: &str,
) -> StorageResult<()> {
    ensure_storage_ready()?;
    let normalized_type = source_type.trim();
    let normalized_id = source_id.trim();
    let normalized_next_id = next_source_id.trim();
    if normalized_type.is_empty() || normalized_id.is_empty() || normalized_next_id.is_empty() {
        return Ok(());
    }

    let connection = open_retrieval_db()?;
    connection
        .execute(
            "UPDATE retrieval_jobs SET source_id = ?1, updated_at = ?2 WHERE source_type = ?3 AND source_id = ?4",
            params![normalized_next_id, now_millis(), normalized_type, normalized_id],
        )
        .map_err(|error| error.to_string())?;
    prune_retrieval_jobs_for_source(
        normalized_type,
        normalized_next_id,
        read_app_setting_i64(
            "retrieval_jobs_retention_per_source",
            DEFAULT_RETRIEVAL_JOBS_PER_SOURCE,
        ),
    )?;
    Ok(())
}

fn prune_retrieval_jobs_for_source(
    source_type: &str,
    source_id: &str,
    keep: i64,
) -> StorageResult<()> {
    let normalized_type = source_type.trim();
    let normalized_id = source_id.trim();
    if normalized_type.is_empty() || normalized_id.is_empty() || keep <= 0 {
        return Ok(());
    }

    let connection = open_retrieval_db()?;
    connection
        .execute(
            "
            DELETE FROM retrieval_jobs
            WHERE source_type = ?1
              AND source_id = ?2
              AND id NOT IN (
                SELECT id
                FROM retrieval_jobs
                WHERE source_type = ?1 AND source_id = ?2
                ORDER BY updated_at DESC, id DESC
                LIMIT ?3
              )
            ",
            params![normalized_type, normalized_id, keep],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn fetch_retrieval_jobs(
    file_name: Option<&str>,
    limit: usize,
) -> StorageResult<Vec<RetrievalJobEntry>> {
    ensure_storage_ready()?;
    let connection = open_retrieval_db()?;
    let trimmed_file_name = file_name.map(str::trim).filter(|value| !value.is_empty());
    let sql = if trimmed_file_name.is_some() {
        "
        SELECT id, source_type, source_id, status, detail_json, created_at, updated_at
        FROM retrieval_jobs
        WHERE source_id = ?1
        ORDER BY updated_at DESC, id DESC
        LIMIT ?2
        "
    } else {
        "
        SELECT id, source_type, source_id, status, detail_json, created_at, updated_at
        FROM retrieval_jobs
        ORDER BY updated_at DESC, id DESC
        LIMIT ?1
        "
    };

    let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
    let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<RetrievalJobEntry> {
        Ok(RetrievalJobEntry {
            id: row.get(0)?,
            source_type: row.get(1)?,
            source_id: row.get(2)?,
            status: row.get(3)?,
            detail_json: row.get(4)?,
            created_at: row.get::<_, i64>(5)? as u64,
            updated_at: row.get::<_, i64>(6)? as u64,
        })
    };

    let rows = if let Some(file_name) = trimmed_file_name {
        statement
            .query_map(params![file_name, limit.max(1) as i64], map_row)
            .map_err(|error| error.to_string())?
    } else {
        statement
            .query_map(params![limit.max(1) as i64], map_row)
            .map_err(|error| error.to_string())?
    };

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|error| error.to_string())?);
    }
    Ok(entries)
}

pub fn fetch_retrieval_hits(
    query_text: Option<&str>,
    limit: usize,
) -> StorageResult<Vec<RetrievalHitEntry>> {
    ensure_storage_ready()?;
    let connection = open_retrieval_db()?;
    let trimmed_query = query_text.map(str::trim).filter(|value| !value.is_empty());
    let sql = if trimmed_query.is_some() {
        "
        SELECT id, query_text, hit_domain, hit_id, score, created_at
        FROM retrieval_hits
        WHERE query_text = ?1
        ORDER BY created_at DESC, id DESC
        LIMIT ?2
        "
    } else {
        "
        SELECT id, query_text, hit_domain, hit_id, score, created_at
        FROM retrieval_hits
        ORDER BY created_at DESC, id DESC
        LIMIT ?1
        "
    };

    let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
    let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<RetrievalHitEntry> {
        Ok(RetrievalHitEntry {
            id: row.get(0)?,
            query_text: row.get(1)?,
            hit_domain: row.get(2)?,
            hit_id: row.get(3)?,
            score: row.get(4)?,
            created_at: row.get::<_, i64>(5)? as u64,
        })
    };

    let rows = if let Some(query_text) = trimmed_query {
        statement
            .query_map(params![query_text, limit.max(1) as i64], map_row)
            .map_err(|error| error.to_string())?
    } else {
        statement
            .query_map(params![limit.max(1) as i64], map_row)
            .map_err(|error| error.to_string())?
    };

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|error| error.to_string())?);
    }
    Ok(entries)
}
