#!/bin/bash
# check-site.sh — Check and report on static site deployment status
#
# Usage:
#   ./scripts/sh/check-site.sh [options]
#
# Options:
#   --html-only    Only check HTML files in bucket
#   --ipfs-only    Only show IPFS pinned content
#   --links        Test HTTP access to deployed files
#   --cid HASH     Show pin status for specific CID
#   --diff         Compare local files with bucket
#
# Environment:
#   MEDIA_CENTER_HOST  — Hostname/IP of instant-replay instance (default: localhost)
#   MEDIA_CENTER_S3_PORT — MinIO S3 port (default: 9000)
#   MINIO_USER            — S3 access key
#   MINIO_KEY             — S3 secret key

set -euo pipefail

MEDIA_CENTER_HOST="${MEDIA_CENTER_HOST:-localhost}"
BUCKET="static.terp.network"
HTML_ONLY=0
IPFS_ONLY=0
CHECK_LINKS=0
SHOW_CID=""
SHOW_DIFF=0
SSH_USER="${SSH_USER:-}"

# ─── Parse args ────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --html-only)  HTML_ONLY=1; shift ;;
    --ipfs-only)  IPFS_ONLY=1; shift ;;
    --links)      CHECK_LINKS=1; shift ;;
    --cid)        SHOW_CID="$2"; shift 2 ;;
    --diff)       SHOW_DIFF=1; shift ;;
    *)            shift ;;
  esac
done

ensure_mc() {
  mc alias set media "http://$MEDIA_CENTER_HOST:$MEDIA_CENTER_S3_PORT" "$MINIO_USER" "$MINIO_KEY" >/dev/null 2>&1 || true
}

# ─── Check bucket contents ─────────────────────────────
function check_bucket() {
  ensure_mc
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "BUCKET: $BUCKET"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  local count
  if [ $HTML_ONLY -eq 1 ]; then
    count=$(mc ls "$BUCKET" --recursive 2>/dev/null | grep '.html$' | wc -l)
    mc ls "$BUCKET" --recursive 2>/dev/null | grep '.html$' || true
  else
    count=$(mc ls "$BUCKET" --recursive 2>/dev/null | wc -l)
    mc ls "$BUCKET" --recursive 2>/dev/null || true
  fi
  
  echo ""
  echo "Total files: $count"
}

# ─── Check IPFS pins ───────────────────────────────────
function check_ipfs() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "IPFS PINS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  if [ -n "$SHOW_CID" ]; then
    echo "Checking pin for CID: $SHOW_CID"
    # Find the object by searching for its content hash
    local object=$(mc ls "$BUCKET" --recursive 2>/dev/null)
    
    if docker info >/dev/null 2>&1 && docker ps | grep -q minio-ipfs; then
      docker exec minio-ipfs ipfs pin ls --type=recursive 2>/dev/null | grep "$SHOW_CID" || echo "CID not found in recursive pin list"
    elif ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${SSH_USER:-user}@${MEDIA_CENTER_HOST}" \
      "docker exec minio-ipfs ipfs pin ls --type=recursive 2>/dev/null | grep '$SHOW_CID'" 2>/dev/null; then
      echo ""
    fi
  else
    # Show all pinned content
    echo "Pinned HTML files:"
    if docker info >/dev/null 2>&1 && docker ps | grep -q minio-ipfs; then
      docker exec minio-ipfs ipfs pin ls --type=recursive 2>/dev/null | grep '\.html' | head -20 || true
      echo "  (total: $(docker exec minio-ipfs ipfs pin ls --type=recursive 2>/dev/null | grep '\\.html' | wc -l))"
    else
      # Try SSH fallback
      echo "  Checking via SSH..."
      ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${SSH_USER:-user}@${MEDIA_CENTER_HOST}" \
        "docker exec minio-ipfs ipfs pin ls --type=recursive 2>/dev/null | grep '\\.html' | head -20" 2>/dev/null || echo "  Cannot reach media center"
    fi
  fi
}

# ─── Test HTTP links ───────────────────────────────────
function test_links() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "HTTP ACCESS TEST"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  local base_urls=(
    "http://$MEDIA_CENTER_HOST/static.terp.network"
    "http://$MEDIA_CENTER_HOST:9000/static.terp.network"
  )
  
  for url in "${base_urls[@]}"; do
    echo "Testing: $url"
    if curl -s --connect-timeout 5 -o /dev/null -w "HTTP %{http_code}" "$url" 2>/dev/null; then
      echo " ✅ OK"
    else
      echo " ❌ Not reachable"
    fi
  done
  
  echo ""
  echo "IPFS Gateway test:"
  if curl -s --connect-timeout 5 "http://$MEDIA_CENTER_HOST:8081/api/v0/version" >/dev/null 2>&1 2>/dev/null; then
    echo "  ✅ IPFS gateway reachable at http://$MEDIA_CENTER_HOST:8081"
  else
    echo "  ❌ IPFS gateway not reachable at port 8081"
  fi
  
  echo ""
  echo "Nginx proxy test:"
  if curl -s --connect-timeout 5 -o /dev/null -w "HTTP %{http_code}" "http://$MEDIA_CENTER_HOST:80" 2>/dev/null; then
    echo "  ✅ Nginx proxy reachable at http://$MEDIA_CENTER_HOST:80"
  else
    echo "  ❌ Nginx proxy not reachable at port 80"
  fi
}

# ─── Diff check ────────────────────────────────────────
function diff_check() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "LOCAL vs REMOTE DIFF"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  local site_dir="${1:-$(pwd)}"
  echo "Local: $site_dir"
  echo "Remote: $BUCKET on $MEDIA_CENTER_HOST"
  echo ""
  
  # Count local files
  local local_count=$(find "$site_dir/pages" "$site_dir/soon" "$site_dir/public" -type f 2>/dev/null | wc -l)
  
  # Count remote files
  local remote_count=$(mc ls "$BUCKET" --recursive 2>/dev/null | wc -l)
  
  echo "Local file count:  $local_count"
  echo "Remote file count: $remote_count"
  echo ""
  
  # Check for missing files
  for file in $(find "$site_dir/pages" "$site_dir/soon" "$site_dir/public" -type f -name "*.html" 2>/dev/null | sed "s|.*$site_dir/||"); do
    if ! mc stat "$BUCKET/$file" >/dev/null 2>&1; then
      echo "  Missing on remote: $file"
    fi
  done | sort -u
}

# ─── Main ──────────────────────────────────────────────

if [ $IPFS_ONLY -eq 0 ]; then
  check_bucket
fi

if [ $HTML_ONLY -eq 0 ]; then
  check_ipfs
fi

if [ $CHECK_LINKS -eq 1 ]; then
  test_links
fi

if [ $SHOW_DIFF -eq 1 ]; then
  diff_check "$SITE_DIR"
fi

# Default: if no flags, show everything
if [ $HTML_ONLY -eq 0 ] && [ $IPFS_ONLY -eq 0 ] && [ $CHECK_LINKS -eq 0 ] && [ $SHOW_DIFF -eq 0 ]; then
  echo ""
  check_ipfs
  echo ""
  test_links
  echo ""
  diff_check "$SITE_DIR"
fi
