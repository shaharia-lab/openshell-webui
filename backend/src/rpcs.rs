//! The allowlist of gateway methods reachable through
//! `POST /api/gw/{gw}/call/{method}`. Anything not listed here (sandbox
//! tokens, provider environments, supervisor and peer RPCs) is unreachable
//! from the browser.

/// Whether a method changes state. Writes are refused in read-only mode and
/// recorded in the audit log.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    Read,
    Write,
}

use Access::{Read, Write};

const ALLOWED: &[(&str, Access)] = &[
    // Sandboxes.
    ("CreateSandbox", Write),
    ("StartSandbox", Write),
    ("StopSandbox", Write),
    ("DeleteSandbox", Write),
    ("AttachSandboxProvider", Write),
    ("DetachSandboxProvider", Write),
    ("ListSandboxProviders", Read),
    ("GetSandboxProviderStatus", Read),
    // Policy and settings.
    ("UpdateConfig", Write),
    ("GetSandboxPolicyStatus", Read),
    ("GetGatewayConfig", Read),
    // Policy proposals (drafts).
    ("GetDraftPolicy", Read),
    ("GetDraftHistory", Read),
    ("ApproveDraftChunk", Write),
    ("RejectDraftChunk", Write),
    ("ApproveAllDraftChunks", Write),
    ("UndoDraftChunk", Write),
    ("ClearDraftChunks", Write),
    ("EditDraftChunk", Write),
    // Providers and profiles.
    ("GetProvider", Read),
    ("CreateProvider", Write),
    ("UpdateProvider", Write),
    ("DeleteProvider", Write),
    ("RotateProviderCredential", Write),
    ("GetProviderRefreshStatus", Read),
    ("ConfigureProviderRefresh", Write),
    ("DeleteProviderRefresh", Write),
    ("GetProviderProfile", Read),
    ("LintProviderProfiles", Read),
    ("ImportProviderProfiles", Write),
    ("UpdateProviderProfiles", Write),
    ("DeleteProviderProfile", Write),
    // Templates and services.
    ("GetSandboxTemplate", Read),
    ("CreateSandboxTemplate", Write),
    ("DeleteSandboxTemplate", Write),
    ("GetService", Read),
    ("ExposeService", Write),
    ("DeleteService", Write),
    // Workspaces and members.
    ("GetWorkspace", Read),
    ("CreateWorkspace", Write),
    ("DeleteWorkspace", Write),
    ("ListWorkspaceMembers", Read),
    ("AddWorkspaceMember", Write),
    ("RemoveWorkspaceMember", Write),
];

/// The access level of an allowlisted method, or `None` when the method is
/// not reachable from the UI.
pub fn lookup(method: &str) -> Option<Access> {
    ALLOWED.iter().find(|(name, _)| *name == method).map(|(_, a)| *a)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reflect;

    #[test]
    fn every_allowlisted_method_exists_and_is_unary() {
        for (name, _) in ALLOWED {
            let m = reflect::method(name).unwrap_or_else(|_| panic!("{name} is not a gateway method"));
            assert!(!m.is_client_streaming() && !m.is_server_streaming(), "{name} is streaming");
        }
    }

    #[test]
    fn sensitive_methods_are_not_allowlisted() {
        for name in [
            "IssueSandboxToken",
            "RefreshSandboxToken",
            "ExchangeProviderSubjectToken",
            "GetSandboxProviderEnvironment",
            "GetProviderCredentials",
        ] {
            assert_eq!(lookup(name), None, "{name}");
        }
        assert_eq!(lookup("DeleteSandbox"), Some(Write));
        assert_eq!(lookup("GetDraftPolicy"), Some(Read));
    }
}
