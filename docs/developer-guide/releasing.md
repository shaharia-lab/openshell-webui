# Releasing

This page explains how a WebUI release is versioned, tagged and published, and how the separate `claude-sandbox` example image is built. Everything here is checked against `.github/workflows/`.

## Versioning

- The version lives in one place: `version` in `backend/Cargo.toml`. The binary reports it with `--version` and in the sidebar (`/api/about`).
- `frontend/package.json` keeps `0.0.0`; it is not part of the release version.
- Tags are `v<version>`, for example `v0.2.0`. A tag with a `-`, such as `v0.3.0-rc.1`, is a pre-release.

## Cut a release

1. Set `version` in `backend/Cargo.toml`.
2. Run `cargo check` in `backend/` so `Cargo.lock` follows.
3. Run `make lint test`, open a pull request, and merge it to `main`.
4. Tag the merge commit and push the tag:

   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```

5. Watch the `Release` and `Docker image` workflows. Check the GitHub release and the image tags when they finish.

> [!WARNING]
> The tag must match `backend/Cargo.toml`. The `version` job in `release.yml` fails before anything is built if `v<Cargo version>` differs from the tag name.

## Release binaries: `release.yml`

Triggers: a pushed `v*` tag, and pull requests that change `.github/workflows/release.yml`. On a pull request it builds every target without publishing.

| Asset | Target | Runner |
|---|---|---|
| `openshell-webui-linux-amd64` | `x86_64-unknown-linux-musl` (static) | `ubuntu-latest` |
| `openshell-webui-linux-arm64` | `aarch64-unknown-linux-musl` (static) | `ubuntu-24.04-arm` |
| `openshell-webui-darwin-arm64` | `aarch64-apple-darwin` | `macos-latest` |
| `openshell-webui-darwin-amd64` | `x86_64-apple-darwin` (cross-compiled) | `macos-latest` |

Each build job:

1. Builds the frontend (`bun install --frozen-lockfile && bun run build`).
2. Runs `cargo build --release --locked --features embed-frontend --target <target>`. Linux jobs install `musl-tools` first.
3. Copies and strips the binary as `openshell-webui-<asset>`.
4. Runs `--version` as a smoke test, except on the cross-compiled target.

The `publish` job runs only for tags. It writes `checksums.txt` with `sha256sum` and runs `gh release create <tag> --verify-tag --generate-notes`, adding `--prerelease` when the tag contains `-`.

### Keep asset names stable

Asset names carry no version. The README's download command uses `releases/latest/download/openshell-webui-<os>-<arch>`, which therefore always points to the newest release. Do not add a version to asset names, and do not rename them; that would break every install command already published.

## Docker image: `docker.yml`

Triggers: a pushed `v*` tag, and pull requests that change `Dockerfile`, `.dockerignore` or the workflow. Pull requests build without pushing.

- Image: `ghcr.io/<owner>/openshell-webui`.
- Platforms: `linux/amd64` on `ubuntu-latest` and `linux/arm64` on `ubuntu-24.04-arm`, each built natively and pushed by digest. The `publish` job merges the digests into one multi-platform manifest.
- Tags from `docker/metadata-action`:

| Tag | When |
|---|---|
| `X.Y.Z` | Every release tag |
| `X.Y` | Every release tag |
| `latest` | Only when the tag name has no `-` |

The `Dockerfile` has three stages: Bun builds `frontend/dist` (from the committed types in `src/gen`; the protos are not copied), Rust builds the binary with `embed-frontend`, and `debian:bookworm-slim` runs it as user `65534` with `HOME=/home/app`.

## The `claude-sandbox` example image: `claude-sandbox.yml`

This image is separate from WebUI releases. Tags do not build it.

- Image: `ghcr.io/<owner>/claude-sandbox`, built from `examples/claude-sandbox/` for `linux/amd64` and `linux/arm64` (QEMU).
- Published on every push to `main` that changes `examples/claude-sandbox/**` or the workflow itself, and on manual runs (`workflow_dispatch`). Run it by hand to pick up a newer Claude Code release.
- Tags: `latest` and the short commit SHA.
- Pull requests that touch those paths build it without pushing.

## CI on every change: `ci.yml`

Pushes to `main` and all pull requests run the backend and frontend checks, then `make build`, and upload `bin/openshell-webui` (Linux x86_64) as a build artifact. It does not publish anything. See [Testing](testing.md#ci).

## Release checklist

- [ ] `backend/Cargo.toml` version bumped and `Cargo.lock` updated.
- [ ] `make lint test` passes; CI is green on `main`.
- [ ] User-facing changes are reflected in `README.md` and the [user guide](../user-guide/README.md).
- [ ] Tag `v<version>` pushed from the merged commit.
- [ ] GitHub release has four binaries and `checksums.txt`.
- [ ] `ghcr.io/<owner>/openshell-webui` has `X.Y.Z`, `X.Y` and (for a final release) `latest`.
- [ ] `curl` from `releases/latest/download/...` fetches the new binary, and `--version` prints the new version.

## Related

- [Testing](testing.md)
- [Local development](local-development.md#build-and-run-a-release-binary)
- [User guide: getting started](../user-guide/getting-started.md)
