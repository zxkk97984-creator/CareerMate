@echo off
setlocal

if "%DEEPSEEK_API_KEY%"=="" goto missing_key

where claude.cmd >nul 2>nul
if errorlevel 1 goto missing_claude

set "ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic"
set "ANTHROPIC_AUTH_TOKEN=%DEEPSEEK_API_KEY%"
set "ANTHROPIC_MODEL=deepseek-v4-pro[1m]"
set "ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro[1m]"
set "ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro[1m]"
set "ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-flash"
set "CLAUDE_CODE_SUBAGENT_MODEL=deepseek-v4-flash"
set "CLAUDE_CODE_EFFORT_LEVEL=max"

if /i "%~1"=="--check" goto check

pushd "%~dp0.."
call claude.cmd "Read AGENTIC_V2_HANDOFF.md completely, verify the current Git branch and worktree, then continue from section 5. Never modify an existing TBox resource and never claim an unexecuted platform operation is complete."
set "CLAUDE_EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %CLAUDE_EXIT_CODE%

:check
call claude.cmd --version
if errorlevel 1 exit /b 1
echo [OK] Claude Code is ready to use the DeepSeek Anthropic-compatible endpoint.
echo [OK] Main model: deepseek-v4-pro 1M context
echo [OK] Subagent model: deepseek-v4-flash
exit /b 0

:missing_key
echo [ERROR] DEEPSEEK_API_KEY is not set in this terminal session.
echo Set it locally before running this script. Never paste the key into chat or commit it.
exit /b 1

:missing_claude
echo [ERROR] claude.cmd was not found on PATH.
echo Install Claude Code first, then retry.
exit /b 1
