#!/usr/bin/env bash
# ============================================================================
# build-release.sh — Generate the Violet Enterprise self-host bundle
# ============================================================================
# Usage:
#   bash scripts/build-release.sh
#
# Output:
#   violet-enterprise.zip  (in the project root)
#
# The zip contains every git-tracked file, which is everything users need to
# run  docker compose up --build  on their own machine.  It intentionally
# excludes node_modules, dist, .git, and any other gitignored paths.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT="$ROOT_DIR/artifacts/api-server/violet-enterprise.zip"

echo "▶  Building Violet Enterprise release bundle..."
echo "   Root: $ROOT_DIR"

cd "$ROOT_DIR"

# Use git archive — fast, clean, no ignored files
git archive HEAD --format=zip -o "$OUT"

SIZE=$(du -sh "$OUT" | cut -f1)
echo "   ✓ Created $OUT ($SIZE)"
echo ""
echo "   Users can now:"
echo "   1. Unzip violet-enterprise.zip"
echo "   2. Copy .env.example to .env and fill in their values"
echo "   3. Run: docker compose up --build -d"
