use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};

use crate::narrative::NarrativeTaskRoute;

pub const OPENAI_CHAT_COMPLETIONS: &str = "openai_chat_completions";
pub const OPENAI_RESPONSES: &str = "openai_responses";
pub const OPENAI_RESPONSES_COMPACT: &str = "openai_responses_compact";
pub const ANTHROPIC_MESSAGES: &str = "anthropic_messages";
pub const GEMINI_GENERATE_CONTENT: &str = "gemini_generate_content";
pub const OPENAI_EMBEDDINGS: &str = "openai_embeddings";
pub const OLLAMA_CHAT: &str = "ollama_chat";
pub const OLLAMA_EMBEDDINGS: &str = "ollama_embeddings";
pub const JINA_RERANK: &str = "jina_rerank";
pub const OPENAI_IMAGE_GENERATIONS: &str = "openai_image_generations";

#[derive(Clone, Debug)]
pub struct ProviderProtocolConfig<'a> {
    pub api_key: &'a str,
    pub api_version: Option<&'a str>,
    pub base_url: &'a str,
    pub deployment_name: Option<&'a str>,
    pub provider_type: &'a str,
    pub protocol: &'a str,
}

#[derive(Clone, Debug)]
pub struct ProtocolRequest {
    pub endpoint: String,
    pub headers: HeaderMap,
    pub body: Value,
    pub protocol: String,
}

pub fn normalize_provider_protocol(protocol: Option<&str>, provider_type: &str) -> String {
    let normalized = protocol
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
        .replace('-', "_");
    match normalized.as_str() {
        OPENAI_CHAT_COMPLETIONS
        | OPENAI_RESPONSES
        | OPENAI_RESPONSES_COMPACT
        | ANTHROPIC_MESSAGES
        | GEMINI_GENERATE_CONTENT
        | OPENAI_EMBEDDINGS
        | OLLAMA_CHAT
        | OLLAMA_EMBEDDINGS
        | JINA_RERANK
        | OPENAI_IMAGE_GENERATIONS => normalized,
        "" => default_protocol_for_provider_type(provider_type).to_string(),
        _ => default_protocol_for_provider_type(provider_type).to_string(),
    }
}

