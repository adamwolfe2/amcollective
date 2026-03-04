#!/usr/bin/env bash
# openclaw/sync.sh
# Copies all OpenClaw workspace files from this repo to ~/.openclaw
# Run from the amcollective repo root: bash openclaw/sync.sh

set -e

WORKSPACE=~/.openclaw/workspaces/am-collective-ceo

echo "Syncing OpenClaw workspace..."

mkdir -p "$WORKSPACE/skills"

# Note: openclaw.json is NOT copied here — it contains real secrets and lives
# only in ~/.openclaw/. Edit it directly there. The repo copy is a template.
cp openclaw/AGENTS.md    "$WORKSPACE/AGENTS.md"
cp openclaw/SOUL.md      "$WORKSPACE/SOUL.md"
cp openclaw/HEARTBEAT.md "$WORKSPACE/HEARTBEAT.md"
cp openclaw/USER.md      "$WORKSPACE/USER.md"
cp openclaw/MEMORY.md    "$WORKSPACE/MEMORY.md"
cp openclaw/skills/*.md  "$WORKSPACE/skills/"

echo "Done. Workspace updated:"
ls "$WORKSPACE/skills/"
echo ""
echo "Note: No gateway restart needed — skills load on each invocation."
echo "      If you changed openclaw.json, restart: openclaw gateway restart"
