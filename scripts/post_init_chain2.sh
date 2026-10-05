#!/bin/bash
# post_init_chain2.sh — Genesis & config patches for the second local chain (120u-2)
# Mounted into localterp-2 container as /root/post_init.sh.
# Does everything post_init.sh does, plus patches chain-id to 120u-2.

GENESIS=~/.terpd/config/genesis.json
CONFIG_TOML=~/.terpd/config/config.toml

# ── Patch chain-id ────────────────────────────────────────────────────────────
# The bootstrap script initialises with 240u-1; override to 240u-2.
jq '.chain_id = "240u-2"' "$GENESIS" > "$GENESIS.tmp" && mv "$GENESIS.tmp" "$GENESIS"
echo "post_init_chain2: chain_id → 240u-2"

# ── Tokenfactory params ──────────────────────────────────────────────────────
jq '.app_state.tokenfactory.params.denom_creation_fee = [{"denom":"uterp","amount":"1000000"}]' \
    "$GENESIS" > "$GENESIS.tmp" && mv "$GENESIS.tmp" "$GENESIS"
echo "post_init_chain2: tokenfactory denom_creation_fee = 1000000uterp"

# ── CometBFT RPC CORS ────────────────────────────────────────────────────────
sed -i 's/^cors_allowed_origins = \[.*\]/cors_allowed_origins = ["*"]/' "$CONFIG_TOML"
echo "post_init_chain2: RPC CORS enabled"
