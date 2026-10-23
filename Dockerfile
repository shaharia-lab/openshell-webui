# One image with the frontend embedded in the release binary, the same artifact
# `make build` produces. Run it on the host network: the local gateway listens
# on 127.0.0.1 only, which a bridged container cannot reach. See README.

FROM oven/bun:1@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
# The TS types are generated from the protos.
COPY backend/proto /src/backend/proto
RUN bun run build

FROM rust:1-bookworm@sha256:48b7f435b8fc6378ce43b44f15e3a47fd8919b2825f835c39bd4bd3da50af5b8 AS backend
WORKDIR /src
COPY backend/ backend/
COPY --from=frontend /src/frontend/dist frontend/dist
RUN cd backend && cargo build --release --locked --features embed-frontend

FROM debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=backend /src/backend/target/release/openshell-webui /usr/local/bin/
# Runs as the host user (`--user "$(id -u):$(id -g)"`) so it can read the
# mounted mTLS key, which is 0600 on the host; any uid must be able to write
# the audit log under HOME.
RUN mkdir -p /home/app/.config/openshell /home/app/.local/state && chmod -R 1777 /home/app
ENV HOME=/home/app XDG_STATE_HOME=/home/app/.local/state
USER 65534:65534
EXPOSE 8787
ENTRYPOINT ["openshell-webui"]