pub fn format_provider_protocol_label(protocol: &str) -> String {
    let normalized = protocol.trim().trim_matches('"');
    match normalized {
        OPENAI_CHAT_COMPLETIONS => "OpenAI Chat Completions".to_string(),
        OPENAI_RESPONSES => "OpenAI Responses".to_string(),
        OPENAI_RESPONSES_COMPACT => "OpenAI Responses Compact".to_string(),
        ANTHROPIC_MESSAGES => "Anthropic Messages".to_string(),
        GEMINI_GENERATE_CONTENT => "Gemini Generate Content".to_string(),
        OPENAI_EMBEDDINGS => "OpenAI Embeddings".to_string(),
        OLLAMA_CHAT => "Ollama Chat".to_string(),
        OLLAMA_EMBEDDINGS => "Ollama Embeddings".to_string(),
        JINA_RERANK => "Jina Rerank".to_string(),
        OPENAI_IMAGE_GENERATIONS => "OpenAI Image Generations".to_string(),
        other => other
            .split(['_', '-'])
            .filter(|part| !part.is_empty())
            .map(|part| {
                let lower = part.to_ascii_lowercase();
                match lower.as_str() {
                    "openai" => "OpenAI".to_string(),
                    "api" => "API".to_string(),
                    "url" => "URL".to_string(),
                    "id" => "ID".to_string(),
                    _ => {
                        let mut chars = lower.chars();
                        match chars.next() {
                            Some(first) => {
                                format!("{}{}", first.to_ascii_uppercase(), chars.as_str())
                            }
                            None => String::new(),
                        }
                    }
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}

pub fn default_protocol_for_provider_type(provider_type: &str) -> &'static str {
    match provider_type.trim().to_ascii_lowercase().as_str() {
        "anthropic" => ANTHROPIC_MESSAGES,
        "gemini" | "google_gemini" => GEMINI_GENERATE_CONTENT,
        "jina" => JINA_RERANK,
        "lm_studio" => OPENAI_CHAT_COMPLETIONS,
        "ollama" => OLLAMA_CHAT,
        _ => OPENAI_CHAT_COMPLETIONS,
    }
}

pub fn protocol_supports_capability(protocol: &str, capability: &str) -> bool {
    match normalize_provider_protocol(Some(protocol), "").as_str() {
        OPENAI_CHAT_COMPLETIONS | OPENAI_RESPONSES | OPENAI_RESPONSES_COMPACT | OLLAMA_CHAT => {
            capability == "chat"
        }
        ANTHROPIC_MESSAGES | GEMINI_GENERATE_CONTENT => capability == "chat",
        OPENAI_EMBEDDINGS | OLLAMA_EMBEDDINGS => capability == "embedding",
        JINA_RERANK => capability == "rerank",
        OPENAI_IMAGE_GENERATIONS => capability == "image",
        _ => false,
    }
}

pub fn default_base_url(provider_type: &str, protocol: &str) -> &'static str {
    match provider_type.trim().to_ascii_lowercase().as_str() {
        "openrouter" => "https://openrouter.ai/api/v1",
        "anthropic" => "https://api.anthropic.com/v1",
        "gemini" | "google_gemini" => "https://generativelanguage.googleapis.com/v1beta",
        "jina" => "https://api.jina.ai/v1",
        "lm_studio" => "http://127.0.0.1:1234/v1",
        "ollama" => match normalize_provider_protocol(Some(protocol), provider_type).as_str() {
            OLLAMA_CHAT | OLLAMA_EMBEDDINGS => "http://127.0.0.1:11434",
            _ => "http://127.0.0.1:11434/v1",
        },
        "azure_openai" => "",
        _ => match normalize_provider_protocol(Some(protocol), provider_type).as_str() {
            ANTHROPIC_MESSAGES => "https://api.anthropic.com/v1",
            GEMINI_GENERATE_CONTENT => "https://generativelanguage.googleapis.com/v1beta",
            JINA_RERANK => "https://api.jina.ai/v1",
            _ => "https://api.openai.com/v1",
        },
    }
}

pub fn build_chat_request(
    config: &ProviderProtocolConfig<'_>,
    model: &str,
    messages: &[Value],
    route: &NarrativeTaskRoute,
    stream: bool,
) -> Result<ProtocolRequest, String> {
    let protocol = normalize_provider_protocol(Some(config.protocol), config.provider_type);
    match protocol.as_str() {
        OPENAI_CHAT_COMPLETIONS => {
            build_openai_chat_request(config, model, messages, route, stream)
        }
        OPENAI_RESPONSES => {
            build_openai_responses_request(config, model, messages, route, stream, false)
        }
        OPENAI_RESPONSES_COMPACT => {
            build_openai_responses_request(config, model, messages, route, stream, true)
        }
        OLLAMA_CHAT => build_ollama_chat_request(config, model, messages, route, stream),
        ANTHROPIC_MESSAGES => {
            build_anthropic_messages_request(config, model, messages, route, stream)
        }
        GEMINI_GENERATE_CONTENT => {
            build_gemini_generate_content_request(config, model, messages, route, stream)
        }
        _ => Err(format!(
            "{} 不支持 Chat 能力。",
            format_provider_protocol_label(&protocol)
        )),
    }
}

pub fn build_chat_probe_request(
    config: &ProviderProtocolConfig<'_>,
    model: &str,
) -> Result<ProtocolRequest, String> {
    let messages = vec![json!({ "role": "user", "content": "ping" })];
    let route = NarrativeTaskRoute {
        chat_completion_source: Some(config.provider_type.to_string()),
        frequency_penalty: None,
        max_tokens: 1,
        model: model.to_string(),
        presence_penalty: None,
        provider: crate::narrative::NarrativeProviderKind::OpenAi,
        reasoning_effort: None,
        repetition_penalty: None,
        structured_output_schema_id: None,
        temperature: 0.0,
        top_p: 1.0,
    };
    build_chat_request(config, model, &messages, &route, false)
}

pub fn build_embeddings_endpoint_and_headers(
    config: &ProviderProtocolConfig<'_>,
) -> Result<(String, HeaderMap), String> {
    let protocol = normalize_provider_protocol(Some(config.protocol), config.provider_type);
    let mut headers = json_headers();
    if protocol != OPENAI_EMBEDDINGS
        && protocol != OLLAMA_EMBEDDINGS
        && !matches!(
            config.provider_type,
            "openai" | "openrouter" | "custom" | "azure_openai" | "lm_studio"
        )
    {
        return Err(format!(
            "{} 不支持 Embedding 能力。",
            format_provider_protocol_label(&protocol)
        ));
    }

    if protocol == OLLAMA_EMBEDDINGS {
        let root = trim_trailing_slash_or_default(
            config.base_url,
            default_base_url(config.provider_type, OLLAMA_EMBEDDINGS),
        );
        if root.is_empty() {
            return Err("当前 Embedding 服务商缺少 Base URL。".to_string());
        }
        return Ok((format!("{root}/api/embed"), headers));
    }

    if config.provider_type.trim() == "azure_openai" {
        let key = require_api_key(config.api_key)?;
        let deployment = require_non_empty(
            config.deployment_name.unwrap_or_default(),
            "当前 Azure OpenAI 缺少 deployment name。",
        )?;
        let api_version = config
            .api_version
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("2024-10-21");
        let root = trim_trailing_slash(config.base_url);
        if root.is_empty() {
            return Err("当前 Azure OpenAI 缺少 Base URL。".to_string());
        }
        headers.insert("api-key", header_value(&key)?);
        return Ok((
            format!("{root}/openai/deployments/{deployment}/embeddings?api-version={api_version}"),
            headers,
        ));
    }

    let root = openai_compatible_root_or_default(
        config.base_url,
        default_base_url(config.provider_type, OPENAI_EMBEDDINGS),
    );
    if root.is_empty() {
        return Err("当前 Embedding 服务商缺少 Base URL。".to_string());
    }
    if !config.api_key.trim().is_empty() {
        headers.insert(AUTHORIZATION, bearer_header(config.api_key.trim())?);
    }
    maybe_openrouter_headers(config.provider_type, &mut headers);
    Ok((format!("{root}/embeddings"), headers))
}

pub fn build_models_endpoint_and_headers(
    config: &ProviderProtocolConfig<'_>,
    capability: &str,
) -> Result<(String, HeaderMap), String> {
    let protocol = normalize_provider_protocol(Some(config.protocol), config.provider_type);
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));

    match protocol.as_str() {
        OPENAI_CHAT_COMPLETIONS
        | OPENAI_RESPONSES
        | OPENAI_RESPONSES_COMPACT
        | OPENAI_EMBEDDINGS
        | OPENAI_IMAGE_GENERATIONS => {
            if config.provider_type.trim() == "azure_openai" {
                return Err(
                    "Azure OpenAI 暂不支持自动枚举 deployment，请手动填写模型。".to_string()
                );
            }
            if !config.api_key.trim().is_empty() {
                headers.insert(AUTHORIZATION, bearer_header(config.api_key.trim())?);
            }
            maybe_openrouter_headers(config.provider_type, &mut headers);
            let root = openai_compatible_root_or_default(
                config.base_url,
                default_base_url(config.provider_type, &protocol),
            );
            if root.is_empty() {
                return Err("当前服务商缺少 Base URL。".to_string());
            }
            Ok((format!("{root}/models"), headers))
        }
        OLLAMA_CHAT | OLLAMA_EMBEDDINGS => {
            let root = trim_trailing_slash_or_default(
                config.base_url,
                default_base_url(config.provider_type, &protocol),
            );
            if root.is_empty() {
                return Err("当前服务商缺少 Base URL。".to_string());
            }
            Ok((format!("{root}/api/tags"), headers))
        }
        ANTHROPIC_MESSAGES => {
            let root = trim_trailing_slash_or_default(
                config.base_url,
                default_base_url("anthropic", &protocol),
            );
            if !config.api_key.trim().is_empty() {
                headers.insert("x-api-key", header_value(config.api_key.trim())?);
            }
            headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
            Ok((format!("{root}/models"), headers))
        }
        GEMINI_GENERATE_CONTENT => {
            let root = trim_trailing_slash_or_default(
                config.base_url,
                default_base_url("gemini", &protocol),
            );
            if !config.api_key.trim().is_empty() {
                headers.insert("x-goog-api-key", header_value(config.api_key.trim())?);
            }
            Ok((format!("{root}/models"), headers))
        }
        JINA_RERANK => Err(format!(
            "{} 暂不支持自动枚举 {} 模型，请手动填写模型。",
            format_provider_protocol_label(&protocol),
            capability
        )),
        _ => Err(format!(
            "暂不支持的协议: {}",
            format_provider_protocol_label(&protocol)
        )),
    }
}

