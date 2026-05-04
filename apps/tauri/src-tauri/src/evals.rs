use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::TraceEntryRecord;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EvalRunEntry {
    pub id: String,
    pub avatar_url: Option<String>,
    pub file_name: Option<String>,
    pub character_name: String,
    pub overall_score: f64,
    pub setting_consistency: f64,
    pub memory_hit_rate: f64,
    pub state_update_correctness: f64,
    pub reply_continuity: f64,
    pub notes: Vec<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

pub struct LocalEvalInput {
    pub avatar_url: Option<String>,
    pub file_name: Option<String>,
    pub character_name: Option<String>,
    pub messages: Vec<Value>,
    pub traces: Vec<TraceEntryRecord>,
    pub has_world_state: bool,
}

pub fn evaluate_local_session(input: LocalEvalInput, now_ms: u64) -> EvalRunEntry {
    let latest_trace = input.traces.first();
    let stats = latest_trace
        .and_then(|trace| trace.request_payload.as_deref())
        .map(parse_prompt_context_stats)
        .unwrap_or_default();
    let assistant_reply = extract_latest_assistant_reply(&input.messages);
    let assistant_length = assistant_reply.chars().count();
    let setting_consistency = score_setting_consistency(
        latest_trace.and_then(|trace| trace.error_text.as_deref()),
        &stats,
        stats.lorebook_snippets,
        assistant_length,
    );
    let memory_hit_rate = score_memory_hit_rate(&stats, input.messages.len());
    let state_update_correctness =
        score_state_update_correctness(input.has_world_state, &stats, &input.traces);
    let reply_continuity = score_reply_continuity(&assistant_reply, input.messages.len());
    let overall_score = round_score(
        (setting_consistency + memory_hit_rate + state_update_correctness + reply_continuity) / 4.0,
    );
    let character_name = input
        .character_name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Unknown".to_string());

    let mut notes = Vec::new();
    notes.push(format!(
        "Setting consistency {} / 100: {} character snippets, {} directive snippets, {} lorebook hits, latest reply {} chars.",
        format_score(setting_consistency),
        stats.character_snippets,
        stats.directive_snippets,
        stats.lorebook_snippets,
        assistant_length
    ));
    notes.push(format!(
        "Memory hit rate {} / 100: {} narrative memories, {} retrieval hits, {} session snippets, {} directive snippets.",
        format_score(memory_hit_rate),
        stats.narrative_memories,
        stats.retrieval_hits,
        stats.session_snippets,
        stats.directive_snippets
    ));
    notes.push(format!(
        "State update correctness {} / 100: world state snapshot {}, {} structured state traces, retrieval query rewritten {}.",
        format_score(state_update_correctness),
        if input.has_world_state { "available" } else { "missing" },
        count_structured_state_traces(&input.traces),
        if stats.original_query_rewritten { "yes" } else { "no" }
    ));
    notes.push(format!(
        "Reply continuity {} / 100: {} visible messages, lexical variety {}, prompt cache {}.",
        format_score(reply_continuity),
        input.messages.len(),
        format_score(unique_token_ratio(&assistant_reply) * 100.0),
        stats.prompt_cache_status.as_deref().unwrap_or("unknown")
    ));

    EvalRunEntry {
        id: format!(
            "eval-{}-{}",
            now_ms,
            sanitize_id_fragment(input.file_name.as_deref().unwrap_or("session"))
        ),
        avatar_url: input.avatar_url,
        file_name: input.file_name,
        character_name,
        overall_score,
        setting_consistency,
        memory_hit_rate,
        state_update_correctness,
        reply_continuity,
        notes,
        created_at: now_ms,
        updated_at: now_ms,
    }
}

#[derive(Default)]
struct PromptContextStats {
    character_snippets: usize,
    directive_snippets: usize,
    lorebook_snippets: usize,
    narrative_memories: usize,
    original_query_rewritten: bool,
    prompt_cache_hit: bool,
    prompt_cache_status: Option<String>,
    retrieval_hits: usize,
    session_snippets: usize,
}

fn parse_prompt_context_stats(payload: &str) -> PromptContextStats {
    let parsed = match serde_json::from_str::<Value>(payload) {
        Ok(value) => value,
        Err(_) => return PromptContextStats::default(),
    };
    let generation_context = parsed
        .get("_trace_context")
        .and_then(|value| value.get("generationContext"))
        .cloned()
        .or_else(|| parsed.get("generationContext").cloned())
        .unwrap_or(Value::Null);

    PromptContextStats {
        character_snippets: count_array(generation_context.get("characterSnippets")),
        directive_snippets: count_array(generation_context.get("directiveSnippets")),
        lorebook_snippets: count_array(generation_context.get("lorebookSnippets")),
        narrative_memories: count_array(generation_context.get("narrativeMemories")),
        original_query_rewritten: generation_context
            .get("originalQuery")
            .and_then(Value::as_str)
            .map(str::trim)
            .zip(
                generation_context
                    .get("query")
                    .and_then(Value::as_str)
                    .map(str::trim),
            )
            .map(|(original, rewritten)| {
                !original.is_empty() && !rewritten.is_empty() && original != rewritten
            })
            .unwrap_or(false),
        prompt_cache_hit: parsed
            .get("_trace_context")
            .and_then(|value| value.get("promptCache"))
            .and_then(|value| value.get("status"))
            .and_then(Value::as_str)
            .map(|status| status.eq_ignore_ascii_case("hit"))
            .unwrap_or(false),
        prompt_cache_status: parsed
            .get("_trace_context")
            .and_then(|value| value.get("promptCache"))
            .and_then(|value| value.get("status"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        retrieval_hits: count_array(generation_context.get("retrievalHits")),
        session_snippets: count_array(generation_context.get("sessionSnippets")),
    }
}

fn extract_latest_assistant_reply(messages: &[Value]) -> String {
    for message in messages.iter().rev() {
        let is_user = message
            .get("is_user")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let is_system = message
            .get("is_system")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if is_user || is_system {
            continue;
        }

        if let Some(text) = message.get("mes").and_then(Value::as_str) {
            if !text.trim().is_empty() {
                return text.trim().to_string();
            }
        }
    }

    String::new()
}

fn score_setting_consistency(
    error_text: Option<&str>,
    stats: &PromptContextStats,
    lorebook_snippets: usize,
    assistant_length: usize,
) -> f64 {
    let mut score = 48.0;
    if error_text.is_none() {
        score += 18.0;
    }
    if stats.character_snippets > 0 {
        score += 18.0;
    }
    if stats.directive_snippets > 0 {
        score += 6.0;
    }
    if lorebook_snippets > 0 {
        score += 10.0;
    }
    if stats.prompt_cache_hit {
        score += 4.0;
    }
    if assistant_length >= 120 {
        score += 8.0;
    } else if assistant_length >= 40 {
        score += 4.0;
    }
    round_score(score)
}

fn score_memory_hit_rate(stats: &PromptContextStats, message_count: usize) -> f64 {
    let contextual_hits = stats.narrative_memories * 24
        + stats.retrieval_hits * 20
        + stats.session_snippets * 12
        + stats.character_snippets * 10
        + stats.directive_snippets * 8
        + stats.lorebook_snippets * 8;
    let baseline = if message_count >= 12 {
        24
    } else if message_count >= 4 {
        16
    } else {
        8
    };
    round_score((baseline + contextual_hits).min(100) as f64)
}

fn score_state_update_correctness(
    has_world_state: bool,
    stats: &PromptContextStats,
    traces: &[TraceEntryRecord],
) -> f64 {
    let structured_updates = count_structured_state_traces(traces);
    let mut score = if has_world_state { 72.0 } else { 50.0 };
    if stats.lorebook_snippets > 0 {
        score += 12.0;
    }
    if stats.original_query_rewritten {
        score += 4.0;
    }
    if structured_updates > 0 {
        score += 16.0;
    }
    round_score(score)
}

fn score_reply_continuity(reply: &str, message_count: usize) -> f64 {
    if reply.trim().is_empty() {
        return 0.0;
    }

    let length_score = (reply.chars().count().min(320) as f64 / 320.0) * 42.0;
    let history_score = if message_count >= 10 {
        24.0
    } else if message_count >= 4 {
        16.0
    } else {
        8.0
    };
    let variety_score = unique_token_ratio(reply) * 34.0;

    round_score(length_score + history_score + variety_score)
}

fn unique_token_ratio(text: &str) -> f64 {
    let tokens: Vec<String> = text
        .split_whitespace()
        .map(|item| {
            item.trim_matches(|ch: char| !ch.is_alphanumeric())
                .to_lowercase()
        })
        .filter(|item| !item.is_empty())
        .collect();
    if tokens.is_empty() {
        return 0.0;
    }

    let mut unique = std::collections::BTreeSet::new();
    for token in &tokens {
        unique.insert(token.clone());
    }

    (unique.len() as f64 / tokens.len() as f64).clamp(0.0, 1.0)
}

fn count_structured_state_traces(traces: &[TraceEntryRecord]) -> usize {
    traces
        .iter()
        .filter(|trace| {
            trace
                .request_payload
                .as_deref()
                .map(|payload| payload.contains("world_state_update"))
                .unwrap_or(false)
        })
        .count()
}

fn count_array(value: Option<&Value>) -> usize {
    value
        .and_then(Value::as_array)
        .map(|items| items.len())
        .unwrap_or(0)
}

fn round_score(value: f64) -> f64 {
    value.clamp(0.0, 100.0).round()
}

fn format_score(value: f64) -> String {
    format!("{value:.0}")
}

fn sanitize_id_fragment(value: &str) -> String {
    let fragment: String = value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect();
    fragment.trim_matches('-').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_prompt_context_stats_reads_prompt_cache_and_query_rewrite() {
        let payload = json!({
            "_trace_context": {
                "generationContext": {
                    "characterSnippets": [{ "characterName": "爱尔奎特" }],
                    "directiveSnippets": [{ "label": "System", "sourceName": "Preset", "content": "保持月姬风格" }],
                    "lorebookSnippets": [{ "bookName": "月姬世界观设定" }],
                    "narrativeMemories": [{ "id": "mem-1" }],
                    "retrievalHits": [{ "domain": "world", "hitId": "月姬世界观设定", "score": 0.91 }],
                    "sessionSnippets": [{ "role": "assistant", "ordinal": 4, "content": "……" }],
                    "originalQuery": "爱尔奎特昨晚说过什么",
                    "query": "爱尔奎特 月夜 诺言"
                },
                "promptCache": {
                    "status": "hit"
                }
            }
        })
        .to_string();

        let stats = parse_prompt_context_stats(&payload);
        assert_eq!(stats.character_snippets, 1);
        assert_eq!(stats.directive_snippets, 1);
        assert_eq!(stats.lorebook_snippets, 1);
        assert_eq!(stats.narrative_memories, 1);
        assert_eq!(stats.retrieval_hits, 1);
        assert_eq!(stats.session_snippets, 1);
        assert!(stats.original_query_rewritten);
        assert!(stats.prompt_cache_hit);
        assert_eq!(stats.prompt_cache_status.as_deref(), Some("hit"));
    }

    #[test]
    fn evaluate_local_session_notes_include_rewrite_and_prompt_cache() {
        let trace = TraceEntryRecord {
            avatar_url: Some("assets/arcueid.png".to_string()),
            character_name: "爱尔奎特·布伦史塔德".to_string(),
            created_at: 1,
            duration_ms: Some(320),
            error_text: None,
            file_name: Some("tsukihime.jsonl".to_string()),
            id: "trace-1".to_string(),
            model: Some("model-a".to_string()),
            prompt_text: Some("你会如何回应？".to_string()),
            provider: "openai".to_string(),
            request_payload: Some(
                json!({
                    "_trace_context": {
                        "generationContext": {
                            "characterSnippets": [{ "characterName": "爱尔奎特" }],
                            "directiveSnippets": [{ "label": "System", "sourceName": "Preset", "content": "保持克制与神秘感" }],
                            "lorebookSnippets": [{ "bookName": "月姬世界观设定" }],
                            "narrativeMemories": [{ "id": "memory-1" }],
                            "retrievalHits": [{ "domain": "memory", "hitId": "memory-1", "score": 0.94 }],
                            "sessionSnippets": [{ "role": "user", "ordinal": 7, "content": "昨晚的月色真美。" }],
                            "originalQuery": "爱尔奎特还记得昨晚的约定吗",
                            "query": "爱尔奎特 月夜 约定"
                        },
                        "promptCache": {
                            "status": "hit"
                        }
                    }
                })
                .to_string(),
            ),
            response_text: Some("她抬起视线，像是在月光边缘回忆起你们昨夜的低语。".to_string()),
            session_id: Some("session-1".to_string()),
            token_count: Some(256),
        };

        let result = evaluate_local_session(
            LocalEvalInput {
                avatar_url: Some("assets/arcueid.png".to_string()),
                character_name: Some("爱尔奎特·布伦史塔德".to_string()),
                file_name: Some("tsukihime.jsonl".to_string()),
                has_world_state: true,
                messages: vec![
                    json!({ "is_user": true, "mes": "昨晚的月色真美。" }),
                    json!({ "is_user": false, "mes": "她抬起视线，像是在月光边缘回忆起你们昨夜的低语。" }),
                ],
                traces: vec![trace],
            },
            42,
        );

        assert!(result.setting_consistency >= 90.0);
        assert!(result.memory_hit_rate >= 90.0);
        assert!(result
            .notes
            .iter()
            .any(|note| note.contains("retrieval query rewritten yes")));
        assert!(result
            .notes
            .iter()
            .any(|note| note.contains("prompt cache hit")));
    }
}
