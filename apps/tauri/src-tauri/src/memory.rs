use rusqlite::{params, Connection, OptionalExtension};

use crate::storage::{
    chats_db_path, db_dir, ensure_storage_ready, has_table, is_cjk, now_millis, open_chats_db,
    open_connection, resolve_avatar_file_name, session_id_for, StorageResult,
};
use crate::{
    NarrativeMemoryCandidateEntry, NarrativeMemoryEntry, NarrativeMemoryHitEntry,
    NarrativeMemoryRecord,
};

const MEMORY_DB_FILE: &str = "memory.sqlite";

fn memory_db_path() -> std::path::PathBuf {
    db_dir().join(MEMORY_DB_FILE)
}

pub(crate) fn open_memory_db() -> StorageResult<Connection> {
    open_connection(&memory_db_path())
}

pub(crate) fn initialize_memory_database() -> StorageResult<()> {
    let connection = open_memory_db()?;
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS session_summaries (
                session_id TEXT PRIMARY KEY,
                avatar TEXT,
                file_name TEXT,
                summary TEXT NOT NULL DEFAULT '',
                open_threads_json TEXT NOT NULL DEFAULT '[]',
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS character_memories (
                id TEXT PRIMARY KEY,
                owner_key TEXT NOT NULL,
                source_session_id TEXT,
                content_text TEXT NOT NULL,
                importance REAL NOT NULL DEFAULT 0,
                tags_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'active',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS world_memories (
                id TEXT PRIMARY KEY,
                owner_key TEXT NOT NULL,
                source_session_id TEXT,
                content_text TEXT NOT NULL,
                importance REAL NOT NULL DEFAULT 0,
                tags_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'active',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS memory_candidates (
                id TEXT PRIMARY KEY,
                domain TEXT NOT NULL,
                owner_key TEXT NOT NULL,
                source_session_id TEXT,
                content_text TEXT NOT NULL,
                importance REAL NOT NULL DEFAULT 0,
                tags_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'pending',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS memory_hits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                memory_id TEXT NOT NULL,
                session_id TEXT,
                query_text TEXT NOT NULL DEFAULT '',
                hit_score REAL NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS narrative_memories (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                avatar TEXT,
                file_name TEXT,
                character_name TEXT NOT NULL DEFAULT '',
                fingerprint TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                importance REAL NOT NULL DEFAULT 0,
                kind TEXT NOT NULL DEFAULT 'fact',
                tags_json TEXT NOT NULL DEFAULT '[]',
                source TEXT NOT NULL DEFAULT 'memory_extraction',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_narrative_memories_session_updated
            ON narrative_memories(session_id, updated_at DESC, id ASC);
            CREATE INDEX IF NOT EXISTS idx_narrative_memories_updated
            ON narrative_memories(updated_at DESC, importance DESC, id ASC);
            ",
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub(crate) fn migrate_legacy_narrative_memories() -> StorageResult<()> {
    let legacy_path = chats_db_path();
    if !legacy_path.exists() {
        return Ok(());
    }

    let legacy = open_chats_db()?;
    if !has_table(&legacy, "narrative_memories")? {
        return Ok(());
    }

    let connection = open_memory_db()?;
    let existing_count = connection
        .query_row("SELECT COUNT(*) FROM narrative_memories", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| error.to_string())?;
    if existing_count > 0 {
        return Ok(());
    }

    let legacy_path = legacy_path.to_string_lossy().replace('\'', "''");
    connection
        .execute_batch(&format!(
            "
            ATTACH DATABASE '{legacy_path}' AS legacy_chats;
            INSERT INTO narrative_memories(
                id, session_id, avatar, file_name, character_name, fingerprint, content,
                summary, importance, kind, tags_json, source, created_at, updated_at
            )
            SELECT
                id, session_id, avatar, file_name, character_name, fingerprint, content,
                summary, importance, kind, tags_json, source, created_at, updated_at
            FROM legacy_chats.narrative_memories;
            DETACH DATABASE legacy_chats;
            "
        ))
        .map_err(|error| error.to_string())
}

pub fn save_narrative_memories(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    character_name: Option<&str>,
    summary: &str,
    candidate_memories: &[NarrativeMemoryRecord],
) -> StorageResult<usize> {
    ensure_storage_ready()?;

    let Some(file_name) = file_name.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(0);
    };
    let Some(avatar_url) = avatar_url.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(0);
    };

    let avatar = resolve_avatar_file_name(avatar_url);
    let session_id = session_id_for(&avatar, file_name);
    let connection = open_memory_db()?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let mut stored_count = 0usize;
    let now = now_millis();
    let summary = summary.trim();
    let character_name = character_name.unwrap_or("").trim();

    transaction
        .execute(
            "
            INSERT INTO session_summaries(session_id, avatar, file_name, summary, open_threads_json, updated_at)
            VALUES (?1, ?2, ?3, ?4, '[]', ?5)
            ON CONFLICT(session_id) DO UPDATE SET
                avatar = excluded.avatar,
                file_name = excluded.file_name,
                summary = excluded.summary,
                updated_at = excluded.updated_at
            ",
            params![session_id, avatar, file_name, summary, now],
        )
        .map_err(|error| error.to_string())?;

    for memory in candidate_memories {
        let content = memory.content.trim();
        if content.is_empty() {
            continue;
        }

        let kind = memory.kind.trim();
        let normalized_kind = if kind.is_empty() { "fact" } else { kind };
        let normalized_tags = memory
            .tags
            .iter()
            .map(|tag| tag.trim())
            .filter(|tag| !tag.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();
        let tags_json =
            serde_json::to_string(&normalized_tags).map_err(|error| error.to_string())?;
        let candidate_id = format!("candidate::{session_id}::{:x}", simple_hash(content));
        let importance = if memory.importance.is_finite() {
            memory.importance.max(0.0)
        } else {
            0.0
        };

        transaction
            .execute(
                "
                INSERT INTO memory_candidates(
                    id, domain, owner_key, source_session_id, content_text, importance, tags_json, status, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?9)
                ON CONFLICT(id) DO UPDATE SET
                    domain = excluded.domain,
                    owner_key = excluded.owner_key,
                    source_session_id = excluded.source_session_id,
                    content_text = excluded.content_text,
                    importance = excluded.importance,
                    tags_json = excluded.tags_json,
                    status = 'pending',
                    updated_at = excluded.updated_at
                ",
                params![
                    candidate_id,
                    normalized_kind,
                    character_name,
                    session_id,
                    content,
                    importance,
                    tags_json,
                    now,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;

        stored_count += 1;
    }

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(stored_count)
}

pub fn fetch_narrative_memory_candidates(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    query: Option<&str>,
    limit: usize,
) -> StorageResult<Vec<NarrativeMemoryCandidateEntry>> {
    ensure_storage_ready()?;
    let connection = open_memory_db()?;
    let trimmed_file_name = file_name.map(str::trim).filter(|value| !value.is_empty());
    let trimmed_avatar = avatar_url.map(str::trim).filter(|value| !value.is_empty());
    let session_id = match (trimmed_avatar, trimmed_file_name) {
        (Some(avatar), Some(file)) => Some(session_id_for(&resolve_avatar_file_name(avatar), file)),
        _ => None,
    };

    let query_sql = if session_id.is_some() {
        "
        SELECT
            c.id,
            c.owner_key,
            c.content_text,
            c.created_at,
            s.file_name,
            c.importance,
            c.domain,
            COALESCE(s.summary, ''),
            c.tags_json,
            c.updated_at,
            c.status,
            c.source_session_id
        FROM memory_candidates c
        LEFT JOIN session_summaries s ON s.session_id = c.source_session_id
        WHERE c.source_session_id = ?1
          AND c.status = 'pending'
        ORDER BY c.updated_at DESC, c.importance DESC, c.id ASC
        LIMIT ?2
        "
    } else {
        "
        SELECT
            c.id,
            c.owner_key,
            c.content_text,
            c.created_at,
            s.file_name,
            c.importance,
            c.domain,
            COALESCE(s.summary, ''),
            c.tags_json,
            c.updated_at,
            c.status,
            c.source_session_id
        FROM memory_candidates c
        LEFT JOIN session_summaries s ON s.session_id = c.source_session_id
        WHERE c.status = 'pending'
        ORDER BY c.updated_at DESC, c.importance DESC, c.id ASC
        LIMIT ?1
        "
    };

    let mut statement = connection
        .prepare(query_sql)
        .map_err(|error| error.to_string())?;
    let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<NarrativeMemoryCandidateEntry> {
        let tags_json: String = row.get(8)?;
        Ok(NarrativeMemoryCandidateEntry {
            id: row.get(0)?,
            character_name: row.get(1)?,
            content: row.get(2)?,
            created_at: row.get::<_, i64>(3)? as u64,
            domain: row.get(6)?,
            file_name: row.get(4)?,
            importance: row.get(5)?,
            kind: row.get(6)?,
            source_session_id: row.get(11)?,
            status: row.get(10)?,
            summary: row.get(7)?,
            tags: serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default(),
            updated_at: row.get::<_, i64>(9)? as u64,
        })
    };

    let rows = if let Some(session_id) = session_id {
        statement
            .query_map(params![session_id, limit.max(1) as i64], map_row)
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

    let scored_terms = tokenize_narrative_query(query.unwrap_or_default());
    if scored_terms.is_empty() {
        entries.sort_by(|left, right| {
            right
                .importance
                .partial_cmp(&left.importance)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| right.updated_at.cmp(&left.updated_at))
        });
    } else {
        entries.sort_by(|left, right| {
            score_narrative_memory_candidate(right, &scored_terms)
                .partial_cmp(&score_narrative_memory_candidate(left, &scored_terms))
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| right.updated_at.cmp(&left.updated_at))
        });
    }

    Ok(entries)
}

pub fn fetch_narrative_memories(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    query: Option<&str>,
    limit: usize,
) -> StorageResult<Vec<NarrativeMemoryEntry>> {
    ensure_storage_ready()?;
    let connection = open_memory_db()?;
    let trimmed_file_name = file_name.map(str::trim).filter(|value| !value.is_empty());
    let trimmed_avatar = avatar_url.map(str::trim).filter(|value| !value.is_empty());
    let session_id = match (trimmed_avatar, trimmed_file_name) {
        (Some(avatar), Some(file)) => Some(session_id_for(&resolve_avatar_file_name(avatar), file)),
        _ => None,
    };

    let query_sql = if session_id.is_some() {
        "
        SELECT id, character_name, content, created_at, file_name, importance, kind, summary, tags_json, updated_at
        FROM narrative_memories
        WHERE session_id = ?1
        ORDER BY updated_at DESC, importance DESC, id ASC
        LIMIT ?2
        "
    } else {
        "
        SELECT id, character_name, content, created_at, file_name, importance, kind, summary, tags_json, updated_at
        FROM narrative_memories
        ORDER BY updated_at DESC, importance DESC, id ASC
        LIMIT ?1
        "
    };

    let mut statement = connection
        .prepare(query_sql)
        .map_err(|error| error.to_string())?;
    let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<NarrativeMemoryEntry> {
        let tags_json: String = row.get(8)?;
        Ok(NarrativeMemoryEntry {
            id: row.get(0)?,
            character_name: row.get(1)?,
            content: row.get(2)?,
            created_at: row.get::<_, i64>(3)? as u64,
            file_name: row.get(4)?,
            importance: row.get(5)?,
            kind: row.get(6)?,
            summary: row.get(7)?,
            tags: serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default(),
            updated_at: row.get::<_, i64>(9)? as u64,
        })
    };

    let rows = if let Some(session_id) = session_id {
        statement
            .query_map(params![session_id, limit.max(1) as i64], map_row)
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

    let scored_terms = tokenize_narrative_query(query.unwrap_or_default());
    if scored_terms.is_empty() {
        entries.sort_by(|left, right| {
            right
                .importance
                .partial_cmp(&left.importance)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| right.updated_at.cmp(&left.updated_at))
        });
    } else {
        entries.sort_by(|left, right| {
            score_narrative_memory(right, &scored_terms)
                .partial_cmp(&score_narrative_memory(left, &scored_terms))
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| right.updated_at.cmp(&left.updated_at))
        });
    }

    entries.truncate(limit.max(1));
    Ok(entries)
}

fn tokenize_narrative_query(value: &str) -> Vec<String> {
    value
        .split(|character: char| !character.is_alphanumeric() && !is_cjk(character))
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .map(|segment| segment.to_lowercase())
        .filter(|segment| segment.chars().count() >= 2 || segment.chars().any(is_cjk))
        .collect()
}

fn score_narrative_memory(entry: &NarrativeMemoryEntry, terms: &[String]) -> f64 {
    let content = entry.content.to_lowercase();
    let summary = entry.summary.to_lowercase();
    let kind = entry.kind.to_lowercase();
    let tags = entry
        .tags
        .iter()
        .map(|tag| tag.to_lowercase())
        .collect::<Vec<_>>();
    let mut score = entry.importance.max(0.0) * 2.0;

    for term in terms {
        if content.contains(term) {
            score += 5.0;
        }
        if summary.contains(term) {
            score += 2.5;
        }
        if kind.contains(term) {
            score += 1.5;
        }
        if tags.iter().any(|tag| tag.contains(term)) {
            score += 2.0;
        }
    }

    score + (entry.updated_at as f64 / 1_000_000_000_000.0)
}

fn score_narrative_memory_candidate(
    entry: &NarrativeMemoryCandidateEntry,
    terms: &[String],
) -> f64 {
    let content = entry.content.to_lowercase();
    let summary = entry.summary.to_lowercase();
    let kind = entry.kind.to_lowercase();
    let tags = entry
        .tags
        .iter()
        .map(|tag| tag.to_lowercase())
        .collect::<Vec<_>>();
    let mut score = entry.importance.max(0.0) * 2.0;

    for term in terms {
        if content.contains(term) {
            score += 5.0;
        }
        if summary.contains(term) {
            score += 2.5;
        }
        if kind.contains(term) {
            score += 1.5;
        }
        if tags.iter().any(|tag| tag.contains(term)) {
            score += 2.0;
        }
    }

    score + (entry.updated_at as f64 / 1_000_000_000_000.0)
}

pub fn save_memory_hits(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    query_text: &str,
    hits: &[NarrativeMemoryEntry],
) -> StorageResult<()> {
    ensure_storage_ready()?;
    if hits.is_empty() {
        return Ok(());
    }

    let trimmed_query = query_text.trim();
    if trimmed_query.is_empty() {
        return Ok(());
    }

    let trimmed_file_name = file_name.map(str::trim).filter(|value| !value.is_empty());
    let trimmed_avatar = avatar_url.map(str::trim).filter(|value| !value.is_empty());
    let session_id = match (trimmed_avatar, trimmed_file_name) {
        (Some(avatar), Some(file)) => Some(session_id_for(&resolve_avatar_file_name(avatar), file)),
        _ => None,
    };

    let connection = open_memory_db()?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let now = now_millis();

    match session_id.as_deref() {
        Some(id) => {
            transaction
                .execute(
                    "DELETE FROM memory_hits WHERE session_id = ?1 AND query_text = ?2",
                    params![id, trimmed_query],
                )
                .map_err(|error| error.to_string())?;
        }
        None => {
            transaction
                .execute(
                    "DELETE FROM memory_hits WHERE session_id IS NULL AND query_text = ?1",
                    params![trimmed_query],
                )
                .map_err(|error| error.to_string())?;
        }
    }

    for hit in hits {
        if hit.id.trim().is_empty() {
            continue;
        }

        transaction
            .execute(
                "
                INSERT INTO memory_hits(memory_id, session_id, query_text, hit_score, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5)
                ",
                params![
                    hit.id.trim(),
                    session_id,
                    trimmed_query,
                    hit.importance,
                    now,
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn fetch_memory_hits(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    query: Option<&str>,
    limit: usize,
) -> StorageResult<Vec<NarrativeMemoryHitEntry>> {
    ensure_storage_ready()?;
    let connection = open_memory_db()?;
    let trimmed_query = query.map(str::trim).filter(|value| !value.is_empty());
    let trimmed_file_name = file_name.map(str::trim).filter(|value| !value.is_empty());
    let trimmed_avatar = avatar_url.map(str::trim).filter(|value| !value.is_empty());
    let session_id = match (trimmed_avatar, trimmed_file_name) {
        (Some(avatar), Some(file)) => Some(session_id_for(&resolve_avatar_file_name(avatar), file)),
        _ => None,
    };

    let sql = match (session_id.is_some(), trimmed_query.is_some()) {
        (true, true) => {
            "
            SELECT id, memory_id, session_id, query_text, hit_score, created_at
            FROM memory_hits
            WHERE session_id = ?1 AND query_text = ?2
            ORDER BY created_at DESC, id DESC
            LIMIT ?3
        "
        }
        (true, false) => {
            "
            SELECT id, memory_id, session_id, query_text, hit_score, created_at
            FROM memory_hits
            WHERE session_id = ?1
            ORDER BY created_at DESC, id DESC
            LIMIT ?2
        "
        }
        (false, true) => {
            "
            SELECT id, memory_id, session_id, query_text, hit_score, created_at
            FROM memory_hits
            WHERE query_text = ?1
            ORDER BY created_at DESC, id DESC
            LIMIT ?2
        "
        }
        (false, false) => {
            "
            SELECT id, memory_id, session_id, query_text, hit_score, created_at
            FROM memory_hits
            ORDER BY created_at DESC, id DESC
            LIMIT ?1
        "
        }
    };

    let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
    let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<NarrativeMemoryHitEntry> {
        Ok(NarrativeMemoryHitEntry {
            created_at: row.get::<_, i64>(5)? as u64,
            hit_score: row.get(4)?,
            id: row.get(0)?,
            memory_id: row.get(1)?,
            query_text: row.get(3)?,
            session_id: row.get(2)?,
        })
    };

    let rows = match (session_id.as_deref(), trimmed_query) {
        (Some(id), Some(query_text)) => statement
            .query_map(params![id, query_text, limit.max(1) as i64], map_row)
            .map_err(|error| error.to_string())?,
        (Some(id), None) => statement
            .query_map(params![id, limit.max(1) as i64], map_row)
            .map_err(|error| error.to_string())?,
        (None, Some(query_text)) => statement
            .query_map(params![query_text, limit.max(1) as i64], map_row)
            .map_err(|error| error.to_string())?,
        (None, None) => statement
            .query_map(params![limit.max(1) as i64], map_row)
            .map_err(|error| error.to_string())?,
    };

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|error| error.to_string())?);
    }
    Ok(entries)
}

pub fn delete_narrative_memory(memory_id: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let normalized_id = memory_id.trim();
    if normalized_id.is_empty() {
        return Err("Memory id is required.".to_string());
    }

    let connection = open_memory_db()?;
    connection
        .execute(
            "DELETE FROM narrative_memories WHERE id = ?1",
            params![normalized_id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM memory_hits WHERE memory_id = ?1",
            params![normalized_id],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn delete_narrative_memory_candidate(candidate_id: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let normalized_id = candidate_id.trim();
    if normalized_id.is_empty() {
        return Err("Candidate id is required.".to_string());
    }

    let connection = open_memory_db()?;
    connection
        .execute(
            "DELETE FROM memory_candidates WHERE id = ?1",
            params![normalized_id],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn clear_memory_hits(
    avatar_url: Option<&str>,
    file_name: Option<&str>,
    query: Option<&str>,
) -> StorageResult<()> {
    ensure_storage_ready()?;
    let connection = open_memory_db()?;
    let trimmed_query = query.map(str::trim).filter(|value| !value.is_empty());
    let trimmed_file_name = file_name.map(str::trim).filter(|value| !value.is_empty());
    let trimmed_avatar = avatar_url.map(str::trim).filter(|value| !value.is_empty());
    let session_id = match (trimmed_avatar, trimmed_file_name) {
        (Some(avatar), Some(file)) => Some(session_id_for(&resolve_avatar_file_name(avatar), file)),
        _ => None,
    };

    match (session_id.as_deref(), trimmed_query) {
        (Some(id), Some(query_text)) => connection
            .execute(
                "DELETE FROM memory_hits WHERE session_id = ?1 AND query_text = ?2",
                params![id, query_text],
            )
            .map_err(|error| error.to_string())?,
        (Some(id), None) => connection
            .execute("DELETE FROM memory_hits WHERE session_id = ?1", params![id])
            .map_err(|error| error.to_string())?,
        (None, Some(query_text)) => connection
            .execute(
                "DELETE FROM memory_hits WHERE query_text = ?1",
                params![query_text],
            )
            .map_err(|error| error.to_string())?,
        (None, None) => connection
            .execute("DELETE FROM memory_hits", [])
            .map_err(|error| error.to_string())?,
    };

    Ok(())
}

pub fn review_narrative_memory_candidate(candidate_id: &str, action: &str) -> StorageResult<()> {
    ensure_storage_ready()?;
    let normalized_id = candidate_id.trim();
    if normalized_id.is_empty() {
        return Err("Candidate id is required.".to_string());
    }

    let normalized_action = action.trim().to_lowercase();
    if normalized_action != "approve" && normalized_action != "reject" {
        return Err("Unsupported review action.".to_string());
    }

    let connection = open_memory_db()?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let now = now_millis();

    let candidate = transaction
        .query_row(
            "
            SELECT id, domain, owner_key, source_session_id, content_text, importance, tags_json, created_at
            FROM memory_candidates
            WHERE id = ?1
            ",
            params![normalized_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, f64>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, i64>(7)? as u64,
                ))
            },
        )
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "UPDATE memory_candidates SET status = ?2, updated_at = ?3 WHERE id = ?1",
            params![normalized_id, normalized_action, now],
        )
        .map_err(|error| error.to_string())?;

    let (_, domain, owner_key, source_session_id, content_text, importance, tags_json, created_at) =
        candidate;
    let Some(session_id) = source_session_id else {
        transaction.commit().map_err(|error| error.to_string())?;
        return Ok(());
    };

    let session_metadata = transaction
        .query_row(
            "
            SELECT avatar, file_name, summary
            FROM session_summaries
            WHERE session_id = ?1
            ",
            params![session_id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;

    if normalized_action == "approve" {
        if let Some((avatar, file_name, summary)) = session_metadata {
            let fingerprint = format!("{}::{}", session_id, content_text.to_lowercase());
            transaction
                .execute(
                    "
                    INSERT INTO narrative_memories(
                        id, session_id, avatar, file_name, character_name, fingerprint, content,
                        summary, importance, kind, tags_json, source, created_at, updated_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'memory_review', ?12, ?13)
                    ON CONFLICT(fingerprint) DO UPDATE SET
                        character_name = excluded.character_name,
                        content = excluded.content,
                        summary = excluded.summary,
                        importance = excluded.importance,
                        kind = excluded.kind,
                        tags_json = excluded.tags_json,
                        source = excluded.source,
                        updated_at = excluded.updated_at
                    ",
                    params![
                        fingerprint,
                        session_id,
                        avatar,
                        file_name,
                        owner_key,
                        format!("{}::{}", session_id, content_text.to_lowercase()),
                        content_text,
                        summary,
                        importance,
                        domain,
                        tags_json,
                        created_at as i64,
                        now
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
    } else {
        let fingerprint = format!("{}::{}", session_id, content_text.to_lowercase());
        transaction
            .execute(
                "DELETE FROM narrative_memories WHERE fingerprint = ?1",
                params![fingerprint],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

fn simple_hash(value: &str) -> u64 {
    let mut hash = 1469598103934665603u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1099511628211);
    }
    hash
}
