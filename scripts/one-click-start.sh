#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${ASUI_CANVAS_PORT:-3030}"
HOST="${ASUI_CANVAS_HOST:-localhost}"
URL="http://${HOST}:${PORT}/"

log() {
  printf '\n[ASUI Canvas] %s\n' "$1"
}

fail() {
  printf '\n[ASUI Canvas] 启动失败：%s\n' "$1" >&2
  exit 1
}

version_at_least_18() {
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [[ "$major" =~ ^[0-9]+$ ]] && (( major >= 18 ))
}

ensure_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    version_at_least_18 || fail "Node.js 版本过低，需要 Node.js 18 或更高版本。当前版本：$(node -v)"
    return
  fi

  if command -v brew >/dev/null 2>&1; then
    log "未检测到 Node.js，尝试通过 Homebrew 安装"
    brew install node
    version_at_least_18 || fail "Node.js 安装完成，但版本仍低于 18。"
    return
  fi

  fail "未检测到 Node.js。请先安装 Node.js 18+：https://nodejs.org/"
}

ensure_dependencies() {
  if [[ -x "$ROOT_DIR/node_modules/.bin/next" ]]; then
    return
  fi

  [[ -f "$ROOT_DIR/package-lock.json" ]] || fail "缺少 package-lock.json，无法安全安装依赖。"
  log "首次启动，正在安装项目依赖，这一步只需要执行一次"
  npm ci --no-audit --no-fund
}

ensure_env() {
  if [[ -f "$ROOT_DIR/.env.local" ]]; then
    return
  fi

  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env.local"
  log "已创建 .env.local 默认配置；API Key 请在网页内配置，不会写入仓库"
}

port_is_open() {
  curl -fsS --max-time 1 "$URL" >/dev/null 2>&1
}

port_is_occupied() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1
  else
    curl -sS --max-time 1 "$URL" >/dev/null 2>&1
  fi
}

find_available_port() {
  while port_is_occupied; do
    PORT=$((PORT + 1))
    HOST="localhost"
    URL="http://${HOST}:${PORT}/"
  done
}

open_browser_when_ready() {
  (
    for _ in $(seq 1 60); do
      if port_is_open; then
        if command -v open >/dev/null 2>&1; then
          open "$URL"
        elif command -v xdg-open >/dev/null 2>&1; then
          xdg-open "$URL" >/dev/null 2>&1 || true
        fi
        exit 0
      fi
      sleep 1
    done
    printf '\n[ASUI Canvas] 页面尚未响应，请手动打开 %s\n' "$URL"
  ) &
}

ensure_node
ensure_dependencies
ensure_env

if port_is_open; then
  log "项目已经在运行：$URL"
  if command -v open >/dev/null 2>&1; then open "$URL"; fi
  exit 0
fi

find_available_port
URL="http://${HOST}:${PORT}/"
log "项目启动中：$URL"
open_browser_when_ready

exec npm run dev -- --port "$PORT"
