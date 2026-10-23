# OpenShell WebUI: Rust backend (backend/) + React frontend (frontend/).
#
#   make dev            backend and frontend with hot reload (two processes)
#   make backend-dev    backend only, rebuilt and restarted on change
#   make frontend-dev   Vite dev server with HMR, proxying /api to the backend
#   make build          one release binary with the frontend embedded
#   make run            build, check the gateway, and open the WebUI
#   make test | lint | fmt | proto | clean

BACKEND_DIR  := backend
FRONTEND_DIR := frontend
BIN_DIR      := bin
BIN          := $(BIN_DIR)/openshell-webui

# Backend address for the API (dev and run). The Vite dev server proxies to it.
ADDR ?= 127.0.0.1:8787
# Extra backend flags, e.g. make run ARGS=--read-only
ARGS ?=

OPENSHELL_SRC ?= $(HOME)/Projects/OpenShell
PROTOS := openshell datamodel sandbox options

.DEFAULT_GOAL := help
.PHONY: help dev backend-dev frontend-dev build run test lint fmt proto clean deps gateway-up frontend-deps

help: ## show this help
	@awk 'BEGIN {FS = ":.*## "} /^[a-z-]+:.*## / {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: deps frontend-deps ## run backend and frontend with hot reload
	@trap 'kill 0' INT TERM EXIT; \
		$(MAKE) --no-print-directory backend-dev & \
		$(MAKE) --no-print-directory frontend-dev & \
		wait

backend-dev: ## run the backend, rebuilt and restarted on every change
	@command -v cargo-watch >/dev/null || { echo "cargo-watch not found: cargo install cargo-watch"; exit 1; }
	@cd $(BACKEND_DIR) && cargo watch -q -c -w src -w proto -w build.rs -w Cargo.toml \
		-x 'run -- --addr $(ADDR) $(ARGS)'

frontend-dev: frontend-deps ## run the Vite dev server with HMR
	@cd $(FRONTEND_DIR) && OPENSHELL_UI_BACKEND=http://$(ADDR) bun run dev

build: frontend-deps ## build one release binary with the frontend embedded
	@cd $(FRONTEND_DIR) && bun run build
	@cd $(BACKEND_DIR) && cargo build --release --locked --features embed-frontend
	@mkdir -p $(BIN_DIR) && cp $(BACKEND_DIR)/target/release/openshell-webui $(BIN).tmp && mv -f $(BIN).tmp $(BIN)
	@echo "Built $(BIN)"

run: deps gateway-up build ## build, make sure the gateway runs, and open the WebUI
	@$(BIN) --addr $(ADDR) --open $(ARGS)

test: frontend-deps ## run backend and frontend tests
	@cd $(BACKEND_DIR) && cargo test --locked
	@cd $(FRONTEND_DIR) && bun run test

lint: frontend-deps ## format check, clippy, eslint, prettier and type check
	@cd $(BACKEND_DIR) && cargo fmt --check && cargo clippy --all-targets --locked -- -D warnings
	@cd $(FRONTEND_DIR) && bun run lint && bun run typecheck

fmt: frontend-deps ## format all code
	@cd $(BACKEND_DIR) && cargo fmt
	@cd $(FRONTEND_DIR) && bun run format

proto: ## copy the gateway API protos from OPENSHELL_SRC and regenerate types
	@for p in $(PROTOS); do cp $(OPENSHELL_SRC)/proto/$$p.proto $(BACKEND_DIR)/proto/; done
	@git -C $(OPENSHELL_SRC) rev-parse --short HEAD > $(BACKEND_DIR)/proto/SOURCE_COMMIT
	@cd $(FRONTEND_DIR) && bun run gen:types
	@echo "Protos from OpenShell $$(cat $(BACKEND_DIR)/proto/SOURCE_COMMIT); the backend regenerates on its next build"

clean: ## remove build output
	@rm -rf $(BIN_DIR) $(FRONTEND_DIR)/dist
	@cd $(BACKEND_DIR) && cargo clean

deps: ## check the required tools
	@command -v cargo >/dev/null || { echo "cargo not found: https://rustup.rs"; exit 1; }
	@command -v bun >/dev/null || { echo "bun not found: https://bun.sh"; exit 1; }
	@command -v openshell >/dev/null || { echo "openshell not found: https://github.com/NVIDIA/OpenShell"; exit 1; }
	@command -v docker >/dev/null || echo "warning: docker not found, container stats are disabled"

frontend-deps:
	@test -d $(FRONTEND_DIR)/node_modules || (cd $(FRONTEND_DIR) && bun install --frozen-lockfile)

gateway-up: ## start the local gateway (systemd user unit or Homebrew service) if needed
	@if openshell status >/dev/null 2>&1; then echo "Gateway is connected"; else \
		if systemctl --user cat openshell-gateway >/dev/null 2>&1; then \
			echo "Starting the gateway with systemctl --user"; systemctl --user start openshell-gateway; \
		elif command -v brew >/dev/null; then \
			echo "Starting the gateway with brew services"; brew services start openshell >/dev/null; \
		else echo "Start the OpenShell gateway first"; exit 1; fi; \
		for i in $$(seq 1 20); do openshell status >/dev/null 2>&1 && break; sleep 1; done; \
		openshell status >/dev/null 2>&1 || { echo "Gateway did not start; check its logs"; exit 1; }; \
		echo "Gateway is connected"; fi
