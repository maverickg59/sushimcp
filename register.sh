#!/bin/bash

set -e

# Load .env file if it exists
if [ -f "$(dirname "$0")/.env" ]; then
  set -a
  source "$(dirname "$0")/.env"
  set +a
fi

# Validate required variables
if [ -z "$GITHUB_PROXY_URL" ] || [ -z "$GITHUB_PROXY_KEY" ] || [ -z "$GITHUB_OWNER" ] || [ -z "$GITHUB_ORG" ] || [ -z "$GITHUB_MERGE_METHOD" ]; then
  echo "Error: Missing required environment variables. Please create a .env file based on .env.example"
  exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Build the full path to the sushimcp entry point
ENTRY_POINT="$SCRIPT_DIR/dist/index.js"

# Parse ARGS from .env into an array
# Format: ARGS="arg1 arg2 arg3" (space-separated)
if [ -n "$ARGS" ]; then
  read -ra ARGS_ARRAY <<< "$ARGS"
else
  ARGS_ARRAY=()
fi

# Debug output
echo "DEBUG: ARGS from .env: $ARGS"
echo "DEBUG: Parsed array has ${#ARGS_ARRAY[@]} elements:"
for i in "${!ARGS_ARRAY[@]}"; do
  echo "  [$i] = '${ARGS_ARRAY[$i]}'"
done

# Export environment variables so they're available to the MCP server
export GITHUB_PROXY_URL
export GITHUB_PROXY_KEY
export GITHUB_OWNER
export GITHUB_ORG
export GITHUB_MERGE_METHOD

# Register the MCP server using Claude's CLI
# Environment variables must come before the server name
# Use -- to separate claude mcp add options from the server command
# ARGS are parsed from .env and passed as separate arguments to node
claude mcp add --scope user \
  -e GITHUB_PROXY_URL="$GITHUB_PROXY_URL" \
  -e GITHUB_PROXY_KEY="$GITHUB_PROXY_KEY" \
  -e GITHUB_OWNER="$GITHUB_OWNER" \
  -e GITHUB_ORG="$GITHUB_ORG" \
  -e GITHUB_MERGE_METHOD="$GITHUB_MERGE_METHOD" \
  -- \
  sushimcp "node" "$ENTRY_POINT" "${ARGS_ARRAY[@]}"

echo "✓ SushiMCP registered with Claude"

{
  "action": "create",
  "repo": "sushimcp",
  "title": "Test GitHub Tools in MCP",
  "body": "Test the following tools:\n\ngithub_projects\ngithub_pull_requests\n- completed\ngithub_issues",
  "assignee": "maverickg59",
  "state": "open"
}