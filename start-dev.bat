@echo off
cd /d "%~dp0"
set DATABASE_URL=file:./dev.db
npm.cmd run dev
