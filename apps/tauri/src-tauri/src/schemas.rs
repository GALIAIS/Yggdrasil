use serde_json::{json, Value};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StructuredSchemaId {
    MemoryExtraction,
    RelationshipDelta,
    StorySuggestion,
    WorldStateUpdate,
}

impl StructuredSchemaId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::MemoryExtraction => "memory_extraction",
            Self::RelationshipDelta => "relationship_delta",
            Self::StorySuggestion => "story_suggestion",
            Self::WorldStateUpdate => "world_state_update",
        }
    }
}

pub fn schema_for_id(schema_id: StructuredSchemaId) -> Value {
    match schema_id {
        StructuredSchemaId::MemoryExtraction => json!({
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "summary": { "type": "string" },
                "candidate_memories": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "properties": {
                            "content": { "type": "string" },
                            "importance": { "type": "number" },
                            "kind": { "type": "string" },
                            "tags": {
                                "type": "array",
                                "items": { "type": "string" }
                            }
                        },
                        "required": ["content", "importance", "kind", "tags"]
                    }
                },
                "open_threads": {
                    "type": "array",
                    "items": { "type": "string" }
                }
            },
            "required": ["summary", "candidate_memories", "open_threads"]
        }),
        StructuredSchemaId::RelationshipDelta => json!({
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "changes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "properties": {
                            "left_actor": { "type": "string" },
                            "right_actor": { "type": "string" },
                            "delta": { "type": "number" },
                            "reason": { "type": "string" },
                            "next_implication": { "type": "string" }
                        },
                        "required": ["left_actor", "right_actor", "delta", "reason", "next_implication"]
                    }
                }
            },
            "required": ["changes"]
        }),
        StructuredSchemaId::StorySuggestion => json!({
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "next_scene": { "type": "string" },
                "tension": { "type": "string" },
                "goals": {
                    "type": "array",
                    "items": { "type": "string" }
                },
                "risks": {
                    "type": "array",
                    "items": { "type": "string" }
                },
                "unresolved_conflicts": {
                    "type": "array",
                    "items": { "type": "string" }
                }
            },
            "required": ["next_scene", "tension", "goals", "risks", "unresolved_conflicts"]
        }),
        StructuredSchemaId::WorldStateUpdate => json!({
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "state_updates": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "properties": {
                            "entity": { "type": "string" },
                            "field": { "type": "string" },
                            "next_value": {},
                            "reason": { "type": "string" },
                            "scope": { "type": "string" }
                        },
                        "required": ["entity", "field", "next_value", "reason", "scope"]
                    }
                }
            },
            "required": ["state_updates"]
        }),
    }
}

pub fn response_format_for_schema(schema_id: StructuredSchemaId) -> Value {
    json!({
        "type": "json_schema",
        "json_schema": {
            "name": schema_id.as_str(),
            "strict": true,
            "schema": schema_for_id(schema_id)
        }
    })
}
