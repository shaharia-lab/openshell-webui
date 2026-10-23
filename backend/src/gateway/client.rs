//! A connection to one gateway: the gRPC channel plus how each request is
//! authenticated.

use std::{path::PathBuf, time::Duration};

use http::uri::PathAndQuery;
use prost_reflect::{DynamicMessage, MethodDescriptor};
use serde::Deserialize;
use tonic::{
    Request, Status,
    metadata::MetadataValue,
    transport::{Certificate, Channel, ClientTlsConfig, Endpoint, Identity},
};

use super::{
    codec::DynamicCodec,
    registry::{AuthMode, Gateway},
};
use crate::{error::ApiError, proto::api::open_shell_client::OpenShellClient};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// Per-request authentication added on top of the channel's transport.
#[derive(Debug, Clone)]
enum RequestAuth {
    /// mTLS or plaintext: the transport carries the identity.
    None,
    /// OIDC bearer token, re-read from the CLI token file on every call so a
    /// token the CLI refreshes is picked up without a restart.
    Oidc { gateway: String, token_file: PathBuf },
}

#[derive(Debug, Clone)]
pub struct GatewayClient {
    channel: Channel,
    auth: RequestAuth,
}

impl GatewayClient {
    /// Builds a lazily connecting client for a registry entry.
    pub fn connect(gw: &Gateway) -> Result<Self, ApiError> {
        let url = url::Url::parse(&gw.endpoint).map_err(|_| {
            ApiError::bad_request(format!("gateway {:?} has an invalid endpoint {:?}", gw.name, gw.endpoint))
        })?;
        let endpoint = Endpoint::from_shared(gw.endpoint.clone())
            .map_err(|e| ApiError::bad_request(format!("gateway {:?}: {e}", gw.name)))?
            .user_agent("openshell-webui")
            .map_err(|e| ApiError::internal(e.to_string()))?
            .connect_timeout(CONNECT_TIMEOUT)
            .http2_keep_alive_interval(Duration::from_secs(30))
            .keep_alive_while_idle(true);

        let (endpoint, auth) = match (gw.auth_mode, url.scheme()) {
            (AuthMode::CloudflareJwt, _) => {
                return Err(ApiError::bad_request(format!(
                    "gateway {:?} uses Cloudflare edge auth, which the WebUI does not support yet",
                    gw.name
                )));
            }
            (_, "http") => (endpoint, RequestAuth::None),
            (mode, "https") => {
                let host = url.host_str().unwrap_or_default().trim_matches(['[', ']']).to_owned();
                let endpoint = endpoint
                    .tls_config(tls_config(gw, host)?)
                    .map_err(|e| ApiError::internal(format!("gateway {:?}: TLS setup: {e}", gw.name)))?;
                let auth = if mode == AuthMode::Oidc {
                    RequestAuth::Oidc { gateway: gw.name.clone(), token_file: gw.dir.join("oidc_token.json") }
                } else {
                    RequestAuth::None
                };
                (endpoint, auth)
            }
            (_, scheme) => {
                return Err(ApiError::bad_request(format!(
                    "gateway {:?} endpoint has unsupported scheme {scheme:?}",
                    gw.name
                )));
            }
        };
        Ok(Self { channel: endpoint.connect_lazy(), auth })
    }

    /// Calls a unary method with a dynamic request and returns the dynamic
    /// response.
    pub async fn unary(
        &self,
        method: &MethodDescriptor,
        message: DynamicMessage,
        timeout: Duration,
    ) -> Result<DynamicMessage, Status> {
        let path = path(method)?;
        let mut grpc = tonic::client::Grpc::new(self.channel.clone());
        let request = self.request(message, Some(timeout))?;
        let call = async {
            grpc.ready().await.map_err(|e| Status::unavailable(format!("gateway unreachable: {e}")))?;
            grpc.unary(request, path, DynamicCodec::new(method.output())).await
        };
        match tokio::time::timeout(timeout, call).await {
            Ok(res) => res.map(tonic::Response::into_inner),
            Err(_) => Err(Status::deadline_exceeded("gateway did not answer in time")),
        }
    }

