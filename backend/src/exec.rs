//! Runs a command in a sandbox without a terminal and collects its output,
//! over `ExecSandboxInteractive` so stdin can be streamed in chunks below the
//! gateway's message size limit.

use std::time::Duration;

use bytes::Bytes;
use futures::stream;
use tonic::Status;

use crate::{
    error::ApiError,
    gateway::GatewayClient,
    proto::api::{ExecSandboxInput, ExecSandboxRequest, exec_sandbox_event, exec_sandbox_input},
    workspace::Workspace,
};

/// Stdin chunk size; the gateway rejects gRPC messages over 1 MiB.
const STDIN_CHUNK: usize = 512 * 1024;

/// The sandbox a command runs in.
#[derive(Debug, Clone)]
pub struct Target {
    pub workspace: Workspace,
    pub sandbox: String,
}

#[derive(Debug, Default)]
pub struct Output {
    pub stdout: Vec<u8>,
    pub stderr: String,
    pub exit_code: i32,
}

impl Output {
    /// Turns a non-zero exit into an error carrying stderr.
    pub fn check(self) -> Result<Self, ApiError> {
        if self.exit_code == 0 {
            return Ok(self);
        }
        let msg = self.stderr.trim();
        Err(ApiError::bad_request(if msg.is_empty() {
            format!("command exited with {}", self.exit_code)
        } else {
            msg.to_owned()
        }))
    }
}

/// Runs `argv` with `stdin`, returning at most `max_output` bytes of stdout.
pub async fn run(
    client: &GatewayClient,
    target: &Target,
    argv: Vec<String>,
    stdin: Bytes,
    max_output: usize,
    timeout: Duration,
) -> Result<Output, ApiError> {
    let start = ExecSandboxRequest {
        workspace_scope: Some(target.workspace.selector_proto()),
        sandbox: target.sandbox.clone(),
        command: argv,
        tty: false,
        no_login_shell: true,
        request_id: uuid::Uuid::new_v4().to_string(),
        ..Default::default()
    };
    let mut inputs = vec![ExecSandboxInput { payload: Some(exec_sandbox_input::Payload::Start(start)) }];
    inputs.extend(
        stdin
            .chunks(STDIN_CHUNK)
            .map(|c| ExecSandboxInput { payload: Some(exec_sandbox_input::Payload::Stdin(c.to_vec())) }),
    );

    let collect = async {
        let req = client.request(stream::iter(inputs), None)?;
        let mut events = client.typed().exec_sandbox_interactive(req).await?.into_inner();
        let mut out = Output::default();
        while let Some(ev) = events.message().await? {
            match ev.payload {
                Some(exec_sandbox_event::Payload::Stdout(o)) => {
                    if out.stdout.len() + o.data.len() > max_output {
                        return Err(Status::resource_exhausted(format!("output is larger than {max_output} bytes")));
                    }
                    out.stdout.extend_from_slice(&o.data);
                }
                Some(exec_sandbox_event::Payload::Stderr(e)) => out.stderr.push_str(&String::from_utf8_lossy(&e.data)),
                Some(exec_sandbox_event::Payload::Exit(x)) => {
                    out.exit_code = x.exit_code;
                    break;
                }
                None => {}
            }
        }
        Ok::<_, Status>(out)
    };
    match tokio::time::timeout(timeout, collect).await {
        Ok(res) => Ok(res?),
        Err(_) => Err(ApiError::from(Status::deadline_exceeded("command did not finish in time"))),
    }
}