pub fn extract_chat_reply(protocol: &str, payload: &Value) -> String {
    match normalize_provider_protocol(Some(protocol), "").as_str() {
        OPENAI_RESPONSES | OPENAI_RESPONSES_COMPACT => extract_openai_responses_text(payload),
        ANTHROPIC_MESSAGES => extract_anthropic_text(payload),
        GEMINI_GENERATE_CONTENT => extract_gemini_text(payload),
        OLLAMA_CHAT => extract_ollama_chat_text(payload),
        _ => extract_openai_chat_text(payload),
    }
}

pub fn extract_stream_delta(protocol: &str, payload: &Value) -> String {
    match normalize_provider_protocol(Some(protocol), "").as_str() {
        OPENAI_RESPONSES | OPENAI_RESPONSES_COMPACT => payload
            .get("delta")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| extract_openai_responses_text(payload)),
        ANTHROPIC_MESSAGES => payload
            .get("delta")
            .and_then(|delta| delta.get("text"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| extract_anthropic_text(payload)),
        GEMINI_GENERATE_CONTENT => extract_gemini_text(payload),
        OLLAMA_CHAT => extract_ollama_chat_text(payload),
        _ => extract_openai_chat_text(payload),
    }
}

pub fn protocol_uses_sse(protocol: &str) -> bool {
    !matches!(
        normalize_provider_protocol(Some(protocol), "").as_str(),
        OLLAMA_CHAT
    )
}

