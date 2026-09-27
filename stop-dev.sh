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

die() {
  printf '关闭失败：%s\n' "$*" >&2
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

group_is_alive() {
  local pid="$1"
  local pgid

  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ "$pgid" == "$pid" ]]; then
    kill -0 -- "-$pid" 2>/dev/null
  else
    kill -0 "$pid" 2>/dev/null
  fi
}

if [[ ! -f "$PID_FILE" ]]; then
  printf 'CareerMate 当前没有运行中的开发服务。\n'
  exit 0
fi

pid="$(sed -n '1p' "$PID_FILE" 2>/dev/null || true)"
if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
  rm -f "$PID_FILE"
  die "PID 文件内容无效，已清理。"
fi

if ! kill -0 "$pid" 2>/dev/null; then
  rm -f "$PID_FILE"
  printf '开发服务已经退出，已清理过期 PID 文件。\n'
  exit 0
fi

if ! is_careermate_process "$pid"; then
  die "PID 文件指向了其他进程，已停止关闭以避免误杀。请确认后删除 $PID_FILE。"
fi

pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]' || true)"
if [[ "$pgid" == "$pid" ]]; then
  kill -TERM -- "-$pid" 2>/dev/null || true
else
  kill -TERM "$pid" 2>/dev/null || true
fi

for _ in {1..20}; do
  if ! group_is_alive "$pid"; then
    rm -f "$PID_FILE"
    printf 'CareerMate 开发服务已关闭。\n'
    exit 0
  fi
  sleep 0.25
done

printf '服务未在 5 秒内退出，正在强制结束。\n' >&2
if [[ "$pgid" == "$pid" ]]; then
  kill -KILL -- "-$pid" 2>/dev/null || true
else
  kill -KILL "$pid" 2>/dev/null || true
fi

rm -f "$PID_FILE"
printf 'CareerMate 开发服务已强制关闭。\n'
