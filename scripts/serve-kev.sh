#!/usr/bin/env bash
# Serve Kev, a local System One decision model (POST /v1/systemone), on Apple Silicon via MLX.
# First run clones Kev into vendor/kev, installs its Python dependencies with uv,
# and downloads the model weights from Hugging Face (about 9.5 GB for Kev-4B).
set -euo pipefail

KEV_REPO="https://github.com/jaredpalmer/kev.git"
KEV_COMMIT="6b719c3c3f367295f6ef336f4f751cf5ff970abc" # tag kev-1.0
KEV_MODEL="${KEV_MODEL:-jaredpalmer/kev-4b@v1.0}"
KEV_PORT="${KEV_PORT:-8009}"

root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/vendor/kev"

command -v uv >/dev/null || { echo "uv is required: https://docs.astral.sh/uv/" >&2; exit 1; }

if [ ! -d "$dir/.git" ]; then
  git clone --filter=blob:none "$KEV_REPO" "$dir"
fi
if [ "$(git -C "$dir" rev-parse HEAD)" != "$KEV_COMMIT" ]; then
  git -C "$dir" fetch --quiet origin "$KEV_COMMIT"
  git -C "$dir" checkout --quiet --detach "$KEV_COMMIT"
fi

cd "$dir"
uv sync --extra serve
exec uv run --extra serve python -m kev.serve --run "$KEV_MODEL" --port "$KEV_PORT"
