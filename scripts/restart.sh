#!/usr/bin/env bash
set -euo pipefail

# Usage: npm run restart [service-name] [api-service-name]
# Defaults are "discord-casino" for the bot and "discord-casino-api" for the API.
# Override with args or SERVICE_NAME/API_SERVICE_NAME env vars.

SERVICE_NAME="${1:-${SERVICE_NAME:-discord-casino}}"
API_SERVICE_NAME="${2:-${API_SERVICE_NAME:-discord-casino-api}}"

log() { printf "[restart] %s\n" "$*"; }

# Ensure we run from repo root (script lives in scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# First, (re)deploy slash commands to the guild
log "Deploying slash commands to guild..."
npm run deploy
log "Deploy complete. Proceeding to restart."

if command -v systemctl >/dev/null 2>&1; then
  log "Using systemd to manage service: $SERVICE_NAME"
  # Restart (or start if inactive)
  if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null || systemctl status "$SERVICE_NAME" >/dev/null 2>&1; then
    if systemctl is-active --quiet "$SERVICE_NAME"; then
      sudo systemctl restart "$SERVICE_NAME"
      log "Restarted $SERVICE_NAME"
    else
      sudo systemctl start "$SERVICE_NAME"
      log "Started $SERVICE_NAME"
    fi

    if [[ "$API_SERVICE_NAME" != "$SERVICE_NAME" ]] && (systemctl is-enabled --quiet "$API_SERVICE_NAME" 2>/dev/null || systemctl status "$API_SERVICE_NAME" >/dev/null 2>&1); then
      if systemctl is-active --quiet "$API_SERVICE_NAME"; then
        sudo systemctl restart "$API_SERVICE_NAME"
        log "Restarted $API_SERVICE_NAME"
      else
        sudo systemctl start "$API_SERVICE_NAME"
        log "Started $API_SERVICE_NAME"
      fi
    else
      log "API service $API_SERVICE_NAME not found in systemd (or same as primary); skipping API restart."
    fi

    # Show a brief status summary
    sudo systemctl status "$SERVICE_NAME" --no-pager -l | sed -n '1,30p' || true
    if [[ "$API_SERVICE_NAME" != "$SERVICE_NAME" ]]; then
      sudo systemctl status "$API_SERVICE_NAME" --no-pager -l | sed -n '1,30p' || true
    fi
    exit 0
  else
    log "Service $SERVICE_NAME not found in systemd."
  fi
fi

if command -v pm2 >/dev/null 2>&1; then
  log "Using PM2 to manage process: $SERVICE_NAME"
  if pm2 describe "$SERVICE_NAME" >/dev/null 2>&1; then
    pm2 restart "$SERVICE_NAME"
  else
    pm2 start npm --name "$SERVICE_NAME" -- run start
  fi
  pm2 status "$SERVICE_NAME" || true
  exit 0
fi

log "No known process manager detected. Run manually: npm start"
exit 1
