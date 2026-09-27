#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"
cd "$ROOT_DIR"

RUNTIME_DIR="${CAREERMATE_RUNTIME_DIR:-$ROOT_DIR/.careermate}"
if [[ "$RUNTIME_DIR" != /* ]]; then
  RUNTIME_DIR="$ROOT_DIR/$RUNTIME_DIR"
fi
PID_FILE="$RUNTIME_DIR/dev.pid"
LOG_FILE="$RUNTIME_DIR/dev.log"
HOST="${CAREERMATE_HOST:-127.0.0.1}"
PORT="${CAREERMATE_PORT:-3000}"

BROWSER_HOST="$HOST"
case "$BROWSER_HOST" in
  0.0.0.0) BROWSER_HOST="127.0.0.1" ;;
  ::|'[::]') BROWSER_HOST="::1" ;;
esac
if [[ "$BROWSER_HOST" == *:* && "$BROWSER_HOST" != \[*\] ]]; then
  BROWSER_HOST="[$BROWSER_HOST]"
fi
URL="http://$BROWSER_HOST:$PORT"

die() {
  printf '启动失败：%s\n' "$*" >&2
  exit 1
}

process_command() {
  ps -o command= -p "$1" 2>/dev/null | sed 's/^[[:space:]]*//' || true
}

process_cwd() {
  if [[ -r "/proc/$1/cwd" ]]; then
    readlink -f "/proc/$1/cwd" 2>/dev/null || true
  elif command -v pwdx >/dev/null 2>&1; then
    pwdx "$1" 2>/dev/null | sed 's/^[^:]*:[[:space:]]*//' || true
  fi
}

open_browser() {
  local url="$1"

  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 &
  elif command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "$url" >/dev/null 2>&1 &
  else
    printf '未找到可用的浏览器启动命令，请手动访问：%s\n' "$url"
    return 1
  fi
}

server_is_responding() {
  local url="$1"

  if command -v curl >/dev/null 2>&1; then
    curl --silent --output /dev/null --max-time 1 "$url/" 2>/dev/null
  elif command -v node >/dev/null 2>&1; then
    node -e 'const http = require("node:http"); const req = http.get(process.argv[1], res => { res.resume(); process.exit(0); }); req.setTimeout(1000, () => req.destroy()); req.on("error", () => process.exit(1));' "$url" >/dev/null 2>&1
  else
    return 1
  fi
}

wait_for_server() {
  local pid="$1"
  local url="$2"

  for _ in {1..60}; do
    if server_is_responding "$url"; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      return 1
    fi
    sleep 0.5
  done

  return 1
}

is_careermate_process() {
  local pid="$1"
  local command cwd

  command="$(process_command "$pid")"
  cwd="$(process_cwd "$pid")"

  if [[ -n "$cwd" && "$cwd" != "$ROOT_DIR" ]]; then
    return 1
  fi

  [[ "$command" == *"npm run dev"* || "$command" == *"next dev"* ]]
}

if [[ ! -f "$ROOT_DIR/package.json" ]]; then
  die "找不到 package.json。"
fi

if ! command -v npm >/dev/null 2>&1; then
  die "找不到 npm，请先安装 Node.js。"
fi

if [[ ! -x "$ROOT_DIR/node_modules/.bin/next" ]]; then
  die "依赖尚未安装，请先在项目根目录执行 npm ci。"
fi

if [[ ! -f "$ROOT_DIR/.env" && ! -f "$ROOT_DIR/.env.local" ]]; then
  die "找不到 .env 或 .env.local，请先执行 cp .env.example .env 并填写本地配置。"
fi

umask 077
mkdir -p "$RUNTIME_DIR"

if [[ -f "$PID_FILE" ]]; then
  existing_pid="$(sed -n '1p' "$PID_FILE" 2>/dev/null || true)"

  if [[ "$existing_pid" =~ ^[0-9]+$ ]] && kill -0 "$existing_pid" 2>/dev/null; then
    if is_careermate_process "$existing_pid"; then
      printf 'CareerMate 已在运行（PID %s）。\n日志：%s\n' "$existing_pid" "$LOG_FILE"
      printf '访问地址：%s\n' "$URL"
      open_browser "$URL" || true
      exit 0
    fi

    die "PID 文件 $PID_FILE 指向了其他进程，已停止启动以避免误杀。请确认后删除该文件。"
  fi

  rm -f "$PID_FILE"
fi

: > "$LOG_FILE"

# setsid 让 Next.js 及其子进程进入独立进程组，stop-dev.sh 可以一次停止整组进程。
if command -v setsid >/dev/null 2>&1; then
  (
    exec setsid npm run dev -- --hostname "$HOST" --port "$PORT"
  ) >>"$LOG_FILE" 2>&1 < /dev/null &
else
  (
    exec nohup npm run dev -- --hostname "$HOST" --port "$PORT"
  ) >>"$LOG_FILE" 2>&1 < /dev/null &
fi

pid="$!"
printf '%s\n' "$pid" > "$PID_FILE"

# 捕获命令因端口占用等原因立即退出的情况，并把最近日志带给调用者。
sleep 1
if ! kill -0 "$pid" 2>/dev/null; then
  rm -f "$PID_FILE"
  printf '最近日志：\n' >&2
  tail -n 30 "$LOG_FILE" >&2 || true
  die "开发服务未能启动。"
fi

printf 'CareerMate 开发服务已启动（PID %s）。\n' "$pid"
printf '访问地址：%s\n' "$URL"
printf '日志：%s\n' "$LOG_FILE"

if wait_for_server "$pid" "$URL"; then
  printf '正在打开默认浏览器……\n'
else
  printf '等待服务响应超时或服务提前退出；仍会尝试打开浏览器。\n' >&2
fi
open_browser "$URL" || true