    /// Calls a server-streaming method and returns the response stream. The
    /// timeout applies to opening the stream only.
    pub async fn server_streaming(
        &self,
        method: &MethodDescriptor,
        message: DynamicMessage,
        timeout: Duration,
    ) -> Result<tonic::Streaming<DynamicMessage>, Status> {
        let path = path(method)?;
        let mut grpc = tonic::client::Grpc::new(self.channel.clone());
        let request = self.request(message, None)?;
        let open = async {
            grpc.ready().await.map_err(|e| Status::unavailable(format!("gateway unreachable: {e}")))?;
            grpc.server_streaming(request, path, DynamicCodec::new(method.output())).await
        };
        match tokio::time::timeout(timeout, open).await {
            Ok(res) => res.map(tonic::Response::into_inner),
            Err(_) => Err(Status::deadline_exceeded("gateway did not answer in time")),
        }
    }

    /// The generated client, for streaming methods.
    pub fn typed(&self) -> OpenShellClient<Channel> {
        OpenShellClient::new(self.channel.clone())
    }

    /// Wraps a message in a request with the gateway's credentials and, for
    /// unary calls, a deadline.
    pub fn request<T>(&self, message: T, timeout: Option<Duration>) -> Result<Request<T>, Status> {
        let mut req = Request::new(message);
        if let Some(timeout) = timeout {
            req.set_timeout(timeout);
        }
        if let RequestAuth::Oidc { gateway, token_file } = &self.auth {
            let token = read_oidc_token(gateway, token_file)?;
            let value = MetadataValue::try_from(format!("Bearer {token}"))
                .map_err(|_| Status::unauthenticated("OIDC token is not a valid header value"))?;
            req.metadata_mut().insert("authorization", value);
        }
        Ok(req)
    }
}

fn path(method: &MethodDescriptor) -> Result<PathAndQuery, Status> {
    PathAndQuery::try_from(format!("/{}/{}", method.parent_service().full_name(), method.name()))
        .map_err(|e| Status::internal(e.to_string()))
}

/// Trusts the gateway CA from the mtls directory when present (system roots
/// otherwise) and presents the client certificate for mTLS.
fn tls_config(gw: &Gateway, host: String) -> Result<ClientTlsConfig, ApiError> {
    let dir = gw.dir.join("mtls");
    let mut cfg = ClientTlsConfig::new().domain_name(host);
    cfg = match std::fs::read(dir.join("ca.crt")) {
        Ok(ca) => cfg.ca_certificate(Certificate::from_pem(ca)),
        Err(_) => cfg.with_native_roots(),
    };
    match (std::fs::read(dir.join("tls.crt")), std::fs::read(dir.join("tls.key"))) {
        (Ok(cert), Ok(key)) => Ok(cfg.identity(Identity::from_pem(cert, key))),
        _ if gw.auth_mode == AuthMode::Mtls => Err(ApiError::bad_request(format!(
            "gateway {:?}: mTLS client certificate not found in {}",
            gw.name,
            dir.display()
        ))),
        _ => Ok(cfg),
    }
}

#[derive(Deserialize)]
struct OidcToken {
    #[serde(default)]
    access_token: String,
    expires_at: Option<u64>,
}

fn read_oidc_token(gateway: &str, file: &std::path::Path) -> Result<String, Status> {
    let raw = std::fs::read(file)
        .map_err(|_| Status::unauthenticated(format!("no OIDC token; run `openshell gateway login {gateway}`")))?;
    let token: OidcToken =
        serde_json::from_slice(&raw).ok().filter(|t: &OidcToken| !t.access_token.is_empty()).ok_or_else(|| {
            Status::unauthenticated(format!("unreadable OIDC token; run `openshell gateway login {gateway}`"))
        })?;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
    if token.expires_at.is_some_and(|exp| now >= exp) {
        return Err(Status::unauthenticated(format!(
            "OIDC token expired; run any openshell command for {gateway} to refresh it, or `openshell gateway login {gateway}`"
        )));
    }
    Ok(token.access_token)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oidc_token_file_states() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("oidc_token.json");
        assert_eq!(read_oidc_token("gw", &file).unwrap_err().code(), tonic::Code::Unauthenticated);

        std::fs::write(&file, r#"{"access_token":"abc","expires_at":1}"#).unwrap();
        assert!(read_oidc_token("gw", &file).unwrap_err().message().contains("expired"));

        std::fs::write(&file, r#"{"access_token":"abc","expires_at":99999999999}"#).unwrap();
        assert_eq!(read_oidc_token("gw", &file).unwrap(), "abc");
    }
}