fn build_openai_chat_request(
    config: &ProviderProtocolConfig<'_>,
    model: &str,
    messages: &[Value],
    route: &NarrativeTaskRoute,
    stream: bool,
) -> Result<ProtocolRequest, String> {
    let mut headers = json_headers();
    if config.provider_type.trim() == "azure_openai" {
        let key = require_api_key(config.api_key)?;
        let deployment = require_non_empty(
            config.deployment_name.unwrap_or_default(),
            "当前 Azure OpenAI 缺少 deployment name。",
        )?;
        let api_version = config
            .api_version
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("2024-10-21");
        let root = trim_trailing_slash(config.base_url);
        if root.is_empty() {
            return Err("当前 Azure OpenAI 缺少 Base URL。".to_string());
        }
        headers.insert("api-key", header_value(&key)?);
        return Ok(ProtocolRequest {
            endpoint: format!(
                "{root}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"
            ),
            headers,
            body: build_openai_chat_body(model, messages, route, stream),
            protocol: OPENAI_CHAT_COMPLETIONS.to_string(),
        });
    }

    if !config.api_key.trim().is_empty() {
        headers.insert(AUTHORIZATION, bearer_header(config.api_key.trim())?);
    }
    maybe_openrouter_headers(config.provider_type, &mut headers);
    let root = openai_compatible_root_or_default(
        config.base_url,
        default_base_url(config.provider_type, OPENAI_CHAT_COMPLETIONS),
    );
    if root.is_empty() {
        return Err("当前 Chat 服务商缺少 Base URL。".to_string());
    }
    Ok(ProtocolRequest {
        endpoint: format!("{root}/chat/completions"),
        headers,
        body: build_openai_chat_body(model, messages, route, stream),
        protocol: OPENAI_CHAT_COMPLETIONS.to_string(),
    })
}

