#!/bin/bash
# post_init.sh — Genesis & config patches for local test environment
# Mounted into localterp container and run before chain start.

GENESIS=~/.terpd/config/genesis.json
CONFIG_TOML=~/.terpd/config/config.toml

# ── Tokenfactory params ──────────────────────────────────────────────────────
# Set denom_creation_fee to 1 THIOL (1000000 uthiol) instead of default stake.
# Matches morocco-1 params (ref: D2C873EDC5CEA1CC0F10A45877073BC42A11854F836F5709791BE2AA2321CCC6)
jq '.app_state.tokenfactory.params.denom_creation_fee = [{"denom":"uterp","amount":"1000000"}]' \
    "$GENESIS" > "$GENESIS.tmp" && mv "$GENESIS.tmp" "$GENESIS"

echo "post_init: tokenfactory denom_creation_fee = 1000000uterp"

# ── CometBFT RPC CORS ────────────────────────────────────────────────────────
# serve.py proxies /rpc → :26657, but set this anyway for direct curl access.
sed -i 's/^cors_allowed_origins = \[.*\]/cors_allowed_origins = ["*"]/' "$CONFIG_TOML"

echo "post_init: RPC CORS enabled"
