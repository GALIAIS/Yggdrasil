use serde_json::{json, Value};

use crate::schemas::{response_format_for_schema, StructuredSchemaId};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NarrativeTaskKind {
    ChatReply,
    DraftAssist,
    RetrievalQueryRewrite,
    StructuredStateUpdate,
    SummarizeMemory,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NarrativeProviderKind {
    Kobold,
    KoboldHorde,
    Novel,
    OpenAi,
    TextGenerationWebUi,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NarrativeTaskRoute {
    pub chat_completion_source: Option<String>,
    pub frequency_penalty: Option<f64>,
    pub max_tokens: i64,
    pub model: String,
    pub presence_penalty: Option<f64>,
    pub provider: NarrativeProviderKind,
    pub reasoning_effort: Option<String>,
    pub repetition_penalty: Option<f64>,
    pub structured_output_schema_id: Option<StructuredSchemaId>,
    pub temperature: f64,
    pub top_p: f64,
}

impl NarrativeTaskRoute {
    pub fn openai_response_format(&self) -> Option<Value> {
        self.structured_output_schema_id
            .map(response_format_for_schema)
    }
}

pub fn resolve_task_route(
    settings: &Value,
    task_kind: NarrativeTaskKind,
    schema_id: Option<StructuredSchemaId>,
) -> Result<NarrativeTaskRoute, String> {
    let provider = match setting_string(settings, &[&["main_api"]]).as_deref() {
        Some("textgenerationwebui") => NarrativeProviderKind::TextGenerationWebUi,
        Some("novel") => NarrativeProviderKind::Novel,
        Some("kobold") => NarrativeProviderKind::Kobold,
        Some("koboldhorde") => NarrativeProviderKind::KoboldHorde,
        _ => NarrativeProviderKind::OpenAi,
    };

    let route = match provider {
        NarrativeProviderKind::OpenAi => NarrativeTaskRoute {
            chat_completion_source: Some(
                setting_string(
                    settings,
                    &[
                        &["chat_completion_source"],
                        &["oai_settings", "chat_completion_source"],
                    ],
                )
                .unwrap_or_else(|| "openai".to_string()),
            ),
            frequency_penalty: Some(
                setting_number(
                    settings,
                    &[&["freq_pen_openai"], &["oai_settings", "freq_pen_openai"]],
                )
                .unwrap_or(0.0),
            ),
            max_tokens: setting_integer(
                settings,
                &[
                    &["openai_max_tokens"],
                    &["oai_settings", "openai_max_tokens"],
                ],
            )
            .unwrap_or(default_max_tokens(task_kind)),
            model: resolve_openai_model(settings),
            presence_penalty: Some(
                setting_number(
                    settings,
                    &[&["pres_pen_openai"], &["oai_settings", "pres_pen_openai"]],
                )
                .unwrap_or(0.0),
            ),
            provider,
            reasoning_effort: resolve_reasoning_effort(settings),
            repetition_penalty: None,
            structured_output_schema_id: schema_id,
            temperature: setting_number(
                settings,
                &[&["temp_openai"], &["oai_settings", "temp_openai"]],
            )
            .unwrap_or(default_temperature(task_kind)),
            top_p: setting_number(
                settings,
                &[&["top_p_openai"], &["oai_settings", "top_p_openai"]],
            )
            .unwrap_or(1.0),
        },
        NarrativeProviderKind::TextGenerationWebUi => NarrativeTaskRoute {
            chat_completion_source: None,
            frequency_penalty: Some(
                setting_number(settings, &[&["textgenerationwebui_settings", "freq_pen"]])
                    .unwrap_or(0.0),
            ),
            max_tokens: setting_integer(settings, &[&["amount_gen"]])
                .unwrap_or(default_max_tokens(task_kind)),
            model: resolve_textgen_model(settings),
            presence_penalty: Some(
                setting_number(
                    settings,
                    &[&["textgenerationwebui_settings", "presence_pen"]],
                )
                .unwrap_or(0.0),
            ),
            provider,
            reasoning_effort: None,
            repetition_penalty: Some(
                setting_number(settings, &[&["textgenerationwebui_settings", "rep_pen"]])
                    .unwrap_or(1.2),
            ),
            structured_output_schema_id: schema_id,
            temperature: setting_number(settings, &[&["textgenerationwebui_settings", "temp"]])
                .unwrap_or(default_temperature(task_kind)),
            top_p: setting_number(settings, &[&["textgenerationwebui_settings", "top_p"]])
                .unwrap_or(0.95),
        },
        NarrativeProviderKind::Novel => NarrativeTaskRoute {
            chat_completion_source: None,
            frequency_penalty: Some(
                setting_number(
                    settings,
                    &[&["nai_settings", "repetition_penalty_frequency"]],
                )
                .unwrap_or(0.0),
            ),
            max_tokens: setting_integer(settings, &[&["amount_gen"]])
                .unwrap_or(default_max_tokens(task_kind)),
            model: setting_string(settings, &[&["nai_settings", "model_novel"]])
                .unwrap_or_default(),
            presence_penalty: Some(
                setting_number(
                    settings,
                    &[&["nai_settings", "repetition_penalty_presence"]],
                )
                .unwrap_or(0.0),
            ),
            provider,
            reasoning_effort: None,
            repetition_penalty: Some(
                setting_number(settings, &[&["nai_settings", "repetition_penalty"]])
                    .unwrap_or(2.25),
            ),
            structured_output_schema_id: schema_id,
            temperature: setting_number(settings, &[&["nai_settings", "temperature"]])
                .unwrap_or(default_temperature(task_kind)),
            top_p: setting_number(settings, &[&["nai_settings", "top_p"]]).unwrap_or(0.75),
        },
        NarrativeProviderKind::Kobold | NarrativeProviderKind::KoboldHorde => NarrativeTaskRoute {
            chat_completion_source: None,
            frequency_penalty: None,
            max_tokens: setting_integer(settings, &[&["amount_gen"]])
                .unwrap_or(default_max_tokens(task_kind)),
            model: setting_string(settings, &[&["preset_settings"]]).unwrap_or_default(),
            presence_penalty: None,
            provider,
            reasoning_effort: None,
            repetition_penalty: Some(
                setting_number(settings, &[&["kai_settings", "rep_pen"]]).unwrap_or(1.1),
            ),
            structured_output_schema_id: schema_id,
            temperature: setting_number(settings, &[&["kai_settings", "temp"]])
                .unwrap_or(default_temperature(task_kind)),
            top_p: setting_number(settings, &[&["kai_settings", "top_p"]]).unwrap_or(0.95),
        },
    };

    Ok(route)
}

pub fn build_openai_chat_body(messages: &[Value], route: &NarrativeTaskRoute) -> Value {
    build_openai_chat_body_with_stream(messages, route, false)
}

pub fn build_openai_chat_body_with_stream(
    messages: &[Value],
    route: &NarrativeTaskRoute,
    stream: bool,
) -> Value {
    let mut body = json!({
        "messages": messages,
        "model": route.model,
        "temperature": route.temperature,
        "top_p": route.top_p,
        "max_tokens": route.max_tokens,
        "stream": stream,
    });

    if let Some(frequency_penalty) = route.frequency_penalty {
        body["frequency_penalty"] = json!(frequency_penalty);
    }

    if let Some(presence_penalty) = route.presence_penalty {
        body["presence_penalty"] = json!(presence_penalty);
    }

    if let Some(response_format) = route.openai_response_format() {
        body["response_format"] = response_format;
    }

    if let Some(reasoning_effort) = route.reasoning_effort.as_deref() {
        body["reasoning_effort"] = json!(reasoning_effort);
    }

    body
}

fn default_max_tokens(task_kind: NarrativeTaskKind) -> i64 {
    match task_kind {
        NarrativeTaskKind::SummarizeMemory => 512,
        NarrativeTaskKind::StructuredStateUpdate => 512,
        NarrativeTaskKind::RetrievalQueryRewrite => 192,
        NarrativeTaskKind::DraftAssist => 768,
        NarrativeTaskKind::ChatReply => 768,
    }
}

fn default_temperature(task_kind: NarrativeTaskKind) -> f64 {
    match task_kind {
        NarrativeTaskKind::SummarizeMemory => 0.2,
        NarrativeTaskKind::StructuredStateUpdate => 0.2,
        NarrativeTaskKind::RetrievalQueryRewrite => 0.1,
        NarrativeTaskKind::DraftAssist => 0.7,
        NarrativeTaskKind::ChatReply => 0.8,
    }
}

fn resolve_textgen_model(settings: &Value) -> String {
    let textgen_type = setting_string(settings, &[&["textgenerationwebui_settings", "type"]])
        .unwrap_or_else(|| "ooba".to_string());

    let candidates: &[&[&str]] = match textgen_type.as_str() {
        "generic" => &[&["textgenerationwebui_settings", "generic_model"]],
        "mancer" => &[&["textgenerationwebui_settings", "mancer_model"]],
        "vllm" => &[&["textgenerationwebui_settings", "vllm_model"]],
        "aphrodite" => &[&["textgenerationwebui_settings", "aphrodite_model"]],
        "tabby" => &[&["textgenerationwebui_settings", "tabby_model"]],
        "togetherai" => &[&["textgenerationwebui_settings", "togetherai_model"]],
        "llamacpp" => &[&["textgenerationwebui_settings", "llamacpp_model"]],
        "ollama" => &[&["textgenerationwebui_settings", "ollama_model"]],
        "infermaticai" => &[&["textgenerationwebui_settings", "infermaticai_model"]],
        "dreamgen" => &[&["textgenerationwebui_settings", "dreamgen_model"]],
        "openrouter" => &[&["textgenerationwebui_settings", "openrouter_model"]],
        "featherless" => &[&["textgenerationwebui_settings", "featherless_model"]],
        _ => &[&["textgenerationwebui_settings", "custom_model"]],
    };

    setting_string(settings, candidates).unwrap_or_default()
}

fn resolve_openai_model(settings: &Value) -> String {
    let source = setting_string(
        settings,
        &[
            &["chat_completion_source"],
            &["oai_settings", "chat_completion_source"],
        ],
    )
    .unwrap_or_else(|| "openai".to_string());

    let candidates: &[&[&str]] = if source == "azure_openai" {
        &[
            &["azure_openai_model"],
            &["oai_settings", "azure_openai_model"],
            &["openai_model"],
            &["oai_settings", "openai_model"],
        ]
    } else {
        &[&["openai_model"], &["oai_settings", "openai_model"]]
    };

    setting_string(settings, candidates).unwrap_or_default()
}

fn resolve_reasoning_effort(settings: &Value) -> Option<String> {
    let value = setting_string(
        settings,
        &[
            &["reasoning_effort_openai"],
            &["oai_settings", "reasoning_effort_openai"],
        ],
    )?;

    match value.trim() {
        "low" | "medium" | "high" => Some(value.trim().to_string()),
        _ => None,
    }
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

fn setting_number(value: &Value, paths: &[&[&str]]) -> Option<f64> {
    for path in paths {
        if let Some(result) = value_at_path(value, path) {
            match result {
                Value::Number(number) => return number.as_f64(),
                Value::String(text) => {
                    if let Ok(parsed) = text.parse::<f64>() {
                        return Some(parsed);
                    }
                }
                _ => {}
            }
        }
    }
    None
}

fn setting_integer(value: &Value, paths: &[&[&str]]) -> Option<i64> {
    setting_number(value, paths).map(|number| number.round() as i64)
}

fn value_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    Some(current)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_openai_route_from_provider_specific_fields() {
        let settings = json!({
            "main_api": "openai",
            "openai_model": "gpt-4.1-mini",
            "chat_completion_source": "custom",
            "temp_openai": 0.55,
            "top_p_openai": 0.91,
            "freq_pen_openai": 0.35,
            "pres_pen_openai": 0.12,
            "openai_max_tokens": 1024
        });

        let route = resolve_task_route(
            &settings,
            NarrativeTaskKind::ChatReply,
            Some(StructuredSchemaId::StorySuggestion),
        )
        .expect("route should resolve");

        assert_eq!(route.provider, NarrativeProviderKind::OpenAi);
        assert_eq!(route.model, "gpt-4.1-mini");
        assert_eq!(route.chat_completion_source.as_deref(), Some("custom"));
        assert_eq!(route.temperature, 0.55);
        assert_eq!(route.top_p, 0.91);
        assert_eq!(route.frequency_penalty, Some(0.35));
        assert_eq!(route.presence_penalty, Some(0.12));
        assert_eq!(route.max_tokens, 1024);
        assert_eq!(
            route.structured_output_schema_id,
            Some(StructuredSchemaId::StorySuggestion)
        );
    }

    #[test]
    fn resolves_azure_openai_model_before_generic_openai_model() {
        let settings = json!({
            "main_api": "openai",
            "chat_completion_source": "azure_openai",
            "openai_model": "fallback-openai-model",
            "azure_openai_model": "azure-deployment-model",
            "openai_max_tokens": 900
        });

        let route = resolve_task_route(&settings, NarrativeTaskKind::ChatReply, None)
            .expect("azure route should resolve");

        assert_eq!(route.provider, NarrativeProviderKind::OpenAi);
        assert_eq!(
            route.chat_completion_source.as_deref(),
            Some("azure_openai")
        );
        assert_eq!(route.model, "azure-deployment-model");
        assert_eq!(route.max_tokens, 900);
    }

    #[test]
    fn resolves_textgen_route_from_nested_settings() {
        let settings = json!({
            "main_api": "textgenerationwebui",
            "amount_gen": 768,
            "textgenerationwebui_settings": {
                "type": "openrouter",
                "openrouter_model": "openrouter/auto",
                "temp": 0.73,
                "top_p": 0.88,
                "rep_pen": 1.27,
                "freq_pen": 0.14,
                "presence_pen": 0.09
            }
        });

        let route = resolve_task_route(&settings, NarrativeTaskKind::DraftAssist, None)
            .expect("route should resolve");

        assert_eq!(route.provider, NarrativeProviderKind::TextGenerationWebUi);
        assert_eq!(route.model, "openrouter/auto");
        assert_eq!(route.temperature, 0.73);
        assert_eq!(route.top_p, 0.88);
        assert_eq!(route.repetition_penalty, Some(1.27));
        assert_eq!(route.frequency_penalty, Some(0.14));
        assert_eq!(route.presence_penalty, Some(0.09));
        assert_eq!(route.max_tokens, 768);
    }

    #[test]
    fn resolves_novel_and_kobold_routes() {
        let novel_settings = json!({
            "main_api": "novel",
            "amount_gen": 640,
            "nai_settings": {
                "model_novel": "kayra-v1",
                "temperature": 1.3,
                "top_p": 0.74,
                "repetition_penalty": 2.1,
                "repetition_penalty_frequency": 0.0,
                "repetition_penalty_presence": 0.01
            }
        });

        let kobold_settings = json!({
            "main_api": "kobold",
            "amount_gen": 420,
            "preset_settings": "kobold-preset",
            "kai_settings": {
                "temp": 0.84,
                "top_p": 0.93,
                "rep_pen": 1.16
            }
        });

        let novel_route = resolve_task_route(&novel_settings, NarrativeTaskKind::ChatReply, None)
            .expect("novel route should resolve");
        let kobold_route = resolve_task_route(&kobold_settings, NarrativeTaskKind::ChatReply, None)
            .expect("kobold route should resolve");

        assert_eq!(novel_route.provider, NarrativeProviderKind::Novel);
        assert_eq!(novel_route.model, "kayra-v1");
        assert_eq!(novel_route.temperature, 1.3);
        assert_eq!(novel_route.top_p, 0.74);
        assert_eq!(novel_route.repetition_penalty, Some(2.1));

        assert_eq!(kobold_route.provider, NarrativeProviderKind::Kobold);
        assert_eq!(kobold_route.model, "kobold-preset");
        assert_eq!(kobold_route.temperature, 0.84);
        assert_eq!(kobold_route.top_p, 0.93);
        assert_eq!(kobold_route.repetition_penalty, Some(1.16));
    }

    #[test]
    fn builds_openai_body_with_structured_output() {
        let route = NarrativeTaskRoute {
            chat_completion_source: Some("custom".to_string()),
            frequency_penalty: Some(0.4),
            max_tokens: 512,
            model: "gpt-4.1-mini".to_string(),
            presence_penalty: Some(0.1),
            provider: NarrativeProviderKind::OpenAi,
            reasoning_effort: None,
            repetition_penalty: None,
            structured_output_schema_id: Some(StructuredSchemaId::MemoryExtraction),
            temperature: 0.3,
            top_p: 0.9,
        };

        let body = build_openai_chat_body(&[json!({"role": "user", "content": "ping"})], &route);
        assert_eq!(body["model"], "gpt-4.1-mini");
        assert_eq!(body["temperature"], 0.3);
        assert_eq!(body["top_p"], 0.9);
        assert_eq!(body["max_tokens"], 512);
        assert_eq!(body["response_format"]["type"], "json_schema");
        assert_eq!(
            body["response_format"]["json_schema"]["name"],
            "memory_extraction"
        );
    }
}