fn build_openai_responses_request(
    config: &ProviderProtocolConfig<'_>,
    model: &str,
    messages: &[Value],
    route: &NarrativeTaskRoute,
    stream: bool,
    compact: bool,
) -> Result<ProtocolRequest, String> {
    let key = require_api_key(config.api_key)?;
    let mut headers = json_headers();
    headers.insert(AUTHORIZATION, bearer_header(&key)?);
    maybe_openrouter_headers(config.provider_type, &mut headers);
    let root = openai_compatible_root_or_default(
        config.base_url,
        default_base_url(config.provider_type, OPENAI_RESPONSES),
    );
    if root.is_empty() {
        return Err("当前 Responses 服务商缺少 Base URL。".to_string());
    }

    let mut body = json!({
        "model": model,
        "max_output_tokens": route.max_tokens,
        "temperature": route.temperature,
        "top_p": route.top_p,
        "stream": stream,
    });
    if compact {
        body["input"] = json!(messages_to_transcript(messages));
    } else {
        body["input"] = json!(messages_to_openai_responses_input(messages));
    }
    if let Some(reasoning_effort) = route.reasoning_effort.as_deref() {
        body["reasoning"] = json!({ "effort": reasoning_effort });
    }

    Ok(ProtocolRequest {
        endpoint: format!("{root}/responses"),
        headers,
        body,
        protocol: if compact {
            OPENAI_RESPONSES_COMPACT.to_string()
        } else {
            OPENAI_RESPONSES.to_string()
        },
    })
}

fn build_ollama_chat_request(
    config: &ProviderProtocolConfig<'_>,
    model: &str,
    messages: &[Value],
    route: &NarrativeTaskRoute,
    stream: bool,
) -> Result<ProtocolRequest, String> {
    let root =
        trim_trailing_slash_or_default(config.base_url, default_base_url(config.provider_type, OLLAMA_CHAT));
    if root.is_empty() {
        return Err("当前 Ollama 服务商缺少 Base URL。".to_string());
    }

    let mut headers = json_headers();
    if !config.api_key.trim().is_empty() {
        headers.insert(AUTHORIZATION, bearer_header(config.api_key.trim())?);
    }

    let mut options = serde_json::Map::new();
    options.insert("temperature".to_string(), json!(route.temperature));
    options.insert("top_p".to_string(), json!(route.top_p));
    options.insert("num_predict".to_string(), json!(route.max_tokens));
    if let Some(repetition_penalty) = route.repetition_penalty {
        options.insert("repeat_penalty".to_string(), json!(repetition_penalty));
    }
    if let Some(presence_penalty) = route.presence_penalty {
        options.insert("presence_penalty".to_string(), json!(presence_penalty));
    }
    if let Some(frequency_penalty) = route.frequency_penalty {
        options.insert("frequency_penalty".to_string(), json!(frequency_penalty));
    }

    let mut body = json!({
        "model": model,
        "messages": messages,
        "stream": stream,
    });
    if !options.is_empty() {
        body["options"] = Value::Object(options);
    }

    Ok(ProtocolRequest {
        endpoint: format!("{root}/api/chat"),
        headers,
        body,
        protocol: OLLAMA_CHAT.to_string(),
    })
}

fn build_anthropic_messages_request(
    config: &ProviderProtocolConfig<'_>,
    model: &str,
    messages: &[Value],
    route: &NarrativeTaskRoute,
    stream: bool,
) -> Result<ProtocolRequest, String> {
    let key = require_api_key(config.api_key)?;
    let mut headers = json_headers();
    headers.insert("x-api-key", header_value(&key)?);
    headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));

    let (system, anthropic_messages) = messages_to_anthropic(messages);
    let mut body = json!({
        "model": model,
        "messages": anthropic_messages,
        "max_tokens": route.max_tokens,
        "temperature": route.temperature,
        "top_p": route.top_p,
        "stream": stream,
    });
    if !system.trim().is_empty() {
        body["system"] = json!(system);
    }

    let root = trim_trailing_slash_or_default(
        config.base_url,
        default_base_url("anthropic", ANTHROPIC_MESSAGES),
    );
    Ok(ProtocolRequest {
        endpoint: format!("{root}/messages"),
        headers,
        body,
        protocol: ANTHROPIC_MESSAGES.to_string(),
    })
}

