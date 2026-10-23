//! The `?workspace=` query parameter and its proto `WorkspaceSelector`.

use serde_json::{Value, json};

use crate::{
    error::ApiError,
    proto::openshell::datamodel::v1::{AllWorkspaces, WorkspaceSelector, workspace_selector::Selection},
    validate,
};

/// Which workspace a request targets.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Workspace {
    /// One named workspace (`default` when the parameter is empty).
    Named(String),
    /// Every workspace the caller can see (`?workspace=*`).
    All,
}

impl Workspace {
    pub fn parse(raw: Option<&str>) -> Result<Self, ApiError> {
        match raw.unwrap_or("") {
            "" => Ok(Self::Named("default".into())),
            "*" => Ok(Self::All),
            name if validate::is_name(name) => Ok(Self::Named(name.into())),
            _ => Err(ApiError::bad_request("invalid workspace name")),
        }
    }

    /// The `WorkspaceSelector` in proto JSON form.
    pub fn selector(&self) -> Value {
        match self {
            Self::Named(name) => json!({ "workspace": name }),
            Self::All => json!({ "all_workspaces": {} }),
        }
    }

    /// The `WorkspaceSelector` as a generated message.
    pub fn selector_proto(&self) -> WorkspaceSelector {
        let selection = match self {
            Self::Named(name) => Selection::Workspace(name.clone()),
            Self::All => Selection::AllWorkspaces(AllWorkspaces {}),
        };
        WorkspaceSelector { selection: Some(selection) }
    }

    /// The raw query value, as recorded in the audit log.
    pub fn label(&self) -> &str {
        match self {
            Self::Named(name) => name,
            Self::All => "*",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_query_values() {
        assert_eq!(Workspace::parse(None).unwrap(), Workspace::Named("default".into()));
        assert_eq!(Workspace::parse(Some("*")).unwrap(), Workspace::All);
        assert_eq!(Workspace::parse(Some("team-a")).unwrap(), Workspace::Named("team-a".into()));
        assert!(Workspace::parse(Some("bad name")).is_err());
        assert_eq!(Workspace::All.selector(), json!({"all_workspaces": {}}));
    }
}
