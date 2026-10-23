# Claude Code sandbox image for OpenShell.
FROM ubuntu:24.04

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git ripgrep jq less procps \
 && rm -rf /var/lib/apt/lists/*

# Install the native Claude Code binary, then copy the real file to
# /usr/local/bin/claude so the network policy can match it by path.
RUN curl -fsSL https://claude.ai/install.sh | bash \
 && cp -L /root/.local/bin/claude /usr/local/bin/claude \
 && chmod 0755 /usr/local/bin/claude \
 && rm -rf /root/.local /root/.claude* \
 && claude --version

ENV DISABLE_AUTOUPDATER=1
WORKDIR /sandbox
