//! Gateway access: the CLI registry, connections, and reflection-based calls.

mod client;
mod codec;
pub mod registry;

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};

use prost_reflect::{DynamicMessage, MethodDescriptor};
use serde_json::Value;

pub use client::GatewayClient;
pub use registry::{AuthMode, Gateway, Registry};

use crate::{error::ApiError, reflect};

/// Upper bound on pages fetched by [`Gateways::list_all`].
const MAX_PAGES: usize = 25;
const PAGE_SIZE: i32 = 200;

/// Resolves gateway names to clients, keeping one connection per gateway and
/// re-dialing when its registry entry changes.
#[derive(Clone)]
pub struct Gateways {
    registry: Registry,
    timeout: Duration,
    conns: Arc<Mutex<HashMap<String, (String, GatewayClient)>>>,
}

impl Gateways {
    pub fn new(registry: Registry, timeout: Duration) -> Self {
        Self { registry, timeout, conns: Arc::default() }
    }

    pub fn registry(&self) -> &Registry {
        &self.registry
    }

    pub fn timeout(&self) -> Duration {
        self.timeout
    }

    /// The client for a registered gateway.
    pub fn client(&self, name: &str) -> Result<GatewayClient, ApiError> {
        let gw = self.registry.get(name)?;
        let key = format!("{}|{:?}", gw.endpoint, gw.auth_mode);
        let mut conns = self.conns.lock().expect("connection pool lock poisoned");
        if let Some((k, client)) = conns.get(name)
            && *k == key
        {
            return Ok(client.clone());
        }
        let client = GatewayClient::connect(&gw)?;
        conns.insert(name.to_owned(), (key, client.clone()));
        Ok(client)
    }

    /// Calls a unary method with an already-built request message.
    pub async fn call(
        &self,
        gateway: &str,
        method: &MethodDescriptor,
        request: DynamicMessage,
        timeout: Duration,
    ) -> Result<DynamicMessage, ApiError> {
        let client = self.client(gateway)?;
        Ok(client.unary(method, request, timeout).await?)
    }

    /// Calls a unary method with a request given as proto JSON.
    pub async fn call_json(&self, gateway: &str, method: &str, request: Value) -> Result<DynamicMessage, ApiError> {
        let method = reflect::method(method)?;
        let request = reflect::from_json(&method.input(), request)?;
        self.call(gateway, &method, request, self.timeout).await
    }

    /// Calls a paginated list method until the gateway stops returning a page
    /// token, and returns one response with every item in `items_field`.
    pub async fn list_all(
        &self,
        gateway: &str,
        method: &str,
        request: Value,
        items_field: &str,
    ) -> Result<DynamicMessage, ApiError> {
        let method = reflect::method(method)?;
        let client = self.client(gateway)?;
        let mut request = request;
        request["page_size"] = PAGE_SIZE.into();
        let mut request = reflect::from_json(&method.input(), request)?;

        let mut items = Vec::new();
        let mut last = DynamicMessage::new(method.output());
        for _ in 0..MAX_PAGES {
            let mut page = client.unary(&method, request.clone(), self.timeout).await?;
            if let Some(prost_reflect::Value::List(list)) = page.take_field_by_name(items_field) {
                items.extend(list);
            }
            let next = reflect::string_field(&page, "next_page_token");
            last = page;
            if next.is_empty() {
                break;
            }
            request
                .try_set_field_by_name("page_token", prost_reflect::Value::String(next))
                .map_err(|e| ApiError::internal(format!("{}: {e}", method.name())))?;
        }
        last.clear_field_by_name("next_page_token");
        last.set_field_by_name(items_field, prost_reflect::Value::List(items));
        Ok(last)
    }
}
