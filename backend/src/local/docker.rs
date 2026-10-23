//! OpenShell-managed containers on the local Docker engine, with live stats.

use std::{collections::HashMap, path::Path};

use serde::{Deserialize, Serialize};

use super::command;

const MANAGED_FILTER: &str = "label=openshell.ai/managed-by=openshell";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct Container {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub sandbox: String,
    /// The sandbox's workspace (`openshell.ai/sandbox-namespace` label).
    pub workspace: String,
    pub role: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub cpu: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub mem: String,
    #[serde(rename = "memPerc", skip_serializing_if = "String::is_empty")]
    pub mem_perc: String,
    #[serde(rename = "netIO", skip_serializing_if = "String::is_empty")]
    pub net_io: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub pids: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PsLine {
    #[serde(rename = "ID")]
    id: String,
    names: String,
    image: String,
    state: String,
    status: String,
    labels: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct StatsLine {
    #[serde(rename = "ID")]
    id: String,
    #[serde(rename = "CPUPerc")]
    cpu_perc: String,
    mem_usage: String,
    mem_perc: String,
    #[serde(rename = "NetIO")]
    net_io: String,
    #[serde(rename = "PIDs")]
    pids: String,
}

/// The local Docker CLI, pointed at the same engine as the local gateway.
#[derive(Debug, Clone, Default)]
pub struct Docker {
    /// `DOCKER_HOST` for the CLI when the WebUI's own environment has none.
    host: Option<String>,
}

impl Docker {
    /// Returns `None` when the docker CLI is not installed. Without a
    /// `DOCKER_HOST` in the environment, uses the one from the gateway's
    /// `gateway.env` in the CLI config directory.
    pub fn detect(config_dir: &Path) -> Option<Self> {
        if !command::exists("docker") {
            return None;
        }
        let host = match std::env::var("DOCKER_HOST") {
            Ok(h) if !h.is_empty() => None,
            _ => std::fs::read_to_string(config_dir.join("gateway.env")).ok().and_then(|env| docker_host(&env)),
        };
        Some(Self { host })
    }

    async fn run(&self, args: &[&str]) -> Result<String, String> {
        match &self.host {
            Some(host) => command::output_with_env("docker", args, &[("DOCKER_HOST", host)]).await,
            None => command::output("docker", args).await,
        }
    }

    /// Lists managed containers and adds stats for the running ones.
    pub async fn containers(&self) -> Result<Vec<Container>, String> {
        let ps = self.run(&["ps", "-a", "--filter", MANAGED_FILTER, "--format", "{{json .}}"]).await?;
        let mut list = parse_ps(&ps);
        let running: Vec<&str> = list.iter().filter(|c| c.state == "running").map(|c| c.id.as_str()).collect();
        if !running.is_empty() {
            let mut args = vec!["stats", "--no-stream", "--format", "{{json .}}"];
            args.extend(running);
            if let Ok(stats) = self.run(&args).await {
                apply_stats(&mut list, &stats);
            }
        }
        Ok(list)
    }
}

fn docker_host(env_file: &str) -> Option<String> {
    env_file
        .lines()
        .find_map(|l| l.trim().strip_prefix("DOCKER_HOST="))
        .map(|v| v.trim_matches(['"', '\'']).to_owned())
        .filter(|v| !v.is_empty())
}

fn parse_ps(out: &str) -> Vec<Container> {
    out.lines()
        .filter_map(|l| serde_json::from_str::<PsLine>(l).ok())
        .map(|p| {
            let labels = parse_labels(&p.labels);
            Container {
                sandbox: labels.get("openshell.ai/sandbox-name").cloned().unwrap_or_default(),
                workspace: labels.get("openshell.ai/sandbox-namespace").cloned().unwrap_or_default(),
                role: labels.get("openshell.ai/isolation-role").cloned().unwrap_or_default(),
                id: p.id,
                name: p.names,
                image: p.image,
                state: p.state,
                status: p.status,
                ..Container::default()
            }
        })
        .collect()
}

fn apply_stats(list: &mut [Container], out: &str) {
    let stats: HashMap<String, StatsLine> =
        out.lines().filter_map(|l| serde_json::from_str::<StatsLine>(l).ok()).map(|s| (s.id.clone(), s)).collect();
    for c in list.iter_mut() {
        // `docker stats` prints short IDs; `docker ps` may too.
        if let Some(s) =
            stats.iter().find(|(id, _)| c.id.starts_with(id.as_str()) || id.starts_with(&c.id)).map(|(_, s)| s)
        {
            c.cpu.clone_from(&s.cpu_perc);
            c.mem.clone_from(&s.mem_usage);
            c.mem_perc.clone_from(&s.mem_perc);
            c.net_io.clone_from(&s.net_io);
            c.pids.clone_from(&s.pids);
        }
    }
}

fn parse_labels(s: &str) -> HashMap<String, String> {
    s.split(',').filter_map(|kv| kv.split_once('=')).map(|(k, v)| (k.to_owned(), v.to_owned())).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_docker_host_from_gateway_env() {
        assert_eq!(
            docker_host("A=1\nDOCKER_HOST=\"unix:///run/docker.sock\"\n"),
            Some("unix:///run/docker.sock".into())
        );
        assert_eq!(docker_host("A=1"), None);
    }

    #[test]
    fn parses_ps_and_stats() {
        let ps = r#"{"ID":"abc123","Names":"sb-demo","Image":"ubuntu","State":"running","Status":"Up 2h","Labels":"openshell.ai/sandbox-name=demo,openshell.ai/sandbox-namespace=team,openshell.ai/isolation-role=workload"}
{"ID":"def456","Names":"sb-old","Image":"ubuntu","State":"exited","Status":"Exited","Labels":""}
garbage"#;
        let mut list = parse_ps(ps);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].sandbox, "demo");
        assert_eq!(list[0].role, "workload");
        assert_eq!(list[0].workspace, "team");

        apply_stats(
            &mut list,
            r#"{"ID":"abc123","CPUPerc":"1.5%","MemUsage":"10MiB / 1GiB","MemPerc":"1%","NetIO":"1kB / 2kB","PIDs":"7"}"#,
        );
        assert_eq!(list[0].cpu, "1.5%");
        assert_eq!(list[0].pids, "7");
        assert!(list[1].cpu.is_empty());
        let json = serde_json::to_value(&list[0]).unwrap();
        assert_eq!(json["memPerc"], "1%");
        assert!(serde_json::to_value(&list[1]).unwrap().get("cpu").is_none());
    }
}