fn build_gemini_generate_content_request(
    config: &ProviderProtocolConfig<'_>,
    model: &str,
    messages: &[Value],
    route: &NarrativeTaskRoute,
    stream: bool,
) -> Result<ProtocolRequest, String> {
    let key = require_api_key(config.api_key)?;
    let mut headers = json_headers();
    headers.insert("x-goog-api-key", header_value(&key)?);
    let (system, contents) = messages_to_gemini(messages);
    let mut body = json!({
        "contents": contents,
        "generationConfig": {
            "temperature": route.temperature,
            "topP": route.top_p,
            "maxOutputTokens": route.max_tokens,
        },
    });
    if !system.trim().is_empty() {
        body["systemInstruction"] = json!({
            "parts": [{ "text": system }]
        });
    }

    let root = trim_trailing_slash_or_default(
        config.base_url,
        default_base_url("gemini", GEMINI_GENERATE_CONTENT),
    );
    let model_path = model.trim().trim_start_matches("models/");
    if model_path.is_empty() {
        return Err("当前 Gemini 协议缺少模型。".to_string());
    }
    let method = if stream {
        "streamGenerateContent?alt=sse"
    } else {
        "generateContent"
    };
    Ok(ProtocolRequest {
        endpoint: format!("{root}/models/{model_path}:{method}"),
        headers,
        body,
        protocol: GEMINI_GENERATE_CONTENT.to_string(),
    })
}

