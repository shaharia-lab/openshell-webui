//! Masks proto fields annotated with `(openshell.options.v1.secret) = true`
//! before they leave the server, and detects requests that echo the mask back.

use std::{collections::HashSet, sync::LazyLock};

use prost_reflect::{DynamicMessage, FieldDescriptor, Value};

use crate::proto::POOL;

/// Replaces secret values so the UI can still show which keys exist.
pub const MASK: &str = "[redacted]";

const SECRET_OPTION: &str = "openshell.options.v1.secret";

/// Full names of every field marked secret, computed once from the pool.
static SECRET_FIELDS: LazyLock<HashSet<String>> = LazyLock::new(|| {
    let ext = POOL.get_extension_by_name(SECRET_OPTION).expect("secret option is in the descriptor pool");
    POOL.all_messages()
        .flat_map(|m| m.fields().collect::<Vec<_>>())
        .filter(|f| matches!(f.options().get_extension(&ext).as_ref(), Value::Bool(true)))
        .map(|f| f.full_name().to_owned())
        .collect()
});

fn is_secret(field: &FieldDescriptor) -> bool {
    SECRET_FIELDS.contains(field.full_name())
}

/// Redacts secret fields in place, recursively. Strings and string map values
/// become [`MASK`]; any other secret value is dropped.
pub fn redact(msg: &mut DynamicMessage) {
    let mut drop = Vec::new();
    for (field, value) in msg.fields_mut() {
        if is_secret(&field) {
            match value {
                Value::String(s) => *s = MASK.to_owned(),
                Value::Map(map) if map.values().all(|v| matches!(v, Value::String(_))) => {
                    map.values_mut().for_each(|v| *v = Value::String(MASK.to_owned()));
                }
                _ => drop.push(field),
            }
        } else {
            for nested in nested_messages(value) {
                redact(nested);
            }
        }
    }
    for field in drop {
        msg.clear_field(&field);
    }
}

/// Whether any secret field holds [`MASK`], which means a client sent back a
/// redacted value instead of a real secret.
pub fn has_mask(msg: &DynamicMessage) -> bool {
    msg.fields().any(|(field, value)| {
        if is_secret(&field) {
            match value {
                Value::String(s) => s == MASK,
                Value::Map(map) => map.values().any(|v| matches!(v, Value::String(s) if s == MASK)),
                _ => false,
            }
        } else {
            nested(value).any(has_mask)
        }
    })
}

fn nested(value: &Value) -> Box<dyn Iterator<Item = &DynamicMessage> + '_> {
    match value {
        Value::Message(m) => Box::new(std::iter::once(m)),
        Value::List(items) => Box::new(items.iter().filter_map(Value::as_message)),
        Value::Map(map) => Box::new(map.values().filter_map(Value::as_message)),
        _ => Box::new(std::iter::empty()),
    }
}

fn nested_messages(value: &mut Value) -> Vec<&mut DynamicMessage> {
    match value {
        Value::Message(m) => vec![m],
        Value::List(items) => items.iter_mut().filter_map(Value::as_message_mut).collect(),
        Value::Map(map) => map.values_mut().filter_map(Value::as_message_mut).collect(),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::reflect::{from_json, message, to_json};

    #[test]
    fn secret_fields_are_discovered() {
        assert!(SECRET_FIELDS.contains("openshell.datamodel.v1.Provider.credentials"));
        assert!(!SECRET_FIELDS.contains("openshell.datamodel.v1.Provider.type"));
    }

    #[test]
    fn masks_nested_secret_map_values_and_keeps_other_fields() {
        let desc = message("openshell.v1.ProviderResponse");
        let mut msg = from_json(
            &desc,
            json!({"provider": {"type": "claude", "credentials": {"TOKEN": "sk-test-not-real"}, "config": {"region": "eu"}}}),
        )
        .unwrap();
        redact(&mut msg);
        let out = to_json(&msg);
        assert_eq!(out["provider"]["credentials"]["TOKEN"], MASK);
        assert_eq!(out["provider"]["config"]["region"], "eu");
        assert_eq!(out["provider"]["type"], "claude");
        assert!(has_mask(&msg));
    }

    #[test]
    fn has_mask_ignores_real_values_and_non_secret_fields() {
        let desc = message("openshell.v1.ProviderResponse");
        let msg = from_json(&desc, json!({"provider": {"type": MASK, "credentials": {"TOKEN": "real"}}})).unwrap();
        assert!(!has_mask(&msg));
    }
}
