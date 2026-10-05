#!/usr/bin/env bash
# deploy-sites.sh — Build dist/ and mirror FULL static tree to MinIO/S3
#
# Critical: uploads dist/ (lib + public + pages + get), not a partial pages/public
# top-level copy. Partial deploys leave stale global.css / fab.js on the edge.
#
# Object layout (matches flea-flicker terp-static.conf):
#   s3://static/terp.network/dist/{pages,lib,public,get}/...
#
# Usage:
#   ./scripts/deploy-sites.sh [site-dir] [--no-build] [--dry-run]
#
# Environment (see websites/scripts/s3-common.sh):
#   S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY  (or oline s3-upload.env)
#   MINIO_ALIAS (default: oline)
#   S3_BUCKET   (default: static)
#   SITE_HOST   (default: basename of site-dir, e.g. terp.network)

set -euo pipefail

BUILD=1
DRY_RUN=0
SITE_DIR=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --no-build) BUILD=0; shift ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --*)        echo "Unknown option: $1"; shift ;;
    *)          [ -z "$SITE_DIR" ] && SITE_DIR="$1"; shift ;;
  esac
done

[ -z "$SITE_DIR" ] && SITE_DIR="$(pwd)"
SITE_DIR="$(cd "$SITE_DIR" && pwd)"
DIST_DIR="$SITE_DIR/dist"
SITE_HOST="${SITE_HOST:-$(basename "$SITE_DIR")}"

# Shared S3 helpers live under websites/scripts/
WEBSITES_SCRIPTS="$(cd "$(dirname "$0")/../../scripts" && pwd)"
# shellcheck source=../../scripts/s3-common.sh
source "$WEBSITES_SCRIPTS/s3-common.sh"

PREFIX="$(s3_site_prefix "$SITE_HOST" dist)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Deploy static site → s3://${S3_BUCKET}/${PREFIX}/"
echo "  site: $SITE_HOST"
echo "  src:  $SITE_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$BUILD" -eq 1 ]; then
  echo "==> Building dist/"
  cd "$SITE_DIR"
  if [ -f Justfile ] || [ -f justfile ]; then
    just build 2>/dev/null || node build.js
  else
    node build.js
  fi
fi

if [ ! -d "$DIST_DIR/pages" ] || [ ! -d "$DIST_DIR/lib" ] || [ ! -d "$DIST_DIR/public" ]; then
  echo "❌ dist/ incomplete. Expected pages/, lib/, public/. Run: node build.js" >&2
  exit 1
fi

# Sanity: new ecosystem styles must be present (terp.network only)
if [ -f "$DIST_DIR/public/global.css" ]; then
  if ! grep -q 'eco-card' "$DIST_DIR/public/global.css"; then
    echo "❌ dist/public/global.css missing eco-card rules — refuse to deploy stale CSS" >&2
    exit 1
  fi
fi
if [ -f "$DIST_DIR/lib/fab.js" ]; then
  if ! grep -q 'site-chrome' "$DIST_DIR/lib/fab.js"; then
    echo "❌ dist/lib/fab.js missing site-chrome — refuse to deploy stale FAB" >&2
    exit 1
  fi
fi

if [ "$DRY_RUN" -eq 1 ]; then
  s3_load_env_file || true
  echo "[dry-run] endpoint=$(s3_resolve_endpoint) dest=$(s3_dest "$PREFIX")"
  find "$DIST_DIR" -type f | sed "s|$DIST_DIR/||" | head -40
  echo "  … ($(find "$DIST_DIR" -type f | wc -l | tr -d ' ') files)"
  exit 0
fi

s3_ensure_alias
s3_ensure_bucket

HTML_META="Cache-Control=public,max-age=60,must-revalidate"
ASSET_META="Cache-Control=public,max-age=300,must-revalidate"

echo "==> Mirror dist/ → $(s3_dest "$PREFIX") (full tree)"
s3_mirror_dir "$DIST_DIR" "$PREFIX" 1

# Re-apply cache headers on critical paths
echo "==> Cache-Control metadata (best-effort)"
for f in "$DIST_DIR"/pages/*.html; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  s3_mc cp --attr "$HTML_META" "$f" "$(s3_dest "$PREFIX")/pages/$base" 2>/dev/null || true
done
s3_mc cp --attr "$ASSET_META" --recursive "$DIST_DIR/public/" "$(s3_dest "$PREFIX")/public/" 2>/dev/null || true
s3_mc cp --attr "$ASSET_META" --recursive "$DIST_DIR/lib/" "$(s3_dest "$PREFIX")/lib/" 2>/dev/null || true

echo ""
echo "✅ Deploy complete → $(s3_dest "$PREFIX")/"
echo "   Nginx expects path-style: /static/${SITE_HOST}/dist/pages/index.html"
echo "   Verify after edge routes Host ${SITE_HOST}:"
echo "     curl -sL -H 'Origin: https://${SITE_HOST}' https://${SITE_HOST}/lib/ibc-clients.js | head -25"
echo "     curl -sL https://${SITE_HOST}/ibc | grep -o 'ibc-page.js?v=[a-f0-9]*' || true"