fn build_openai_chat_body(
    model: &str,
    messages: &[Value],
    route: &NarrativeTaskRoute,
    stream: bool,
) -> Value {
    let mut body = json!({
        "messages": messages,
        "model": model,
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

fn messages_to_openai_responses_input(messages: &[Value]) -> Vec<Value> {
    messages
        .iter()
        .filter_map(|message| {
            let role = message_role(message);
            let text = message_content_text(message);
            if text.trim().is_empty() {
                return None;
            }
            Some(json!({
                "role": if role == "assistant" { "assistant" } else { "user" },
                "content": text,
            }))
        })
        .collect()
}

fn messages_to_anthropic(messages: &[Value]) -> (String, Vec<Value>) {
    let mut system = Vec::new();
    let mut items = Vec::new();
    for message in messages {
        let role = message_role(message);
        let text = message_content_text(message);
        if text.trim().is_empty() {
            continue;
        }
        if role == "system" {
            system.push(text);
        } else {
            items.push(json!({
                "role": if role == "assistant" { "assistant" } else { "user" },
                "content": text,
            }));
        }
    }
    (
        system.join("\n\n"),
        merge_adjacent_role_messages(items, "user"),
    )
}

fn messages_to_gemini(messages: &[Value]) -> (String, Vec<Value>) {
    let mut system = Vec::new();
    let mut contents = Vec::new();
    for message in messages {
        let role = message_role(message);
        let text = message_content_text(message);
        if text.trim().is_empty() {
            continue;
        }
        if role == "system" {
            system.push(text);
        } else {
            contents.push(json!({
                "role": if role == "assistant" { "model" } else { "user" },
                "parts": [{ "text": text }],
            }));
        }
    }
    (system.join("\n\n"), contents)
}

fn merge_adjacent_role_messages(messages: Vec<Value>, fallback_role: &str) -> Vec<Value> {
    let mut merged: Vec<Value> = Vec::new();
    for message in messages {
        let role = message
            .get("role")
            .and_then(Value::as_str)
            .unwrap_or(fallback_role)
            .to_string();
        let content = message
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if let Some(last) = merged.last_mut() {
            if last.get("role").and_then(Value::as_str) == Some(role.as_str()) {
                let previous = last
                    .get("content")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                last["content"] = json!(format!("{previous}\n\n{content}"));
                continue;
            }
        }
        merged.push(json!({ "role": role, "content": content }));
    }
    merged
}

fn messages_to_transcript(messages: &[Value]) -> String {
    messages
        .iter()
        .filter_map(|message| {
            let role = message_role(message);
            let text = message_content_text(message);
            if text.trim().is_empty() {
                None
            } else {
                Some(format!("{role}: {text}"))
            }
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn message_role(message: &Value) -> String {
    message
        .get("role")
        .and_then(Value::as_str)
        .unwrap_or("user")
        .trim()
        .to_ascii_lowercase()
}

fn message_content_text(message: &Value) -> String {
    content_value_to_text(message.get("content").unwrap_or(&Value::Null))
}

fn content_value_to_text(value: &Value) -> String {
    if let Some(text) = value.as_str() {
        return text.to_string();
    }
    if let Some(items) = value.as_array() {
        return items
            .iter()
            .filter_map(|item| {
                if let Some(text) = item.as_str() {
                    return Some(text.to_string());
                }
                item.get("text")
                    .or_else(|| item.get("content"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
            })
            .collect::<Vec<_>>()
            .join("\n");
    }
    if let Some(text) = value.get("text").and_then(Value::as_str) {
        return text.to_string();
    }
    String::new()
}

fn extract_openai_chat_text(payload: &Value) -> String {
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
    payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("text"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .unwrap_or_default()
}

fn extract_ollama_chat_text(payload: &Value) -> String {
    payload
        .get("message")
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| {
            payload
                .get("response")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        })
        .unwrap_or_default()
}

fn extract_openai_responses_text(payload: &Value) -> String {
    if let Some(text) = payload.get("output_text").and_then(Value::as_str) {
        return text.to_string();
    }
    payload
        .get("output")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|item| {
            item.get("content")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter_map(|content| {
            content
                .get("text")
                .or_else(|| content.get("delta"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        })
        .collect::<Vec<_>>()
        .join("")
}

fn extract_anthropic_text(payload: &Value) -> String {
    payload
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|content| content.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("")
}

fn extract_gemini_text(payload: &Value) -> String {
    payload
        .get("candidates")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|candidate| {
            candidate
                .get("content")
                .and_then(|content| content.get("parts"))
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("")
}

fn json_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers
}

fn maybe_openrouter_headers(provider_type: &str, headers: &mut HeaderMap) {
    if provider_type.trim() == "openrouter" {
        headers.insert(
            "HTTP-Referer",
            HeaderValue::from_static("https://github.com/Yggdrasil/Yggdrasil"),
        );
        headers.insert("X-Title", HeaderValue::from_static("Yggdrasil"));
    }
}

fn require_api_key(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err("当前服务商缺少 API key。".to_string())
    } else {
        Ok(trimmed.to_string())
    }
}

fn require_non_empty(value: &str, message: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(message.to_string())
    } else {
        Ok(trimmed.to_string())
    }
}

fn header_value(value: &str) -> Result<HeaderValue, String> {
    HeaderValue::from_str(value).map_err(|error| error.to_string())
}

fn bearer_header(value: &str) -> Result<HeaderValue, String> {
    header_value(&format!("Bearer {value}"))
}

fn trim_trailing_slash(value: &str) -> String {
    value.trim().trim_end_matches('/').to_string()
}

fn trim_trailing_slash_or_default(value: &str, default: &str) -> String {
    if value.trim().is_empty() {
        trim_trailing_slash(default)
    } else {
        trim_trailing_slash(value)
    }
}

fn openai_compatible_root_or_default(value: &str, default: &str) -> String {
    let root = trim_trailing_slash_or_default(value, default);
    if root.is_empty() || root.ends_with("/v1") {
        root
    } else {
        format!("{root}/v1")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anthropic_extracts_content_blocks() {
        let payload = json!({
            "content": [
                { "type": "text", "text": "hello" },
                { "type": "text", "text": " world" }
            ]
        });
        assert_eq!(
            extract_chat_reply(ANTHROPIC_MESSAGES, &payload),
            "hello world"
        );
    }

    #[test]
    fn responses_delta_extracts_delta_field() {
        let payload = json!({
            "type": "response.output_text.delta",
            "delta": "hello"
        });
        assert_eq!(extract_stream_delta(OPENAI_RESPONSES, &payload), "hello");
    }

    #[test]
    fn gemini_extracts_candidate_parts() {
        let payload = json!({
            "candidates": [
                { "content": { "parts": [{ "text": "hello" }, { "text": " world" }] } }
            ]
        });
        assert_eq!(
            extract_chat_reply(GEMINI_GENERATE_CONTENT, &payload),
            "hello world"
        );
    }

    #[test]
    fn ollama_extracts_message_content() {
        let payload = json!({
            "message": { "role": "assistant", "content": "hello world" }
        });
        assert_eq!(extract_chat_reply(OLLAMA_CHAT, &payload), "hello world");
        assert_eq!(extract_stream_delta(OLLAMA_CHAT, &payload), "hello world");
    }
}
